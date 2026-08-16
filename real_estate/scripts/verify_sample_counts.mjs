import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

const samples = [
  { lawd_cd: '11350', ym: '202510', name: '노원구 2025-10' },
  { lawd_cd: '11350', ym: '202601', name: '노원구 2026-01' },
  { lawd_cd: '11350', ym: '202604', name: '노원구 2026-04' },
  { lawd_cd: '11680', ym: '202510', name: '강남구 2025-10' },
  { lawd_cd: '11680', ym: '202601', name: '강남구 2026-01' },
  { lawd_cd: '11680', ym: '202604', name: '강남구 2026-04' },
  { lawd_cd: '11710', ym: '202510', name: '송파구 2025-10' },
];

console.log('=== [샘플 7개 조합] 원본 JSON 수집 건수 분석 ===');

for (const s of samples) {
  const filePath = path.join(DATA_DIR, `${s.lawd_cd}_${s.ym}.json`);
  if (fs.existsSync(filePath)) {
    const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 자연키 중복 검사
    const naturalKeys = new Set();
    let dupInJson = 0;
    for (const item of items) {
      const natKey = `${item.lawd_cd}_${item.jibun}_${item.area}_${item.floor}_${item.deal_date}_${item.amount}`;
      if (naturalKeys.has(natKey)) {
        dupInJson++;
      } else {
        naturalKeys.add(natKey);
      }
    }
    console.log(`${s.name}: 원본 API items = ${items.length}건, 고유 자연키 = ${naturalKeys.size}건 (동일 사양 중복: ${dupInJson}건)`);
  }
}
