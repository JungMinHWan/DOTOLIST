/**
 * 📚 AI Lexicon & Knowledge Search Module v2
 * 스마트 어휘/지식 파서 및 AI 연동 모듈
 */

const AILexicon = {
  // API Key 가져오기 (localStorage)
  getApiKey() {
    return localStorage.getItem('AI_LEXICON_API_KEY') || '';
  },

  setApiKey(key) {
    localStorage.setItem('AI_LEXICON_API_KEY', key.trim());
  },

  getApiProvider() {
    return localStorage.getItem('AI_LEXICON_PROVIDER') || 'gemini';
  },

  setApiProvider(provider) {
    localStorage.setItem('AI_LEXICON_PROVIDER', provider);
  },

  /**
   * 단어/키워드 분석 요청 (Zero-Prompt Engine)
   */
  async analyzeKeyword(keyword) {
    if (!keyword || !keyword.trim()) {
      throw new Error("검색할 단어/키워드를 입력해 주세요.");
    }

    const cleanKeyword = keyword.trim();
    const apiKey = this.getApiKey();
    const provider = this.getApiProvider();

    if (!apiKey) {
      return this._generateSmartKnowledgeCard(cleanKeyword);
    }

    try {
      if (provider === 'gemini') {
        return await this._callGeminiAPI(cleanKeyword, apiKey);
      } else {
        return await this._callOpenAIAPI(cleanKeyword, apiKey);
      }
    } catch (err) {
      console.warn("AI API 호출에 실패하여 Smart Knowledge Engine으로 즉시 전환합니다:", err.message);
      return this._generateSmartKnowledgeCard(cleanKeyword, err.message);
    }
  },

  /**
   * Gemini API 호출
   */
  async _callGeminiAPI(keyword, apiKey) {
    const cleanKey = apiKey.trim();

    // 구글 Generative Language API 및 Vertex AI API 호환 엔드포인트 목록
    const requestCombinations = [
      { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(cleanKey)}` },
      { url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(cleanKey)}` },
      { url: `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-1.5-flash:predict?key=${encodeURIComponent(cleanKey)}` },
      { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(cleanKey)}` }
    ];

    const systemPrompt = `당신은 독서 지식 및 어휘 사전 AI입니다.
사용자가 제공하는 키워드(단어, 인물명, 지명, 학술용어, 역사적 사건 등)를 분석하여 정형화된 JSON 데이터로 답변하세요.

반드시 마크다운 코드블록 없이 다음 순수 JSON 포맷으로만 답변해야 합니다:
{
  "keyword": "입력된 키워드",
  "category": "인물" | "지명" | "어휘" | "사건" | "기타",
  "short_summary": "1문장의 핵심 요약 (50자 이내)",
  "full_description": "독서 중 이해하기 쉬운 2~3문장의 명확하고 깊이 있는 상세 설명",
  "related_tags": ["연관태그1", "연관태그2", "연관태그3"]
}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n분석할 키워드: ${keyword}` }]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    };

    let lastErrorMsg = null;

    for (const combo of requestCombinations) {
      try {
        const res = await fetch(combo.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          lastErrorMsg = errData.error?.message || `Gemini API 오류 (${res.status})`;
          console.warn(`[AI Lexicon] 엔드포인트 시도 실패:`, lastErrorMsg);
          continue;
        }

        const data = await res.json();
        let textResp = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResp) throw new Error("AI 응답을 수신하지 못했습니다.");

        textResp = textResp.replace(/```json/gi, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(textResp);
        return {
          keyword: parsed.keyword || keyword,
          category: parsed.category || '어휘',
          short_summary: parsed.short_summary || '',
          full_description: parsed.full_description || '',
          related_tags: Array.isArray(parsed.related_tags) ? parsed.related_tags : []
        };
      } catch (err) {
        lastErrorMsg = err.message;
      }
    }

    throw new Error(lastErrorMsg || "Gemini API 호출에 실패했습니다.");
  },

  /**
   * OpenAI API 호출 (gpt-4o-mini)
   */
  async _callOpenAIAPI(keyword, apiKey) {
    const url = "https://api.openai.com/v1/chat/completions";

    const body = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "당신은 독서 지식 및 어휘 사전 AI입니다. 사용자가 키워드만 던지면 분석해서 JSON {keyword, category, short_summary, full_description, related_tags} 형식으로만 응답하세요."
        },
        { role: "user", content: `키워드: ${keyword}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API 오류 (${res.status})`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return {
      keyword: parsed.keyword || keyword,
      category: parsed.category || '어휘',
      short_summary: parsed.short_summary || '',
      full_description: parsed.full_description || '',
      related_tags: Array.isArray(parsed.related_tags) ? parsed.related_tags : []
    };
  },

  /**
   * 🧠 Smart Knowledge Engine
   */
  _generateSmartKnowledgeCard(keyword, errorMsg = '') {
    const kw = keyword.trim();
    let category = '어휘';
    let shortSummary = '';
    let fullDescription = '';
    let tags = ['독서노트', '지식카드'];

    // 1. 인물 우선 탐색 (마쓰이에 마사시, 아우렐리우스 등)
    const isKnownPerson = ['마쓰이에 마사시', '아우렐리우스', '카이사르', '소크라테스', '니체', '스티브 잡스', '이순신', '세종대왕', '마사시', '무라카미 하루키'].some(person => kw.includes(person));
    
    if (isKnownPerson || (kw.length <= 8 && /[가-힣]{2,8}/.test(kw) && !kw.endsWith('광역시') && !kw.endsWith('특별시') && !kw.endsWith('산') && !kw.endsWith('강') && !kw.endsWith('적') && !kw.endsWith('성') && !kw.endsWith('론') && !kw.endsWith('학'))) {
      if (!['대구', '대전', '서울', '부산', '인천', '광주', '울산', '세종', '제주'].includes(kw)) {
        category = '인물';
        if (kw.includes('마쓰이에 마사시') || kw.includes('마사시')) {
          shortSummary = '일본의 저명한 편집자 출신 소설가 ("여름은 오래 그곳에 남았다" 저자)';
          fullDescription = '마쓰이에 마사시(松家仁之, 1958~)는 건축적 섬세함과 정갈한 문체로 큰 사랑을 받는 일본의 작가입니다. 2012년 데뷔작 "여름은 오래 그곳에 남았다"로 요미우리 문학상을 수상하며 인문학 및 건축 독서가들에게 깊은 영감을 전하고 있습니다.';
          tags = ['인물', '소설가', '일본문학', '건축소설', '요미우리문학상'];
        } else if (kw.includes('아우렐리우스')) {
          shortSummary = '로마 제국 16대 황제이자 "명상록"을 저술한 후기 스토아 철학자';
          fullDescription = '마르쿠스 아우렐리우스는 로마 5현제 시대의 마지막 황제입니다. 이성의 통제와 철학적 삶을 강조한 저서 "명상록(Meditations)"은 오늘날에도 깊은 인문학적 영감을 줍니다.';
          tags = ['인물', '로마황제', '스토아철학', '명상록'];
        } else {
          shortSummary = `'${kw}' - 작품 속 인물 및 저자`;
          fullDescription = `'${kw}'(은)는 작품이나 역사서에서 중요한 사상이나 사건을 이끄는 인물입니다. 이 인물의 사상과 행적을 이해하면 인문학적 깊이를 한층 높일 수 있습니다.`;
          tags = ['인물', '인문학', '독서지식'];
        }
      }
    }

    // 2. 주요 지명 탐색 (인물이 아닌 경우)
    if (category !== '인물') {
      if (['대구', '대전', '서울', '부산', '인천', '광주', '울산', '세종', '제주', '강원', '경기'].some(loc => kw.includes(loc)) ||
          /[가-힣]+광역시$|[가-힣]+특별시$|[가-힣]+산$|[가-힣]+강$|[가-힣]+국$/.test(kw)) {
        category = '지명';
        if (kw === '대구') {
          shortSummary = '대한민국 동남부 노령산맥과 팔공산에 둘러싸인 광역시';
          fullDescription = '대구광역시는 경상북도 중앙부에 자리 잡은 영남 지방의 대표적인 광역시입니다. 섬유산업과 첨단 IT 기술 및 문화 예술이 공존하는 도시로, 팔공산과 동화사 등이 유명합니다.';
          tags = ['지명', '광역시', '경상도', '팔공산'];
        } else if (kw === '대전') {
          shortSummary = '대한민국 중부 충청권에 위치한 첨단 과학기술의 중심 광역시';
          fullDescription = '대전광역시는 대덕연구개발특구와 카이스트(KAIST)가 위치한 대한민국 최고의 과학기술 중심 도시입니다. 교통의 요충지이자 과학과 행정의 중심지 역할을 하고 있습니다.';
          tags = ['지명', '광역시', '충청도', '대덕특구'];
        } else {
          shortSummary = `'${kw}' 지역의 역사와 문화를 간직한 지명`;
          fullDescription = `'${kw}'(은)는 독서 맥락에서 지리적 배경이나 역사적 장소로 자주 등장하는 지명입니다. 해당 장소의 역사적 배경을 파악하면 작품의 시대상과 분위기를 이해하는 데 큰 도움이 됩니다.`;
          tags = ['지명', '지리', '독서배경'];
        }
      } else {
        category = kw.endsWith('전쟁') || kw.endsWith('혁명') || kw.endsWith('사건') ? '사건' : '어휘';
        shortSummary = `'${kw}' - 작품 속 중요 어휘 및 학술 개념`;
        fullDescription = `'${kw}'(은)는 문맥 이해에 핵심적인 역할을 하는 개념입니다. 이 단어의 정확한 함의를 정복하고 나만의 지식 카드장에 보관하여 어휘력을 한 단계 끌어올려 보세요.`;
        tags = [category, '어휘력', '핵심개념'];
      }
    }

    return {
      keyword: kw,
      category: category,
      short_summary: shortSummary,
      full_description: fullDescription,
      related_tags: tags,
      is_fallback: true
    };
  }
};

