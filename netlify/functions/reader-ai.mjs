/**
 * 원서 리더 AI 프록시 (Netlify Function)
 *
 * - GEMINI_API_KEY 는 서버 환경변수에만 존재한다. (기존 gemini.mjs 와 동일)
 * - 로그인한 사용자(Supabase access token)만 호출할 수 있다.
 * - 허용 작업은 두 가지뿐이며 프롬프트는 서버가 직접 만든다.
 *
 * 요청:  POST /.netlify/functions/reader-ai
 *        Authorization: Bearer <supabase access token>
 *        { "action": "word", "word": "hesitated", "sentence": "..." }
 *        { "action": "words", "words": ["hesitated", "considerable"], "sentence": "..." }
 *        { "action": "translate", "sentence": "..." }
 */

/*
 * 속도 설정
 *  - 단어 뜻: 가장 빠른 flash-lite 먼저 (기본 사고 수준이 'minimal'), 실패 시 flash
 *  - 번역:   품질을 위해 flash 먼저, 사고 수준을 'low' 로 낮춰 지연을 줄인다
 *  - 모델당 제한 시간을 두고, 넘으면 다음 모델로 넘어간다 (Netlify 함수 10초 제한 안쪽)
 */
const FAST_MODELS = [
  { model: 'gemini-flash-lite-latest', thinking: null },
  { model: 'gemini-flash-latest', thinking: 'low' }
];
const QUALITY_MODELS = [
  { model: 'gemini-flash-latest', thinking: 'low' },
  { model: 'gemini-flash-lite-latest', thinking: null }
];
const TOTAL_BUDGET_MS = 9000;
const PER_MODEL_MS = 6000;

// 공개 값(클라이언트 코드에도 포함된 anon key). 환경변수가 있으면 우선 사용.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

const MAX_WORD = 60;
const MAX_SENTENCE = 1500;
const MAX_WORDS = 10;

const WORD_PROMPT = (word, sentence) => `당신은 영어 원서를 읽는 한국인 독자를 돕는 영어 사전입니다.
아래 문장 속 단어(또는 구)의 뜻을 알려주세요.

단어: ${word}
문장: ${sentence}

반드시 마크다운 없이 다음 JSON 한 개로만 답하세요:
{
  "surface": "문장에 나온 형태 그대로",
  "lemma": "사전 표제어(원형). 구동사/숙어면 그 형태",
  "pos": "품사를 한국어로 (동사, 명사, 형용사, 부사, 구동사 등)",
  "dict_meaning": "대표 사전 뜻 1~3개, 쉼표로 구분 (예: 망설이다, 주저하다)",
  "context_meaning": "이 문장에서의 뜻을 문장 흐름에 맞는 한국어 표현으로 짧게 (예: 망설였다)",
  "note": "문맥상 특이한 쓰임이 있을 때만 한 문장, 없으면 빈 문자열"
}`;

const WORDS_PROMPT = (words, sentence) => `당신은 영어 원서를 읽는 한국인 독자를 돕는 영어 사전입니다.
아래 문장 속 여러 단어(또는 구)의 뜻을 각각 알려주세요. 순서를 지키세요.

단어 목록: ${JSON.stringify(words)}
문장: ${sentence}

반드시 마크다운 없이 다음 JSON 한 개로만 답하세요. items 는 단어 목록과 같은 순서, 같은 개수입니다:
{
  "items": [
    {
      "surface": "문장에 나온 형태 그대로",
      "lemma": "사전 표제어(원형). 구동사/숙어면 그 형태",
      "pos": "품사를 한국어로",
      "dict_meaning": "대표 사전 뜻 1~3개, 쉼표로 구분",
      "context_meaning": "이 문장에서의 뜻을 문장 흐름에 맞는 한국어 표현으로 짧게",
      "note": "문맥상 특이한 쓰임이 있을 때만 한 문장, 없으면 빈 문자열"
    }
  ]
}`;

const TRANSLATE_PROMPT = (sentence) => `당신은 영어 소설을 한국어로 옮기는 번역가입니다.
다음 영어 문장을 자연스러운 한국어로 번역하세요. 직역투를 피하되 원문의 뜻과 어조를 지키세요.
따옴표 안의 대사는 대사답게 옮기세요.

문장: ${sentence}

반드시 마크다운 없이 다음 JSON 한 개로만 답하세요:
{ "translation": "한국어 번역" }`;

const json = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

// 같은 함수 인스턴스가 살아 있는 동안 확인된 토큰은 5분간 다시 확인하지 않는다 (요청마다 한 번의 왕복 절약)
const verified = new Map();
const VERIFY_TTL_MS = 5 * 60 * 1000;

async function verifyUser(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  const hit = verified.get(token);
  if (hit && hit > Date.now()) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return false;
    const user = await res.json();
    const ok = Boolean(user && user.id);
    if (ok) {
      if (verified.size > 200) verified.clear();
      verified.set(token, Date.now() + VERIFY_TTL_MS);
    }
    return ok;
  } catch {
    return false;
  }
}

