/**
 * 원서 리더 (GROW MENU 히든 메뉴)
 *
 * 화면: 내 서재 → EPUB Reader → 학습모드 → Reader 복귀(하이라이트)
 * 의존: reader_api.js, reader_text.js, reader_tts.js, epub.js + JSZip (처음 열 때 지연 로드)
 */
(function () {
  const API = window.ReaderAPI;
  const T = window.ReaderText;
  const TTS = window.ReaderTTS;
  const XP = window.ReaderXP;

  const LIBS = [
    { test: () => window.JSZip, src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js' },
    { test: () => window.ePub, src: 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js' }
  ];
  const MAX_FILE = 50 * 1024 * 1024;
  const FONT_STEPS = [85, 100, 115, 130, 150, 170];
  const RATES = [0.8, 1.0, 1.2];
  const LONG_SENTENCE_WORDS = 20;
  const PAGE_DWELL_MS = 5000;

  // ---------------- 상태 ----------------
  const S = {
    books: [],
    row: null,          // reader_books 행
    book: null,         // epub.js Book
    rendition: null,
    toc: [],
    sentences: [],      // 학습 기록 (words 포함)
    vocab: [],          // 리더에서 바로 찾아본 어휘 (파란 하이라이트)
    location: null,
    fontIdx: pref('rdr-font-idx', 1),
    rate: pref('rdr-rate', 1.0),
    pending: null,      // 선택 후 학습 대기 중인 문장 {cfi, text, href, spineIndex}
    study: null,
    log: null,
    page: null,         // 현재 페이지 체류 추적 {since, sentences}
    chromeVisible: true,
    savingTimer: null,
    logTimer: null,
    openToken: 0
  };

  function pref(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return def;
      const n = Number(v);
      return Number.isNaN(n) ? def : n;
    } catch (e) { return def; }
  }
  function setPref(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) { /* noop */ } }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function fmtRelative(iso) {
    if (!iso) return '아직 읽지 않음';
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
    if (days <= 0) return '오늘 읽음';
    if (days === 1) return '어제 읽음';
    if (days < 7) return `${days}일 전 읽음`;
    return `${d.getMonth() + 1}월 ${d.getDate()}일 읽음`;
  }

  function withTimeout(promise, ms, message) {
    let t;
    return Promise.race([
      promise,
      new Promise((_, reject) => { t = setTimeout(() => reject(new API.ReaderError(message)), ms); })
    ]).finally(() => clearTimeout(t));
  }

  function userMessage(e, fallback) {
    return (e && e.userMessage) || fallback || '문제가 발생했습니다. 잠시 뒤 다시 시도해 주세요.';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new API.ReaderError('전자책 엔진을 불러오지 못했습니다. 네트워크를 확인해 주세요.'));
      document.head.appendChild(s);
    });
  }

  async function ensureLibs() {
    for (const lib of LIBS) {
      if (!lib.test()) await loadScript(lib.src);
    }
  }

  // ---------------- DOM ----------------
  let root = null;
  const $ = (sel) => root.querySelector(sel);

  function buildDom() {
    if (root) return;
    if (!document.getElementById('rdr-styles-link')) {
      const link = document.createElement('link');
      link.id = 'rdr-styles-link';
      link.rel = 'stylesheet';
      link.href = 'reader/reader.css?v=1.7';
      document.head.appendChild(link);
    }

    root = document.createElement('div');
    root.id = 'rdrRoot';
    root.className = 'rdr rdr-hidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '원서 리더');
    root.innerHTML = `
      <section class="rdr-view rdr-library" data-view="library">
        <header class="rdr-bar">
          <button class="rdr-icon-btn" data-act="close" aria-label="닫기">${icon('close')}</button>
          <div class="rdr-bar-title">내 서재</div>
          <button class="rdr-btn rdr-btn-primary rdr-btn-sm" data-act="add">EPUB 추가</button>
        </header>
        <div class="rdr-scroll">
          <button class="rdr-xp-card rdr-hidden" id="rdrXpCard" data-act="xp"></button>
          <button class="rdr-listen-card rdr-hidden" id="rdrListenCard" data-act="listen"></button>
          <button class="rdr-listen-card rdr-words-card rdr-hidden" id="rdrWordsCard" data-act="words"></button>
          <p class="rdr-lib-summary" id="rdrLibSummary"></p>
          <div class="rdr-shelf" id="rdrShelf"></div>
        </div>
        <input type="file" id="rdrFile" accept=".epub,application/epub+zip" hidden>
      </section>

      <section class="rdr-view rdr-reader" data-view="reader">
        <header class="rdr-bar rdr-reader-top" id="rdrReaderTop">
          <button class="rdr-icon-btn" data-act="to-library" aria-label="서재로">${icon('back')}</button>
          <div class="rdr-bar-title rdr-ellipsis" id="rdrBookTitle"></div>
          <button class="rdr-icon-btn" data-act="toc" aria-label="목차">${icon('toc')}</button>
          <button class="rdr-icon-btn" data-act="font" aria-label="글자 크기">${icon('font')}</button>
        </header>
        <div class="rdr-font-panel rdr-hidden" id="rdrFontPanel">
          <button class="rdr-font-step" data-act="font-down" aria-label="작게">가</button>
          <div class="rdr-font-dots" id="rdrFontDots"></div>
          <button class="rdr-font-step rdr-font-step-lg" data-act="font-up" aria-label="크게">가</button>
        </div>
        <div class="rdr-viewer-wrap">
          <button class="rdr-side rdr-side-prev" data-act="prev" aria-label="이전 페이지">${icon('left')}</button>
          <div class="rdr-viewer" id="rdrViewer"></div>
          <button class="rdr-side rdr-side-next" data-act="next" aria-label="다음 페이지">${icon('right')}</button>
          <div class="rdr-loading rdr-hidden" id="rdrLoading"><div class="rdr-spinner"></div><span id="rdrLoadingText">책을 여는 중입니다</span></div>
        </div>
        <footer class="rdr-reader-bottom">
          <span class="rdr-ellipsis rdr-bottom-side" id="rdrChapter"></span>
          <button class="rdr-xp rdr-hidden" id="rdrXp" data-act="xp" aria-label="경험치 보기"></button>
          <span class="rdr-bottom-side rdr-bottom-right" id="rdrPct"></span>
        </footer>
        <div class="rdr-progress"><div class="rdr-progress-fill" id="rdrProgressFill"></div></div>
        <div class="rdr-selbar rdr-hidden" id="rdrSelbar">
          <div class="rdr-selbar-text" id="rdrSelText"></div>
          <div class="rdr-selbar-actions">
            <button class="rdr-btn rdr-btn-ghost rdr-btn-sm" data-act="sel-cancel">취소</button>
            <button class="rdr-btn rdr-btn-primary rdr-btn-sm" data-act="sel-study" id="rdrSelStudy">학습하기</button>
            <button class="rdr-btn rdr-btn-blue rdr-btn-sm rdr-hidden" data-act="sel-word" id="rdrSelWord">뜻 보기</button>
          </div>
        </div>
      </section>

      <section class="rdr-view rdr-listen" data-view="listen">
        <header class="rdr-bar">
          <button class="rdr-icon-btn" data-act="listen-back" aria-label="서재로">${icon('back')}</button>
          <div class="rdr-bar-title">문장 듣기</div>
        </header>
        <div class="rdr-scroll rdr-listen-body" id="rdrListenBody"></div>
        <footer class="rdr-listen-foot" id="rdrListenFoot"></footer>
      </section>

      <section class="rdr-view rdr-wordpractice" data-view="words">
        <header class="rdr-bar">
          <button class="rdr-icon-btn" data-act="words-back" aria-label="서재로">${icon('back')}</button>
          <div class="rdr-bar-title">단어 쓰기</div>
          <span class="rdr-bar-meta" id="rdrWpCount"></span>
        </header>
        <div class="rdr-wp-progress"><div id="rdrWpProgress"></div></div>
        <div class="rdr-scroll rdr-wp-body" id="rdrWpBody"></div>
      </section>

      <section class="rdr-view rdr-study" data-view="study">
        <header class="rdr-bar">
          <button class="rdr-icon-btn" data-act="study-back" aria-label="책으로">${icon('back')}</button>
          <div class="rdr-bar-title">문장 학습</div>
          <span class="rdr-bar-meta rdr-ellipsis" id="rdrStudyChapter"></span>
        </header>
        <div class="rdr-scroll rdr-study-body" id="rdrStudyBody"></div>
        <footer class="rdr-study-foot">
          <button class="rdr-btn rdr-btn-primary rdr-btn-block" data-act="study-done" id="rdrStudyDone">학습 완료</button>
        </footer>
      </section>

      <div class="rdr-sheet-backdrop rdr-hidden" id="rdrSheetBackdrop"></div>
      <div class="rdr-sheet rdr-hidden" id="rdrSheet" role="dialog"></div>
      <div class="rdr-busy rdr-hidden" id="rdrBusy"><div class="rdr-busy-card"><div class="rdr-spinner"></div><span id="rdrBusyText"></span></div></div>
      <div class="rdr-toast" id="rdrToast" role="status" aria-live="polite"></div>
      <div class="rdr-xp-float" id="rdrXpFloat" aria-hidden="true"></div>
      <div class="rdr-levelup rdr-hidden" id="rdrLevelUp" role="dialog" aria-label="레벨 업">
        <div class="rdr-levelup-card">
          <div class="rdr-levelup-kicker">LEVEL UP</div>
          <div class="rdr-levelup-level" id="rdrLevelUpNum"></div>
          <p class="rdr-levelup-text">원서를 읽으며 한 단계 올랐어요</p>
          <button class="rdr-btn rdr-btn-primary rdr-btn-block" data-act="levelup-close">계속 읽기</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // 앱 전역 스와이프(할 일 탭 전환 등)로 이벤트가 새지 않도록 차단
    ['touchstart', 'touchend', 'touchmove'].forEach((ev) => {
      root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    });
    root.addEventListener('click', onRootClick);
    root.addEventListener('mousedown', (e) => e.stopPropagation());
    root.addEventListener('mouseup', (e) => e.stopPropagation());
    $('#rdrFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) handleFile(f);
    });
    $('#rdrSheetBackdrop').addEventListener('click', closeSheet);
    $('#rdrLevelUp').addEventListener('click', (e) => { if (e.target.id === 'rdrLevelUp') e.currentTarget.classList.add('rdr-hidden'); });
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', debounce(onResize, 250));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { flushProgress(); flushLog(); if (XP) XP.flush(); }
      else if (L.playing) keepAwake(true); // 화면 켜짐 유지는 탭이 다시 보이면 새로 요청해야 한다
    });
    renderFontDots();
    if (XP) XP.onChange(onXpChange);
  }

  function icon(name) {
    const paths = {
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      back: '<path d="M15 5l-7 7 7 7"/>',
      left: '<path d="M15 5l-7 7 7 7"/>',
      right: '<path d="M9 5l7 7-7 7"/>',
      toc: '<path d="M4 6h16M4 12h16M4 18h10"/>',
      font: '<path d="M4 19l5-14 5 14M6 14h6M15 19l3-8 3 8M16 16.5h4"/>',
      more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
      play: '<path d="M8 5v14l11-7z"/>',
      pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
      replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
      x: '<path d="M7 7l10 10M17 7L7 17"/>',
      skipPrev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
      skipNext: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
      pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
      speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
      headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'
    };
    const filled = ['play', 'pause', 'more', 'skipPrev', 'skipNext'].includes(name);
    return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" ${filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${paths[name] || ''}</svg>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function showView(name) {
    root.querySelectorAll('.rdr-view').forEach((v) => v.classList.toggle('rdr-active', v.dataset.view === name));
    root.dataset.view = name;
  }

  function toast(msg, ms = 2600) {
    const el = $('#rdrToast');
    el.textContent = msg;
    el.classList.add('rdr-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('rdr-show'), ms);
  }

  function busy(text) {
    const el = $('#rdrBusy');
    if (text) { $('#rdrBusyText').textContent = text; el.classList.remove('rdr-hidden'); }
    else el.classList.add('rdr-hidden');
  }

  function loading(text) {
    const el = $('#rdrLoading');
    if (text) { $('#rdrLoadingText').textContent = text; el.classList.remove('rdr-hidden'); }
    else el.classList.add('rdr-hidden');
  }

  // ---------------- 시트 (목차 / 학습 기록 / 확인) ----------------
  function openSheet(html, cls = '') {
    const sheet = $('#rdrSheet');
    delete sheet.dataset.vocabId;
    sheet.className = `rdr-sheet ${cls}`;
    sheet.innerHTML = `<div class="rdr-sheet-handle"></div>${html}`;
    $('#rdrSheetBackdrop').classList.remove('rdr-hidden');
    requestAnimationFrame(() => sheet.classList.add('rdr-open'));
    return sheet;
  }

  function closeSheet() {
    const sheet = $('#rdrSheet');
    delete sheet.dataset.vocabId;
    sheet.classList.remove('rdr-open');
    sheet.classList.add('rdr-hidden');
    $('#rdrSheetBackdrop').classList.add('rdr-hidden');
    if (TTS) TTS.stop();
  }

  function confirmSheet({ title, body, ok, danger }) {
    return new Promise((resolve) => {
      const sheet = openSheet(`
        <h3 class="rdr-sheet-title">${esc(title)}</h3>
        ${body ? `<p class="rdr-sheet-text">${esc(body)}</p>` : ''}
        <div class="rdr-sheet-actions">
          <button class="rdr-btn rdr-btn-ghost" data-confirm="no">취소</button>
          <button class="rdr-btn ${danger ? 'rdr-btn-danger' : 'rdr-btn-primary'}" data-confirm="yes">${esc(ok || '확인')}</button>
        </div>`);
      sheet.querySelectorAll('[data-confirm]').forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); closeSheet(); resolve(b.dataset.confirm === 'yes'); };
      });
      $('#rdrSheetBackdrop').onclick = () => { closeSheet(); resolve(false); $('#rdrSheetBackdrop').onclick = null; };
    });
  }

  // ---------------- 열기 / 닫기 ----------------
  function open() {
    buildDom();
    root.classList.remove('rdr-hidden');
    document.documentElement.classList.add('rdr-lock');
    showView('library');
    loadLibrary();
    if (XP && XP.available()) XP.init();
  }

  async function close() {
    if (root.dataset.view === 'study' && !(await leaveStudyOk())) return;
    await closeBook();
    stopListen();
    if (TTS) TTS.stop();
    closeSheet();
    if (XP) XP.flush();
    root.classList.add('rdr-hidden');
    document.documentElement.classList.remove('rdr-lock');
  }

  function onKeyDown(e) {
    if (!root || root.classList.contains('rdr-hidden')) return;
    const view = root.dataset.view;
    if (e.key === 'Escape') {
      if (!$('#rdrSheet').classList.contains('rdr-hidden')) { closeSheet(); return; }
      if (view === 'study') { backFromStudy(); return; }
      if (view === 'listen') { stopListen(); showView('library'); loadLibrary(); return; }
      if (view === 'words') { leaveWords(); return; }
      if (view === 'reader') { backToLibrary(); return; }
      close();
      return;
    }
    if (view === 'reader' && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    }
  }

  function onRootClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const handlers = {
      close: () => close(),
      add: () => $('#rdrFile').click(),
      'open-book': () => openBook(t.dataset.id),
      'book-menu': () => bookMenu(t.dataset.id),
      'to-library': () => backToLibrary(),
      toc: () => openToc(),
      font: () => $('#rdrFontPanel').classList.toggle('rdr-hidden'),
      'font-up': () => setFont(S.fontIdx + 1),
      'font-down': () => setFont(S.fontIdx - 1),
      prev: () => prev(),
      next: () => next(),
      'sel-cancel': () => clearPending(true),
      'sel-study': () => startStudyFromPending(),
      'sel-word': () => lookupVocabFromPending(),
      'study-back': () => backFromStudy(),
      listen: () => openListen(),
      words: () => openWords(),
      'words-back': () => leaveWords(),
      'listen-back': () => { stopListen(); showView('library'); loadLibrary(); },
      'study-done': () => completeStudy(),
      xp: () => openXpSheet(),
      'levelup-close': () => $('#rdrLevelUp').classList.add('rdr-hidden')
    };
    if (handlers[act]) { e.preventDefault(); handlers[act](); }
  }

  // ---------------- 경험치(XP) ----------------
  function onXpChange(evt, v) {
    renderXp(v);
    if (evt && evt.amount) floatXp(evt);
    if (evt && evt.leveled) showLevelUp(evt.level);
  }

  function renderXp(v) {
    if (!root) return;
    const pill = $('#rdrXp');
    const card = $('#rdrXpCard');
    if (!v) { pill.classList.add('rdr-hidden'); card.classList.add('rdr-hidden'); return; }
    const pct = Math.min(100, Math.round((v.xp / v.need) * 100));
    pill.classList.remove('rdr-hidden');
    pill.innerHTML = `<b>Lv.${v.level}</b><span class="rdr-xp-bar"><i style="width:${pct}%"></i></span>`;
    card.classList.remove('rdr-hidden');
    const t = XP.todayXp();
    card.innerHTML = `
      <div class="rdr-xp-card-top">
        <span class="rdr-xp-level">Lv.${v.level}</span>
        <span class="rdr-xp-num">${v.xp} / ${v.need} XP</span>
      </div>
      <span class="rdr-xp-bar rdr-xp-bar-lg"><i style="width:${pct}%"></i></span>
      <span class="rdr-xp-today">${t ? `오늘 원서로 +${t} XP` : '오늘 첫 페이지를 넘겨 보세요'}<span class="rdr-xp-more">자세히</span></span>`;
  }

  function floatXp(evt) {
    const el = $('#rdrXpFloat');
    if (!el) return;
    el.textContent = evt.amount > 1 || evt.label !== XP.RULES.page.label ? `+${evt.amount} XP · ${evt.label}` : `+${evt.amount} XP`;
    el.classList.remove('rdr-show');
    void el.offsetWidth; // 애니메이션 재시작
    el.classList.add('rdr-show');
    const pill = $('#rdrXp');
    if (pill) { pill.classList.remove('rdr-xp-pulse'); void pill.offsetWidth; pill.classList.add('rdr-xp-pulse'); }
  }

  function showLevelUp(level) {
    const box = $('#rdrLevelUp');
    $('#rdrLevelUpNum').textContent = `Lv. ${level}`;
    box.classList.remove('rdr-hidden');
    if (navigator.vibrate) { try { navigator.vibrate([60, 40, 60]); } catch (e) { /* noop */ } }
    if (typeof window.confetti === 'function') {
      const colors = ['#3F7D5A', '#3E6FA3', '#E8DDCA', '#5E9E74', '#F3ECDF'];
      const end = Date.now() + 1400;
      (function frame() {
        window.confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.75 }, colors, zIndex: 6000 });
        window.confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.75 }, colors, zIndex: 6000 });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
    clearTimeout(showLevelUp._t);
    showLevelUp._t = setTimeout(() => box.classList.add('rdr-hidden'), 4500);
  }

  function openXpSheet() {
    const v = XP && XP.view();
    if (!v) { toast('레벨 정보를 불러오는 중입니다.'); return; }
    const R = XP.RULES;
    const rows = [
      [R.page, `하루 ${XP.PAGE_DAILY_CAP} XP까지 · 5초 이상 읽은 페이지`],
      [R.vocab, '책에서 단어를 골라 뜻 보기'],
      [R.sentence, '막힌 문장을 학습하고 완료'],
      [R.typed, '문장을 끝까지 따라 쓰면 추가'],
      [R.selfRead, '해석을 열지 않고 완료하면 추가'],
      [R.paraphrase, '과제에 맞게 바꿔 쓰고 확인받기'],
      [R.paraphraseSame, '바꿔 쓴 문장이 원문과 같은 뜻이면 추가'],
      [R.review, '학습한 문장을 다시 학습'],
      [R.listen, '학습한 문장을 끝까지 듣기 (하루 한 번)'],
      [R.word, '단어 쓰기에서 단어 하나 끝내기'],
      [R.wordMastered, '1·3·7일 복습을 모두 통과한 단어'],
      [R.chapter, '챕터를 끝까지 읽기'],
      [R.book, '책 한 권 완독']
    ];
    const pct = Math.min(100, Math.round((v.xp / v.need) * 100));
    openSheet(`
      <div class="rdr-xp-sheet-head">
        <span class="rdr-xp-level rdr-xp-level-lg">Lv.${v.level}</span>
        <span class="rdr-xp-num">${v.xp} / ${v.need} XP · 다음 레벨까지 ${v.need - v.xp} XP</span>
      </div>
      <span class="rdr-xp-bar rdr-xp-bar-lg"><i style="width:${pct}%"></i></span>
      <p class="rdr-sheet-text" style="margin-top:12px">원서에서 얻은 경험치는 Grow Quest 레벨에 함께 쌓여요. 오늘 원서로 <b>+${XP.todayXp()} XP</b></p>
      <div class="rdr-xp-rules">
        ${rows.map(([r, d]) => `<div class="rdr-xp-rule"><span class="rdr-xp-rule-xp">+${r.xp}</span><span><b>${esc(r.label)}</b><small>${esc(d)}</small></span></div>`).join('')}
      </div>`);
  }

  /** 챕터 완독 / 책 완독 보상 (같은 책·챕터에 한 번씩) */
  function awardProgress(prev, loc) {
    if (!XP || !S.row || !loc || !loc.start) return;
    try {
      if (prev && prev.end && prev.end.displayed && prev.start &&
        loc.start.index === prev.start.index + 1 &&
        prev.end.displayed.page >= prev.end.displayed.total && prev.end.displayed.total >= 2 &&
        chapterFor(prev.start.href) &&
        XP.once(`${S.row.id}-ch-${hrefBase(prev.start.href)}`)) {
        XP.award('chapter', { label: `챕터 완독 · ${chapterFor(prev.start.href)}` });
      }
      if (loc.atEnd && XP.once(`${S.row.id}-book`)) XP.award('book');
    } catch (e) { /* noop */ }
  }

  // ---------------- 오늘의 문장 듣기 ----------------
  const LISTEN_RANGES = [
    { key: 'today', label: '오늘' },
    { key: 'week', label: '최근 7일' },
    { key: 'all', label: '전체' }
  ];
  const L = {
    range: 'today', items: [], idx: 0, playing: false, token: 0, heard: new Set(),
    loading: false, error: null, wake: null,
    opts: Object.assign({ repeat: 1, trans: false, words: false }, (() => {
      try { return JSON.parse(localStorage.getItem('rdr-listen-opts') || '{}'); } catch (e) { return {}; }
    })())
  };

  function sinceFor(range) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (range === 'today') return d.toISOString();
    if (range === 'week') { d.setDate(d.getDate() - 6); return d.toISOString(); }
    return null;
  }

  async function renderListenCard() {
    const card = $('#rdrListenCard');
    if (!card) return;
    if (!S.books.length) { card.classList.add('rdr-hidden'); return; }
    let today = 0;
    let any = 0;
    try {
      today = (await API.listRecentSentences(sinceFor('today'), 60)).length;
      any = today || (await API.listRecentSentences(null, 1)).length;
    } catch (e) { card.classList.add('rdr-hidden'); return; }
    if (!any) { card.classList.add('rdr-hidden'); return; }
    card.classList.remove('rdr-hidden');
    card.innerHTML = `
      <span class="rdr-listen-card-icon">${icon('headphones')}</span>
      <span class="rdr-listen-card-text">
        <b>오늘의 문장 듣기</b>
        <small>${today ? `오늘 학습한 문장 ${today}개 · 이동 중에 들어 보세요` : '오늘은 아직 학습한 문장이 없어요 · 최근 문장 듣기'}</small>
      </span>
      <span class="rdr-listen-card-go">${icon('play')}</span>`;
    card.dataset.today = String(today);
  }

  async function openListen(range) {
    const card = $('#rdrListenCard');
    const r = range || (card && card.dataset.today !== '0' ? 'today' : 'week');
    showView('listen');
    await loadListen(r);
  }

  async function loadListen(range) {
    stopListen();
    L.range = range;
    L.loading = true;
    L.error = null;
    L.items = [];
    L.idx = 0;
    L.heard = new Set();
    renderListen();
    try {
      L.items = await API.listRecentSentences(sinceFor(range), 60);
    } catch (e) {
      L.error = userMessage(e);
    }
    L.loading = false;
    renderListen();
  }

  function bookTitle(id) {
    const b = S.books.find((x) => x.id === id);
    return b ? b.title : '';
  }

  function estimateMinutes() {
    const words = L.items.reduce((n, it) => n + T.wordCount(it.sentence_text), 0) * L.opts.repeat;
    const extra = L.items.length * 2 + (L.opts.trans ? L.items.length * 4 : 0) +
      (L.opts.words ? L.items.reduce((n, it) => n + it.words.length * 3, 0) : 0);
    const sec = words / (2.4 * S.rate) + extra;
    return Math.max(1, Math.round(sec / 60));
  }

  function renderListen() {
    const body = $('#rdrListenBody');
    const foot = $('#rdrListenFoot');
    if (!body) return;
    const ttsOk = TTS && TTS.isSupported();
    const hasKo = ttsOk && TTS.hasKorean();
    const tabs = `<div class="rdr-seg rdr-listen-tabs" role="tablist">${LISTEN_RANGES.map((r) =>
      `<button class="${r.key === L.range ? 'on' : ''}" data-lrange="${r.key}">${r.label}</button>`).join('')}</div>`;

    if (L.loading) {
      body.innerHTML = `${tabs}<div class="rdr-shelf-loading"><div class="rdr-spinner"></div></div>`;
      foot.innerHTML = '';
      bindListenTabs();
      return;
    }
    if (L.error || !L.items.length) {
      const next = L.range === 'today' ? 'week' : L.range === 'week' ? 'all' : null;
      body.innerHTML = `${tabs}
        <div class="rdr-empty">
          <p class="rdr-empty-title">${L.error ? esc(L.error) : (L.range === 'today' ? '오늘 학습한 문장이 없어요' : '이 기간에 학습한 문장이 없어요')}</p>
          <p class="rdr-empty-sub">책을 읽다가 막힌 문장을 학습하면 여기에 모여요.</p>
          ${next ? `<button class="rdr-btn rdr-btn-ghost" data-lrange="${next}">${next === 'week' ? '최근 7일 문장 듣기' : '전체 문장 듣기'}</button>` : ''}
        </div>`;
      foot.innerHTML = '';
      bindListenTabs();
      return;
    }

    const cur = L.items[L.idx];
    const wordSet = new Set((cur.words || []).map((w) => String(w.surface).toLowerCase()));
    const sentenceHtml = T.tokenize(cur.sentence_text).map((tk) => tk.word && wordSet.has(tk.text.toLowerCase())
      ? `<span class="rdr-listen-w">${esc(tk.text)}</span>` : esc(tk.text)).join('');
    body.innerHTML = `
      ${tabs}
      <p class="rdr-listen-summary">문장 ${L.items.length}개 · 약 ${estimateMinutes()}분${L.heard.size ? ` · ${L.heard.size}개 들음` : ''}</p>
      <div class="rdr-card rdr-listen-now">
        <div class="rdr-listen-meta">${esc(bookTitle(cur.book_id))}${cur.chapter_label ? ` · ${esc(cur.chapter_label)}` : ''} · ${esc(fmtDate(cur.completed_at))}</div>
        <p class="rdr-listen-sentence">${sentenceHtml}</p>
        ${L.opts.trans && cur.translation ? `<p class="rdr-listen-trans">${esc(cur.translation)}</p>` : ''}
        ${L.opts.words && cur.words.length ? `<div class="rdr-listen-words">${cur.words.map((w) =>
          `<span><b>${esc(w.lemma || w.surface)}</b> ${esc(w.context_meaning || w.dict_meaning || '')}</span>`).join('')}</div>` : ''}
      </div>
      ${ttsOk ? `
      <div class="rdr-card rdr-listen-opts">
        <div class="rdr-listen-toggles">
          <button class="rdr-toggle ${L.opts.repeat === 2 ? 'on' : ''}" data-lopt="repeat">문장마다 2번</button>
          <button class="rdr-toggle ${L.opts.trans ? 'on' : ''}" data-lopt="trans" ${hasKo ? '' : 'disabled'}>해석도 듣기</button>
          <button class="rdr-toggle ${L.opts.words ? 'on' : ''}" data-lopt="words" ${hasKo ? '' : 'disabled'}>단어 뜻도 듣기</button>
        </div>
        ${hasKo ? '' : '<p class="rdr-hint">이 기기에 한국어 음성이 없어 해석·단어 뜻은 들을 수 없어요.</p>'}
        <div class="rdr-tts-opts">
          <div class="rdr-seg" aria-label="읽기 속도">${RATES.map((r) => `<button class="${r === S.rate ? 'on' : ''}" data-lrate="${r}">${r.toFixed(1)}x</button>`).join('')}</div>
          <div class="rdr-seg" aria-label="목소리">
            <button class="${TTS.getGender() === 'female' ? 'on' : ''}" data-lvoice="female">여성</button>
            <button class="${TTS.getGender() === 'male' ? 'on' : ''}" data-lvoice="male">남성</button>
          </div>
        </div>
      </div>` : '<p class="rdr-hint">이 브라우저는 음성 읽기를 지원하지 않습니다.</p>'}
      <div class="rdr-listen-list">
        ${L.items.map((it, i) => `<button class="rdr-listen-item ${i === L.idx ? 'on' : ''} ${L.heard.has(i) ? 'heard' : ''}" data-litem="${i}">
          <span class="rdr-listen-num">${i + 1}</span><span class="rdr-listen-text">${esc(it.sentence_text)}</span></button>`).join('')}
      </div>`;
    foot.innerHTML = ttsOk ? `
      <div class="rdr-listen-controls">
        <button class="rdr-icon-btn rdr-listen-skip" data-lctl="prev" aria-label="이전 문장" ${L.idx === 0 ? 'disabled' : ''}>${icon('skipPrev')}</button>
        <button class="rdr-listen-play" data-lctl="play" aria-label="${L.playing ? '멈춤' : '재생'}">${icon(L.playing ? 'pause' : 'play')}</button>
        <button class="rdr-icon-btn rdr-listen-skip" data-lctl="next" aria-label="다음 문장" ${L.idx >= L.items.length - 1 ? 'disabled' : ''}>${icon('skipNext')}</button>
      </div>
      <div class="rdr-listen-pos">${L.idx + 1} / ${L.items.length}</div>` : '';

    bindListenTabs();
    body.querySelectorAll('[data-lopt]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.lopt;
        if (k === 'repeat') L.opts.repeat = L.opts.repeat === 2 ? 1 : 2;
        else L.opts[k] = !L.opts[k];
        try { localStorage.setItem('rdr-listen-opts', JSON.stringify(L.opts)); } catch (e) { /* noop */ }
        renderListen();
      };
    });
    body.querySelectorAll('[data-lrate]').forEach((b) => {
      b.onclick = () => { S.rate = Number(b.dataset.lrate); setPref('rdr-rate', S.rate); renderListen(); };
    });
    body.querySelectorAll('[data-lvoice]').forEach((b) => {
      b.onclick = () => {
        TTS.setGender(b.dataset.lvoice);
        if (!TTS.hasGender(b.dataset.lvoice)) toast(`이 기기에는 ${b.dataset.lvoice === 'male' ? '남성' : '여성'} 영어 음성이 없어 톤을 바꿔 대신 읽어요.`, 3200);
        renderListen();
      };
    });
    body.querySelectorAll('[data-litem]').forEach((b) => {
      b.onclick = () => { L.idx = Number(b.dataset.litem); playListen(); };
    });
    foot.querySelectorAll('[data-lctl]').forEach((b) => {
      b.onclick = () => {
        const c = b.dataset.lctl;
        if (c === 'play') { if (L.playing) pauseListen(); else playListen(); }
        if (c === 'prev' && L.idx > 0) { L.idx -= 1; L.playing ? playListen() : renderListen(); }
        if (c === 'next' && L.idx < L.items.length - 1) { L.idx += 1; L.playing ? playListen() : renderListen(); }
      };
    });
    const on = body.querySelector('.rdr-listen-item.on');
    if (on && L.playing) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function bindListenTabs() {
    root.querySelectorAll('#rdrListenBody [data-lrange]').forEach((b) => {
      b.onclick = () => loadListen(b.dataset.lrange);
    });
  }

  function stepsFor(it) {
    const steps = [];
    for (let r = 0; r < L.opts.repeat; r++) steps.push({ lang: 'en', text: it.sentence_text });
    if (L.opts.words) {
      (it.words || []).forEach((w) => {
        const mean = w.context_meaning || w.dict_meaning;
        if (!mean) return;
        steps.push({ lang: 'en', text: w.lemma || w.surface });
        steps.push({ lang: 'ko', text: mean });
      });
    }
    if (L.opts.trans && it.translation) steps.push({ lang: 'ko', text: it.translation });
    return steps;
  }

  async function keepAwake(on) {
    try {
      if (on && !L.wake && navigator.wakeLock) {
        L.wake = await navigator.wakeLock.request('screen');
        L.wake.addEventListener('release', () => { L.wake = null; });
      } else if (!on && L.wake) {
        await L.wake.release();
        L.wake = null;
      }
    } catch (e) { L.wake = null; }
  }

  function playListen() {
    if (!L.items.length || !TTS) return;
    const token = ++L.token;
    L.playing = true;
    keepAwake(true);
    renderListen();
    const it = L.items[L.idx];
    const steps = stepsFor(it);
    let k = 0;
    const nextStep = () => {
      if (token !== L.token) return;
      if (k >= steps.length) { setTimeout(() => finishItem(token), 1400); return; }
      const st = steps[k++];
      TTS.speak(st.text, {
        rate: st.lang === 'ko' ? 1.0 : S.rate,
        lang: st.lang,
        onend: () => { if (token === L.token) setTimeout(nextStep, st.lang === 'en' ? 700 : 500); },
        onerror: () => { if (token === L.token) { pauseListen(); toast('음성을 재생하지 못했습니다.'); } }
      });
    };
    nextStep();
  }

  function finishItem(token) {
    if (token !== L.token) return;
    L.heard.add(L.idx);
    if (L.idx < L.items.length - 1) {
      L.idx += 1;
      playListen();
      return;
    }
    // 끝까지 들음 → 다시 누르면 처음부터
    L.playing = false;
    L.token++;
    L.idx = 0;
    keepAwake(false);
    renderListen();
    if (XP && XP.available() && L.heard.size >= Math.min(3, L.items.length) && XP.once(`listen-${API.today()}`)) {
      XP.award('listen');
    }
    toast(`문장 ${L.items.length}개를 다 들었어요`);
  }

  function pauseListen() {
    L.token++;
    L.playing = false;
    if (TTS) TTS.stop();
    keepAwake(false);
    renderListen();
  }

  function stopListen() {
    if (!L.playing) return;
    L.token++;
    L.playing = false;
    if (TTS) TTS.stop();
    keepAwake(false);
  }

  // ---------------- 단어 쓰기 ----------------
  // 새 단어: 보면서 1번 → 가리고 2번 → 뜻 떠올리기 / 복습 단어: 가리고 1번 → 뜻 떠올리기
  // 맞히면 다음 복습: 1일 → 3일 → 7일째, 7일째까지 통과하면 '외운 단어'. 틀리면 내일 처음부터.
  const WP_INTERVALS = [1, 2, 4];
  const W = { cards: [], idx: 0, stepIdx: 0, steps: [], card: null, info: null, loading: false, error: null, done: false, results: [], fix: false, reveal: false, typed: '', saveWarned: false };

  function wpNorm(s) {
    return String(s || '').trim().toLowerCase().replace(/[‘’]/g, "'");
  }

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function wpCloze(card) {
    const sentence = card.sentence || '';
    for (const w of [card.surface, card.lemma]) {
      if (!w) continue;
      const m = sentence.match(new RegExp(`(^|[^A-Za-z])(${escRe(w)})(?![A-Za-z])`, 'i'));
      if (m) {
        const start = m.index + m[1].length;
        return { before: sentence.slice(0, start), word: m[2], after: sentence.slice(start + m[2].length) };
      }
    }
    return null;
  }

  async function renderWordsCard() {
    const card = $('#rdrWordsCard');
    if (!card) return;
    let info;
    try { info = await API.listWordCards(); } catch (e) { card.classList.add('rdr-hidden'); return; }
    if (!info.total) { card.classList.add('rdr-hidden'); return; }
    card.classList.remove('rdr-hidden');
    const n = info.due.length;
    card.innerHTML = `
      <span class="rdr-listen-card-icon">${icon('pen')}</span>
      <span class="rdr-listen-card-text">
        <b>단어 쓰기</b>
        <small>${n ? `오늘 쓸 단어 ${n}개 · 복습 ${Math.min(info.reviewCount, n)} · 새 단어 ${Math.max(0, n - Math.min(info.reviewCount, n))}` : `오늘 쓸 단어를 다 했어요 · 외운 단어 ${info.mastered}개`}</small>
      </span>
      <span class="rdr-listen-card-go">${icon('play')}</span>`;
  }

  async function openWords() {
    showView('words');
    W.loading = true; W.error = null; W.done = false; W.results = []; W.idx = 0;
    renderWp();
    try {
      W.info = await API.listWordCards();
      W.cards = W.info.due;
    } catch (e) { W.error = userMessage(e); }
    W.loading = false;
    if (W.cards.length) startWpCard();
    renderWp();
  }

  function leaveWords() {
    if (TTS) TTS.stop();
    showView('library');
    loadLibrary();
  }

  function startWpCard() {
    const c = W.cards[W.idx];
    W.card = c;
    W.card.failed = false;
    W.steps = c.stage === 0
      ? [{ t: 'copy' }, { t: 'recall', n: 1, of: 2 }, { t: 'recall', n: 2, of: 2 }, { t: 'meaning' }]
      : [{ t: 'recall', n: 1, of: 1 }, { t: 'meaning' }];
    W.stepIdx = 0;
    W.fix = false; W.reveal = false; W.typed = '';
  }

  function wpTarget(c) {
    const cz = wpCloze(c);
    return cz ? cz.word : c.surface;
  }

  function renderWp() {
    const body = $('#rdrWpBody');
    const count = $('#rdrWpCount');
    const bar = $('#rdrWpProgress');
    if (!body) return;
    if (W.loading) { body.innerHTML = '<div class="rdr-shelf-loading"><div class="rdr-spinner"></div></div>'; count.textContent = ''; bar.style.width = '0%'; return; }
    if (W.error) { body.innerHTML = `<div class="rdr-empty"><p class="rdr-empty-title">${esc(W.error)}</p></div>`; return; }
    if (!W.cards.length) {
      const next = W.info && W.info.nextDue ? new Date(W.info.nextDue) : null;
      body.innerHTML = `<div class="rdr-empty">
        <div class="rdr-empty-book"></div>
        <p class="rdr-empty-title">오늘 쓸 단어가 없어요</p>
        <p class="rdr-empty-sub">책에서 단어 뜻을 찾아보면 여기에 쌓여요.${next ? `<br>다음 복습: ${next.getMonth() + 1}월 ${next.getDate()}일` : ''}${W.info && W.info.mastered ? `<br>지금까지 외운 단어 ${W.info.mastered}개` : ''}</p>
        <button class="rdr-btn rdr-btn-ghost" data-act="words-back">서재로</button></div>`;
      count.textContent = ''; bar.style.width = '0%';
      return;
    }
    if (W.done) { renderWpSummary(); return; }

    const c = W.card;
    const step = W.steps[W.stepIdx];
    count.textContent = `${W.idx + 1} / ${W.cards.length}`;
    bar.style.width = `${Math.round((W.idx / W.cards.length) * 100)}%`;
    const cz = wpCloze(c);
    const target = wpTarget(c);
    const meaningHtml = `
      <div class="rdr-wp-meaning">
        ${c.pos ? `<span class="rdr-pos">${esc(c.pos)}</span>` : ''}
        <span>${esc(c.dict_meaning || '')}</span>
      </div>
      ${c.context_meaning ? `<div class="rdr-word-ctx"><span>이 문장에서</span>${esc(c.context_meaning)}</div>` : ''}`;
    const sentenceHtml = (showWord) => cz
      ? `<p class="rdr-wp-sentence">${esc(cz.before)}${showWord ? `<b class="rdr-wp-shown">${esc(cz.word)}</b>` : `<span class="rdr-wp-blank">${'_'.repeat(Math.max(4, Math.min(10, cz.word.length)))}</span>`}${esc(cz.after)}</p>`
      : (c.sentence ? `<p class="rdr-wp-sentence">${esc(c.sentence)}</p>` : '');
    const stepLabel = step.t === 'copy' ? '보면서 따라 쓰기' : step.t === 'recall' ? `가리고 쓰기${step.of > 1 ? ` ${step.n}/${step.of}` : ''}` : '뜻 떠올리기';
    const badge = c.stage === 0 ? '<span class="rdr-chip rdr-chip-green">새 단어</span>' : `<span class="rdr-chip">복습 ${c.stage}회차</span>`;

    let main = '';
    if (step.t === 'copy' || step.t === 'recall') {
      const showAnswer = step.t === 'copy' || W.fix;
      main = `
        ${step.t === 'copy' ? `<div class="rdr-wp-word">${esc(target)}</div>` : ''}
        ${meaningHtml}
        ${sentenceHtml(step.t === 'copy')}
        ${W.fix ? `<div class="rdr-wp-fix">정답은 <b>${esc(target)}</b> 이에요. 한 번 따라 써 보세요.</div>` : ''}
        <form class="rdr-wp-form" id="rdrWpForm" autocomplete="off">
          <input class="rdr-input rdr-wp-input" id="rdrWpInput" value="${esc(W.typed)}" placeholder="${showAnswer ? '위 단어를 그대로 써 보세요' : '빈칸에 들어갈 단어'}" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
          <button class="rdr-btn rdr-btn-primary" type="submit">확인</button>
        </form>
        <div class="rdr-wp-live" id="rdrWpLive"></div>
        <div class="rdr-wp-tools">
          <button class="rdr-link-btn" id="rdrWpSay">${icon('speaker')}<span>발음 듣기</span></button>
          ${step.t === 'recall' && !W.fix ? '<button class="rdr-link-btn" id="rdrWpGiveup">모르겠어요</button>' : ''}
        </div>`;
    } else {
      main = `
        <div class="rdr-wp-word">${esc(c.lemma || c.surface)}</div>
        ${cz ? `<p class="rdr-wp-sentence">${esc(cz.before)}<b class="rdr-wp-shown">${esc(cz.word)}</b>${esc(cz.after)}</p>` : ''}
        ${W.reveal ? `
          <div class="rdr-wp-answer">${meaningHtml}</div>
          ${W.typed.trim() ? `<p class="rdr-hint">내가 쓴 뜻: ${esc(W.typed)}</p>` : ''}
          <div class="rdr-sheet-actions">
            <button class="rdr-btn rdr-btn-ghost" id="rdrWpWrong">틀렸어요</button>
            <button class="rdr-btn rdr-btn-primary ${wpMeaningMatch(c, W.typed) ? 'rdr-wp-suggest' : ''}" id="rdrWpRight">맞았어요</button>
          </div>` : `
          <textarea class="rdr-input rdr-textarea rdr-wp-meaning-input" id="rdrWpMeaning" rows="2" placeholder="이 단어의 뜻을 한글로 적어 보세요">${esc(W.typed)}</textarea>
          <button class="rdr-btn rdr-btn-blue rdr-btn-block" id="rdrWpReveal">정답 보기</button>`}
        <div class="rdr-wp-tools"><button class="rdr-link-btn" id="rdrWpSay">${icon('speaker')}<span>발음 듣기</span></button></div>`;
    }

    body.innerHTML = `
      <div class="rdr-card rdr-wp-card">
        <div class="rdr-wp-top">${badge}<span class="rdr-wp-step">${stepLabel}</span></div>
        ${main}
      </div>`;

    const say = $('#rdrWpSay');
    if (say) say.onclick = () => { if (TTS && TTS.isSupported()) TTS.speak(step.t === 'meaning' ? (c.lemma || c.surface) : target, { rate: 0.9 }); };
    const form = $('#rdrWpForm');
    if (form) {
      const input = $('#rdrWpInput');
      const live = () => {
        W.typed = input.value;
        if (step.t === 'copy' || W.fix) {
          const cmp = T.compareTyping(target, input.value);
          $('#rdrWpLive').innerHTML = cmp.chars.map((ch) => `<span class="rdr-c-${ch.state}">${esc(ch.ch)}</span>`).join('');
        } else {
          $('#rdrWpLive').innerHTML = '';
        }
      };
      input.addEventListener('input', live);
      live();
      form.onsubmit = (e) => { e.preventDefault(); wpSubmitSpelling(input.value); };
      const give = $('#rdrWpGiveup');
      if (give) give.onclick = () => wpSubmitSpelling('');
      try { input.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    const mean = $('#rdrWpMeaning');
    if (mean) mean.addEventListener('input', () => { W.typed = mean.value; });
    const reveal = $('#rdrWpReveal');
    if (reveal) reveal.onclick = () => { W.reveal = true; renderWp(); };
    const right = $('#rdrWpRight');
    if (right) right.onclick = () => finishWpCard(true);
    const wrong = $('#rdrWpWrong');
    if (wrong) wrong.onclick = () => finishWpCard(false);
  }

  function wpMeaningMatch(c, typed) {
    const t = String(typed || '').replace(/\s+/g, '');
    if (t.length < 2) return false;
    const terms = `${c.dict_meaning || ''},${c.context_meaning || ''}`.split(/[,;·/]/).map((x) => x.replace(/\s+/g, '')).filter((x) => x.length >= 2);
    return terms.some((x) => x.includes(t) || t.includes(x) || (x.length >= 3 && t.includes(x.slice(0, 2))));
  }

  function wpSubmitSpelling(value) {
    const c = W.card;
    const step = W.steps[W.stepIdx];
    const target = wpTarget(c);
    const ok = wpNorm(value) === wpNorm(target) || (step.t === 'recall' && !W.fix && wpNorm(value) === wpNorm(c.lemma));
    if (step.t === 'copy' || W.fix) {
      if (!ok) { toast('철자를 한 번 더 확인해 보세요'); return; }
      W.fix = false;
      nextWpStep();
      return;
    }
    // 가리고 쓰기
    if (ok) {
      flashWp(true);
      setTimeout(nextWpStep, 450);
    } else {
      c.failed = true;
      W.fix = true;
      W.typed = '';
      flashWp(false);
      renderWp();
    }
  }

  function flashWp(ok) {
    const card = root.querySelector('.rdr-wp-card');
    if (!card) return;
    card.classList.remove('rdr-wp-ok', 'rdr-wp-no');
    void card.offsetWidth;
    card.classList.add(ok ? 'rdr-wp-ok' : 'rdr-wp-no');
  }

  function nextWpStep() {
    W.stepIdx += 1;
    W.typed = '';
    W.reveal = false;
    renderWp();
  }

  async function finishWpCard(meaningOk) {
    const c = W.card;
    const ok = meaningOk && !c.failed;
    const now = new Date();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    let stage, next;
    if (ok) {
      stage = (c.stage || 0) + 1;
      next = stage >= API.WORD_MASTERED_STAGE ? null : new Date(midnight.getTime() + WP_INTERVALS[stage - 1] * 86400000).toISOString();
    } else {
      stage = 0;
      next = new Date(midnight.getTime() + 86400000).toISOString();
    }
    const mastered = ok && stage >= API.WORD_MASTERED_STAGE;
    W.results.push({ card: c, ok, mastered, next });
    try {
      await API.saveWordReview(c.ids, {
        review_stage: stage,
        next_review_at: next,
        last_reviewed_at: now.toISOString(),
        correct_count: (c.correct_count || 0) + (ok ? 1 : 0),
        wrong_count: (c.wrong_count || 0) + (ok ? 0 : 1)
      });
    } catch (e) {
      if (!W.saveWarned) { toast(userMessage(e), 4000); W.saveWarned = true; }
    }
    if (XP && XP.available()) {
      XP.award('word', { label: `단어 쓰기 · ${c.lemma || c.surface}` });
      if (mastered) XP.award('wordMastered', { label: `외운 단어 · ${c.lemma || c.surface}` });
    }
    if (W.idx < W.cards.length - 1) {
      W.idx += 1;
      startWpCard();
    } else {
      W.done = true;
    }
    renderWp();
  }

  function renderWpSummary() {
    const body = $('#rdrWpBody');
    $('#rdrWpCount').textContent = '';
    $('#rdrWpProgress').style.width = '100%';
    const ok = W.results.filter((r) => r.ok).length;
    const again = W.results.filter((r) => !r.ok);
    const mastered = W.results.filter((r) => r.mastered);
    body.innerHTML = `
      <div class="rdr-card rdr-wp-summary">
        <div class="rdr-levelup-kicker">오늘의 단어 쓰기 완료</div>
        <div class="rdr-wp-sum-num">${ok} / ${W.results.length}</div>
        <p class="rdr-hint">맞힌 단어는 다음 복습 날짜로 넘어가고, 틀린 단어는 내일 다시 나와요.</p>
        ${mastered.length ? `<div class="rdr-wp-sum-row"><span class="rdr-chip rdr-chip-green">외운 단어</span>${mastered.map((r) => esc(r.card.lemma || r.card.surface)).join(', ')}</div>` : ''}
        ${again.length ? `<div class="rdr-wp-sum-row"><span class="rdr-chip">내일 다시</span>${again.map((r) => esc(r.card.lemma || r.card.surface)).join(', ')}</div>` : ''}
        <button class="rdr-btn rdr-btn-primary rdr-btn-block" data-act="words-back">서재로</button>
      </div>`;
  }

  // ---------------- 서재 ----------------
  async function loadLibrary() {
    const shelf = $('#rdrShelf');
    shelf.innerHTML = '<div class="rdr-shelf-loading"><div class="rdr-spinner"></div></div>';
    $('#rdrLibSummary').textContent = '';
    try {
      S.books = await API.listBooks();
      const urls = await API.coverUrls(S.books.map((b) => b.cover_path));
      renderShelf(urls);
      renderListenCard();
      renderWordsCard();
    } catch (e) {
      shelf.innerHTML = `<div class="rdr-empty"><p>${esc(userMessage(e))}</p>
        <button class="rdr-btn rdr-btn-ghost" id="rdrRetryLib">다시 시도</button></div>`;
      const b = $('#rdrRetryLib');
      if (b) b.onclick = loadLibrary;
    }
  }

  function renderShelf(urls) {
    const shelf = $('#rdrShelf');
    const n = S.books.length;
    $('#rdrLibSummary').textContent = n ? `책 ${n}권` : '';
    if (!n) {
      shelf.innerHTML = `
        <div class="rdr-empty">
          <div class="rdr-empty-book"></div>
          <p class="rdr-empty-title">서재가 비어 있어요</p>
          <p class="rdr-empty-sub">DRM이 없는 EPUB 파일을 추가하면<br>바로 읽기 시작할 수 있어요.</p>
          <button class="rdr-btn rdr-btn-primary" data-act="add">EPUB 추가</button>
        </div>`;
      return;
    }
    shelf.innerHTML = S.books.map((b) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(b.progress_pct) || 0)));
      const cover = urls[b.cover_path]
        ? `<img src="${esc(urls[b.cover_path])}" alt="" loading="lazy">`
        : `<div class="rdr-cover-gen"><span>${esc(b.title)}</span></div>`;
      return `
        <article class="rdr-book">
          <button class="rdr-book-cover" data-act="open-book" data-id="${esc(b.id)}" aria-label="${esc(b.title)} 읽기">${cover}</button>
          <div class="rdr-book-info">
            <button class="rdr-book-title" data-act="open-book" data-id="${esc(b.id)}">${esc(b.title)}</button>
            <div class="rdr-book-author rdr-ellipsis">${esc(b.author || '')}</div>
            <div class="rdr-book-progress"><div style="width:${pct}%"></div></div>
            <div class="rdr-book-meta">
              <span>${pct}% · ${esc(fmtRelative(b.last_read_at))}</span>
              <button class="rdr-icon-btn rdr-icon-btn-sm" data-act="book-menu" data-id="${esc(b.id)}" aria-label="더보기">${icon('more')}</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  async function bookMenu(id) {
    const b = S.books.find((x) => x.id === id);
    if (!b) return;
    const sheet = openSheet(`
      <h3 class="rdr-sheet-title">${esc(b.title)}</h3>
      <p class="rdr-sheet-text">${esc(b.author || '')}</p>
      <div class="rdr-sheet-list">
        <button class="rdr-sheet-item" data-m="open">읽기</button>
        <button class="rdr-sheet-item rdr-danger-text" data-m="delete">서재에서 삭제</button>
      </div>`);
    sheet.querySelector('[data-m="open"]').onclick = () => { closeSheet(); openBook(id); };
    sheet.querySelector('[data-m="delete"]').onclick = async () => {
      closeSheet();
      const ok = await confirmSheet({
        title: '이 책을 삭제할까요?',
        body: '책 파일과 이 책에서 학습한 문장 기록이 모두 삭제됩니다.',
        ok: '삭제', danger: true
      });
      if (!ok) return;
      busy('삭제하는 중');
      try {
        await API.deleteBook(b);
        toast('삭제했습니다');
        await loadLibrary();
      } catch (e) {
        toast(userMessage(e));
      } finally { busy(null); }
    };
  }

  // ---------------- 업로드 ----------------
  async function sha256(buffer) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // 보안 컨텍스트가 아닌 경우의 대체 해시 (FNV-1a)
      const bytes = new Uint8Array(buffer);
      let h = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
      return `fnv-${bytes.length}-${h.toString(16)}`;
    }
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  async function checkDrm(zip) {
    if (zip.file('META-INF/rights.xml')) return true;
    const enc = zip.file('META-INF/encryption.xml');
    if (!enc) return false;
    const xml = await enc.async('string');
    const algs = Array.from(xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]);
    if (!algs.length) return false;
    // 글꼴 난독화(font obfuscation)만 있는 경우는 DRM 이 아니다
    return !algs.every((a) => /idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(a));
  }

  function resizeImage(blob, maxW) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((out) => resolve(out), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function handleFile(file) {
    if (!/\.epub$/i.test(file.name) && file.type !== 'application/epub+zip') {
      toast('EPUB 파일(.epub)만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_FILE) {
      toast('파일이 너무 큽니다. 50MB 이하 EPUB만 올릴 수 있습니다.');
      return;
    }
    busy('파일을 확인하는 중');
    let probe = null;
    try {
      await ensureLibs();
      const buffer = await file.arrayBuffer();
      const hash = await sha256(buffer);
      const dup = await API.findByHash(hash);
      if (dup) { toast(`이미 서재에 있는 책입니다: ${dup.title}`); return; }

      let zip;
      try { zip = await window.JSZip.loadAsync(buffer); } catch (e) { zip = null; }
      if (!zip || !zip.file('META-INF/container.xml')) {
        throw new API.ReaderError('올바른 EPUB 파일이 아닙니다. 파일이 손상되었을 수 있습니다.');
      }
      if (await checkDrm(zip)) {
        throw new API.ReaderError('DRM(복제 방지)이 걸린 EPUB은 열 수 없습니다. DRM이 없는 파일을 사용해 주세요.');
      }

      busy('책 정보를 읽는 중');
      probe = window.ePub(buffer.slice(0));
      await withTimeout(probe.opened, 20000, '책을 해석하지 못했습니다. EPUB 구조가 올바르지 않을 수 있습니다.');
      const meta = await probe.loaded.metadata;
      let coverBlob = null;
      try {
        const coverUrl = await withTimeout(probe.coverUrl(), 8000, 'cover');
        if (coverUrl) {
          const raw = await (await fetch(coverUrl)).blob();
          coverBlob = await resizeImage(raw, 480);
        }
      } catch (e) { coverBlob = null; }

      busy('서재에 올리는 중');
      const title = (meta && meta.title) || file.name.replace(/\.epub$/i, '');
      await API.uploadBook({
        id: uuid(), buffer, coverBlob, hash,
        meta: { title, author: (meta && meta.creator) || '', language: (meta && meta.language) || 'en' }
      });
      toast(`서재에 추가했습니다: ${title}`);
      await loadLibrary();
    } catch (e) {
      console.error('[reader] upload', e);
      toast(userMessage(e, 'EPUB을 추가하지 못했습니다.'), 4000);
    } finally {
      if (probe) { try { probe.destroy(); } catch (e) { /* noop */ } }
      busy(null);
    }
  }

  // ---------------- Reader ----------------
  function localPos(id) {
    try { return JSON.parse(localStorage.getItem(`rdr-pos-${id}`) || 'null'); } catch (e) { return null; }
  }

  async function openBook(id) {
    const token = ++S.openToken;
    await closeBook();
    showView('reader');
    S.chromeVisible = true;
    root.classList.remove('rdr-chrome-hidden');
    $('#rdrFontPanel').classList.add('rdr-hidden');
    $('#rdrBookTitle').textContent = '';
    $('#rdrChapter').textContent = '';
    $('#rdrPct').textContent = '';
    $('#rdrProgressFill').style.width = '0%';
    $('#rdrViewer').innerHTML = '';
    loading('책을 여는 중입니다');
    try {
      await ensureLibs();
      const row = await API.getBook(id);
      if (token !== S.openToken) return;
      S.row = row;
      $('#rdrBookTitle').textContent = row.title;

      const [buffer, sentences, vocab] = await Promise.all([
        API.loadEpub(row, (msg) => loading(msg)),
        API.listSentences(id).catch((e) => { toast(userMessage(e)); return []; }),
        API.listVocab(id).catch(() => [])
      ]);
      if (token !== S.openToken) return;
      S.sentences = sentences;
      S.vocab = vocab;
      loading('책을 여는 중입니다');

      const book = window.ePub(buffer);
      S.book = book;
      await withTimeout(book.ready, 25000, '책을 열지 못했습니다. 파일이 손상되었을 수 있습니다.');
      if (token !== S.openToken) return;
      S.toc = flattenToc(book.navigation ? book.navigation.toc : []);
      book.spine.hooks.content.register((doc) => sanitizeSection(doc));

      const wide = window.innerWidth >= 900;
      const rendition = book.renderTo($('#rdrViewer'), {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: wide ? 'auto' : 'none',
        minSpreadWidth: 900,
        // Safari 는 allow-scripts 가 없으면 부모가 붙인 이벤트도 막는다. 책 스크립트는 sanitizeSection 이 제거.
        allowScriptedContent: true
      });
      S.rendition = rendition;
      applyTheme();
      rendition.hooks.content.register(onContentLoaded);
      rendition.on('relocated', onRelocated);

      if (row.locations_json) {
        try { book.locations.load(row.locations_json); } catch (e) { /* 재생성 */ }
      }

      // 위치 복원: 로컬과 서버 중 더 최근 것
      const local = localPos(id);
      let startCfi = row.current_cfi || null;
      if (local && local.cfi && (!row.last_read_at || local.t > new Date(row.last_read_at).getTime())) startCfi = local.cfi;
      try {
        await withTimeout(rendition.display(startCfi || undefined), 15000, 'display');
      } catch (e) {
        console.warn('[reader] 저장 위치로 열기 실패, 처음부터 엽니다', e);
        await rendition.display();
      }
      if (token !== S.openToken) return;
      applyHighlights();
      loading(null);

      S.log = await API.getDailyLog(id).catch(() => null);
      if (!book.locations.length()) generateLocations(book, id);
      else updateProgressUi();
    } catch (e) {
      console.error('[reader] open', e);
      if (token !== S.openToken) return;
      loading(null);
      toast(userMessage(e, '책을 열지 못했습니다.'), 4000);
      await closeBook();
      showView('library');
      loadLibrary();
    }
  }

  async function generateLocations(book, id) {
    try {
      await book.locations.generate(1200);
      if (book !== S.book) return;
      API.saveLocations(id, book.locations.save());
      updateProgressUi();
    } catch (e) { console.warn('[reader] locations 생성 실패', e); }
  }

  async function closeBook() {
    clearPending(false);
    finishPage();
    await flushProgress();
    await flushLog();
    if (S.book) {
      try { S.book.destroy(); } catch (e) { /* noop */ }
    }
    S.book = null;
    S.rendition = null;
    S.row = null;
    S.location = null;
    S.sentences = [];
    S.vocab = [];
    S.page = null;
    S.log = null;
    if (root) $('#rdrViewer').innerHTML = '';
  }

  async function backToLibrary() {
    S.openToken++;
    await closeBook();
    showView('library');
    loadLibrary();
  }

  function flattenToc(items, depth = 0, out = []) {
    (items || []).forEach((it) => {
      out.push({ label: (it.label || '').trim(), href: it.href, depth });
      if (it.subitems && it.subitems.length) flattenToc(it.subitems, depth + 1, out);
    });
    return out;
  }

  function hrefBase(h) { return String(h || '').split('#')[0].replace(/^\.\//, ''); }

  function chapterFor(href) {
    const base = hrefBase(href);
    if (!base) return '';
    let hit = null;
    for (const t of S.toc) {
      const tb = hrefBase(t.href);
      if (tb && (tb === base || base.endsWith('/' + tb) || tb.endsWith('/' + base) || base.endsWith(tb))) {
        hit = t;
        if (!String(t.href).includes('#')) break;
      }
    }
    return hit ? hit.label : '';
  }

  function applyTheme() {
    const r = S.rendition;
    if (!r) return;
    r.themes.default({
      'html, body': {
        background: '#FBF7EF !important',
        color: '#2E2A24 !important'
      },
      body: {
        'font-family': 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif !important',
        'line-height': '1.75 !important',
        '-webkit-text-size-adjust': '100%',
        padding: '0 4px !important'
      },
      p: { 'line-height': '1.75 !important' },
      a: { color: '#3E6FA3 !important' },
      img: { 'max-width': '100% !important', height: 'auto !important' },
      '::selection': { background: 'rgba(62, 111, 163, 0.25)' }
    });
    r.themes.fontSize(`${FONT_STEPS[S.fontIdx]}%`);
  }

  function renderFontDots() {
    const dots = $('#rdrFontDots');
    if (!dots) return;
    dots.innerHTML = FONT_STEPS.map((_, i) => `<span class="${i === S.fontIdx ? 'on' : ''}"></span>`).join('');
  }

  function setFont(idx) {
    const next = Math.max(0, Math.min(FONT_STEPS.length - 1, idx));
    if (next === S.fontIdx) return;
    S.fontIdx = next;
    setPref('rdr-font-idx', next);
    renderFontDots();
    const r = S.rendition;
    if (!r) return;
    const cfi = S.location && S.location.start && S.location.start.cfi;
    r.themes.fontSize(`${FONT_STEPS[next]}%`);
    // 글자 크기가 바뀌면 페이지가 다시 나뉘므로 같은 위치로 복귀 후 하이라이트 재적용
    setTimeout(() => {
      if (cfi && S.rendition === r) r.display(cfi).then(() => applyHighlights()).catch(() => applyHighlights());
    }, 60);
  }

  function prev() { if (S.rendition) { clearPending(true); S.rendition.prev(); } }
  function next() { if (S.rendition) { clearPending(true); S.rendition.next(); } }

  let lastWide = window.innerWidth >= 900;
  function onResize() {
    // 크기 변화 자체는 epub.js 가 처리한다 (현재 위치 유지). 여기서는 양면 보기 전환만 반영.
    const wide = window.innerWidth >= 900;
    if (wide === lastWide) return;
    lastWide = wide;
    if (!S.rendition) return;
    try { S.rendition.spread(wide ? 'auto' : 'none', 900); } catch (e) { /* noop */ }
  }

  function toggleChrome(force) {
    S.chromeVisible = typeof force === 'boolean' ? force : !S.chromeVisible;
    root.classList.toggle('rdr-chrome-hidden', !S.chromeVisible);
    if (!S.chromeVisible) $('#rdrFontPanel').classList.add('rdr-hidden');
  }

  function onRelocated(loc) {
    const prevLoc = S.location;
    S.location = loc;
    awardProgress(prevLoc, loc);
    finishPage();
    startPage(loc);
    updateProgressUi();
    const cfi = loc && loc.start && loc.start.cfi;
    if (cfi && S.row) {
      try { localStorage.setItem(`rdr-pos-${S.row.id}`, JSON.stringify({ cfi, t: Date.now() })); } catch (e) { /* noop */ }
      clearTimeout(S.savingTimer);
      S.savingTimer = setTimeout(flushProgress, 2500);
    }
  }

  function currentPct() {
    const book = S.book;
    const loc = S.location;
    if (!book || !loc || !loc.start || !book.locations || !book.locations.length()) return null;
    if (loc.atEnd) return 1;
    const p = book.locations.percentageFromCfi(loc.start.cfi);
    return typeof p === 'number' && !Number.isNaN(p) ? p : null;
  }

  function updateProgressUi() {
    const loc = S.location;
    if (!loc || !loc.start) return;
    $('#rdrChapter').textContent = chapterFor(loc.start.href) || '';
    const pct = currentPct();
    if (pct !== null) {
      const v = Math.round(pct * 100);
      $('#rdrPct').textContent = `${v}%`;
      $('#rdrProgressFill').style.width = `${v}%`;
    } else {
      $('#rdrPct').textContent = '';
    }
  }

  async function flushProgress() {
    clearTimeout(S.savingTimer);
    const loc = S.location;
    const row = S.row;
    if (!row || !loc || !loc.start || !loc.start.cfi) return;
    const pct = currentPct();
    const chapter = chapterFor(loc.start.href);
    await API.saveProgress(row.id, { cfi: loc.start.cfi, pct: pct === null ? undefined : pct, chapter });
  }

  // ---------------- 페이지 체류 (독해 지표용 추정) ----------------
  function visibleText(loc) {
    try {
      const r = S.rendition;
      const a = r.getRange(loc.start.cfi);
      const b = r.getRange(loc.end.cfi);
      if (!a || !b || a.startContainer.ownerDocument !== b.startContainer.ownerDocument) return '';
      const range = a.startContainer.ownerDocument.createRange();
      range.setStart(a.startContainer, a.startOffset);
      range.setEnd(b.endContainer, b.endOffset);
      return range.toString();
    } catch (e) { return ''; }
  }

  function startPage(loc) {
    if (!loc || !loc.start || !loc.end) { S.page = null; return; }
    S.page = { since: Date.now(), sentences: T.countSentences(visibleText(loc)) };
  }

  function finishPage() {
    const page = S.page;
    S.page = null;
    if (!page) return;
    const dwell = Date.now() - page.since;
    if (dwell < PAGE_DWELL_MS) return;
    if (XP && page.sentences > 0) XP.award('page');
    if (!S.log) return;
    S.log.pages_viewed += 1;
    S.log.sentences_read_est += page.sentences;
    S.log.reading_seconds += Math.round(Math.min(dwell, 300000) / 1000);
    scheduleLog();
  }

  function scheduleLog() {
    clearTimeout(S.logTimer);
    S.logTimer = setTimeout(flushLog, 8000);
  }

  async function flushLog() {
    clearTimeout(S.logTimer);
    if (S.log) await API.saveDailyLog(S.log);
  }

  // ---------------- iframe 콘텐츠: 선택 / 탭 / 스와이프 ----------------
  function onContentLoaded(contents) {
    const doc = contents.document;
    const win = contents.window;
    let touch = null;
    let lastTouchTap = 0;

    doc.addEventListener('selectionchange', debounce(() => onSelection(contents), 350));

    const hasSelection = () => {
      const sel = win.getSelection();
      return Boolean(sel && !sel.isCollapsed && sel.toString().trim());
    };

    // 탭 처리 (마우스 클릭 / 터치 탭 공통)
    // return true 이면 탭을 리더가 처리한 것
    const handleTap = (clientX, clientY, target) => {
      if (hasSelection()) return false;
      if (target && target.closest && target.closest('a[href]')) return false;
      // 1) 찾아본 어휘 → 학습한 문장 순서로 탭 여부 확인 (어휘가 더 작은 대상)
      const voc = hitRange(contents, S.vocab, clientX, clientY);
      if (voc) { openVocab(voc); return true; }
      const rec = hitRange(contents, S.sentences, clientX, clientY);
      if (rec) { openRecord(rec); return true; }
      // 2) 좌우 가장자리 탭 = 페이지 이동, 가운데 = 메뉴 표시/숨김
      if (S.pending) { clearPending(true); return true; }
      const frame = win.frameElement;
      const viewer = $('#rdrViewer').getBoundingClientRect();
      const fr = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
      const ratio = (fr.left + clientX - viewer.left) / viewer.width;
      if (ratio < 0.22) prev();
      else if (ratio > 0.78) next();
      else toggleChrome();
      return true;
    };

    doc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { touch = null; return; }
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });

    doc.addEventListener('touchmove', (e) => {
      if (touch && e.touches.length !== 1) touch = null;
    }, { passive: true });

    doc.addEventListener('touchend', (e) => {
      if (!touch) return;
      const t0 = touch;
      touch = null;
      if (hasSelection()) return; // 길게 눌러 선택한 경우
      const p = e.changedTouches[0];
      const dx = p.clientX - t0.x;
      const dy = p.clientY - t0.y;
      const dt = Date.now() - t0.t;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) {
        lastTouchTap = Date.now();
        if (dx < 0) next(); else prev();
        return;
      }
      // iOS Safari 는 문서 전체에 건 click 이 오지 않는 경우가 있어, 짧은 터치를 직접 탭으로 처리한다
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 400) {
        lastTouchTap = Date.now();
        // 처리한 탭은 뒤따르는 가짜 클릭을 막는다 (막지 않으면 방금 연 시트의 배경을 눌러 바로 닫힘)
        if (handleTap(p.clientX, p.clientY, e.target) && e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    doc.addEventListener('click', (e) => {
      if (Date.now() - lastTouchTap < 700) return; // 터치에서 이미 처리
      handleTap(e.clientX, e.clientY, e.target);
    });

    doc.addEventListener('keydown', onKeyDown);
  }

  /**
   * EPUB 안의 스크립트를 실행하지 않도록 정리한다.
   * iPad/iPhone Safari 는 sandbox 에 allow-scripts 가 없으면 리더가 붙인 선택·탭 이벤트까지 막기 때문에
   * allow-scripts 를 켜는 대신, 책 문서에서 스크립트 요소·이벤트 속성을 모두 제거하고 CSP 로 한 번 더 막는다.
   */
  function sanitizeSection(doc) {
    try {
      const all = (tag) => Array.from(doc.getElementsByTagNameNS('*', tag));
      ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal'].forEach((tag) => all(tag).forEach((el) => el.remove()));
      all('meta').forEach((m) => { if (/refresh|content-security-policy/i.test(m.getAttribute('http-equiv') || '')) m.remove(); });
      ['set', 'animate'].forEach((tag) => all(tag).forEach((el) => { if (/href/i.test(el.getAttribute('attributeName') || '')) el.remove(); }));
      const walker = doc.createTreeWalker(doc.documentElement, 1 /* SHOW_ELEMENT */);
      let el = walker.currentNode;
      while (el) {
        if (el.attributes) {
          Array.from(el.attributes).forEach((at) => {
            const name = at.name.toLowerCase();
            const val = String(at.value || '').replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
            if (name.startsWith('on')) el.removeAttribute(at.name);
            else if (/(^|:)(href|src|action|formaction|data)$/.test(name) && /^(javascript|vbscript):/.test(val)) el.removeAttribute(at.name);
          });
        }
        el = walker.nextNode();
      }
      // 한 번 더: 책 문서 안에서는 어떤 스크립트도 실행되지 않게
      const head = doc.getElementsByTagNameNS('*', 'head')[0];
      if (head) {
        const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/1999/xhtml';
        const meta = doc.createElementNS(ns, 'meta');
        meta.setAttribute('http-equiv', 'Content-Security-Policy');
        meta.setAttribute('content', "script-src 'none'; object-src 'none'; frame-src 'none'");
        head.insertBefore(meta, head.firstChild);
      }
    } catch (e) {
      console.warn('[reader] 문서 정리 실패', e);
    }
  }

  function sectionOf(contents) {
    try {
      const sec = S.book && S.book.spine.get(contents.sectionIndex);
      if (sec) return { href: sec.href, index: sec.index };
    } catch (e) { /* noop */ }
    return { href: '', index: contents.sectionIndex };
  }

  function hitRange(contents, list, x, y) {
    const href = sectionOf(contents).href;
    for (const rec of list) {
      if (href && rec.chapter_href && hrefBase(rec.chapter_href) !== hrefBase(href)) continue;
      let range = null;
      try { range = contents.range(rec.cfi_range); } catch (e) { range = null; }
      if (!range) continue;
      const rects = range.getClientRects();
      for (const r of rects) {
        if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return rec;
      }
    }
    return null;
  }

  function onSelection(contents) {
    if (root.dataset.view !== 'reader') return;
    const sel = contents.window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) {
      // 선택이 풀린 경우: 버튼을 누르기 전이면 바 유지 (모바일에서 버튼 탭 시 선택이 풀림)
      return;
    }
    const range = sel.getRangeAt(0);
    let expanded = null;
    try { expanded = T.expandToSentence(range); } catch (e) { expanded = null; }
    if (!expanded) return;
    const text = T.normalizeSentence(expanded.toString());
    if (!text || !/[A-Za-z]/.test(text)) return;
    let cfi;
    try { cfi = contents.cfiFromRange(expanded); } catch (e) { cfi = null; }
    if (!cfi) return;

    // 1~3 단어만 골랐다면 '어휘' 모드: 뜻 보기 + 문장 학습 둘 다 제공
    let vocab = null;
    if (T.isVocabSelection(sel.toString())) {
      try {
        const wr = T.expandToWords(range);
        const wt = wr ? T.normalizeSentence(wr.toString()) : '';
        if (wr && wt && T.isVocabSelection(wt)) vocab = { cfi: contents.cfiFromRange(wr), text: wt };
      } catch (e) { vocab = null; }
    }
    const section = sectionOf(contents);
    setPending({ cfi, text, href: section.href, spineIndex: section.index, vocab });
  }

  const PENDING_STYLE = { fill: '#3E6FA3', 'fill-opacity': '0.16', 'mix-blend-mode': 'multiply' };
  const DONE_STYLE = { fill: '#5E9E74', 'fill-opacity': '0.28', 'mix-blend-mode': 'multiply' };
  const VOCAB_STYLE = { fill: '#3E6FA3', 'fill-opacity': '0.24', 'mix-blend-mode': 'multiply' };

  function markCfi(p) { return p.vocab ? p.vocab.cfi : p.cfi; }

  function setPending(p) {
    if (S.pending && markCfi(S.pending) === markCfi(p) && S.pending.cfi === p.cfi) return;
    removePendingMark();
    S.pending = p;
    const existing = findRecord(p);
    const tooLong = p.text.length > 1500;
    const box = $('#rdrSelText');
    const studyBtn = $('#rdrSelStudy');
    const wordBtn = $('#rdrSelWord');
    if (p.vocab) {
      const known = findVocab(p.vocab.cfi);
      box.innerHTML = `<b class="rdr-sel-word">${esc(p.vocab.text)}</b><span class="rdr-sel-ctx">${esc(p.text)}</span>`;
      wordBtn.textContent = known ? '저장한 뜻 보기' : '뜻 보기';
      wordBtn.classList.remove('rdr-hidden');
      studyBtn.textContent = existing ? '문장 기록' : '문장 학습';
      studyBtn.className = 'rdr-btn rdr-btn-ghost rdr-btn-sm';
    } else {
      box.textContent = tooLong ? '선택한 부분이 너무 깁니다. 한 문장만 선택해 주세요.' : p.text;
      wordBtn.classList.add('rdr-hidden');
      studyBtn.textContent = existing ? '학습 기록 보기' : '학습하기';
      studyBtn.className = 'rdr-btn rdr-btn-primary rdr-btn-sm';
    }
    studyBtn.disabled = tooLong;
    $('#rdrSelbar').classList.remove('rdr-hidden');
    try { S.rendition.annotations.highlight(markCfi(p), {}, null, 'rdr-pending', PENDING_STYLE); } catch (e) { /* noop */ }
    schedulePrefetch(p);
  }

  function removePendingMark() {
    if (S.pending && S.rendition) {
      try { S.rendition.annotations.remove(markCfi(S.pending), 'highlight'); } catch (e) { /* noop */ }
      // 같은 CFI 에 저장된 하이라이트가 있었다면 다시 그린다
      if (findRecord(S.pending) || (S.pending.vocab && findVocab(S.pending.vocab.cfi))) applyHighlights();
    }
  }

  function clearPending(clearSelection) {
    removePendingMark();
    S.pending = null;
    if (root) $('#rdrSelbar').classList.add('rdr-hidden');
    if (clearSelection && S.rendition) {
      try { S.rendition.getContents().forEach((c) => c.window.getSelection().removeAllRanges()); } catch (e) { /* noop */ }
    }
  }

  function findRecord(p) {
    return S.sentences.find((r) => r.cfi_range === p.cfi) ||
      S.sentences.find((r) => r.sentence_text === p.text && hrefBase(r.chapter_href) === hrefBase(p.href)) || null;
  }

  function findVocab(cfi) {
    return S.vocab.find((v) => v.cfi_range === cfi) || null;
  }

  function applyHighlights() {
    const r = S.rendition;
    if (!r) return;
    const draw = (cfi, data, cls, style) => {
      try { r.annotations.remove(cfi, 'highlight'); } catch (e) { /* noop */ }
      try { r.annotations.highlight(cfi, data, null, cls, style); } catch (e) {
        console.warn('[reader] 하이라이트 실패', cfi, e);
      }
    };
    S.sentences.forEach((rec) => draw(rec.cfi_range, { id: rec.id }, 'rdr-hl', DONE_STYLE));
    S.vocab.forEach((v) => draw(v.cfi_range, { id: v.id }, 'rdr-hl-word', VOCAB_STYLE));
  }

  // ---------------- 리더에서 바로 찾아보는 어휘 ----------------
  // 1) 사전 뜻은 AI 없이 바로 가져온다 (선택하는 순간 미리 조회, 기기에 캐시)
  // 2) '이 문장에서의 뜻'만 AI 로 이어서 채운다. AI 가 막혀도 사전 뜻은 보인다.
  let prefetchTimer = null;

  function schedulePrefetch(p) {
    clearTimeout(prefetchTimer);
    if (!p || !p.vocab || findVocab(p.vocab.cfi)) return;
    prefetchTimer = setTimeout(() => {
      if (S.pending === p) API.dictLookup(p.vocab.text);
    }, 300);
  }

  async function lookupVocabFromPending() {
    const p = S.pending;
    if (!p || !p.vocab || !S.row) return;
    const known = findVocab(p.vocab.cfi);
    if (known) { openVocab(known); return; }
    const target = { ...p, vocab: { ...p.vocab } };
    clearPending(true);
    const sheet = openSheet(`
      <div class="rdr-vocab-head"><b class="rdr-vocab-word">${esc(target.vocab.text)}</b></div>
      <div class="rdr-vocab-loading"><span class="rdr-spinner rdr-spinner-sm"></span><span>뜻을 찾는 중</span></div>`);
    try { S.rendition.annotations.highlight(target.vocab.cfi, {}, null, 'rdr-pending', PENDING_STYLE); } catch (e) { /* noop */ }
    const showError = (e) => {
      try { S.rendition.annotations.remove(target.vocab.cfi, 'highlight'); } catch (x) { /* noop */ }
      const msg = userMessage(e, '뜻을 가져오지 못했습니다.');
      const box = sheet.querySelector('.rdr-vocab-loading');
      if (!sheet.classList.contains('rdr-hidden') && box) box.outerHTML = `<p class="rdr-err-text">${esc(msg)}</p>`;
      else toast(msg);
    };

    let item = null;
    const dict = await API.dictLookup(target.vocab.text);
    if (dict) {
      item = { ...dict, context_meaning: '' };
    } else {
      // 사전이 막힌 경우에만 AI 로 전체 뜻을 받는다
      try {
        const d = await API.ai('words', { words: [target.vocab.text], sentence: target.text });
        item = (d.items && d.items[0]) || {};
        if (!item.dict_meaning && !item.context_meaning) throw new API.ReaderError('뜻을 찾지 못했습니다. 다른 단어로 다시 선택해 주세요.');
      } catch (e) { showError(e); return; }
    }

    let saved;
    try {
      saved = await API.saveVocab({
        book_id: S.row.id,
        cfi_range: target.vocab.cfi,
        chapter_href: target.href,
        sentence_text: target.text,
        surface: target.vocab.text,
        lemma: item.lemma, pos: item.pos,
        dict_meaning: item.dict_meaning, context_meaning: item.context_meaning || null
      });
    } catch (e) { showError(e); return; }
    saved.note = item.note;
    saved._target = target;
    S.vocab.push(saved);
    try { S.rendition.annotations.remove(target.vocab.cfi, 'highlight'); } catch (e) { /* noop */ }
    applyHighlights();
    if (S.log) { S.log.words_looked_up += 1; scheduleLog(); }
    if (XP) XP.award('vocab');
    if (dict) saved._ctx = 'loading';
    if (!sheet.classList.contains('rdr-hidden')) openVocab(saved);
    if (dict) loadVocabContext(saved);
  }

  async function loadVocabContext(v) {
    if (!v.sentence_text) return;
    v._ctx = 'loading';
    refreshVocabCtx(v);
    try {
      const d = await API.ai('words', { words: [v.surface], sentence: v.sentence_text });
      const it = (d.items && d.items[0]) || {};
      if (!it.context_meaning) throw new API.ReaderError('이 문장에서의 뜻을 찾지 못했습니다.');
      v.context_meaning = it.context_meaning;
      v.note = it.note;
      if (!v.pos && it.pos) v.pos = it.pos;
      v._ctx = undefined;
      API.updateVocab(v.id, { context_meaning: v.context_meaning });
    } catch (e) {
      v._ctx = 'error';
      v._ctxError = userMessage(e, '이 문장에서의 뜻을 가져오지 못했습니다.');
    }
    refreshVocabCtx(v);
  }

  function vocabCtxHtml(v) {
    if (v.context_meaning) {
      return `<div class="rdr-word-ctx rdr-vocab-ctx"><span>이 문장에서</span>${esc(v.context_meaning)}</div>${v.note ? `<p class="rdr-hint">${esc(v.note)}</p>` : ''}`;
    }
    if (v._ctx === 'loading') {
      return '<div class="rdr-vocab-ctx-wait"><span class="rdr-spinner rdr-spinner-sm"></span><span>이 문장에서의 뜻을 찾는 중</span></div>';
    }
    if (v._ctx === 'error') {
      return `<div class="rdr-vocab-ctx-wait"><span class="rdr-err-text">${esc(v._ctxError || '')}</span><button class="rdr-link-btn" data-v="ctx">다시 시도</button></div>`;
    }
    if (v.sentence_text) return '<div class="rdr-vocab-ctx-wait"><button class="rdr-link-btn" data-v="ctx">이 문장에서의 뜻 보기</button></div>';
    return '';
  }

  function refreshVocabCtx(v) {
    const sheet = $('#rdrSheet');
    if (sheet.classList.contains('rdr-hidden') || sheet.dataset.vocabId !== String(v.id)) return;
    const box = sheet.querySelector('[data-v-ctx]');
    if (!box) return;
    box.innerHTML = vocabCtxHtml(v);
    const btn = box.querySelector('[data-v="ctx"]');
    if (btn) btn.onclick = () => loadVocabContext(v);
  }

  function openVocab(v) {
    clearPending(true);
    const head = v.lemma && v.lemma.toLowerCase() !== String(v.surface).toLowerCase()
      ? `${esc(v.lemma)} <small>${esc(v.surface)}</small>` : esc(v.lemma || v.surface);
    const sheet = openSheet(`
      <div class="rdr-vocab-head">
        <b class="rdr-vocab-word">${head}</b>
        ${v.pos ? `<span class="rdr-pos">${esc(v.pos)}</span>` : ''}
        <button class="rdr-icon-btn rdr-icon-btn-sm rdr-vocab-say" data-v="say" aria-label="발음 듣기">${icon('play')}</button>
      </div>
      ${v.dict_meaning ? `<p class="rdr-vocab-dict">${esc(v.dict_meaning)}</p>` : ''}
      <div data-v-ctx></div>
      ${v.sentence_text ? `<p class="rdr-vocab-sentence">${esc(v.sentence_text)}</p>` : ''}
      <div class="rdr-sheet-actions">
        <button class="rdr-btn rdr-btn-ghost rdr-danger-text" data-v="delete">하이라이트 삭제</button>
        <button class="rdr-btn rdr-btn-primary" data-v="study">이 문장 학습</button>
      </div>`);
    sheet.dataset.vocabId = String(v.id);
    refreshVocabCtx(v);
    sheet.querySelector('[data-v="say"]').onclick = () => {
      if (!TTS || !TTS.isSupported()) { toast('이 브라우저는 음성 읽기를 지원하지 않습니다.'); return; }
      TTS.speak(v.surface, { rate: S.rate });
    };
    sheet.querySelector('[data-v="delete"]').onclick = async () => {
      try {
        await API.deleteVocab(v.id);
        try { S.rendition.annotations.remove(v.cfi_range, 'highlight'); } catch (e) { /* noop */ }
        S.vocab = S.vocab.filter((x) => x.id !== v.id);
        closeSheet();
        applyHighlights();
        toast('어휘 하이라이트를 삭제했습니다');
      } catch (e) { toast(userMessage(e)); }
    };
    sheet.querySelector('[data-v="study"]').onclick = () => {
      closeSheet();
      const sentenceRec = S.sentences.find((r) => r.sentence_text === v.sentence_text && hrefBase(r.chapter_href) === hrefBase(v.chapter_href));
      if (sentenceRec) { openRecord(sentenceRec); return; }
      const cfi = sentenceCfiFor(v);
      if (!cfi) { toast('이 문장의 위치를 찾지 못했습니다. 문장을 직접 선택해 주세요.'); return; }
      openStudy({ cfi, text: v.sentence_text, href: v.chapter_href, spineIndex: undefined, chapter: chapterFor(v.chapter_href) }, null,
        [{ surface: v.surface, lemma: v.lemma, pos: v.pos, dict_meaning: v.dict_meaning, context_meaning: v.context_meaning, status: 'done' }]);
    };
  }

  /** 저장된 어휘 위치에서 그 어휘가 속한 문장의 CFI 를 다시 계산 */
  function sentenceCfiFor(v) {
    if (v._target && v._target.cfi) return v._target.cfi;
    try {
      const contents = S.rendition.getContents();
      for (const c of contents) {
        let range = null;
        try { range = c.range(v.cfi_range); } catch (e) { range = null; }
        if (!range) continue;
        const exp = T.expandToSentence(range);
        if (exp) return c.cfiFromRange(exp);
      }
    } catch (e) { /* noop */ }
    return null;
  }

  // ---------------- 목차 ----------------
  function openToc() {
    if (!S.toc.length) { toast('이 책에는 목차 정보가 없습니다.'); return; }
    const cur = S.location && S.location.start ? chapterFor(S.location.start.href) : '';
    const sheet = openSheet(`
      <h3 class="rdr-sheet-title">목차</h3>
      <div class="rdr-sheet-list rdr-toc">
        ${S.toc.map((t, i) => `<button class="rdr-sheet-item ${t.label === cur ? 'rdr-current' : ''}" style="padding-left:${16 + t.depth * 16}px" data-toc="${i}">${esc(t.label || '(제목 없음)')}</button>`).join('')}
      </div>`, 'rdr-sheet-tall');
    sheet.querySelectorAll('[data-toc]').forEach((b) => {
      b.onclick = () => {
        const t = S.toc[Number(b.dataset.toc)];
        closeSheet();
        clearPending(true);
        if (t && S.rendition) S.rendition.display(t.href).catch(() => toast('해당 위치로 이동하지 못했습니다.'));
      };
    });
  }

  // ---------------- 학습 기록 시트 ----------------
  function openRecord(rec) {
    clearPending(true);
    const words = rec.words || [];
    const sheet = openSheet(`
      <div class="rdr-record-head">
        <span class="rdr-chip rdr-chip-green">학습한 문장</span>
        <span class="rdr-record-date">${esc(fmtDate(rec.completed_at))} 학습${rec.review_count ? ` · 복습 ${rec.review_count}회` : ''}</span>
      </div>
      <p class="rdr-record-sentence">${esc(rec.sentence_text)}</p>
      <div class="rdr-record-tts">
        <button class="rdr-btn rdr-btn-blue rdr-btn-sm" data-r="listen">${icon('play')}<span>듣기</span></button>
        ${rec.translation_viewed ? '<span class="rdr-chip">번역 확인함</span>' : '<span class="rdr-chip">번역 없이 학습</span>'}
      </div>
      ${words.length ? `<div class="rdr-record-words">
        <div class="rdr-label">이전에 확인한 단어</div>
        ${words.map((w) => `<div class="rdr-record-word"><b>${esc(w.lemma || w.surface)}</b><span>${esc(w.dict_meaning || '')}</span>${w.context_meaning ? `<em>이 문장에서: ${esc(w.context_meaning)}</em>` : ''}</div>`).join('')}
      </div>` : ''}
      ${rec.paraphrase_text ? `<div class="rdr-record-para">
        <div class="rdr-label">내가 바꿔 쓴 문장${rec.paraphrase_task ? ` · ${esc(rec.paraphrase_task)}` : ''}</div>
        <p>${esc(rec.paraphrase_text)}</p>
        ${rec.paraphrase_feedback && VERDICT[rec.paraphrase_feedback.meaning] ? `<span class="rdr-verdict ${VERDICT[rec.paraphrase_feedback.meaning].cls}">${VERDICT[rec.paraphrase_feedback.meaning].label}</span>` : ''}
      </div>` : ''}
      ${rec.translation ? `<div class="rdr-record-trans">
        <button class="rdr-link-btn" data-r="trans">해석 보기</button>
        <p class="rdr-hidden" data-r-trans>${esc(rec.translation)}</p>
      </div>` : ''}
      <div class="rdr-sheet-actions">
        <button class="rdr-btn rdr-btn-ghost rdr-danger-text" data-r="delete">기록 삭제</button>
        <button class="rdr-btn rdr-btn-primary" data-r="restudy">다시 학습하기</button>
      </div>`);

    const listenBtn = sheet.querySelector('[data-r="listen"]');
    listenBtn.onclick = () => {
      if (!TTS || !TTS.isSupported()) { toast('이 브라우저는 음성 읽기를 지원하지 않습니다.'); return; }
      TTS.speak(rec.sentence_text, { rate: S.rate });
    };
    const transBtn = sheet.querySelector('[data-r="trans"]');
    if (transBtn) transBtn.onclick = () => {
      sheet.querySelector('[data-r-trans]').classList.remove('rdr-hidden');
      transBtn.remove();
    };
    sheet.querySelector('[data-r="restudy"]').onclick = () => {
      closeSheet();
      openStudy({
        cfi: rec.cfi_range, text: rec.sentence_text, href: rec.chapter_href,
        spineIndex: rec.spine_index, chapter: rec.chapter_label
      }, rec);
    };
    sheet.querySelector('[data-r="delete"]').onclick = async () => {
      closeSheet();
      const ok = await confirmSheet({ title: '이 학습 기록을 삭제할까요?', body: '하이라이트와 확인한 단어가 함께 삭제됩니다.', ok: '삭제', danger: true });
      if (!ok) return;
      try {
        await API.deleteSentence(rec.id);
        try { S.rendition.annotations.remove(rec.cfi_range, 'highlight'); } catch (e) { /* noop */ }
        S.sentences = S.sentences.filter((r) => r.id !== rec.id);
        toast('학습 기록을 삭제했습니다');
      } catch (e) { toast(userMessage(e)); }
    };
  }

  // ---------------- 학습모드 ----------------
  function startStudyFromPending() {
    const p = S.pending;
    if (!p) return;
    const existing = findRecord(p);
    if (existing) { openRecord(existing); return; }
    openStudy({ ...p, chapter: chapterFor(p.href) }, null);
  }

  function openStudy(target, existing, initialWords) {
    if (TTS) TTS.stop();
    let spineIndex = target.spineIndex;
    if (spineIndex === undefined && S.book && target.href) {
      try { const sec = S.book.spine.get(target.href); if (sec) spineIndex = sec.index; } catch (e) { /* noop */ }
    }
    S.study = {
      existing,
      cfi: target.cfi,
      text: target.text,
      href: target.href,
      spineIndex,
      chapter: target.chapter || chapterFor(target.href) || '',
      words: (existing && existing.words ? existing.words : (initialWords || [])).map((w) => ({ ...w, status: 'done' })),
      typed: '',
      typingOpen: T.wordCount(target.text) <= LONG_SENTENCE_WORDS,
      writeTab: 'copy',
      para: {
        task: existing && existing.paraphrase_task ? existing.paraphrase_task : null,
        hint: '', example: '',
        tasks: existing && existing.paraphrase_task ? [existing.paraphrase_task] : [],
        loadingTask: false, taskError: null,
        text: (existing && existing.paraphrase_text) || '',
        checking: false,
        feedback: (existing && existing.paraphrase_feedback) || null,
        checkedNow: false,
        exampleShown: false
      },
      translation: existing ? existing.translation : null,
      translationViewed: false,
      translationLoading: false,
      ttsCount: 0,
      playing: false,
      dirty: false,
      saving: false
    };
    $('#rdrStudyChapter').textContent = S.study.chapter;
    renderStudy();
    showView('study');
    $('#rdrStudyBody').scrollTop = 0;
  }

  function renderStudy() {
    const st = S.study;
    if (!st) return;
    const body = $('#rdrStudyBody');
    const chosen = new Set(st.words.map((w) => String(w.surface).toLowerCase()));
    const tokens = T.tokenize(st.text).map((tk, i) => tk.word
      ? `<span class="rdr-w ${chosen.has(tk.text.toLowerCase()) ? 'rdr-w-on' : ''}" data-w="${i}">${esc(tk.text)}</span>`
      : esc(tk.text)).join('');
    const ttsOk = TTS && TTS.isSupported();

    body.innerHTML = `
      <div class="rdr-card rdr-sentence-card">
        <p class="rdr-sentence" id="rdrSentence">${tokens}</p>
        <p class="rdr-hint">모르는 단어를 여러 개 탭한 뒤 아래에서 한 번에 뜻을 확인하세요</p>
        ${ttsOk ? `
        <div class="rdr-tts">
          <button class="rdr-btn rdr-btn-blue rdr-btn-sm" id="rdrTtsPlay">${icon(st.playing ? 'pause' : 'play')}<span>${st.playing ? '멈춤' : '듣기'}</span></button>
          <button class="rdr-btn rdr-btn-ghost rdr-btn-sm" id="rdrTtsReplay">${icon('replay')}<span>다시 듣기</span></button>
        </div>
        <div class="rdr-tts-opts">
          <div class="rdr-seg" role="group" aria-label="읽기 속도">
            ${RATES.map((r) => `<button class="${r === S.rate ? 'on' : ''}" data-rate="${r}">${r.toFixed(1)}x</button>`).join('')}
          </div>
          <div class="rdr-seg" role="group" aria-label="목소리">
            <button class="${TTS.getGender() === 'female' ? 'on' : ''}" data-voice="female">여성</button>
            <button class="${TTS.getGender() === 'male' ? 'on' : ''}" data-voice="male">남성</button>
          </div>
        </div>` : '<p class="rdr-hint">이 브라우저는 음성 읽기를 지원하지 않습니다.</p>'}
      </div>

      <div class="rdr-card" id="rdrWriteCard"></div>

      <div class="rdr-card">
        <div class="rdr-card-head"><span class="rdr-label">모르는 단어</span></div>
        <form class="rdr-word-form" id="rdrWordForm" autocomplete="off">
          <input class="rdr-input" id="rdrWordInput" placeholder="예: hesitated, considerable" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="300">
          <button class="rdr-btn rdr-btn-green-soft" type="submit" id="rdrLookupBtn">뜻 확인</button>
        </form>
        <div class="rdr-chips" id="rdrChips"></div>
        <div class="rdr-words" id="rdrWords">${renderWords()}</div>
      </div>

      <div class="rdr-card">
        <div class="rdr-card-head"><span class="rdr-label">한글 해석</span></div>
        ${st.translationViewed && st.translation
          ? `<p class="rdr-translation">${esc(st.translation)}</p>`
          : `<p class="rdr-hint">먼저 영어로 이해해 보고, 필요할 때만 열어 보세요.</p>
             <button class="rdr-btn rdr-btn-ghost rdr-btn-block" id="rdrTransBtn" ${st.translationLoading ? 'disabled' : ''}>${st.translationLoading ? '해석을 불러오는 중' : '해석 보기'}</button>`}
      </div>
    `;

    body.querySelectorAll('.rdr-w').forEach((el) => {
      el.onclick = () => toggleWord(el.textContent);
    });
    if (ttsOk) {
      $('#rdrTtsPlay').onclick = () => (st.playing ? stopTts() : playTts());
      $('#rdrTtsReplay').onclick = () => playTts();
      body.querySelectorAll('[data-rate]').forEach((b) => {
        b.onclick = () => {
          S.rate = Number(b.dataset.rate);
          setPref('rdr-rate', S.rate);
          body.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('on', x === b));
          if (st.playing) playTts();
        };
      });
      body.querySelectorAll('[data-voice]').forEach((b) => {
        b.onclick = () => {
          const g = b.dataset.voice;
          TTS.setGender(g);
          body.querySelectorAll('[data-voice]').forEach((x) => x.classList.toggle('on', x === b));
          if (!TTS.hasGender(g)) {
            toast(`이 기기에는 ${g === 'male' ? '남성' : '여성'} 영어 음성이 없어 톤을 바꿔 대신 읽어요.`, 3200);
          }
          playTts();
        };
      });
    }
    renderWriteCard();
    $('#rdrWordForm').onsubmit = (e) => {
      e.preventDefault();
      const v = $('#rdrWordInput').value.trim();
      $('#rdrWordInput').value = '';
      if (v) T.splitWords(v).forEach((w) => addPending(w, true));
      if (!st.words.some((w) => w.status === 'pending')) {
        if (!v) toast('문장에서 단어를 탭하거나 입력해 주세요.');
        return;
      }
      lookupPending();
    };
    bindWordCards();
    renderChips();
    const tb = $('#rdrTransBtn');
    if (tb) tb.onclick = showTranslation;
  }

  // ---------------- 직접 써보기: 따라 쓰기 / 바꿔 쓰기 ----------------
  const VERDICT = {
    same: { label: '같은 뜻', cls: 'rdr-verdict-same' },
    close: { label: '조금 달라요', cls: 'rdr-verdict-close' },
    different: { label: '뜻이 달라졌어요', cls: 'rdr-verdict-diff' }
  };

  function renderWriteCard() {
    const st = S.study;
    const card = $('#rdrWriteCard');
    if (!st || !card) return;
    const tabs = `
      <div class="rdr-seg rdr-seg-tabs" role="tablist" aria-label="쓰기 방식">
        <button role="tab" class="${st.writeTab === 'copy' ? 'on' : ''}" data-wtab="copy">따라 쓰기</button>
        <button role="tab" class="${st.writeTab === 'para' ? 'on' : ''}" data-wtab="para">바꿔 쓰기</button>
      </div>`;
    if (!st.typingOpen) {
      card.innerHTML = `
        <div class="rdr-card-head"><span class="rdr-label">직접 써보기</span><button class="rdr-link-btn" id="rdrTypeOpen">펼치기</button></div>
        <p class="rdr-hint">긴 문장이라 접어 두었어요. 따라 쓰기와 바꿔 쓰기는 필요할 때만 해 보세요.</p>`;
      $('#rdrTypeOpen').onclick = () => { st.typingOpen = true; renderWriteCard(); };
      return;
    }
    card.innerHTML = `
      <div class="rdr-card-head"><span class="rdr-label">직접 써보기</span>${tabs}</div>
      <div id="rdrWriteBody"></div>`;
    card.querySelectorAll('[data-wtab]').forEach((b) => {
      b.onclick = () => {
        st.writeTab = b.dataset.wtab;
        renderWriteCard();
        if (st.writeTab === 'para' && !st.para.task && !st.para.loadingTask) requestParaTask();
      };
    });
    if (st.writeTab === 'copy') renderCopyBody();
    else renderParaBody();
  }

  function renderCopyBody() {
    const st = S.study;
    $('#rdrWriteBody').innerHTML = `
      <div class="rdr-type-feedback" id="rdrTypeFeedback"></div>
      <textarea class="rdr-input rdr-textarea" id="rdrTypeInput" rows="3" placeholder="위 문장을 천천히 따라 써 보세요" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false">${esc(st.typed)}</textarea>
      <div class="rdr-type-status" id="rdrTypeStatus"></div>`;
    const input = $('#rdrTypeInput');
    input.addEventListener('input', () => { st.typed = input.value; st.dirty = true; renderTyping(); });
    renderTyping();
  }

  function renderParaBody() {
    const st = S.study;
    const p = st.para;
    let taskHtml;
    if (p.loadingTask) {
      taskHtml = '<div class="rdr-para-task rdr-para-loading"><span class="rdr-spinner rdr-spinner-sm"></span><span>이 문장에 맞는 과제를 고르는 중</span></div>';
    } else if (p.taskError) {
      taskHtml = `<div class="rdr-para-task"><span class="rdr-err-text">${esc(p.taskError)}</span><button class="rdr-link-btn" id="rdrParaNext">다시 시도</button></div>`;
    } else if (p.task) {
      taskHtml = `<div class="rdr-para-task">
          <div class="rdr-para-task-top"><span class="rdr-para-tag">과제</span><button class="rdr-link-btn" id="rdrParaNext">다른 과제</button></div>
          <b class="rdr-para-title">${esc(p.task)}</b>
          ${p.hint ? `<p class="rdr-hint">${esc(p.hint)}</p>` : ''}
        </div>`;
    } else {
      taskHtml = '';
    }
    const f = p.feedback;
    const v = f ? (VERDICT[f.meaning] || VERDICT.close) : null;
    $('#rdrWriteBody').innerHTML = `
      ${taskHtml}
      <textarea class="rdr-input rdr-textarea" id="rdrParaInput" rows="3" placeholder="같은 뜻을 과제에 맞게 영어로 써 보세요" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false">${esc(p.text)}</textarea>
      <div class="rdr-para-actions">
        ${p.example ? `<button class="rdr-link-btn" id="rdrParaExample">${p.exampleShown ? '예시 숨기기' : '예시 보기'}</button>` : '<span></span>'}
        <button class="rdr-btn rdr-btn-green-soft rdr-btn-sm" id="rdrParaCheck" ${p.checking ? 'disabled' : ''}>${p.checking ? '확인하는 중' : (f ? '다시 확인' : '확인')}</button>
      </div>
      ${p.exampleShown && p.example ? `<div class="rdr-para-example"><span class="rdr-para-tag rdr-para-tag-blue">예시</span><p>${esc(p.example)}</p></div>` : ''}
      ${f ? `<div class="rdr-para-feedback">
        <span class="rdr-verdict ${v.cls}">${v.label}</span>
        ${f.feedback ? `<p class="rdr-para-fb-text">${esc(f.feedback)}</p>` : ''}
        ${f.corrected ? `<div class="rdr-para-row"><span>고친 문장</span><p>${esc(f.corrected)}</p></div>` : ''}
        ${f.examples && f.examples.length ? `<div class="rdr-para-row"><span>이렇게도 쓸 수 있어요</span>${f.examples.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : ''}
      </div>` : ''}`;
    const input = $('#rdrParaInput');
    input.addEventListener('input', () => { p.text = input.value; st.dirty = true; });
    const next = $('#rdrParaNext');
    if (next) next.onclick = () => requestParaTask();
    const ex = $('#rdrParaExample');
    if (ex) ex.onclick = () => { p.exampleShown = !p.exampleShown; renderParaBody(); };
    $('#rdrParaCheck').onclick = checkParaphrase;
  }

  async function requestParaTask() {
    const st = S.study;
    const p = st.para;
    if (p.loadingTask) return;
    p.loadingTask = true;
    p.taskError = null;
    if (st.writeTab === 'para') renderParaBody();
    try {
      const d = await API.ai('paraphrase_task', { sentence: st.text, exclude: p.tasks });
      if (S.study !== st) return;
      p.task = d.task; p.hint = d.hint; p.example = d.example;
      p.tasks.push(d.task);
      p.exampleShown = false;
    } catch (e) {
      if (S.study !== st) return;
      p.taskError = userMessage(e, '과제를 만들지 못했습니다.');
    } finally {
      if (S.study === st) {
        p.loadingTask = false;
        if (st.writeTab === 'para') renderParaBody();
      }
    }
  }

  async function checkParaphrase() {
    const st = S.study;
    const p = st.para;
    const input = $('#rdrParaInput');
    if (input) p.text = input.value;
    if (!p.text.trim()) { toast('바꿔 쓴 문장을 먼저 입력해 주세요.'); return; }
    if (p.checking) return;
    p.checking = true;
    renderParaBody();
    try {
      const d = await API.ai('paraphrase_check', { sentence: st.text, task: p.task || '', attempt: p.text.trim() });
      if (S.study !== st) return;
      p.feedback = d;
      p.checkedNow = true;
      p.exampleShown = false;
    } catch (e) {
      if (S.study === st) toast(userMessage(e, '피드백을 받지 못했습니다.'));
    } finally {
      if (S.study === st) { p.checking = false; renderParaBody(); }
    }
  }

  function renderTyping() {
    const st = S.study;
    const fb = $('#rdrTypeFeedback');
    const status = $('#rdrTypeStatus');
    if (!fb || !st) return;
    const cmp = T.compareTyping(st.text, st.typed);
    fb.innerHTML = cmp.chars.map((c) => `<span class="rdr-c-${c.state}">${esc(c.ch)}</span>`).join('');
    if (!st.typed.trim()) status.textContent = '';
    else if (cmp.done) status.innerHTML = '<span class="rdr-ok-text">끝까지 따라 썼어요</span>';
    else {
      const typedLen = T.normalizeForTyping(st.typed).trim().length;
      const wrong = cmp.chars.filter((c) => c.state === 'bad').length;
      status.textContent = `${Math.min(typedLen, cmp.total)} / ${cmp.total}자${wrong ? ` · 다른 글자 ${wrong}개` : ''}`;
    }
  }

  function renderWords() {
    const st = S.study;
    const list = st.words.map((w, i) => ({ w, i })).filter(({ w }) => w.status !== 'pending');
    if (!list.length) return '';
    return list.map(({ w, i }) => {
      if (w.status === 'loading') {
        return `<div class="rdr-word rdr-word-loading"><div class="rdr-word-top"><b>${esc(w.surface)}</b><span class="rdr-spinner rdr-spinner-sm"></span></div><span class="rdr-hint">뜻을 찾는 중</span></div>`;
      }
      if (w.status === 'error') {
        return `<div class="rdr-word"><div class="rdr-word-top"><b>${esc(w.surface)}</b><button class="rdr-icon-btn rdr-icon-btn-sm" data-wdel="${i}" aria-label="삭제">${icon('x')}</button></div>
          <span class="rdr-err-text">${esc(w.error || '뜻을 가져오지 못했습니다.')}</span>
          <button class="rdr-link-btn" data-wretry="${i}">다시 시도</button></div>`;
      }
      const head = w.lemma && w.lemma.toLowerCase() !== String(w.surface).toLowerCase()
        ? `${esc(w.lemma)} <small>${esc(w.surface)}</small>` : esc(w.lemma || w.surface);
      return `<div class="rdr-word">
        <div class="rdr-word-top"><b>${head}</b>${w.pos ? `<span class="rdr-pos">${esc(w.pos)}</span>` : ''}
          <button class="rdr-icon-btn rdr-icon-btn-sm" data-wdel="${i}" aria-label="삭제">${icon('x')}</button></div>
        ${w.dict_meaning ? `<div class="rdr-word-dict">${esc(w.dict_meaning)}</div>` : ''}
        ${w.context_meaning ? `<div class="rdr-word-ctx"><span>이 문장에서</span>${esc(w.context_meaning)}</div>`
          : w.ctx === 'loading' ? '<div class="rdr-word-ctx rdr-ctx-wait"><span>이 문장에서</span><i class="rdr-dots">찾는 중</i></div>'
          : w.ctx === 'error' ? `<div class="rdr-ctx-err"><span>${esc(w.ctxError || '')}</span><button class="rdr-link-btn" data-wctx="${i}">다시 시도</button></div>` : ''}
        ${w.note ? `<div class="rdr-hint">${esc(w.note)}</div>` : ''}
      </div>`;
    }).join('');
  }

  /** 아직 뜻을 확인하지 않은(대기 중) 단어 칩 */
  function renderChips() {
    const st = S.study;
    const box = $('#rdrChips');
    const btn = $('#rdrLookupBtn');
    if (!box || !st) return;
    const pending = st.words.map((w, i) => ({ w, i })).filter(({ w }) => w.status === 'pending');
    box.innerHTML = pending.map(({ w, i }) =>
      `<span class="rdr-chip-word">${esc(w.surface)}<button data-wdel="${i}" aria-label="${esc(w.surface)} 빼기">${icon('x')}</button></span>`).join('');
    if (btn) btn.textContent = pending.length ? `뜻 확인 ${pending.length}` : '뜻 확인';
    box.querySelectorAll('[data-wdel]').forEach((b) => {
      b.onclick = () => { st.words.splice(Number(b.dataset.wdel), 1); refreshWords(); };
    });
  }

  function refreshWords() {
    const box = $('#rdrWords');
    if (!box) return;
    box.innerHTML = renderWords();
    bindWordCards();
    renderChips();
    const chosen = new Set(S.study.words.map((w) => String(w.surface).toLowerCase()));
    root.querySelectorAll('.rdr-w').forEach((el) => el.classList.toggle('rdr-w-on', chosen.has(el.textContent.toLowerCase())));
  }

  function bindWordCards() {
    $('#rdrWords').querySelectorAll('[data-wdel]').forEach((b) => {
      b.onclick = () => { S.study.words.splice(Number(b.dataset.wdel), 1); S.study.dirty = true; refreshWords(); };
    });
    $('#rdrWords').querySelectorAll('[data-wctx]').forEach((b) => {
      b.onclick = () => {
        const w = S.study.words[Number(b.dataset.wctx)];
        if (w) fetchContexts([w]);
      };
    });
    $('#rdrWords').querySelectorAll('[data-wretry]').forEach((b) => {
      b.onclick = () => { const w = S.study.words[Number(b.dataset.wretry)]; if (w) { w.status = 'pending'; lookupPending(); } };
    });
  }

  // 문장의 단어를 탭하면 '대기' 목록에 넣고 빼기만 한다. 뜻은 '뜻 확인'으로 한 번에 찾는다.
  function toggleWord(surface) {
    const st = S.study;
    const key = surface.toLowerCase();
    const idx = st.words.findIndex((w) => String(w.surface).toLowerCase() === key);
    if (idx >= 0) { st.words.splice(idx, 1); st.dirty = true; refreshWords(); return; }
    addPending(surface, false);
  }

  function addPending(raw, quiet) {
    const st = S.study;
    const surface = String(raw).replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, '').slice(0, 60);
    if (!surface) { if (!quiet) toast('영어 단어를 입력해 주세요.'); return; }
    if (st.words.some((w) => String(w.surface).toLowerCase() === surface.toLowerCase())) {
      if (!quiet) toast('이미 추가한 단어입니다.');
      return;
    }
    st.words.push({ surface, status: 'pending', isNew: true });
    API.dictLookup(surface); // 사전 뜻 미리 받아 두기 (AI 아님)
    st.dirty = true;
    refreshWords();
  }

  /** 대기 중인 단어를 모아 한 번의 요청으로 뜻을 가져온다 (10개씩) */
  /**
   * 대기 중인 단어의 뜻을 찾는다.
   *  1) 사전 뜻: AI 없이 단어별로 바로 (거의 즉시)
   *  2) 이 문장에서의 뜻: AI 한 번 요청으로 모아서 (10개씩)
   */
  async function lookupPending() {
    const st = S.study;
    const batch = st.words.filter((w) => w.status === 'pending');
    if (!batch.length) return;
    batch.forEach((w) => { w.status = 'loading'; });
    refreshWords();

    const dicts = await Promise.all(batch.map((w) => API.dictLookup(w.surface)));
    if (S.study !== st) return;
    batch.forEach((w, i) => {
      const d = dicts[i];
      if (d) Object.assign(w, { lemma: d.lemma, pos: d.pos, dict_meaning: d.dict_meaning, status: 'done', ctx: 'loading' });
    });
    refreshWords();
    await fetchContexts(batch);
  }

  async function fetchContexts(list) {
    const st = S.study;
    for (let i = 0; i < list.length; i += 10) {
      const part = list.slice(i, i + 10);
      part.forEach((w) => { if (w.status === 'done') w.ctx = 'loading'; });
      refreshWords();
      try {
        const d = await API.ai('words', { words: part.map((w) => w.surface), sentence: st.text });
        if (S.study !== st) return;
        const items = d.items || [];
        part.forEach((w, j) => {
          const it = items[j] || {};
          if (w.status === 'done') {
            w.context_meaning = it.context_meaning || '';
            w.note = it.note;
            if (!w.pos && it.pos) w.pos = it.pos;
            w.ctx = it.context_meaning ? undefined : 'error';
            if (!it.context_meaning) w.ctxError = '이 문장에서의 뜻을 찾지 못했습니다.';
          } else if (it.dict_meaning || it.context_meaning) {
            Object.assign(w, {
              lemma: it.lemma, pos: it.pos, dict_meaning: it.dict_meaning,
              context_meaning: it.context_meaning, note: it.note, status: 'done', ctx: undefined
            });
          } else {
            w.status = 'error';
            w.error = '뜻을 찾지 못했습니다. 철자를 확인해 주세요.';
          }
        });
      } catch (e) {
        if (S.study !== st) return;
        const msg = userMessage(e, '뜻을 가져오지 못했습니다.');
        part.forEach((w) => {
          if (w.status === 'done') { w.ctx = 'error'; w.ctxError = msg; }
          else { w.status = 'error'; w.error = msg; }
        });
      }
      refreshWords();
    }
  }

  async function showTranslation() {
    const st = S.study;
    if (st.translation) {
      st.translationViewed = true;
      renderStudy();
      return;
    }
    st.translationLoading = true;
    renderStudy();
    try {
      const d = await API.ai('translate', { sentence: st.text });
      if (S.study !== st) return;
      st.translation = d.translation;
      st.translationViewed = true;
    } catch (e) {
      toast(userMessage(e, '번역을 가져오지 못했습니다.'));
    } finally {
      if (S.study === st) { st.translationLoading = false; renderStudy(); }
    }
  }

  function playTts() {
    const st = S.study;
    if (!st) return;
    st.ttsCount += 1;
    TTS.speak(st.text, {
      rate: S.rate,
      onstart: () => { st.playing = true; updateTtsBtn(); },
      onend: () => { st.playing = false; updateTtsBtn(); },
      onerror: () => { st.playing = false; updateTtsBtn(); toast('음성을 재생하지 못했습니다.'); }
    });
  }

  function stopTts() {
    TTS.stop();
    if (S.study) { S.study.playing = false; updateTtsBtn(); }
  }

  function updateTtsBtn() {
    const b = $('#rdrTtsPlay');
    if (!b || !S.study) return;
    b.innerHTML = `${icon(S.study.playing ? 'pause' : 'play')}<span>${S.study.playing ? '멈춤' : '듣기'}</span>`;
  }

  async function leaveStudyOk() {
    const st = S.study;
    if (!st || !st.dirty) return true;
    return confirmSheet({
      title: '학습을 저장하지 않고 돌아갈까요?',
      body: '입력한 단어와 따라 쓰기 내용이 저장되지 않습니다.',
      ok: '돌아가기'
    });
  }

  async function backFromStudy() {
    if (!(await leaveStudyOk())) return;
    if (TTS) TTS.stop();
    S.study = null;
    showView('reader');
  }

  async function completeStudy() {
    const st = S.study;
    if (!st || st.saving || !S.row) return;
    if (st.words.some((w) => w.status === 'pending')) {
      toast('남은 단어의 뜻을 확인한 뒤 저장합니다');
      await lookupPending();
      if (S.study !== st) return;
    }
    if (st.words.some((w) => w.status === 'loading' || w.ctx === 'loading')) {
      toast('단어 뜻을 불러오는 중입니다. 잠시만 기다려 주세요.');
      return;
    }
    st.saving = true;
    const btn = $('#rdrStudyDone');
    btn.disabled = true;
    btn.textContent = '저장하는 중';
    if (TTS) TTS.stop();

    const ex = st.existing;
    const now = new Date().toISOString();
    const typedLen = T.normalizeForTyping(st.typed).trim().length;
    const record = {
      id: ex ? ex.id : undefined,
      book_id: S.row.id,
      spine_index: st.spineIndex,
      chapter_href: st.href,
      chapter_label: st.chapter,
      cfi_range: st.cfi,
      sentence_text: st.text,
      typed_text: st.typed,
      typing_mode: typedLen >= st.text.length * 0.5 ? 'typed' : (ex && ex.typing_mode) || 'skipped',
      translation: st.translation,
      translation_viewed: Boolean(st.translationViewed || (ex && ex.translation_viewed)),
      tts_play_count: ((ex && ex.tts_play_count) || 0) + st.ttsCount,
      completed_at: ex ? ex.completed_at : now,
      review_count: ex ? (ex.review_count || 0) + 1 : 0,
      last_reviewed_at: ex ? now : null
    };
    const para = st.para;
    if (para && para.text.trim()) {
      record.paraphrase_task = para.task || null;
      record.paraphrase_text = para.text.trim();
      record.paraphrase_feedback = para.feedback || null;
    }
    const words = st.words
      .filter((w) => w.status === 'done' || w.status === 'error')
      .map((w) => ({
        surface: w.surface, lemma: w.lemma, pos: w.pos,
        dict_meaning: w.dict_meaning, context_meaning: w.context_meaning, created_at: w.created_at
      }));

    try {
      const saved = await API.saveSentence(record, words);
      S.sentences = S.sentences.filter((r) => r.id !== saved.id && r.cfi_range !== saved.cfi_range);
      S.sentences.push(saved);
      if (S.log) {
        if (!ex) S.log.sentences_studied += 1;
        S.log.words_looked_up += st.words.filter((w) => w.isNew && w.status === 'done').length;
        if (st.translationViewed && !(ex && ex.translation_viewed)) S.log.translations_viewed += 1;
        scheduleLog();
      }
      // 경험치: 문장 학습 5 (복습 3) + 끝까지 따라 쓰기 2 + 해석 없이 이해 2
      let gained = 0;
      if (XP && XP.available()) {
        const typedDone = T.compareTyping(st.text, st.typed).done;
        const selfRead = !st.translationViewed && !(ex && ex.translation_viewed);
        const parts = [ex ? XP.RULES.review : XP.RULES.sentence];
        if (typedDone) parts.push(XP.RULES.typed);
        if (selfRead) parts.push(XP.RULES.selfRead);
        if (para && para.checkedNow && para.feedback) {
          if (para.feedback.task_done !== false) parts.push(XP.RULES.paraphrase);
          if (para.feedback.meaning === 'same') parts.push(XP.RULES.paraphraseSame);
        }
        gained = parts.reduce((a, r) => a + r.xp, 0);
        XP.award({ xp: gained, label: parts.length > 1 ? `${parts[0].label} 외 ${parts.length - 1}개` : parts[0].label });
      }
      S.study = null;
      clearPending(true);
      showView('reader');
      applyHighlights();
      toast((ex ? '복습을 기록했어요' : '학습한 문장을 표시했어요') + (gained ? `  +${gained} XP` : ''));
      if (saved.paraphraseSkipped) setTimeout(() => toast('바꿔 쓴 문장은 저장하지 못했어요. 안내드린 SQL을 실행해 주세요.', 4000), 2800);
    } catch (e) {
      toast(userMessage(e), 4000);
    } finally {
      st.saving = false;
      btn.disabled = false;
      btn.textContent = '학습 완료';
    }
  }

  // ---------------- GROW MENU 카드 자기등록 ----------------
  function registerFeatureCard() {
    const container = document.querySelector('#featureSelectionModal .feature-cards');
    if (!container) return false;
    if (document.getElementById('btnSelectReader')) return true;
    const card = document.createElement('div');
    card.className = 'feature-card rdr-feature-card';
    card.id = 'btnSelectReader';
    card.innerHTML = `
      <div class="feature-card-text">
        <div class="feature-card-title">원서 리더</div>
        <div class="feature-card-desc">영어 원서를 읽다 막힌 문장만 학습</div>
      </div>`;
    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.featureMenu && typeof window.featureMenu.close === 'function') window.featureMenu.close();
      else document.getElementById('featureSelectionModal').classList.add('hidden');
      open();
    });
    const english = document.getElementById('btnSelectEnglish');
    if (english && english.parentNode === container) english.after(card);
    else container.appendChild(card);
    // 카드 스타일은 메뉴를 열기 전에도 필요하므로 CSS 를 미리 로드
    if (!document.getElementById('rdr-styles-link')) {
      const link = document.createElement('link');
      link.id = 'rdr-styles-link';
      link.rel = 'stylesheet';
      link.href = 'reader/reader.css?v=1.7';
      document.head.appendChild(link);
    }
    return true;
  }

  function boot() {
    if (registerFeatureCard()) return;
    const obs = new MutationObserver(() => { if (registerFeatureCard()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.readerApp = { open, close };
})();
