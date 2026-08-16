-- ==========================================
-- 서울 아파트 실거래 신호 탐지 전용 DB 스키마 (re_*)
-- ==========================================

-- 1. deals: 실거래 원본 데이터 (append-only + 주요 컬럼 UPDATE)
CREATE TABLE IF NOT EXISTS re_deals (
    deal_key TEXT PRIMARY KEY,
    lawd_cd TEXT NOT NULL,
    gu TEXT NOT NULL,
    dong TEXT NOT NULL,
    jibun TEXT NOT NULL,
    apt_name TEXT NOT NULL,
    area NUMERIC NOT NULL,
    area_bucket INT NOT NULL,
    floor INT NOT NULL,
    build_year INT,
    deal_date DATE NOT NULL,
    amount INT NOT NULL, -- 만원 단위 정수
    dealing_type TEXT,   -- '중개거래' | '직거래'
    is_canceled BOOLEAN DEFAULT FALSE,
    canceled_at DATE,
    registered_at DATE,
    apt_dong TEXT,
    seller_type TEXT,
    buyer_type TEXT,
    agent_sgg TEXT,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_deals_lawd_date ON re_deals(lawd_cd, deal_date);
CREATE INDEX IF NOT EXISTS idx_re_deals_complex ON re_deals(lawd_cd, jibun, area_bucket);

-- 2. complexes: 단지 마스터 테이블 (지번 기준)
CREATE TABLE IF NOT EXISTS re_complexes (
    complex_key TEXT PRIMARY KEY, -- lawd_cd + '|' + jibun
    lawd_cd TEXT NOT NULL,
    gu TEXT NOT NULL,
    dong TEXT NOT NULL,
    jibun TEXT NOT NULL,
    display_name TEXT NOT NULL,
    merged_into TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. signals: 신호 산출 결과 (배치 재생성)
CREATE TABLE IF NOT EXISTS re_signals (
    complex_key TEXT NOT NULL,
    area_bucket INT NOT NULL,
    gu TEXT NOT NULL,
    dong TEXT NOT NULL,
    apt_name TEXT NOT NULL,
    pyeong INT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    latest_amount INT NOT NULL,
    latest_date DATE NOT NULL,
    latest_floor INT NOT NULL,
    baseline_amount INT NOT NULL,
    peak_amount INT NOT NULL,
    low_amount INT NOT NULL,
    drop_rate NUMERIC NOT NULL,
    is_new_low BOOLEAN NOT NULL DEFAULT FALSE,
    density_90d INT NOT NULL DEFAULT 0,
    cancel_rate NUMERIC NOT NULL DEFAULT 0,
    fast_regist_cnt INT NOT NULL DEFAULT 0,
    sample_size INT NOT NULL DEFAULT 0,
    flags TEXT[] DEFAULT '{}',
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (complex_key, area_bucket)
);

CREATE INDEX IF NOT EXISTS idx_re_signals_score ON re_signals(score DESC);
CREATE INDEX IF NOT EXISTS idx_re_signals_gu ON re_signals(gu, score DESC);

-- 4. watchlist: 관심 단지 목록
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

-- 5. config: 임계값 및 스코어링 설정 테이블
CREATE TABLE IF NOT EXISTS re_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 기본 설정값 보강
INSERT INTO re_config (key, value) VALUES
('scoring_rules', '{
  "drop_rate_20": 40,
  "drop_rate_12": 25,
  "drop_rate_07": 12,
  "new_low": 25,
  "density_5": 20,
  "density_3": 10,
  "cancel_rate_15_penalty": -20,
  "fast_regist_penalty": -15,
  "small_sample_factor": 0.7,
  "min_score_threshold": 30
}'::jsonb),
('legacy_rental_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS (Row Level Security) 설정
-- 클라이언트 (anon role)의 접근을 완전 차단하고 service_role(Netlify Functions)만 허용
ALTER TABLE re_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_complexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_config ENABLE ROW LEVEL SECURITY;
