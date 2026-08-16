import { collectAndSaveSingleMonth, GU_MAP } from '../../real_estate/re_service.mjs';

function getRecent2Months() {
  const now = new Date();
  const y1 = now.getFullYear();
  const m1 = String(now.getMonth() + 1).padStart(2, '0');
  const ym1 = `${y1}${m1}`;

  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y2 = prev.getFullYear();
  const m2 = String(prev.getMonth() + 1).padStart(2, '0');
  const ym2 = `${y2}${m2}`;

  return [ym1, ym2];
}

export async function handler(event, context) {
  const lawdCd = event.queryStringParameters?.lawd_cd || '11350';
  
  if (!GU_MAP[lawdCd]) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `유효하지 않은 법정동코드(LAWD_CD)입니다: ${lawdCd}` })
    };
  }

  const serviceKey = process.env.PUBLIC_DATA_API_KEY || process.env.SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.' })
    };
  }

  if (!serviceRoleKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.' })
    };
  }

  try {
    const months = getRecent2Months();
    const results = [];

    for (const ym of months) {
      const res = await collectAndSaveSingleMonth(lawdCd, ym, serviceKey, supabaseUrl, serviceRoleKey);
      results.push(res);
      // API 호출 간 350ms 지연
      await new Promise(r => setTimeout(r, 350));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        lawd_cd: lawdCd,
        gu: GU_MAP[lawdCd],
        details: results
      })
    };
  } catch (err) {
    console.error(`[re_collector] Error processing LAWD_CD ${lawdCd}:`, err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
}
