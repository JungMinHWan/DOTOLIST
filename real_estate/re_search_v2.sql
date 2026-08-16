-- ============================================================
-- Real Estate Signals — 검색을 국토부 원본(re_deals)까지 확장
--
-- 배경: re_signals 에는 "하락 신호가 잡힌 (단지×평형)" 만 들어 있습니다.
--   · 표본 3건 미만 또는 최근 180일 거래 없음 → 신호 미생성
--   · 점수가 음수(가격이 오른 평형 등) → WHERE score >= 0 에 걸려 미저장
--   그 결과 용산더프라임은 11개 평형 중 43평 하나만 검색되었습니다.
--
-- 이 파일은 검색 전용 RPC 를 하나 추가해, 신호가 없는 평형도
-- re_deals 에서 직접 찾아 거래내역을 볼 수 있게 합니다.
--
-- 📌 destructive 경고: DROP FUNCTION 은 re_search_complexes(신규/재생성) 뿐이며
--    테이블·데이터는 전혀 건드리지 않습니다.
--    ⚠️ re_rpc_fix.sql, re_search_upgrade.sql 을 먼저 실행한 뒤 돌리세요.
-- ============================================================

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
AS $$
  WITH q AS (
    SELECT NULLIF(btrim(COALESCE(p_search, '')), '') AS term
  ),
  toks AS (
    SELECT regexp_split_to_array(term, '\s+') AS arr FROM q WHERE term IS NOT NULL
  ),
  -- 1) 먼저 값싼 조건으로 걸러냅니다. (키 계산은 비싸므로 나중에)
  matched_raw AS (
    SELECT d.*
    FROM re_deals d, q
    WHERE q.term IS NOT NULL
      AND d.deal_date >= CURRENT_DATE - INTERVAL '24 months'
      AND (p_gu IS NULL OR p_gu = '전체' OR d.gu = p_gu)
      AND NOT EXISTS (
        SELECT 1 FROM toks, unnest(toks.arr) AS tok
        WHERE strpos(
                lower(replace(d.gu || d.dong || d.apt_name, ' ', '')),
                lower(replace(tok, ' ', ''))
              ) = 0
      )
  ),
  -- 2) 걸러진 소수 행에 대해서만 단지키 계산 + 실질 해제 판정
  matched AS (
    SELECT m.*,
      re_complex_key(m.lawd_cd, m.jibun, m.apt_name) AS ckey,
      ROUND(m.area)::INT AS abucket,
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
    s.score,                                  -- 신호 없으면 NULL
    COALESCE(s.latest_amount, l.amount)       AS latest_amount,
    COALESCE(s.latest_date,   l.deal_date)    AS latest_date,
    COALESCE(s.latest_floor,  l.floor)        AS latest_floor,
    s.baseline_amount,                        -- 신호 없으면 NULL
    COALESCE(s.peak_amount, a.peak_amount)    AS peak_amount,
    COALESCE(s.low_amount,  a.low_amount)     AS low_amount,
    s.drop_rate,                              -- 신호 없으면 NULL
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
    (s.complex_key IS NOT NULL) DESC,   -- 신호 있는 평형 먼저
    s.score DESC NULLS LAST,
    a.abucket
  LIMIT LEAST(COALESCE(p_limit, 300), 500);
$$;

GRANT EXECUTE ON FUNCTION re_search_complexes(TEXT, TEXT, INT) TO anon, authenticated;

-- 검색 속도용 인덱스 (단지명/동 부분일치는 인덱스가 안 먹지만 gu 필터는 도움)
CREATE INDEX IF NOT EXISTS idx_re_deals_gu_date ON public.re_deals (gu, deal_date DESC);


-- ------------------------------------------------------------
-- 검증
-- ------------------------------------------------------------
-- SELECT apt_name, area_bucket AS 전용, pyeong AS 평, score AS 점수,
--        has_signal AS 신호있음, deal_count AS 거래수, latest_date AS 최근거래
-- FROM re_search_complexes('용산더프라임') ORDER BY 전용;
