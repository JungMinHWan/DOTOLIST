-- ============================================================
-- Real Estate Signals — 검색 기능 추가 (re_get_signals 재정의)
-- Supabase SQL Editor 에서 이 파일 전체를 한 번 실행하세요.
--
-- 📌 destructive 경고 안내
--    DROP FUNCTION 은 조회 함수 re_get_signals 하나뿐이며 바로 아래에서 다시 만듭니다.
--    테이블/데이터는 전혀 건드리지 않습니다. (DROP TABLE / DELETE / TRUNCATE 없음)
--
--    ⚠️ 이 파일은 re_rpc_fix.sql 을 이미 실행한 뒤에 돌려야 합니다.
-- ============================================================

-- 이름이 같은 모든 오버로드 제거 (인자 시그니처가 바뀌므로 필수)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 're_get_signals'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    RAISE NOTICE '기존 re_get_signals 제거: %', r.sig;
  END LOOP;
END $$;


CREATE FUNCTION re_get_signals(
  p_gu        TEXT DEFAULT '전체',
  p_min_score INT  DEFAULT 0,
  p_sort      TEXT DEFAULT 'score',
  p_search    TEXT DEFAULT NULL,   -- 🔍 검색어 (단지명 / 동 / 구)
  p_limit     INT  DEFAULT 500
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
  flags           TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      NULLIF(btrim(COALESCE(p_search, '')), '') AS term
  ),
  toks AS (
    -- 공백으로 나눈 각 토큰이 "모두" 포함되어야 매칭됩니다.
    -- 예: '마포 래미안' -> ['마포','래미안'] -> 둘 다 들어있는 단지만
    SELECT regexp_split_to_array(term, '\s+') AS arr FROM q WHERE term IS NOT NULL
  )
  SELECT s.complex_key, s.area_bucket, s.gu, s.dong, s.apt_name, s.pyeong, s.score,
         s.latest_amount, s.latest_date, s.latest_floor, s.baseline_amount,
         s.peak_amount, s.low_amount, s.drop_rate, s.is_new_low, s.density_90d,
         s.cancel_rate, s.fast_regist_cnt, s.sample_size, s.flags
  FROM re_signals s
  CROSS JOIN q
  WHERE
    -- 검색 중에는 점수 필터를 자동 해제합니다.
    -- (특정 단지를 이름으로 찾을 때 점수가 낮다고 안 나오면 검색이 아니니까요)
    (q.term IS NOT NULL OR s.score >= COALESCE(p_min_score, 0))
    AND (p_gu IS NULL OR p_gu = '전체' OR s.gu = p_gu)
    AND (
      q.term IS NULL
      OR NOT EXISTS (
        -- strpos 를 쓰므로 %, _ 같은 LIKE 와일드카드나 따옴표가 들어와도 안전합니다.
        SELECT 1
        FROM toks, unnest(toks.arr) AS tok
        WHERE strpos(
                lower(replace(s.gu || s.dong || s.apt_name, ' ', '')),
                lower(replace(tok, ' ', ''))
              ) = 0
      )
    )
  ORDER BY
    CASE WHEN p_sort = 'drop_rate'   THEN s.drop_rate END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest_date' THEN s.latest_date END DESC NULLS LAST,
    s.score DESC, s.drop_rate DESC
  LIMIT LEAST(COALESCE(p_limit, 500), 1000);
$$;

GRANT EXECUTE ON FUNCTION re_get_signals(TEXT, INT, TEXT, TEXT, INT) TO anon, authenticated;


-- ------------------------------------------------------------
-- 검증 쿼리 — 실행 후 아래를 돌려보세요.
-- ------------------------------------------------------------
-- (a) 단지명 검색
-- SELECT gu, dong, apt_name, pyeong, score FROM re_get_signals('전체', 0, 'score', '래미안') LIMIT 10;
--
-- (b) 두 단어 조합 (둘 다 포함된 것만)
-- SELECT gu, dong, apt_name FROM re_get_signals('전체', 0, 'score', '마포 래미안') LIMIT 10;
--
-- (c) 지역명 검색
-- SELECT gu, dong, apt_name FROM re_get_signals('전체', 0, 'score', '아현동') LIMIT 10;
--
-- (d) 띄어쓰기 무시 확인 (단지명에 공백이 있어도 매칭)
-- SELECT gu, apt_name FROM re_get_signals('전체', 0, 'score', '래미안푸르지오') LIMIT 5;
--
-- (e) 검색어 없이 = 기존 동작 그대로
-- SELECT count(*) FROM re_get_signals('전체', 30, 'score', NULL);
