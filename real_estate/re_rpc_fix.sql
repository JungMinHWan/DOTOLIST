-- ============================================================
-- Real Estate Signals — RPC 재정의 및 보안 정리
-- Supabase SQL Editor 에서 이 파일 전체를 한 번 실행하세요.
-- ============================================================
--
-- 📌 Supabase 가 "destructive operations" 경고를 띄우는 이유
--    이 스크립트에 DROP FUNCTION 이 들어 있기 때문입니다.
--    삭제 대상은 **조회 함수 2개뿐**이며, 바로 아래에서 다시 만듭니다.
--
--    ✅ 이 스크립트에 없는 것: DROP TABLE / DELETE / TRUNCATE / ALTER TABLE DROP COLUMN
--       → re_deals, re_signals 등 테이블과 데이터는 단 한 행도 건드리지 않습니다.
--    ⚠️ 이 스크립트가 바꾸는 것: 함수 정의, 함수 실행 권한, 인덱스 1개 추가
--
--    함수는 데이터가 아니라 "조회 방법"이라 다시 만들면 원상복구됩니다.
--
-- ------------------------------------------------------------
-- 실행 전 확인 (선택) — 아래 쿼리를 먼저 돌려보면 지금 어떤 함수가 있는지 볼 수 있습니다.
-- ------------------------------------------------------------
-- SELECT p.oid::regprocedure AS 현재_함수, pg_get_function_result(p.oid) AS 반환타입
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname LIKE 're\_%'
-- ORDER BY 1;
-- ============================================================

-- ------------------------------------------------------------
-- 0. 단지 식별키 정규화 함수
--    complex_key = lawd_cd | jibun | 정규화된단지명
--    같은 지번에 서로 다른 건물이 있는 경우(예: 성수동2가 834 =
--    현대I-PARK 20억대 + 삼성홈타운 1~3억대)를 분리하기 위해
--    반드시 단지명까지 키에 포함해야 합니다.
--    배치 스크립트(fast_calculate_signals.mjs)와 완전히 동일한 식이어야 합니다.
-- ------------------------------------------------------------
-- ⚠️ fast_calculate_signals.mjs 의 NORM_NAME 상수와 반드시 동일해야 합니다.
-- COALESCE/NULLIF 이유: 이름이 지번뿐인 나홀로아파트(예: '(685-103)')가 85개 있는데
-- 괄호 안을 지우면 이름이 통째로 사라져 빈 키가 됩니다. 이때는 괄호를 지우지 않은
-- 원본 이름을 폴백으로 사용합니다. ('(685-103)' -> '685103')
CREATE OR REPLACE FUNCTION re_norm_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      REGEXP_REPLACE(
        REGEXP_REPLACE(REPLACE(COALESCE(p_name, ''), ' ', ''), '\(.*?\)', '', 'g'),
        '[^a-zA-Z0-9가-힣]', '', 'g'
      ), ''
    ),
    REGEXP_REPLACE(REPLACE(COALESCE(p_name, ''), ' ', ''), '[^a-zA-Z0-9가-힣]', '', 'g')
  );
$$;

