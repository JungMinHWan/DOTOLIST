import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

async function execSql(sqlQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/re_exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_query: sqlQuery })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return res.json();
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

export async function runSignalBatch() {
  console.log('=== [Phase 2] 서울 아파트 실거래 신호 계산 배치 시작 ===');
  const startTime = Date.now();

  const todayStr = new Date().toISOString().substring(0, 10);
  const date24MonthsAgo = new Date();
  date24MonthsAgo.setFullYear(date24MonthsAgo.getFullYear() - 2);
  const date24MonthsAgoStr = date24MonthsAgo.toISOString().substring(0, 10);

  const date90DaysAgo = new Date();
  date90DaysAgo.setDate(date90DaysAgo.getDate() - 90);
  const date90DaysAgoStr = date90DaysAgo.toISOString().substring(0, 10);

  const date180DaysAgo = new Date();
  date180DaysAgo.setDate(date180DaysAgo.getDate() - 180);
  const date180DaysAgoStr = date180DaysAgo.toISOString().substring(0, 10);

  // 1. re_signals 테이블 비우기
  await execSql('TRUNCATE re_signals;');

  // 2. (complex_key, area_bucket) 단위 최고층 맵 구성
  console.log('1. (complex_key, area_bucket) 단위 최고층 및 BULK_PUBLIC 조합 집계...');
  
  const rawDealsRes = await fetch(`${SUPABASE_URL}/rest/v1/re_deals?select=*`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  
  // REST API 데이터가 많을 수 있으므로 RPC로 직접 계산을 수행하는 SQL로 구동합니다!
  const calculateBatchSql = `
    WITH 
    -- 1) (complex_key, area_bucket) 단위 최고층
    max_floors AS (
      SELECT lawd_cd || '|' || jibun AS complex_key, area_bucket, MAX(floor) AS max_floor
      FROM re_deals
      GROUP BY lawd_cd, jibun, area_bucket
    ),
    -- 2) BULK_PUBLIC 조합 (동일 지번, 계약일, buyer_type='공공기관' 10건 이상)
    bulk_public_combos AS (
      SELECT lawd_cd || '|' || jibun AS complex_key, deal_date
      FROM re_deals
      WHERE buyer_type = '공공기관'
      GROUP BY lawd_cd, jibun, deal_date
      HAVING count(*) >= 10
    ),
    -- 3) 유효 거래 풀 (직거래, 1층, 최고층, 해제, 24개월 초과 제외)
    valid_deals AS (
      SELECT d.*, (d.lawd_cd || '|' || d.jibun) AS complex_key
      FROM re_deals d
      JOIN max_floors mf ON (d.lawd_cd || '|' || d.jibun) = mf.complex_key AND d.area_bucket = mf.area_bucket
      WHERE NOT d.is_canceled
        AND (d.dealing_type IS NULL OR d.dealing_type = '중개거래')
        AND d.floor > 1
        AND d.floor < mf.max_floor
        AND d.deal_date >= '${date24MonthsAgoStr}'
    ),
    -- 4) (complex_key, area_bucket) 그룹별 정렬 및 통계
    grouped_valid AS (
      SELECT 
        complex_key, area_bucket, gu, dong, apt_name,
        count(*) AS sample_size,
        max(deal_date) AS latest_date,
        max(amount) AS peak_amount,
        min(amount) AS low_amount,
        count(*) FILTER (WHERE deal_date >= '${date90DaysAgoStr}') AS density_90d,
        count(*) FILTER (WHERE registered_at IS NOT NULL AND (registered_at - deal_date) < 14) AS fast_regist_cnt,
        count(*) FILTER (WHERE registered_at IS NOT NULL AND registered_at = deal_date) AS same_day_regist_cnt
      FROM valid_deals
      GROUP BY complex_key, area_bucket, gu, dong, apt_name
      HAVING count(*) >= 3 AND max(deal_date) >= '${date180DaysAgoStr}'
    )
    SELECT g.* FROM grouped_valid g;
  `;

  console.log('2. 신호 산출 대상 조합 추출 중...');
  const targetGroups = await execSql(calculateBatchSql);
  console.log(`대상 (complex_key, area_bucket) 조합 수: ${targetGroups.length}개`);

  // 상세 calculation 처리
  let insertCount = 0;
  const signalRows = [];

  for (const g of targetGroups) {
    // 해당 (complex_key, area_bucket)의 유효 거래 pool 조회
    const poolSql = `
      WITH max_floors AS (
        SELECT lawd_cd || '|' || jibun AS complex_key, area_bucket, MAX(floor) AS max_floor
        FROM re_deals
        WHERE lawd_cd || '|' || jibun = '${g.complex_key}' AND area_bucket = ${g.area_bucket}
        GROUP BY lawd_cd, jibun, area_bucket
      )
      SELECT d.amount, d.deal_date, d.floor, d.build_year, d.area
      FROM re_deals d
      JOIN max_floors mf ON (d.lawd_cd || '|' || d.jibun) = mf.complex_key AND d.area_bucket = mf.area_bucket
      WHERE (d.lawd_cd || '|' || d.jibun) = '${g.complex_key}' AND d.area_bucket = ${g.area_bucket}
        AND NOT d.is_canceled
        AND (d.dealing_type IS NULL OR d.dealing_type = '중개거래')
        AND d.floor > 1
        AND d.floor < mf.max_floor
        AND d.deal_date >= '${date24MonthsAgoStr}'
      ORDER BY d.deal_date DESC, d.deal_key DESC;
    `;

    const pool = await execSql(poolSql);
    if (!pool || pool.length < 3) continue;

    const latest = pool[0]; // pool[0] 최근 유효 거래

    // baseline = median(pool[1..5].amount) (pool[0] 제외!)
    const baselinePool = pool.slice(1, 6).map(p => p.amount);
    const baselineAmount = calculateMedian(baselinePool);

    if (baselineAmount <= 0) continue;

    const dropRate = (baselineAmount - latest.amount) / baselineAmount;
    const isNewLow = latest.amount <= g.low_amount;

    // 단지별 해제율 계산 (24개월 전체 거래 기준)
    const cancelRateSql = `
      SELECT 
        count(*) AS total,
        count(*) FILTER (WHERE is_canceled) AS canceled
      FROM re_deals
      WHERE lawd_cd || '|' || jibun = '${g.complex_key}' AND deal_date >= '${date24MonthsAgoStr}';
    `;
    const cancelStat = await execSql(cancelRateSql);
    const totalDeals = cancelStat[0]?.total || 1;
    const cancelDeals = cancelStat[0]?.canceled || 0;
    const cancelRate = cancelDeals / totalDeals;

    // 플래그 판정
    const flags = [];
    if (latest.floor <= 1) flags.push('LOW_FLOOR');
    if (g.sample_size < 5) flags.push('SMALL_SAMPLE');
    if (g.same_day_regist_cnt > 0) flags.push('SAME_DAY_REGIST');

    // LEGACY_RENTAL 플래그 (85㎡ 이하 + 2000년 이전 준공)
    if (latest.area <= 85.0 && latest.build_year && latest.build_year <= 2000) {
      flags.push('LEGACY_RENTAL');
    }

    // BULK_PUBLIC 플래그 검사 (동일 지번, 계약일, buyer_type='공공기관' 10건 이상 존재 여부)
    const bulkPublicSql = `
      SELECT count(*) AS cnt
      FROM re_deals
      WHERE lawd_cd || '|' || jibun = '${g.complex_key}'
        AND buyer_type = '공공기관'
      GROUP BY deal_date
      HAVING count(*) >= 10;
    `;
    const bulkRes = await execSql(bulkPublicSql);
    if (bulkRes && bulkRes.length > 0) {
      flags.push('BULK_PUBLIC');
    }

    // 스코어링 계산
    let score = 0;
    if (dropRate >= 0.20) score += 40;
    else if (dropRate >= 0.12) score += 25;
    else if (dropRate >= 0.07) score += 12;

    if (isNewLow) score += 25;

    if (g.density_90d >= 5) score += 20;
    else if (g.density_90d >= 3) score += 10;

    // 감점
    // 해제율 감점 (12.0% 초과 시 -20점)
    if (cancelRate > 0.12) score -= 20;
    // 14일 이내 초단기 등기 감점 (-15점)
    if (g.fast_regist_cnt >= 1) score -= 15;

    // 소표본 보정
    if (g.sample_size < 5) {
      score = Math.round(score * 0.7);
    }

    // 노출 기준: score >= 30
    if (score >= 30) {
      const pyeong = Math.round(latest.area / 3.3058);
      signalRows.push({
        complex_key: g.complex_key,
        area_bucket: g.area_bucket,
        gu: g.gu,
        dong: g.dong,
        apt_name: g.apt_name,
        pyeong: pyeong,
        score: score,
        latest_amount: latest.amount,
        latest_date: latest.deal_date,
        latest_floor: latest.floor,
        baseline_amount: baselineAmount,
        peak_amount: g.peak_amount,
        low_amount: g.low_amount,
        drop_rate: parseFloat(dropRate.toFixed(4)),
        is_new_low: isNewLow,
        density_90d: g.density_90d,
        cancel_rate: parseFloat(cancelRate.toFixed(4)),
        fast_regist_cnt: g.fast_regist_cnt,
        sample_size: g.sample_size,
        flags: flags
      });
    }
  }

  console.log(`3. 조건 충족 신호 산출 완료: ${signalRows.length}개 산출됨`);

  // DB에 Insert
  if (signalRows.length > 0) {
    const values = signalRows.map(s => {
      const flagsArrSql = `ARRAY[${s.flags.map(f => escapeSql(f)).join(',')}]::text[]`;
      return `(${escapeSql(s.complex_key)}, ${s.area_bucket}, ${escapeSql(s.gu)}, ${escapeSql(s.dong)}, ${escapeSql(s.apt_name)}, ${s.pyeong}, ${s.score}, ${s.latest_amount}, ${escapeSql(s.latest_date)}, ${s.latest_floor}, ${s.baseline_amount}, ${s.peak_amount}, ${s.low_amount}, ${s.drop_rate}, ${s.is_new_low}, ${s.density_90d}, ${s.cancel_rate}, ${s.fast_regist_cnt}, ${s.sample_size}, ${flagsArrSql})`;
    });

    const insertSql = `
      INSERT INTO re_signals (
        complex_key, area_bucket, gu, dong, apt_name, pyeong, score, latest_amount,
        latest_date, latest_floor, baseline_amount, peak_amount, low_amount, drop_rate,
        is_new_low, density_90d, cancel_rate, fast_regist_cnt, sample_size, flags
      ) VALUES
      ${values.join(',\n')};
    `;
    await execSql(insertSql);
    insertCount = signalRows.length;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`=== 배치 완결! 총 소요시간: ${durationSec}초, 신호 생성: ${insertCount}개 ===`);

  return {
    totalSignalsCount: insertCount,
    durationSec: durationSec,
    signals: signalRows
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSignalBatch();
}
