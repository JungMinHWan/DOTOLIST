-- ============================================================
-- Real Estate Signals — 관심 단지 라벨 기능
--
-- 📌 destructive 경고 안내
--    DROP FUNCTION 은 이 기능의 조회/저장 RPC 뿐이며 바로 아래에서 다시 만듭니다.
--    re_watchlist 는 CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
--    로만 다루므로 기존 데이터가 있어도 지워지지 않습니다.
--    DROP TABLE / DELETE / TRUNCATE 는 없습니다.
--
--    ⚠️ re_rpc_fix.sql → re_search_upgrade.sql → re_search_v2.sql 을 먼저 실행한 뒤 돌리세요.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블 정비
--    re_schema.sql 에 이미 re_watchlist 가 있지만 라벨 컬럼이 없어 보강합니다.
--    (user_id 는 가족 공용 계정 하나를 쓰므로 'default_user' 고정)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS re_watchlist (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    complex_key TEXT NOT NULL,
    area_bucket INT NOT NULL,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_deal_date DATE,
    UNIQUE(user_id, complex_key, area_bucket)
);

ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
-- 카드에 표시할 정보를 스냅샷으로 남겨, 신호가 사라져도 모아보기가 비지 않게 합니다.
ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS gu TEXT;
ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS dong TEXT;
ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS apt_name TEXT;
ALTER TABLE re_watchlist ADD COLUMN IF NOT EXISTS pyeong INT;

CREATE INDEX IF NOT EXISTS idx_re_watchlist_labels ON re_watchlist USING GIN (labels);


-- ------------------------------------------------------------
-- 2. 기존 RPC 정리 (이름이 같은 모든 오버로드 제거)
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('re_set_labels', 're_get_labeled', 're_list_labels')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    RAISE NOTICE '기존 라벨 함수 제거: %', r.sig;
  END LOOP;
END $$;


-- ------------------------------------------------------------
-- 3. 라벨 저장 (빈 배열을 넘기면 해당 항목을 목록에서 제거)
-- ------------------------------------------------------------
CREATE FUNCTION re_set_labels(
  p_complex_key TEXT,
  p_area_bucket INT,
  p_labels      TEXT[],
  p_gu          TEXT DEFAULT NULL,
  p_dong        TEXT DEFAULT NULL,
  p_apt_name    TEXT DEFAULT NULL,
  p_pyeong      INT  DEFAULT NULL,
  p_memo        TEXT DEFAULT NULL
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_labels TEXT[];
BEGIN
  -- 공백 제거 + 빈 값 제거 + 중복 제거 (최대 10개, 라벨당 20자)
  SELECT COALESCE(array_agg(DISTINCT x), '{}')
    INTO v_labels
  FROM (
    SELECT left(btrim(t), 20) AS x
    FROM unnest(COALESCE(p_labels, '{}')) AS t
    WHERE btrim(t) <> ''
    LIMIT 10
  ) s;

  IF array_length(v_labels, 1) IS NULL THEN
    DELETE FROM re_watchlist
    WHERE user_id = 'default_user'
      AND complex_key = p_complex_key
      AND area_bucket = p_area_bucket;
    RETURN '{}';
  END IF;

  INSERT INTO re_watchlist (user_id, complex_key, area_bucket, labels, gu, dong, apt_name, pyeong, memo, updated_at)
  VALUES ('default_user', p_complex_key, p_area_bucket, v_labels, p_gu, p_dong, p_apt_name, p_pyeong, p_memo, NOW())
  ON CONFLICT (user_id, complex_key, area_bucket) DO UPDATE SET
    labels     = EXCLUDED.labels,
    gu         = COALESCE(EXCLUDED.gu, re_watchlist.gu),
    dong       = COALESCE(EXCLUDED.dong, re_watchlist.dong),
    apt_name   = COALESCE(EXCLUDED.apt_name, re_watchlist.apt_name),
    pyeong     = COALESCE(EXCLUDED.pyeong, re_watchlist.pyeong),
    memo       = COALESCE(EXCLUDED.memo, re_watchlist.memo),
    updated_at = NOW();

  RETURN v_labels;
END;
$$;


-- ------------------------------------------------------------
-- 4. 라벨 붙은 단지 모아보기
--    re_signals 와 조인하되, 신호가 사라진 단지도 스냅샷으로 계속 보여줍니다.
-- ------------------------------------------------------------
CREATE FUNCTION re_get_labeled(p_label TEXT DEFAULT NULL)
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
  deal_count      INT,
  labels          TEXT[],
  labeled_at      TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.complex_key,
    w.area_bucket,
    COALESCE(s.gu, w.gu)             AS gu,
    COALESCE(s.dong, w.dong)         AS dong,
    COALESCE(s.apt_name, w.apt_name) AS apt_name,
    COALESCE(s.pyeong, w.pyeong)     AS pyeong,
    s.score,
    s.latest_amount, s.latest_date, s.latest_floor,
    s.baseline_amount, s.peak_amount, s.low_amount,
    s.drop_rate,
    COALESCE(s.is_new_low, FALSE)    AS is_new_low,
    COALESCE(s.density_90d, 0)       AS density_90d,
    COALESCE(s.cancel_rate, 0)       AS cancel_rate,
    COALESCE(s.fast_regist_cnt, 0)   AS fast_regist_cnt,
    COALESCE(s.sample_size, 0)       AS sample_size,
    COALESCE(s.flags, '{}')          AS flags,
    (s.complex_key IS NOT NULL)      AS has_signal,
    COALESCE(s.sample_size, 0)       AS deal_count,
    w.labels,
    w.updated_at                     AS labeled_at
  FROM re_watchlist w
  LEFT JOIN re_signals s
    ON s.complex_key = w.complex_key AND s.area_bucket = w.area_bucket
  WHERE w.user_id = 'default_user'
    AND (p_label IS NULL OR p_label = '전체' OR w.labels @> ARRAY[p_label])
  ORDER BY w.updated_at DESC
  LIMIT 500;
$$;


-- ------------------------------------------------------------
-- 5. 사용 중인 라벨 목록 (개수 포함)
-- ------------------------------------------------------------
CREATE FUNCTION re_list_labels()
RETURNS TABLE (label TEXT, cnt INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.label, count(*)::INT AS cnt
  FROM re_watchlist w, unnest(w.labels) AS t(label)
  WHERE w.user_id = 'default_user'
  GROUP BY t.label
  ORDER BY cnt DESC, t.label;
$$;


-- ------------------------------------------------------------
-- 6. 권한
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION re_set_labels(TEXT, INT, TEXT[], TEXT, TEXT, TEXT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION re_get_labeled(TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION re_list_labels()      TO anon, authenticated;

ALTER TABLE re_watchlist ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 테이블 직접 접근 차단, 위 SECURITY DEFINER RPC 로만 접근


-- ------------------------------------------------------------
-- 7. 검증
-- ------------------------------------------------------------
-- SELECT re_set_labels('11200|834|현대IPARK', 116, ARRAY['관심','방문예정'],
--                      '성동구','성수동2가','현대I-PARK',35);
-- SELECT apt_name, pyeong, labels, score FROM re_get_labeled();
-- SELECT * FROM re_list_labels();
-- SELECT re_set_labels('11200|834|현대IPARK', 116, '{}');   -- 라벨 비우면 목록에서 제거
