import { collectAndSaveSingleMonth, GU_MAP } from '../../real_estate/re_service.mjs';

const SEOUL_LAWD_CDS = Object.keys(GU_MAP);

const NORM_NAME = String.raw`COALESCE(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(apt_name, ' ', ''), '\(.*?\)', '', 'g'), '[^a-zA-Z0-9가-힣]', '', 'g'), ''), REGEXP_REPLACE(REPLACE(apt_name, ' ', ''), '[^a-zA-Z0-9가-힣]', '', 'g'))`;

function buildSignalSql(lawdCd) {
  return `
    WITH
    norm_deals AS (
      SELECT d.*,
        (d.lawd_cd || '|' || d.jibun || '|' || ${NORM_NAME}) AS complex_key,
        ROUND(d.area)::INT AS area_key
      FROM re_deals d
      WHERE d.lawd_cd = '${lawdCd}'
    ),
    keyed_deals AS (
      SELECT n.*,
        (n.complex_key || '|' || n.area_key) AS signal_key,
        BOOL_OR(n.is_canceled) OVER (
          PARTITION BY n.lawd_cd, n.jibun, n.area, n.floor, n.deal_date, n.amount
        ) AS eff_canceled
      FROM norm_deals n
    ),
    max_floors_complex AS (
      SELECT complex_key, MAX(floor) AS max_floor
      FROM keyed_deals
      GROUP BY complex_key
    ),
    bulk_public_combos AS (
      SELECT DISTINCT complex_key
      FROM keyed_deals
      WHERE buyer_type = '공공기관'
      GROUP BY complex_key, deal_date
      HAVING count(*) >= 10
    ),
    cancel_stats AS (
      SELECT
        complex_key,
        ROUND(count(*) FILTER (WHERE eff_canceled)::NUMERIC / NULLIF(count(*), 0), 4) AS cancel_rate
      FROM keyed_deals
      WHERE deal_date >= CURRENT_DATE - INTERVAL '24 months'
      GROUP BY complex_key
    ),
    valid_deals AS (
      SELECT d.*
      FROM keyed_deals d
      JOIN max_floors_complex mc ON d.complex_key = mc.complex_key
      WHERE NOT d.eff_canceled
        AND (d.dealing_type IS NULL OR d.dealing_type = '중개거래')
        AND d.floor > 1
        AND (mc.max_floor <= 5 OR d.floor < mc.max_floor)
        AND d.deal_date >= CURRENT_DATE - INTERVAL '24 months'
    ),
    ranked_deals AS (
      SELECT
        v.*,
        ROW_NUMBER() OVER (PARTITION BY signal_key ORDER BY deal_date DESC, deal_key DESC) - 1 AS pool_idx
      FROM valid_deals v
    ),
    baseline_stats AS (
      SELECT
        signal_key,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)::INT AS baseline_amount,
        ROUND((STDDEV(amount) / NULLIF(AVG(amount), 0))::NUMERIC, 4) AS pool_cv
      FROM ranked_deals
      WHERE pool_idx BETWEEN 1 AND 5
      GROUP BY signal_key
    ),
    group_summary AS (
      SELECT
        signal_key, complex_key, area_key,
        MIN(gu) AS gu, MIN(dong) AS dong, MIN(apt_name) AS apt_name,
        count(*) AS sample_size,
        max(deal_date) AS latest_date,
        max(amount) AS peak_amount,
        min(amount) AS low_amount,
        count(*) FILTER (WHERE deal_date >= CURRENT_DATE - INTERVAL '90 days') AS density_90d,
        count(*) FILTER (WHERE registered_at IS NOT NULL AND (registered_at - deal_date) < 14) AS fast_regist_cnt,
        count(*) FILTER (WHERE registered_at IS NOT NULL AND registered_at = deal_date) AS same_day_regist_cnt
      FROM valid_deals
      GROUP BY signal_key, complex_key, area_key
      HAVING count(*) >= 3 AND max(deal_date) >= CURRENT_DATE - INTERVAL '180 days'
    ),
    computed_signals AS (
      SELECT
        gs.complex_key, gs.signal_key, gs.area_key, gs.gu, gs.dong, gs.apt_name,
        ROUND(r0.area / 3.3058)::INT AS pyeong,
        r0.amount AS latest_amount,
        r0.deal_date AS latest_date,
        r0.floor AS latest_floor,
        COALESCE(bs.baseline_amount, r0.amount) AS baseline_amount,
        gs.peak_amount, gs.low_amount,
        ROUND((COALESCE(bs.baseline_amount, r0.amount) - r0.amount)::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0), 4) AS drop_rate,
        (r0.amount <= gs.low_amount) AS is_new_low,
        (CASE WHEN bp.complex_key IS NOT NULL THEN 0 ELSE gs.density_90d END) AS density_90d,
        COALESCE(cs.cancel_rate, 0) AS cancel_rate,
        gs.fast_regist_cnt, gs.sample_size,
        (
          ROUND((COALESCE(bs.baseline_amount, r0.amount) - r0.amount)::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0), 4) >= 0.20
          AND (r1.amount IS NULL OR ABS(r1.amount - COALESCE(bs.baseline_amount, r0.amount))::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0) <= 0.10)
          AND (r2.amount IS NULL OR ABS(r2.amount - COALESCE(bs.baseline_amount, r0.amount))::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0) <= 0.10)
        ) AS is_single_outlier,
        (gs.sample_size >= 5 AND bs.pool_cv > 0.12) AS is_high_variance,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN gs.sample_size < 5 THEN 'SMALL_SAMPLE' END,
          CASE WHEN gs.same_day_regist_cnt > 0 THEN 'SAME_DAY_REGIST' END,
          CASE WHEN r0.area <= 85.0 AND r0.build_year IS NOT NULL AND r0.build_year <= 2000 THEN 'LEGACY_RENTAL' END,
          CASE WHEN bp.complex_key IS NOT NULL THEN 'BULK_PUBLIC' END,
          CASE WHEN (
            ROUND((COALESCE(bs.baseline_amount, r0.amount) - r0.amount)::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0), 4) >= 0.20
            AND (r1.amount IS NULL OR ABS(r1.amount - COALESCE(bs.baseline_amount, r0.amount))::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0) <= 0.10)
            AND (r2.amount IS NULL OR ABS(r2.amount - COALESCE(bs.baseline_amount, r0.amount))::NUMERIC / NULLIF(COALESCE(bs.baseline_amount, r0.amount), 0) <= 0.10)
          ) THEN 'SINGLE_OUTLIER' END,
          CASE WHEN (gs.sample_size >= 5 AND bs.pool_cv > 0.12) THEN 'HIGH_VARIANCE' END
        ], NULL) AS flags
      FROM group_summary gs
      JOIN ranked_deals r0 ON gs.signal_key = r0.signal_key AND r0.pool_idx = 0
      LEFT JOIN ranked_deals r1 ON gs.signal_key = r1.signal_key AND r1.pool_idx = 1
      LEFT JOIN ranked_deals r2 ON gs.signal_key = r2.signal_key AND r2.pool_idx = 2
      LEFT JOIN baseline_stats bs ON gs.signal_key = bs.signal_key
      LEFT JOIN bulk_public_combos bp ON gs.complex_key = bp.complex_key
      LEFT JOIN cancel_stats cs ON gs.complex_key = cs.complex_key
    ),
    scored_signals AS (
      SELECT s.*,
        ROUND(
          (
            (CASE WHEN drop_rate >= 0.20 THEN 40 WHEN drop_rate >= 0.12 THEN 25 WHEN drop_rate >= 0.07 THEN 12 ELSE 0 END) +
            (CASE WHEN is_new_low THEN 25 ELSE 0 END) +
            (CASE WHEN density_90d >= 5 THEN 20 WHEN density_90d >= 3 THEN 10 ELSE 0 END) -
            (CASE WHEN cancel_rate > 0.12 THEN 20 ELSE 0 END) -
            (CASE WHEN fast_regist_cnt >= 1 THEN 15 ELSE 0 END)
          ) * (CASE WHEN sample_size < 5 THEN 0.7 ELSE 1.0 END)
            * (CASE WHEN is_single_outlier THEN 0.5 ELSE 1.0 END)
            * (CASE WHEN is_high_variance THEN 0.7 ELSE 1.0 END)
        )::INT AS score
      FROM computed_signals s
    )
    INSERT INTO re_signals (
      complex_key, area_bucket, gu, dong, apt_name, pyeong, score, latest_amount,
      latest_date, latest_floor, baseline_amount, peak_amount, low_amount, drop_rate,
      is_new_low, density_90d, cancel_rate, fast_regist_cnt, sample_size, flags
    )
    SELECT
      complex_key, area_key, gu, dong, apt_name, pyeong, score, latest_amount,
      latest_date, latest_floor, baseline_amount, peak_amount, low_amount, drop_rate,
      is_new_low, density_90d, cancel_rate, fast_regist_cnt, sample_size, flags
    FROM scored_signals
    WHERE score >= 0
    ON CONFLICT (complex_key, area_bucket) DO UPDATE SET
      score = EXCLUDED.score,
      latest_amount = EXCLUDED.latest_amount,
      latest_date = EXCLUDED.latest_date,
      baseline_amount = EXCLUDED.baseline_amount,
      drop_rate = EXCLUDED.drop_rate,
      flags = EXCLUDED.flags;
  `;
}

