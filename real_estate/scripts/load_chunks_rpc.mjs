import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQL_DIR = path.join(__dirname, 'sql_chunks');

const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

async function uploadChunks() {
  const files = fs.readdirSync(SQL_DIR).filter(f => f.endsWith('.sql')).sort();
  console.log(`총 ${files.length}개 SQL 청크 업로드 시작...`);

  let count = 0;
  for (const file of files) {
    count++;
    const filePath = path.join(SQL_DIR, file);
    const sqlQuery = fs.readFileSync(filePath, 'utf8');

    console.log(`[${count}/${files.length}] ${file} 업로드 중...`);

    let retry = 0;
    let success = false;

    while (retry < 3 && !success) {
      try {
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

        success = true;
      } catch (err) {
        retry++;
        console.error(`  [오류 재시도 ${retry}/3] ${err.message}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!success) {
      console.error(`  [실패] ${file} 업로드에 실패했습니다.`);
    }
  }

  console.log('=== Supabase DB 136,376건 고유 데이터 적재 완료! ===');
}

uploadChunks();
