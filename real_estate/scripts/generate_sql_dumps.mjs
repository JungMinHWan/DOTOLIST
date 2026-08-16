import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeBatches, generateSqlBatches } from './db_loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQL_DIR = path.join(__dirname, 'sql_chunks');

if (!fs.existsSync(SQL_DIR)) {
  fs.mkdirSync(SQL_DIR, { recursive: true });
}

console.log('=== Supabase DB 적재용 SQL 덤프 생성 시작 ===');
const report = analyzeBatches();

console.log(`- 전체 고유 거래: ${report.uniqueDealsCount}건, 단지 마스터: ${report.complexes.length}건`);

// 중복 제거된 고유 deals
const uniqueDealsMap = new Map();
for (const deal of report.allDeals) {
  uniqueDealsMap.set(deal.deal_key, deal);
}
const uniqueDeals = Array.from(uniqueDealsMap.values());

const sqlBatches = generateSqlBatches(uniqueDeals, report.complexes, 1500);

console.log(`- 생성할 SQL 덤프 청크 개수: ${sqlBatches.length}개`);

sqlBatches.forEach((batch, idx) => {
  const filePath = path.join(SQL_DIR, `chunk_${String(idx).padStart(3, '0')}.sql`);
  fs.writeFileSync(filePath, batch.sql, 'utf8');
});

console.log('=== SQL 덤프 파일 생성 완료! ===');
