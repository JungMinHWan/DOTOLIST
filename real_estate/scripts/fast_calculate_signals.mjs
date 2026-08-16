import { fileURLToPath } from 'url';
import { GU_MAP } from '../re_parser.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
// 배치 스크립트는 반드시 service_role 키로 실행합니다. (anon 키 + re_exec_sql 조합은 보안상 금지)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * ⚠️ 단지명 정규화 표현식 — re_rpc_fix.sql 의 re_norm_name() 과 반드시 동일해야 합니다.
 *
 * String.raw 를 쓰는 이유: 일반 템플릿 리터럴에서는 '\(' 의 백슬래시가 JS 단계에서 먹혀버려
 * Postgres 에는 '(.*)' 가 전달되고, 이 패턴은 문자열 전체에 매칭되어 결과가 통째로 빈 값이 됩니다.
 *
 * COALESCE/NULLIF 이유: 이름이 지번뿐인 나홀로아파트(예: '(685-103)', '(1546-0)')가 85개 있는데
 * 괄호 안을 지우면 이름이 통째로 사라져 빈 키가 됩니다. 이 경우 괄호를 지우지 않은
 * 원본 이름을 폴백으로 사용합니다. ('(685-103)' -> '685103')
 */
const NORM_NAME = String.raw`COALESCE(NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(REPLACE(apt_name, ' ', ''), '\(.*?\)', '', 'g'), '[^a-zA-Z0-9가-힣]', '', 'g'), ''), REGEXP_REPLACE(REPLACE(apt_name, ' ', ''), '[^a-zA-Z0-9가-힣]', '', 'g'))`;

async function execSql(sqlQuery) {
  if (!SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. (예: SUPABASE_SERVICE_ROLE_KEY=xxx node fast_calculate_signals.mjs)');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/re_exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_query: sqlQuery })
  });

  const txt = await res.text();

  // 기존 버그: 응답을 검사하지 않아 구(區)별 INSERT 가 통째로 실패해도 "완료"로 보고되었습니다.
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }

  // re_exec_sql 의 반환 형태(RETURNS void / json / setof record)는 프로젝트마다 다릅니다.
  // 본문이 비었거나 JSON 이 아니어도 HTTP 200 이면 성공으로 봅니다.
  const trimmed = (txt || '').trim();
  if (trimmed === '' || trimmed === 'null') return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return null;
  }

  if (parsed && !Array.isArray(parsed) && parsed.error) {
    throw new Error(`SQL 오류: ${JSON.stringify(parsed.error).slice(0, 500)}`);
  }

  return parsed;
}

/** re_exec_sql 이 결과를 돌려주지 않는 형태일 수도 있으므로, 건수 확인은 실패해도 배치를 막지 않습니다. */
function extractCount(res) {
  if (Array.isArray(res) && res.length > 0 && res[0] != null) {
    const v = res[0].cnt ?? Object.values(res[0])[0];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (res && typeof res === 'object' && res.cnt != null) {
    const n = Number(res.cnt);
    if (Number.isFinite(n)) return n;
  }
  return null; // 확인 불가
}

export function buildSignalSql(lawdCd) {
  return `
    WITH
    norm_deals AS (
      SELECT d.*,
        (d.lawd_cd || '|' || d.jibun || '|' || ${NORM_NAME}) AS complex_key,
        ROUND(d.area)::INT AS area_key
      FROM re_deals d
      WHERE d.lawd_cd = '${lawdCd}'
    ),
    /*
     * ⚠️ eff_canceled (실질 해제 여부)
     * 국토부 API 는 해제된 거래를 "해제 레코드"로 한 건 더 내려주는데,
     * 취소 전 스냅샷(정상)과 취소 후 레코드(해제)가 같은 달 응답에 함께 들어옵니다.
     * 수집 원본 확인 결과 [정상+해제] 가 섞인 자연키 그룹이 5,969개(12,715행) 있고,
     * is_canceled 만 보면 해제된 계약이 "정상 거래"로 살아남아 신호를 만들어냅니다.
     * → 동일 자연키(지번+면적+층+계약일+금액)에 해제 기록이 하나라도 있으면
     *   모든 사본을 해제로 간주합니다.
     */
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

export async function runFastSignalBatch() {
  console.log('=== [전범위 신호 산출] 서울 25개 구 전범위 신호 계산 배치 시작 ===');
  const startTime = Date.now();

  const lawdCodes = Object.keys(GU_MAP);

  await execSql('TRUNCATE re_signals;');

  const failures = [];
  let totalRows = 0;
  let countable = true;

  for (const lawdCd of lawdCodes) {
    const guName = GU_MAP[lawdCd];

    try {
      await execSql(buildSignalSql(lawdCd));

      // 구별 실제 적재 건수를 확인해 "조용한 실패"를 즉시 드러냅니다.
      let rows = null;
      try {
        rows = extractCount(await execSql(`SELECT count(*)::INT AS cnt FROM re_signals WHERE gu = '${guName}';`));
      } catch (e) { /* 건수 확인 실패는 배치 실패가 아님 */ }

      if (rows === null) {
        countable = false;
        console.log(`  ✔ ${guName}(${lawdCd}): 적재 완료 (건수 확인 불가)`);
      } else {
        totalRows += rows;
        console.log(`  ✔ ${guName}(${lawdCd}): ${rows}건`);
        if (rows === 0) {
          failures.push({ gu: guName, lawdCd, reason: '적재 0건 (데이터 없음 또는 조건 미충족)' });
        }
      }
    } catch (err) {
      console.error(`  ✘ ${guName}(${lawdCd}) 실패: ${err.message}`);
      failures.push({ gu: guName, lawdCd, reason: err.message });
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  if (countable) {
    console.log(`=== 완료: 총 ${totalRows}건 신호 적재 / 소요 ${durationSec}초 ===`);
  } else {
    console.log(`=== 완료 / 소요 ${durationSec}초 ===`);
    console.log('   (re_exec_sql 이 결과를 반환하지 않는 형태라 건수를 세지 못했습니다.');
    console.log('    Supabase SQL Editor 에서 아래로 직접 확인하세요:');
    console.log('    SELECT gu, count(*) FROM re_signals GROUP BY gu ORDER BY 2 DESC;)');
  }

  if (failures.length > 0) {
    console.error(`⚠️ 문제 발생 구 ${failures.length}개:`);
    failures.forEach(f => console.error(`   - ${f.gu}(${f.lawdCd}): ${f.reason}`));
  } else {
    console.log('✅ 실패한 구 없음');
  }

  return { totalRows, failures, durationSec };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFastSignalBatch().catch(err => {
    console.error('배치 실행 중단:', err.message);
    process.exit(1);
  });
}
