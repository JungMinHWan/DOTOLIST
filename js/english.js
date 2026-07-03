/**
 * 🌌 GROW ENGLISH - 나만의 원서 단어 은하 & 인지 기억 훈련
 */

(function () {
  // === 1. 상태 변수 및 자료구조 ===
  let books = []; // 책 리스트
  let words = []; // 전체 단어 리스트
  let activeBook = null; // 현재 탐험 중인 책 객체
  
  // 은하(Canvas) 카메라 상태
  let canvas = null;
  let ctx = null;
  let scale = 1.0;
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let nodes = []; // Canvas 상의 단어 노드 좌표 및 물리 상태
  let animationFrameId = null;
  let hoveredNode = null;
  
  // 모바일 제스처용 변수
  let touchStartDist = 0;
  
  // 인지 훈련 상태
  let studyQueue = [];
  let currentStudyIndex = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let isFlashCardFlipped = false;
  
  // 집중 뇌파 (Binaural Beats) 플레이어
  let audioCtx = null;
  let leftOsc = null;
  let rightOsc = null;
  let masterGain = null;
  let isBeatsPlaying = false;
  
  // 테마 색상 기본값
  let selectedThemeColor = '#3b82f6';
  
  // === DOM 요소 캐시 ===
  const el = {
    // 메인 모달
    modal: document.getElementById('englishModalOverlay'),
    closeBtn: document.getElementById('englishModalClose'),
    
    // 탭
    tabLib: document.getElementById('englishTabLibrary'),
    tabGalaxy: document.getElementById('englishTabGalaxy'),
    tabStudy: document.getElementById('englishTabStudy'),
    
    // 섹션
    secLib: document.getElementById('englishSectionLibrary'),
    secGalaxy: document.getElementById('englishSectionGalaxy'),
    secStudy: document.getElementById('englishSectionStudy'),
    
    // 내 서재 뷰
    bookCount: document.getElementById('libraryBookCount'),
    bookshelf: document.getElementById('bookshelfContainer'),
    btnOpenAddBook: document.getElementById('btnOpenAddBookModal'),
    
    // 은하 뷰
    galaxyBookTitle: document.getElementById('galaxyActiveBookTitle'),
    galaxyBookProgress: document.getElementById('galaxyActiveBookProgress'),
    btnOpenAddWord: document.getElementById('btnOpenAddWordModal'),
    btnCompleteBook: document.getElementById('btnCompleteBook'),
    galaxyWordCount: document.getElementById('galaxyWordCount'),
    btnResetGalaxy: document.getElementById('btnResetGalaxyView'),
    btnToggleList: document.getElementById('btnToggleWordList'),
    wordListContainer: document.getElementById('galaxyWordList'),
    
    // 인지 훈련 뷰
    studyReviewCount: document.getElementById('studyReviewCount'),
    chkStudyBeats: document.getElementById('chkStudyBeats'),
    studyStartCard: document.getElementById('studyStartCard'),
    studyPlayCard: document.getElementById('studyPlayCard'),
    studyResultCard: document.getElementById('studyResultCard'),
    btnStartStudy: document.getElementById('btnStartStudy'),
    studyProgressBar: document.getElementById('studyProgressBar'),
    flashCard: document.getElementById('flashCard'),
    flashCardInner: document.getElementById('flashCardInner'),
    studyWord: document.getElementById('studyWord'),
    studyDefinition: document.getElementById('studyDefinition'),
    studyExample: document.getElementById('studyExample'),
    studyAnswerInput: document.getElementById('studyAnswerInput'),
    studyFeedback: document.getElementById('studyFeedback'),
    btnStudyGiveUp: document.getElementById('btnStudyGiveUp'),
    btnStudySubmit: document.getElementById('btnStudySubmit'),
    btnStudyNext: document.getElementById('btnStudyNext'),
    studyFinalCorrect: document.getElementById('studyFinalCorrect'),
    studyFinalWrong: document.getElementById('studyFinalWrong'),
    btnBackToLibrary: document.getElementById('btnBackToLibrary'),
    
    // 서브 모달 - 새 책
    addBookModal: document.getElementById('addBookModalOverlay'),
    addBookClose: document.getElementById('btnAddBookClose'),
    bookTitleInput: document.getElementById('bookTitleInput'),
    bookPagesInput: document.getElementById('bookTotalPagesInput'),
    btnSubmitAddBook: document.getElementById('btnSubmitAddBook'),
    
    // 서브 모달 - 새 단어
    addWordModal: document.getElementById('addWordModalOverlay'),
    addWordClose: document.getElementById('btnAddWordClose'),
    wordInput: document.getElementById('wordInput'),
    wordDefInput: document.getElementById('wordDefInput'),
    wordExInput: document.getElementById('wordExInput'),
    btnSubmitAddWord: document.getElementById('btnSubmitAddWord'),
    btnAiAssist: document.getElementById('btnAiAssist'),
    
    // 서브 모달 - 완독 리포트
    reportModal: document.getElementById('bookReportModalOverlay'),
    reportClose: document.getElementById('btnReportClose'),
    reportBookTitle: document.getElementById('reportBookTitle'),
    reportWordCount: document.getElementById('reportWordCount'),
    reportStudyCount: document.getElementById('reportStudyCount'),
    btnReportConfirm: document.getElementById('btnReportConfirm')
  };

  // === 2. 초기화 및 이벤트 연결 ===
  function init() {
    loadData();
    setupEvents();
    initCanvas();
  }

  // 데이터 로드 (로컬 스토리지)
  function loadData() {
    const localBooks = localStorage.getItem('grow_english_books');
    const localWords = localStorage.getItem('grow_english_words');
    
    books = localBooks ? JSON.parse(localBooks) : [];
    words = localWords ? JSON.parse(localWords) : [];
  }

  // 데이터 세이브 (로컬 스토리지)
  function saveAllData() {
    localStorage.setItem('grow_english_books', JSON.stringify(books));
    localStorage.setItem('grow_english_words', JSON.stringify(words));
  }

  function setupEvents() {
    // 모달 닫기
    el.closeBtn.onclick = closeEnglishModal;
    el.modal.onclick = (e) => {
      if (e.target === el.modal) closeEnglishModal();
    };

    // 탭 전환
    el.tabLib.onclick = () => switchTab('library');
    el.tabGalaxy.onclick = () => switchTab('galaxy');
    el.tabStudy.onclick = () => switchTab('study');

    // 서재 탭 액션
    el.btnOpenAddBook.onclick = () => openSubModal(el.addBookModal);
    el.addBookClose.onclick = () => closeSubModal(el.addBookModal);
    el.btnSubmitAddBook.onclick = handleAddBook;

    // 책 표지 테마 색상 선택
    document.querySelectorAll('.theme-color-option').forEach(opt => {
      opt.onclick = function() {
        document.querySelectorAll('.theme-color-option').forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        selectedThemeColor = this.getAttribute('data-color');
      };
    });

    // 은하 탭 액션
    el.btnOpenAddWord.onclick = () => {
      openSubModal(el.addWordModal);
      el.wordInput.focus();
    };
    el.addWordClose.onclick = () => closeSubModal(el.addWordModal);
    el.btnSubmitAddWord.onclick = handleAddWord;
    el.btnAiAssist.onclick = handleAiAssist;
    el.btnCompleteBook.onclick = handleBookCompletion;
    el.btnResetGalaxy.onclick = resetGalaxyView;
    el.btnToggleList.onclick = toggleWordList;

    // 완독 리포트
    el.reportClose.onclick = () => closeSubModal(el.reportModal);
    el.btnReportConfirm.onclick = confirmBookCompletion;

    // 인지 훈련 탭 액션
    el.btnStartStudy.onclick = startStudySession;
    el.flashCard.onclick = flipFlashCard;
    el.btnStudyGiveUp.onclick = showStudyAnswer;
    el.btnStudySubmit.onclick = submitStudyAnswer;
    el.btnStudyNext.onclick = nextStudyWord;
    el.btnBackToLibrary.onclick = () => switchTab('library');
    el.chkStudyBeats.onchange = toggleBinauralBeats;
    
    // 정답 엔터 입력 바인딩
    el.studyAnswerInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        if (!el.btnStudyNext.classList.contains('hidden')) {
          nextStudyWord();
        } else {
          submitStudyAnswer();
        }
      }
    };
  }

  // === 3. 모달 및 탭 제어 ===
  function openEnglishModal() {
    el.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    switchTab('library');
  }

  function closeEnglishModal() {
    el.modal.classList.add('hidden');
    document.body.style.overflow = '';
    
    // 오디오 정리 및 루프 프레임 캔슬
    stopBinauralBeats();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function switchTab(tab) {
    // 액티브 탭 클래스 토글
    el.tabLib.classList.remove('active');
    el.tabGalaxy.classList.remove('active');
    el.tabStudy.classList.remove('active');
    
    el.secLib.classList.remove('active');
    el.secGalaxy.classList.remove('active');
    el.secStudy.classList.remove('active');

    // 루프 애니메이션 중단 (은하 탭이 아닐 경우 리소스 절약)
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (tab === 'library') {
      el.tabLib.classList.add('active');
      el.secLib.classList.add('active');
      renderLibrary();
    } else if (tab === 'galaxy') {
      el.tabGalaxy.classList.add('active');
      el.secGalaxy.classList.add('active');
      renderGalaxyView();
    } else if (tab === 'study') {
      el.tabStudy.classList.add('active');
      el.secStudy.classList.add('active');
      prepareStudyView();
    }
  }

  function openSubModal(modalEl) {
    modalEl.classList.remove('hidden');
  }

  function closeSubModal(modalEl) {
    modalEl.classList.add('hidden');
    // 입력값 비우기
    if (modalEl === el.addBookModal) {
      el.bookTitleInput.value = '';
      el.bookPagesInput.value = '';
    } else if (modalEl === el.addWordModal) {
      el.wordInput.value = '';
      el.wordDefInput.value = '';
      el.wordExInput.value = '';
    }
  }

  // === 4. 내 서재 (Library) 비즈니스 로직 ===
  function renderLibrary() {
    el.bookCount.innerText = books.length;
    el.bookshelf.innerHTML = '';

    if (books.length === 0) {
      el.bookshelf.innerHTML = `
        <div class="bookshelf-empty">
          <p>📚 아직 등록된 책이 없습니다.</p>
          <p class="sub">새 책 등록을 눌러 모험을 시작하세요!</p>
        </div>`;
      el.tabGalaxy.style.display = 'none';
      el.tabStudy.style.display = 'none';
      return;
    }

    // 은하 및 학습 탭 노출
    el.tabGalaxy.style.display = 'inline-block';
    
    // 오늘 복습할 단어가 있는지 확인하여 학습 탭 활성화 유무 체크
    const studyCount = getTodayReviewCount();
    el.tabStudy.style.display = 'inline-block';
    
    books.forEach(book => {
      const bookWords = words.filter(w => w.bookId === book.id);
      const completionTag = book.isCompleted ? '<span class="book-complete-badge">🏆 완독</span>' : '';
      
      // 진행도 계산 (가장 높게 입력한 단어 페이지 기준 또는 수동 입력)
      let progress = 0;
      if (bookWords.length > 0) {
        const maxPage = Math.max(...bookWords.map(w => w.page || 0));
        progress = Math.min(100, Math.round((maxPage / book.totalPages) * 100));
      }
      if (book.isCompleted) progress = 100;

      const card = document.createElement('div');
      card.className = 'book-card';
      card.style.setProperty('--theme-color', book.color);
      card.innerHTML = `
        ${completionTag}
        <div>
          <h4 class="book-card-title">${book.title}</h4>
          <div class="book-card-meta">
            <span>수집 단어: <strong>${bookWords.length}</strong>개</span>
            <span>총 페이지: ${book.totalPages}p</span>
          </div>
        </div>
        <div class="book-progress-wrapper">
          <div class="book-progress-bar-container">
            <div class="book-progress-bar" style="width: ${progress}%"></div>
          </div>
          <div class="book-progress-percent">
            <span>Progress</span>
            <span>${progress}%</span>
          </div>
        </div>
      `;
      
      card.onclick = () => {
        activeBook = book;
        switchTab('galaxy');
      };
      
      el.bookshelf.appendChild(card);
    });
  }

  function handleAddBook() {
    const title = el.bookTitleInput.value.trim();
    const totalPages = parseInt(el.bookPagesInput.value);

    if (!title || isNaN(totalPages) || totalPages <= 0) {
      alert('올바른 책 제목과 페이지 수를 입력해 주세요.');
      return;
    }

    const newBook = {
      id: 'book_' + Date.now(),
      title: title,
      totalPages: totalPages,
      color: selectedThemeColor,
      isCompleted: false,
      studyCount: 0
    };

    books.push(newBook);
    saveAllData();
    closeSubModal(el.addBookModal);
    renderLibrary();
    
    // 즉시 해당 책의 은하 뷰로 이동
    activeBook = newBook;
    switchTab('galaxy');
  }

  // === 5. 단어 은하 (Galaxy) 로직 & 렌더링 ===
  function renderGalaxyView() {
    if (!activeBook) {
      switchTab('library');
      return;
    }

    el.galaxyBookTitle.innerText = activeBook.title;
    
    const bookWords = words.filter(w => w.bookId === activeBook.id);
    el.galaxyWordCount.innerText = bookWords.length;

    // 진행률 계산
    let progress = 0;
    if (bookWords.length > 0) {
      const maxPage = Math.max(...bookWords.map(w => w.page || 0));
      progress = Math.min(100, Math.round((maxPage / activeBook.totalPages) * 100));
    }
    if (activeBook.isCompleted) progress = 100;
    el.galaxyBookProgress.innerText = `${progress}% 읽음 (${activeBook.totalPages}페이지 중)`;

    // 완독 선언 버튼 노출 여부
    if (progress >= 95 && !activeBook.isCompleted) {
      el.btnCompleteBook.style.display = 'inline-flex';
    } else {
      el.btnCompleteBook.style.display = 'none';
    }

    // 단어 아코디언 리스트 그리기
    renderWordList(bookWords);

    // Canvas 별자리 노드 셋업
    setupGalaxyNodes(bookWords);

    // 캔버스 은하 애니메이션 루프 시작
    if (!animationFrameId) {
      loopGalaxy();
    }
  }

  function handleAddWord() {
    const wordText = el.wordInput.value.trim().toLowerCase();
    const pageNum = 0; // 발견 페이지 입력 제거
    const defText = el.wordDefInput.value.trim();
    const exText = el.wordExInput.value.trim();

    if (!wordText || !defText) {
      alert('영단어와 뜻은 필수로 입력해야 합니다.');
      return;
    }

    // 중복 체크
    const isDuplicate = words.some(w => w.bookId === activeBook.id && w.word === wordText);
    if (isDuplicate) {
      alert('이미 등록된 단어입니다.');
      return;
    }

    // 에빙하우스 망각 곡선 기본 주기 셋업 (SuperMemo-2 기초 알고리즘 차용)
    const newWord = {
      id: 'word_' + Date.now(),
      bookId: activeBook.id,
      word: wordText,
      page: pageNum,
      definition: defText,
      example: exText,
      level: 1, // 학습 단계
      repetitions: 0, // 학습 반복 횟수
      interval: 1, // 복습 주기(일 단위)
      easeFactor: 2.5, // 난이도 팩터
      nextReviewDate: new Date().toISOString().split('T')[0] // 오늘 즉시 학습 가능하도록 설정
    };

    words.push(newWord);
    saveAllData();
    closeSubModal(el.addWordModal);
    renderGalaxyView();
  }

  // AI 자동완성 기능 (외부 사전 API 및 번역 API 실시간 연동으로 고도화)
  async function handleAiAssist() {
    const wordText = el.wordInput.value.trim();
    if (!wordText) {
      alert('먼저 영단어를 입력해 주세요.');
      return;
    }

    el.btnAiAssist.innerText = '🤖 실시간 분석 중..';
    el.btnAiAssist.disabled = true;

    try {
      const encodedWord = encodeURIComponent(wordText.toLowerCase());
      
      // Dictionary API (품사, 정의, 예문 추출용) & MyMemory API (한글 뜻 번역용) 병렬 요청
      const [dictRes, transRes] = await Promise.allSettled([
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodedWord}`),
        fetch(`https://api.mymemory.translated.net/get?q=${encodedWord}&langpair=en|ko`)
      ]);

      let finalDef = '';
      let finalEx = '';
      let partOfSpeech = '';

      // 1. 번역 API 결과 처리
      if (transRes.status === 'fulfilled' && transRes.value.ok) {
        const transData = await transRes.value.json();
        if (transData.responseData && transData.responseData.translatedText) {
          const transText = transData.responseData.translatedText.trim();
          // 번역 텍스트가 영어 단어와 똑같이 나온 경우(에러 혹은 미지원)를 제외하고 사용
          if (transText.toLowerCase() !== wordText.toLowerCase()) {
            finalDef = transText;
          }
        }
      }

      // 2. 사전 API 결과 처리 (영영 예문 및 품사 추출)
      if (dictRes.status === 'fulfilled' && dictRes.value.ok) {
        const dictData = await dictRes.value.json();
        if (Array.isArray(dictData) && dictData.length > 0) {
          const entry = dictData[0];
          
          // 예문(example)이 존재하는 첫 번째 정의 탐색
          if (entry.meanings && entry.meanings.length > 0) {
            partOfSpeech = entry.meanings[0].partOfSpeech || '';
            
            for (const meaning of entry.meanings) {
              if (meaning.definitions) {
                for (const def of meaning.definitions) {
                  if (def.example) {
                    finalEx = def.example;
                    break;
                  }
                }
              }
              if (finalEx) break;
            }
          }
        }
      }

      // 3. 필드 채워넣기 및 폴백 매핑
      if (finalDef) {
        // 품사 태그 보정
        const posMap = {
          noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사',
          pronoun: '대명사', preposition: '전치사', conjunction: '접속사', interjection: '감탄사'
        };
        const posKr = posMap[partOfSpeech] || partOfSpeech;
        el.wordDefInput.value = posKr ? `[${posKr}] ${finalDef}` : finalDef;
      } else {
        el.wordDefInput.value = '[직접 입력] 단어의 뜻을 입력해 주세요.';
      }

      if (finalEx) {
        el.wordExInput.value = finalEx;
      } else {
        el.wordExInput.value = `This is a sentence containing the word: ${wordText}.`;
      }
      
      if (navigator.vibrate) navigator.vibrate(60); // 모바일 진동 피드백
    } catch (e) {
      console.error('AI 자동완성 오류:', e);
      alert('사전 데이터를 가져오는 중 일시적인 네트워크 오류가 발생했습니다.');
    } finally {
      el.btnAiAssist.innerText = '🤖 AI 자동완성';
      el.btnAiAssist.disabled = false;
    }
  }

  // 아코디언 단어 목록 토글
  function toggleWordList() {
    const isHidden = el.wordListContainer.classList.contains('hidden');
    if (isHidden) {
      el.wordListContainer.classList.remove('hidden');
      el.btnToggleList.innerText = '목록 닫기';
    } else {
      el.wordListContainer.classList.add('hidden');
      el.btnToggleList.innerText = '목록 열기';
    }
  }

  function renderWordList(bookWords) {
    el.wordListContainer.innerHTML = '';
    
    if (bookWords.length === 0) {
      el.wordListContainer.innerHTML = '<div style="text-align:center; color:var(--eng-text-muted); font-size:0.8rem; padding:10px;">등록된 단어가 없습니다.</div>';
      return;
    }

    // 페이지 순서대로 정렬
    const sorted = [...bookWords].sort((a, b) => a.page - b.page);

    sorted.forEach(w => {
      const item = document.createElement('div');
      item.className = 'word-item';
      
      // 단계별 색상 도트
      const colorMap = ['#94a3b8', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
      const dotColor = colorMap[Math.min(w.level, colorMap.length - 1)];

      item.innerHTML = `
        <div class="word-item-header">
          <div style="display:flex; align-items:center;">
            <span class="word-level-dot" style="background:${dotColor}"></span>
            <span class="word-item-title">${w.word}</span>
            <span style="font-size:0.7rem; color:var(--eng-gold); margin-left:8px;">p.${w.page}</span>
          </div>
          <span class="word-item-meaning">${w.definition}</span>
        </div>
        <div class="word-item-details" id="details_${w.id}">
          <div><strong>복습 예정:</strong> ${w.nextReviewDate} (주기: ${w.interval}일)</div>
          <div class="word-details-sentence">"${w.example || '등록된 문장이 없습니다.'}"</div>
        </div>
      `;

      item.querySelector('.word-item-header').onclick = () => {
        const details = item.querySelector('.word-item-details');
        const isActive = details.classList.contains('active');
        
        // 전체 아코디언 닫기
        document.querySelectorAll('.word-item-details').forEach(d => d.classList.remove('active'));
        
        if (!isActive) {
          details.classList.add('active');
          // 은하 포커싱 맞추기
          focusNodeInGalaxy(w.id);
        }
      };

      el.wordListContainer.appendChild(item);
    });
  }

  // === 6. HTML5 Canvas 단어 은하 물리 시뮬레이션 및 드로잉 ===
  function initCanvas() {
    canvas = document.getElementById('englishGalaxyCanvas');
    ctx = canvas.getContext('2d');

    // 리사이즈 및 해상도 보정
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 마우스/터치 드래그 탐색
    canvas.addEventListener('mousedown', dragStart);
    canvas.addEventListener('mousemove', dragMove);
    canvas.addEventListener('mouseup', dragEnd);
    canvas.addEventListener('mouseleave', dragEnd);

    canvas.addEventListener('touchstart', dragStart, { passive: true });
    canvas.addEventListener('touchmove', dragMove, { passive: true });
    canvas.addEventListener('touchend', dragEnd);

    // 휠 줌
    canvas.addEventListener('wheel', handleWheel, { passive: false });
  }

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function resetGalaxyView() {
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
  }

  // 나선형(Spiral) 기반으로 페이지 순서에 따라 노드 배치 설정
  function setupGalaxyNodes(bookWords) {
    nodes = [];
    if (bookWords.length === 0) return;

    // 페이지 기준 정렬
    const sorted = [...bookWords].sort((a, b) => a.page - b.page);

    sorted.forEach((w, idx) => {
      // 황금나선 배치 알고리즘 적용 (지적인 천체 은하 구조 연출)
      const theta = idx * 2.4; // 나선각
      const radius = 25 + idx * 22; // 중심에서의 거리 확장
      
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius;

      // 천체 입자 성격 부여 (약간의 자전/공전 흔들림 연출용)
      nodes.push({
        id: w.id,
        word: w.word,
        definition: w.definition,
        level: w.level,
        page: w.page,
        x: x,
        y: y,
        baseX: x,
        baseY: y,
        pulseOffset: Math.random() * Math.PI * 2,
        size: 5 + Math.min(w.level * 1.5, 8)
      });
    });
  }

  // 특정 노드 포커스
  function focusNodeInGalaxy(wordId) {
    const node = nodes.find(n => n.id === wordId);
    if (node) {
      // 타겟 노드가 화면 중앙에 위치하도록 오프셋 세팅
      scale = 1.5; // 집중 확대
      offsetX = -node.baseX * scale;
      offsetY = -node.baseY * scale;
    }
  }

  // Canvas 드로잉 루프
  function loopGalaxy() {
    if (!canvas || !ctx) return;
    
    // 은하 배경 그리기 (우주 성운 그라데이션)
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // 줌 및 화면 이동 적용
    ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
    
    const time = Date.now() * 0.002;

    // 1. 별자리 선(Constellation Link) 그리기
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.lineWidth = 1;
    
    // 페이지 인접한 순서대로 부드럽게 네온 은하선 연결
    for (let i = 0; i < nodes.length - 1; i++) {
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
    }
    ctx.stroke();

    // 2. 단어 천체(Node) 및 텍스트 렌더링
    nodes.forEach(node => {
      // 미세한 자전/반짝임 시뮬레이션
      const pulse = Math.sin(time + node.pulseOffset) * 2;
      node.x = node.baseX + Math.cos(time + node.pulseOffset) * 0.5;
      node.y = node.baseY + Math.sin(time + node.pulseOffset) * 0.5;

      const currentSize = node.size + pulse * 0.4;

      // 등급별 네온 글로우 색상 매핑
      const colors = [
        { c: '#64748b', glow: 'rgba(100, 116, 139, 0.3)' }, // Lv.1
        { c: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)' },  // Lv.2
        { c: '#10b981', glow: 'rgba(16, 185, 129, 0.5)' },  // Lv.3
        { c: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },  // Lv.4
        { c: '#ef4444', glow: 'rgba(239, 68, 68, 0.7)' }    // Lv.5 (최고단계)
      ];
      const colorSet = colors[Math.min(node.level - 1, colors.length - 1)];

      // 글로우 이펙트
      ctx.shadowBlur = 10 + pulse * 2;
      ctx.shadowColor = colorSet.c;

      // 구체 천체 드로잉
      ctx.fillStyle = colorSet.c;
      ctx.beginPath();
      ctx.arc(node.x, node.y, currentSize, 0, Math.PI * 2);
      ctx.fill();

      // 글로우 리셋
      ctx.shadowBlur = 0;

      // 텍스트 라벨
      ctx.fillStyle = (hoveredNode && hoveredNode.id === node.id) ? '#fff' : 'rgba(249, 250, 251, 0.85)';
      ctx.font = (hoveredNode && hoveredNode.id === node.id) ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      
      // 단어 아래에 가볍게 라벨링
      ctx.fillText(node.word, node.x, node.y + currentSize + 14);
    });

    ctx.restore();

    animationFrameId = requestAnimationFrame(loopGalaxy);
  }

  // 마우스/터치 드래그 인터랙션 구현
  function dragStart(e) {
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    startX = clientX - offsetX;
    startY = clientY - offsetY;

    // 터치 핀치 줌을 위한 첫 터치 거리 기록
    if (e.touches && e.touches.length === 2) {
      touchStartDist = getTouchDistance(e.touches);
    }

    // 클릭한 노드가 있는지 검출
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left - canvas.width / 2 - offsetX;
    const clickY = clientY - rect.top - canvas.height / 2 - offsetY;

    let clicked = null;
    nodes.forEach(node => {
      const dist = Math.hypot(node.x * scale - clickX, node.y * scale - clickY);
      if (dist < (node.size + 15) * scale) {
        clicked = node;
      }
    });

    if (clicked) {
      hoveredNode = clicked;
      // 해당하는 리스트 아코디언 오픈
      const details = document.getElementById(`details_${clicked.id}`);
      if (details) {
        document.querySelectorAll('.word-item-details').forEach(d => d.classList.remove('active'));
        details.classList.add('active');
        details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      hoveredNode = null;
    }
  }

  function dragMove(e) {
    if (!isDragging) return;

    // 핀치 줌 처리
    if (e.touches && e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      const factor = dist / touchStartDist;
      scale = Math.min(3.0, Math.max(0.5, scale * factor));
      touchStartDist = dist;
      return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    offsetX = clientX - startX;
    offsetY = clientY - startY;
  }

  function dragEnd() {
    isDragging = false;
  }

  function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      scale = Math.min(3.0, scale * zoomFactor);
    } else {
      scale = Math.max(0.5, scale / zoomFactor);
    }
  }

  function getTouchDistance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  // === 7. 완독 처리 및 리포트 ===
  function handleBookCompletion() {
    if (!activeBook) return;

    const bookWords = words.filter(w => w.bookId === activeBook.id);
    
    // 모달창에 리포트 값 기입
    el.reportBookTitle.innerText = activeBook.title;
    el.reportWordCount.innerText = bookWords.length;
    el.reportStudyCount.innerText = activeBook.studyCount || 0;

    openSubModal(el.reportModal);
    
    // 폭죽(Confetti) 날리기 연출
    if (window.confetti) {
      window.confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }

  function confirmBookCompletion() {
    if (!activeBook) return;

    // 책 최종 완독 상태 플래그 셋업
    const idx = books.findIndex(b => b.id === activeBook.id);
    if (idx !== -1) {
      books[idx].isCompleted = true;
    }

    saveAllData();
    closeSubModal(el.reportModal);
    switchTab('library');
  }

  // === 8. 인지 기억 훈련 (Study/Quiz) 알고리즘 & 연출 ===
  function getTodayReviewCount() {
    const today = new Date().toISOString().split('T')[0];
    return words.filter(w => w.nextReviewDate <= today && !books.find(b => b.id === w.bookId)?.isCompleted).length;
  }

  function prepareStudyView() {
    const today = new Date().toISOString().split('T')[0];
    
    // 완독하지 않은 책의 복습 대상 단어 추출
    studyQueue = words.filter(w => {
      const book = books.find(b => b.id === w.bookId);
      return w.nextReviewDate <= today && book && !book.isCompleted;
    });

    el.studyReviewCount.innerText = studyQueue.length;

    // 초기 카드 레이아웃 노출
    el.studyStartCard.classList.remove('hidden');
    el.studyPlayCard.classList.add('hidden');
    el.studyResultCard.classList.add('hidden');
  }

  function startStudySession() {
    if (studyQueue.length === 0) {
      alert('오늘 복습할 단어가 없습니다. 서재에서 더 많은 책에 영단어를 추가해 보세요!');
      return;
    }

    // 셔플 알고리즘
    studyQueue.sort(() => Math.random() - 0.5);

    currentStudyIndex = 0;
    correctCount = 0;
    wrongCount = 0;

    el.studyStartCard.classList.add('hidden');
    el.studyPlayCard.classList.remove('hidden');
    
    loadStudyWord();
  }

  function loadStudyWord() {
    isFlashCardFlipped = false;
    el.flashCard.classList.remove('flipped');
    
    // 인풋/피드백 리셋
    el.studyAnswerInput.value = '';
    el.studyAnswerInput.disabled = false;
    el.studyFeedback.className = 'study-feedback';
    el.studyFeedback.innerText = '';
    
    el.btnStudySubmit.classList.remove('hidden');
    el.btnStudyGiveUp.classList.remove('hidden');
    el.btnStudyNext.classList.add('hidden');

    const curWord = studyQueue[currentStudyIndex];

    // 프로그레스 바 갱신
    const progressPercent = (currentStudyIndex / studyQueue.length) * 100;
    el.studyProgressBar.style.width = progressPercent + '%';

    // 카드 데이터 로드
    el.studyWord.innerText = curWord.word;
    el.studyDefinition.innerText = curWord.definition;
    
    // 예문에서 정답 단어를 빈칸(___)으로 가려 맥락 인출 훈련(Context Retrieval) 강화
    const rawEx = curWord.example || '';
    const regex = new RegExp(curWord.word, 'gi');
    const maskedEx = rawEx.replace(regex, '_______');
    el.studyExample.innerText = maskedEx ? `"${maskedEx}"` : '이 단어는 예문이 없습니다.';

    // 입력 포커스
    setTimeout(() => el.studyAnswerInput.focus(), 100);
  }

  function flipFlashCard() {
    isFlashCardFlipped = !isFlashCardFlipped;
    if (isFlashCardFlipped) {
      el.flashCard.classList.add('flipped');
    } else {
      el.flashCard.classList.remove('flipped');
    }
  }

  function showStudyAnswer() {
    const curWord = studyQueue[currentStudyIndex];
    
    // 오답 기록
    wrongCount++;
    
    // 3D 카드 뒤집기 연출로 정답 공개
    el.flashCard.classList.add('flipped');
    isFlashCardFlipped = true;

    el.studyFeedback.innerText = `정답은: ${curWord.word} 입니다.`;
    el.studyFeedback.className = 'study-feedback wrong';

    el.studyAnswerInput.value = curWord.word;
    el.studyAnswerInput.disabled = true;

    el.btnStudySubmit.classList.add('hidden');
    el.btnStudyGiveUp.classList.add('hidden');
    el.btnStudyNext.classList.remove('hidden');
    el.btnStudyNext.focus();
    
    updateSuperMemo2(curWord, false);
  }

  function submitStudyAnswer() {
    const inputVal = el.studyAnswerInput.value.trim().toLowerCase();
    const curWord = studyQueue[currentStudyIndex];

    if (!inputVal) {
      alert('스펠링을 입력해 주세요.');
      return;
    }

    // 카드 무조건 뒤집어서 상세(뜻/원어 예문) 노출
    el.flashCard.classList.add('flipped');
    isFlashCardFlipped = true;

    if (inputVal === curWord.word.toLowerCase()) {
      // 정답
      correctCount++;
      el.studyFeedback.innerText = '🎉 정답입니다!';
      el.studyFeedback.className = 'study-feedback correct';
      
      if (navigator.vibrate) navigator.vibrate(60); // 햅틱 피드백
      
      updateSuperMemo2(curWord, true);
    } else {
      // 오답
      wrongCount++;
      el.studyFeedback.innerText = `오답입니다. 정답: ${curWord.word}`;
      el.studyFeedback.className = 'study-feedback wrong';
      
      if (navigator.vibrate) navigator.vibrate([40, 40]);
      
      updateSuperMemo2(curWord, false);
    }

    el.studyAnswerInput.disabled = true;
    el.btnStudySubmit.classList.add('hidden');
    el.btnStudyGiveUp.classList.add('hidden');
    el.btnStudyNext.classList.remove('hidden');
    el.btnStudyNext.focus();
  }

  // SuperMemo-2 에빙하우스 간격 반복 알고리즘 적용
  function updateSuperMemo2(wordObj, isCorrect) {
    // 1~5점 퀄리티 평가 흉내 (맞으면 4점, 틀리면 1점)
    const quality = isCorrect ? 4 : 1;
    
    let repetitions = wordObj.repetitions || 0;
    let interval = wordObj.interval || 1;
    let easeFactor = wordObj.easeFactor || 2.5;

    if (quality >= 3) {
      if (repetitions === 0) {
        interval = 1; // 1일 뒤
      } else if (repetitions === 1) {
        interval = 3; // 3일 뒤
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1; // 즉시 내일 다시 암기하도록 주기 리셋
    }

    // 난이도 인자(Ease Factor) 재계산 공식
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    // 단어 레벨업 결정
    let newLevel = wordObj.level || 1;
    if (isCorrect) {
      newLevel = Math.min(5, newLevel + 1);
    } else {
      newLevel = Math.max(1, newLevel - 1);
    }

    // 다음 복습일 계산
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // 단어 정보 업데이트
    const targetIdx = words.findIndex(w => w.id === wordObj.id);
    if (targetIdx !== -1) {
      words[targetIdx].repetitions = repetitions;
      words[targetIdx].interval = interval;
      words[targetIdx].easeFactor = easeFactor;
      words[targetIdx].level = newLevel;
      words[targetIdx].nextReviewDate = nextDateStr;
    }

    // 해당 책의 누적 학습 횟수 카운트
    const bookIdx = books.findIndex(b => b.id === wordObj.bookId);
    if (bookIdx !== -1) {
      books[bookIdx].studyCount = (books[bookIdx].studyCount || 0) + 1;
    }

    saveAllData();
  }

  function nextStudyWord() {
    currentStudyIndex++;
    if (currentStudyIndex >= studyQueue.length) {
      // 훈련 세션 끝
      finishStudySession();
    } else {
      loadStudyWord();
    }
  }

  function finishStudySession() {
    el.studyPlayCard.classList.add('hidden');
    el.studyResultCard.classList.remove('hidden');

    el.studyFinalCorrect.innerText = correctCount;
    el.studyFinalWrong.innerText = wrongCount;

    // 오디오 중단
    stopBinauralBeats();
    el.chkStudyBeats.checked = false;
    
    if (window.confetti && correctCount > wrongCount) {
      window.confetti({ particleCount: 80, spread: 60 });
    }
  }

  // === 9. 집중용 독립 12Hz 알파 바이노럴 비트 플레이어 ===
  function toggleBinauralBeats() {
    if (el.chkStudyBeats.checked) {
      startBinauralBeats();
    } else {
      stopBinauralBeats();
    }
  }

  function startBinauralBeats() {
    if (isBeatsPlaying) return;

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // 마스터 게인 노드
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // 매우 차분하고 잔잔한 세기(8%) 설정

      // 스테레오 채널 머저를 통한 좌/우 주파수 분리 (바이어스로 12Hz 생성)
      const merger = audioCtx.createChannelMerger(2);

      // 왼쪽 채널: 200Hz 사인파
      leftOsc = audioCtx.createOscillator();
      leftOsc.type = 'sine';
      leftOsc.frequency.setValueAtTime(200, audioCtx.currentTime);
      const leftGain = audioCtx.createGain();
      leftOsc.connect(leftGain);

      // 오른쪽 채널: 212Hz 사인파 (우측 - 좌측 = 12Hz 집중 뇌파 발생)
      rightOsc = audioCtx.createOscillator();
      rightOsc.type = 'sine';
      rightOsc.frequency.setValueAtTime(212, audioCtx.currentTime);
      const rightGain = audioCtx.createGain();
      rightOsc.connect(rightGain);

      // 머저 노드에 스테레오 배선 연결
      leftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);

      // 믹싱 후 마스터 볼륨 -> 스피커 출력
      merger.connect(masterGain);
      masterGain.connect(audioCtx.destination);

      // 사운드 스타트
      leftOsc.start(0);
      rightOsc.start(0);
      
      isBeatsPlaying = true;
    } catch (e) {
      console.error('바이노럴 비트 오디오 컨텍스트 실행 실패:', e);
    }
  }

  function stopBinauralBeats() {
    if (!isBeatsPlaying) return;

    try {
      if (leftOsc) {
        leftOsc.stop(0);
        leftOsc.disconnect();
        leftOsc = null;
      }
      if (rightOsc) {
        rightOsc.stop(0);
        rightOsc.disconnect();
        rightOsc = null;
      }
      if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
      }
    } catch (e) {
      console.warn(e);
    } finally {
      isBeatsPlaying = false;
    }
  }

  // === 10. 외부 연동 모듈 노출 ===
  window.englishGame = {
    open: openEnglishModal,
    close: closeEnglishModal
  };

  // DOM 로드 이후 최종 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
