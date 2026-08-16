import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const naturalKeyMap = new Map();

for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  try {
    const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const item of items) {
      const natKey = `${item.lawd_cd}_${item.jibun}_${item.area}_${item.floor}_${item.deal_date}_${item.amount}`;
      naturalKeyMap.set(natKey, (naturalKeyMap.get(natKey) || 0) + 1);
    }
  } catch (e) {}
}

const dupDist = {};
let totalRaw = 0;
let dupCountSum = 0;

for (const [key, count] of naturalKeyMap.entries()) {
  totalRaw += count;
  if (count > 1) {
    dupDist[count] = (dupDist[count] || 0) + 1;
    dupCountSum += (count - 1);
  }
}

console.log('=== 원본 API JSON 전체 (600개 파일) 자연키 중복 분포 ===');
console.log(`전체 원본 items: ${totalRaw}건`);
console.log(`고유 자연키 개수: ${naturalKeyMap.size}개`);
console.log(`덮어쓰기로 유실되었던 차이 건수: ${dupCountSum}건`);
console.log('\n[중복 횟수별 자연키 그룹 개수 분포]:');
console.table(dupDist);
