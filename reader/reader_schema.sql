-- ==========================================================
-- 원서 리더 (EPUB Reader) 스키마
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS / DROP POLICY IF EXISTS 를 사용합니다.
-- ==========================================================

-- 1. 책 (읽던 위치/진행률 포함)
CREATE TABLE IF NOT EXISTS public.reader_books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  author          TEXT DEFAULT '',
  language        TEXT DEFAULT 'en',
  file_path       TEXT NOT NULL,             -- Storage: {user_id}/{book_id}/book.epub
  cover_path      TEXT,                      -- Storage: {user_id}/{book_id}/cover.jpg
  file_hash       TEXT NOT NULL,             -- SHA-256 (중복 업로드 방지, CFI 유효성 보장)
  file_size       BIGINT DEFAULT 0,
  locations_json  TEXT,                      -- epub.js locations 캐시 (진행률 계산용)
  current_cfi     TEXT,                      -- 마지막 읽던 위치
  current_chapter TEXT DEFAULT '',
  progress_pct    NUMERIC(5,2) DEFAULT 0,
  last_read_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, file_hash)
);

-- 2. 학습한 문장 (학습 기록의 중심)
CREATE TABLE IF NOT EXISTS public.reader_sentences (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id            UUID NOT NULL REFERENCES public.reader_books(id) ON DELETE CASCADE,
  spine_index        INT,
  chapter_href       TEXT,
  chapter_label      TEXT DEFAULT '',
  cfi_range          TEXT NOT NULL,
  sentence_text      TEXT NOT NULL,
  typed_text         TEXT DEFAULT '',
  typing_mode        TEXT DEFAULT 'skipped' CHECK (typing_mode IN ('typed', 'skipped')),
  translation        TEXT,
  translation_viewed BOOLEAN DEFAULT FALSE,
  tts_play_count     INT DEFAULT 0,
  status             TEXT DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed')),
  completed_at       TIMESTAMPTZ,
  review_count       INT DEFAULT 0,
  last_reviewed_at   TIMESTAMPTZ,
  next_review_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (book_id, cfi_range)
);

-- 3. 모르는 단어 (문장에 종속)
CREATE TABLE IF NOT EXISTS public.reader_words (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id         UUID NOT NULL REFERENCES public.reader_books(id) ON DELETE CASCADE,
  sentence_id     UUID NOT NULL REFERENCES public.reader_sentences(id) ON DELETE CASCADE,
  surface         TEXT NOT NULL,   -- 본문 형태: hesitated
  lemma           TEXT,            -- 원형: hesitate
  pos             TEXT,            -- 품사
  dict_meaning    TEXT,            -- 사전 뜻: 망설이다, 주저하다
  context_meaning TEXT,            -- 이 문장에서의 뜻: 망설였다
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 일별 독서 로그 (독해 지표용, 화면은 후순위)
CREATE TABLE IF NOT EXISTS public.reader_daily_log (
  user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date            DATE NOT NULL,
  book_id             UUID NOT NULL REFERENCES public.reader_books(id) ON DELETE CASCADE,
  pages_viewed        INT DEFAULT 0,   -- 5초 이상 머문 페이지 수
  sentences_read_est  INT DEFAULT 0,   -- 그 페이지들의 문장 수 합(추정)
  sentences_studied   INT DEFAULT 0,
  words_looked_up     INT DEFAULT 0,
  translations_viewed INT DEFAULT 0,
  reading_seconds     INT DEFAULT 0,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, log_date, book_id)
);

CREATE INDEX IF NOT EXISTS idx_reader_books_user       ON public.reader_books(user_id, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_sentences_book   ON public.reader_sentences(book_id);
CREATE INDEX IF NOT EXISTS idx_reader_sentences_done   ON public.reader_sentences(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_words_sentence   ON public.reader_words(sentence_id);
CREATE INDEX IF NOT EXISTS idx_reader_words_lemma      ON public.reader_words(user_id, lemma);

-- ---------- RLS: 본인 데이터만 ----------
ALTER TABLE public.reader_books      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reader_sentences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reader_words      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reader_daily_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reader_books own" ON public.reader_books;
CREATE POLICY "reader_books own" ON public.reader_books
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_sentences own" ON public.reader_sentences;
CREATE POLICY "reader_sentences own" ON public.reader_sentences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_words own" ON public.reader_words;
CREATE POLICY "reader_words own" ON public.reader_words
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reader_daily_log own" ON public.reader_daily_log;
CREATE POLICY "reader_daily_log own" ON public.reader_daily_log
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- Storage: 비공개 버킷 epubs ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('epubs', 'epubs', FALSE, 52428800, ARRAY['application/epub+zip', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- 경로 첫 폴더가 본인 user_id 일 때만 접근
DROP POLICY IF EXISTS "epubs select own" ON storage.objects;
CREATE POLICY "epubs select own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'epubs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "epubs insert own" ON storage.objects;
CREATE POLICY "epubs insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'epubs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "epubs update own" ON storage.objects;
CREATE POLICY "epubs update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'epubs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "epubs delete own" ON storage.objects;
CREATE POLICY "epubs delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'epubs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- v1.1: 리더에서 바로 찾아본 어휘 (문장 학습과 별개, 파란 하이라이트) ----------
ALTER TABLE public.reader_words
  ALTER COLUMN sentence_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS cfi_range TEXT,
  ADD COLUMN IF NOT EXISTS chapter_href TEXT,
  ADD COLUMN IF NOT EXISTS sentence_text TEXT;
