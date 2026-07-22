/**
 * Gemini 프록시 (Netlify Function)
 *
 * API 키를 브라우저에 노출하지 않기 위한 서버 측 중계.
 * Netlify 대시보드 > Site configuration > Environment variables 에
 * GEMINI_API_KEY 를 등록해야 동작한다.
 *
 * 요청:  POST /.netlify/functions/gemini  { "keyword": "르네상스" }
 * 응답:  { keyword, category, short_summary, full_description, related_tags }
 *
 * 키워드만 받아서 서버가 프롬프트를 구성하므로, 이 엔드포인트를
 * 범용 Gemini 릴레이로 악용할 수 없다.
 */

// gemini-1.5-*/2.5-flash 는 신규 키에서 404, 2.0-flash 는 무료 쿼터 0.
// -latest 별칭을 쓰면 Google 이 모델을 퇴역시켜도 깨지지 않는다.
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

const MAX_KEYWORD_LENGTH = 100;

const SYSTEM_PROMPT = `당신은 독서 지식 및 어휘 사전 AI입니다.
사용자가 제공하는 키워드(단어, 인물명, 지명, 학술용어, 역사적 사건 등)를 분석하여 정형화된 JSON 데이터로 답변하세요.

반드시 마크다운 코드블록 없이 다음 순수 JSON 포맷으로만 답변해야 합니다:
{
  "keyword": "입력된 키워드",
  "category": "인물" | "지명" | "어휘" | "사건" | "기타",
  "short_summary": "1문장의 핵심 요약 (50자 이내)",
  "full_description": "독서 중 이해하기 쉬운 2~3문장의 명확하고 깊이 있는 상세 설명",
  "related_tags": ["연관태그1", "연관태그2", "연관태그3"]
}`;

const json = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'POST 요청만 지원합니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  let keyword;
  try {
    ({ keyword } = await req.json());
  } catch {
    return json(400, { error: '잘못된 JSON 요청입니다.' });
  }

  if (typeof keyword !== 'string' || !keyword.trim()) {
    return json(400, { error: '검색할 단어/키워드를 입력해 주세요.' });
  }

  const cleanKeyword = keyword.trim().slice(0, MAX_KEYWORD_LENGTH);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\n분석할 키워드: ${cleanKeyword}` }]
      }
    ],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  };

  let lastErrorMsg = null;
  let lastStatus = 502;

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(body)
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastErrorMsg = errData.error?.message || `Gemini API 오류 (${res.status})`;
        lastStatus = res.status === 429 ? 429 : 502;
        console.warn(`[gemini-proxy] ${model} 실패:`, lastErrorMsg);
        continue;
      }

      const data = await res.json();

      // Gemini 3.x 는 thought part 가 앞에 올 수 있으므로 text 파트만 모은다
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      if (!text) throw new Error('AI 응답을 수신하지 못했습니다.');

      const parsed = JSON.parse(text);

      return json(200, {
        keyword: parsed.keyword || cleanKeyword,
        category: parsed.category || '어휘',
        short_summary: parsed.short_summary || '',
        full_description: parsed.full_description || '',
        related_tags: Array.isArray(parsed.related_tags) ? parsed.related_tags : []
      });
    } catch (err) {
      lastErrorMsg = err.message;
      console.warn(`[gemini-proxy] ${model} 처리 실패:`, err.message);
    }
  }

  return json(lastStatus, { error: lastErrorMsg || 'Gemini API 호출에 실패했습니다.' });
};
