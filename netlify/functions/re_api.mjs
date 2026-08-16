const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const queryParams = event.queryStringParameters || {};
    const gu = queryParams.gu || '전체';
    const parsedScore = parseInt(queryParams.minScore, 10);
    const minScore = Number.isFinite(parsedScore) ? parsedScore : 0;
    const sort = queryParams.sort || 'score';
    const search = (queryParams.search || queryParams.q || '').trim() || null;

    // 기존 버그: re_signals 를 REST 로 직접 조회했으나 RLS 가 켜져 있고 정책이 하나도
    // 없어서 항상 200 OK + 빈 배열이 반환되었습니다(에러조차 나지 않음).
    // SECURITY DEFINER RPC 를 경유하도록 변경합니다.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/re_get_signals`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_gu: gu, p_min_score: minScore, p_sort: sort, p_search: search })
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: errText })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        signals: data,
        total: Array.isArray(data) ? data.length : 0,
        updatedAt: new Date().toISOString().slice(0, 10)
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}
