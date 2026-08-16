import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchPublicDataTrade } from '../re_service.mjs';
import { parseXmlItems, GU_MAP } from '../re_parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data_batches');
const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const SERVICE_KEY = 'GY%2BV1BnKDmURgbv1z5mJB3QnX278JWkGMm9wOMP7ubR3B04uNiTRmYWC5cQBw5wHfOwgT32VRx9oFE4kgcF8qQ%3D%3D';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const LAWD_CODES = Object.keys(GU_MAP);

function getLast24Months() {
  const months = [];
  const baseDate = new Date(2026, 7, 1); // 2026년 8월
  for (let i = 0; i < 24; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}${m}`);
  }
  return months.reverse(); // 202409 ~ 202608
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {}
  }
  return { completed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

async function startBatchFetch() {
  console.log('=== [Phase 1] 서울 25개 구 x 24개월 실거래가 수집 시작 ===');
  const months = getLast24Months();
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);

  const totalTasks = LAWD_CODES.length * months.length;
  let doneCount = completedSet.size;

  console.log(`총 ${totalTasks}개 대상 중 이미 완료: ${doneCount}개`);

  let totalItemsCount = 0;

  for (const lawdCd of LAWD_CODES) {
    const guName = GU_MAP[lawdCd];
    for (const ym of months) {
      const taskKey = `${lawdCd}_${ym}`;
      const batchFilePath = path.join(DATA_DIR, `${taskKey}.json`);

      if (completedSet.has(taskKey) && fs.existsSync(batchFilePath)) {
        try {
          const cached = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));
          totalItemsCount += cached.length;
        } catch (e) {}
        continue;
      }

      console.log(`[${doneCount + 1}/${totalTasks}] ${guName}(${lawdCd}) - ${ym} API 호출...`);

      let retry = 0;
      let success = false;

      while (retry < 3 && !success) {
        try {
          const xmlText = await fetchPublicDataTrade(lawdCd, ym, SERVICE_KEY);
          const items = parseXmlItems(xmlText, lawdCd, ym);
          
          fs.writeFileSync(batchFilePath, JSON.stringify(items, null, 2), 'utf8');
          console.log(`  -> 수집 완료: ${items.length}건`);

          completedSet.add(taskKey);
          progress.completed = Array.from(completedSet);
          saveProgress(progress);

          totalItemsCount += items.length;
          success = true;
          doneCount++;
        } catch (err) {
          retry++;
          console.error(`  [오류 발생 - 재시도 ${retry}/3] ${err.message}`);
          await new Promise(r => setTimeout(r, 1000 * retry));
        }
      }

      if (!success) {
        console.error(`  [최종 실패] ${lawdCd} - ${ym}`);
      }

      // API 350ms 지연
      await new Promise(r => setTimeout(r, 350));
    }
  }

  console.log(`=== 수집 완료! 총 데이터 건수: ${totalItemsCount}건 ===`);
}

startBatchFetch();