-- ⚠️ 내부 호출을 반드시 public. 으로 스키마 지정해야 합니다.
--    PostgreSQL 15+ 는 인덱스 생성/재색인 시 search_path 를 pg_catalog, pg_temp 로 제한합니다
--    (search_path 하이재킹 방지). 스키마를 안 붙이면 아래 표현식 인덱스를 만들 때
--    "function re_norm_name(text) does not exist ... during inlining" 오류가 납니다.
CREATE OR REPLACE FUNCTION re_complex_key(p_lawd_cd TEXT, p_jibun TEXT, p_apt_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_lawd_cd || '|' || p_jibun || '|' || public.re_norm_name(p_apt_name);
$$;

-- 조회 성능용 표현식 인덱스 (144,447건 상세조회용)
CREATE INDEX IF NOT EXISTS idx_re_deals_complex_key
  ON public.re_deals (public.re_complex_key(lawd_cd, jibun, apt_name), (ROUND(area)::INT), deal_date DESC);


-- ------------------------------------------------------------
-- 1. 신호 목록 조회
-- ------------------------------------------------------------
-- ⚠️ 기존 함수의 인자 타입을 모르는 상태에서 고정 시그니처로 DROP 하면,
--    시그니처가 다를 경우 삭제되지 않고 "오버로드"가 하나 더 생깁니다.
--    그러면 PostgREST 가 어느 함수를 부를지 몰라 300 Multiple Choices 에러가 납니다.
--    → 이름이 같은 모든 오버로드를 찾아서 제거합니다. (조회 함수 한정)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('re_get_signals', 're_get_deal_history')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    RAISE NOTICE '기존 조회 함수 제거: %', r.sig;
  END LOOP;
END $$;

CREATE FUNCTION re_get_signals(
  p_gu        TEXT DEFAULT '전체',
  p_min_score INT  DEFAULT 0,
  p_sort      TEXT DEFAULT 'score'
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
  SELECT s.complex_key, s.area_bucket, s.gu, s.dong, s.apt_name, s.pyeong, s.score,
         s.latest_amount, s.latest_date, s.latest_floor, s.baseline_amount,
         s.peak_amount, s.low_amount, s.drop_rate, s.is_new_low, s.density_90d,
         s.cancel_rate, s.fast_regist_cnt, s.sample_size, s.flags
  FROM re_signals s
  WHERE s.score >= COALESCE(p_min_score, 0)
    AND (p_gu IS NULL OR p_gu = '전체' OR s.gu = p_gu)
  ORDER BY
    CASE WHEN p_sort = 'drop_rate'   THEN s.drop_rate END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest_date' THEN s.latest_date END DESC NULLS LAST,
    s.score DESC, s.drop_rate DESC
  LIMIT 500;
$$;


-- ------------------------------------------------------------
-- 2. 국토부 원본 거래내역 조회 (상세 모달)
--    ⚠️ 반드시 "단지 + 평형" 두 축으로 모두 걸러야 합니다.
--    단지만으로 거르면 같은 지번의 다른 건물이,
--    평형을 안 걸면 같은 단지의 다른 평형(6억짜리 20평 + 20억짜리 40평)이
--    한 표에 섞여 나옵니다. — 지금 보고 계신 증상의 원인입니다.
-- ------------------------------------------------------------
-- (위 DO 블록에서 이미 모든 오버로드가 제거되었습니다)
CREATE FUNCTION re_get_deal_history(
  p_complex_key TEXT,
  p_area        NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  deal_date     DATE,
  floor         INT,
  amount        INT,
  area          NUMERIC,
  dealing_type  TEXT,
  is_canceled   BOOLEAN,
  registered_at DATE,
  apt_name      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT
      d.deal_date, d.floor, d.amount, d.area, d.dealing_type,
      d.registered_at, d.apt_name,
      -- 국토부는 해제된 거래를 "취소 전 정상 레코드 + 해제 레코드" 두 건으로 내려줍니다.
      -- 자연키가 같은 사본 중 하나라도 해제면 전부 해제로 간주합니다.
      BOOL_OR(d.is_canceled) OVER w AS eff_canceled,
      ROW_NUMBER() OVER (PARTITION BY d.lawd_cd, d.jibun, d.area, d.floor, d.deal_date, d.amount
                         ORDER BY (d.apt_dong IS NULL), d.deal_key) AS rn
    FROM public.re_deals d
    WHERE public.re_complex_key(d.lawd_cd, d.jibun, d.apt_name) = p_complex_key
      AND (p_area IS NULL OR ROUND(d.area)::INT = ROUND(p_area)::INT)
      AND d.deal_date >= CURRENT_DATE - INTERVAL '24 months'
    WINDOW w AS (PARTITION BY d.lawd_cd, d.jibun, d.area, d.floor, d.deal_date, d.amount)
  )
  SELECT h.deal_date, h.floor, h.amount, h.area, h.dealing_type,
         h.eff_canceled AS is_canceled, h.registered_at, h.apt_name
  FROM h
  WHERE h.rn = 1
  ORDER BY h.deal_date DESC, h.amount DESC
  LIMIT 300;
$$;


-- ------------------------------------------------------------
-- 3. 권한 정리
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION re_get_signals(TEXT, INT, TEXT)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION re_get_deal_history(TEXT, NUMERIC)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION re_norm_name(TEXT)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION re_complex_key(TEXT, TEXT, TEXT)     TO anon, authenticated;


-- ------------------------------------------------------------
-- 4. 🔴 보안: 임의 SQL 실행 RPC를 anon 에게서 회수
--    anon 키는 re_ui.js 에 그대로 노출되어 있으므로,
--    re_exec_sql 이 anon 에게 열려 있으면 누구나 DROP TABLE 을 실행할 수 있습니다.
--    배치 스크립트는 service_role 키로 실행하도록 수정되었습니다.
-- ------------------------------------------------------------
-- 함수는 삭제하지 않고 "권한만" 회수합니다. (배치 스크립트가 service_role 로 계속 사용)
-- 인자 시그니처를 모르므로 이름이 같은 모든 오버로드를 대상으로 처리합니다.
DO $$
DECLARE r RECORD; found BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 're_exec_sql'
  LOOP
    found := TRUE;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'anon/authenticated/service_role 역할이 없어 건너뜁니다.';
    END;
    RAISE NOTICE '🔒 % 권한을 service_role 전용으로 회수했습니다.', r.sig;
  END LOOP;

  IF NOT found THEN
    RAISE NOTICE 're_exec_sql 함수가 없습니다. (배치 스크립트 실행 전 생성 필요)';
  END IF;
END $$;


-- ------------------------------------------------------------
-- 5. RLS: 테이블 직접 접근은 계속 차단하고, 읽기는 위 RPC로만 허용
--    (re_schema.sql 이 RLS 는 켜놓고 정책을 하나도 만들지 않아
--     re_api.mjs 의 REST 직접 조회가 항상 빈 배열을 반환하고 있었습니다.)
-- ------------------------------------------------------------
ALTER TABLE re_deals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_complexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_signals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_config   ENABLE ROW LEVEL SECURITY;
-- 정책을 만들지 않음 = anon 직접 접근 전면 차단 (SECURITY DEFINER RPC 로만 우회 허용)


-- ------------------------------------------------------------
-- 6. 검증 쿼리 — 실행 후 아래를 돌려 결과를 확인하세요.
-- ------------------------------------------------------------
-- (a) 같은 지번에 서로 다른 건물이 제대로 분리되었는지
-- SELECT complex_key, apt_name, area_bucket, latest_amount
-- FROM re_signals WHERE complex_key LIKE '11200|834|%';
--
-- (b) 단지명 정규화가 빈 문자열이 되지 않는지 (0건이어야 정상)
-- SELECT count(*) AS 잘못된_키 FROM re_signals WHERE complex_key LIKE '%|';
--
-- (c) 상세 조회가 한 단지/한 평형만 반환하는지
-- SELECT DISTINCT apt_name, ROUND(area) FROM re_get_deal_history('11200|834|현대IPARK', 85);
