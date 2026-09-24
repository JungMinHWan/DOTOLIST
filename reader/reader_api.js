/**
 * 원서 리더 데이터 계층
 *  - Supabase(Postgres + Storage) 접근
 *  - IndexedDB 로컬 캐시 (EPUB 원본)
 *  - reader-ai Netlify Function 호출
 *
 * 전역 supabaseClient (js/supabase.js) 를 재사용한다.
 */
(function () {
  const BUCKET = 'epubs';
  const AI_URL = '/.netlify/functions/reader-ai';

  function client() {
    // supabase.js 의 const supabaseClient 는 전역 렉시컬 바인딩이다
    // eslint-disable-next-line no-undef
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    if (window.supabaseClient) return window.supabaseClient;
    throw new ReaderError('데이터베이스에 연결할 수 없습니다. 앱을 새로고침해 주세요.');
  }

  class ReaderError extends Error {
    constructor(userMessage, cause) {
      super(userMessage);
      this.userMessage = userMessage;
      this.cause = cause;
    }
  }

  function wrap(msg, error) {
    console.error('[reader]', msg, error);
    if (error instanceof ReaderError) return error;
    const raw = String((error && (error.message || error.error_description)) || '');
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(raw)) {
      return new ReaderError('원서 리더용 테이블이 아직 없습니다. reader/reader_schema.sql 을 Supabase에서 실행해 주세요.', error);
    }
    if (/Bucket not found/i.test(raw)) {
      return new ReaderError('EPUB 저장소(epubs 버킷)가 아직 없습니다. reader/reader_schema.sql 을 실행해 주세요.', error);
    }
    if (/Failed to fetch|NetworkError|network/i.test(raw)) {
      return new ReaderError('네트워크 연결을 확인해 주세요.', error);
    }
    if (/Payload too large|exceeded the maximum allowed size/i.test(raw)) {
      return new ReaderError('파일이 너무 큽니다. 50MB 이하 EPUB만 올릴 수 있습니다.', error);
    }
    return new ReaderError(msg, error);
  }

  async function session() {
    const { data, error } = await client().auth.getSession();
    if (error || !data || !data.session) {
      throw new ReaderError('로그인 정보가 없습니다. 앱을 새로고침해 비밀번호를 입력해 주세요.');
    }
    return data.session;
  }

  async function uid() {
    return (await session()).user.id;
  }

  // ---------------- IndexedDB 캐시 ----------------
  const IDB_NAME = 'grow-reader';
  const IDB_STORE = 'epubs';
  let idbPromise = null;

  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return idbPromise;
  }

  async function cacheGet(key) {
    const db = await idb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function cacheSet(key, value) {
    const db = await idb();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch (e) { resolve(); }
    });
  }

  async function cacheDelete(key) {
    const db = await idb();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch (e) { resolve(); }
    });
  }

  // ---------------- 책 ----------------
  const LIST_COLUMNS = 'id,title,author,cover_path,progress_pct,current_chapter,last_read_at,created_at';

  async function listBooks() {
    try {
      await session();
      const { data, error } = await client().from('reader_books').select(LIST_COLUMNS);
      if (error) throw error;
      const rows = data || [];
      rows.sort((a, b) => {
        const ta = new Date(a.last_read_at || a.created_at || 0).getTime();
        const tb = new Date(b.last_read_at || b.created_at || 0).getTime();
        return tb - ta;
      });
      return rows;
    } catch (e) {
      throw wrap('서재를 불러오지 못했습니다.', e);
    }
  }

  async function coverUrls(paths) {
    const valid = paths.filter(Boolean);
    if (!valid.length) return {};
    try {
      const { data, error } = await client().storage.from(BUCKET).createSignedUrls(valid, 60 * 60);
      if (error) throw error;
      const map = {};
      (data || []).forEach((d) => { if (d && d.signedUrl) map[d.path] = d.signedUrl; });
      return map;
    } catch (e) {
      console.warn('[reader] 표지 URL 생성 실패', e);
      return {};
    }
  }

  async function findByHash(hash) {
    const { data, error } = await client().from('reader_books').select('id,title').eq('file_hash', hash).maybeSingle();
    if (error) throw wrap('중복 확인에 실패했습니다.', error);
    return data;
  }

  async function uploadBook({ id, buffer, coverBlob, meta, hash }) {
    const userId = await uid();
    const base = `${userId}/${id}`;
    const filePath = `${base}/book.epub`;
    const coverPath = coverBlob ? `${base}/cover.jpg` : null;
    const storage = client().storage.from(BUCKET);
    try {
      const up = await storage.upload(filePath, new Blob([buffer], { type: 'application/epub+zip' }), {
        contentType: 'application/epub+zip', upsert: true
      });
      if (up.error) throw up.error;
      if (coverBlob) {
        const cv = await storage.upload(coverPath, coverBlob, { contentType: 'image/jpeg', upsert: true });
        if (cv.error) console.warn('[reader] 표지 업로드 실패', cv.error);
      }
      const row = {
        id,
        title: meta.title || '제목 없음',
        author: meta.author || '',
        language: meta.language || 'en',
        file_path: filePath,
        cover_path: coverPath,
        file_hash: hash,
        file_size: buffer.byteLength,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client().from('reader_books').insert(row);
      if (error) {
        await storage.remove([filePath, coverPath].filter(Boolean));
        throw error;
      }
      await cacheSet(`book:${id}`, { hash, buffer });
      return row;
    } catch (e) {
      throw wrap('EPUB 업로드에 실패했습니다.', e);
    }
  }

  async function getBook(id) {
    const { data, error } = await client().from('reader_books').select('*').eq('id', id).maybeSingle();
    if (error) throw wrap('책 정보를 불러오지 못했습니다.', error);
    if (!data) throw new ReaderError('책을 찾을 수 없습니다. 삭제되었을 수 있습니다.');
    return data;
  }

  // 로컬 캐시 우선, 없으면 Storage 에서 받는다 (해시가 다르면 새로 받음)
  async function loadEpub(book, onProgress) {
    const cached = await cacheGet(`book:${book.id}`);
    if (cached && cached.buffer && cached.hash === book.file_hash) return cached.buffer;
    onProgress && onProgress('책을 내려받는 중입니다');
    try {
      const { data, error } = await client().storage.from(BUCKET).download(book.file_path);
      if (error) throw error;
      const buffer = await data.arrayBuffer();
      await cacheSet(`book:${book.id}`, { hash: book.file_hash, buffer });
      return buffer;
    } catch (e) {
      throw wrap('책 파일을 내려받지 못했습니다.', e);
    }
  }

  async function saveProgress(id, { cfi, pct, chapter }) {
    const patch = { current_cfi: cfi, last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (typeof pct === 'number' && !Number.isNaN(pct)) patch.progress_pct = Math.round(pct * 10000) / 100;
    if (chapter !== undefined) patch.current_chapter = chapter;
    const { error } = await client().from('reader_books').update(patch).eq('id', id);
    if (error) console.warn('[reader] 위치 저장 실패', error);
  }

  async function saveLocations(id, locationsJson) {
    const { error } = await client().from('reader_books').update({ locations_json: locationsJson }).eq('id', id);
    if (error) console.warn('[reader] locations 저장 실패', error);
  }

  async function deleteBook(book) {
    try {
      const { error } = await client().from('reader_books').delete().eq('id', book.id);
      if (error) throw error;
      const paths = [book.file_path, book.cover_path].filter(Boolean);
      if (!paths.length) {
        const userId = await uid();
        paths.push(`${userId}/${book.id}/book.epub`, `${userId}/${book.id}/cover.jpg`);
      }
      await client().storage.from(BUCKET).remove(paths);
      await cacheDelete(`book:${book.id}`);
    } catch (e) {
      throw wrap('책을 삭제하지 못했습니다.', e);
    }
  }

  // ---------------- 학습 문장 ----------------
  async function listSentences(bookId) {
    try {
      const [s, w] = await Promise.all([
        client().from('reader_sentences').select('*').eq('book_id', bookId),
        client().from('reader_words').select('*').eq('book_id', bookId)
      ]);
      if (s.error) throw s.error;
      if (w.error) throw w.error;
      const bySentence = {};
      (w.data || []).forEach((row) => {
        if (!row.sentence_id) return; // 리더에서 따로 찾아본 어휘는 listVocab 에서 다룬다
        (bySentence[row.sentence_id] = bySentence[row.sentence_id] || []).push(row);
      });
      return (s.data || []).map((row) => ({
        ...row,
        words: (bySentence[row.id] || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      }));
    } catch (e) {
      throw wrap('학습 기록을 불러오지 못했습니다.', e);
    }
  }

  async function saveSentence(record, words) {
    try {
      const now = new Date().toISOString();
      const row = {
        book_id: record.book_id,
        spine_index: record.spine_index,
        chapter_href: record.chapter_href,
        chapter_label: record.chapter_label || '',
        cfi_range: record.cfi_range,
        sentence_text: record.sentence_text,
        typed_text: record.typed_text || '',
        typing_mode: record.typing_mode === 'typed' ? 'typed' : 'skipped',
        translation: record.translation || null,
        translation_viewed: Boolean(record.translation_viewed),
        tts_play_count: record.tts_play_count || 0,
        status: 'completed',
        completed_at: record.completed_at || now,
        review_count: record.review_count || 0,
        last_reviewed_at: record.last_reviewed_at || null,
        updated_at: now
      };
      if (record.id) row.id = record.id;
      const { data, error } = await client()
        .from('reader_sentences')
        .upsert(row, { onConflict: 'book_id,cfi_range' })
        .select()
        .single();
      if (error) throw error;

      const del = await client().from('reader_words').delete().eq('sentence_id', data.id);
      if (del.error) throw del.error;
      let savedWords = [];
      if (words && words.length) {
        const rows = words.map((w, i) => ({
          book_id: record.book_id,
          sentence_id: data.id,
          surface: w.surface,
          lemma: w.lemma || null,
          pos: w.pos || null,
          dict_meaning: w.dict_meaning || null,
          context_meaning: w.context_meaning || null,
          created_at: w.created_at || new Date(Date.now() + i).toISOString()
        }));
        const ins = await client().from('reader_words').insert(rows).select();
        if (ins.error) throw ins.error;
        savedWords = ins.data || rows;
      }
      return { ...data, words: savedWords };
    } catch (e) {
      throw wrap('학습 내용을 저장하지 못했습니다.', e);
    }
  }

  async function deleteSentence(id) {
    const { error } = await client().from('reader_sentences').delete().eq('id', id);
    if (error) throw wrap('학습 기록을 삭제하지 못했습니다.', error);
  }

  // ---------------- 리더에서 바로 찾아본 어휘 (문장 학습과 별개) ----------------
  async function listVocab(bookId) {
    try {
      const { data, error } = await client().from('reader_words').select('*').eq('book_id', bookId);
      if (error) throw error;
      return (data || []).filter((r) => !r.sentence_id && r.cfi_range);
    } catch (e) {
      throw wrap('찾아본 어휘를 불러오지 못했습니다.', e);
    }
  }

  async function saveVocab(v) {
    try {
      const row = {
        book_id: v.book_id,
        sentence_id: null,
        cfi_range: v.cfi_range,
        chapter_href: v.chapter_href || null,
        sentence_text: v.sentence_text || null,
        surface: v.surface,
        lemma: v.lemma || null,
        pos: v.pos || null,
        dict_meaning: v.dict_meaning || null,
        context_meaning: v.context_meaning || null
      };
      const { data, error } = await client().from('reader_words').insert(row).select().single();
      if (error) throw error;
      return data;
    } catch (e) {
      const raw = String((e && e.message) || '');
      if (/cfi_range|chapter_href|sentence_text|sentence_id.*null|not-null/i.test(raw)) {
        throw new ReaderError('어휘 저장용 칸이 아직 없습니다. 안내드린 Supabase SQL(어휘 하이라이트용)을 실행해 주세요.', e);
      }
      throw wrap('어휘를 저장하지 못했습니다.', e);
    }
  }

  async function deleteVocab(id) {
    const { error } = await client().from('reader_words').delete().eq('id', id);
    if (error) throw wrap('어휘를 삭제하지 못했습니다.', error);
  }

  // ---------------- 일별 로그 ----------------
  function today() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  async function getDailyLog(bookId) {
    const date = today();
    const { data, error } = await client()
      .from('reader_daily_log').select('*').eq('book_id', bookId).eq('log_date', date).maybeSingle();
    if (error) { console.warn('[reader] 로그 조회 실패', error); }
    return data || {
      log_date: date, book_id: bookId, pages_viewed: 0, sentences_read_est: 0,
      sentences_studied: 0, words_looked_up: 0, translations_viewed: 0, reading_seconds: 0
    };
  }

  async function saveDailyLog(log) {
    const row = { ...log, updated_at: new Date().toISOString() };
    delete row.user_id;
    const { error } = await client().from('reader_daily_log').upsert(row, { onConflict: 'user_id,log_date,book_id' });
    if (error) console.warn('[reader] 로그 저장 실패', error);
  }

  // ---------------- AI ----------------
  async function ai(action, payload) {
    const s = await session();
    let res;
    try {
      res = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ action, ...payload })
      });
    } catch (e) {
      throw new ReaderError('네트워크 연결을 확인해 주세요.', e);
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (!res.ok) {
      if (res.status === 404) throw new ReaderError('AI 기능은 배포된 사이트(Netlify)에서만 동작합니다.');
      throw new ReaderError(data.error || 'AI 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
    return data;
  }

  window.ReaderAPI = {
    ReaderError,
    listBooks, coverUrls, findByHash, uploadBook, getBook, loadEpub,
    saveProgress, saveLocations, deleteBook,
    listSentences, saveSentence, deleteSentence,
    listVocab, saveVocab, deleteVocab,
    getDailyLog, saveDailyLog, today,
    ai
  };
})();
