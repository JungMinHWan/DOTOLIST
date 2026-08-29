/**
 * real_estate/re_ui.js
 * 실거래 신호 탐지 UI 독립 모듈 (Self-Registration 자기등록 방식)
 * 유일한 접점: index.html 하단 <script src="real_estate/re_ui.js"></script> 1줄
 */

(function () {
  'use strict';

  // 로컬 개발 편의용 권한 주입.
  // ⚠️ 배포 환경에서 이 코드가 돌면 app.js 의 IP/디바이스 확인이 무력화되므로
  //    localhost 에서만 동작하도록 제한합니다.
  const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

  if (IS_LOCAL_DEV) {
    (async function autoSetDevAuth() {
      try {
        if (!localStorage.getItem('todo_device_id')) {
          localStorage.setItem('todo_device_id', 'authorized_dev_device');
        }
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        if (data && data.ip) {
          localStorage.setItem('todo_user_ip', data.ip);
        }
      } catch (e) {}
    })();
  }

  // 기존 버그: 기준일이 '2026-08-17' 로 하드코딩되어 있어 날짜가 지나면
  // 헤더 표기와 '최근 N일' 필터가 모두 어긋납니다.
  function todayString() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  /**
   * 네이버 부동산 검색 URL.
   *
   * 기존에는 '서울시 + 구 + 동 + 단지명' 4토큰으로 검색해 매칭 실패가 잦았습니다.
   * (예: "서울시 양천구 신월동 목동센트럴아이파크위브1단지" → 검색결과 없음)
   * 네이버 단지 검색은 토큰이 많을수록 실패하므로 '동 + 단지명' 2토큰으로 줄이고,
   * 국토부에만 있는 괄호 별칭(예: "창동주공3단지(해등마을)")은 제거합니다.
   */
  function naverComplexName(aptName) {
    return String(aptName || '')
      .replace(/\([^)]*\)/g, ' ')   // 괄호 별칭 제거
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 네이버 검색용으로 단지명을 "넓힌" 형태.
   *
   * 국토부는 같은 단지의 블록을 'N단지' 로 나눠 표기하지만
   * 네이버·호갱노노·KB 등은 대개 접미사 없는 이름을 씁니다.
   *   국토부 '목동센트럴아이파크위브1단지' → 네이버 '목동센트럴아이파크위브'
   * 그래서 끝의 'N단지' 를 떼고 검색합니다.
   *
   * 접미사를 떼면 '창동주공3단지' → '창동주공' 처럼 넓어지는 경우도 있는데,
   * 이때 네이버는 창동주공 1~4단지 목록을 보여줍니다.
   * 즉 실패해도 '결과 없음' 막다른 길이 아니라 후보 목록이 나오므로,
   * 정확도를 조금 잃더라도 항상 뭔가 보이는 쪽이 낫습니다.
   */
  function naverBroadName(aptName) {
    const full = naverComplexName(aptName);
    const stripped = full.replace(/\s*\d+\s*단지\s*$/, '').trim();
    return stripped.length >= 2 ? stripped : full;
  }

  function naverLandUrlFor(dong, name) {
    const q = `${dong || ''} ${name}`.trim();
    return `https://m.land.naver.com/search/result/${encodeURIComponent(q)}`;
  }

  function naverLandUrl(s) {
    return naverLandUrlFor(s.dong, naverComplexName(s.apt_name));
  }

  /**
   * 네이버 부동산은 "정확한 단지명"만 받습니다. 부분 일치·접두 검색이 안 돼요.
   *   '창동 창동주공3단지'            → ✅   '창동 창동주공'                → ❌
   *   '신월동 목동센트럴아이파크위브'  → ✅   '신월동 ...아이파크위브1단지' → ❌
   * 그런데 국토부 이름의 'N단지' 가 실제 단지명의 일부인지, 국토부가 블록을
   * 구분하려고 붙인 건지는 데이터만으로 알 수 없습니다.
   * (전체 5,915개 단지명 중 207개(3.5%)가 여기 해당)
   *
   * 그래서 추측하지 않고, 애매한 경우에만 두 가지를 모두 제시합니다.
   * 나머지 96.5% 는 지금처럼 바로 링크로 엽니다.
   */
  function naverVariants(s) {
    const full = naverComplexName(s.apt_name);
    const broad = naverBroadName(s.apt_name);
    const list = [{ name: full, label: full, note: '국토부 표기 그대로' }];
    if (broad && broad !== full) {
      list.push({ name: broad, label: broad, note: '단지번호 제외' });
    }
    return list.map(v => ({ ...v, url: naverLandUrlFor(s.dong, v.name) }));
  }

  /** 통합검색 폴백 — 여기서는 국토부 원래 이름을 그대로 써서 정확도를 살립니다. */
  function naverSearchUrl(s) {
    const q = `${s.gu || ''} ${naverComplexName(s.apt_name)} 아파트`.trim();
    return `https://m.search.naver.com/search.naver?query=${encodeURIComponent(q)}`;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * 검색어에 해당하는 부분을 <mark> 로 감쌉니다.
   * 서버 검색이 공백을 무시하므로(예: '래미안푸르지오' -> '래미안 푸르지오' 매칭)
   * 하이라이트도 공백을 건너뛰며 위치를 찾습니다.
   */
  function highlight(text, term) {
    const safe = escapeHtml(text);
    if (!term) return safe;

    const tokens = term.split(/\s+/).map(t => t.replace(/\s/g, '').toLowerCase()).filter(Boolean);
    if (!tokens.length) return safe;

    const raw = String(text == null ? '' : text);
    const ranges = [];

    for (const tok of tokens) {
      // 원문에서 공백을 건너뛰며 토큰을 찾아 실제 시작/끝 인덱스를 구합니다.
      for (let i = 0; i < raw.length; i++) {
        let j = i, k = 0;
        while (j < raw.length && k < tok.length) {
          const ch = raw[j].toLowerCase();
          if (ch === ' ') { j++; continue; }
          if (ch !== tok[k]) break;
          j++; k++;
        }
        if (k === tok.length) { ranges.push([i, j]); break; }
      }
    }
    if (!ranges.length) return safe;

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (const r of ranges.slice(1)) {
      const last = merged[merged.length - 1];
      if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r);
    }

    let out = '', cursor = 0;
    for (const [s, e] of merged) {
      out += escapeHtml(raw.slice(cursor, s)) + '<mark class="re-hl">' + escapeHtml(raw.slice(s, e)) + '</mark>';
      cursor = e;
    }
    return out + escapeHtml(raw.slice(cursor));
  }

  const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

  if (!document.getElementById('re-styles-link')) {
    const link = document.createElement('link');
    link.id = 're-styles-link';
    link.rel = 'stylesheet';
    link.href = 'real_estate/re_styles.css?v=1.8';
    document.head.appendChild(link);
  }

  const GU_LIST = [
    '전체', '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
    '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
  ];

  /** 한 탭으로 붙이는 기본 라벨 */
  const PRESET_LABELS = [
    { text: '관심', emoji: '⭐' },
    { text: '방문예정', emoji: '👣' },
    { text: '보류', emoji: '⏸' },
    { text: '재검토', emoji: '🔁' }
  ];

  /** 실거래가(최근 거래가) 구간 필터 — 값은 만원 단위 [최소, 최대) */
  const PRICE_RANGES = [
    { value: '전체',   label: '전체 가격' },
    { value: '0-50000',        label: '5억 미만' },
    { value: '50000-100000',   label: '5억 ~ 10억' },
    { value: '100000-150000',  label: '10억 ~ 15억' },
    { value: '150000-200000',  label: '15억 ~ 20억' },
    { value: '200000-300000',  label: '20억 ~ 30억' },
    { value: '300000-',        label: '30억 이상' }
  ];

  const FLAG_LABEL_MAP = {
    'SINGLE_OUTLIER': { text: '단발 이상거래', class: 're-tag-single-outlier' },
    'HIGH_VARIANCE': { text: '시세 변동 큼', class: 're-tag-high-variance' },
    'LEGACY_RENTAL': { text: '임대감면 대상', class: 're-tag-legacy-rental' },
    'BULK_PUBLIC': { text: '공공 통매입', class: 're-tag-bulk-public' },
    'SAME_DAY_REGIST': { text: '당일 등기', class: 're-tag-same-day' },
    'SMALL_SAMPLE': { text: '표본 적음', class: 're-tag-small-sample' }
  };

  class RealEstateUI {
    constructor() {
      this.signals = [];
      this.modalEl = null;
      this.detailModalEl = null;
      this.activeGu = '전체';
      this.minScore = 30; // re_config 의 min_score_threshold 와 일치 (0점은 대부분 노이즈)
      this.searchTerm = '';
      this.searchTimer = null;
      this.fetchSeq = 0;
      this.labelMap = {};        // complex_key|area_bucket -> [라벨...]
      this.labelCounts = [];     // 사용 중인 라벨 목록
      this.activeLabel = '전체'; // 모아보기 필터
      this.viewMode = 'signals'; // 'signals' | 'labeled'
      this.activePrice = '전체';
      this.filtersOpen = false;   // 모바일 기본 접힘 (데스크톱은 CSS 로 항상 펼침)
      this.historyDepth = 0;
      this.suppressPop = false;
      this.historyBound = false;
      this.activePyeong = '전체';
      this.activeFlagFilter = '전체';
      this.activeDateDays = '전체';
      this.activeSort = 'score';
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;
      if (!this.registerFeatureCard()) {
        this.observeDOM();
      }
      // 외부 사이트(네이버 부동산)에 다녀와 페이지가 새로 로드된 경우
      // 직전에 보던 목록과 검색어를 되살립니다.
      this.restoreState();
    }

    observeDOM() {
      // 기존 버그: 카드 등록 후에도 옵저버가 계속 살아 있어
      // body 전체의 모든 DOM 변경마다 콜백이 도는 상태였습니다. 등록되면 해제합니다.
      this._observer = new MutationObserver(() => {
        if (this.registerFeatureCard() && this._observer) {
          this._observer.disconnect();
          this._observer = null;
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true });
    }

    registerFeatureCard() {
      const container = document.querySelector('#featureSelectionModal .feature-cards') || document.querySelector('.feature-cards');
      if (!container) return false;

      if (document.getElementById('re-feature-card-item')) return true;

      const card = document.createElement('div');
      card.id = 're-feature-card-item';
      card.className = 'feature-card re-feature-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div>
          <div class="re-feature-title">
            실거래가
          </div>
          <div class="re-feature-desc">
            서울 25개 구 아파트 실거래가 및 급매·하락 신호 탐지 모니터링
          </div>
        </div>
        <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #60a5fa; background: rgba(59, 130, 246, 0.2); padding: 3px 8px; border-radius: 9999px;">실거래 신호</span>
          <span style="font-size: 13px; color: #cbd5e1; font-weight: 600;">열기 →</span>
        </div>
      `;

      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.featureMenu && typeof window.featureMenu.close === 'function') {
          window.featureMenu.close();
        } else {
          const parentModal = document.getElementById('featureSelectionModal');
          if (parentModal) {
            parentModal.classList.add('hidden');
          }
        }

        this.openModal();
      });

      container.appendChild(card);
      return true;
    }

    /* ============================================================
     * 화면 상태 보존
     *
     * 네이버 부동산 링크는 외부 사이트로 나가는데, PWA(standalone) 에서는
     * 돌아올 때 페이지가 새로 로드되는 경우가 많습니다. 그러면 모달이 닫히고
     * 입력했던 검색어와 필터가 전부 날아갑니다.
     * ("뒤로가기하면 화면은 나오는데 검색은 안 되는" 증상)
     *
     * sessionStorage(탭 단위) 에 상태를 남겨 두었다가 복원합니다.
     * ============================================================ */
    saveState() {
      try {
        sessionStorage.setItem('re_ui_state', JSON.stringify({
          open: this.isListOpen(),
          searchTerm: this.searchTerm,
          activeGu: this.activeGu,
          minScore: this.minScore,
          activeSort: this.activeSort,
          activePyeong: this.activePyeong,
          activeDateDays: this.activeDateDays,
          activeFlagFilter: this.activeFlagFilter,
          activePrice: this.activePrice,
          viewMode: this.viewMode,
          activeLabel: this.activeLabel,
          filtersOpen: this.filtersOpen,
          scrollTop: this.modalEl
            ? (this.modalEl.querySelector('.re-modal-body')?.scrollTop || 0) : 0,
          ts: Date.now()
        }));
      } catch (e) { /* 사파리 프라이빗 모드 등 */ }
    }

    restoreState() {
      let st = null;
      try { st = JSON.parse(sessionStorage.getItem('re_ui_state') || 'null'); } catch (e) {}
      if (!st || !st.open) return false;

      // 30분 넘게 지난 상태는 복원하지 않습니다.
      if (st.ts && Date.now() - st.ts > 30 * 60 * 1000) return false;

      this.searchTerm = st.searchTerm || '';
      this.activeGu = st.activeGu || '전체';
      this.minScore = Number.isFinite(st.minScore) ? st.minScore : 30;
      this.activeSort = st.activeSort || 'score';
      this.activePyeong = st.activePyeong || '전체';
      this.activeDateDays = st.activeDateDays || '전체';
      this.activeFlagFilter = st.activeFlagFilter || '전체';
      this.activePrice = st.activePrice || '전체';
      this.viewMode = st.viewMode || 'signals';
      this.activeLabel = st.activeLabel || '전체';
      this.filtersOpen = !!st.filtersOpen;
      this._restoreScrollTop = st.scrollTop || 0;

      this.openModal();
      this.syncControls();
      return true;
    }

    /** 복원한 값들을 실제 입력 요소에 반영 */
    syncControls() {
      if (!this.modalEl) return;
      const set = (id, val) => { const el = this.modalEl.querySelector(id); if (el) el.value = val; };
      set('#re-search-input', this.searchTerm);
      set('#re-filter-gu', this.activeGu);
      set('#re-filter-score', String(this.minScore));
      set('#re-filter-sort', this.activeSort);
      set('#re-filter-pyeong', this.activePyeong);
      set('#re-filter-date', this.activeDateDays);
      set('#re-filter-flag', this.activeFlagFilter);
      set('#re-filter-price', this.activePrice);
      const tabs = this.modalEl.querySelectorAll('.re-tab');
      tabs.forEach(t => t.classList.toggle('on', t.dataset.view === this.viewMode));
      const bar = this.modalEl.querySelector('#re-label-bar');
      if (bar) bar.style.display = this.viewMode === 'labeled' ? 'flex' : 'none';
      const sb = this.modalEl.querySelector('.re-search-bar');
      if (sb) sb.style.display = this.viewMode === 'labeled' ? 'none' : '';
      this.applyFilterCollapse();
      const clear = this.modalEl.querySelector('#re-search-clear');
      if (clear) clear.style.display = this.searchTerm ? 'flex' : 'none';
    }

    /* ============================================================
     * 뒤로가기(브라우저/안드로이드 백버튼, iOS 스와이프) 대응
     *
     * 모달을 열 때 history 항목을 하나 쌓아두고, popstate 가 오면 모달을 닫습니다.
     * 이렇게 하지 않으면 모달이 열린 상태에서 뒤로가기를 눌렀을 때
     * 앱 밖으로 나가버리고, 네이버 부동산에 다녀온 뒤에도 원래 화면으로
     * 돌아오지 못했습니다.
     *
     * depth = 우리가 쌓아둔 history 항목 수. 닫을 때 history.back() 으로 되감아
     * 히스토리가 한쪽으로 계속 쌓이지 않게 합니다.
     * ============================================================ */
    pushHistory(kind) {
      try {
        history.pushState({ reModal: kind, reDepth: ++this.historyDepth }, '');
      } catch (e) { /* history 사용 불가 환경은 그냥 무시 */ }
    }

    popHistory() {
      if (this.historyDepth > 0) {
        this.historyDepth--;
        this.suppressPop = true;   // 우리가 유발한 popstate 는 핸들러에서 무시
        try { history.back(); } catch (e) { this.suppressPop = false; }
      }
    }

    bindHistory() {
      if (this.historyBound) return;
      this.historyBound = true;

      window.addEventListener('popstate', () => {
        if (this.suppressPop) { this.suppressPop = false; return; }

        // 뒤로가기 → 위에 떠 있는 것부터 하나씩 닫기
        if (this.isLabelSheetOpen()) {
          this.closeLabelSheet();
          this.suppressPop = true;
          try { history.forward(); } catch (e) { this.suppressPop = false; }
          return;
        }
        if (this.isSheetOpen()) {
          this.closeNaverChooser();
          this.suppressPop = true;
          try { history.forward(); } catch (e) { this.suppressPop = false; }
          return;
        }
        if (this.isDetailOpen()) {
          this.historyDepth = Math.max(0, this.historyDepth - 1);
          this.hideDetail();
        } else if (this.isListOpen()) {
          this.historyDepth = Math.max(0, this.historyDepth - 1);
          this.hideList();
          this.saveState();
        }
      });
    }

    /* ============================================================
     * 관심 단지 라벨 (Supabase re_watchlist, 기기 간 동기화)
     * ============================================================ */
    /** 라벨 기능 설치 여부를 UI 에 반영 */
    applyLabelAvailability() {
      if (!this.modalEl) return;
      const tab = this.modalEl.querySelector('#re-tab-labeled');
      if (tab) tab.style.display = this.labelsEnabled === false ? 'none' : '';
    }

    labelKey(s) { return `${s.complex_key}|${s.area_bucket}`; }
    labelsOf(s) { return this.labelMap[this.labelKey(s)] || []; }

    async rpc(name, payload) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    /** 라벨 전체를 불러와 캐시에 담습니다. 미설치(PGRST202)면 조용히 비활성화. */
    async loadLabels() {
      try {
        const rows = await this.rpc('re_get_labeled', { p_label: null });
        this.labelMap = {};
        (rows || []).forEach(r => {
          this.labelMap[`${r.complex_key}|${r.area_bucket}`] = r.labels || [];
        });
        this.labelCounts = (await this.rpc('re_list_labels', {})) || [];
        this.labelsEnabled = true;
        this.applyLabelAvailability();
      } catch (e) {
        if (e.status === 404 || (e.body || '').includes('PGRST202')) {
          this.labelsEnabled = false;
          this.applyLabelAvailability();
          console.warn('[실거래 신호 탐지] 라벨 기능 미설치 → real_estate/re_labels.sql 을 실행하세요.');
        } else {
          console.error('[실거래 신호 탐지] 라벨 조회 실패:', e);
        }
      }
    }

    async setLabels(s, labels) {
      const key = this.labelKey(s);
      const prev = this.labelMap[key] || [];
      this.labelMap[key] = labels;            // 낙관적 반영
      this.renderList();

      try {
        await this.rpc('re_set_labels', {
          p_complex_key: s.complex_key,
          p_area_bucket: s.area_bucket,
          p_labels: labels,
          p_gu: s.gu, p_dong: s.dong, p_apt_name: s.apt_name, p_pyeong: s.pyeong
        });
        if (labels.length === 0) delete this.labelMap[key];
        this.labelCounts = (await this.rpc('re_list_labels', {})) || [];
        if (this.viewMode === 'labeled') this.fetchSignals();
        else this.renderLabelBar();
      } catch (e) {
        this.labelMap[key] = prev;            // 실패 시 되돌리기
        console.error('[실거래 신호 탐지] 라벨 저장 실패:', e);

        if (e.status === 404 || (e.body || '').includes('PGRST202')) {
          // 기능 자체가 아직 설치되지 않은 경우 — 기능을 끄고 안내만 남깁니다.
          this.labelsEnabled = false;
          this.closeLabelSheet();
          this.renderList();
          this.showLabelSetupNotice();
        } else {
          this.renderList();
          alert('라벨 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }
    }

    toggleLabel(s, label) {
      const cur = this.labelsOf(s);
      const next = cur.includes(label) ? cur.filter(l => l !== label) : cur.concat(label);
      this.setLabels(s, next);
    }

    /** 기본값이 아닌 필터의 개수와 요약 문구 */
    activeFilterInfo() {
      const items = [];
      if (this.activeGu !== '전체') items.push(this.activeGu);
      if (this.minScore !== 30) items.push(this.minScore + '점 이상');
      if (this.activeDateDays !== '전체') items.push('최근 ' + this.activeDateDays + '일');
      if (this.activePyeong !== '전체') {
        const m = { under20: '20평 미만', '20s': '20평대', '30s': '30평대', over40: '40평 이상' };
        items.push(m[this.activePyeong] || this.activePyeong);
      }
      if (this.activePrice !== '전체') {
        const r = PRICE_RANGES.find(x => x.value === this.activePrice);
        items.push(r ? r.label : this.activePrice);
      }
      if (this.activeFlagFilter !== '전체') items.push('플래그 제외');
      if (this.activeSort !== 'score') {
        items.push(this.activeSort === 'drop_rate' ? '하락률순' : '최근거래순');
      }
      return { count: items.length, text: items.length ? items.join(' · ') : '필터' };
    }

    applyFilterCollapse() {
      if (!this.modalEl) return;
      const bar = this.modalEl.querySelector('#re-filter-bar');
      const btn = this.modalEl.querySelector('#re-filter-toggle');
      const caret = this.modalEl.querySelector('.re-filter-caret');
      if (!bar || !btn) return;

      bar.classList.toggle('collapsed', !this.filtersOpen);
      btn.setAttribute('aria-expanded', this.filtersOpen ? 'true' : 'false');
      if (caret) caret.textContent = this.filtersOpen ? '▴' : '▾';

      const info = this.activeFilterInfo();
      const sum = this.modalEl.querySelector('#re-filter-summary');
      const cnt = this.modalEl.querySelector('#re-filter-count');
      if (sum) sum.textContent = info.text;
      if (cnt) {
        cnt.textContent = info.count;
        cnt.style.display = info.count ? 'inline-flex' : 'none';
      }
      btn.classList.toggle('has-filter', info.count > 0);
    }

    renderLabelBar() {
      const bar = this.modalEl && this.modalEl.querySelector('#re-label-bar');
      if (!bar) return;
      const total = (this.labelCounts || []).reduce((a, b) => a + Number(b.cnt || 0), 0);
      bar.innerHTML = `
        <button type="button" class="re-label-filter ${this.activeLabel === '전체' ? 'on' : ''}" data-label="전체">
          전체 ${total ? `<b>${total}</b>` : ''}
        </button>
        ${(this.labelCounts || []).map(l => `
          <button type="button" class="re-label-filter ${this.activeLabel === l.label ? 'on' : ''}"
                  data-label="${escapeHtml(l.label)}">
            ${escapeHtml(l.label)} <b>${l.cnt}</b>
          </button>
        `).join('')}
      `;
    }

    /** 라벨 기능 미설치 안내 */
    showLabelSetupNotice() {
      this.closeLabelSheet();
      const sheet = document.createElement('div');
      sheet.className = 're-label-sheet';
      sheet.innerHTML = `
        <div class="re-label-card" role="dialog">
          <div class="re-label-title">라벨 기능이 아직 설치되지 않았어요</div>
          <div class="re-label-sub">
            Supabase SQL Editor 에서 아래 파일을 한 번 실행하면 바로 쓸 수 있습니다.
          </div>
          <div class="re-setup-path">real_estate/re_labels.sql</div>
          <div class="re-label-sub" style="margin-top:12px;">
            실행 후 이 화면을 새로고침해 주세요.
          </div>
          <button type="button" class="re-label-close">확인</button>
        </div>
      `;
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('.re-label-close')) this.closeLabelSheet();
      });
      document.body.appendChild(sheet);
      this.labelSheetEl = sheet;
    }

    /** 라벨 붙이기 시트 */
    openLabelSheet(s) {
      this.closeLabelSheet();
      const cur = this.labelsOf(s);
      const custom = cur.filter(l => !PRESET_LABELS.some(p => p.text === l));

      const sheet = document.createElement('div');
      sheet.className = 're-label-sheet';
      sheet.innerHTML = `
        <div class="re-label-card" role="dialog" aria-label="라벨 붙이기">
          <div class="re-label-title">라벨 붙이기</div>
          <div class="re-label-sub">${escapeHtml(s.apt_name)} · ${s.pyeong}평</div>

          <div class="re-label-grid">
            ${PRESET_LABELS.map(pl => `
              <button type="button" class="re-label-chip ${cur.includes(pl.text) ? 'on' : ''}"
                      data-label="${escapeHtml(pl.text)}">
                <span>${pl.emoji}</span> ${escapeHtml(pl.text)}
              </button>
            `).join('')}
            ${custom.map(c => `
              <button type="button" class="re-label-chip on re-label-custom" data-label="${escapeHtml(c)}">
                <span>🏷</span> ${escapeHtml(c)}
              </button>
            `).join('')}
          </div>

          <div class="re-label-input-row">
            <input type="text" class="re-label-input" id="re-label-input"
                   placeholder="직접 입력 (예: 처형한 대온단지)" maxlength="20" autocomplete="off" />
            <button type="button" class="re-label-add" id="re-label-add">추가</button>
          </div>

          <button type="button" class="re-label-close">완료</button>
        </div>
      `;

      const input = () => sheet.querySelector('#re-label-input');

      const addCustom = () => {
        const v = (input().value || '').trim().slice(0, 20);
        if (!v) return;
        if (!this.labelsOf(s).includes(v)) this.toggleLabel(s, v);
        input().value = '';
        this.closeLabelSheet();
        this.openLabelSheet(s);   // 갱신된 상태로 다시 그림
      };

      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('.re-label-close')) {
          this.closeLabelSheet();
          return;
        }
        const chip = e.target.closest('.re-label-chip');
        if (chip) {
          const label = chip.dataset.label;
          chip.classList.toggle('on');
          this.toggleLabel(s, label);
          return;
        }
        if (e.target.closest('#re-label-add')) addCustom();
      });

      sheet.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.id === 're-label-input') {
          e.preventDefault();
          addCustom();
        }
      });

      document.body.appendChild(sheet);
      this.labelSheetEl = sheet;
    }

    closeLabelSheet() {
      if (this.labelSheetEl) { this.labelSheetEl.remove(); this.labelSheetEl = null; }
    }

    isLabelSheetOpen() { return !!this.labelSheetEl; }

    /* 네이버 단지명 선택 시트 (애매한 3.5% 단지에서만 사용) */
    openNaverChooser(info) {
      this.closeNaverChooser();

      const variants = naverVariants(info);
      const sheet = document.createElement('div');
      sheet.className = 're-naver-sheet';
      sheet.innerHTML = `
        <div class="re-naver-sheet-card" role="dialog" aria-label="네이버 부동산 검색어 선택">
          <div class="re-naver-sheet-title">어떤 이름으로 검색할까요?</div>
          <div class="re-naver-sheet-desc">
            국토부와 네이버의 단지명 표기가 달라 둘 다 준비했습니다.
            하나가 안 나오면 다른 쪽을 눌러보세요.
          </div>
          ${variants.map(v => `
            <a class="re-naver-sheet-item" href="${v.url}" target="_blank" rel="noopener noreferrer">
              <span class="re-naver-sheet-name">${escapeHtml(info.dong)} ${escapeHtml(v.label)}</span>
              <span class="re-naver-sheet-note">${escapeHtml(v.note)}</span>
            </a>
          `).join('')}
          <a class="re-naver-sheet-item re-naver-sheet-alt" href="${naverSearchUrl(info)}" target="_blank" rel="noopener noreferrer">
            <span class="re-naver-sheet-name">네이버 통합검색</span>
            <span class="re-naver-sheet-note">위 두 개가 모두 안 나올 때</span>
          </a>
          <button type="button" class="re-naver-sheet-close">닫기</button>
        </div>
      `;

      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('.re-naver-sheet-close')) {
          this.closeNaverChooser();
        }
        // 링크를 누르면 새 탭이 열리므로 시트를 정리합니다.
        if (e.target.closest('.re-naver-sheet-item')) {
          setTimeout(() => this.closeNaverChooser(), 80);
        }
      });

      document.body.appendChild(sheet);
      this.naverSheetEl = sheet;
    }

    closeNaverChooser() {
      if (this.naverSheetEl) {
        this.naverSheetEl.remove();
        this.naverSheetEl = null;
      }
    }

    isSheetOpen() { return !!this.naverSheetEl; }

    isListOpen() { return !!this.modalEl && this.modalEl.style.display === 'flex'; }
    isDetailOpen() { return !!this.detailModalEl && this.detailModalEl.style.display === 'flex'; }

    hideList() { if (this.modalEl) this.modalEl.style.display = 'none'; }
    hideDetail() { if (this.detailModalEl) this.detailModalEl.style.display = 'none'; }

    openModal() {
      if (!this.modalEl) {
        this.createModalDOM();
      }
      this.bindHistory();
      this.modalEl.style.display = 'flex';
      this.pushHistory('list');
      this.saveState();
      this.fetchSignals();
    }

    closeModal() {
      if (!this.isListOpen()) return;
      this.hideList();
      this.saveState();
      this.popHistory();
    }

    closeDetailModal() {
      if (!this.isDetailOpen()) return;
      this.hideDetail();
      this.popHistory();
    }

    createModalDOM() {
      const overlay = document.createElement('div');
      overlay.className = 're-modal-overlay';
      overlay.style.display = 'none';

      overlay.innerHTML = `
        <div class="re-modal-container">
          <div class="re-modal-header">
            <div class="re-header-title-group">
              <div class="re-header-icon">📉</div>
              <div>
                <h3 class="re-header-title">
                  실거래 신호 탐지
                  <button type="button" class="re-date-pill re-refresh-btn" id="re-refresh-btn" title="클릭하여 국토부 실거래가 API 최신 데이터 갱신">
                    <span class="re-refresh-icon">🔄</span>
                    <span class="re-refresh-text">${todayString()} 기준 (갱신)</span>
                  </button>
                </h3>
                <div class="re-header-subtitle">서울 25개 구 아파트 매매 급매 및 하락 변동 신호 모니터링 (카드를 클릭하면 국토부 원본 데이터를 확인합니다)</div>
              </div>
            </div>
            <button class="re-close-btn" id="re-modal-close-btn">&times;</button>
          </div>

          <div class="re-tabs">
            <button type="button" class="re-tab on" data-view="signals">📉 신호 목록</button>
            <button type="button" class="re-tab" data-view="labeled" id="re-tab-labeled">🏷 내 라벨</button>
          </div>

          <div class="re-label-bar" id="re-label-bar" style="display:none;"></div>

          <div class="re-search-bar">
            <div class="re-search-wrap">
              <span class="re-search-icon">🔍</span>
              <input type="search" class="re-search-input" id="re-search-input"
                     placeholder="단지명 · 동 · 구로 검색 (예: 래미안, 아현동, 마포 푸르지오)"
                     autocomplete="off" spellcheck="false" />
              <button class="re-search-clear" id="re-search-clear" title="검색어 지우기" style="display:none;">&times;</button>
            </div>
            <div class="re-search-meta" id="re-search-meta"></div>
          </div>

          <button type="button" class="re-filter-toggle" id="re-filter-toggle" aria-expanded="false">
            <span class="re-filter-toggle-left">
              <span class="re-filter-toggle-icon">⚙️</span>
              <span class="re-filter-toggle-text" id="re-filter-summary">필터</span>
            </span>
            <span class="re-filter-toggle-right">
              <span class="re-filter-count" id="re-filter-count" style="display:none;">0</span>
              <span class="re-filter-caret">▾</span>
            </span>
          </button>

          <div class="re-filter-bar collapsed" id="re-filter-bar">
            <div class="re-filter-group">
              <span class="re-filter-label">자치구</span>
              <select class="re-select" id="re-filter-gu">
                ${GU_LIST.map(g => `<option value="${g}">${g}</option>`).join('')}
              </select>
            </div>

            <div class="re-filter-group">
              <span class="re-filter-label">최소 점수</span>
              <select class="re-select" id="re-filter-score">
                <option value="0">전체 (0점 이상)</option>
                <option value="10">10점 이상</option>
                <option value="20">20점 이상</option>
                <option value="30" selected>30점 이상</option>
                <option value="50">50점 이상</option>
              </select>
            </div>

            <div class="re-filter-group">
              <span class="re-filter-label">거래 시점</span>
              <select class="re-select" id="re-filter-date">
                <option value="전체">전체 기간 (24개월)</option>
                <option value="30">최근 30일 이내</option>
                <option value="90">최근 90일 이내</option>
                <option value="180">최근 180일 이내</option>
              </select>
            </div>

            <div class="re-filter-group">
              <span class="re-filter-label">평형대</span>
              <select class="re-select" id="re-filter-pyeong">
                <option value="전체">전체 평형</option>
                <option value="under20">20평 미만</option>
                <option value="20s">20평대</option>
                <option value="30s">30평대</option>
                <option value="over40">40평 이상</option>
              </select>
            </div>

            <div class="re-filter-group">
              <span class="re-filter-label">실거래가</span>
              <select class="re-select" id="re-filter-price">
                ${PRICE_RANGES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
              </select>
            </div>

            <div class="re-filter-group">
              <span class="re-filter-label">플래그</span>
              <select class="re-select" id="re-filter-flag">
                <option value="전체">전체 신호</option>
                <option value="EXCLUDE_OUTLIER">단발 이상거래 제외</option>
                <option value="EXCLUDE_VARIANCE">시세 변동 큼 제외</option>
              </select>
            </div>

            <div class="re-filter-group" style="margin-left: auto;">
              <span class="re-filter-label">정렬</span>
              <select class="re-select" id="re-filter-sort">
                <option value="score">점수순</option>
                <option value="drop_rate">하락률순</option>
                <option value="latest_date">최근 거래일순</option>
              </select>
            </div>
          </div>

          <div class="re-modal-body">
            <div class="re-signal-list" id="re-signal-list-container">
            </div>
          </div>

          <div class="re-modal-footer">
            <p class="re-notice-text">
              <span>⚠️</span> 실거래 신고는 계약 후 최대 30일 걸립니다. 호가는 별도 확인하세요.
            </p>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modalEl = overlay;

      overlay.querySelector('#re-modal-close-btn').addEventListener('click', () => this.closeModal());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal();
      });

      const refreshBtn = overlay.querySelector('#re-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          if (this.isRefreshing) return;
          this.isRefreshing = true;

          const icon = refreshBtn.querySelector('.re-refresh-icon');
          const text = refreshBtn.querySelector('.re-refresh-text');
          if (icon) icon.classList.add('spinning');
          if (text) text.textContent = 'API 수집 & 갱신 중...';
          refreshBtn.disabled = true;

          try {
            const res = await fetch('/.netlify/functions/re_scheduled_collector');
            if (!res.ok) throw new Error('서버 응답 오류 (' + res.status + ')');
            
            if (text) text.textContent = `${todayString()} 기준 (완료!)`;
            this.toast('최신 국토부 실거래가 수집 및 신호 갱신이 완료되었습니다!');
            
            await this.fetchSignals();
          } catch (err) {
            console.error('API 갱신 실패:', err);
            if (text) text.textContent = `${todayString()} 기준 (실패)`;
            this.toast('API 데이터 갱신 실패: ' + err.message);
          } finally {
            if (icon) icon.classList.remove('spinning');
            setTimeout(() => {
              if (text) text.textContent = `${todayString()} 기준 (갱신)`;
              refreshBtn.disabled = false;
              this.isRefreshing = false;
            }, 3000);
          }
        });
      }

      // 기존 버그: 자치구 변경 시 서버 재조회 없이 클라이언트 필터만 돌려서,
      // 특정 구를 골랐다가 '전체'로 되돌리면 그 구 데이터만 남아 있었습니다.
      overlay.querySelector('#re-filter-gu').addEventListener('change', (e) => {
        this.activeGu = e.target.value;
        this.fetchSignals();
      });

      overlay.querySelector('#re-filter-score').addEventListener('change', (e) => {
        this.minScore = parseInt(e.target.value);
        this.fetchSignals();
      });

      overlay.querySelector('#re-filter-date').addEventListener('change', (e) => {
        this.activeDateDays = e.target.value;
        this.renderList();
      });

      overlay.querySelector('#re-filter-pyeong').addEventListener('change', (e) => {
        this.activePyeong = e.target.value;
        this.renderList();
      });

      overlay.querySelector('#re-filter-flag').addEventListener('change', (e) => {
        this.activeFlagFilter = e.target.value;
        this.renderList();
      });

      overlay.querySelector('#re-filter-sort').addEventListener('change', (e) => {
        this.activeSort = e.target.value;
        this.fetchSignals();
      });

      // === 필터 접기/펼치기 (모바일) ===
      overlay.querySelector('#re-filter-toggle').addEventListener('click', () => {
        this.filtersOpen = !this.filtersOpen;
        this.applyFilterCollapse();
        this.saveState();
      });

      overlay.querySelector('#re-filter-price').addEventListener('change', (e) => {
        this.activePrice = e.target.value;
        this.renderList();
      });

      // === 탭 전환 ===
      overlay.querySelector('.re-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.re-tab');
        if (!tab) return;
        const view = tab.dataset.view;
        if (view === this.viewMode) return;
        this.viewMode = view;
        overlay.querySelectorAll('.re-tab').forEach(t => t.classList.toggle('on', t.dataset.view === view));
        overlay.querySelector('#re-label-bar').style.display = view === 'labeled' ? 'flex' : 'none';
        overlay.querySelector('.re-search-bar').style.display = view === 'labeled' ? 'none' : '';
        this.activeLabel = '전체';
        this.fetchSignals();
      });

      // === 라벨바 (모아보기 필터) ===
      overlay.querySelector('#re-label-bar').addEventListener('click', (e) => {
        const b = e.target.closest('.re-label-filter');
        if (!b) return;
        this.activeLabel = b.dataset.label;
        this.fetchSignals();
      });

      // === 검색창 ===
      const searchInput = overlay.querySelector('#re-search-input');
      const clearBtn = overlay.querySelector('#re-search-clear');

      const applySearch = () => {
        this.searchTerm = searchInput.value.trim();
        clearBtn.style.display = this.searchTerm ? 'flex' : 'none';
        this.fetchSignals();
      };

      // 타이핑마다 서버를 때리지 않도록 250ms 디바운스
      searchInput.addEventListener('input', () => {
        clearBtn.style.display = searchInput.value ? 'flex' : 'none';
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(applySearch, 250);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (this.searchTimer) clearTimeout(this.searchTimer);
          applySearch();
        } else if (e.key === 'Escape' && searchInput.value) {
          e.stopPropagation();
          searchInput.value = '';
          if (this.searchTimer) clearTimeout(this.searchTimer);
          applySearch();
        }
      });

      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        if (this.searchTimer) clearTimeout(this.searchTimer);
        applySearch();
        searchInput.focus();
      });
    }

    async fetchSignals() {
      // 빠르게 타이핑하면 요청이 겹치는데, 늦게 도착한 옛 응답이
      // 최신 결과를 덮어쓰지 않도록 순번으로 막습니다.
      const seq = ++this.fetchSeq;

      const container = document.getElementById('re-signal-list-container');
      if (container) {
        container.innerHTML = `
          <div class="re-empty-state">
            <div class="re-empty-icon">⏳</div>
            <div class="re-empty-text">${this.searchTerm ? `'${escapeHtml(this.searchTerm)}' 검색 중...` : '실거래가 신호 데이터를 불러오는 중입니다...'}</div>
          </div>
        `;
      }

      try {
        // 검색 중에는 re_signals 가 아니라 국토부 원본(re_deals)까지 뒤지는 RPC 를 씁니다.
        // re_signals 에는 "하락 신호가 잡힌 평형"만 있어서, 표본이 적거나 값이 오른
        // 평형은 아예 행이 없기 때문입니다. (예: 용산더프라임 11개 평형 중 1개만 존재)
        // 라벨 캐시가 없으면 먼저 채웁니다(카드에 라벨 칩을 그리기 위해).
        if (!this.labelsLoaded) { this.labelsLoaded = true; await this.loadLabels(); }

        // 내 라벨 탭
        if (this.viewMode === 'labeled') {
          const rows = await this.rpc('re_get_labeled', {
            p_label: this.activeLabel === '전체' ? null : this.activeLabel
          });
          if (seq !== this.fetchSeq) return;
          this.labelMap = {};
          (rows || []).forEach(r => { this.labelMap[`${r.complex_key}|${r.area_bucket}`] = r.labels || []; });
          this.labelCounts = (await this.rpc('re_list_labels', {})) || [];
          this.signals = rows || [];
          this.renderLabelBar();
          this.renderList();
          return;
        }

        const isSearch = !!this.searchTerm;

        const callRpc = async (name, payload) => {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: {
              'apikey': ANON_KEY,
              'Authorization': `Bearer ${ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          const text = await res.text();
          return { ok: res.ok, status: res.status, text };
        };

        let result;
        if (isSearch) {
          result = await callRpc('re_search_complexes', {
            p_search: this.searchTerm, p_gu: this.activeGu, p_limit: 300
          });

          // re_search_v2.sql 을 아직 실행하지 않았거나 PostgREST 스키마 캐시가
          // 갱신되지 않은 경우(PGRST202) → 신호 목록 검색으로 자동 강등합니다.
          // 기능이 통째로 죽는 것보다 "신호 있는 평형만이라도" 보이는 편이 낫습니다.
          if (!result.ok && (result.status === 404 || result.text.includes('PGRST202'))) {
            console.warn('[실거래 신호 탐지] re_search_complexes 미설치 → re_get_signals 로 대체합니다. real_estate/re_search_v2.sql 을 실행하세요.');
            this.searchDegraded = true;
            result = await callRpc('re_get_signals', {
              p_gu: this.activeGu, p_min_score: this.minScore,
              p_sort: this.activeSort, p_search: this.searchTerm
            });
          } else {
            this.searchDegraded = false;
          }
        } else {
          result = await callRpc('re_get_signals', {
            p_gu: this.activeGu, p_min_score: this.minScore,
            p_sort: this.activeSort, p_search: null
          });
        }

        if (!result.ok) {
          throw new Error(`HTTP ${result.status} ${result.text.slice(0, 200)}`);
        }
        const fetchedData = JSON.parse(result.text);

        if (seq !== this.fetchSeq) return; // 더 최신 요청이 진행 중 → 이 응답은 버림

        this.signals = Array.isArray(fetchedData) ? fetchedData : [];
        this.renderList();
        this.saveState();

        if (this._restoreScrollTop) {
          const body = this.modalEl && this.modalEl.querySelector('.re-modal-body');
          if (body) body.scrollTop = this._restoreScrollTop;
          this._restoreScrollTop = 0;
        }
      } catch (err) {
        if (seq !== this.fetchSeq) return;
        console.error('[실거래 신호 탐지] 데이터 조회 오류:', err);
        if (container) {
          container.innerHTML = `
            <div class="re-empty-state">
              <div class="re-empty-icon">❌</div>
              <div class="re-empty-text">신호 데이터를 가져오는 데 실패했습니다.</div>
              <div class="re-empty-sub">${escapeHtml(err.message)}</div>
            </div>
          `;
        }
      }
    }

    renderList() {
      const container = document.getElementById('re-signal-list-container');
      if (!container) return;

      const now = new Date(todayString() + 'T00:00:00');

      // 검색 중에는 서버가 점수 필터를 해제하므로 클라이언트에서도 동일하게 맞춥니다.
      // (안 맞추면 서버가 찾아준 낮은 점수 단지를 여기서 다시 걸러버립니다)
      const isSearching = !!this.searchTerm;
      const isLabeled = this.viewMode === 'labeled';

      let filtered = this.signals.filter(s => {
        // 내 라벨 탭에서는 점수 조건을 적용하지 않습니다(신호가 사라져도 보여야 하므로).
        if (!isLabeled && !isSearching && parseInt(s.score) < parseInt(this.minScore)) return false;
        if (this.activeGu !== '전체' && s.gu !== this.activeGu) return false;

        if (this.activeDateDays !== '전체') {
          const days = parseInt(this.activeDateDays);
          if (s.latest_date) {
            const dealDate = new Date(s.latest_date + 'T00:00:00');
            const diffTime = now.getTime() - dealDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > days || diffDays < 0) return false;
          }
        }

        if (this.activePrice !== '전체') {
          const [lo, hi] = this.activePrice.split('-');
          const amt = Number(s.latest_amount) || 0;
          if (lo !== '' && amt < Number(lo)) return false;
          if (hi !== '' && amt >= Number(hi)) return false;
        }

        const p = parseInt(s.pyeong);
        if (this.activePyeong === 'under20' && p >= 20) return false;
        if (this.activePyeong === '20s' && (p < 20 || p >= 30)) return false;
        if (this.activePyeong === '30s' && (p < 30 || p >= 40)) return false;
        if (this.activePyeong === 'over40' && p < 40) return false;

        const flags = s.flags || [];
        if (this.activeFlagFilter === 'EXCLUDE_OUTLIER' && flags.includes('SINGLE_OUTLIER')) return false;
        if (this.activeFlagFilter === 'EXCLUDE_VARIANCE' && flags.includes('HIGH_VARIANCE')) return false;

        return true;
      });

      // 검색 결과 요약 표시
      const metaEl = document.getElementById('re-search-meta');
      if (metaEl) {
        if (isLabeled) {
          metaEl.innerHTML = filtered.length
            ? `<span class="re-meta-dim">라벨 붙인 단지 <strong>${filtered.length}건</strong>${this.activeLabel !== '전체' ? ` · '${escapeHtml(this.activeLabel)}'` : ''}</span>`
            : `<span class="re-meta-dim">아직 라벨을 붙인 단지가 없습니다</span>`;
        } else if (isSearching) {
          const sig = filtered.filter(x => x.has_signal !== false && x.score !== null && x.score !== undefined).length;
          const degraded = this.searchDegraded
            ? ` <span class="re-meta-warn">⚠️ 신호 목록에서만 검색 중 — re_search_v2.sql 미실행</span>`
            : '';
          metaEl.innerHTML = filtered.length
            ? `<strong>'${escapeHtml(this.searchTerm)}'</strong> 검색 결과 <strong>${filtered.length}건</strong> <span class="re-meta-dim">${this.searchDegraded ? '' : `(하락 신호 ${sig}건 · 신호 없는 평형 ${filtered.length - sig}건) · 국토부 원본 기준`}</span>${degraded}`
            : `<strong>'${escapeHtml(this.searchTerm)}'</strong> 검색 결과 없음${degraded}`;
        } else {
          metaEl.innerHTML = `<span class="re-meta-dim">${filtered.length}건 표시 중 · ${this.minScore}점 이상</span>`;
        }
      }

      if (filtered.length === 0 && isLabeled) {
        container.innerHTML = `
          <div class="re-empty-state">
            <div class="re-empty-icon">🏷</div>
            <div class="re-empty-text">${this.labelsEnabled === false ? '라벨 기능이 아직 설치되지 않았습니다.' : '라벨을 붙인 단지가 없습니다.'}</div>
            <div class="re-empty-sub">
              ${this.labelsEnabled === false
                ? 'Supabase SQL Editor 에서 real_estate/re_labels.sql 을 실행해 주세요.'
                : "신호 목록에서 마음에 드는 카드의 <b>🏷 라벨</b> 버튼을 눌러 보세요.<br>관심 · 방문예정 같은 기본 라벨을 한 번에 붙이거나 직접 입력할 수 있습니다."}
            </div>
          </div>
        `;
        this.saveState();
        return;
      }

      if (filtered.length === 0) {
        container.innerHTML = isSearching ? `
          <div class="re-empty-state">
            <div class="re-empty-icon">🔍</div>
            <div class="re-empty-text">'${escapeHtml(this.searchTerm)}' 에 해당하는 단지가 없습니다.</div>
            <div class="re-empty-sub">
              단지명 일부만 입력해 보세요 (예: '래미안', '푸르지오').<br>
              동·구 이름으로도 찾을 수 있습니다 (예: '아현동', '마포').<br>
              최근 24개월 매매 거래가 한 건도 없는 단지는 검색되지 않습니다.
            </div>
          </div>
        ` : `
          <div class="re-empty-state">
            <div class="re-empty-icon">🔍</div>
            <div class="re-empty-text">조건에 부합하는 실거래 신호가 없습니다.</div>
            <div class="re-empty-sub">필터 조건(점수, 거래시점, 구 등)을 변경해 보세요.</div>
          </div>
        `;
        return;
      }

      this.saveState();
      this.applyFilterCollapse();

      // 네이버 선택 시트 버튼 위임 (한 번만 바인딩)
      if (!container._reNaverBound) {
        container._reNaverBound = true;
        container.addEventListener('click', (e) => {
          const lb = e.target.closest('.re-label-btn');
          if (lb) {
            e.preventDefault();
            e.stopPropagation();
            const row = this.signals.find(x =>
              String(x.complex_key) === lb.dataset.ck && String(x.area_bucket) === lb.dataset.ab);
            if (row) this.openLabelSheet(row);
            return;
          }
          const btn = e.target.closest('.re-naver-btn');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          this.openNaverChooser({
            gu: btn.dataset.gu, dong: btn.dataset.dong, apt_name: btn.dataset.apt
          });
        });
      }

      container.innerHTML = '';
      filtered.forEach(s => {
        const cardEl = document.createElement('div');
        cardEl.className = 're-signal-card';
        cardEl.innerHTML = this.renderCardHTML(s);

        cardEl.addEventListener('click', (e) => {
          if (e.target.closest('.re-naver-link, .re-naver-btn, .re-naver-sheet, .re-label-btn, .re-label-sheet')) return;
          this.openDetailModal(s);
        });

        container.appendChild(cardEl);
      });
    }

    renderCardHTML(s) {
      // 검색 결과에는 신호가 없는 평형도 포함됩니다 (score / drop_rate 가 null).
      const hasSignal = s.has_signal !== false && s.score !== null && s.score !== undefined;

      let scoreClass = 're-score-low';
      if (!hasSignal) scoreClass = 're-score-none';
      else if (s.score >= 70) scoreClass = 're-score-high';
      else if (s.score >= 50) scoreClass = 're-score-mid';

      // drop_rate 가 음수면 기준가보다 오른 거래이므로 '-' 를 붙이면 안 됩니다.
      const rate = Number(s.drop_rate) || 0;
      const dropLabel = rate >= 0
        ? `-${(rate * 100).toFixed(1)}%`
        : `+${(Math.abs(rate) * 100).toFixed(1)}%`;
      const latestPriceStr = this.formatPrice(s.latest_amount);
      const baselinePriceStr = this.formatPrice(s.baseline_amount);

      const flags = s.flags || [];
      const tagHTML = flags.map(f => {
        const item = FLAG_LABEL_MAP[f];
        if (!item) return '';
        return `<span class="re-tag ${item.class}">${item.text}</span>`;
      }).join('');

      const naverUrl = naverLandUrl(s);
      const variants = naverVariants(s);
      const myLabels = this.labelsOf(s);

      return `
        <div class="re-card-main">
          <div class="re-score-badge ${scoreClass}">
            <div class="re-score-val">${hasSignal ? s.score : '—'}</div>
            <div class="re-score-lbl">${hasSignal ? 'SCORE' : '신호없음'}</div>
          </div>

          <div class="re-card-info">
            <div class="re-apt-title">
              <span class="re-apt-name">${highlight(s.apt_name, this.searchTerm)}</span>
              <span class="re-pyeong-tag">${s.pyeong}평</span>
              <span class="re-detail-hint">[국토부 원본 보기 🔍]</span>
            </div>
            <div class="re-loc-text">
              ${highlight(s.gu, this.searchTerm)} ${highlight(s.dong, this.searchTerm)} · ${s.latest_floor}층 · ${s.latest_date}
            </div>

            <div class="re-metrics-row">
              <div class="re-price-box">
                <span class="re-latest-price">${latestPriceStr}</span>
                ${hasSignal ? `<span class="re-baseline-price">${baselinePriceStr}</span>` : ''}
              </div>
              ${hasSignal ? `<div class="re-drop-rate">${dropLabel}</div>` : ''}
              <div class="re-stats-box">
                ${hasSignal
                  ? `90일 ${s.density_90d}건 / 표본 ${s.sample_size}건`
                  : `24개월 거래 ${s.deal_count != null ? s.deal_count : s.sample_size}건`}
              </div>
            </div>

            ${myLabels.length ? `<div class="re-mylabel-group">${
              myLabels.map(l => `<span class="re-mylabel">🏷 ${escapeHtml(l)}</span>`).join('')
            }</div>` : ''}
            ${!hasSignal ? `<div class="re-nosignal-note">하락 신호 조건 미충족 — 거래 표본 3건 미만이거나, 최근 180일 거래가 없거나, 가격이 떨어지지 않은 평형입니다. 카드를 눌러 국토부 원본 거래내역은 볼 수 있습니다.</div>` : ''}
            ${tagHTML ? `<div class="re-tag-group">${tagHTML}</div>` : ''}
          </div>
        </div>

        <div class="re-card-actions">
          ${this.labelsEnabled === false ? '' : `
          <button type="button" class="re-label-btn ${myLabels.length ? 'on' : ''}"
                  data-ck="${escapeHtml(s.complex_key)}" data-ab="${escapeHtml(String(s.area_bucket))}"
                  title="라벨 붙이기">
            ${myLabels.length ? `🏷 ${myLabels.length}` : '🏷 라벨'}
          </button>`}
          ${variants.length > 1 ? `
            <button type="button" class="re-naver-link re-naver-btn"
                    data-gu="${escapeHtml(s.gu)}" data-dong="${escapeHtml(s.dong)}"
                    data-apt="${escapeHtml(s.apt_name)}">
              <span>네이버 부동산</span>
              <span>▾</span>
            </button>
          ` : `
            <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="re-naver-link">
              <span>네이버 부동산</span>
              <span>↗</span>
            </a>
          `}
        </div>
      `;
    }

    async openDetailModal(s) {
      if (!this.detailModalEl) {
        const overlay = document.createElement('div');
        overlay.className = 're-modal-overlay';
        overlay.id = 're-detail-modal-overlay';
        overlay.style.zIndex = '100000';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
        this.detailModalEl = overlay;

        // 기존 버그: 상세 모달을 열 때마다 같은 엘리먼트에 click 리스너를 새로 붙여
        // 열고 닫기를 반복할수록 핸들러가 누적되었습니다. 최초 1회만 바인딩합니다.
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.closeDetailModal();
        });
      }

      this.detailModalEl.innerHTML = `
        <div class="re-modal-container re-detail-container">
          <div class="re-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
            <div class="re-header-title-group">
              <div class="re-header-icon" style="background:rgba(59,130,246,0.2); color:#60a5fa;">🏛️</div>
              <div>
                <h3 class="re-header-title">
                  ${s.apt_name} ${s.pyeong}평 국토부 실거래 원본
                </h3>
                <div class="re-header-subtitle">${s.gu} ${s.dong} · 전용 ${s.area_bucket}㎡ 단일 평형 · 최근거래가 ${this.formatPrice(s.latest_amount)} · 기준가 ${this.formatPrice(s.baseline_amount)} (${Number(s.drop_rate) >= 0 ? '-' : '+'}${Math.abs(Number(s.drop_rate) * 100).toFixed(1)}%)</div>
              </div>
            </div>
            <button class="re-close-btn" id="re-detail-close-btn">&times;</button>
          </div>

          <div class="re-modal-body">
            <div class="re-detail-summary-card">
              <div>
                <div style="font-size: 12px; color:#64748b;">국토교통부 <strong>아파트 매매</strong> 실거래가 (최근 24개월 · 전세/월세 미포함)</div>
                <div style="font-size: 16px; font-weight: 700; color:#0f172a; margin-top:2px;">
                  총 표본 ${s.sample_size}건 / 최근 90일 ${s.density_90d}건 거래
                </div>
              </div>
              <div class="re-detail-links">
                ${naverVariants(s).map((v, i) => `
                  <a href="${v.url}" target="_blank" rel="noopener noreferrer"
                     class="${i === 0 ? 're-naver-link' : 're-naver-alt'}">
                    <span>네이버 부동산 · ${escapeHtml(v.label)}</span>
                  </a>
                `).join('')}
                <a href="${naverSearchUrl(s)}" target="_blank" rel="noopener noreferrer" class="re-naver-fallback">
                  그래도 안 나오면 → 네이버 통합검색 ↗
                </a>
              </div>
            </div>

            <div id="re-detail-table-loading" class="re-empty-state">
              <div class="re-empty-icon">⏳</div>
              <div class="re-empty-text">국토교통부 원본 실거래 기록을 불러오는 중입니다...</div>
            </div>

            <div id="re-detail-table-content" style="display:none;">
              <table class="re-detail-table">
                <thead>
                  <tr>
                    <th>계약일자</th>
                    <th>층수</th>
                    <th>거래금액</th>
                    <th>전용면적</th>
                    <th>거래유형</th>
                    <th>해제여부</th>
                    <th>등기일자</th>
                  </tr>
                </thead>
                <tbody id="re-detail-tbody">
                </tbody>
              </table>
            </div>
          </div>

          <div class="re-modal-footer">
            <p class="re-notice-text">
              <span>🛡️</span> 국토교통부 아파트 <strong>매매</strong> 실거래가 원본입니다. 전세·월세 거래는 별도 API(RTMSDataSvcAptRent)이며 이 목록에 포함되지 않습니다.
            </p>
          </div>
        </div>
      `;

      this.detailModalEl.style.display = 'flex';
      this.pushHistory('detail');

      this.detailModalEl.querySelector('#re-detail-close-btn').addEventListener('click', () => {
        this.closeDetailModal();
      });

      try {
        const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/re_get_deal_history`;
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_complex_key: s.complex_key,
            p_area: s.area_bucket
          })
        });

        if (!rpcRes.ok) throw new Error(`HTTP ${rpcRes.status}`);
        const deals = await rpcRes.json();

        const loadingEl = document.getElementById('re-detail-table-loading');
        const contentEl = document.getElementById('re-detail-table-content');
        const tbodyEl = document.getElementById('re-detail-tbody');

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        if (!deals || deals.length === 0) {
          tbodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">원하는 조건의 원본 기록이 없습니다.</td></tr>`;
          return;
        }

        tbodyEl.innerHTML = deals.map(d => {
          const isTarget = (d.deal_date === s.latest_date && d.floor === s.latest_floor && d.amount === s.latest_amount);
          const isCanceled = d.is_canceled;
          let rowClass = isCanceled ? 're-row-canceled' : (isTarget ? 're-row-target' : '');

          const formattedPrice = this.formatPrice(d.amount);
          const dealType = d.dealing_type || '중개거래';
          const cancelBadge = isCanceled ? `<span class="re-tag re-tag-single-outlier">해제거래</span>` : '정상';
          const regDate = d.registered_at || '-';

          // 직거래는 가족 간 증여성 저가 거래가 섞여 있어 신호 계산에서 제외됩니다.
          // 표에는 보이되 계산 제외 대상임을 명시합니다.
          const isDirect = dealType === '직거래';
          const typeCell = isDirect
            ? `${dealType} <span class="re-tag re-tag-small-sample">계산 제외</span>`
            : dealType;

          return `
            <tr class="${rowClass}">
              <td>${d.deal_date} ${isTarget ? '<span style="color:#059669; font-size:11px;">[신호 대상]</span>' : ''}</td>
              <td>${d.floor}층</td>
              <td><strong>${formattedPrice}</strong></td>
              <td>${d.area}㎡</td>
              <td>${typeCell}</td>
              <td>${cancelBadge}</td>
              <td>${regDate}</td>
            </tr>
          `;
        }).join('');

      } catch (err) {
        console.error('[실거래 신호 탐지] 원본 내역 조회 실패:', err);
      }
    }

    formatPrice(amountInTenThousand) {
      if (!amountInTenThousand) return '0원';
      const uk = Math.floor(amountInTenThousand / 10000);
      const remainder = amountInTenThousand % 10000;
      if (uk > 0 && remainder > 0) {
        return `${uk}억 ${remainder.toLocaleString()}만원`;
      } else if (uk > 0) {
        return `${uk}억원`;
      }
      return `${remainder.toLocaleString()}만원`;
    }
  }

  const instance = new RealEstateUI();
  window.realEstateUI = instance;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && instance.isSheetOpen && instance.isSheetOpen()) {
      instance.closeNaverChooser();
    }
  });

  // bfcache 로 되살아난 경우(뒤로가기) 컨트롤 값이 어긋날 수 있어 다시 맞춰줍니다.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && instance.isListOpen && instance.isListOpen()) {
      instance.syncControls();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => instance.init());
  } else {
    instance.init();
  }
})();
