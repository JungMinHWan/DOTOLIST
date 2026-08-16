import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

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
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

export async function runReload() {
  console.log('=== [Phase 1 재적재] DELETE & INSERT 방식 (deal_ymd & seq 적용) 시작 ===');

  // 1. DDL 업데이트: deal_ymd 컬럼 추가
  console.log('1. DB 스키마 업데이트 (deal_ymd 컬럼 추가 및 TRUNCATE)...');
  const ddlSql = `
    ALTER TABLE re_deals ADD COLUMN IF NOT EXISTS deal_ymd VARCHAR(6);
    CREATE INDEX IF NOT EXISTS idx_re_deals_lawd_ymd ON re_deals(lawd_cd, deal_ymd);
    TRUNCATE re_deals, re_complexes;
  `;
  await execSql(ddlSql);

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`총 ${files.length}개 원본 수집 파일 교체 작업 시작...`);

  let totalInserted = 0;
  let fileIdx = 0;

  for (const file of files) {
    fileIdx++;
    const filePath = path.join(DATA_DIR, file);
    const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (items.length === 0) continue;

    const lawdCd = items[0].lawd_cd;
    const dealYmd = file.split('_')[1].replace('.json', '');

    // 자연키 동일 그룹 내 seq 순번 부여
    const naturalKeySeqMap = new Map();

    const preparedItems = items.map(item => {
      const natKey = `${item.lawd_cd}_${item.jibun}_${item.area}_${item.floor}_${item.deal_date}_${item.amount}`;
      const currentSeq = (naturalKeySeqMap.get(natKey) || 0) + 1;
      naturalKeySeqMap.set(natKey, currentSeq);

      const cryptoStr = `${natKey}_seq${currentSeq}`;
      const dealKey = crypto.createHash('sha1').update(cryptoStr).digest('hex');

      return {
        ...item,
        deal_key: dealKey,
        deal_ymd: dealYmd
      };
    });

    // 2. 해당 (lawd_cd, deal_ymd) DELETE 후 INSERT (통째 교체)
    const deleteSql = `DELETE FROM re_deals WHERE lawd_cd = '${lawdCd}' AND deal_ymd = '${dealYmd}';`;
    await execSql(deleteSql);

    // Complexes INSERT
    const complexValues = [];
    const complexKeySet = new Set();
    for (const item of preparedItems) {
      if (item.jibun) {
        const cKey = `${item.lawd_cd}|${item.jibun}`;
        if (!complexKeySet.has(cKey)) {
          complexKeySet.add(cKey);
          complexValues.push(`(${escapeSql(cKey)}, ${escapeSql(item.lawd_cd)}, ${escapeSql(item.gu)}, ${escapeSql(item.dong)}, ${escapeSql(item.jibun)}, ${escapeSql(item.apt_name)})`);
        }
      }
    }

    if (complexValues.length > 0) {
      const complexSql = `INSERT INTO re_complexes (complex_key, lawd_cd, gu, dong, jibun, display_name) VALUES\n${complexValues.join(',\n')}\nON CONFLICT (complex_key) DO NOTHING;`;
      await execSql(complexSql);
    }

    // Deals INSERT (1000개 단위 청크)
    for (let i = 0; i < preparedItems.length; i += 1000) {
      const chunk = preparedItems.slice(i, i + 1000);
      const dealValues = chunk.map(item => {
        const isCanceledStr = item.is_canceled ? 'true' : 'false';
        const canceledAtStr = item.canceled_at ? escapeSql(item.canceled_at) : 'NULL';
        const registeredAtStr = item.registered_at ? escapeSql(item.registered_at) : 'NULL';
        const aptDongStr = item.apt_dong ? escapeSql(item.apt_dong) : 'NULL';
        const buildYearStr = item.build_year ? item.build_year : 'NULL';
        const sellerTypeStr = item.seller_type ? escapeSql(item.seller_type) : 'NULL';
        const buyerTypeStr = item.buyer_type ? escapeSql(item.buyer_type) : 'NULL';
        const agentSggStr = item.agent_sgg ? escapeSql(item.agent_sgg) : 'NULL';
        const dealingTypeStr = item.dealing_type ? escapeSql(item.dealing_type) : 'NULL';

        return `(${escapeSql(item.deal_key)}, ${escapeSql(item.lawd_cd)}, ${escapeSql(item.deal_ymd)}, ${escapeSql(item.gu)}, ${escapeSql(item.dong)}, ${escapeSql(item.jibun)}, ${escapeSql(item.apt_name)}, ${item.area}, ${item.area_bucket}, ${item.floor}, ${buildYearStr}, ${escapeSql(item.deal_date)}, ${item.amount}, ${dealingTypeStr}, ${isCanceledStr}, ${canceledAtStr}, ${registeredAtStr}, ${aptDongStr}, ${sellerTypeStr}, ${buyerTypeStr}, ${agentSggStr})`;
      });

      const dealsInsertSql = `INSERT INTO re_deals (deal_key, lawd_cd, deal_ymd, gu, dong, jibun, apt_name, area, area_bucket, floor, build_year, deal_date, amount, dealing_type, is_canceled, canceled_at, registered_at, apt_dong, seller_type, buyer_type, agent_sgg) VALUES\n${dealValues.join(',\n')};`;
      await execSql(dealsInsertSql);
    }

    totalInserted += preparedItems.length;
    if (fileIdx % 50 === 0 || fileIdx === files.length) {
      console.log(`[${fileIdx}/${files.length}] 진행 중... 현재 적재된 총 건수: ${totalInserted}건`);
    }
  }

  console.log(`=== 재적재 완료! 총 ${totalInserted}건 (유실 0건) ===`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runReload();
}
