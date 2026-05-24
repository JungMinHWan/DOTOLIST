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

-- 독서 기록 테이블 (추가)
CREATE TABLE IF NOT EXISTS books (
  book_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT '읽는 중' CHECK (status IN ('읽는 중', '완독', '보류')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
