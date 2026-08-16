import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data_batches');

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const naturalGroupMap = new Map();

for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  try {
    const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const item of items) {
      const natKey = `${item.lawd_cd}_${item.dong}_${item.jibun}_${item.area}_${item.floor}_${item.deal_date}_${item.amount}`;
      if (!naturalGroupMap.has(natKey)) {
        naturalGroupMap.set(natKey, {
          key: natKey,
          lawd_cd: item.lawd_cd,
          gu: item.gu,
          dong: item.dong,
          jibun: item.jibun,
          apt_name: item.apt_name,
          area: item.area,
          floor: item.floor,
          deal_date: item.deal_date,
          amount: item.amount,
          build_year: item.build_year,
          items: []
        });
      }
      naturalGroupMap.get(natKey).items.push(item);
    }
  } catch (e) {}
}

const highDupGroups = Array.from(naturalGroupMap.values())
  .filter(g => g.items.length >= 11)
  .sort((a, b) => b.items.length - a.items.length);

console.log(`=== 11~22번 중복 그룹 (총 ${highDupGroups.length}개) 정밀 분석 ===\n`);

highDupGroups.forEach((g, idx) => {
  const count = g.items.length;
  console.log(`--- [그룹 ${idx + 1}/${highDupGroups.length}] ${g.gu} ${g.dong} ${g.apt_name} (지번: ${g.jibun}) ---`);
  console.log(`- 사양: ${g.area}㎡ (${Math.round(g.area/3.3058)}평), ${g.floor}층, 준공: ${g.build_year}년`);
  console.log(`- 계약일: ${g.deal_date}, 금액: ${g.amount}만원, 중복 횟수: ${count}회`);

  // 속성 통계
  const dealingTypes = new Set(g.items.map(i => i.dealing_type || '미상'));
  const sellerTypes = new Set(g.items.map(i => i.seller_type || '미상'));
  const buyerTypes = new Set(g.items.map(i => i.buyer_type || '미상'));
  const dongs = new Set(g.items.map(i => i.apt_dong || '빈값'));
  const agents = new Set(g.items.map(i => i.agent_sgg || '미상'));
  const rgstDates = new Set(g.items.map(i => i.registered_at || '미등기'));

  console.log(`  - 거래형태: ${Array.from(dealingTypes).join(', ')}`);
  console.log(`  - 매도자구분: ${Array.from(sellerTypes).join(', ')} | 매수자구분: ${Array.from(buyerTypes).join(', ')}`);
  console.log(`  - 중개사소재지: ${Array.from(agents).join(', ')}`);
  console.log(`  - 동(aptDong) 구분: ${Array.from(dongs).join(', ')}`);
  console.log(`  - 등기일자: ${Array.from(rgstDates).join(', ')}`);
  console.log('');
});

// 상위 5개 그룹 원본 item 전체 저장/출력용
fs.writeFileSync(
  path.join(__dirname, 'top5_high_dup_raw.json'),
  JSON.stringify(highDupGroups.slice(0, 5), null, 2),
  'utf8'
);
