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

-- 일일 지표 주말 발주/예약 건수 및 계약 top/bottom 컬럼 추가
ALTER TABLE daily_metrics 
ADD COLUMN IF NOT EXISTS weekend_dress_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekend_wedding_reservations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS contract_top TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS contract_bottom TEXT DEFAULT '';

-- 일일 지표 누적 계약건수 및 누적 DB건수 컬럼 추가
ALTER TABLE daily_metrics
ADD COLUMN IF NOT EXISTS cumulative_contracts_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cumulative_db_count INTEGER DEFAULT 0;


-- 일일 지표 토요일/일요일 페스타드레스발주 및 혼수예약 건수 컬럼 추가
ALTER TABLE daily_metrics
ADD COLUMN IF NOT EXISTS saturday_festa_dress_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sunday_festa_dress_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS saturday_wedding_reservations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sunday_wedding_reservations INTEGER DEFAULT 0;

-- 사용자 통계 테이블 (user_stats)
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 일일 미션 진행 상황 테이블 (daily_quest_status)
CREATE TABLE IF NOT EXISTS public.daily_quest_status (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE,
  completed_tasks_count INTEGER DEFAULT 0,
  memo_written BOOLEAN DEFAULT false,
  diary_written BOOLEAN DEFAULT false,
  news_written BOOLEAN DEFAULT false,
  book_logged BOOLEAN DEFAULT false,
  metrics_logged BOOLEAN DEFAULT false,
  quest_1_completed BOOLEAN DEFAULT false,
  quest_2_completed BOOLEAN DEFAULT false,
  quest_3_completed BOOLEAN DEFAULT false,
  quest_4_completed BOOLEAN DEFAULT false,
  all_clear_completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- RLS (Row-Level Security) 설정
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read/write user_stats" ON public.user_stats;
CREATE POLICY "Allow authenticated users to read/write user_stats" ON public.user_stats TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write daily_quest_status" ON public.daily_quest_status;
CREATE POLICY "Allow authenticated users to read/write daily_quest_status" ON public.daily_quest_status TO authenticated USING (true) WITH CHECK (true);



