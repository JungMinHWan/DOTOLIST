/**
 * 원서 리더 경험치(XP)
 *
 * Grow Quest 의 기존 레벨 시스템(user_stats, 레벨당 level*100 XP)에 그대로 쌓는다.
 *  - 기존 api.getUserStats / api.addRealtimeTaskXp 를 재사용 (js/supabase.js)
 *  - 페이지 넘길 때마다 서버에 쓰지 않도록 모아 두었다가 몇 초에 한 번 저장
 *  - 저장 후 메인 화면의 레벨 HUD(renderLevelHUD)도 함께 갱신
 */
(function () {
  const RULES = {
    page: { xp: 1, label: '페이지' },
    vocab: { xp: 1, label: '어휘 확인' },
    sentence: { xp: 5, label: '문장 학습' },
    review: { xp: 3, label: '복습' },
    typed: { xp: 2, label: '끝까지 따라 쓰기' },
    selfRead: { xp: 2, label: '해석 없이 이해' },
    paraphrase: { xp: 3, label: '바꿔 쓰기' },
    paraphraseSame: { xp: 2, label: '뜻 그대로 바꿔 쓰기' },
    listen: { xp: 3, label: '오늘의 문장 듣기' },
    word: { xp: 1, label: '단어 쓰기' },
    wordMastered: { xp: 3, label: '단어 외움' },
    chapter: { xp: 10, label: '챕터 완독' },
    book: { xp: 50, label: '책 완독' }
  };
  const PAGE_DAILY_CAP = 60;
  const FLUSH_DELAY_MS = 6000;

  let stats = null;          // 서버 기준 { level, xp }
  let pending = 0;           // 아직 저장하지 않은 XP
  let flushing = false;
  let timer = null;
  let loading = null;
  const listeners = new Set();

  function today() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* noop */ } }

  function need(level) { return Math.max(1, level) * 100; }

  function apply(base, add) {
    let level = base.level || 1;
    let xp = (base.xp || 0) + add;
    while (xp >= need(level)) { xp -= need(level); level += 1; }
    if (xp < 0) xp = 0;
    return { level, xp, need: need(level) };
  }

  function api() { return window.api && typeof window.api.addRealtimeTaskXp === 'function' ? window.api : null; }

  function available() { return Boolean(api()); }

  async function init() {
    if (!api()) return null;
    if (loading) return loading;
    loading = (async () => {
      try {
        const s = await api().getUserStats();
        if (s && typeof s.level === 'number') stats = { level: s.level, xp: s.xp || 0 };
      } catch (e) { /* 레벨 정보를 못 읽어도 리더는 동작 */ }
      if (!stats) stats = { level: 1, xp: 0 };
      emit(null);
      return stats;
    })();
    const r = await loading;
    loading = null;
    return r;
  }

  function view() {
    if (!stats) return null;
    return apply(stats, pending);
  }

  function todayXp() { return lsGet(`rdr-xp-today-${today()}`, 0); }

  function emit(evt) { listeners.forEach((fn) => { try { fn(evt, view()); } catch (e) { /* noop */ } }); }

  /**
   * kind: RULES 의 키 또는 { xp, label } 직접 지정
   * return 실제 지급 XP (일일 상한 등으로 0일 수 있음)
   */
  function award(kind, extra) {
    if (!available()) return 0;
    const rule = typeof kind === 'string' ? RULES[kind] : kind;
    if (!rule) return 0;
    let amount = rule.xp;
    if (kind === 'page') {
      const key = `rdr-xp-page-${today()}`;
      const used = lsGet(key, 0);
      if (used >= PAGE_DAILY_CAP) return 0;
      lsSet(key, used + amount);
    }
    if (amount <= 0) return 0;
    const before = view();
    pending += amount;
    lsSet(`rdr-xp-today-${today()}`, todayXp() + amount);
    const after = view();
    const leveled = Boolean(before && after && after.level > before.level);
    emit({ amount, label: (extra && extra.label) || rule.label, leveled, level: after ? after.level : null });
    clearTimeout(timer);
    if (leveled) flush();
    else timer = setTimeout(flush, FLUSH_DELAY_MS);
    return amount;
  }

  async function flush() {
    clearTimeout(timer);
    if (flushing || pending <= 0 || !api()) return;
    flushing = true;
    const amount = pending;
    pending = 0;
    try {
      const res = await api().addRealtimeTaskXp(amount);
      if (res && res.success && res.stats) {
        stats = { level: res.stats.level, xp: res.stats.xp };
        syncMainApp(res.stats);
      } else {
        pending += amount; // 실패하면 다음에 다시
      }
    } catch (e) {
      pending += amount;
    } finally {
      flushing = false;
      emit(null);
    }
  }

  function syncMainApp(s) {
    try {
      // app.js 의 전역 let userStats 와 HUD 를 함께 갱신
      // eslint-disable-next-line no-undef
      if (typeof userStats !== 'undefined') userStats = s;
      if (typeof window.renderLevelHUD === 'function') window.renderLevelHUD(s);
      // eslint-disable-next-line no-undef
      else if (typeof renderLevelHUD === 'function') renderLevelHUD(s);
    } catch (e) { /* noop */ }
  }

  /** 같은 책/챕터에 한 번만 주는 보상 */
  function once(key) {
    const k = `rdr-xp-once-${key}`;
    if (lsGet(k, false)) return false;
    lsSet(k, true);
    return true;
  }

  window.ReaderXP = {
    RULES, PAGE_DAILY_CAP,
    available, init, view, award, flush, once, todayXp,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
