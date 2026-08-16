import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectAndSaveSingleMonth, GU_MAP } from '../re_service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROGRESS_FILE = path.join(__dirname, 'progress.json');

const LAWD_CODES = Object.keys(GU_MAP);

function getLast24Months() {
  const months = [];
  const now = new Date(2026, 7, 1); // 2026년 8월 기준
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}${m}`);
  }
  return months.reverse();
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('progress.json 읽기 실패, 새로 시작합니다.');
    }
  }
  return { completed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

async function runInitialLoad() {
  console.log('=== [Phase 1] 서울 25개 구 x 24개월 실거래가 초기 적재 시작 ===');

  const serviceKey = process.env.PUBLIC_DATA_API_KEY || process.env.SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://xeawqnnugytabmaixrcv.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    console.error('오류: PUBLIC_DATA_API_KEY (또는 SERVICE_KEY) 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('오류: SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const months = getLast24Months();
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);

  const totalTasks = LAWD_CODES.length * months.length;
  let doneCount = completedSet.size;

  console.log(`총 ${totalTasks}개 수집 대상 중 이미 완료된 작업: ${doneCount}개`);

  for (const lawdCd of LAWD_CODES) {
    const guName = GU_MAP[lawdCd];
    for (const ym of months) {
      const taskKey = `${lawdCd}_${ym}`;
      if (completedSet.has(taskKey)) {
        continue;
      }

      console.log(`[${doneCount + 1}/${totalTasks}] ${guName}(${lawdCd}) - ${ym} 수집 중...`);

      let retry = 0;
      let success = false;

      while (retry < 3 && !success) {
        try {
          const result = await collectAndSaveSingleMonth(lawdCd, ym, serviceKey, supabaseUrl, serviceRoleKey);
          console.log(`  -> 완료: ${result.total_count}건 수집 및 Upsert`);
          
          completedSet.add(taskKey);
          progress.completed = Array.from(completedSet);
          saveProgress(progress);
          
          success = true;
          doneCount++;
        } catch (err) {
          retry++;
          console.error(`  [오류 발생 - 재시도 ${retry}/3] ${err.message}`);
          await new Promise(r => setTimeout(r, 1000 * retry));
        }
      }

      if (!success) {
        console.error(`  [최종 실패] ${lawdCd} - ${ym} 수집 실패. 다음으로 진행합니다.`);
      }

      // API 연속 호출 차단 예방 350ms 지연
      await new Promise(r => setTimeout(r, 350));
    }
  }

  console.log('=== 서울 25개 구 x 24개월 초기 데이터 적재 완료! ===');
}

runInitialLoad();
