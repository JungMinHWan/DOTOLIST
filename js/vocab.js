/**
 * GROW VOCAB - 어휘력 향상 게임 비즈니스 로직
 */

(function () {
  // === 상태 변수 ===
  let vocabList = [];          // 전체 정제된 단어 목록
  let solvedVocabs = [];       // 맞춘 단어 정보 목록 { w: 단어, d: 뜻, p: 품사, l: 레벨, e: 예문들, date: 맞춘날짜 }
  let currentWord = null;      // 현재 출제 중인 단어 객체
  let currentChosungHint = ''; // 현재 단어의 초성 힌트
  let isSolved = false;        // 현재 문제 정답 여부
  
  // 롱프레스 감지 변수
  let longPressTimer = null;
  const LONG_PRESS_DURATION = 800; // 0.8초 꾹 누르기
  
  // DOM 요소 캐시
  const elements = {
    headerTitle: document.getElementById('todoListHeaderTitle'),
    modalOverlay: document.getElementById('vocabModalOverlay'),
    closeBtn: document.getElementById('vocabModalClose'),
    tabGame: document.getElementById('vocabTabGame'),
    tabList: document.getElementById('vocabTabList'),
    sectionGame: document.getElementById('vocabSectionGame'),
    sectionList: document.getElementById('vocabSectionList'),
    
    // 게임 뷰
    solvedCount: document.getElementById('vocabSolvedCount'),
    levelBadge: document.getElementById('vocabLevelBadge'),
    wordInfo: document.getElementById('vocabWordInfo'),
    definition: document.getElementById('vocabDefinition'),
    examples: document.getElementById('vocabExamples'),
    answerInput: document.getElementById('vocabAnswerInput'),
    submitBtn: document.getElementById('vocabSubmitBtn'),
    feedback: document.getElementById('vocabFeedback'),
    hintBtn: document.getElementById('vocabHintBtn'),
    giveUpBtn: document.getElementById('vocabGiveUpBtn'),
    nextBtn: document.getElementById('vocabNextBtn'),
    
    // 리스트 뷰
    listTotalCount: document.getElementById('vocabListTotalCount'),
    levelText: document.getElementById('vocabLevelText'),
    searchInput: document.getElementById('vocabSearchInput'),
    searchClear: document.getElementById('vocabSearchClear'),
    listContainer: document.getElementById('vocabListContainer'),
  };

  // === 초기화 ===
  async function init() {
    setupEventListeners();
    await loadDictionaryData();
    await loadSolvedList();
  }

  // === 이벤트 리스너 바인딩 ===
  function setupEventListeners() {
    // 모달 닫기
    elements.closeBtn.onclick = closeVocabModal;
    elements.modalOverlay.onclick = (e) => {
      if (e.target === elements.modalOverlay) closeVocabModal();
    };

    // 탭 전환
    elements.tabGame.onclick = () => switchTab('game');
    elements.tabList.onclick = () => switchTab('list');

    // 정답 제출
    elements.submitBtn.onclick = checkAnswer;
    elements.answerInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        if (isSolved) {
          elements.nextBtn.click();
        } else {
          checkAnswer();
        }
      }
    };

    // 힌트, 정답 보기 및 다음 문제
    elements.hintBtn.onclick = showHint;
    elements.giveUpBtn.onclick = showAnswer;
    elements.nextBtn.onclick = nextQuestion;

    // 리스트 검색 및 지우기
    elements.searchInput.oninput = function () {
      renderSolvedList(this.value);
    };
    elements.searchClear.onclick = () => {
      elements.searchInput.value = '';
      elements.searchInput.focus();
      renderSolvedList('');
    };
  }

  // === 모달 제어 ===
  function openVocabModal() {
    elements.modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // 모달을 열면 게임 탭을 기본 활성화하고 문제 출제
    switchTab('game');
    if (!currentWord && vocabList.length > 0) {
      nextQuestion();
    }
  }

  function closeVocabModal() {
    elements.modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function switchTab(tab) {
    if (tab === 'game') {
      elements.tabGame.classList.add('active');
      elements.tabList.classList.remove('active');
      elements.sectionGame.classList.add('active');
      elements.sectionList.classList.remove('active');
      elements.answerInput.focus();
    } else {
      elements.tabGame.classList.remove('active');
      elements.tabList.classList.add('active');
      elements.sectionGame.classList.remove('active');
      elements.sectionList.classList.add('active');
      
      elements.searchInput.value = '';
      renderSolvedList('');
    }
  }

  // === 사전 데이터 로드 ===
  async function loadDictionaryData() {
    try {
      const res = await fetch('./dictionary/quiz_words.json');
      if (!res.ok) throw new Error('사전 JSON 파일을 읽어오지 못했습니다.');
      vocabList = await res.json();
      console.log(`GROW VOCAB 데이터 로드 완료: 단어 ${vocabList.length}개 적재됨.`);
    } catch (err) {
      console.error(err);
      elements.definition.innerText = '사전 데이터를 불러오는 데 실패했습니다.';
    }
  }

  // === 맞춘 단어 데이터 동기화 (로컬스토리지 및 Supabase Vault) ===
  async function loadSolvedList() {
    // 1. 로컬 스토리지 로드
    const localData = localStorage.getItem('grow_solved_vocabs');
    if (localData) {
      try {
        solvedVocabs = JSON.parse(localData);
      } catch (_) {
        solvedVocabs = [];
      }
    }

    // 2. Supabase Vault 연동 시도 (로그인 유저 정보 복원)
    if (window.api && typeof window.api.getVaultValue === 'function') {
      try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user) {
          const vaultVal = await window.api.getVaultValue(`solved_vocabs_${user.id}`);
          if (vaultVal) {
            const vaultSolved = JSON.parse(vaultVal);
            // 로컬 데이터와 Vault 데이터를 병합 (중복 제거)
            const merged = [...solvedVocabs];
            vaultSolved.forEach(v => {
              if (!merged.some(m => m.w === v.w)) {
                merged.push(v);
              }
            });
            solvedVocabs = merged;
            saveSolvedListLocally();
          }
        }
      } catch (e) {
        console.warn('Supabase Vault solved vocabs load skipped:', e);
      }
    }
    
    updateSolvedUI();
  }

  async function saveSolvedList(wordObj) {
    // 중복 추가 방지
    if (solvedVocabs.some(v => v.w === wordObj.w)) return;
    
    const record = {
      w: wordObj.w,
      d: wordObj.d,
      p: wordObj.p,
      l: wordObj.l,
      e: wordObj.e,
      date: new Date().toISOString()
    };
    
    solvedVocabs.unshift(record); // 최신 단어를 맨 앞으로
    saveSolvedListLocally();
    updateSolvedUI();

    // Supabase Vault 저장 시도
    if (window.api && typeof window.api.saveVaultValue === 'function') {
      try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user) {
          await window.api.saveVaultValue(`solved_vocabs_${user.id}`, JSON.stringify(solvedVocabs));
        }
      } catch (e) {
        console.warn('Supabase Vault solved vocabs save skipped:', e);
      }
    }
  }

  function saveSolvedListLocally() {
    localStorage.setItem('grow_solved_vocabs', JSON.stringify(solvedVocabs));
  }

  // 맞춘 단어 수에 따라 등급 및 진척도 UI 업데이트
  function updateSolvedUI() {
    const totalSolved = solvedVocabs.length;
    if (elements.solvedCount) elements.solvedCount.innerText = totalSolved;
    if (elements.listTotalCount) elements.listTotalCount.innerText = totalSolved;
    
    // 어휘 등급 결정
    let level = 1;
    let levelName = '어휘 꿈나무 🌱';
    
    if (totalSolved >= 100) {
      level = 5;
      levelName = '어휘 마스터 👑';
    } else if (totalSolved >= 60) {
      level = 4;
      levelName = '어휘 멘토 🗣️';
    } else if (totalSolved >= 30) {
      level = 3;
      levelName = '어휘 우등생 🎓';
    } else if (totalSolved >= 10) {
      level = 2;
      levelName = '어휘 탐험가 🧭';
    }
    
    if (elements.levelBadge) elements.levelBadge.innerText = `Lv. ${level}`;
    if (elements.levelText) elements.levelText.innerText = levelName;
  }

  // === 퀴즈 출제 ===
  function nextQuestion() {
    if (vocabList.length === 0) return;
    
    isSolved = false;
    elements.feedback.classList.remove('correct', 'incorrect');
    elements.feedback.style.display = 'none';
    elements.answerInput.value = '';
    elements.answerInput.disabled = false;
    elements.submitBtn.disabled = false;
    elements.nextBtn.style.display = 'none';
    elements.hintBtn.style.display = 'inline-block';
    elements.giveUpBtn.style.display = 'inline-block';
    
    // 맞추지 않은 단어 필터링
    const solvedWordsSet = new Set(solvedVocabs.map(v => v.w));
    const pool = vocabList.filter(item => !solvedWordsSet.has(item.w));
    
    // 다 맞췄으면 전체 풀에서 랜덤 출제
    const targetPool = pool.length > 0 ? pool : vocabList;
    
    // 랜덤 단어 선정
    currentWord = targetPool[Math.floor(Math.random() * targetPool.length)];
    currentChosungHint = getChosung(currentWord.w);
    
    // UI 업데이트
    elements.wordInfo.innerHTML = `<span>품사: <strong>${currentWord.p}</strong> | 난이도: <strong>${currentWord.l}</strong></span>`;
    elements.definition.innerText = currentWord.d;
    
    // 예문 처리 (단어 부분 치환하여 노출)
    elements.examples.innerHTML = '';
    currentWord.e.forEach(ex => {
      const obfuscated = obfuscateSentence(ex, currentWord.w);
      const div = document.createElement('div');
      div.className = 'vocab-example-item';
      div.innerHTML = obfuscated;
      elements.examples.appendChild(div);
    });
    
    elements.answerInput.focus();
  }

  // === 정답 치환 헬퍼 ===
  function getStem(word) {
    if (word.endsWith('하다')) return word.slice(0, -2);
    if (word.endsWith('다')) return word.slice(0, -1);
    return word;
  }

  function obfuscateSentence(sentence, word) {
    const blankHtml = `<span class="vocab-blank" data-answer="${word}">[ ]</span>`;
    
    if (sentence.includes(word)) {
      return sentence.replaceAll(word, blankHtml);
    }
    
    const stem = getStem(word);
    if (stem.length >= 2 && sentence.includes(stem)) {
      // 예문 속에서 어간의 위치를 찾아 단어 길이 만큼을 치환
      const idx = sentence.indexOf(stem);
      const wordLen = word.length;
      const target = sentence.substring(idx, idx + wordLen);
      return sentence.replace(target, blankHtml);
    }
    
    // 완전히 일치하는 형태를 찾을 수 없는 특수 케이스의 경우, 단어 앞자리라도 매칭
    const miniStem = stem.substring(0, 2);
    if (sentence.includes(miniStem)) {
      const idx = sentence.indexOf(miniStem);
      const target = sentence.substring(idx, idx + word.length);
      return sentence.replace(target, blankHtml);
    }
    
    return sentence;
  }

  // === 자음/초성 추출 헬퍼 ===
  function getChosung(word) {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i) - 44032;
      if (code > -1 && code < 11172) {
        result += cho[Math.floor(code / 588)];
      } else {
        result += word.charAt(i);
      }
    }
    return result;
  }

  // === 정답 확인 ===
  async function checkAnswer() {
    if (!currentWord || isSolved) return;
    
    const userAnswer = elements.answerInput.value.trim().replace(/\s+/g, '');
    const correctAnswer = currentWord.w.replace(/\s+/g, '');
    
    if (!userAnswer) {
      showFeedback('단어를 입력해 주세요!', false);
      return;
    }
    
    if (userAnswer === correctAnswer) {
      // 정답!
      isSolved = true;
      elements.answerInput.disabled = true;
      elements.submitBtn.disabled = true;
      elements.hintBtn.style.display = 'none';
      elements.giveUpBtn.style.display = 'none';
      elements.nextBtn.style.display = 'inline-block';
      elements.nextBtn.focus();
      
      showFeedback('🎉 정답입니다! (+3 XP 획득)', true);
      
      // 예문의 빈칸 정답 공개 및 연출
      document.querySelectorAll('.vocab-blank').forEach(el => {
        el.innerText = currentWord.w;
        el.classList.add('revealed');
      });
      
      // 꽃가루(confetti) 발사
      triggerConfetti();
      
      // 맞춘 목록에 저장
      await saveSolvedList(currentWord);
      
      // 게이미피케이션 경험치(+3 XP) 적립 및 HUD 업데이트
      if (window.api && typeof window.api.addRealtimeTaskXp === 'function') {
        try {
          const res = await window.api.addRealtimeTaskXp(3);
          if (res.success && res.stats) {
            // HUD 업데이트
            const levelNum = document.getElementById('hudLevelNum');
            const levelBarFill = document.getElementById('hudLevelBar');
            const xpText = document.getElementById('hudXpText');
            
            if (levelNum) levelNum.innerText = res.stats.level;
            if (levelBarFill && xpText) {
              const requiredXp = res.stats.level * 100;
              const progressPercent = Math.min((res.stats.xp / requiredXp) * 100, 100);
              levelBarFill.style.width = `${progressPercent}%`;
              xpText.innerText = `${res.stats.xp} / ${requiredXp} XP`;
            }
            
            // 레벨업 축하 연출
            if (res.leveledUp && typeof window.handleLevelUp === 'function') {
              window.handleLevelUp(res.stats.level);
            } else if (res.leveledUp) {
              // 폴백 레벨업 팝업 띄우기
              const levelUpModal = document.getElementById('levelUpModalOverlay');
              const levelUpBadge = document.getElementById('levelUpModalBadge');
              if (levelUpModal && levelUpBadge) {
                levelUpBadge.innerText = `Lv. ${res.stats.level}`;
                levelUpModal.classList.remove('hidden');
                levelUpModal.classList.add('show');
              }
            }
          }
        } catch (e) {
          console.error('Failed to reward XP:', e);
        }
      }
    } else {
      // 오답!
      showFeedback('오답입니다. 다시 한 번 생각해 보세요!', false);
      
      // 흔들림 애니메이션 효과 추가
      const modal = document.querySelector('.vocab-modal');
      if (modal) {
        modal.style.animation = 'none';
        modal.offsetHeight; // reflow 강제 발생
        modal.style.animation = 'shake 0.4s ease';
      }
      
      elements.answerInput.select();
    }
  }

  // === 피드백 출력 ===
  function showFeedback(text, isCorrect) {
    elements.feedback.innerText = text;
    elements.feedback.style.display = 'block';
    
    if (isCorrect) {
      elements.feedback.className = 'vocab-feedback correct';
    } else {
      elements.feedback.className = 'vocab-feedback incorrect';
    }
  }

  // === 힌트 보기 ===
  function showHint() {
    if (!currentWord || isSolved) return;
    showFeedback(`초성 힌트: ${currentChosungHint}`, true);
    // 힌트 피드백은 초록색이 아니라 중립적인 파란색 느낌을 주기 위해 임시 클래스 변경
    elements.feedback.className = 'vocab-feedback correct';
    elements.feedback.style.borderColor = 'rgba(37, 99, 235, 0.2)';
    elements.feedback.style.background = 'rgba(37, 99, 235, 0.1)';
    elements.feedback.style.color = 'var(--vocab-blue)';
  }

  // === 정답 보기 ===
  function showAnswer() {
    if (!currentWord || isSolved) return;
    
    isSolved = true;
    elements.answerInput.value = currentWord.w;
    elements.answerInput.disabled = true;
    elements.submitBtn.disabled = true;
    elements.hintBtn.style.display = 'none';
    elements.giveUpBtn.style.display = 'none';
    elements.nextBtn.style.display = 'inline-block';
    elements.nextBtn.focus();
    
    showFeedback(`정답은 '${currentWord.w}'입니다. 뜻과 예문을 학습해 보세요!`, false);
    
    // 피드백 박스를 정답 공개용 노란색/주황색 톤으로 커스텀 스타일 적용
    elements.feedback.className = 'vocab-feedback correct';
    elements.feedback.style.borderColor = 'rgba(245, 158, 11, 0.2)';
    elements.feedback.style.background = 'rgba(245, 158, 11, 0.1)';
    elements.feedback.style.color = '#f59e0b';
    
    // 예문의 빈칸 정답 공개 및 연출
    document.querySelectorAll('.vocab-blank').forEach(el => {
      el.innerText = currentWord.w;
      el.classList.add('revealed');
    });
  }

  // === 꽃가루 효과 ===
  function triggerConfetti() {
    if (typeof window.confetti === 'function') {
      window.confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  }

  // === 어휘장 목록 렌더링 ===
  function renderSolvedList(filterText = '') {
    if (!elements.listContainer) return;
    elements.listContainer.innerHTML = '';
    
    const filter = filterText.trim().toLowerCase();
    const filtered = solvedVocabs.filter(item => {
      if (!filter) return true;
      return item.w.toLowerCase().includes(filter) || item.d.toLowerCase().includes(filter);
    });
    
    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'vocab-list-empty';
      emptyDiv.innerHTML = `
        <span class="vocab-list-empty-icon">📂</span>
        <span>${filterText ? '검색 결과와 일치하는 단어가 없습니다.' : '아직 정복한 단어가 없습니다. 문제를 맞추어 단어를 채워보세요!'}</span>
      `;
      elements.listContainer.appendChild(emptyDiv);
      return;
    }
    
    filtered.forEach(item => {
      const vocabItem = document.createElement('div');
      vocabItem.className = 'vocab-item';
      
      const badgeColor = item.l === '초급' ? 'green' : 'blue';
      
      // 아코디언 헤더
      vocabItem.innerHTML = `
        <div class="vocab-item-header">
          <div class="vocab-item-word-info">
            <span class="vocab-item-word">${item.w}</span>
            <span class="vocab-item-badge ${badgeColor}">${item.l} · ${item.p}</span>
          </div>
          <span class="vocab-item-arrow">▼</span>
        </div>
        <div class="vocab-item-body">
          <div class="vocab-item-content">
            <div class="vocab-item-def">${item.d}</div>
            <div class="vocab-item-ex-title">예문</div>
            <div class="vocab-item-ex-list">
              ${item.e.map(ex => `<div class="vocab-item-ex">• ${ex}</div>`).join('')}
            </div>
          </div>
        </div>
      `;
      
      // 토글 클릭 이벤트
      vocabItem.querySelector('.vocab-item-header').onclick = () => {
        const isExpanded = vocabItem.classList.contains('expanded');
        
        // 다른 열려있는 아이템을 전부 닫음 (아코디언 연출)
        document.querySelectorAll('.vocab-item.expanded').forEach(openItem => {
          if (openItem !== vocabItem) {
            openItem.classList.remove('expanded');
          }
        });
        
        vocabItem.classList.toggle('expanded', !isExpanded);
      };
      
      elements.listContainer.appendChild(vocabItem);
    });
  }

  // 글로벌 스코프에 인스턴스 API 노출
  window.vocabGame = {
    open: openVocabModal,
    close: closeVocabModal
  };

  // 페이지 로드 시 초기화 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