async function requestModel(apiKey, { model, thinking }, prompt, timeoutMs, withThinking = true) {
  const generationConfig = { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 1024 };
  if (thinking && withThinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    signal: AbortSignal.timeout(timeoutMs)
  });
}

async function callGemini(apiKey, prompt, models = FAST_MODELS) {
  const started = Date.now();
  let lastErrorMsg = null;
  let lastStatus = 502;

  for (const m of models) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started);
    if (left < 1500) break;
    try {
      let res = await requestModel(apiKey, m, prompt, Math.min(PER_MODEL_MS, left));
      // 모델이 사고 수준 설정을 모르면 설정 없이 한 번 더
      if (res.status === 400 && m.thinking) {
        const err = await res.clone().json().catch(() => ({}));
        if (/thinking/i.test(err.error?.message || '')) {
          res = await requestModel(apiKey, m, prompt, Math.min(PER_MODEL_MS, TOTAL_BUDGET_MS - (Date.now() - started)), false);
        }
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastErrorMsg = errData.error?.message || `Gemini API 오류 (${res.status})`;
        lastStatus = res.status === 429 ? 429 : 502;
        console.warn(`[reader-ai] ${m.model} 실패:`, lastErrorMsg);
        continue;
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      if (!text) throw new Error('AI 응답이 비어 있습니다.');
      console.log(`[reader-ai] ${m.model} ${Date.now() - started}ms`);
      return { ok: true, data: JSON.parse(text) };
    } catch (err) {
      lastErrorMsg = err.name === 'TimeoutError' ? '응답 시간 초과' : err.message;
      console.warn(`[reader-ai] ${m.model} 처리 실패:`, lastErrorMsg);
    }
  }
  return { ok: false, status: lastStatus, error: lastErrorMsg };
}

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 지원합니다.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });

  if (!(await verifyUser(req))) {
    return json(401, { error: '로그인이 필요합니다. 앱을 새로고침한 뒤 다시 시도해 주세요.' });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: '잘못된 요청입니다.' });
  }

  const action = payload?.action;
  const sentence = str(payload?.sentence, MAX_SENTENCE);
  if (!sentence) return json(400, { error: '문장이 비어 있습니다.' });

  if (action === 'word') {
    const word = str(payload?.word, MAX_WORD);
    if (!word) return json(400, { error: '단어를 입력해 주세요.' });
    const r = await callGemini(apiKey, WORD_PROMPT(word, sentence));
    if (!r.ok) return json(r.status, { error: r.status === 429 ? 'AI 사용량이 잠시 초과되었습니다. 1분 뒤 다시 시도해 주세요.' : '단어 뜻을 가져오지 못했습니다.' });
    const d = r.data || {};
    return json(200, {
      surface: str(d.surface, 80) || word,
      lemma: str(d.lemma, 80) || word,
      pos: str(d.pos, 30),
      dict_meaning: str(d.dict_meaning, 200),
      context_meaning: str(d.context_meaning, 200),
      note: str(d.note, 300)
    });
  }

  if (action === 'words') {
    const list = (Array.isArray(payload?.words) ? payload.words : [])
      .map((w) => str(w, MAX_WORD)).filter(Boolean).slice(0, MAX_WORDS);
    if (!list.length) return json(400, { error: '단어를 입력해 주세요.' });
    const r = await callGemini(apiKey, WORDS_PROMPT(list, sentence));
    if (!r.ok) return json(r.status, { error: r.status === 429 ? 'AI 사용량이 잠시 초과되었습니다. 1분 뒤 다시 시도해 주세요.' : '단어 뜻을 가져오지 못했습니다.' });
    const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
    return json(200, {
      items: list.map((word, i) => {
        // 순서가 어긋난 경우를 대비해 surface/lemma 로도 찾는다
        const lw = word.toLowerCase();
        const d = items.find((it) => String(it?.surface || '').toLowerCase() === lw) ||
          items.find((it) => String(it?.lemma || '').toLowerCase() === lw) || items[i] || {};
        return {
          surface: word,
          lemma: str(d.lemma, 80) || word,
          pos: str(d.pos, 30),
          dict_meaning: str(d.dict_meaning, 200),
          context_meaning: str(d.context_meaning, 200),
          note: str(d.note, 300)
        };
      })
    });
  }

  if (action === 'translate') {
    const r = await callGemini(apiKey, TRANSLATE_PROMPT(sentence), QUALITY_MODELS);
    if (!r.ok) return json(r.status, { error: r.status === 429 ? 'AI 사용량이 잠시 초과되었습니다. 1분 뒤 다시 시도해 주세요.' : '번역을 가져오지 못했습니다.' });
    return json(200, { translation: str(r.data?.translation, 3000) });
  }

  return json(400, { error: '지원하지 않는 작업입니다.' });
};
