-- ==========================================
-- 📚 독서 지식·어휘 데이터베이스 테이블 (user_book_vocab)
-- ==========================================

CREATE TABLE IF NOT EXISTS user_book_vocab (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(book_id) ON DELETE SET NULL, -- 선택사항 (특정 책과 연결)
    book_title TEXT, -- 책 제목 (책 정보가 없을 수 있으므로 직접 저장도 허용)
    keyword TEXT NOT NULL, -- 단어, 인물, 지명, 개념 등
    category TEXT DEFAULT '어휘', -- '인물', '지명', '어휘', '사건', '기타'
    short_summary TEXT, -- 한 줄 요약
    full_description TEXT, -- 상세 설명
    related_tags TEXT[], -- 연관 키워드 태그 배열
    mastery_level INT DEFAULT 0, -- 0: 생소함, 1: 복습중, 2: 완전습득
    correct_count INT DEFAULT 0, -- 퀴즈 맞힌 횟수
    wrong_count INT DEFAULT 0, -- 퀴즈 틀린 횟수
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) 설정
ALTER TABLE user_book_vocab ENABLE ROW LEVEL SECURITY;

-- 본인 데이터 조회/수정/생성/삭제 정책
CREATE POLICY "Users can manage their own book vocab"
ON user_book_vocab
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 인덱스 추가 (빠른 조회용)
CREATE INDEX IF NOT EXISTS idx_user_book_vocab_user_id ON user_book_vocab(user_id);
CREATE INDEX IF NOT EXISTS idx_user_book_vocab_keyword ON user_book_vocab(keyword);
