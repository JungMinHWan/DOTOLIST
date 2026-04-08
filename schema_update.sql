-- 일기장 테이블 (달력 파란 점)
CREATE TABLE IF NOT EXISTS daily_diaries (
  date DATE PRIMARY KEY,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 신문 테이블 (달력 초록 점)
CREATE TABLE IF NOT EXISTS daily_news (
  date DATE PRIMARY KEY,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
