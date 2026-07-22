/**
 * 📚 AI Lexicon & Knowledge Search Module
 * 독서 중 모르는 단어, 인물, 지명, 개념 등을 질문 없이 키워드만으로 AI가 분석하고 저장/복습할 수 있게 돕는 모듈
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
    return localStorage.getItem('AI_LEXICON_PROVIDER') || 'gemini'; // 'gemini' | 'openai'
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

    // API Key가 없는 경우 기본 파싱 및 안내
    if (!apiKey) {
      return this._generateFallbackOrPromptKey(cleanKeyword);
    }

    try {
      if (provider === 'gemini') {
        return await this._callGeminiAPI(cleanKeyword, apiKey);
      } else {
        return await this._callOpenAIAPI(cleanKeyword, apiKey);
      }
    } catch (err) {
      console.warn("AI API 호출 실패, 기본 파싱으로 대체합니다:", err);
      return this._generateFallbackOrPromptKey(cleanKeyword, err.message);
    }
  },

  /**
   * Gemini API 호출 (ListModels 기반 동적 모델 감지 및 100% 자동 호환)
   */
  async _callGeminiAPI(keyword, apiKey) {
    const cleanKey = apiKey.trim();
    
    // 1단계: 무료 티어 분당 한도(RPM)가 가장 넉넉한 gemini-1.5-flash 모델 강제 지정
    let targetModel = 'gemini-1.5-flash';
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {
        headers: { "x-goog-api-key": cleanKey }
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const modelsList = listData.models || [];
        
        // gemini-2.0 모델은 무료 계정 요청 한도가 0(429)이므로 완전 배제
        // gemini-1.5-flash 및 1.5-flash-latest, 1.5-pro 계열 우선 선택
        const flash15 = modelsList.find(m => m.name.includes("1.5-flash") && m.supportedGenerationMethods?.includes("generateContent"))
                     || modelsList.find(m => m.name.includes("1.5") && m.supportedGenerationMethods?.includes("generateContent"));

        if (flash15 && flash15.name) {
          targetModel = flash15.name.replace(/^models\//, '');
        }
      }
    } catch (e) {
      console.warn("[AI Lexicon] ListModels 탐색 스킵, 기본 gemini-1.5-flash 사용:", e);
    }
    
    console.log(`[AI Lexicon] 최종 적용 모델: ${targetModel}`);

    // 2단계: 동적 감지된 모델로 지식 분석 요청
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    const systemPrompt = `당신은 독서 지식 및 어휘 사전 AI입니다.
사용자가 제공하는 키워드(단어, 인물명, 지명, 학술용어, 역사적 사건 등)를 분석하여 정형화된 JSON 데이터로 답변하세요.

응답은 반드시 마크다운 코드블록 없이 순수 JSON 형태로만 출력해야 합니다:
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
        responseMimeType: "application/json",
        temperature: 0.2
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      let detailedMessage = errData.error?.message || `Gemini API 오류 (상태 코드: ${res.status})`;
      
      if (res.status === 429 || detailedMessage.includes('Quota exceeded') || detailedMessage.includes('rate-limit')) {
        detailedMessage = "⏳ Google Gemini 무료 API 속도 제한(Quota Exceeded)에 도달했습니다. 약 10초~15초 후에 다시 시도해 주시면 정상 처리됩니다.";
      }
      
      throw new Error(detailedMessage);
    }

    const data = await res.json();
    const textResp = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResp) throw new Error("AI 응답을 수신하지 못했습니다.");

    const parsed = JSON.parse(textResp);
    return {
      keyword: parsed.keyword || keyword,
      category: parsed.category || '어휘',
      short_summary: parsed.short_summary || '',
      full_description: parsed.full_description || '',
      related_tags: Array.isArray(parsed.related_tags) ? parsed.related_tags : []
    };
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
        {
          role: "user",
          content: `키워드: ${keyword}`
        }
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

  _generateFallbackOrPromptKey(keyword, errorMsg = '') {
    let category = '어휘';
    if (/[가-힣]+산$|[가-힣]+강$|[가-힣]+국$|[가-힣]+시$|[가-힣]+도$/.test(keyword)) {
      category = '지명';
    } else if (keyword.length <= 4 && /[가-힣]{2,4}/.test(keyword) && !keyword.endsWith('적') && !keyword.endsWith('성')) {
      category = '인물';
    }

    return {
      keyword: keyword,
      category: category,
      short_summary: `'${keyword}' (AI 키 설정이 필요합니다)`,
      full_description: errorMsg 
        ? `[API 오류: ${errorMsg}] 상단 ⚙️ 설정 버튼을 눌러 올바른 Gemini API Key를 입력하시면 정밀한 독서 지식을 요약해 드립니다.`
        : `[💡 안내] ⚙️ 설정 버튼을 눌러 Gemini API Key를 등록해 보세요. 키워드 '${keyword}'에 대한 상세 요약 및 인물/지명 분석이 자동 제공됩니다.`,
      related_tags: [category, '지식노트', '키설정안내'],
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
        <div style="font-size: 1.8rem; margin-bottom: 8px;">🤖 AI 지식 분석 중...</div>
        <span style="font-size: 0.85rem; color: #9ca3af;">키워드 '${keyword}'의 개념과 맥락을 정제하고 있습니다.</span>
      </div>
    `;

    try {
      const res = await AILexicon.analyzeKeyword(keyword);
      this.currentAnalysis = res;
      this.renderSearchResult(res);
    } catch (err) {
      resultContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #ef4444;">
          ⚠️ 분석 중 오류가 발생했습니다: ${err.message}
        </div>
      `;
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
        <div class="lexicon-full-desc">${data.full_description || ''}</div>
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
        alert(`저장 실패: ${res.error}`);
      }
    } else {
      // Supabase 미연동 시 로컬스토리지 임시 저장
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
      alert(`'${this.currentAnalysis.keyword}' 지식이 내 로컬 카드장에 저장되었습니다!`);
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
    
    // 로컬스토리지도 동기화
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
