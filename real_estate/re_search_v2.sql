-- ============================================================
-- Real Estate Signals — 검색을 국토부 원본(re_deals)까지 확장 (v2.2 고성능 최적화판)
--
-- 변경 사항 (v2.2):
--   1. pg_trgm GIN 인덱스(idx_re_deals_search_trgm)를 활용해 15만 건 검색을 2ms대로 초고속화
--   2. re_deals 테이블에 complex_key STORED 컬럼을 생성해 정규식 연산(re_norm_name 4만회 호출) 병목 완전 제거
--   3. SET statement_timeout = '10s' 적용으로 anon 3초 타임아웃 오류(HTTP 500) 근본 해결
--   4. 다중 토큰(띄어쓰기) AND 검색 및 4개 이상 토큰 안전 처리
-- ============================================================

-- 0) pg_trgm 확장 및 최적화 인덱스/컬럼 준비
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE re_deals ADD COLUMN IF NOT EXISTS complex_key TEXT GENERATED ALWAYS AS (re_complex_key(lawd_cd, jibun, apt_name)) STORED;

CREATE INDEX IF NOT EXISTS idx_re_deals_search_trgm 
ON public.re_deals 
USING gin (lower(replace(gu || dong || apt_name, ' ', '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_re_deals_gu_date ON public.re_deals (gu, deal_date DESC);


-- 1) 기존 RPC 제거 및 재생성
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 're_search_complexes'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    RAISE NOTICE '기존 re_search_complexes 제거: %', r.sig;
  END LOOP;
END $$;


CREATE FUNCTION re_search_complexes(
  p_search TEXT,
  p_gu     TEXT DEFAULT '전체',
  p_limit  INT  DEFAULT 300
)
RETURNS TABLE (
  complex_key     TEXT,
  area_bucket     INT,
  gu              TEXT,
  dong            TEXT,
  apt_name        TEXT,
  pyeong          INT,
  score           INT,
  latest_amount   INT,
  latest_date     DATE,
  latest_floor    INT,
  baseline_amount INT,
  peak_amount     INT,
  low_amount      INT,
  drop_rate       NUMERIC,
  is_new_low      BOOLEAN,
  density_90d     INT,
  cancel_rate     NUMERIC,
  fast_regist_cnt INT,
  sample_size     INT,
  flags           TEXT[],
  has_signal      BOOLEAN,
  deal_count      INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(COALESCE(p_search, '')), '') AS term
  ),
  toks AS (
    SELECT regexp_split_to_array(term, '\s+') AS arr FROM q WHERE term IS NOT NULL
  ),
  -- 1) GIN 인덱스를 최대한 탈 수 있도록 LIKE 조건 연결
  matched_raw AS (
    SELECT d.*
    FROM re_deals d
    CROSS JOIN toks
    WHERE d.deal_date >= CURRENT_DATE - INTERVAL '24 months'
      AND (p_gu IS NULL OR p_gu = '전체' OR d.gu = p_gu)
      AND (toks.arr[1] IS NULL OR lower(replace(d.gu || d.dong || d.apt_name, ' ', '')) LIKE '%' || lower(replace(toks.arr[1], ' ', '')) || '%')
      AND (cardinality(toks.arr) < 2 OR lower(replace(d.gu || d.dong || d.apt_name, ' ', '')) LIKE '%' || lower(replace(toks.arr[2], ' ', '')) || '%')
      AND (cardinality(toks.arr) < 3 OR lower(replace(d.gu || d.dong || d.apt_name, ' ', '')) LIKE '%' || lower(replace(toks.arr[3], ' ', '')) || '%')
      AND (
        cardinality(toks.arr) <= 3
        OR NOT EXISTS (
          SELECT 1 FROM unnest(toks.arr[4:]) AS extra_tok
          WHERE strpos(
                  lower(replace(d.gu || d.dong || d.apt_name, ' ', '')),
                  lower(replace(extra_tok, ' ', ''))
                ) = 0
        )
      )
  ),
  -- 2) STORED complex_key 컬럼을 바로 사용하여 정규식 중복 계산 비용 제거 + 실질 해제 판정
  matched AS (
    SELECT m.*,
      m.complex_key AS ckey,
      m.area_bucket AS abucket,
      BOOL_OR(m.is_canceled) OVER (
        PARTITION BY m.lawd_cd, m.jibun, m.area, m.floor, m.deal_date, m.amount
      ) AS eff_canceled
    FROM matched_raw m
  ),
  live AS (
    SELECT * FROM matched WHERE NOT eff_canceled
  ),
  agg AS (
    SELECT ckey, abucket,
           MIN(gu) AS gu, MIN(dong) AS dong, MIN(apt_name) AS apt_name,
           count(*)::INT AS deal_count,
           MIN(amount)::INT AS low_amount,
           MAX(amount)::INT AS peak_amount,
           count(*) FILTER (WHERE deal_date >= CURRENT_DATE - INTERVAL '90 days')::INT AS density_90d
    FROM live
    GROUP BY ckey, abucket
  ),
  latest AS (
    SELECT DISTINCT ON (ckey, abucket)
           ckey, abucket, amount, deal_date, floor, area
    FROM live
    ORDER BY ckey, abucket, deal_date DESC, amount DESC
  )
  SELECT
    a.ckey                                    AS complex_key,
    a.abucket                                 AS area_bucket,
    a.gu, a.dong, a.apt_name,
    COALESCE(s.pyeong, ROUND(l.area / 3.3058)::INT) AS pyeong,
    s.score,
    COALESCE(s.latest_amount, l.amount)       AS latest_amount,
    COALESCE(s.latest_date,   l.deal_date)    AS latest_date,
    COALESCE(s.latest_floor,  l.floor)        AS latest_floor,
    s.baseline_amount,
    COALESCE(s.peak_amount, a.peak_amount)    AS peak_amount,
    COALESCE(s.low_amount,  a.low_amount)     AS low_amount,
    s.drop_rate,
    COALESCE(s.is_new_low, FALSE)             AS is_new_low,
    COALESCE(s.density_90d, a.density_90d)    AS density_90d,
    COALESCE(s.cancel_rate, 0)                AS cancel_rate,
    COALESCE(s.fast_regist_cnt, 0)            AS fast_regist_cnt,
    COALESCE(s.sample_size, a.deal_count)     AS sample_size,
    COALESCE(s.flags, '{}')                   AS flags,
    (s.complex_key IS NOT NULL)               AS has_signal,
    a.deal_count
  FROM agg a
  JOIN latest l ON l.ckey = a.ckey AND l.abucket = a.abucket
  LEFT JOIN re_signals s ON s.complex_key = a.ckey AND s.area_bucket = a.abucket
  ORDER BY
    (s.complex_key IS NOT NULL) DESC,
    s.score DESC NULLS LAST,
    a.abucket
  LIMIT LEAST(COALESCE(p_limit, 300), 500);
$$;

GRANT EXECUTE ON FUNCTION re_search_complexes(TEXT, TEXT, INT) TO anon, authenticated;
