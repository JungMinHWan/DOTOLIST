import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GU_MAP } from '../re_parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

console.log('=== [2025년 11월 데이터 25개 구별 건수 점검] ===');

let totalNov2025 = 0;
const guNovStats = {};

for (const lawdCd of Object.keys(GU_MAP)) {
  const filePath = path.join(DATA_DIR, `${lawdCd}_202511.json`);
  if (fs.existsSync(filePath)) {
    const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    guNovStats[GU_MAP[lawdCd]] = items.length;
    totalNov2025 += items.length;
  }
}

console.log(`2025년 11월 서울 전체 거래 건수: ${totalNov2025}건`);
console.table(guNovStats);