async function execSql(sqlQuery, supabaseUrl, serviceRoleKey) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/re_exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_query: sqlQuery })
  });
  return res.ok;
}

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
  console.log('[re_scheduled_collector] Collector & signal recalculation started at', new Date().toISOString());

  const serviceKey = process.env.PUBLIC_DATA_API_KEY || process.env.SERVICE_KEY || 'GY%2BV1BnKDmURgbv1z5mJB3QnX278JWkGMm9wOMP7ubR3B04uNiTRmYWC5cQBw5wHfOwgT32VRx9oFE4kgcF8qQ%3D%3D';
  const supabaseUrl = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('[re_scheduled_collector] Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Netlify 서버에 SUPABASE_SERVICE_ROLE_KEY 환경변수가 등록되어 있지 않습니다.' })
    };
  }

  const targetLawdCd = event.queryStringParameters?.lawd_cd;
  const lawdList = (targetLawdCd && targetLawdCd !== '전체') ? [targetLawdCd] : SEOUL_LAWD_CDS;
  const months = getRecent2Months();
  
  const summary = [];

  // 1. 수집 파이프라인 (Netlify 10초 타임아웃 방지를 위한 청크 단위 병렬 처리)
  const tasks = [];
  for (const lawdCd of lawdList) {
    for (const ym of months) {
      tasks.push({ lawdCd, ym });
    }
  }

  // 8개씩 병렬 실행 (타임아웃 10초 절대 방지)
  const CHUNK_SIZE = 8;
  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
    const chunk = tasks.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async ({ lawdCd, ym }) => {
        try {
          return await collectAndSaveSingleMonth(lawdCd, ym, serviceKey, supabaseUrl, serviceRoleKey);
        } catch (err) {
          console.error(`[re_scheduled_collector] Failed ${lawdCd} ${ym}:`, err.message);
          return { lawd_cd: lawdCd, deal_ymd: ym, error: err.message };
        }
      })
    );
    summary.push(...chunkResults);
    await new Promise(r => setTimeout(r, 20));
  }

  // 2. 신호 산출 전범위 갱신 (병렬 처리)
  try {
    if (lawdList.length === SEOUL_LAWD_CDS.length) {
      await execSql('TRUNCATE re_signals;', supabaseUrl, serviceRoleKey);
    }
    for (let i = 0; i < lawdList.length; i += 5) {
      const chunk = lawdList.slice(i, i + 5);
      await Promise.all(chunk.map(code => execSql(buildSignalSql(code), supabaseUrl, serviceRoleKey)));
    }
    console.log('[re_scheduled_collector] Signal recalculation finished.');
  } catch (calcErr) {
    console.error('[re_scheduled_collector] Signal calculation failed:', calcErr.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      processed_count: summary.length,
      summary: summary
    })
  };
}
