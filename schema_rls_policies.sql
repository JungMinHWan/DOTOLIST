-- 1. RLS (Row-Level Security) 활성화
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault ENABLE ROW LEVEL SECURITY;

-- 2. 로그인된(authenticated) 사용자에게만 모든 CRUD 권한을 허용하는 Policy 정의
DROP POLICY IF EXISTS "Allow authenticated users to read/write tasks" ON public.tasks;
CREATE POLICY "Allow authenticated users to read/write tasks" ON public.tasks TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write daily_metrics" ON public.daily_metrics;
CREATE POLICY "Allow authenticated users to read/write daily_metrics" ON public.daily_metrics TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write daily_memos" ON public.daily_memos;
CREATE POLICY "Allow authenticated users to read/write daily_memos" ON public.daily_memos TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write daily_diaries" ON public.daily_diaries;
CREATE POLICY "Allow authenticated users to read/write daily_diaries" ON public.daily_diaries TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write daily_news" ON public.daily_news;
CREATE POLICY "Allow authenticated users to read/write daily_news" ON public.daily_news TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write goals" ON public.goals;
CREATE POLICY "Allow authenticated users to read/write goals" ON public.goals TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write goal_executions" ON public.goal_executions;
CREATE POLICY "Allow authenticated users to read/write goal_executions" ON public.goal_executions TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write books" ON public.books;
CREATE POLICY "Allow authenticated users to read/write books" ON public.books TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to read/write vault" ON public.vault;
CREATE POLICY "Allow authenticated users to read/write vault" ON public.vault TO authenticated USING (true) WITH CHECK (true);