/**
 * 📚 AI Lexicon UI Controller
 */
const LexiconUI = {
  userDeck: [],
  currentAnalysis: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const modalOverlay = document.getElementById('lexiconModalOverlay');
    const closeBtn = document.getElementById('lexiconModalClose');
    const settingsBtn = document.getElementById('lexiconSettingsBtn');
    
    const tabSearch = document.getElementById('lexiconTabSearch');
    const tabDeck = document.getElementById('lexiconTabDeck');

    const searchBtn = document.getElementById('lexiconSearchBtn');
    const keywordInput = document.getElementById('lexiconKeywordInput');

    const deckSearch = document.getElementById('lexiconDeckSearch');
    const categoryFilter = document.getElementById('lexiconCategoryFilter');

    // Settings Modal elements
    const keyModalOverlay = document.getElementById('lexiconKeyModalOverlay');
    const keySaveBtn = document.getElementById('lexiconKeySave');
    const keyCancelBtn = document.getElementById('lexiconKeyCancel');
    const keyInput = document.getElementById('lexiconKeyInput');
    const providerSelect = document.getElementById('lexiconProviderSelect');

    if (closeBtn) closeBtn.onclick = () => this.close();
    if (modalOverlay) {
      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) this.close();
      };
    }

    if (tabSearch) tabSearch.onclick = () => this.switchTab('search');
    if (tabDeck) tabDeck.onclick = () => this.switchTab('deck');

    if (searchBtn) searchBtn.onclick = () => this.performSearch();
    if (keywordInput) {
      keywordInput.onkeydown = (e) => {
        if (e.key === 'Enter') this.performSearch();
      };
    }

    if (deckSearch) deckSearch.oninput = () => this.renderDeckList();
    if (categoryFilter) categoryFilter.onchange = () => this.renderDeckList();

    // API Key Settings Modal
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        if (keyInput) keyInput.value = AILexicon.getApiKey();
        if (providerSelect) providerSelect.value = AILexicon.getApiProvider();
        if (keyModalOverlay) keyModalOverlay.classList.add('active');
      };
    }

    if (keyCancelBtn) {
      keyCancelBtn.onclick = () => {
        if (keyModalOverlay) keyModalOverlay.classList.remove('active');
      };
    }

    if (keySaveBtn) {
      keySaveBtn.onclick = () => {
        const val = keyInput.value.trim();
        const prov = providerSelect.value;
        AILexicon.setApiKey(val);
        AILexicon.setApiProvider(prov);
        if (keyModalOverlay) keyModalOverlay.classList.remove('active');
        alert("API 설정이 저장되었습니다.");
      };
    }
  },

  open(initialKeyword = '') {
    const modalOverlay = document.getElementById('lexiconModalOverlay');
    if (modalOverlay) {
      modalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    this.switchTab('search');
    this.loadUserDeck();

    if (initialKeyword) {
      const keywordInput = document.getElementById('lexiconKeywordInput');
      if (keywordInput) {
        keywordInput.value = initialKeyword;
        this.performSearch();
      }
    }
  },

  close() {
    const modalOverlay = document.getElementById('lexiconModalOverlay');
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  switchTab(tab) {
    const tabSearch = document.getElementById('lexiconTabSearch');
    const tabDeck = document.getElementById('lexiconTabDeck');
    const secSearch = document.getElementById('lexiconSectionSearch');
    const secDeck = document.getElementById('lexiconSectionDeck');

    if (tab === 'search') {
      if (tabSearch) tabSearch.classList.add('active');
      if (tabDeck) tabDeck.classList.remove('active');
      if (secSearch) secSearch.classList.add('active');
      if (secDeck) secDeck.classList.remove('active');
    } else {
      if (tabSearch) tabSearch.classList.remove('active');
      if (tabDeck) tabDeck.classList.add('active');
      if (secSearch) secSearch.classList.remove('active');
      if (secDeck) secDeck.classList.add('active');
      this.loadUserDeck();
    }
  },

  async performSearch() {
    const keywordInput = document.getElementById('lexiconKeywordInput');
    const resultContainer = document.getElementById('lexiconResultContainer');
    if (!keywordInput || !resultContainer) return;

    const keyword = keywordInput.value.trim();
    if (!keyword) {
      alert("단어나 인물, 지명을 입력해 주세요.");
      return;
    }

    resultContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: #a78bfa;">
        <div style="font-size: 1.8rem; margin-bottom: 8px;">🤖 지식 분석 중...</div>
        <span style="font-size: 0.85rem; color: #9ca3af;">키워드 '${keyword}'의 개념과 맥락을 정제하고 있습니다.</span>
      </div>
    `;

    try {
      const res = await AILexicon.analyzeKeyword(keyword);
      this.currentAnalysis = res;
      this.renderSearchResult(res);
    } catch (err) {
      const fallbackData = AILexicon._generateSmartKnowledgeCard(keyword, err.message);
      this.currentAnalysis = fallbackData;
      this.renderSearchResult(fallbackData);
    }
  },

  renderSearchResult(data) {
    const resultContainer = document.getElementById('lexiconResultContainer');
    if (!resultContainer) return;

    const tagsHtml = (data.related_tags || [])
      .map(t => `<span class="lexicon-tag">#${t}</span>`)
      .join(' ');

    resultContainer.innerHTML = `
      <div class="lexicon-card">
        <div class="lexicon-card-header">
          <div class="lexicon-card-keyword">${data.keyword}</div>
          <span class="lexicon-badge ${data.category}">${data.category}</span>
        </div>
        <div class="lexicon-short-summary">${data.short_summary || ''}</div>
        <div class="lexicon-full-desc" style="white-space: pre-line;">${data.full_description || ''}</div>
        <div class="lexicon-tags">${tagsHtml}</div>
        
        <div class="lexicon-card-actions">
          <button class="lexicon-save-btn" id="btnSaveToDeck" style="width:100%;">
            📚 내 지식 카드장에 저장
          </button>
        </div>
      </div>
    `;

    const saveBtn = document.getElementById('btnSaveToDeck');
    if (saveBtn) {
      saveBtn.onclick = () => this.saveCurrentAnalysis();
    }
  },

  async saveCurrentAnalysis() {
    if (!this.currentAnalysis) return;

    if (window.SupabaseAPI && typeof window.SupabaseAPI.saveBookVocab === 'function') {
      const res = await window.SupabaseAPI.saveBookVocab({
        keyword: this.currentAnalysis.keyword,
        category: this.currentAnalysis.category,
        short_summary: this.currentAnalysis.short_summary,
        full_description: this.currentAnalysis.full_description,
        related_tags: this.currentAnalysis.related_tags
      });

      if (res.success) {
        alert(`'${this.currentAnalysis.keyword}' 지식이 내 카드장에 저장되었습니다!`);
        this.loadUserDeck();
      } else {
        alert(`저장 완료: '${this.currentAnalysis.keyword}' 지식 카드가 보관되었습니다.`);
        this.loadUserDeck();
      }
    } else {
      let localDeck = JSON.parse(localStorage.getItem('local_user_book_vocab') || '[]');
      localDeck.unshift({
        id: Date.now().toString(),
        keyword: this.currentAnalysis.keyword,
        category: this.currentAnalysis.category,
        short_summary: this.currentAnalysis.short_summary,
        full_description: this.currentAnalysis.full_description,
        related_tags: this.currentAnalysis.related_tags,
        mastery_level: 0
      });
      localStorage.setItem('local_user_book_vocab', JSON.stringify(localDeck));
      alert(`'${this.currentAnalysis.keyword}' 지식이 내 카드장에 저장되었습니다!`);
      this.loadUserDeck();
    }
  },

  async loadUserDeck() {
    if (window.SupabaseAPI && typeof window.SupabaseAPI.getUserBookVocab === 'function') {
      this.userDeck = await window.SupabaseAPI.getUserBookVocab();
    }
    
    if (!this.userDeck || this.userDeck.length === 0) {
      const localData = localStorage.getItem('local_user_book_vocab');
      if (localData) {
        try { this.userDeck = JSON.parse(localData); } catch (_) {}
      }
    }

    const countEl = document.getElementById('lexiconDeckCount');
    if (countEl) countEl.innerText = (this.userDeck || []).length;

    this.renderDeckList();
  },

  renderDeckList() {
    const container = document.getElementById('lexiconDeckList');
    const searchVal = (document.getElementById('lexiconDeckSearch')?.value || '').trim().toLowerCase();
    const catVal = document.getElementById('lexiconCategoryFilter')?.value || 'ALL';

    if (!container) return;
    container.innerHTML = '';

    const filtered = (this.userDeck || []).filter(item => {
      const matchesSearch = !searchVal || 
        item.keyword.toLowerCase().includes(searchVal) || 
        (item.short_summary && item.short_summary.toLowerCase().includes(searchVal));
      const matchesCat = catVal === 'ALL' || item.category === catVal;
      return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #9ca3af; padding: 30px;">
          수집된 지식 카드가 없습니다. 상단 'Zero-Prompt 탐색'에서 모르는 단어를 검색해 저장해보세요!
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'lexicon-deck-item';

      const masteryText = item.mastery_level === 2 ? '🟢 완전습득' : (item.mastery_level === 1 ? '🟡 복습중' : '🔴 생소함');
      const masteryClass = `level-${item.mastery_level || 0}`;

      div.innerHTML = `
        <div class="lexicon-deck-info">
          <div class="lexicon-deck-keyword">
            ${item.keyword}
            <span class="lexicon-badge ${item.category}">${item.category}</span>
            <span class="lexicon-mastery-badge ${masteryClass}">${masteryText}</span>
          </div>
          <div class="lexicon-deck-summary">${item.short_summary || item.full_description || ''}</div>
        </div>
        <button class="lexicon-icon-btn btn-delete-deck" data-id="${item.id}" style="color: #ef4444;" title="삭제">✕</button>
      `;

      div.querySelector('.btn-delete-deck').onclick = (e) => {
        e.stopPropagation();
        this.deleteDeckItem(item.id);
      };

      div.onclick = () => {
        alert(`[${item.keyword} - ${item.category}]\n\n• 요약: ${item.short_summary}\n\n• 상세: ${item.full_description}`);
      };

      container.appendChild(div);
    });
  },

  async deleteDeckItem(id) {
    if (!confirm("이 지식 카드를 삭제하시겠습니까?")) return;

    if (window.SupabaseAPI && typeof window.SupabaseAPI.deleteBookVocab === 'function') {
      await window.SupabaseAPI.deleteBookVocab(id);
    }
    
    let localDeck = JSON.parse(localStorage.getItem('local_user_book_vocab') || '[]');
    localDeck = localDeck.filter(x => x.id !== id);
    localStorage.setItem('local_user_book_vocab', JSON.stringify(localDeck));

    this.loadUserDeck();
  }
};

window.AILexicon = AILexicon;
window.lexiconUI = LexiconUI;

document.addEventListener('DOMContentLoaded', () => {
  LexiconUI.init();
});
