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
    link.href = 'real_estate/re_styles.css?v=1.0';
    document.head.appendChild(link);
  }

  const GU_LIST = [
    '전체', '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
    '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
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
            <span>🏢</span> Real Estate Signals
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

    openModal() {
      if (!this.modalEl) {
        this.createModalDOM();
      }
      this.modalEl.style.display = 'flex';
      this.fetchSignals();
    }

    closeModal() {
      if (this.modalEl) {
        this.modalEl.style.display = 'none';
      }
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
                  <span class="re-date-pill">${todayString()} 기준</span>
                </h3>
                <div class="re-header-subtitle">서울 25개 구 아파트 매매 급매 및 하락 변동 신호 모니터링 (카드를 클릭하면 국토부 원본 데이터를 확인합니다)</div>
              </div>
            </div>
            <button class="re-close-btn" id="re-modal-close-btn">&times;</button>
          </div>

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

          <div class="re-filter-bar">
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

      let filtered = this.signals.filter(s => {
        if (!isSearching && parseInt(s.score) < parseInt(this.minScore)) return false;
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
        if (isSearching) {
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

      container.innerHTML = '';
      filtered.forEach(s => {
        const cardEl = document.createElement('div');
        cardEl.className = 're-signal-card';
        cardEl.innerHTML = this.renderCardHTML(s);

        cardEl.addEventListener('click', (e) => {
          if (e.target.closest('.re-naver-link')) return;
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

      const naverQuery = `서울시 ${s.gu} ${s.dong} ${s.apt_name}`;
      const naverUrl = `https://m.land.naver.com/search/result/${encodeURIComponent(naverQuery)}`;

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
              <span style="font-size:11px; color:#3b82f6; font-weight:normal;">[국토부 원본 보기 🔍]</span>
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

            ${!hasSignal ? `<div class="re-nosignal-note">하락 신호 조건 미충족 — 거래 표본 3건 미만이거나, 최근 180일 거래가 없거나, 가격이 떨어지지 않은 평형입니다. 카드를 눌러 국토부 원본 거래내역은 볼 수 있습니다.</div>` : ''}
            ${tagHTML ? `<div class="re-tag-group">${tagHTML}</div>` : ''}
          </div>
        </div>

        <div>
          <a href="${naverUrl}" target="_blank" rel="noopener noreferrer" class="re-naver-link">
            <span>네이버 부동산</span>
            <span>↗</span>
          </a>
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
          if (e.target === overlay) overlay.style.display = 'none';
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
              <a href="https://m.land.naver.com/search/result/${encodeURIComponent('서울시 ' + s.gu + ' ' + s.dong + ' ' + s.apt_name)}" target="_blank" class="re-naver-link">
                <span>네이버 부동산 매물 보기 ↗</span>
              </a>
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

      this.detailModalEl.querySelector('#re-detail-close-btn').addEventListener('click', () => {
        this.detailModalEl.style.display = 'none';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => instance.init());
  } else {
    instance.init();
  }
})();
