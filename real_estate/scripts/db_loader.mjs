import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

export function analyzeBatches() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  
  let totalDeals = 0;
  const dealKeySet = new Set();
  let duplicateDealKeyCount = 0;

  let cdealTypeCount = 0;
  let rgstDateCount = 0;
  let aptDongCount = 0;

  const guMonthlyStats = {}; // { '노원구': { '2026-07': 637, ... }, ... }
  const guTotalStats = {};    // { '노원구': 15200, ... }
  const monthlyTotalStats = {}; // { '2026-07': 4500, ... }

  const allDeals = [];
  const complexMap = new Map();

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const item of items) {
        totalDeals++;

        if (dealKeySet.has(item.deal_key)) {
          duplicateDealKeyCount++;
        } else {
          dealKeySet.add(item.deal_key);
        }

        if (item.raw_cdeal_type || item.is_canceled) {
          cdealTypeCount++;
        }
        if (item.registered_at) {
          rgstDateCount++;
        }
        if (item.apt_dong) {
          aptDongCount++;
        }

        const gu = item.gu || '미지정';
        const ym = item.deal_date ? item.deal_date.substring(0, 7) : '미상';

        guTotalStats[gu] = (guTotalStats[gu] || 0) + 1;
        monthlyTotalStats[ym] = (monthlyTotalStats[ym] || 0) + 1;

        if (!guMonthlyStats[gu]) guMonthlyStats[gu] = {};
        guMonthlyStats[gu][ym] = (guMonthlyStats[gu][ym] || 0) + 1;

        allDeals.push(item);

        if (item.jibun) {
          const cKey = `${item.lawd_cd}|${item.jibun}`;
          if (!complexMap.has(cKey)) {
            complexMap.set(cKey, {
              complex_key: cKey,
              lawd_cd: item.lawd_cd,
              gu: item.gu,
              dong: item.dong,
              jibun: item.jibun,
              display_name: item.apt_name
            });
          }
        }
      }
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }

  return {
    totalRawDeals: totalDeals,
    uniqueDealsCount: dealKeySet.size,
    duplicateDealKeyCount: duplicateDealKeyCount,
    cdealTypeCount: cdealTypeCount,
    cdealTypeRate: (cdealTypeCount / totalDeals * 100).toFixed(2) + '%',
    rgstDateCount: rgstDateCount,
    rgstDateRate: (rgstDateCount / totalDeals * 100).toFixed(2) + '%',
    aptDongCount: aptDongCount,
    aptDongRate: (aptDongCount / totalDeals * 100).toFixed(2) + '%',
    guTotalStats: guTotalStats,
    monthlyTotalStats: monthlyTotalStats,
    guMonthlyStats: guMonthlyStats,
    allDeals: allDeals,
    complexes: Array.from(complexMap.values())
  };
}

export function generateSqlBatches(deals, complexes, batchSize = 1000) {
  const sqlStatements = [];

  // 1. Complexes INSERT SQL
  const complexValues = complexes.map(c => 
    `(${escapeSqlString(c.complex_key)}, ${escapeSqlString(c.lawd_cd)}, ${escapeSqlString(c.gu)}, ${escapeSqlString(c.dong)}, ${escapeSqlString(c.jibun)}, ${escapeSqlString(c.display_name)})`
  );
  
  for (let i = 0; i < complexValues.length; i += batchSize) {
    const chunk = complexValues.slice(i, i + batchSize);
    const sql = `INSERT INTO re_complexes (complex_key, lawd_cd, gu, dong, jibun, display_name) VALUES\n${chunk.join(',\n')}\nON CONFLICT (complex_key) DO NOTHING;`;
    sqlStatements.push({ type: 'complexes', sql });
  }

  // 2. Deals UPSERT SQL
  const dealValues = deals.map(item => {
    const isCanceledStr = item.is_canceled ? 'true' : 'false';
    const canceledAtStr = item.canceled_at ? escapeSqlString(item.canceled_at) : 'NULL';
    const registeredAtStr = item.registered_at ? escapeSqlString(item.registered_at) : 'NULL';
    const aptDongStr = item.apt_dong ? escapeSqlString(item.apt_dong) : 'NULL';
    const buildYearStr = item.build_year ? item.build_year : 'NULL';
    const sellerTypeStr = item.seller_type ? escapeSqlString(item.seller_type) : 'NULL';
    const buyerTypeStr = item.buyer_type ? escapeSqlString(item.buyer_type) : 'NULL';
    const agentSggStr = item.agent_sgg ? escapeSqlString(item.agent_sgg) : 'NULL';
    const dealingTypeStr = item.dealing_type ? escapeSqlString(item.dealing_type) : 'NULL';

    return `(${escapeSqlString(item.deal_key)}, ${escapeSqlString(item.lawd_cd)}, ${escapeSqlString(item.gu)}, ${escapeSqlString(item.dong)}, ${escapeSqlString(item.jibun)}, ${escapeSqlString(item.apt_name)}, ${item.area}, ${item.area_bucket}, ${item.floor}, ${buildYearStr}, ${escapeSqlString(item.deal_date)}, ${item.amount}, ${dealingTypeStr}, ${isCanceledStr}, ${canceledAtStr}, ${registeredAtStr}, ${aptDongStr}, ${sellerTypeStr}, ${buyerTypeStr}, ${agentSggStr})`;
  });

  for (let i = 0; i < dealValues.length; i += batchSize) {
    const chunk = dealValues.slice(i, i + batchSize);
    const sql = `INSERT INTO re_deals (deal_key, lawd_cd, gu, dong, jibun, apt_name, area, area_bucket, floor, build_year, deal_date, amount, dealing_type, is_canceled, canceled_at, registered_at, apt_dong, seller_type, buyer_type, agent_sgg) VALUES\n${chunk.join(',\n')}\nON CONFLICT (deal_key) DO UPDATE SET is_canceled = EXCLUDED.is_canceled, canceled_at = COALESCE(EXCLUDED.canceled_at, re_deals.canceled_at), registered_at = COALESCE(EXCLUDED.registered_at, re_deals.registered_at), apt_dong = COALESCE(EXCLUDED.apt_dong, re_deals.apt_dong);`;
    sqlStatements.push({ type: 'deals', sql });
  }

  return sqlStatements;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('=== [Phase 1] 수집 데이터 분석 보고서 생성 중... ===');
  const report = analyzeBatches();
  console.log('\n--- 분석 결과 ---');
  console.log(`- 전체 원본 수집 건수: ${report.totalRawDeals}건`);
  console.log(`- 고유 거래 건수 (Unique deal_key): ${report.uniqueDealsCount}건`);
  console.log(`- deal_key 중복 발생 건수: ${report.duplicateDealKeyCount}건`);
  console.log(`- cdealType (해제 정보) 채움 건수: ${report.cdealTypeCount}건 (${report.cdealTypeRate})`);
  console.log(`- rgstDate (등기 일자) 채움 건수: ${report.rgstDateCount}건 (${report.rgstDateRate})`);
  console.log(`- aptDong (아파트 동 정보) 채움 건수: ${report.aptDongCount}건 (${report.aptDongRate})`);
  
  console.log('\n--- 구별 누적 거래 건수 ---');
  console.table(report.guTotalStats);
}
