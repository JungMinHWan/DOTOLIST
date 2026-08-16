import { collectAndSaveSingleMonth, GU_MAP } from '../../real_estate/re_service.mjs';

const SEOUL_LAWD_CDS = Object.keys(GU_MAP);

function getRecent2Months() {
  const now = new Date();
  const y1 = now.getFullYear();
  const m1 = String(now.getMonth() + 1).padStart(2, '0');

  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y2 = prev.getFullYear();
  const m2 = String(prev.getMonth() + 1).padStart(2, '0');

  return [`${y1}${m1}`, `${y2}${m2}`];
}

export async function handler(event, context) {
  console.log('[re_scheduled_collector] Scheduled collector started at', new Date().toISOString());

  const serviceKey = process.env.PUBLIC_DATA_API_KEY || process.env.SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey || !serviceRoleKey) {
    console.error('[re_scheduled_collector] Missing required environment variables.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing environment variables.' })
    };
  }

  const targetLawdCd = event.queryStringParameters?.lawd_cd;
  const lawdList = targetLawdCd ? [targetLawdCd] : SEOUL_LAWD_CDS;
  const months = getRecent2Months();
  
  const summary = [];

  for (const lawdCd of lawdList) {
    for (const ym of months) {
      try {
        const res = await collectAndSaveSingleMonth(lawdCd, ym, serviceKey, supabaseUrl, serviceRoleKey);
        summary.push(res);
      } catch (err) {
        console.error(`[re_scheduled_collector] Failed ${lawdCd} ${ym}:`, err.message);
        summary.push({ lawd_cd: lawdCd, deal_ymd: ym, error: err.message });
      }
      // API 호출 간 350ms 지연
      await new Promise(r => setTimeout(r, 350));
    }
  }

  console.log('[re_scheduled_collector] Collector finished. Processed items:', summary.length);

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      processed_count: summary.length,
      summary: summary
    })
  };
}
