let currentPeriod = 'today', selectedDate = null, currentMetricsDate = null;
let customRangeStart = null, customRangeEnd = null;
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;
let touchStartTime = 0, touchSwipeValid = false;
let loadedTasks = [];
let dateSortDirection = 'asc';

let calDisplayDate = new Date();
let memoDatesSet = new Set();
let diaryDatesSet = new Set();
let newsDatesSet = new Set();
let secretLetterDatesSet = new Set();

let currentGoal = null;
let currentBooks = [];
let selectedBook = null;
let currentBookFilter = 'all';
let currentBookSearch = '';
let currentManuals = [];
let selectedManual = null;
let currentManualFilter = 'all';
let currentManualSearch = '';

const THEMES = {
  0: { primary: '#E5484D', dark: '#C03538', light: '#FDECEC', header: '#E5484D' },                    // 일: 비비드 레드
  1: { primary: '#1E40AF', dark: '#16308A', light: '#E8EDFB', header: '#1E40AF' },                    // 월: 딥 네이비
  2: { primary: '#F76808', dark: '#C05206', light: '#FEF0E5', header: '#F76808' },                    // 화: 비비드 오렌지
  3: { primary: '#0091FF', dark: '#0072C9', light: '#E5F3FF', header: '#0091FF' },                    // 수: 클리어 블루
  4: { primary: '#12A594', dark: '#0E8074', light: '#E5F6F4', header: '#12A594' },                    // 목: 틸
  5: { primary: '#D4A017', dark: '#8A6A0B', light: '#FBF3DC', header: '#D4A017', lightHeader: true }, // 금: 골드 (밝은 헤더 → 진한 글자)
  6: { primary: '#6F4E37', dark: '#57402D', light: '#F3EDE8', header: '#6F4E37' }                     // 토: 딥 어스 브라운
};


function applyThemeByDate(dateStr) {
  if(!dateStr) return;
  const dayIndex = new Date(dateStr).getDay();
  const theme = THEMES[dayIndex];
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-primary-dark', theme.dark);
  root.style.setProperty('--theme-light-bg', theme.light);
  root.style.setProperty('--theme-header-bg', theme.header);
  // 밝은 헤더(금요일 골드)는 흰 글자 대신 진한 글자로 전환
  if (document.body) document.body.classList.toggle('light-header', !!theme.lightHeader);
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateKorean(dateStr) {
  const d = new Date(dateStr);
  const w = ['일','월','화','수','목','금','토'];
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${w[d.getDay()]})`;
}

// 모바일(터치 기기) 여부: Shift 키가 없으므로 Enter를 줄바꿈으로 사용
// ※ 삼성 갤럭시 등 일부 안드로이드는 (hover: hover)로 보고되므로 hover 조건은 쓰지 않음
const IS_TOUCH_DEVICE = (() => {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|SamsungBrowser/i.test(ua)) return true;
  // iPadOS(데스크톱 UA로 위장)
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
})();

// 할일 입력창 Enter 처리 규칙
// - PC: Enter = 저장, Shift+Enter = 줄바꿈
// - 모바일: Enter = 줄바꿈 (저장은 버튼으로)
// - 공통: Ctrl/Cmd+Enter = 저장
function shouldSubmitOnEnter(e) {
  if (e.key !== 'Enter') return false;
  if (e.ctrlKey || e.metaKey) return true;
  if (IS_TOUCH_DEVICE) return false;
  return !e.shiftKey;
}

// 달력 버튼 안 텍스트: 날짜 선택 시 해당 날짜, 아니면 '달력' (모바일에서 별도 라벨 때문에 잘리는 문제 방지)
function setCalendarBtnDate(dateStr) {
  const textEl = document.querySelector('#calendarBtn .calendar-btn-text');
  if (textEl) textEl.textContent = dateStr ? formatDateKorean(dateStr) : '달력';
}

function formatDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// IP 변경 또는 최초 접근 시 표시되는 4자리 비밀번호 모달 (**** 마스킹 지원)
function promptAccessPasswordModal(expectedPassword) {
  return new Promise((resolve) => {
    const modal = document.getElementById('accessAuthModalOverlay');
    const input = document.getElementById('accessAuthPasswordInput');
    const submitBtn = document.getElementById('accessAuthSubmitBtn');
    const toggleBtn = document.getElementById('accessAuthTogglePwBtn');
    const errorEl = document.getElementById('accessAuthError');

    // 모달 DOM이 없을 경우의 안전한 폴백
    if (!modal || !input) {
      let fallback = prompt('접근 권한이 필요합니다. 4자리 비밀번호를 입력하세요:');
      resolve(fallback);
      return;
    }

    input.value = '';
    input.type = 'password';
    if (toggleBtn) toggleBtn.innerText = '👁️';
    errorEl.classList.add('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      input.focus();
    }, 100);

    // 비밀번호 보기/숨기기 토글
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        if (input.type === 'password') {
          input.type = 'text';
          toggleBtn.innerText = '🔒';
        } else {
          input.type = 'password';
          toggleBtn.innerText = '👁️';
        }
        input.focus();
      };
    }

    const handleSubmit = () => {
      const val = input.value.trim();
      if (!val) {
        errorEl.innerText = '비밀번호를 입력해 주세요.';
        errorEl.classList.remove('hidden');
        input.focus();
        return;
      }

      if (val === expectedPassword) {
        errorEl.classList.add('hidden');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        resolve(val);
      } else {
        errorEl.innerText = '비밀번호가 올바르지 않습니다. 다시 입력해주세요.';
        errorEl.classList.remove('hidden');
        input.classList.remove('vault-shake');
        void input.offsetWidth; // reflow
        input.classList.add('vault-shake');
        input.value = '';
        input.focus();
      }
    };

    submitBtn.onclick = handleSubmit;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
  });
}

async function verifyAccess() {
  const PASSWORD = '4806';
  
  // 백그라운드 자동 로그인용 공용 가족 계정 정보
  const AUTH_EMAIL = 'family@yozm.co.kr';
  const AUTH_PASSWORD = 'family4806!'; // 4자리 비번 연상용 보안 패스워드

  let currentIp = 'unknown';
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    currentIp = data.ip;
  } catch(e) {
    console.error('IP check failed', e);
  }

  const storedIp = localStorage.getItem('todo_user_ip');
  const storedDevice = localStorage.getItem('todo_device_id');
  
  // Supabase Auth 세션이 이미 존재하고 유효한지 확인 (getUser는 서버에서 직접 토큰 유효성을 검증합니다)
  let hasValidSession = false;
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (!error && user && user.email === AUTH_EMAIL) {
      hasValidSession = true;
    }
  } catch (err) {
    console.error('Session check failed', err);
  }
  
  // IP가 바뀌었거나, 디바이스 ID가 없거나, 세션이 유효하지 않은 경우에만 4자리 비밀번호 확인
  if (storedIp !== currentIp || !storedDevice || !hasValidSession) {
    const input = await promptAccessPasswordModal(PASSWORD);
    if (input === PASSWORD) {
      try {
        // 1. 공용 계정으로 로그인 시도
        let { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
          email: AUTH_EMAIL,
          password: AUTH_PASSWORD
        });
        
        // 2. 계정이 없어서 로그인 실패한 경우, 자동으로 회원가입 처리
        if (authError && (authError.message.includes('Invalid login credentials') || authError.status === 400)) {
          console.log('가족 공용 계정이 존재하지 않아 자동으로 생성합니다...');
          const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email: AUTH_EMAIL,
            password: AUTH_PASSWORD
          });
          
          if (signUpError) {
            // 이메일 확인(Confirm Email) 기능이 켜져있어 가입에 실패하는 경우 안내
            if (signUpError.message.includes('Email signup confirmation') || signUpError.message.includes('confirmation')) {
              throw new Error('Supabase 대시보드에서 Confirm email 설정을 끄거나, family@yozm.co.kr 계정을 수동으로 생성하고 Confirm 처리해야 합니다.');
            }
            throw signUpError;
          }
          
          // 가입 후 다시 로그인 시도
          const { data: retryData, error: retryError } = await supabaseClient.auth.signInWithPassword({
            email: AUTH_EMAIL,
            password: AUTH_PASSWORD
          });
          if (retryError) throw retryError;
        } else if (authError) {
          throw authError;
        }

        localStorage.setItem('todo_user_ip', currentIp);
        localStorage.setItem('todo_device_id', storedDevice || ('device_' + Math.random().toString(36).substr(2, 9)));
      } catch (authFail) {
        console.error('Supabase 백그라운드 로그인 실패:', authFail);
        alert('가족 공용 계정 연동 및 로그인에 실패했습니다:\n' + authFail.message);
        document.body.innerHTML = '<div style="display:flex; height:100vh; align-items:center; justify-content:center; flex-direction:column; background:#f8fafc; padding: 20px; text-align: center;"><h2 style="font-size:22px; color:#0f172a;">가족 계정 연동 오류</h2><p style="color:#64748b; margin-top:8px; line-height: 1.6;">Supabase Auth에 family@yozm.co.kr 계정을 생성해주시거나,<br>대시보드 Authentication -> Providers -> Email 메뉴에서 "Confirm email" 설정을 꺼주세요.</p></div>';
        throw authFail;
      }
    } else {
      alert('비밀번호가 틀렸습니다. 새로고침하여 다시 시도해주세요.');
      document.body.innerHTML = '<div style="display:flex; height:100vh; align-items:center; justify-content:center; flex-direction:column; background:#f8fafc;"><h2 style="font-size:24px; color:#0f172a;">접근이 제한되었습니다.</h2><p style="color:#64748b; margin-top:8px;">새로고침하여 다시 시도해주세요.</p></div>';
      throw new Error('Access Denied');
    }
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    await verifyAccess();
  } catch(e) {
    return;
  }

  currentMetricsDate = getTodayString();
  document.getElementById('inputDueDate').value = currentMetricsDate;
  applyThemeByDate(currentMetricsDate);
  
  fetchAllDates(); 
  refreshAllData();
  loadGamification();
  loadGoal();
  loadBooks();
  loadManuals();
  
  // AI 독서 지식 노트 로컬 카드 마이그레이션 및 사전 로드
  if (window.lexiconUI && typeof window.lexiconUI.loadUserDeck === 'function') {
    window.lexiconUI.loadUserDeck();
  }
  
  // 빠른 정렬 버튼 이벤트 바인딩
  const btnSortDate = document.getElementById('btnSortDate');
  if (btnSortDate) {
    btnSortDate.addEventListener('click', sortTasksByDate);
  }
  const btnSortUncompleted = document.getElementById('btnSortUncompleted');
  if (btnSortUncompleted) {
    btnSortUncompleted.addEventListener('click', sortTasksByUncompleted);
  }
  
  document.addEventListener('touchstart', e => {
    // 한 손가락 터치만 스와이프로 인정, 입력창·가로 스크롤 영역에서 시작한 터치는 제외
    const t = e.target;
    touchSwipeValid = e.touches.length === 1 &&
      !(t.closest && t.closest('input, textarea, select, [contenteditable="true"], .period-tabs, canvas'));
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    touchStartTime = Date.now();
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) touchSwipeValid = false;
  }, {passive: true});
  document.addEventListener('touchend', e => {
    if (!touchSwipeValid || e.touches.length > 0) { touchSwipeValid = false; return; }
    touchSwipeValid = false;
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, {passive: true});
  
  document.getElementById('searchToggleBtn').onclick = () => toggleHeader('search');
  
  // === 메모 버튼 롱프레스(비밀편지) 및 숏클릭(메모 토글) 통합 바인딩 ===
  const memoToggleBtn = document.getElementById('memoToggleBtn');
  let memoLongPressTimer = null;
  let isMemoLongPressTriggered = false;
  let memoPressStartTime = 0;
  const MEMO_LONG_PRESS_DURATION = 800; // 0.8초

  function startMemoPress(e) {
    if (e.type === 'touchstart' && e.cancelable) {
      e.preventDefault();
    }
    isMemoLongPressTriggered = false;
    memoPressStartTime = Date.now();
    
    if (memoLongPressTimer) {
      clearTimeout(memoLongPressTimer);
    }
    
    memoLongPressTimer = setTimeout(() => {
      isMemoLongPressTriggered = true;
      if (navigator.vibrate) {
        navigator.vibrate([60]);
      }
      openSecretLetterModal();
    }, MEMO_LONG_PRESS_DURATION);
  }

  function endMemoPress(e) {
    if (memoLongPressTimer) {
      clearTimeout(memoLongPressTimer);
      memoLongPressTimer = null;
    }

    if (isMemoLongPressTriggered) {
      isMemoLongPressTriggered = false;
      if (e.cancelable) e.preventDefault();
      return;
    }

    const duration = Date.now() - memoPressStartTime;
    if (duration > 10 && (e.type === 'mouseup' || e.type === 'touchend')) {
      toggleHeader('memo');
    }

    if (e.cancelable) {
      e.preventDefault();
    }
  }

  function cancelMemoPress(e) {
    if (memoLongPressTimer) {
      clearTimeout(memoLongPressTimer);
      memoLongPressTimer = null;
    }
  }

  memoToggleBtn.addEventListener('mousedown', startMemoPress);
  memoToggleBtn.addEventListener('mouseup', endMemoPress);
  memoToggleBtn.addEventListener('mouseleave', cancelMemoPress);

  memoToggleBtn.addEventListener('touchstart', startMemoPress, { passive: false });
  memoToggleBtn.addEventListener('touchend', endMemoPress, { passive: false });
  memoToggleBtn.addEventListener('touchcancel', cancelMemoPress);

  memoToggleBtn.addEventListener('contextmenu', e => e.preventDefault());

  document.getElementById('diaryToggleBtn').onclick = () => toggleHeader('diary');
  document.getElementById('newsToggleBtn').onclick = () => toggleHeader('news');
  document.getElementById('calendarBtn').onclick = () => {
    toggleHeader('calendar');
    renderCalendar();
  };
  
  document.getElementById('prevMonthBtn').onclick = () => { calDisplayDate.setMonth(calDisplayDate.getMonth()-1); renderCalendar(); };
  document.getElementById('nextMonthBtn').onclick = () => { calDisplayDate.setMonth(calDisplayDate.getMonth()+1); renderCalendar(); };
  
  document.getElementById('searchBtn').onclick = executeSearch;
  document.getElementById('searchInput').onkeypress = (e) => { if(e.key === 'Enter') executeSearch(); };
  document.getElementById('saveMemoBtn').onclick = saveMemo;
  document.getElementById('saveDiaryBtn').onclick = saveDiary;
  document.getElementById('saveNewsBtn').onclick = saveNews;

  // 손필기(S-Pen) 전용 모달 오픈 버튼
  const memoSpenBtn = document.getElementById('openMemoSpenBtn');
  if (memoSpenBtn) {
    memoSpenBtn.onclick = () => {
      if (window.openSpenNote) window.openSpenNote('memo', currentMetricsDate || selectedDate);
    };
  }
  const diarySpenBtn = document.getElementById('openDiarySpenBtn');
  if (diarySpenBtn) {
    diarySpenBtn.onclick = () => {
      if (window.openSpenNote) window.openSpenNote('diary', currentMetricsDate || selectedDate);
    };
  }
  const newsSpenBtn = document.getElementById('openNewsSpenBtn');
  if (newsSpenBtn) {
    newsSpenBtn.onclick = () => {
      if (window.openSpenNote) window.openSpenNote('news', currentMetricsDate || selectedDate);
    };
  }
  
  // 기간 탭 및 롱프레스 이벤트 바인딩
  document.querySelectorAll('.period-tab').forEach(tab => {
    let longPressTimer = null;
    let isLongPress = false;
    let startX = 0;
    let startY = 0;
    
    const startPress = (e) => {
      if (tab.dataset.period === 'week') {
        isLongPress = false;
        tab.classList.add('pressing');
        
        if (e.touches && e.touches[0]) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        } else if (e.clientX !== undefined) {
          startX = e.clientX;
          startY = e.clientY;
        }
        
        if (longPressTimer) clearTimeout(longPressTimer);
        
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          tab.classList.remove('pressing');
          if (navigator.vibrate) navigator.vibrate(50);
          openDateRangeModal();
        }, 500);
      }
    };
    
    const cancelPress = (e) => {
      // touchmove / mousemove 시 미세한 이동(10px 미만)은 취소하지 않음
      if (e.type === 'touchmove' && e.touches && e.touches[0]) {
        const diffX = Math.abs(e.touches[0].clientX - startX);
        const diffY = Math.abs(e.touches[0].clientY - startY);
        if (diffX < 10 && diffY < 10) return;
      } else if (e.type === 'mousemove' && e.clientX !== undefined && longPressTimer) {
        const diffX = Math.abs(e.clientX - startX);
        const diffY = Math.abs(e.clientY - startY);
        if (diffX < 10 && diffY < 10) return;
      }

      tab.classList.remove('pressing');
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };
    
    if (tab.dataset.period === 'week') {
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      tab.addEventListener('mousedown', startPress);
      tab.addEventListener('mouseup', cancelPress);
      tab.addEventListener('mouseleave', cancelPress);
      tab.addEventListener('mousemove', cancelPress);
      
      tab.addEventListener('touchstart', startPress, { passive: true });
      tab.addEventListener('touchend', cancelPress);
      tab.addEventListener('touchcancel', cancelPress);
      tab.addEventListener('touchmove', cancelPress, { passive: true });
    }
    
    tab.onclick = function(e) {
      if (this.dataset.period === 'week' && isLongPress) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => { isLongPress = false; }, 300);
        return false;
      }
      
      closeAllHeaders();
      document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('calendarBtn').classList.remove('active');
      setCalendarBtnDate(null);
      document.getElementById('selectedDateLabel').style.display = 'none';
      this.classList.add('active');
      
      currentPeriod = this.dataset.period;
      customRangeStart = null;
      customRangeEnd = null;
      
      const d = new Date();
      if(currentPeriod === 'yesterday') d.setDate(d.getDate()-1);
      else if(currentPeriod === 'tomorrow') d.setDate(d.getDate()+1);
      currentMetricsDate = formatDateString(d);
      
      if(currentPeriod === 'yesterday' || currentPeriod === 'tomorrow') {
        selectedDate = currentMetricsDate;
      } else {
        selectedDate = null;
      }
      
      document.getElementById('inputDueDate').value = currentMetricsDate;
      applyThemeByDate(currentMetricsDate);
      refreshAllData();
      loadGamification();
    };
  });

  // 기간 범위 지정 모달 관련 이벤트 바인딩
  const dateRangeModalWrapper = document.getElementById('dateRangeModalWrapper');
  const btnCloseRangeModal = document.getElementById('btnCloseRangeModal');
  const btnApplyRange = document.getElementById('btnApplyRange');
  const rangeStartDateInput = document.getElementById('rangeStartDate');
  const rangeEndDateInput = document.getElementById('rangeEndDate');
  
  function openDateRangeModal() {
    closeAllHeaders();
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    
    if (rangeStartDateInput && !rangeStartDateInput.value) rangeStartDateInput.value = formatDateString(weekAgo);
    if (rangeEndDateInput && !rangeEndDateInput.value) rangeEndDateInput.value = formatDateString(today);
    
    if (dateRangeModalWrapper) {
      dateRangeModalWrapper.style.display = 'block';
      dateRangeModalWrapper.classList.add('show');
      dateRangeModalWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  if (btnCloseRangeModal) {
    btnCloseRangeModal.onclick = () => {
      if (dateRangeModalWrapper) dateRangeModalWrapper.style.display = 'none';
    };
  }

  document.querySelectorAll('.range-quick-btn').forEach(btn => {
    btn.onclick = function() {
      const days = parseInt(this.dataset.days, 10);
      const today = new Date();
      const startDate = new Date(today.getTime() - (days - 1) * 86400000);
      if (rangeStartDateInput) rangeStartDateInput.value = formatDateString(startDate);
      if (rangeEndDateInput) rangeEndDateInput.value = formatDateString(today);
    };
  });

  if (btnApplyRange) {
    btnApplyRange.onclick = function() {
      const startVal = rangeStartDateInput ? rangeStartDateInput.value : '';
      const endVal = rangeEndDateInput ? rangeEndDateInput.value : '';
      
      if (!startVal || !endVal) {
        alert('시작일과 종료일을 모두 선택해주세요.');
        return;
      }
      
      if (startVal > endVal) {
        alert('시작일은 종료일보다 이전이어야 합니다.');
        return;
      }
      
      customRangeStart = startVal;
      customRangeEnd = endVal;
      currentPeriod = 'range';
      selectedDate = null;
      
      document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('calendarBtn').classList.remove('active');
      setCalendarBtnDate(null);
      const weekTab = document.querySelector('.period-tab[data-period="week"]');
      if (weekTab) weekTab.classList.add('active');
      
      const label = document.getElementById('selectedDateLabel');
      if (label) {
        label.innerText = `${startVal} ~ ${endVal}`;
        label.style.display = 'inline-block';
      }
      
      if (dateRangeModalWrapper) dateRangeModalWrapper.style.display = 'none';
      
      refreshAllData();
      loadGamification();
    };
  }
  
  document.getElementById('btnSaveMetrics').onclick = saveMetrics;

  // 일일 지표 접기 토글 바인딩
  const metricsHeader = document.getElementById('metricsHeader');
  const metricsBody = document.getElementById('metricsBody');
  const metricsToggleIcon = document.getElementById('metricsToggleIcon');
  
  metricsHeader.onclick = () => {
    const isCollapsed = metricsBody.classList.toggle('collapsed');
    metricsToggleIcon.innerText = isCollapsed ? '▲' : '▼';
    localStorage.setItem('metricsCollapsed', isCollapsed ? 'true' : 'false');
  };
  
  // 기존 상태 복원
  if (localStorage.getItem('metricsCollapsed') === 'true') {
    metricsBody.classList.add('collapsed');
    metricsToggleIcon.innerText = '▲';
  } else {
    metricsBody.classList.remove('collapsed');
    metricsToggleIcon.innerText = '▼';
  }

  document.getElementById('btnAdd').onclick = addTask;
  const descInput = document.getElementById('inputDescription');
  descInput.addEventListener('keydown', (e) => {
    if (shouldSubmitOnEnter(e)) {
      e.preventDefault();
      addTask();
    }
  });
  descInput.addEventListener('input', () => {
    descInput.style.height = 'auto';
    descInput.style.height = Math.min(descInput.scrollHeight, 160) + 'px';
  });

  // Goal & Execution List Listeners
  document.getElementById('goalBar').onclick = openGoalModal;
  document.getElementById('goalModalClose').onclick = closeGoalModal;
  document.getElementById('goalModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('goalModalOverlay')) closeGoalModal();
  };
  document.getElementById('goalExecutionAddBtn').onclick = addGoalExecution;
  document.getElementById('goalExecutionInput').onkeydown = (e) => {
    if (e.key === 'Enter') addGoalExecution();
  };
  document.getElementById('goalModalTitleInput').onblur = updateGoalText;

  // 📚 독서 기록 리스너 바인딩
  document.getElementById('bookBar').onclick = openBookShelfModal;
  document.getElementById('bookShelfModalClose').onclick = closeBookShelfModal;
  document.getElementById('bookShelfModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('bookShelfModalOverlay')) closeBookShelfModal();
  };
  document.getElementById('bookAddBtn').onclick = addBook;
  document.getElementById('bookInput').onkeydown = (e) => {
    if (e.key === 'Enter') addBook();
  };

  // 독서 노트 리스너 바인딩
  document.getElementById('bookNotesModalClose').onclick = closeBookNotesModal;
  document.getElementById('bookNotesConfirmBtn').onclick = closeBookNotesModal;
  const btnLexiconInNotes = document.getElementById('btnOpenLexiconInNotes');
  if (btnLexiconInNotes) {
    btnLexiconInNotes.onclick = () => {
      if (window.lexiconUI && typeof window.lexiconUI.open === 'function') {
        window.lexiconUI.open();
      }
    };
  }
  document.getElementById('bookNotesModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('bookNotesModalOverlay')) closeBookNotesModal();
  };

  // 책 제목 실시간 수정 리스너 추가
  const titleInput = document.getElementById('bookNotesTitleInput');
  titleInput.onblur = saveBookTitleRealtime;
  titleInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInput.blur();
    }
  };

  // 모바일 터치 스크롤 시 전체 화면 들썩임(Scroll Chaining) 방지 리스너
  const preventScrollLeak = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight > el.clientHeight) {
      e.stopPropagation();
    }
  };
  ['bookNotesTextarea', 'bookList', 'goalExecutionList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('touchmove', preventScrollLeak, { passive: true });
    }
  });

  // 독서 상태 칩 변경 리스너
  document.querySelectorAll('.status-chip').forEach(chip => {
    chip.onclick = function() {
      if (!selectedBook) return;
      const status = this.dataset.status;
      changeBookStatus(selectedBook.book_id, status);
    };
  });

  // 나의 서재 탭 필터 리스너
  document.querySelectorAll('.book-tab').forEach(tab => {
    tab.onclick = function() {
      document.querySelectorAll('.book-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentBookFilter = this.dataset.status;
      renderBookList();
    };
  });

  // 독서 기록 보관함 실시간 검색 리스너
  const bookSearchInput = document.getElementById('bookSearchInput');
  const bookSearchClear = document.getElementById('bookSearchClear');
  if (bookSearchInput) {
    bookSearchInput.oninput = function() {
      currentBookSearch = this.value.trim();
      if (bookSearchClear) {
        bookSearchClear.classList.toggle('visible', currentBookSearch.length > 0);
      }
      renderBookList();
    };
  }
  if (bookSearchClear) {
    bookSearchClear.onclick = function() {
      if (bookSearchInput) bookSearchInput.value = '';
      currentBookSearch = '';
      this.classList.remove('visible');
      renderBookList();
    };
  }

  // 독서 메모 저장 리스너 (실시간 포커스 아웃 및 디바운싱 저장)
  const bookNotesArea = document.getElementById('bookNotesTextarea');
  let bookNotesSaveTimeout = null;
  bookNotesArea.oninput = function() {
    if (!selectedBook) return;
    updateBookSaveIndicator('saving');

    clearTimeout(bookNotesSaveTimeout);
    bookNotesSaveTimeout = setTimeout(() => {
      saveBookNotesRealtime();
    }, 1000);
  };
  bookNotesArea.onblur = function() {
    saveBookNotesRealtime();
  };

  document.getElementById('bookNotesDeleteBtn').onclick = deleteBook;

  // 📋 업무 매뉴얼 리스너 바인딩
  document.getElementById('manualBar').onclick = openManualShelfModal;
  document.getElementById('manualShelfModalClose').onclick = closeManualShelfModal;
  document.getElementById('manualShelfModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('manualShelfModalOverlay')) closeManualShelfModal();
  };
  document.getElementById('manualAddBtn').onclick = addManual;
  document.getElementById('manualInput').onkeydown = (e) => {
    if (e.key === 'Enter') addManual();
  };

  // 업무 매뉴얼 노트 리스너 바인딩
  document.getElementById('manualNotesModalClose').onclick = closeManualNotesModal;
  document.getElementById('manualNotesConfirmBtn').onclick = closeManualNotesModal;
  document.getElementById('manualNotesModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('manualNotesModalOverlay')) closeManualNotesModal();
  };

  // 매뉴얼 제목 실시간 수정 리스너 추가
  const manualTitleInput = document.getElementById('manualNotesTitleInput');
  manualTitleInput.onblur = saveManualTitleRealtime;
  manualTitleInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualTitleInput.blur();
    }
  };

  // 모바일 터치 스크롤 시 전체 화면 들썩임(Scroll Chaining) 방지 리스너 (매뉴얼용)
  ['manualNotesTextarea', 'manualList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('touchmove', preventScrollLeak, { passive: true });
    }
  });

  // 매뉴얼 상태 칩 변경 리스너
  document.querySelectorAll('.manual-status-chip').forEach(chip => {
    chip.onclick = function() {
      if (!selectedManual) return;
      const status = this.dataset.status;
      changeManualStatus(selectedManual.manual_id, status);
    };
  });

  // 업무 매뉴얼 탭 필터 리스너
  document.querySelectorAll('.manual-tab').forEach(tab => {
    tab.onclick = function() {
      document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentManualFilter = this.dataset.status;
      renderManualList();
    };
  });

  // 업무 매뉴얼 보관함 실시간 검색 리스너
  const manualSearchInput = document.getElementById('manualSearchInput');
  const manualSearchClear = document.getElementById('manualSearchClear');
  if (manualSearchInput) {
    manualSearchInput.oninput = function() {
      currentManualSearch = this.value.trim();
      if (manualSearchClear) {
        manualSearchClear.classList.toggle('visible', currentManualSearch.length > 0);
      }
      renderManualList();
    };
  }
  if (manualSearchClear) {
    manualSearchClear.onclick = function() {
      if (manualSearchInput) manualSearchInput.value = '';
      currentManualSearch = '';
      this.classList.remove('visible');
      renderManualList();
    };
  }

  // 매뉴얼 내용 저장 리스너 (실시간 포커스 아웃 및 디바운싱 저장)
  const manualNotesArea = document.getElementById('manualNotesTextarea');
  let manualNotesSaveTimeout = null;
  manualNotesArea.oninput = function() {
    if (!selectedManual) return;
    const statusEl = document.getElementById('manualNotesSaveStatus');
    statusEl.innerText = '입력 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';

    clearTimeout(manualNotesSaveTimeout);
    manualNotesSaveTimeout = setTimeout(() => {
      saveManualNotesRealtime();
    }, 1000);
  };
  manualNotesArea.onblur = function() {
    saveManualNotesRealtime();
  };

  document.getElementById('manualNotesDeleteBtn').onclick = deleteManual;

  // === 회사 비밀번호 금고(비밀 메모장) 기능 바인딩 ===
  setupVaultEvents();
  
  // === GROW QUEST 롱프레스(테트리스) 및 클릭(보안 인증) 통합 이벤트 바인딩 ===
  const headerTitle = document.getElementById('todoListHeaderTitle');
  let longPressTimer = null;
  let isLongPressTriggered = false;
  let pressStartTime = 0;
  const LONG_PRESS_DURATION = 1000; // 1.0초

  function startPress(e) {
    // 터치 스크롤이나 시스템의 롱프레스 기본 동작 방해 차단
    if (e.type === 'touchstart' && e.cancelable) {
      e.preventDefault();
    }
    
    isLongPressTriggered = false;
    pressStartTime = Date.now();
    headerTitle.classList.add('long-press-active');
    
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    
    longPressTimer = setTimeout(() => {
      isLongPressTriggered = true;
      headerTitle.classList.remove('long-press-active');
      if (navigator.vibrate) {
        navigator.vibrate([80]);
      }
      if (window.featureMenu && typeof window.featureMenu.open === 'function') {
        window.featureMenu.open();
      }
    }, LONG_PRESS_DURATION);
  }

  function endPress(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    headerTitle.classList.remove('long-press-active');

    // 이미 롱프레스가 트리거되었다면 클릭 동작 차단
    if (isLongPressTriggered) {
      isLongPressTriggered = false;
      if (e.cancelable) e.preventDefault();
      return;
    }

    // 누른 시간을 측정하여 숏 클릭으로 판단되는 경우 보안 금고 모달 실행
    const duration = Date.now() - pressStartTime;
    // 아주 짧은 터치 노이즈 필터링 (10ms 이상) 및 마우스/터치 정상 해제 시에만 작동
    if (duration > 10 && (e.type === 'mouseup' || e.type === 'touchend')) {
      openVaultAuthModal();
    }

    if (e.cancelable) {
      e.preventDefault();
    }
  }

  function cancelPress(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    headerTitle.classList.remove('long-press-active');
  }

  // 데스크톱 마우스 이벤트
  headerTitle.addEventListener('mousedown', startPress);
  headerTitle.addEventListener('mouseup', endPress);
  headerTitle.addEventListener('mouseleave', cancelPress);

  // 모바일/태블릿 터치 이벤트 (passive: false로 줌으로써 preventDefault 차단 작동)
  headerTitle.addEventListener('touchstart', startPress, { passive: false });
  headerTitle.addEventListener('touchend', endPress, { passive: false });
  headerTitle.addEventListener('touchcancel', cancelPress);

  // 브라우저 기본 컨텍스트 메뉴, 텍스트 선택, 드래그 방지하여 롱프레스 감지 방해 예방
  headerTitle.addEventListener('contextmenu', e => e.preventDefault());
  headerTitle.addEventListener('selectstart', e => e.preventDefault());
  headerTitle.addEventListener('dragstart', e => e.preventDefault());

  // === 메모, 일기, 신문 실시간 자동 저장 바인딩 ===
  setupAutoSaveEvents();

  // === 오늘의 미션 드롭다운 토글 기능 바인딩 ===
  const levelHudInfo = document.getElementById('levelHudInfo');
  const questSection = document.getElementById('questSection');
  const levelToggleArrow = document.getElementById('levelToggleArrow');
  if (levelHudInfo && questSection) {
    levelHudInfo.onclick = () => {
      const isCollapsed = questSection.classList.toggle('collapsed');
      if (levelToggleArrow) {
        levelToggleArrow.classList.toggle('rotated', !isCollapsed);
      }
      localStorage.setItem('questSectionCollapsed', isCollapsed ? 'true' : 'false');
    };
    
    // 초기 접힘 상태 복원 (기본값은 접혀 있는 true)
    const storedCollapsed = localStorage.getItem('questSectionCollapsed');
    if (storedCollapsed === 'false') {
      questSection.classList.remove('collapsed');
      if (levelToggleArrow) levelToggleArrow.classList.add('rotated');
    } else {
      questSection.classList.add('collapsed');
      if (levelToggleArrow) levelToggleArrow.classList.remove('rotated');
    }
  }

  // === 푸시 알림 예약 모달 이벤트 바인딩 및 세팅 ===
  setupPushModalEvents();
  setupPushNotification();
  startLocalNotificationScheduler();

  // === 비밀 편지 모달 이벤트 바인딩 ===
  const secretCloseBtn = document.getElementById('secretLetterModalClose');
  if (secretCloseBtn) {
    secretCloseBtn.onclick = closeSecretLetterModal;
  }
  const secretSaveBtn = document.getElementById('saveSecretLetterBtn');
  if (secretSaveBtn) {
    secretSaveBtn.onclick = saveSecretLetter;
  }
  const secretOverlay = document.getElementById('secretLetterModalOverlay');
  if (secretOverlay) {
    secretOverlay.onclick = (e) => {
      if(e.target === secretOverlay) closeSecretLetterModal();
    };
  }

  // === SKILL.md 추출 모달 이벤트 바인딩 ===
  setupSkillExportEvents();
});


// === 비밀 편지 모달 제어 함수 ===
async function openSecretLetterModal() {
  const modal = document.getElementById('secretLetterModalOverlay');
  const label = document.getElementById('secretLetterDateLabel');
  const input = document.getElementById('secretLetterInput');
  const status = document.getElementById('secretLetterSaveStatus');

  if (!modal || !label || !input) return;

  label.textContent = `${formatDateKorean(currentMetricsDate)}의 비밀 편지`;
  input.value = '';
  input.placeholder = '로딩 중...';
  if (status) status.textContent = '';
  
  modal.classList.remove('hidden');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // 내용 불러오기
  const content = await api.getSecretLetter(currentMetricsDate) || '';
  input.value = content;
  input.placeholder = '오늘 하루를 마무리하며 나에게, 혹은 누군가에게 전하는 비밀 편지를 기록해보세요...';
}

function closeSecretLetterModal() {
  const modal = document.getElementById('secretLetterModalOverlay');
  if (modal) {
    modal.classList.remove('show');
    modal.classList.add('hidden');
  }
  document.body.style.overflow = '';
}

async function saveSecretLetter() {
  const input = document.getElementById('secretLetterInput');
  const status = document.getElementById('secretLetterSaveStatus');

  if (!input) return;

  const content = input.value;
  if (status) status.textContent = '저장 중...';
  
  const res = await api.saveSecretLetter(currentMetricsDate, content);
  if (res.success) {
    if (status) status.textContent = '저장 완료!';
    // 달력 데이터 세트 갱신
    await fetchAllDates();
    setTimeout(() => {
      closeSecretLetterModal();
    }, 600);
  } else {
    if (status) status.textContent = '저장 실패';
  }
}

async function loadGoal() {
  currentGoal = await api.getGoal();
  if (currentGoal) {
    document.getElementById('goalText').innerText = currentGoal.text;
    document.getElementById('goalModalTitleInput').value = currentGoal.text;
  }
}

function checkAndUnlockBodyScroll() {
  const activeModals = document.querySelectorAll('.goal-modal-overlay.show');
  if (activeModals.length === 0) {
    document.body.style.overflow = '';
  }
}

async function openGoalModal() {
  if (!currentGoal) return;
  document.getElementById('goalModalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderGoalExecutions();
}

function closeGoalModal() {
  document.getElementById('goalModalOverlay').classList.remove('show');
  checkAndUnlockBodyScroll();
}

async function updateGoalText() {
  const newText = document.getElementById('goalModalTitleInput').value.trim();
  if (newText && newText !== currentGoal.text) {
    const res = await api.updateGoal(currentGoal.id, newText);
    if (res.success) {
      currentGoal.text = newText;
      document.getElementById('goalText').innerText = newText;
    }
  }
}

async function renderGoalExecutions() {
  const list = document.getElementById('goalExecutionList');
  list.innerHTML = '<div class="loading" style="padding:20px;"><div class="spinner" style="width:24px; height:24px;"></div></div>';
  
  const executions = await api.getGoalExecutions(currentGoal.id);
  
  if (executions.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">실행 항목이 없습니다.</div>';
    return;
  }

  list.innerHTML = executions.map(ex => {
    const checked = ex.is_completed ? 'checked' : '';
    const compClass = ex.is_completed ? 'completed' : '';
    return `
      <div class="goal-execution-item ${compClass}">
        <div class="exec-checkbox ${checked}" onclick="toggleGoalExecution('${ex.id}', ${!ex.is_completed})"></div>
        <div class="exec-text ${compClass}">${escapeHtml(ex.text)}</div>
        <button class="exec-delete" onclick="deleteGoalExecution('${ex.id}')">×</button>
      </div>
    `;
  }).join('');
}

async function addGoalExecution() {
  const input = document.getElementById('goalExecutionInput');
  const text = input.value.trim();
  if (!text) return;

  const res = await api.addGoalExecution(currentGoal.id, text);
  if (res.success) {
    input.value = '';
    renderGoalExecutions();
  }
}

async function toggleGoalExecution(id, isCompleted) {
  const res = await api.toggleGoalExecution(id, isCompleted);
  if (res.success) {
    renderGoalExecutions();
  }
}

async function deleteGoalExecution(id) {
  if (confirm('삭제하시겠습니까?')) {
    const res = await api.deleteGoalExecution(id);
    if (res.success) {
      renderGoalExecutions();
    }
  }
}

async function fetchAllDates() {
  console.log('fetchAllDates called');
  const [memoDates, diaryDates, newsDates, secretLetterDates] = await Promise.all([
    api.getAllMemoDates(),
    api.getAllDiaryDates(),
    api.getAllNewsDates(),
    api.getAllSecretLetterDates()
  ]);
  memoDatesSet = new Set(memoDates);
  diaryDatesSet = new Set(diaryDates);
  newsDatesSet = new Set(newsDates);
  secretLetterDatesSet = new Set(secretLetterDates);
  renderCalendar();
}

function renderCalendar() {
  const year = calDisplayDate.getFullYear();
  const month = calDisplayDate.getMonth();
  document.getElementById('calTitle').innerText = `${year}년 ${month + 1}월`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  
  const grid = document.getElementById('calDaysGrid');
  grid.innerHTML = '';
  
  for(let i=0; i<startDayOfWeek; i++) {
    const div = document.createElement('div');
    div.className = 'cal-day empty';
    grid.appendChild(div);
  }
  
  const todayStr = getTodayString();
  for(let d=1; d<=daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const div = document.createElement('div');
    div.className = 'cal-day';
    div.innerText = d;
    
    const hasMemo = memoDatesSet.has(dateStr);
    const hasDiary = diaryDatesSet.has(dateStr);
    const hasNews = newsDatesSet.has(dateStr);
    const hasSecret = secretLetterDatesSet.has(dateStr);
    
    if(hasMemo || hasDiary || hasNews || hasSecret) {
      const dotsRow = document.createElement('div');
      dotsRow.className = 'cal-dots-row';
      if(hasMemo) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot';
        dotsRow.appendChild(dot);
      }
      if(hasDiary) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot diary';
        dotsRow.appendChild(dot);
      }
      if(hasNews) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot news';
        dotsRow.appendChild(dot);
      }
      if(hasSecret) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot secret-letter';
        dotsRow.appendChild(dot);
      }
      div.appendChild(dotsRow);
    }
    
    if(hasSecret) div.classList.add('has-secret');
    if(dateStr === todayStr) div.classList.add('today');
    if(dateStr === currentMetricsDate) div.classList.add('selected');
    
    div.onclick = () => {
      selectDateFromCalendar(dateStr);
    };
    
    grid.appendChild(div);
  }
}

function selectDateFromCalendar(dateStr) {
  selectedDate = dateStr;
  currentPeriod = 'custom';
  currentMetricsDate = dateStr;
  
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('calendarBtn').classList.add('active');
  
  document.getElementById('selectedDateLabel').textContent = formatDateKorean(dateStr);
  document.getElementById('selectedDateLabel').style.display = 'none';
  setCalendarBtnDate(dateStr);
  
  applyThemeByDate(dateStr);
  updateUIForCustomDate();
  refreshAllData();
  loadGamification();
  
  document.getElementById('customCalendarWrapper').classList.remove('show');
}

function toggleHeader(type) {
  const map = { 'search': 'searchWrapper', 'memo': 'memoWrapper', 'diary': 'diaryWrapper', 'news': 'newsWrapper', 'calendar': 'customCalendarWrapper' };
  const btnMap = { 'search': 'searchToggleBtn', 'memo': 'memoToggleBtn', 'diary': 'diaryToggleBtn', 'news': 'newsToggleBtn', 'calendar': 'calendarBtn' };
  
  for(let k in map) {
    if(k !== type) {
      document.getElementById(map[k]).classList.remove('show');
      if(k !== 'calendar') document.getElementById(btnMap[k]).classList.remove('active');
    }
  }
  
  const el = document.getElementById(map[type]);
  const btn = document.getElementById(btnMap[type]);
  el.classList.toggle('show');
  if(type !== 'calendar') btn.classList.toggle('active');
  
  if(el.classList.contains('show')) {
    if(type === 'search') document.getElementById('searchInput').focus();
    if(type === 'memo') document.getElementById('memoInput').focus();
    if(type === 'diary') document.getElementById('diaryInput').focus();
    if(type === 'news') document.getElementById('newsInput').focus();
  }

  updateAddFormVisibility();
}

function closeAllHeaders() {
  ['searchWrapper','memoWrapper','diaryWrapper','newsWrapper','customCalendarWrapper'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  const rangeModal = document.getElementById('dateRangeModalWrapper');
  if (rangeModal) {
    rangeModal.style.display = 'none';
    rangeModal.classList.remove('show');
  }
  ['searchToggleBtn','memoToggleBtn','diaryToggleBtn','newsToggleBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  updateAddFormVisibility();
}

function updateAddFormVisibility() {
  const memoOpen = document.getElementById('memoWrapper').classList.contains('show');
  const diaryOpen = document.getElementById('diaryWrapper').classList.contains('show');
  const newsOpen = document.getElementById('newsWrapper').classList.contains('show');
  
  const addForm = document.querySelector('.add-form');
  if (addForm) {
    if (memoOpen || diaryOpen || newsOpen) {
      addForm.classList.add('hide');
    } else {
      addForm.classList.remove('hide');
    }
  }
}

function updateUIForCustomDate() {
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('calendarBtn').classList.add('active');
  const label = document.getElementById('selectedDateLabel');
  label.textContent = formatDateKorean(currentMetricsDate);
  label.style.display = 'none';
  setCalendarBtnDate(currentMetricsDate);
}

function handleSwipeGesture() {
  // 모달 오버레이들이 열려 있는 경우 날짜 스와이프 차단
  const spenOverlay = document.getElementById('spen-modal-overlay');
  const isSpenOpen = spenOverlay && (spenOverlay.style.display === 'flex' || spenOverlay.style.display === 'block');
  
  const isMathOpen = document.getElementById('mathModalOverlay') && !document.getElementById('mathModalOverlay').classList.contains('hidden');
  const isTetrisOpen = document.getElementById('tetrisModalOverlay') && !document.getElementById('tetrisModalOverlay').classList.contains('hidden');
  const isNapOpen = document.getElementById('napModalOverlay') && !document.getElementById('napModalOverlay').classList.contains('hidden');
  const isFeatureSelectionOpen = document.getElementById('featureSelectionModal') && !document.getElementById('featureSelectionModal').classList.contains('hidden');
  const isSkillExportOpen = document.getElementById('skillExportModalOverlay') && !document.getElementById('skillExportModalOverlay').classList.contains('hidden');
  const isSecretOpen = document.getElementById('secretLetterModalOverlay') && !document.getElementById('secretLetterModalOverlay').classList.contains('hidden');
  // 서재·매뉴얼 모달은 'show', 사전 모달은 'active' 클래스로 열림 상태를 표시함
  const isBookOpen = document.getElementById('bookShelfModalOverlay') && document.getElementById('bookShelfModalOverlay').classList.contains('show');
  const isManualOpen = document.getElementById('manualShelfModalOverlay') && document.getElementById('manualShelfModalOverlay').classList.contains('show');
  const isReportOpen = (document.getElementById('reportShelfModalOverlay') && document.getElementById('reportShelfModalOverlay').classList.contains('show')) ||
                       (document.getElementById('reportEditorModalOverlay') && document.getElementById('reportEditorModalOverlay').classList.contains('show'));
  const isLexiconOpen = document.getElementById('lexiconModalOverlay') && document.getElementById('lexiconModalOverlay').classList.contains('active');
  
  if (isSpenOpen || isMathOpen || isTetrisOpen || isNapOpen || isFeatureSelectionOpen || isSkillExportOpen || isSecretOpen || isBookOpen || isManualOpen || isReportOpen || isLexiconOpen) return;

  if(document.getElementById('searchWrapper').classList.contains('show') || 
     document.getElementById('memoWrapper').classList.contains('show') ||
     document.getElementById('diaryWrapper').classList.contains('show') ||
     document.getElementById('newsWrapper').classList.contains('show') ||
     document.getElementById('customCalendarWrapper').classList.contains('show')) return;
  
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  const duration = Date.now() - touchStartTime;
  
  // 민감도 완화: 화면 폭의 35%(최소 120px) 이상, 거의 수평(가로가 세로의 2.5배 이상), 0.8초 이내의 스와이프만 인정
  const threshold = Math.max(120, window.innerWidth * 0.35);
  if (duration > 800) return;
  if (Math.abs(diffX) < threshold) return;
  if (Math.abs(diffX) < Math.abs(diffY) * 2.5) return;
  
  if(diffX > 0) changeDate(-1);
  else changeDate(1);
}

function changeDate(offset) {
  const d = new Date(currentMetricsDate);
  d.setDate(d.getDate() + offset);
  const newDateStr = formatDateString(d);
  selectDateFromCalendar(newDateStr);
}

// 고정된 11개 경로명
const FIXED_DB_CHANNELS = [
  '요즘웨딩어플/앱',
  '네이버카페',
  '인스타그램_웨딩홀',
  '홈페이지_웨딩홀',
  '홈페이지_드레스랜드',
  '홈페이지_웨딩페스타',
  '홈페이지_상담신청',
  '친구추천/업체추천',
  '채널톡',
  '웹앱_웨딩페스타',
  '매니저SNS'
];

// DB 경로 목록 렌더링 (11개 경로 상시 세팅)
function renderDbChannels(savedChannels = []) {
  const container = document.getElementById('dbChannelsList');
  if (!container) return;
  container.innerHTML = '';
  
  // 저장된 채널 목록을 맵으로 변환 (경로명 기준)
  const savedMap = {};
  if (Array.isArray(savedChannels)) {
    savedChannels.forEach(c => {
      if (c && c.channel) savedMap[c.channel] = c;
    });
  }

  FIXED_DB_CHANNELS.forEach(channelName => {
    const data = savedMap[channelName] || {};
    const appliedVal = data.applied !== null && data.applied !== undefined ? data.applied : '';
    const actualVal = data.actual !== null && data.actual !== undefined ? data.actual : '';
    const noteVal = data.note || '';

    const row = document.createElement('div');
    row.className = 'db-channel-row';
    row.dataset.channel = channelName;
    row.innerHTML = `
      <div class="ch-name-label" title="${channelName}">${channelName}</div>
      <input type="number" class="metric-input ch-applied" placeholder="0" value="${appliedVal}">
      <input type="number" class="metric-input ch-actual" placeholder="0" value="${actualVal}">
      <input type="text" class="metric-input ch-note" placeholder="비고 입력" value="${noteVal}">
    `;
    container.appendChild(row);
  });
}

function getDbChannelsFromUI() {
  const container = document.getElementById('dbChannelsList');
  if (!container) return [];
  const rows = container.querySelectorAll('.db-channel-row');
  const result = [];
  rows.forEach(r => {
    const channel = r.dataset.channel || r.querySelector('.ch-name-label')?.innerText?.trim() || '';
    const applied = r.querySelector('.ch-applied').value;
    const actual = r.querySelector('.ch-actual').value;
    const note = r.querySelector('.ch-note').value.trim();
    result.push({
      channel,
      applied: applied !== '' ? parseInt(applied) : null,
      actual: actual !== '' ? parseInt(actual) : null,
      note
    });
  });
  return result;
}

// 플래너 TOP/BOTTOM 렌더링 및 UI 수집
function renderPlannerList(containerId, list, defaultRanks) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = container.querySelectorAll('.planner-row');
  rows.forEach((row, idx) => {
    const item = (list && list[idx]) || {};
    const rankEl = row.querySelector('.planner-rank');
    if (rankEl && defaultRanks && defaultRanks[idx]) {
      rankEl.innerText = item.rank || defaultRanks[idx];
    }
    const nameInput = row.querySelector('.planner-name');
    const countInput = row.querySelector('.planner-count');
    const noteInput = row.querySelector('.planner-note');
    if (nameInput) nameInput.value = item.name || '';
    if (countInput) countInput.value = item.count || '';
    if (noteInput) noteInput.value = item.note || '';
  });
}

function getPlannerListFromUI(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const rows = container.querySelectorAll('.planner-row');
  const result = [];
  rows.forEach(row => {
    const rank = row.querySelector('.planner-rank')?.innerText?.trim() || '';
    const name = row.querySelector('.planner-name')?.value?.trim() || '';
    const count = row.querySelector('.planner-count')?.value?.trim() || '';
    const note = row.querySelector('.planner-note')?.value?.trim() || '';
    if (name || count || note) {
      result.push({ rank, name, count, note });
    }
  });
  return result;
}

// 페스타드레스 주말 발주 폼 헬퍼 함수
function updateFestaTotals() {
  const calcRow = (satId, sunId, totalId) => {
    const satEl = document.getElementById(satId);
    const sunEl = document.getElementById(sunId);
    const totalEl = document.getElementById(totalId);
    if (!satEl || !sunEl || !totalEl) return;
    const satVal = parseInt(satEl.value, 10);
    const sunVal = parseInt(sunEl.value, 10);
    if (isNaN(satVal) && isNaN(sunVal)) {
      totalEl.value = '';
    } else {
      totalEl.value = (isNaN(satVal) ? 0 : satVal) + (isNaN(sunVal) ? 0 : sunVal);
    }
  };

  calcRow('festaC1WaitSat', 'festaC1WaitSun', 'festaC1WaitTotal');
  calcRow('saturdayFestaDressOrders1', 'sundayFestaDressOrders1', 'festaC1SendTotal');
  calcRow('festaC1ApprSat', 'festaC1ApprSun', 'festaC1ApprTotal');
  calcRow('festaC1CancelSat', 'festaC1CancelSun', 'festaC1CancelTotal');

  calcRow('festaC2WaitSat', 'festaC2WaitSun', 'festaC2WaitTotal');
  calcRow('saturdayFestaDressOrders2', 'sundayFestaDressOrders2', 'festaC2SendTotal');
  calcRow('festaC2ApprSat', 'festaC2ApprSun', 'festaC2ApprTotal');
  calcRow('festaC2CancelSat', 'festaC2CancelSun', 'festaC2CancelTotal');

  const c1Name = document.getElementById('festaCompany1Name')?.value || '업체 1';
  const c2Name = document.getElementById('festaCompany2Name')?.value || '업체 2';
  const l1 = document.getElementById('compareC1Label');
  const l2 = document.getElementById('compareC2Label');
  if (l1) l1.textContent = c1Name;
  if (l2) l2.textContent = c2Name;
}

function loadFestaData(m) {
  const fd = m.festa_orders_data || {};
  const c1 = fd.company1 || {};
  const c2 = fd.company2 || {};
  const cmp = fd.compare || {};

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = (val !== null && val !== undefined) ? val : '';
  };

  setVal('festaCompany1Name', c1.name || m.festa_company_1_name || '마틴드세븐');
  setVal('festaC1WaitSat', c1.wait?.sat);
  setVal('festaC1WaitSun', c1.wait?.sun);
  setVal('festaC1WaitTotal', c1.wait?.total);
  setVal('festaC1WaitNote', c1.wait?.note);

  setVal('saturdayFestaDressOrders1', c1.send?.sat !== undefined ? c1.send.sat : m.festa_company_1_sat_orders);
  setVal('sundayFestaDressOrders1', c1.send?.sun !== undefined ? c1.send.sun : m.festa_company_1_sun_orders);
  setVal('festaC1SendTotal', c1.send?.total);
  setVal('festaC1SendNote', c1.send?.note);

  setVal('festaC1ApprSat', c1.appr?.sat);
  setVal('festaC1ApprSun', c1.appr?.sun);
  setVal('festaC1ApprTotal', c1.appr?.total);
  setVal('festaC1ApprNote', c1.appr?.note);

  setVal('festaC1CancelSat', c1.cancel?.sat);
  setVal('festaC1CancelSun', c1.cancel?.sun);
  setVal('festaC1CancelTotal', c1.cancel?.total);
  setVal('festaC1CancelNote', c1.cancel?.note);

  setVal('festaCompany2Name', c2.name || m.festa_company_2_name || '펠리스노비아');
  setVal('festaC2WaitSat', c2.wait?.sat);
  setVal('festaC2WaitSun', c2.wait?.sun);
  setVal('festaC2WaitTotal', c2.wait?.total);
  setVal('festaC2WaitNote', c2.wait?.note);

  setVal('saturdayFestaDressOrders2', c2.send?.sat !== undefined ? c2.send.sat : m.festa_company_2_sat_orders);
  setVal('sundayFestaDressOrders2', c2.send?.sun !== undefined ? c2.send.sun : m.festa_company_2_sun_orders);
  setVal('festaC2SendTotal', c2.send?.total);
  setVal('festaC2SendNote', c2.send?.note);

  setVal('festaC2ApprSat', c2.appr?.sat);
  setVal('festaC2ApprSun', c2.appr?.sun);
  setVal('festaC2ApprTotal', c2.appr?.total);
  setVal('festaC2ApprNote', c2.appr?.note);

  setVal('festaC2CancelSat', c2.cancel?.sat);
  setVal('festaC2CancelSun', c2.cancel?.sun);
  setVal('festaC2CancelTotal', c2.cancel?.total);
  setVal('festaC2CancelNote', c2.cancel?.note);

  // 비교 지표
  setVal('festaCompareConsult1', cmp.consult?.c1);
  setVal('festaCompareConsult2', cmp.consult?.c2);
  setVal('festaCompareNewOrders1', cmp.new_orders?.c1);
  setVal('festaCompareNewOrders2', cmp.new_orders?.c2);
  setVal('festaCompareSent1', cmp.sent_rate?.c1);
  setVal('festaCompareSent2', cmp.sent_rate?.c2);
  setVal('festaComparePending1', cmp.pending_appr?.c1);
  setVal('festaComparePending2', cmp.pending_appr?.c2);
  setVal('festaCompareWait1', cmp.accum_wait?.c1);
  setVal('festaCompareWait2', cmp.accum_wait?.c2);

  updateFestaTotals();
}

function getFestaDataToSave() {
  const getNum = (id) => {
    const v = document.getElementById(id)?.value?.trim();
    return v !== '' && v !== undefined && !isNaN(parseInt(v, 10)) ? parseInt(v, 10) : null;
  };
  const getStr = (id) => document.getElementById(id)?.value?.trim() || '';

  return {
    company1: {
      name: getStr('festaCompany1Name'),
      wait: { sat: getNum('festaC1WaitSat'), sun: getNum('festaC1WaitSun'), total: getNum('festaC1WaitTotal'), note: getStr('festaC1WaitNote') },
      send: { sat: getNum('saturdayFestaDressOrders1'), sun: getNum('sundayFestaDressOrders1'), total: getNum('festaC1SendTotal'), note: getStr('festaC1SendNote') },
      appr: { sat: getNum('festaC1ApprSat'), sun: getNum('festaC1ApprSun'), total: getNum('festaC1ApprTotal'), note: getStr('festaC1ApprNote') },
      cancel: { sat: getNum('festaC1CancelSat'), sun: getNum('festaC1CancelSun'), total: getNum('festaC1CancelTotal'), note: getStr('festaC1CancelNote') }
    },
    company2: {
      name: getStr('festaCompany2Name'),
      wait: { sat: getNum('festaC2WaitSat'), sun: getNum('festaC2WaitSun'), total: getNum('festaC2WaitTotal'), note: getStr('festaC2WaitNote') },
      send: { sat: getNum('saturdayFestaDressOrders2'), sun: getNum('sundayFestaDressOrders2'), total: getNum('festaC2SendTotal'), note: getStr('festaC2SendNote') },
      appr: { sat: getNum('festaC2ApprSat'), sun: getNum('festaC2ApprSun'), total: getNum('festaC2ApprTotal'), note: getStr('festaC2ApprNote') },
      cancel: { sat: getNum('festaC2CancelSat'), sun: getNum('festaC2CancelSun'), total: getNum('festaC2CancelTotal'), note: getStr('festaC2CancelNote') }
    },
    compare: {
      consult: { c1: getStr('festaCompareConsult1'), c2: getStr('festaCompareConsult2') },
      new_orders: { c1: getStr('festaCompareNewOrders1'), c2: getStr('festaCompareNewOrders2') },
      sent_rate: { c1: getStr('festaCompareSent1'), c2: getStr('festaCompareSent2') },
      pending_appr: { c1: getStr('festaComparePending1'), c2: getStr('festaComparePending2') },
      accum_wait: { c1: getStr('festaCompareWait1'), c2: getStr('festaCompareWait2') }
    }
  };
}

function fillFestaSampleData() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('festaCompany1Name', '마틴드세븐');
  setVal('festaC1WaitSat', 21);
  setVal('festaC1WaitSun', 13);
  setVal('festaC1WaitTotal', 34);
  setVal('festaC1WaitNote', '전부 미발송');

  setVal('saturdayFestaDressOrders1', 6);
  setVal('sundayFestaDressOrders1', 6);
  setVal('festaC1SendTotal', 12);
  setVal('festaC1SendNote', '모두 승인 대기');

  setVal('festaC1ApprSat', 0);
  setVal('festaC1ApprSun', 0);
  setVal('festaC1ApprTotal', 0);
  setVal('festaC1ApprNote', '');

  setVal('festaC1CancelSat', 53);
  setVal('festaC1CancelSun', 32);
  setVal('festaC1CancelTotal', 85);
  setVal('festaC1CancelNote', '계약 수정 때 재생성되며 생긴 건');

  setVal('festaCompany2Name', '펠리스노비아');
  setVal('festaC2WaitSat', 12);
  setVal('festaC2WaitSun', 8);
  setVal('festaC2WaitTotal', 20);
  setVal('festaC2WaitNote', '전부 미발송');

  setVal('saturdayFestaDressOrders2', 0);
  setVal('sundayFestaDressOrders2', 1);
  setVal('festaC2SendTotal', 1);
  setVal('festaC2SendNote', 'SC1000049602, 10/18 19:08 발송 (본식 1회, 시그니처라벨 무료 업그레이드 88만원 상당)');

  setVal('festaC2ApprSat', 0);
  setVal('festaC2ApprSun', 0);
  setVal('festaC2ApprTotal', 0);
  setVal('festaC2ApprNote', '');

  setVal('festaC2CancelSat', 28);
  setVal('festaC2CancelSun', 11);
  setVal('festaC2CancelTotal', 39);
  setVal('festaC2CancelNote', '계약 18건에서 발생');

  setVal('festaCompareConsult1', '95건');
  setVal('festaCompareConsult2', '71건');
  setVal('festaCompareNewOrders1', '46건');
  setVal('festaCompareNewOrders2', '21건');
  setVal('festaCompareSent1', '12건 (26%)');
  setVal('festaCompareSent2', '1건 (5%)');
  setVal('festaComparePending1', '13건 (가장 오래된 건 10/08 발송)');
  setVal('festaComparePending2', '2건 (가장 오래된 건 10/14 발송)');
  setVal('festaCompareWait1', '83건 (2025-08부터)');
  setVal('festaCompareWait2', '41건 (2025-08부터)');

  updateFestaTotals();
}

function getDefaultMetricsTemplate(dateStr) {
  let monthNum = new Date().getMonth() + 1;
  if (dateStr && typeof dateStr === 'string') {
    const parts = dateStr.split('-');
    if (parts.length >= 2 && !isNaN(parseInt(parts[1], 10))) {
      monthNum = parseInt(parts[1], 10);
    }
  }

  const isMon = getDayOfWeek(dateStr) === 1;

  if (isMon) {
    return [
      `[계약 지표] ${monthNum}월 예상 계약 건`,
      '- 누적: ',
      '- 토요일: ',
      '- 일요일: ',
      '',
      '[계약 전환 지표]',
      '- 토요일: 방문상담 건 / 실제방문 건 / 계약 건',
      '- 일요일: 방문상담 건 / 실제방문 건 / 계약 건',
      '',
      '[혼수 상담 지표]',
      '- 토요일: (회원 / 비회원 ), 상담, 가계약, 정계약',
      '(상담, 가계약, 정계약 순)',
      ' · ',
      '',
      '- 일요일: (회원 / 비회원 ), 상담, 가계약, 정계약',
      '(상담, 가계약, 정계약 순)',
      ' · ',
      '',
      '[웨딩페스타 드레스 지정발주 지표]',
      '1) 발주대기: ',
      '2) 발주: ',
      '',
      '[DB 유입 지표]',
      '- 신청 / 유효 / 누적: ',
      '- 경로별 특이사항: ',
      '',
      '[방문 예정 및 상담 현황]',
      '- 토요일 / 일요일: ',
      '',
      '[플래너 실적 / 특이사항]',
      '- ',
      '',
      '[인사이트 및 메모]',
      '- '
    ].join('\n');
  }

  return [
    `[계약 지표] ${monthNum}월 예상 계약 건`,
    '- 당일 / 누적: ',
    '',
    '[DB 유입 지표]',
    '- 신청 / 유효 / 누적: ',
    '- 경로별 특이사항: ',
    '',
    '[방문 예정 및 상담 현황]',
    '- 토요일 / 일요일: ',
    '',
    '[플래너 실적 / 특이사항]',
    '- ',
    '',
    '[인사이트 및 메모]',
    '- '
  ].join('\n');
}

function isUntouchedMetricsTemplate(text, dateStr) {
  if (!text || !text.trim()) return true;
  const normalize = (s) => String(s || '').replace(/\r\n/g, '\n').trim();
  const normText = normalize(text);
  if (normText === normalize(getDefaultMetricsTemplate(dateStr))) return true;

  let monthNum = new Date().getMonth() + 1;
  if (dateStr && typeof dateStr === 'string') {
    const parts = dateStr.split('-');
    if (parts.length >= 2 && !isNaN(parseInt(parts[1], 10))) {
      monthNum = parseInt(parts[1], 10);
    }
  }

  const prevHardcodedTemplate = [
    `[계약 지표] ${monthNum}월 예상 계약 건`,
    '- 누적: ',
    '- 일요일: ',
    '- 토요일: ',
    '',
    '[계약 전환 지표]',
    '- 토요일: 방문상담 건 / 실제방문 건 / 계약 건',
    '- 일요일: 방문상담 건 / 실제방문 건 / 계약 건',
    '',
    '[혼수 상담 지표]',
    '- 일요일: (회원 / 비회원 ), 상담, 가계약, 정계약',
    '(상담, 가계약, 정계약 순)',
    ' · 라비: ',
    ' · 아틀: ',
    ' · 릴리: ',
    ' · 아크: ',
    ' · 아씨: ',
    ' · 공감: ',
    ' · 비비: ',
    '',
    '- 토요일: (회원 / 비회원 ), 상담, 가계약, 정계약',
    '(상담, 가계약, 정계약 순)',
    ' · 라비: ',
    ' · 아틀: ',
    ' · 릴리: ',
    ' · 아크: ',
    ' · 아씨: ',
    ' · 공감: ',
    ' · 비비: ',
    '',
    '[웨딩페스타 드레스 지정발주 지표]',
    '1) 발주대기: 하오에 , 보니타 ',
    '2) 발주: 하오에 , 보니타 ',
    '',
    '하오에 , 보니타 ',
    '',
    '[DB 유입 지표]',
    '- 신청 / 유효 / 누적: ',
    '- 경로별 특이사항: ',
    '',
    '[방문 예정 및 상담 현황]',
    '- 토요일 / 일요일: ',
    '',
    '[플래너 실적 / 특이사항]',
    '- ',
    '',
    '[인사이트 및 메모]',
    '- '
  ].join('\n');
  if (normText === normalize(prevHardcodedTemplate)) return true;

  const legacyShortTemplate = [
    '[계약 지표]',
    '- 당일 / 누적: ',
    '',
    '[DB 유입 지표]',
    '- 신청 / 유효 / 누적: ',
    '- 경로별 특이사항: ',
    '',
    '[방문 예정 및 상담 현황]',
    '- 토요일 / 일요일: ',
    '',
    '[플래너 실적 / 특이사항]',
    '- ',
    '',
    '[인사이트 및 메모]',
    '- '
  ].join('\n');
  if (normText === normalize(legacyShortTemplate)) return true;

  return false;
}

function buildUnifiedMetricsText(m) {
  if (!m) return '';

  const insightText = (m.insight || '').trim();
  const rawReportText = (m.raw_report || '').trim();

  // 통합 메모장 형태로 저장된 경우 (insight와 raw_report가 동일하고 내용이 존재할 때) 바로 반환
  if (insightText && insightText === rawReportText) {
    return m.insight;
  }

  const lines = [];

  // 1. 계약 지표
  const contractParts = [];
  if (m.contracts_count !== null && m.contracts_count !== undefined && m.contracts_count !== '' && Number(m.contracts_count) !== 0) {
    contractParts.push(`당일 ${m.contracts_count}건`);
  }
  if (m.cumulative_contracts_count !== null && m.cumulative_contracts_count !== undefined && m.cumulative_contracts_count !== '' && Number(m.cumulative_contracts_count) !== 0) {
    contractParts.push(`누적 ${m.cumulative_contracts_count}건`);
  }
  if (m.contract_note) {
    contractParts.push(`비고: ${m.contract_note}`);
  }
  if (contractParts.length > 0) {
    lines.push(`[계약] ${contractParts.join(' / ')}`);
  }

  // 2. DB 유입 지표
  const dbApplied = m.db_count !== null && m.db_count !== undefined && m.db_count !== '' ? m.db_count : m.db_total_applied;
  const dbParts = [];
  if (dbApplied !== null && dbApplied !== undefined && dbApplied !== '' && Number(dbApplied) !== 0) {
    dbParts.push(`신청 ${dbApplied}건`);
  }
  if (m.db_total_actual !== null && m.db_total_actual !== undefined && m.db_total_actual !== '' && Number(m.db_total_actual) !== 0) {
    dbParts.push(`유효 ${m.db_total_actual}건`);
  }
  if (m.cumulative_db_count !== null && m.cumulative_db_count !== undefined && m.cumulative_db_count !== '' && Number(m.cumulative_db_count) !== 0) {
    dbParts.push(`누적 ${m.cumulative_db_count}건`);
  }
  if (m.db_total_note) {
    dbParts.push(`비고: ${m.db_total_note}`);
  }
  if (dbParts.length > 0) {
    lines.push(`[DB 유입] ${dbParts.join(' / ')}`);
  }

  // DB 경로별 상세
  if (Array.isArray(m.db_channels) && m.db_channels.length > 0) {
    const channelLines = m.db_channels
      .filter(ch => ch && (ch.channel || ch.applied || ch.actual || ch.note))
      .map(ch => `  - ${ch.channel || '기타'}: 신청 ${ch.applied || 0} / 유효 ${ch.actual || 0}${ch.note ? ` (${ch.note})` : ''}`);
    if (channelLines.length > 0) {
      lines.push(...channelLines);
    }
  }

  // 3. 방문 예정
  const visitParts = [];
  if ((m.saturday_visitors !== null && m.saturday_visitors !== undefined && m.saturday_visitors !== '' && Number(m.saturday_visitors) !== 0) || m.saturday_note) {
    visitParts.push(`토요일 ${m.saturday_visitors || 0}건${m.saturday_note ? ` (${m.saturday_note})` : ''}`);
  }
  if ((m.sunday_visitors !== null && m.sunday_visitors !== undefined && m.sunday_visitors !== '' && Number(m.sunday_visitors) !== 0) || m.sunday_note) {
    visitParts.push(`일요일 ${m.sunday_visitors || 0}건${m.sunday_note ? ` (${m.sunday_note})` : ''}`);
  }
  if (visitParts.length > 0) {
    lines.push(`[방문 예정] ${visitParts.join(' / ')}`);
  }

  // 4. 주말 웨딩/혼수 상담
  if (m.saturday_wedding_text || m.sunday_wedding_text) {
    lines.push(`[웨딩 상담] 토: ${m.saturday_wedding_text || '-'} / 일: ${m.sunday_wedding_text || '-'}`);
  }
  if (m.saturday_honsoo_text || m.sunday_honsoo_text) {
    lines.push(`[혼수 상담] 토: ${m.saturday_honsoo_text || '-'} / 일: ${m.sunday_honsoo_text || '-'}`);
  }

  // 5. 플래너 실적
  if (Array.isArray(m.planner_top_list) && m.planner_top_list.length > 0) {
    const topStr = m.planner_top_list
      .filter(p => p && (p.name || p.count || p.note))
      .map(p => `${p.name || ''}${p.count ? ` ${p.count}` : ''}${p.note ? `(${p.note})` : ''}`.trim())
      .filter(Boolean)
      .join(', ');
    if (topStr) lines.push(`[플래너 상위] ${topStr}`);
  } else if (m.contract_top) {
    lines.push(`[플래너 상위] ${m.contract_top}`);
  }

  if (Array.isArray(m.planner_bottom_list) && m.planner_bottom_list.length > 0) {
    const bottomStr = m.planner_bottom_list
      .filter(p => p && (p.name || p.count || p.note))
      .map(p => `${p.name || ''}${p.count ? ` ${p.count}` : ''}${p.note ? `(${p.note})` : ''}`.trim())
      .filter(Boolean)
      .join(', ');
    if (bottomStr) lines.push(`[플래너 하위] ${bottomStr}`);
  } else if (m.contract_bottom) {
    lines.push(`[플래너 하위] ${m.contract_bottom}`);
  }

  // 6. 원문 리포트 및 인사이트
  if (rawReportText && rawReportText !== insightText) {
    if (lines.length > 0) lines.push('');
    lines.push(rawReportText);
  }
  if (insightText) {
    if (lines.length > 0) lines.push('');
    lines.push(insightText);
  }

  return lines.join('\n').trim();
}

async function refreshAllData() {
  console.log('refreshAllData called');
  document.getElementById('metricsDate').textContent = formatDateKorean(currentMetricsDate);
  document.getElementById('inputDueDate').value = currentMetricsDate;
  
  const metricInput = document.getElementById('metricInsight');
  if (metricInput) {
    metricInput.value = '';
  }

  console.log('calling api.getDailyMetrics');
  const m = await api.getDailyMetrics(currentMetricsDate);
  console.log('api.getDailyMetrics resolved', m);
  if (metricInput) {
    const serverMetricsText = buildUnifiedMetricsText(m);
    const localDraftMetrics = localStorage.getItem(`draft_metrics_${currentMetricsDate}`);
    const localSavedMetrics = localStorage.getItem(`saved_metrics_${currentMetricsDate}`);
    let resolvedText = '';
    if (localDraftMetrics !== null && localDraftMetrics !== serverMetricsText && !isUntouchedMetricsTemplate(localDraftMetrics, currentMetricsDate)) {
      resolvedText = localDraftMetrics;
    } else if (!serverMetricsText && localSavedMetrics && !isUntouchedMetricsTemplate(localSavedMetrics, currentMetricsDate)) {
      resolvedText = localSavedMetrics;
    } else if (serverMetricsText && !isUntouchedMetricsTemplate(serverMetricsText, currentMetricsDate)) {
      resolvedText = serverMetricsText;
    } else {
      resolvedText = getDefaultMetricsTemplate(currentMetricsDate);
    }
    metricInput.value = resolvedText;
  }
  
  const memo = document.getElementById('memoInput');
  memo.value = ''; memo.placeholder = '로딩 중...';
  
  const diary = document.getElementById('diaryInput');
  diary.value = ''; diary.placeholder = '로딩 중...';
  
  const newsEl = document.getElementById('newsInput');
  newsEl.value = ''; newsEl.placeholder = '로딩 중...';
  
  console.log('calling api.getDailyMemo');
  const r = await api.getDailyMemo(currentMetricsDate);
  console.log('api.getDailyMemo resolved', r);
  let dbContent = r.content || '';
  
  // 로컬 백업 및 드래프트 검사 (DB 데이터로 인한 덮어쓰기 방지)
  const savedMemo = localStorage.getItem(`saved_memo_${currentMetricsDate}`);
  const draftMemo = localStorage.getItem(`draft_memo_${currentMetricsDate}`);
  const localContent = (savedMemo && savedMemo.trim().length > 0) ? savedMemo : draftMemo;
  
  let finalContent = dbContent;
  if (localContent && localContent.trim().length > 0 && localContent !== dbContent) {
    if (!dbContent || dbContent.trim().length === 0 || localContent.length >= dbContent.length) {
      finalContent = localContent;
      console.warn('DB 메모가 비어있거나 짧아 로컬 백업 메모로 복구합니다:', finalContent);
      api.saveDailyMemo(currentMetricsDate, finalContent);
    }
  }

  memo.value = finalContent;
  memo.placeholder = `${formatDateKorean(currentMetricsDate)} 메모...`;
  updateMemoBadge(finalContent);

  const rd = await api.getDailyDiary(currentMetricsDate);
  let dbDiary = rd.content || '';
  const savedDiary = localStorage.getItem(`saved_diary_${currentMetricsDate}`);
  const draftDiary = localStorage.getItem(`draft_diary_${currentMetricsDate}`);
  const localDiary = (savedDiary && savedDiary.trim().length > 0) ? savedDiary : draftDiary;
  let finalDiary = dbDiary;
  if (localDiary && localDiary.trim().length > 0 && localDiary !== dbDiary) {
    if (!dbDiary || dbDiary.trim().length === 0 || localDiary.length >= dbDiary.length) {
      finalDiary = localDiary;
      api.saveDailyDiary(currentMetricsDate, finalDiary);
    }
  }
  diary.value = finalDiary;
  diary.placeholder = `${formatDateKorean(currentMetricsDate)} 일기...`;
  updateBadge('diaryBadge', finalDiary);

  const rn = await api.getDailyNews(currentMetricsDate);
  let dbNews = rn.content || '';
  const savedNews = localStorage.getItem(`saved_news_${currentMetricsDate}`);
  const draftNews = localStorage.getItem(`draft_news_${currentMetricsDate}`);
  const localNews = (savedNews && savedNews.trim().length > 0) ? savedNews : draftNews;
  let finalNews = dbNews;
  if (localNews && localNews.trim().length > 0 && localNews !== dbNews) {
    if (!dbNews || dbNews.trim().length === 0 || localNews.length >= dbNews.length) {
      finalNews = localNews;
      api.saveDailyNews(currentMetricsDate, finalNews);
    }
  }
  newsEl.value = finalNews;
  newsEl.placeholder = `${formatDateKorean(currentMetricsDate)} 신문...`;
  updateBadge('newsBadge', finalNews);
  
  loadTasks();
  loadBooks();
  loadManuals();
}

function updateMemoBadge(content) {
  const badge = document.getElementById('memoBadge');
  if (badge) {
    if (window.syncSpenBadges) {
      window.syncSpenBadges();
    } else {
      if (content && content.trim().length > 0) badge.style.display = 'flex';
      else badge.style.display = 'none';
    }
  }
}

function updateBadge(badgeId, content) {
  const badge = document.getElementById(badgeId);
  if (badge) {
    if (window.syncSpenBadges) {
      window.syncSpenBadges();
    } else {
      if (content && content.trim().length > 0) badge.style.display = 'flex';
      else badge.style.display = 'none';
    }
  }
}

async function loadTasks() {
  console.log('loadTasks called');
  const list = document.getElementById('taskList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  
  const tid = setTimeout(() => {
    if(list.innerHTML.includes('spinner')) list.innerHTML = '<div class="empty-state"><p>응답 없음</p></div>';
  }, 8000);
  
  let tasks;
  if (customRangeStart && customRangeEnd) {
    console.log('calling api.getTasksByDateRange', customRangeStart, customRangeEnd);
    tasks = await api.getTasksByDateRange(customRangeStart, customRangeEnd);
    console.log('api.getTasksByDateRange resolved', tasks);
  } else if(selectedDate) {
    console.log('calling api.getTasksByDate');
    tasks = await api.getTasksByDate(selectedDate);
    console.log('api.getTasksByDate resolved', tasks);
  } else {
    console.log('calling api.getTasksByPeriod');
    tasks = await api.getTasksByPeriod(currentPeriod);
    console.log('api.getTasksByPeriod resolved', tasks);
  }
  
  clearTimeout(tid);
  if(!tasks || tasks.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>할일 없음</p></div>';
    return;
  }
  renderTasks(tasks);
}

function renderTasks(tasks) {
  loadedTasks = tasks;
  const list = document.getElementById('taskList');
  list.innerHTML = tasks.map(t => {
    const checked = t.status === '완료' ? 'checked' : '';
    const compClass = t.status === '완료' ? 'completed' : '';
    const dateObj = new Date(t.created_at);
    const w = ['일', '월', '화', '수', '목', '금', '토'];
    const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(${w[dateObj.getDay()]})`;
    
    // push_time이 있으면 ⏰ 배지와 활성화 클래스 적용
    let pushBadge = '';
    let pushBtnActive = '';
    if (t.push_time) {
      const pTime = new Date(t.push_time);
      const pHour = String(pTime.getHours()).padStart(2, '0');
      const pMin = String(pTime.getMinutes()).padStart(2, '0');
      pushBadge = `<span class="push-badge" title="예약된 푸시 알림">⏰ ${pHour}:${pMin}</span>`;
      pushBtnActive = 'active';
    }
    
    return `<div class="task-item ${compClass}" data-id="${t.task_id}" draggable="false">
      <div class="drag-handle" title="끌어서 순서 조정">☰</div>
      <div class="task-checkbox ${checked}" onclick="toggleStatus('${t.task_id}', '${t.status==='완료'?'진행중':'완료'}')"></div>
      <div class="task-content">
        <div class="task-description ${compClass}">${escapeHtml(t.description)}</div>
        <div class="task-meta">
          <span>${dateStr}</span>
          ${pushBadge}
          <span class="status-badge ${t.status}" onclick="handleStatusBadgeClick('${t.task_id}')">${t.status}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="task-push-btn ${pushBtnActive}" onclick="openPushModal('${t.task_id}')" title="알림 예약">🔔</button>
        <button class="task-edit" onclick="editTask('${t.task_id}')">✎</button>
        <button class="task-delete" onclick="deleteTask('${t.task_id}')">×</button>
      </div>
    </div>`;
  }).join('');

  // 드래그앤드롭 및 터치 이벤트 바인딩
  bindDragAndTouchEvents();
}

async function saveTasksOrder() {
  const list = document.getElementById('taskList');
  const taskItems = list.querySelectorAll('.task-item');
  const taskIds = Array.from(taskItems).map(el => el.dataset.id);
  
  if (taskIds.length === 0) return;
  
  const res = await api.updateTasksOrder(taskIds);
  if (!res.success) {
    alert('순서 저장에 실패했습니다. 다시 시도해 주세요.');
    loadTasks();
  }
}

async function sortTasksByDate() {
  if (!loadedTasks || loadedTasks.length <= 1) {
    showToast('정렬할 할일 항목이 2개 이상 있어야 합니다.');
    return;
  }
  
  const dateBtn = document.getElementById('btnSortDate');
  const dateLabel = document.getElementById('sortDateLabel');
  const uncompletedBtn = document.getElementById('btnSortUncompleted');
  
  if (uncompletedBtn) uncompletedBtn.classList.remove('active');
  if (dateBtn) dateBtn.classList.add('active');
  
  if (dateSortDirection === 'asc') {
    loadedTasks.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (dateLabel) dateLabel.textContent = '날짜순 ↑';
    dateSortDirection = 'desc';
    showToast('📅 오래된 등록 순으로 정렬되었습니다.');
  } else {
    loadedTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (dateLabel) dateLabel.textContent = '날짜순 ↓';
    dateSortDirection = 'asc';
    showToast('📅 최신 등록 순으로 정렬되었습니다.');
  }
  
  renderTasks(loadedTasks);
  await saveTasksOrder();
}

async function sortTasksByUncompleted() {
  if (!loadedTasks || loadedTasks.length <= 1) {
    showToast('정렬할 할일 항목이 2개 이상 있어야 합니다.');
    return;
  }
  
  const dateBtn = document.getElementById('btnSortDate');
  const uncompletedBtn = document.getElementById('btnSortUncompleted');
  
  if (dateBtn) dateBtn.classList.remove('active');
  if (uncompletedBtn) uncompletedBtn.classList.add('active');
  
  loadedTasks.sort((a, b) => {
    const aComp = a.status === '완료' ? 1 : 0;
    const bComp = b.status === '완료' ? 1 : 0;
    if (aComp !== bComp) return aComp - bComp;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  
  showToast('⏳ 미완료 항목이 상단으로 정렬되었습니다.');
  renderTasks(loadedTasks);
  await saveTasksOrder();
}

function bindDragAndTouchEvents() {
  const taskList = document.getElementById('taskList');
  const taskItems = taskList.querySelectorAll('.task-item');
  
  taskItems.forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;
    
    // PC 드래그 지원: 핸들을 쥐고 있을 때만 드래그 가능하게
    handle.addEventListener('mousedown', () => {
      item.setAttribute('draggable', 'true');
    });
    handle.addEventListener('mouseup', () => {
      item.setAttribute('draggable', 'false');
    });
    handle.addEventListener('mouseleave', () => {
      item.setAttribute('draggable', 'false');
    });
    
    // PC HTML5 Drag events
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.id);
    });
    
    item.addEventListener('dragend', async () => {
      item.classList.remove('dragging');
      item.setAttribute('draggable', 'false');
      await saveTasksOrder();
    });
    
    // 모바일 터치 이벤트 바인딩
    let touchEl = null;
    
    handle.addEventListener('touchstart', (e) => {
      touchEl = item;
      touchEl.classList.add('dragging');
      // 터치 동작 중 스크롤 잠금 (드래그 조작 집중)
      document.body.style.overflow = 'hidden';
    }, { passive: false });
    
    handle.addEventListener('touchmove', (e) => {
      if (!touchEl) return;
      e.preventDefault(); // 기본 터치 스크롤 방지
      
      const touch = e.touches[0];
      const clientY = touch.clientY;
      
      const elementAtTouch = document.elementFromPoint(touch.clientX, clientY);
      if (!elementAtTouch) return;
      
      const overItem = elementAtTouch.closest('.task-item');
      if (overItem && overItem !== touchEl && overItem.parentNode === taskList) {
        const rect = overItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (clientY < midY) {
          taskList.insertBefore(touchEl, overItem);
        } else {
          taskList.insertBefore(touchEl, overItem.nextElementSibling);
        }
      }
    }, { passive: false });
    
    handle.addEventListener('touchend', async (e) => {
      if (!touchEl) return;
      touchEl.classList.remove('dragging');
      touchEl = null;
      document.body.style.overflow = '';
      await saveTasksOrder();
    });
    
    handle.addEventListener('touchcancel', () => {
      if (!touchEl) return;
      touchEl.classList.remove('dragging');
      touchEl = null;
      document.body.style.overflow = '';
    });
  });
  
  // PC Drag Over
  taskList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingEl = taskList.querySelector('.task-item.dragging');
    if (!draggingEl) return;
    
    const afterElement = getDragAfterElement(taskList, e.clientY);
    if (afterElement == null) {
      taskList.appendChild(draggingEl);
    } else {
      taskList.insertBefore(draggingEl, afterElement);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// 전역 윈도우 스코프 바인딩 (이동 버튼 제거로 미사용)

async function executeSearch() {
  const kw = document.getElementById('searchInput').value.trim();
  if(!kw) return;
  const list = document.getElementById('taskList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  closeAllHeaders();
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));

  const r = await api.searchAll(kw);
  const total = r.tasks.length + r.memos.length + r.diaries.length + r.news.length;

  if (total === 0) {
    list.innerHTML = `<div class="empty-state"><p>'${escapeHtml(kw)}' 검색 결과가 없습니다</p></div>`;
    return;
  }

  // 할일은 기존 렌더러 재사용 (체크/수정/삭제 인터랙션 유지)
  if (r.tasks.length > 0) {
    renderTasks(r.tasks);
  } else {
    list.innerHTML = '';
    loadedTasks = [];
  }

  // 할일 섹션 레이블 + 요약 바를 위에 붙임
  const summaryHtml = `
    <div class="search-summary">
      <span class="search-summary-total">'${escapeHtml(kw)}' 검색 결과 ${total}건</span>
      <span class="search-summary-counts">할일 ${r.tasks.length} · 메모 ${r.memos.length} · 일기 ${r.diaries.length} · 신문 ${r.news.length}</span>
    </div>
    ${r.tasks.length > 0 ? '<div class="search-section-label">할일 · ' + r.tasks.length + '</div>' : ''}`;
  list.insertAdjacentHTML('afterbegin', summaryHtml);

  // 메모 / 일기 / 신문 스니펫 섹션
  const sections = [
    { key: 'memos',   label: '메모', type: 'memo',  rows: r.memos },
    { key: 'diaries', label: '일기', type: 'diary', rows: r.diaries },
    { key: 'news',    label: '신문', type: 'news',  rows: r.news }
  ];

  let recordsHtml = '';
  sections.forEach(sec => {
    if (!sec.rows || sec.rows.length === 0) return;
    recordsHtml += `<div class="search-section-label">${sec.label} · ${sec.rows.length}</div>`;
    recordsHtml += sec.rows.map(row => `
      <div class="record-result-card" onclick="openRecordFromSearch('${row.date}', '${sec.type}')">
        <div class="record-result-head">
          <span class="record-result-date">${formatDateKorean(row.date)} ${sec.label}</span>
          <span class="record-result-arrow">&rsaquo;</span>
        </div>
        <div class="record-result-snippet">${makeSearchSnippet(row.content, kw)}</div>
      </div>`).join('');
  });
  if (recordsHtml) list.insertAdjacentHTML('beforeend', recordsHtml);
}

// 검색어 주변 발췌문 생성 + 키워드 하이라이트
function makeSearchSnippet(content, kw, radius = 45) {
  if (!content) return '';
  const lowered = content.toLowerCase();
  const idx = lowered.indexOf(kw.toLowerCase());
  let start = 0, end = content.length;
  if (idx >= 0) {
    start = Math.max(0, idx - radius);
    end = Math.min(content.length, idx + kw.length + radius);
  } else {
    end = Math.min(content.length, radius * 2);
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  const sliceEscaped = escapeHtml(content.slice(start, end).replace(/\s+/g, ' '));
  const kwEscaped = escapeHtml(kw);
  const pattern = new RegExp(kwEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const highlighted = sliceEscaped.replace(pattern, m => `<mark class="search-mark">${m}</mark>`);
  return prefix + highlighted + suffix;
}

// 검색 결과 스니펫 클릭 → 해당 날짜로 이동 후 패널 오픈
function openRecordFromSearch(dateStr, type) {
  document.getElementById('searchInput').value = '';
  selectDateFromCalendar(dateStr);
  toggleHeader(type);
}

// 요일을 구하는 헬퍼 함수 (0: 일, 1: 월, 2: 화...)
function getDayOfWeek(dateStr) {
  if (!dateStr) return -1;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return -1;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.getDay();
}

async function saveMetrics() {
  const btn = document.getElementById('btnSaveMetrics');
  const st = document.getElementById('saveStatus');
  const metricInput = document.getElementById('metricInsight');
  if (!metricInput) return;

  const content = metricInput.value;
  if (btn) {
    btn.disabled = true;
    btn.innerText = '...';
  }

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`saved_metrics_${currentMetricsDate}`, content);
      localStorage.setItem(`draft_metrics_${currentMetricsDate}`, content);
    } catch (e) {}
  }

  const res = await api.saveDailyMetrics(currentMetricsDate, {
    is_unified_note: true,
    content: content
  });

  if (res && res.success) {
    if (currentMetricsDate) {
      try {
        localStorage.removeItem(`draft_metrics_${currentMetricsDate}`);
      } catch (e) {}
    }
    if (btn) {
      btn.disabled = false;
      btn.innerText = '저장';
    }
    if (st) {
      st.innerText = '저장 완료';
      st.style.color = '#10b981';
      st.style.fontWeight = '800';
      setTimeout(() => {
        if (st.innerText === '저장 완료') st.innerText = '';
      }, 2000);
    }
    triggerQuestUpdate('metrics_logged', true);
    fetchAllDates();
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '저장';
    }
    if (st) {
      st.innerText = '임시 보관됨';
      st.style.color = '#10b981';
    }
  }
}

async function saveMemo() {
  const btn = document.getElementById('saveMemoBtn');
  const content = document.getElementById('memoInput').value;
  const st = document.getElementById('memoStatus');
  
  btn.disabled = true; btn.innerText = '저장 중...';
  if (st) st.innerText = '저장 중...';
  
  if (currentMetricsDate) {
    try {
      localStorage.setItem(`saved_memo_${currentMetricsDate}`, content);
    } catch(e) {}
  }
  
  const res = await api.saveDailyMemo(currentMetricsDate, content);
  if(res && res.success) {
    btn.disabled = false; btn.innerText = '메모 저장';
    if (st) {
      st.innerText = '저장 완료';
      st.style.color = '#10b981';
    }
    updateMemoBadge(content);
    fetchAllDates();
    setTimeout(() => { if (st) st.innerText = ''; }, 2000);
    triggerQuestUpdate('memo_written', true);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '메모 저장';
    const errReason = (res && res.error) ? res.error : '네트워크 또는 로그인 세션 오류';
    if (st) {
      st.innerText = '로컬에 보관됨 (서버 오류)';
      st.style.color = '#ef4444';
    }
    alert(`[서버 저장 실패 알림]\n메모가 기기 로컬에는 안전하게 보관되었으나, 서버 저장에 실패했습니다.\n\n사유: ${errReason}\n\n인터넷 연결 및 로그인(인증) 세션 상태를 확인해 주세요.`);
  }
}

async function saveDiary() {
  const btn = document.getElementById('saveDiaryBtn');
  const content = document.getElementById('diaryInput').value;
  const st = document.getElementById('diaryStatus');
  
  btn.disabled = true; btn.innerText = '저장 중...';
  if (st) st.innerText = '저장 중...';

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`saved_diary_${currentMetricsDate}`, content);
    } catch(e) {}
  }
  
  const res = await api.saveDailyDiary(currentMetricsDate, content);
  if(res && res.success) {
    btn.disabled = false; btn.innerText = '일기 저장';
    if (st) {
      st.innerText = '저장 완료';
      st.style.color = '#10b981';
    }
    updateBadge('diaryBadge', content);
    fetchAllDates();
    triggerQuestUpdate('diary_written', true);
    setTimeout(() => { if (st) st.innerText = ''; }, 2000);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '일기 저장';
    const errReason = (res && res.error) ? res.error : '네트워크 또는 로그인 세션 오류';
    if (st) {
      st.innerText = '로컬에 보관됨 (서버 오류)';
      st.style.color = '#ef4444';
    }
    alert(`[서버 저장 실패 알림]\n일기가 기기 로컬에는 안전하게 보관되었으나, 서버 저장에 실패했습니다.\n\n사유: ${errReason}\n\n인터넷 연결 및 로그인(인증) 세션 상태를 확인해 주세요.`);
  }
}

async function saveNews() {
  const btn = document.getElementById('saveNewsBtn');
  const content = document.getElementById('newsInput').value;
  const st = document.getElementById('newsStatus');
  
  btn.disabled = true; btn.innerText = '저장 중...';
  if (st) st.innerText = '저장 중...';

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`saved_news_${currentMetricsDate}`, content);
    } catch(e) {}
  }
  
  const res = await api.saveDailyNews(currentMetricsDate, content);
  if(res && res.success) {
    btn.disabled = false; btn.innerText = '신문 저장';
    if (st) {
      st.innerText = '저장 완료';
      st.style.color = '#10b981';
    }
    updateBadge('newsBadge', content);
    fetchAllDates();
    triggerQuestUpdate('news_written', true);
    setTimeout(() => { if (st) st.innerText = ''; }, 2000);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '신문 저장';
    const errReason = (res && res.error) ? res.error : '네트워크 또는 로그인 세션 오류';
    if (st) {
      st.innerText = '로컬에 보관됨 (서버 오류)';
      st.style.color = '#ef4444';
    }
    alert(`[서버 저장 실패 알림]\n신문이 기기 로컬에는 안전하게 보관되었으나, 서버 저장에 실패했습니다.\n\n사유: ${errReason}\n\n인터넷 연결 및 로그인(인증) 세션 상태를 확인해 주세요.`);
  }
}

async function addTask() {
  const desc = document.getElementById('inputDescription');
  const date = document.getElementById('inputDueDate');
  if(!desc.value.trim()) return;
  
  document.getElementById('btnAdd').disabled = true;
  
  const res = await api.addTaskWithDate(desc.value, date.value, selectedDate || getTodayString());
  if(res.success) {
    desc.value = '';
    desc.style.height = 'auto';
    document.getElementById('btnAdd').disabled = false;
    loadTasks();
  } else {
    document.getElementById('btnAdd').disabled = false;
    alert('추가에 실패했습니다.');
  }
}

async function handleStatusBadgeClick(taskId) {
  const task = loadedTasks.find(t => t.task_id === taskId);
  if (!task) return;
  
  if (task.status !== '진행중') return;
  
  const taskDate = formatDateString(new Date(task.created_at));
  const todayStr = getTodayString();
  
  if (taskDate === todayStr) {
    return;
  }
  
  if (confirm('오늘 날짜 업무로 가져오시겠습니까?')) {
    const resUpdate = await api.updateTaskStatus(taskId, '완료');
    if (!resUpdate.success) {
      alert('기존 할일 상태 변경에 실패했습니다.');
      return;
    }
    
    const resAdd = await api.addTaskWithDate(task.description, task.due_date, todayStr);
    if (resAdd.success) {
      loadTasks();
      fetchAllDates();
    } else {
      alert('오늘 날짜 업무로 복사하는 중 실패했습니다.');
      loadTasks();
    }
  }
}

async function toggleStatus(id, st) { 
  const res = await api.updateTaskStatus(id, st);
  if(res.success) {
    loadTasks();
    await triggerTasksQuestUpdate();
    
    const xpAmount = (st === '완료') ? 2 : -2;
    const xpRes = await api.addRealtimeTaskXp(xpAmount);
    if (xpRes && xpRes.success) {
      userStats = xpRes.stats;
      renderLevelHUD(userStats);
      showToast(`할 일 완료! ${xpAmount > 0 ? '+' : ''}${xpAmount} XP`);
      if (xpRes.leveledUp) handleLevelUp(userStats.level);
    }
  }
}

function editTask(id) {
  const descEl = document.querySelector(`.task-item[data-id="${id}"] .task-description`);
  const originalText = descEl ? descEl.innerText : '';

  const overlay = document.getElementById('editModalOverlay');
  const textarea = document.getElementById('editModalTextarea');
  const saveBtn = document.getElementById('editModalSave');
  const cancelBtn = document.getElementById('editModalCancel');

  textarea.value = originalText;
  overlay.classList.add('show');
  setTimeout(() => textarea.focus(), 50);

  async function doSave() {
    const newText = textarea.value;
    if(newText && newText !== originalText) {
      const res = await api.updateTaskContent(id, newText);
      if(res.success) loadTasks();
    }
    closeModal();
  }

  function closeModal() {
    overlay.classList.remove('show');
    saveBtn.onclick = null;
    cancelBtn.onclick = null;
    textarea.onkeydown = null;
    overlay.onclick = null;
  }

  saveBtn.onclick = doSave;
  cancelBtn.onclick = closeModal;
  overlay.onclick = (e) => { if(e.target === overlay) closeModal(); };
  textarea.onkeydown = (e) => {
    if (shouldSubmitOnEnter(e)) {
      e.preventDefault();
      doSave();
    }
  };
}

async function deleteTask(id) { 
  if(confirm('삭제?')) {
    const task = loadedTasks.find(t => t.task_id === id);
    const wasCompleted = task && task.status === '완료';
    
    const res = await api.deleteTask(id);
    if(res.success) {
      loadTasks();
      await triggerTasksQuestUpdate();
      
      if (wasCompleted) {
        const xpRes = await api.addRealtimeTaskXp(-2);
        if (xpRes && xpRes.success) {
          userStats = xpRes.stats;
          renderLevelHUD(userStats);
          showToast("할 일이 삭제되어 -2 XP 차감되었습니다.");
        }
      }
    }
  }
}

function escapeHtml(t) { 
  const d = document.createElement('div'); 
  d.textContent = t; 
  return d.innerHTML; 
}

function stripRichHtmlForSearch(raw) {
  if (!raw) return '';
  if (window.reportStudio && typeof window.reportStudio.stripHtmlTags === 'function') {
    return window.reportStudio.stripHtmlTags(raw);
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  return (tmp.textContent || tmp.innerText || '').trim();
}

function formatShelfItemDate(isoStr) {
  if (!isoStr) return '';
  if (window.reportStudio && typeof window.reportStudio.formatDateTimeShort === 'function') {
    return window.reportStudio.formatDateTimeShort(isoStr);
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

// 독서 기록(Book Shelf & Notes) 프론트엔드 연동 구현 (블로그형 통합 에디터 연동)
async function loadBooks() {
  currentBooks = await api.getBooks();
  window.currentBooks = currentBooks;
  
  // 만약 서재 모달이 열려 있다면 목록도 갱신
  if (document.getElementById('bookShelfModalOverlay').classList.contains('show')) {
    renderBookList();
  }
}
window.loadBooks = loadBooks;

function openBookShelfModal() {
  document.getElementById('bookShelfModalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  document.getElementById('bookInput').value = '';

  const searchInput = document.getElementById('bookSearchInput');
  if (searchInput) searchInput.value = '';
  currentBookSearch = '';
  const clearBtn = document.getElementById('bookSearchClear');
  if (clearBtn) clearBtn.classList.remove('visible');

  // 디폴트로 '전체' 탭 활성화
  document.querySelectorAll('.book-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.book-tab[data-status="all"]').classList.add('active');
  currentBookFilter = 'all';
  loadBooks().then(() => {
    renderBookList();
  });
}

function closeBookShelfModal() {
  document.getElementById('bookShelfModalOverlay').classList.remove('show');
  checkAndUnlockBodyScroll();
}

let bookSaveStatusTimer = null;
function updateBookSaveIndicator(state) {
  const container = document.getElementById('bookNotesSaveStatus');
  if (!container) return;

  if (bookSaveStatusTimer) {
    clearTimeout(bookSaveStatusTimer);
    bookSaveStatusTimer = null;
  }

  // 내부 점 요소가 없으면 생성
  if (!container.querySelector('.save-status-dot')) {
    container.innerHTML = '<span class="save-status-dot"></span>';
  }

  container.className = `save-status-dot-container ${state}`;
  if (state === 'saving') {
    container.setAttribute('title', '실시간 저장 중...');
  } else if (state === 'saved') {
    container.setAttribute('title', '실시간 저장 완료');
    bookSaveStatusTimer = setTimeout(() => {
      container.className = 'save-status-dot-container idle';
      container.setAttribute('title', '');
    }, 2500);
  } else if (state === 'error') {
    container.setAttribute('title', '저장 실패');
  } else {
    container.className = 'save-status-dot-container idle';
    container.setAttribute('title', '');
  }
}

async function moveBookOrder(bookId, direction, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  // 현재 필터된 목록 기준으로 순서 변경 대상 찾기
  let filteredBooks = currentBooks;
  if (currentBookFilter !== 'all') {
    filteredBooks = currentBooks.filter(b => b.status === currentBookFilter);
  }

  const currentIdx = filteredBooks.findIndex(b => b.book_id === bookId);
  if (currentIdx === -1) return;

  const targetIdx = currentIdx + direction;
  if (targetIdx < 0 || targetIdx >= filteredBooks.length) return;

  const targetBook = filteredBooks[targetIdx];

  // 전체 currentBooks 배열에서 두 책의 실제 인덱스 찾기
  const globalIdxA = currentBooks.findIndex(b => b.book_id === bookId);
  const globalIdxB = currentBooks.findIndex(b => b.book_id === targetBook.book_id);

  if (globalIdxA === -1 || globalIdxB === -1) return;

  // 순서 스왑
  const temp = currentBooks[globalIdxA];
  currentBooks[globalIdxA] = currentBooks[globalIdxB];
  currentBooks[globalIdxB] = temp;

  // sort_order 갱신
  currentBooks.forEach((b, i) => {
    b.sort_order = i + 1;
  });

  // UI 즉각 업데이트
  renderBookList();

  // Supabase에 순서 비동기 저장
  try {
    const bookIds = currentBooks.map(b => b.book_id);
    await api.updateBookOrder(bookIds);
  } catch (err) {
    console.error('책 순서 DB 저장 오류:', err);
  }
}

function renderBookList() {
  const listEl = document.getElementById('bookList');
  if (!listEl) return;
  
  let filteredBooks = currentBooks;
  if (currentBookFilter !== 'all') {
    filteredBooks = filteredBooks.filter(b => b.status === currentBookFilter);
  }

  if (currentBookSearch) {
    const q = currentBookSearch.toLowerCase();
    filteredBooks = filteredBooks.filter(b => {
      const titleMatch = (b.title || '').toLowerCase().includes(q);
      const bodyMatch = stripRichHtmlForSearch(b.notes || '').toLowerCase().includes(q);
      return titleMatch || bodyMatch;
    });
  }
  
  if (filteredBooks.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:34px 20px; color:var(--text-muted); font-size:13px; font-weight:600;">등록된 독서 기록이 없습니다.</div>';
    return;
  }
  
  listEl.innerHTML = filteredBooks.map((b, idx) => {
    const statusClass = b.status === '읽는 중' ? '읽는_중' : b.status;
    const isFirst = idx === 0;
    const isLast = idx === filteredBooks.length - 1;
    const dateStr = formatShelfItemDate(b.updated_at || b.created_at);
    return `
      <div class="book-item" onclick="openBookNotesModal('${b.book_id}')">
        <div class="report-item-info">
          <div class="book-item-title" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
          <div class="report-item-meta">${dateStr}</div>
        </div>
        <div class="book-item-right">
          <span class="book-item-status ${statusClass}">${escapeHtml(b.status)}</span>
          <div class="book-reorder-group" onclick="event.stopPropagation()">
            <button type="button" class="book-order-btn ${isFirst ? 'disabled' : ''}" 
                    title="위로 이동" 
                    ${isFirst ? 'disabled' : ''} 
                    onclick="moveBookOrder('${b.book_id}', -1, event)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
            <button type="button" class="book-order-btn ${isLast ? 'disabled' : ''}" 
                    title="아래로 이동" 
                    ${isLast ? 'disabled' : ''} 
                    onclick="moveBookOrder('${b.book_id}', 1, event)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function addBook() {
  const input = document.getElementById('bookInput');
  const title = input.value.trim();
  if (!title) {
    input.focus();
    return;
  }
  
  const addBtn = document.getElementById('bookAddBtn');
  addBtn.disabled = true;
  
  const res = await api.addBook(title);
  addBtn.disabled = false;
  
  if (res.success) {
    input.value = '';
    await loadBooks();
    triggerQuestUpdate('book_logged', true);
    if (res.data && res.data.book_id) {
      openBookNotesModal(res.data.book_id);
    }
  } else {
    alert('책 추가에 실패했습니다.');
  }
}

function openBookNotesModal(bookId) {
  selectedBook = currentBooks.find(b => b.book_id === bookId);
  if (!selectedBook) return;
  
  // 보고문서와 동일한 블로그형 리치 에디터로 열기
  if (window.reportStudio && typeof window.reportStudio.openBookEditor === 'function') {
    window.reportStudio.openBookEditor(selectedBook);
    return;
  }
}

function closeBookNotesModal() {
  document.getElementById('bookNotesModalOverlay').classList.remove('show');
  selectedBook = null;
  loadBooks(); // 데이터 갱신
  checkAndUnlockBodyScroll();
}

async function changeBookStatus(bookId, newStatus) {
  const res = await api.updateBookStatus(bookId, newStatus);
  if (res.success) {
    triggerQuestUpdate('book_logged', true);
    if (selectedBook && selectedBook.book_id === bookId) {
      selectedBook.status = newStatus;
      
      const badge = document.getElementById('bookNotesBadge');
      badge.innerText = newStatus;
      badge.className = 'book-notes-badge';
      if (newStatus === '완독') badge.classList.add('완독');
      if (newStatus === '보류') badge.classList.add('보류');
      
      document.querySelectorAll('.status-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.status === newStatus) {
          chip.classList.add('active');
        }
      });
    }
    // 데이터 로드 및 렌더링 갱신
    await loadBooks();
  } else {
    alert('상태 변경에 실패했습니다.');
  }
}

async function saveBookNotesRealtime() {
  if (!selectedBook) return;
  const textarea = document.getElementById('bookNotesTextarea');
  const notes = textarea.value;
  
  const res = await api.updateBookNotes(selectedBook.book_id, notes);
  if (res.success) {
    selectedBook.notes = notes;
    updateBookSaveIndicator('saved');
    triggerQuestUpdate('book_logged', true);
  } else {
    updateBookSaveIndicator('error');
  }
}

async function deleteBook() {
  if (!selectedBook) return;
  if (confirm(`'${selectedBook.title}' 책의 모든 독서 기록을 삭제하시겠습니까?`)) {
    const res = await api.deleteBook(selectedBook.book_id);
    if (res.success) {
      closeBookNotesModal();
    } else {
      alert('기록 삭제에 실패했습니다.');
    }
  }
}

// 업무 매뉴얼 프론트엔드 연동 구현 (블로그형 통합 에디터 연동)
async function loadManuals() {
  currentManuals = await api.getManuals();
  window.currentManuals = currentManuals;
  
  // 만약 매뉴얼 서재 모달이 열려 있다면 목록도 갱신
  if (document.getElementById('manualShelfModalOverlay').classList.contains('show')) {
    renderManualList();
  }
}
window.loadManuals = loadManuals;

function openManualShelfModal() {
  document.getElementById('manualShelfModalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  document.getElementById('manualInput').value = '';

  const searchInput = document.getElementById('manualSearchInput');
  if (searchInput) searchInput.value = '';
  currentManualSearch = '';
  const clearBtn = document.getElementById('manualSearchClear');
  if (clearBtn) clearBtn.classList.remove('visible');

  // 디폴트로 '전체' 탭 활성화
  document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.manual-tab[data-status="all"]').classList.add('active');
  currentManualFilter = 'all';
  loadManuals().then(() => {
    renderManualList();
  });
}

function closeManualShelfModal() {
  document.getElementById('manualShelfModalOverlay').classList.remove('show');
  checkAndUnlockBodyScroll();
}

function renderManualList() {
  const listEl = document.getElementById('manualList');
  if (!listEl) return;
  
  let filteredManuals = currentManuals;
  if (currentManualFilter !== 'all') {
    filteredManuals = filteredManuals.filter(m => m.status === currentManualFilter);
  }

  if (currentManualSearch) {
    const q = currentManualSearch.toLowerCase();
    filteredManuals = filteredManuals.filter(m => {
      const titleMatch = (m.title || '').toLowerCase().includes(q);
      const bodyMatch = stripRichHtmlForSearch(m.notes || '').toLowerCase().includes(q);
      return titleMatch || bodyMatch;
    });
  }
  
  if (filteredManuals.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:34px 20px; color:var(--text-muted); font-size:13px; font-weight:600;">등록된 업무 매뉴얼이 없습니다.</div>';
    return;
  }
  
  listEl.innerHTML = filteredManuals.map(m => {
    const statusClass = m.status === '참고 중' ? '참고_중' : m.status;
    const dateStr = formatShelfItemDate(m.updated_at || m.created_at);
    return `
      <div class="book-item" onclick="openManualNotesModal('${m.manual_id}')">
        <div class="report-item-info">
          <div class="book-item-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</div>
          <div class="report-item-meta">${dateStr}</div>
        </div>
        <div class="book-item-right">
          <span class="book-item-status ${statusClass}">${escapeHtml(m.status)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function addManual() {
  const input = document.getElementById('manualInput');
  const title = input.value.trim();
  if (!title) {
    input.focus();
    return;
  }
  
  const addBtn = document.getElementById('manualAddBtn');
  addBtn.disabled = true;
  
  const res = await api.addManual(title);
  addBtn.disabled = false;
  
  if (res.success) {
    input.value = '';
    await loadManuals();
    if (res.data && res.data.manual_id) {
      openManualNotesModal(res.data.manual_id);
    }
  } else {
    alert('매뉴얼 추가에 실패했습니다.');
  }
}

function openManualNotesModal(manualId) {
  selectedManual = currentManuals.find(m => m.manual_id === manualId);
  if (!selectedManual) return;
  
  // 보고문서와 동일한 블로그형 리치 에디터로 열기
  if (window.reportStudio && typeof window.reportStudio.openManualEditor === 'function') {
    window.reportStudio.openManualEditor(selectedManual);
    return;
  }
}

function closeManualNotesModal() {
  document.getElementById('manualNotesModalOverlay').classList.remove('show');
  selectedManual = null;
  loadManuals(); // 데이터 갱신
  checkAndUnlockBodyScroll();
}

async function changeManualStatus(manualId, newStatus) {
  const res = await api.updateManualStatus(manualId, newStatus);
  if (res.success) {
    if (selectedManual && selectedManual.manual_id === manualId) {
      selectedManual.status = newStatus;
      
      const badge = document.getElementById('manualNotesBadge');
      badge.innerText = newStatus;
      badge.className = 'book-notes-badge';
      if (newStatus === '참고 중') badge.classList.add('참고_중');
      if (newStatus === '완료') badge.classList.add('완독');
      if (newStatus === '보류') badge.classList.add('보류');
      
      document.querySelectorAll('.manual-status-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.status === newStatus) {
          chip.classList.add('active');
        }
      });
    }
    await loadManuals();
  } else {
    alert('상태 변경에 실패했습니다.');
  }
}

async function saveManualNotesRealtime() {
  if (!selectedManual) return;
  const textarea = document.getElementById('manualNotesTextarea');
  const notes = textarea.value;
  
  const statusEl = document.getElementById('manualNotesSaveStatus');
  
  const res = await api.updateManualNotes(selectedManual.manual_id, notes);
  if (res.success) {
    selectedManual.notes = notes;
    statusEl.innerText = '실시간 저장 완료';
    statusEl.style.color = '#10b981';
    statusEl.style.fontWeight = '800';
    setTimeout(() => {
      if (statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    statusEl.innerText = '저장 실패';
    statusEl.style.color = '#ef4444';
    statusEl.style.fontWeight = '800';
  }
}

async function saveManualTitleRealtime() {
  if (!selectedManual) return;
  const titleInput = document.getElementById('manualNotesTitleInput');
  const title = titleInput.value.trim();
  if (!title) return;
  
  const res = await api.updateManualTitle(selectedManual.manual_id, title);
  if (res.success) {
    selectedManual.title = title;
  }
}

async function deleteManual() {
  if (!selectedManual) return;
  if (confirm(`'${selectedManual.title}' 매뉴얼의 모든 기록을 삭제하시겠습니까?`)) {
    const res = await api.deleteManual(selectedManual.manual_id);
    if (res.success) {
      closeManualNotesModal();
    } else {
      alert('기록 삭제에 실패했습니다.');
    }
  }
}

async function saveBookTitleRealtime() {
  if (!selectedBook) return;
  const input = document.getElementById('bookNotesTitleInput');
  const newTitle = input.value.trim();
  if (!newTitle || newTitle === selectedBook.title) return;
  
  updateBookSaveIndicator('saving');
  
  const res = await api.updateBookTitle(selectedBook.book_id, newTitle);
  if (res.success) {
    selectedBook.title = newTitle;
    updateBookSaveIndicator('saved');
    await loadBooks(); // 독서 기록 요약 및 목록 새로고침
  } else {
    updateBookSaveIndicator('error');
    input.value = selectedBook.title; // 오류 발생 시 원래 제목으로 복구
  }
}

/* === 비밀번호 금고 기능 비즈니스 로직 (Supabase 동기화 버전) === */

// 로컬 캐시 변수 (불필요한 비동기 DB 조회를 최소화하기 위한 캐싱 전략)
let cachedMasterPassword = null;
let cachedVaultData = null;

// 기본 마스터 패스워드 로드 (비동기)
async function getMasterPassword() {
  if (cachedMasterPassword !== null) return cachedMasterPassword;
  const pw = await api.getVaultValue('master_password');
  cachedMasterPassword = pw || 'yozm1234';
  return cachedMasterPassword;
}

// 마스터 패스워드 저장 (비동기)
async function saveMasterPassword(newPw) {
  const res = await api.saveVaultValue('master_password', newPw);
  if (res.success) {
    cachedMasterPassword = newPw;
    return true;
  }
  return false;
}

// 금고 데이터 로드 및 복호화 (비동기)
async function loadVaultData() {
  if (cachedVaultData !== null) return cachedVaultData;
  const encoded = await api.getVaultValue('vault_data');
  if (!encoded) {
    cachedVaultData = '';
    return '';
  }
  try {
    cachedVaultData = decodeURIComponent(escape(atob(encoded)));
    return cachedVaultData;
  } catch (e) {
    console.error('Failed to decode vault data', e);
    cachedVaultData = encoded;
    return encoded;
  }
}

// 금고 데이터 저장 및 암호화 (비동기)
async function saveVaultData(text) {
  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    const res = await api.saveVaultValue('vault_data', encoded);
    if (res.success) {
      cachedVaultData = text;
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to encode vault data', e);
    return false;
  }
}

// 인증 모달 열기
function openVaultAuthModal() {
  document.getElementById('vaultPasswordInput').value = '';
  document.getElementById('vaultAuthError').classList.add('hidden');
  document.getElementById('vaultAuthModal').classList.remove('hidden');
  document.getElementById('vaultPasswordInput').focus();
  document.body.style.overflow = 'hidden';
}

// 인증 모달 닫기
function closeVaultAuthModal() {
  document.getElementById('vaultAuthModal').classList.add('hidden');
  checkAndUnlockBodyScroll();
}

// 금고 대시보드 모달 열기
async function openVaultManagerModal() {
  document.getElementById('vaultSearchInput').value = '';
  const data = await loadVaultData();
  document.getElementById('vaultTextAreaInput').value = data;
  await switchVaultTab('view');
  document.getElementById('vaultManagerModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// 금고 대시보드 모달 닫기
function closeVaultManagerModal() {
  document.getElementById('vaultManagerModal').classList.add('hidden');
  document.getElementById('vaultChangePwPanel').classList.add('hidden');
  checkAndUnlockBodyScroll();
}

// 탭 전환
async function switchVaultTab(tab) {
  const tabView = document.getElementById('vaultTabView');
  const tabEdit = document.getElementById('vaultTabEdit');
  const secView = document.getElementById('vaultViewSection');
  const secEdit = document.getElementById('vaultEditSection');
  
  if (tab === 'view') {
    tabView.classList.add('active');
    tabEdit.classList.remove('active');
    secView.classList.remove('hidden');
    secEdit.classList.add('hidden');
    await renderVaultList(document.getElementById('vaultSearchInput').value);
  } else {
    tabEdit.classList.add('active');
    tabView.classList.remove('active');
    secEdit.classList.remove('hidden');
    secView.classList.add('hidden');
    document.getElementById('vaultTextAreaInput').focus();
  }
}

// 금고 데이터 항목(블록) 파서 (줄바꿈 지원)
function parseVaultEntries(rawText) {
  if (!rawText || !rawText.trim()) return [];

  // 줄바꿈 통일 (\r\n -> \n)
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. 빈 줄(공백 포함 2연속 엔터 이상)이 있는지 확인
  const hasEmptyLines = /\n\s*\n/.test(normalized);

  let rawBlocks = [];
  if (hasEmptyLines) {
    // 빈 줄 기준으로 블록 분리
    rawBlocks = normalized.split(/\n\s*\n+/);
  } else {
    // 빈 줄이 전혀 없는 경우:
    const lines = normalized.split('\n');
    const headerRegex = /^(\[.+\]|【.+】|#+\s+|[0-9]+[\.\)]\s+)/;
    const hasHeaders = lines.some(l => headerRegex.test(l.trim()));

    if (hasHeaders) {
      let cur = [];
      for (const line of lines) {
        const tr = line.trim();
        if (headerRegex.test(tr) && cur.length > 0) {
          rawBlocks.push(cur.join('\n'));
          cur = [line];
        } else if (tr.startsWith('---') || tr.startsWith('===')) {
          if (cur.length > 0) rawBlocks.push(cur.join('\n'));
          cur = [];
        } else {
          cur.push(line);
        }
      }
      if (cur.length > 0) rawBlocks.push(cur.join('\n'));
    } else {
      // 빈 줄도 없고 헤더 패턴도 없는 경우:
      // 서비스명과 그에 딸린 비밀번호/아이디 등을 스마트하게 묶어줌
      let cur = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const tr = line.trim();
        if (!tr) continue;

        // 서브라인(비밀번호, 아이디, URL, 키 등) 여부 판별
        const isSubLine = /(:|@|\/|pw|id|비번|비밀번호|패스워드|pin|key|토큰|token|http)/i.test(tr) ||
                          /^[a-zA-Z0-9!@#$%^&*()_+=\-{}[\]:;"'<>,.?/~`]{6,}$/.test(tr);

        if (cur.length > 0 && !isSubLine) {
          rawBlocks.push(cur.join('\n'));
          cur = [line];
        } else {
          cur.push(line);
        }
      }
      if (cur.length > 0) rawBlocks.push(cur.join('\n'));
    }
  }

  const entries = [];
  rawBlocks.forEach((bText, idx) => {
    const trimmed = bText.trim();
    if (!trimmed) return;

    const blockLines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (blockLines.length === 0) return;

    entries.push({
      id: idx,
      fullText: trimmed,
      title: blockLines[0],
      lines: blockLines
    });
  });

  return entries;
}

// 검색어 하이라이트 헬퍼
function highlightVaultSearch(text, query) {
  if (!query || !query.trim()) return escapeHtml(text);
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${q})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="vault-highlight">$1</mark>');
}

// 안전한 HTML 속성 이스케이프
function escapeVaultAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 실시간 목록 렌더링 (줄바꿈이 있는 계정 정보도 완벽히 지원)
async function renderVaultList(searchQuery) {
  const container = document.getElementById('vaultListContainer');
  if (!container) return;

  const rawText = await loadVaultData();
  
  if (!rawText.trim()) {
    container.innerHTML = '<div class="vault-no-data">저장된 비밀번호 정보가 없습니다.<br>"메모장 편집" 탭에서 정보를 추가해 보세요!</div>';
    return;
  }

  const entries = parseVaultEntries(rawText);
  const q = (searchQuery || '').trim().toLowerCase();

  const filtered = q
    ? entries.filter(e => e.fullText.toLowerCase().includes(q))
    : entries;
    
  if (filtered.length === 0) {
    container.innerHTML = `<div class="vault-no-data">'${escapeHtml(searchQuery)}' 검색 결과가 없습니다.</div>`;
    return;
  }

  container.innerHTML = filtered.map(entry => {
    const isMultiLine = entry.lines.length > 1;
    const rawFull = entry.fullText;

    if (!isMultiLine) {
      const line = entry.lines[0];
      return `
        <div class="vault-card single-line">
          <div class="vault-item-text">${highlightVaultSearch(line, searchQuery)}</div>
          <button type="button" class="vault-btn-copy" data-copy="${escapeVaultAttr(line)}" title="복사">복사</button>
        </div>
      `;
    }

    const titleLine = entry.lines[0];
    const subLines = entry.lines.slice(1);

    const subLinesHtml = subLines.map(line => {
      return `
        <div class="vault-card-subline">
          <span class="vault-subline-text">${highlightVaultSearch(line, searchQuery)}</span>
          <button type="button" class="vault-btn-mini-copy" data-copy="${escapeVaultAttr(line)}" title="이 줄 복사">복사</button>
        </div>
      `;
    }).join('');

    return `
      <div class="vault-card">
        <div class="vault-card-header">
          <div class="vault-card-title">${highlightVaultSearch(titleLine, searchQuery)}</div>
          <button type="button" class="vault-btn-copy" data-copy="${escapeVaultAttr(rawFull)}" title="전체 내용 복사">전체 복사</button>
        </div>
        <div class="vault-card-sublines">
          ${subLinesHtml}
        </div>
      </div>
    `;
  }).join('');
}

// 클립보드 복사 실행 함수
async function handleVaultCopy(btn, text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error('Clipboard API not available');
    }
  } catch (err) {
    // 폴백 브라우저 복사 시도
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      alert('복사에 실패했습니다. 직접 복사해 주세요.');
      document.body.removeChild(textarea);
      return;
    }
    document.body.removeChild(textarea);
  }

  const originalText = btn.innerText;
  btn.innerText = '복사 완료!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerText = originalText;
    btn.classList.remove('copied');
  }, 1800);
}

// 온클릭 어트리뷰트 바인딩 호환용 전역 스코프 노출
window.copyVaultItem = function(btn, text) {
  handleVaultCopy(btn, text);
};

// 이벤트 바인딩 셋업
function setupVaultEvents() {
  // 실시간 목록 복사 이벤트 위임 바인딩
  const listContainer = document.getElementById('vaultListContainer');
  if (listContainer && !listContainer.dataset.listenerBound) {
    listContainer.dataset.listenerBound = 'true';
    listContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-copy]');
      if (btn) {
        const text = btn.getAttribute('data-copy');
        if (text !== null) {
          handleVaultCopy(btn, text);
        }
      }
    });
  }
  // 인증 확인 클릭
  document.getElementById('vaultAuthSubmit').onclick = async () => {
    const input = document.getElementById('vaultPasswordInput').value;
    const masterPw = await getMasterPassword();
    if (input === masterPw) {
      closeVaultAuthModal();
      await openVaultManagerModal();
    } else {
      document.getElementById('vaultAuthError').classList.remove('hidden');
    }
  };
  
  // 인증 비밀번호 인풋 엔터키
  document.getElementById('vaultPasswordInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      document.getElementById('vaultAuthSubmit').click();
    }
  };
  
  // 인증 모달 닫기
  document.getElementById('vaultAuthClose').onclick = closeVaultAuthModal;
  document.getElementById('vaultAuthModal').onclick = (e) => {
    if (e.target === document.getElementById('vaultAuthModal')) closeVaultAuthModal();
  };
  
  // 매니저 모달 닫기
  document.getElementById('vaultManagerClose').onclick = closeVaultManagerModal;
  document.getElementById('vaultManagerModal').onclick = (e) => {
    if (e.target === document.getElementById('vaultManagerModal')) closeVaultManagerModal();
  };
  
  // 탭 클릭
  document.getElementById('vaultTabView').onclick = () => switchVaultTab('view');
  document.getElementById('vaultTabEdit').onclick = () => switchVaultTab('edit');
  
  // 실시간 검색 검색어 입력
  document.getElementById('vaultSearchInput').oninput = async function() {
    await renderVaultList(this.value);
  };
  
  // 검색어 초기화
  document.getElementById('vaultSearchClear').onclick = async () => {
    const input = document.getElementById('vaultSearchInput');
    input.value = '';
    input.focus();
    await renderVaultList('');
  };
  
  // 메모장 저장 버튼 클릭
  document.getElementById('vaultSaveBtn').onclick = async () => {
    const text = document.getElementById('vaultTextAreaInput').value;
    const statusEl = document.getElementById('vaultSaveStatus');
    statusEl.innerText = '저장 중...';
    statusEl.style.color = '#94a3b8';
    
    // 캐시 리셋
    cachedVaultData = null;
    
    const success = await saveVaultData(text);
    if (success) {
      statusEl.innerText = '저장 완료!';
      statusEl.style.color = '#10b981';
      setTimeout(() => {
        statusEl.innerText = '';
      }, 2000);
    } else {
      statusEl.innerText = '저장 실패';
      statusEl.style.color = '#f87171';
    }
  };
  
  // 비밀번호 변경 패널 열기
  document.getElementById('vaultChangeMasterPwBtn').onclick = () => {
    document.getElementById('vaultNewPwInput').value = '';
    document.getElementById('vaultNewPwConfirmInput').value = '';
    document.getElementById('vaultChangePwError').classList.add('hidden');
    document.getElementById('vaultChangePwPanel').classList.remove('hidden');
  };
  
  // 비밀번호 변경 패널 닫기
  document.getElementById('vaultCloseChangePwBtn').onclick = () => {
    document.getElementById('vaultChangePwPanel').classList.add('hidden');
  };
  
  // 비밀번호 저장 버튼
  document.getElementById('vaultSaveNewPwBtn').onclick = async () => {
    const newPw = document.getElementById('vaultNewPwInput').value.trim();
    const newPwConfirm = document.getElementById('vaultNewPwConfirmInput').value.trim();
    const errEl = document.getElementById('vaultChangePwError');
    
    if (!newPw) {
      errEl.innerText = '비밀번호를 입력해 주세요.';
      errEl.classList.remove('hidden');
      return;
    }
    
    if (newPw !== newPwConfirm) {
      errEl.innerText = '비밀번호가 일치하지 않습니다.';
      errEl.classList.remove('hidden');
      return;
    }
    
    // 캐시 리셋
    cachedMasterPassword = null;
    
    const success = await saveMasterPassword(newPw);
    if (success) {
      alert('마스터 비밀번호가 성공적으로 변경되었습니다.');
      document.getElementById('vaultChangePwPanel').classList.add('hidden');
    } else {
      alert('마스터 비밀번호 변경에 실패했습니다.');
    }
  };
}

// 선택한 텍스트에 취소선(Unicode Combining Strikethrough)을 적용/해제하는 단축키 등록 함수
function setupStrikethroughShortcut(textarea) {
  if (!textarea) return;
  textarea.addEventListener('keydown', (e) => {
    // 1. 다양한 취소선 단축키 조합 지원 (단축키 충돌 방지)
    // - Slack 스타일: Cmd/Ctrl + Shift + X
    // - Notion 스타일: Cmd/Ctrl + Shift + S
    // - Google Docs 스타일: Alt + Shift + 5
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const isX = e.key.toLowerCase() === 'x' || e.code === 'KeyX' || e.key === 'ㅌ' || e.keyCode === 88;
    const isS = e.key.toLowerCase() === 's' || e.code === 'KeyS' || e.key === 'ㄴ' || e.keyCode === 83;
    const isFive = e.key === '5' || e.code === 'Digit5' || e.keyCode === 53;
    
    const isShortcutPressed = (isCmdOrCtrl && e.shiftKey && (isX || isS)) || (e.altKey && e.shiftKey && isFive);
    
    if (isShortcutPressed) {
      e.preventDefault();
      
      let start = textarea.selectionStart;
      let end = textarea.selectionEnd;
      const text = textarea.value;
      
      let selectedText = '';
      let newSelectedText = '';
      
      // 선택 영역이 없는 경우 기본 예시 텍스트 삽입 후 드래그 선택 처리
      if (start === end) {
        selectedText = '텍스트';
        newSelectedText = '텍̶스̶트̶';
        const originalScrollTop = textarea.scrollTop;
        textarea.value = text.substring(0, start) + newSelectedText + text.substring(end);
        
        textarea.selectionStart = start;
        textarea.selectionEnd = start + newSelectedText.length;
        textarea.scrollTop = originalScrollTop;
        textarea.dispatchEvent(new Event('input'));
        return;
      }
      
      selectedText = text.substring(start, end);
      
      // 유니코드 취소선 문자(\u0336) 포함 여부로 토글 결정
      const hasStrikethrough = selectedText.includes('\u0336');
      
      if (hasStrikethrough) {
        // 취소선 제거
        newSelectedText = selectedText.replace(/\u0336/g, '');
      } else {
        // 취소선 추가 (줄바꿈 문자는 제외하고 각 문자 뒤에 \u0336 추가)
        newSelectedText = Array.from(selectedText).map(char => {
          if (char === '\n' || char === '\r') return char;
          return char + '\u0336';
        }).join('');
      }
      
      const originalScrollTop = textarea.scrollTop;
      textarea.value = text.substring(0, start) + newSelectedText + text.substring(end);
      
      // 선택 영역 및 스크롤 위치 복구
      textarea.selectionStart = start;
      textarea.selectionEnd = start + newSelectedText.length;
      textarea.scrollTop = originalScrollTop;
      
      // 실시간 저장을 유도하기 위해 input 이벤트 발생
      textarea.dispatchEvent(new Event('input'));
    }
  });
}

// 메모, 일기, 신문 실시간 자동 저장 기능 (iOS Safari 안전성 보완)
function setupAutoSaveEvents() {
  const metricInput = document.getElementById('metricInsight');
  const memoInput = document.getElementById('memoInput');
  const diaryInput = document.getElementById('diaryInput');
  const newsInput = document.getElementById('newsInput');
  
  // 취소선 단축키 적용
  setupStrikethroughShortcut(metricInput);
  setupStrikethroughShortcut(memoInput);
  setupStrikethroughShortcut(diaryInput);
  setupStrikethroughShortcut(newsInput);
  
  let metricsAutoSaveTimeout = null;
  let memoAutoSaveTimeout = null;
  let diaryAutoSaveTimeout = null;
  let newsAutoSaveTimeout = null;

  // 0. 일일 지표 메모장 실시간 자동 저장 (디바운스 400ms + 로컬 임시 보관)
  if (metricInput) {
    metricInput.oninput = function() {
      const statusEl = document.getElementById('saveStatus');
      if (statusEl) {
        statusEl.innerText = '입력 중...';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.fontWeight = '700';
      }

      if (currentMetricsDate) {
        try {
          localStorage.setItem(`draft_metrics_${currentMetricsDate}`, metricInput.value);
          localStorage.setItem(`saved_metrics_${currentMetricsDate}`, metricInput.value);
        } catch (e) {}
      }

      clearTimeout(metricsAutoSaveTimeout);
      metricsAutoSaveTimeout = setTimeout(() => {
        saveMetricsRealtime();
      }, 400);
    };

    metricInput.onblur = function() {
      clearTimeout(metricsAutoSaveTimeout);
      saveMetricsRealtime();
    };
  }
  
  // 1. 메모 실시간 자동 저장 (디바운스 400ms + 로컬 임시 보관)
  if (memoInput) {
    memoInput.oninput = function() {
      const statusEl = document.getElementById('memoStatus');
      if (statusEl) {
        statusEl.innerText = '입력 중...';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.fontWeight = '700';
      }

      if (currentMetricsDate) {
        try {
          localStorage.setItem(`draft_memo_${currentMetricsDate}`, memoInput.value);
        } catch (e) {}
      }

      clearTimeout(memoAutoSaveTimeout);
      memoAutoSaveTimeout = setTimeout(() => {
        saveMemoRealtime();
      }, 400);
    };

    memoInput.onblur = function() {
      clearTimeout(memoAutoSaveTimeout);
      saveMemoRealtime();
    };
  }

  // 2. 일기 실시간 자동 저장
  if (diaryInput) {
    diaryInput.oninput = function() {
      const statusEl = document.getElementById('diaryStatus');
      if (statusEl) {
        statusEl.innerText = '입력 중...';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.fontWeight = '700';
      }

      if (currentMetricsDate) {
        try {
          localStorage.setItem(`draft_diary_${currentMetricsDate}`, diaryInput.value);
        } catch (e) {}
      }

      clearTimeout(diaryAutoSaveTimeout);
      diaryAutoSaveTimeout = setTimeout(() => {
        saveDiaryRealtime();
      }, 400);
    };

    diaryInput.onblur = function() {
      clearTimeout(diaryAutoSaveTimeout);
      saveDiaryRealtime();
    };
  }

  // 3. 신문 실시간 자동 저장
  if (newsInput) {
    newsInput.oninput = function() {
      const statusEl = document.getElementById('newsStatus');
      if (statusEl) {
        statusEl.innerText = '입력 중...';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.fontWeight = '700';
      }

      if (currentMetricsDate) {
        try {
          localStorage.setItem(`draft_news_${currentMetricsDate}`, newsInput.value);
        } catch (e) {}
      }

      clearTimeout(newsAutoSaveTimeout);
      newsAutoSaveTimeout = setTimeout(() => {
        saveNewsRealtime();
      }, 400);
    };

    newsInput.onblur = function() {
      clearTimeout(newsAutoSaveTimeout);
      saveNewsRealtime();
    };
  }

  // iOS Safari / 모바일 탭 이탈 및 백그라운드 전환 시 강제 저장 처리
  const forceSaveAllRealtime = () => {
    if (metricsAutoSaveTimeout) {
      clearTimeout(metricsAutoSaveTimeout);
      metricsAutoSaveTimeout = null;
    }
    if (memoAutoSaveTimeout) {
      clearTimeout(memoAutoSaveTimeout);
      memoAutoSaveTimeout = null;
    }
    if (diaryAutoSaveTimeout) {
      clearTimeout(diaryAutoSaveTimeout);
      diaryAutoSaveTimeout = null;
    }
    if (newsAutoSaveTimeout) {
      clearTimeout(newsAutoSaveTimeout);
      newsAutoSaveTimeout = null;
    }
    saveMetricsRealtime();
    saveMemoRealtime();
    saveDiaryRealtime();
    saveNewsRealtime();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      forceSaveAllRealtime();
    }
  });

  window.addEventListener('pagehide', () => {
    forceSaveAllRealtime();
  });
}

async function saveMetricsRealtime() {
  const metricInput = document.getElementById('metricInsight');
  if (!metricInput) return;
  const content = metricInput.value;

  // 아직 아무것도 입력하지 않은 기본 양식 그대로인 경우 자동 저장 및 미션 카운트 생략
  if (isUntouchedMetricsTemplate(content, currentMetricsDate)) {
    return;
  }

  const statusEl = document.getElementById('saveStatus');
  if (statusEl) {
    statusEl.innerText = '저장 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
  }

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`draft_metrics_${currentMetricsDate}`, content);
      localStorage.setItem(`saved_metrics_${currentMetricsDate}`, content);
    } catch (e) {}
  }

  const res = await api.saveDailyMetrics(currentMetricsDate, {
    is_unified_note: true,
    content: content
  });

  if (res && res.success) {
    if (currentMetricsDate) {
      try {
        localStorage.removeItem(`draft_metrics_${currentMetricsDate}`);
      } catch (e) {}
    }
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료';
      statusEl.style.color = '#10b981';
      statusEl.style.fontWeight = '800';
    }
    if (content && content.trim().length > 0) {
      triggerQuestUpdate('metrics_logged', true);
    }
    fetchAllDates();
    setTimeout(() => {
      if (statusEl && statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    if (statusEl) {
      statusEl.innerText = '임시 보관됨';
      statusEl.style.color = '#10b981';
    }
  }
}

async function saveMemoRealtime() {
  const memoInput = document.getElementById('memoInput');
  if (!memoInput) return;
  const content = memoInput.value;
  const statusEl = document.getElementById('memoStatus');
  if (statusEl) {
    statusEl.innerText = '저장 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
  }

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`draft_memo_${currentMetricsDate}`, content);
    } catch (e) {}
  }
  
  const res = await api.saveDailyMemo(currentMetricsDate, content);
  if (res && res.success) {
    if (currentMetricsDate) {
      try {
        localStorage.removeItem(`draft_memo_${currentMetricsDate}`);
      } catch (e) {}
    }
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료';
      statusEl.style.color = '#10b981';
      statusEl.style.fontWeight = '800';
    }
    updateMemoBadge(content);
    triggerQuestUpdate('memo_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl && statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료(임시보관)';
      statusEl.style.color = '#10b981';
    }
  }
}

async function saveDiaryRealtime() {
  const diaryInput = document.getElementById('diaryInput');
  if (!diaryInput) return;
  const content = diaryInput.value;
  const statusEl = document.getElementById('diaryStatus');
  if (statusEl) {
    statusEl.innerText = '저장 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
  }

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`draft_diary_${currentMetricsDate}`, content);
    } catch (e) {}
  }
  
  const res = await api.saveDailyDiary(currentMetricsDate, content);
  if (res && res.success) {
    if (currentMetricsDate) {
      try {
        localStorage.removeItem(`draft_diary_${currentMetricsDate}`);
      } catch (e) {}
    }
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료';
      statusEl.style.color = '#10b981';
      statusEl.style.fontWeight = '800';
    }
    updateBadge('diaryBadge', content);
    triggerQuestUpdate('diary_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl && statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료(임시보관)';
      statusEl.style.color = '#10b981';
    }
  }
}

async function saveNewsRealtime() {
  const newsInput = document.getElementById('newsInput');
  if (!newsInput) return;
  const content = newsInput.value;
  const statusEl = document.getElementById('newsStatus');
  if (statusEl) {
    statusEl.innerText = '저장 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
  }

  if (currentMetricsDate) {
    try {
      localStorage.setItem(`draft_news_${currentMetricsDate}`, content);
    } catch (e) {}
  }
  
  const res = await api.saveDailyNews(currentMetricsDate, content);
  if (res && res.success) {
    if (currentMetricsDate) {
      try {
        localStorage.removeItem(`draft_news_${currentMetricsDate}`);
      } catch (e) {}
    }
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료';
      statusEl.style.color = '#10b981';
      statusEl.style.fontWeight = '800';
    }
    updateBadge('newsBadge', content);
    triggerQuestUpdate('news_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl && statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    if (statusEl) {
      statusEl.innerText = '실시간 저장 완료(임시보관)';
      statusEl.style.color = '#10b981';
    }
  }
}

// ==========================================
// GROW QUEST 게이미피케이션 & 레벨업 시스템 연동
// ==========================================

let userStats = { level: 1, xp: 0 };
let currentQuestStatus = null;

// 1. 게이미피케이션 정보 로드 및 초기화
async function loadGamification() {
  try {
    // 1-1. 사용자 스탯 가져오기
    userStats = await api.getUserStats();
    renderLevelHUD(userStats);

    // 1-2. 오늘 날짜의 미션 현황판 로드
    const todayStr = getTodayString();
    currentQuestStatus = await api.getDailyQuestStatus(todayStr);
    
    // UI 갱신
    renderQuestWidget(currentQuestStatus);
    
    // 미션 자동 체크 및 보상 지급
    await checkAndRewardQuests();
  } catch (e) {
    console.error("loadGamification error:", e);
  }
}

// 2. 레벨 HUD 그리기
function renderLevelHUD(stats) {
  const levelNum = document.getElementById('hudLevelNum');
  const levelBarFill = document.getElementById('hudLevelBar');
  const xpText = document.getElementById('hudXpText');

  if (levelNum) {
    levelNum.innerText = stats.level;
  }
  if (levelBarFill && xpText) {
    const requiredXp = stats.level * 100;
    const progressPercent = Math.min((stats.xp / requiredXp) * 100, 100);
    levelBarFill.style.width = `${progressPercent}%`;
    xpText.innerText = `${stats.xp} / ${requiredXp} XP`;
  }
}

// 3. 일일 미션 현황판 그리기
function renderQuestWidget(quest) {
  if (!quest) return;

  // 퀘스트 1: 할 일 마스터
  const qDesc1 = document.getElementById('questDesc1');
  const qCard1 = document.getElementById('questCard1');
  if (qDesc1 && qCard1) {
    const count = quest.completed_tasks_count || 0;
    qDesc1.innerText = `오늘의 할 일 10개 완료 (${count}/10)`;
    if (quest.quest_1_completed) {
      qCard1.classList.add('completed');
    } else {
      qCard1.classList.remove('completed');
    }
  }

  // 퀘스트 2: 기록 삼위일체
  const qDesc2 = document.getElementById('questDesc2');
  const qCard2 = document.getElementById('questCard2');
  if (qDesc2 && qCard2) {
    let checkCount = 0;
    if (quest.memo_written) checkCount++;
    if (quest.diary_written) checkCount++;
    if (quest.news_written) checkCount++;
    
    qDesc2.innerText = `오늘 메모, 일기, 신문 모두 작성 (${checkCount}/3)`;
    if (quest.quest_2_completed) {
      qCard2.classList.add('completed');
    } else {
      qCard2.classList.remove('completed');
    }
  }

  // 퀘스트 3: 지식의 기록
  const qCard3 = document.getElementById('questCard3');
  const qDesc3 = document.getElementById('questDesc3');
  if (qCard3 && qDesc3) {
    const logged = quest.book_logged ? 1 : 0;
    qDesc3.innerText = `책 등록 또는 독서 메모 작성 (${logged}/1)`;
    if (quest.quest_3_completed) {
      qCard3.classList.add('completed');
    } else {
      qCard3.classList.remove('completed');
    }
  }

  // 퀘스트 4: 오늘 지표 기록
  const qCard4 = document.getElementById('questCard4');
  const qDesc4 = document.getElementById('questDesc4');
  if (qCard4 && qDesc4) {
    const logged = quest.metrics_logged ? 1 : 0;
    qDesc4.innerText = `오늘의 일일 지표 기록 및 저장 (${logged}/1)`;
    if (quest.quest_4_completed) {
      qCard4.classList.add('completed');
    } else {
      qCard4.classList.remove('completed');
    }
  }

  // 올 클리어 배지 표시
  const allClearBadge = document.getElementById('questAllClearBadge');
  if (allClearBadge) {
    if (quest.all_clear_completed) {
      allClearBadge.style.display = 'inline-block';
    } else {
      allClearBadge.style.display = 'none';
    }
  }
}

// 4. 미션 달성 검사 및 보상 지급
async function checkAndRewardQuests() {
  if (!currentQuestStatus) return;

  const todayStr = getTodayString();
  let updated = false;

  // 퀘스트 1: 할 일 마스터 (+10 XP 보너스, 개당 2 XP씩 총 30 XP)
  if ((currentQuestStatus.completed_tasks_count || 0) >= 10 && !currentQuestStatus.quest_1_completed) {
    const res = await api.claimQuestReward(todayStr, 1, 10);
    if (res.success) {
      showToast("✨ 일일 미션 달성: 할 일 마스터! (+10 XP 보너스)");
      userStats = res.stats;
      renderLevelHUD(userStats);
      currentQuestStatus.quest_1_completed = true;
      updated = true;
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
  }

  // 퀘스트 2: 기록 삼위일체 (+20 XP 보너스, 개당 10 XP씩 총 50 XP)
  const isLogsComplete = currentQuestStatus.memo_written && currentQuestStatus.diary_written && currentQuestStatus.news_written;
  if (isLogsComplete && !currentQuestStatus.quest_2_completed) {
    const res = await api.claimQuestReward(todayStr, 2, 20);
    if (res.success) {
      showToast("✨ 일일 미션 달성: 기록 삼위일체! (+20 XP 보너스)");
      userStats = res.stats;
      renderLevelHUD(userStats);
      currentQuestStatus.quest_2_completed = true;
      updated = true;
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
  }

  // 퀘스트 3: 지식의 기록 (+20 XP)
  if (currentQuestStatus.book_logged && !currentQuestStatus.quest_3_completed) {
    const res = await api.claimQuestReward(todayStr, 3, 20);
    if (res.success) {
      showToast("✨ 일일 미션 달성: 지식의 기록! (+20 XP)");
      userStats = res.stats;
      renderLevelHUD(userStats);
      currentQuestStatus.quest_3_completed = true;
      updated = true;
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
  }

  // 퀘스트 4: 오늘 지표 기록 (+20 XP)
  if (currentQuestStatus.metrics_logged && !currentQuestStatus.quest_4_completed) {
    const res = await api.claimQuestReward(todayStr, 4, 20);
    if (res.success) {
      showToast("✨ 일일 미션 달성: 지표 기록 완료! (+20 XP)");
      userStats = res.stats;
      renderLevelHUD(userStats);
      currentQuestStatus.quest_4_completed = true;
      updated = true;
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
  }

  // 올 클리어 보너스 (+50 XP)
  const isAllClear = currentQuestStatus.quest_1_completed && 
                     currentQuestStatus.quest_2_completed && 
                     currentQuestStatus.quest_3_completed && 
                     currentQuestStatus.quest_4_completed;

  if (isAllClear && !currentQuestStatus.all_clear_completed) {
    const res = await api.claimAllClearReward(todayStr, 50);
    if (res.success) {
      showToast("🏆 올 클리어 보너스 획득! (+50 XP)");
      userStats = res.stats;
      renderLevelHUD(userStats);
      currentQuestStatus.all_clear_completed = true;
      updated = true;
      
      triggerConfettiShow();
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
  }

  if (updated) {
    renderQuestWidget(currentQuestStatus);
  }
}

// 5. 미션 진행 상황 업데이트 래퍼 함수
async function triggerQuestUpdate(field, value) {
  const todayStr = getTodayString();
  const res = await api.updateQuestProgress(todayStr, field, value);
  if (res.success && res.data) {
    currentQuestStatus = res.data;
    renderQuestWidget(currentQuestStatus);
    
    if (res.xpAdded > 0) {
      let fieldNameStr = "기록";
      if (field === 'memo_written') fieldNameStr = "메모";
      else if (field === 'diary_written') fieldNameStr = "일기";
      else if (field === 'news_written') fieldNameStr = "신문";
      
      showToast(`✍️ ${fieldNameStr} 작성 완료! +${res.xpAdded} XP`);
      userStats = res.stats;
      renderLevelHUD(userStats);
      if (res.leveledUp) handleLevelUp(userStats.level);
    }
    
    await checkAndRewardQuests();
  }
}

// 6. 완료한 할 일 수 업데이트 래퍼
async function triggerTasksQuestUpdate() {
  const todayStr = getTodayString();
  const res = await api.updateCompletedTasksQuestCount(todayStr);
  if (res.success && res.data) {
    currentQuestStatus = res.data;
    renderQuestWidget(currentQuestStatus);
    await checkAndRewardQuests();
  }
}

// 7. 레벨업 핸들러
function handleLevelUp(newLevel) {
  triggerConfettiShow();
  
  const modal = document.getElementById('levelUpModalOverlay');
  const badge = document.getElementById('levelUpModalBadge');
  const closeBtn = document.getElementById('levelUpModalCloseBtn');
  
  if (modal && badge) {
    badge.innerText = `Lv. ${newLevel}`;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    
    closeBtn.onclick = () => {
      modal.classList.remove('show');
      modal.classList.add('hidden');
    };
  }
}

// 8. 꽃가루 연출
function triggerConfettiShow() {
  if (typeof confetti === 'function') {
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 }
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 }
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
}

// 9. 가볍고 세련된 토스트 메시지 함수
function showToast(message) {
  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '100px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'rgba(15, 23, 42, 0.9)';
  toast.style.color = '#ffffff';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '24px';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '800';
  toast.style.zIndex = '10000';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
  toast.style.border = '1px solid rgba(255,255,255,0.1)';
  toast.style.animation = 'fadeInOut 2.5s ease forwards';
  
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translate(-50%, 20px); }
      15% { opacity: 1; transform: translate(-50%, 0); }
      85% { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -20px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
    style.remove();
  }, 2500);
}

// === 푸시 알림 예약 기능 로직 ===
let activePushTaskId = null;
let notifiedTasksSet = new Set(); // 이번 세션에서 알림이 발송된 taskId 목록 (중복 발송 방지)

// VAPID Public Key (테스트용 Dummy Key - 실제 푸시 전송 시 백엔드 키와 매칭 필요)
const VAPID_PUBLIC_KEY = 'BIb5vOqK_Rz7QvH9sVj_L-8h3iN8JjLhP5X79L3S9F8k2e3c8g9h1i0j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z';

function setupPushModalEvents() {
  const overlay = document.getElementById('pushModalOverlay');
  const closeBtn = document.getElementById('pushModalClose');
  const cancelBtn = document.getElementById('btnDeletePushReservation');
  const saveBtn = document.getElementById('btnSavePushReservation');
  const permBtn = document.getElementById('btnRequestPushPermission');

  closeBtn.onclick = closePushModal;
  cancelBtn.onclick = deletePushReservation;
  saveBtn.onclick = savePushReservation;
  
  overlay.onclick = (e) => {
    if (e.target === overlay) closePushModal();
  };

  permBtn.onclick = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showToast('알림 권한이 허용되었습니다!');
      setupPushNotification();
      // 모달 상태 갱신
      if (activePushTaskId) openPushModal(activePushTaskId);
    } else {
      alert('알림 권한이 거부되었습니다. 기기 설정에서 알림을 허용해주세요.');
    }
  };
}

function openPushModal(taskId) {
  activePushTaskId = taskId;
  const task = loadedTasks.find(t => t.task_id === taskId);
  if (!task) return;

  const overlay = document.getElementById('pushModalOverlay');
  const titleEl = document.getElementById('pushTaskTitle');
  const dateInput = document.getElementById('pushModalDate');
  const timeInput = document.getElementById('pushModalTime');
  const warningEl = document.getElementById('pushPermissionWarning');
  const saveBtn = document.getElementById('btnSavePushReservation');
  const deleteBtn = document.getElementById('btnDeletePushReservation');

  titleEl.innerText = `"${task.description}"`;
  
  // 권한 체크하여 UI 활성/비활성 처리
  if (Notification.permission !== 'granted') {
    warningEl.classList.remove('hidden');
    dateInput.disabled = true;
    timeInput.disabled = true;
    saveBtn.disabled = true;
    deleteBtn.disabled = true;
  } else {
    warningEl.classList.add('hidden');
    dateInput.disabled = false;
    timeInput.disabled = false;
    saveBtn.disabled = false;
    deleteBtn.disabled = false;
  }

  // 기존 예약 시간 매핑
  if (task.push_time) {
    const pTime = new Date(task.push_time);
    
    // 로컬 시간 기준 포맷팅
    const yyyy = pTime.getFullYear();
    const mm = String(pTime.getMonth() + 1).padStart(2, '0');
    const dd = String(pTime.getDate()).padStart(2, '0');
    const hh = String(pTime.getHours()).padStart(2, '0');
    const min = String(pTime.getMinutes()).padStart(2, '0');
    
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    timeInput.value = `${hh}:${min}`;
  } else {
    // 기본값: 오늘 날짜 및 현재 시간 + 10분
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10);
    
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    timeInput.value = `${hh}:${min}`;
  }

  overlay.classList.remove('hidden');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closePushModal() {
  const overlay = document.getElementById('pushModalOverlay');
  overlay.classList.remove('show');
  overlay.classList.add('hidden');
  activePushTaskId = null;
  checkAndUnlockBodyScroll();
}

async function savePushReservation() {
  if (!activePushTaskId) return;

  const dateVal = document.getElementById('pushModalDate').value;
  const timeVal = document.getElementById('pushModalTime').value;

  if (!dateVal || !timeVal) {
    alert('날짜와 시간을 모두 입력해주세요.');
    return;
  }

  const reservationDateTime = new Date(`${dateVal}T${timeVal}:00`);
  if (isNaN(reservationDateTime.getTime())) {
    alert('유효하지 않은 날짜/시간 형식입니다.');
    return;
  }

  if (reservationDateTime < new Date()) {
    alert('현재 시간 이후의 미래 시간으로 예약해 주세요.');
    return;
  }

  const saveBtn = document.getElementById('btnSavePushReservation');
  saveBtn.disabled = true;
  saveBtn.innerText = '저장 중...';

  const res = await api.updateTaskPushTime(activePushTaskId, reservationDateTime.toISOString());
  
  saveBtn.disabled = false;
  saveBtn.innerText = '예약 저장';

  if (res.success) {
    showToast('🔔 푸시 알림 예약이 완료되었습니다!');
    closePushModal();
    loadTasks();
  } else {
    alert('알림 예약 저장에 실패했습니다: ' + res.error);
  }
}

async function deletePushReservation() {
  if (!activePushTaskId) return;

  const deleteBtn = document.getElementById('btnDeletePushReservation');
  deleteBtn.disabled = true;
  deleteBtn.innerText = '해제 중...';

  const res = await api.updateTaskPushTime(activePushTaskId, null);
  
  deleteBtn.disabled = false;
  deleteBtn.innerText = '알림 해제';

  if (res.success) {
    showToast('🔕 예약된 푸시 알림을 해제했습니다.');
    closePushModal();
    loadTasks();
  } else {
    alert('알림 해제에 실패했습니다: ' + res.error);
  }
}

// === 브라우저 알림 권한 획득 & PWA 구독 로직 ===
async function setupPushNotification() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('이 브라우저는 푸시 알림 기능을 지원하지 않습니다.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // 이미 알림 권한이 허용된 상태라면 구독 진행
    if (Notification.permission === 'granted') {
      await subscribeUserToPush(registration);
    }
  } catch (err) {
    console.error('Push Notification setup failed:', err);
  }
}

async function subscribeUserToPush(registration) {
  try {
    // 1. 기존 구독 확인
    let subscription = await registration.pushManager.getSubscription();
    
    // 2. 없으면 신규 구독 신청
    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
      console.log('User subscribed to push:', subscription);
    }

    // 3. Supabase에 구독 정보 저장
    if (subscription) {
      await api.savePushSubscription(subscription.toJSON());
    }
  } catch (e) {
    console.warn('푸시 알림 서비스 구독에 실패했습니다. (로컬 타이머는 정상 작동합니다.)', e);
  }
}

// Helper: VAPID Key 변환용
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// === 실시간 로컬 알림 스케줄러 (하이브리드 방식) ===
function startLocalNotificationScheduler() {
  // 10초마다 체크하여 알림 대상이 있는지 모니터링
  setInterval(async () => {
    const now = new Date();
    
    for (const t of loadedTasks) {
      if (t.push_time && t.status === '진행중' && !notifiedTasksSet.has(t.task_id)) {
        const pTime = new Date(t.push_time);
        
        // 현재 시간이 예약 시간보다 같거나 지난 경우 알림 트리거
        if (now >= pTime) {
          notifiedTasksSet.add(t.task_id);
          
          // 1. 브라우저 로컬 알림 실행
          triggerLocalNotification(t.description);

          // 2. 알림 완료 후 중복 방지를 위해 DB의 push_time을 null로 리셋
          await api.updateTaskPushTime(t.task_id, null);
          
          // 3. 할일 목록 리프레시
          loadTasks();
        }
      }
    }
  }, 10000);
}

function triggerLocalNotification(bodyText) {
  if (Notification.permission === 'granted') {
    const options = {
      body: bodyText,
      icon: './images/logo.png',
      badge: './images/logo.png',
      vibrate: [100, 50, 100],
      requireInteraction: true // 사용자가 닫을 때까지 배너 유지
    };
    
    // 서비스 워커를 활용해 알림을 띄우는 것이 백그라운드에서도 원활하게 작동함
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification('Grow Quest 알림', options);
    }).catch(() => {
      // 서비스 워커 불능 시 일반 브라우저 알림 백업
      new Notification('Grow Quest 알림', options);
    });
  }
}

// === SKILL.md 추출 모달 및 마크다운 변환 로직 ===
function setupSkillExportEvents() {
  const overlay = document.getElementById('skillExportModalOverlay');
  const closeBtn = document.getElementById('skillExportModalClose');
  const startInput = document.getElementById('skillExportStartDate');
  const endInput = document.getElementById('skillExportEndDate');
  const toggleAllBtn = document.getElementById('btnToggleAllSkillChecks');
  const generateBtn = document.getElementById('btnGenerateSkillMd');
  const copyBtn = document.getElementById('btnCopySkillMd');
  const downloadBtn = document.getElementById('btnDownloadSkillMd');
  const previewTextarea = document.getElementById('skillExportPreviewTextarea');
  const statsText = document.getElementById('skillExportStatsText');

  if (closeBtn) {
    closeBtn.onclick = closeSkillExportModal;
  }
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) closeSkillExportModal();
    };
  }

  // 빠른 기간 선택 버튼
  document.querySelectorAll('.skill-quick-range-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.skill-quick-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days, 10) || 30;
      const today = new Date();
      const startDate = new Date(today.getTime() - (days - 1) * 86400000);
      if (startInput) startInput.value = formatDateString(startDate);
      if (endInput) endInput.value = formatDateString(today);
    };
  });

  // 전체 선택 / 해제 토글
  if (toggleAllBtn) {
    toggleAllBtn.onclick = () => {
      const checkIds = [
        'chkExportMetrics',
        'chkExportTasks',
        'chkExportMemos',
        'chkExportReports',
        'chkExportManuals',
        'chkExportIdeas',
        'chkExportBooks',
        'chkExportDiaries',
        'chkExportNews'
      ];
      const checkboxes = checkIds.map(id => document.getElementById(id)).filter(Boolean);
      const allChecked = checkboxes.every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
      });
    };
  }

  // 미리보기 텍스트 직접 수정 시 글자 수 실시간 반영
  if (previewTextarea && statsText) {
    previewTextarea.addEventListener('input', () => {
      const len = previewTextarea.value.length;
      statsText.textContent = `약 ${len.toLocaleString()}자`;
    });
  }

  if (generateBtn) {
    generateBtn.onclick = handleGenerateSkillMd;
  }

  if (copyBtn) {
    copyBtn.onclick = async () => {
      if (!previewTextarea || !previewTextarea.value.trim()) {
        alert('먼저 SKILL.md 내용을 생성해 주세요.');
        return;
      }
      await handleVaultCopy(copyBtn, previewTextarea.value);
    };
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      if (!previewTextarea || !previewTextarea.value.trim()) {
        alert('먼저 SKILL.md 내용을 생성해 주세요.');
        return;
      }
      const blob = new Blob([previewTextarea.value], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SKILL.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('SKILL.md 파일이 다운로드되었습니다.');
    };
  }
}

function openSkillExportModal() {
  const overlay = document.getElementById('skillExportModalOverlay');
  const startInput = document.getElementById('skillExportStartDate');
  const endInput = document.getElementById('skillExportEndDate');
  if (!overlay) return;

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  if (startInput && !startInput.value) startInput.value = formatDateString(monthAgo);
  if (endInput && !endInput.value) endInput.value = formatDateString(today);

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSkillExportModal() {
  const overlay = document.getElementById('skillExportModalOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  checkAndUnlockBodyScroll();
}

window.openSkillExportModal = openSkillExportModal;
window.closeSkillExportModal = closeSkillExportModal;

// 리치 에디터 HTML(표, 목록, 콜아웃, 체크리스트 등)을 깔끔한 마크다운으로 변환 (이미지 바이너리 제외)
function convertHtmlToMarkdown(rawContent) {
  if (!rawContent) return '';
  const str = String(rawContent).trim();
  if (!str) return '';

  // HTML 태그가 없는 일반 텍스트인 경우 그대로 반환
  const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(str);
  if (!hasHtmlTag) {
    return str.replace(/\u0336/g, '');
  }

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = str;

  // 불필요한 UI 컨트롤 핸들러 제거
  tempDiv.querySelectorAll('.table-col-resizer, .table-row-resizer, .report-image-delete-btn').forEach(el => el.remove());

  function serializeInline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.replace(/\u00a0/g, ' ').replace(/\u0336/g, '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'img') return '';

    const inner = Array.from(node.childNodes).map(serializeInline).join('');
    if (!inner.trim() && tag !== 'br') return inner;

    if (tag === 'b' || tag === 'strong') {
      return `**${inner.trim()}** `;
    }
    if (tag === 'i' || tag === 'em') {
      return `*${inner.trim()}* `;
    }
    if (tag === 's' || tag === 'strike' || tag === 'del') {
      return `~~${inner.trim()}~~ `;
    }
    return inner;
  }

  function convertTableElement(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const matrix = rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      return cells.map(cell => {
        const text = Array.from(cell.childNodes)
          .map(serializeInline)
          .join('')
          .replace(/\r?\n+/g, ' / ')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim();
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
        let suffix = '';
        if (colspan > 1 || rowspan > 1) {
          suffix = ` (${colspan > 1 ? `가로병합:${colspan}` : ''}${colspan > 1 && rowspan > 1 ? ',' : ''}${rowspan > 1 ? `세로병합:${rowspan}` : ''})`;
        }
        return (text || '-') + suffix;
      });
    });

    const maxCols = Math.max(...matrix.map(r => r.length), 1);
    const normalized = matrix.map(r => {
      const copy = [...r];
      while (copy.length < maxCols) copy.push('-');
      return copy;
    });

    const mdLines = [];
    const headerRow = normalized[0];
    mdLines.push(`| ${headerRow.join(' | ')} |`);
    mdLines.push(`| ${headerRow.map(() => '---').join(' | ')} |`);
    for (let i = 1; i < normalized.length; i++) {
      mdLines.push(`| ${normalized[i].join(' | ')} |`);
    }
    return '\n' + mdLines.join('\n') + '\n';
  }

  function serializeBlock(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue.replace(/\u00a0/g, ' ').replace(/\u0336/g, '').trim();
      return t ? t + '\n' : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    if (node.classList.contains('report-image-block')) {
      const captionEl = node.querySelector('.report-image-caption');
      const cap = captionEl ? captionEl.textContent.trim() : '';
      return cap ? `[첨부 이미지 설명: ${cap}]\n` : '';
    }

    if (node.classList.contains('report-table-wrapper')) {
      const tbl = node.querySelector('table');
      return tbl ? convertTableElement(tbl) : '';
    }
    if (tag === 'table') {
      return convertTableElement(node);
    }

    if (node.classList.contains('report-check-item')) {
      const cb = node.querySelector('input[type="checkbox"]');
      const checked = cb && (cb.checked || cb.hasAttribute('checked'));
      const txtEl = node.querySelector('.report-check-text');
      const txt = txtEl ? txtEl.textContent.trim() : node.textContent.trim();
      return `- [${checked ? 'x' : ' '}] ${txt}\n`;
    }

    if (node.classList.contains('report-callout-box') || tag === 'blockquote') {
      const rawLines = Array.from(node.childNodes)
        .map(serializeInline)
        .join('')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      if (rawLines.length === 0) return '';
      return rawLines.map(l => `> ${l}`).join('\n') + '\n\n';
    }

    if (tag === 'h1') {
      return `\n#### ${node.textContent.trim()}\n`;
    }
    if (tag === 'h2') {
      return `\n##### ${node.textContent.trim()}\n`;
    }
    if (tag === 'h3') {
      return `\n###### ${node.textContent.trim()}\n`;
    }

    if (tag === 'hr') {
      return `\n---\n`;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.children).filter(c => c.tagName && c.tagName.toLowerCase() === 'li');
      const lines = items.map((li, idx) => {
        const prefix = tag === 'ol' ? `${idx + 1}. ` : '- ';
        const itemText = Array.from(li.childNodes).map(serializeInline).join('').trim();
        const subLines = itemText.split('\n').map((sl, sIdx) => (sIdx === 0 ? `${prefix}${sl.trim()}` : `  ${sl.trim()}`));
        return subLines.join('\n');
      });
      return lines.join('\n') + '\n\n';
    }

    if (tag === 'p' || tag === 'div') {
      // 내부에 블록 요소가 중첩된 경우 재귀 처리
      const hasBlockChildren = Array.from(node.children).some(ch =>
        ['div', 'p', 'table', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'hr'].includes(ch.tagName.toLowerCase())
      );
      if (hasBlockChildren) {
        return Array.from(node.childNodes).map(serializeBlock).join('');
      }
      const inlineText = Array.from(node.childNodes).map(serializeInline).join('').trim();
      return inlineText ? inlineText + '\n' : '';
    }

    const fallback = Array.from(node.childNodes).map(serializeInline).join('').trim();
    return fallback ? fallback + '\n' : '';
  }

  const output = Array.from(tempDiv.childNodes).map(serializeBlock).join('');
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

async function handleGenerateSkillMd() {
  const startInput = document.getElementById('skillExportStartDate');
  const endInput = document.getElementById('skillExportEndDate');
  const generateBtn = document.getElementById('btnGenerateSkillMd');
  const previewWrap = document.getElementById('skillExportPreviewWrap');
  const previewTextarea = document.getElementById('skillExportPreviewTextarea');
  const statsText = document.getElementById('skillExportStatsText');

  const startDateStr = startInput ? startInput.value : '';
  const endDateStr = endInput ? endInput.value : '';

  if (!startDateStr || !endDateStr) {
    alert('추출할 시작일과 종료일을 모두 선택해 주세요.');
    return;
  }
  if (startDateStr > endDateStr) {
    alert('시작일은 종료일보다 이전이어야 합니다.');
    return;
  }

  const options = {
    includeMetrics: document.getElementById('chkExportMetrics')?.checked ?? true,
    includeTasks: document.getElementById('chkExportTasks')?.checked ?? true,
    includeMemos: document.getElementById('chkExportMemos')?.checked ?? true,
    includeReports: document.getElementById('chkExportReports')?.checked ?? true,
    includeManuals: document.getElementById('chkExportManuals')?.checked ?? true,
    includeIdeas: document.getElementById('chkExportIdeas')?.checked ?? true,
    includeBooks: document.getElementById('chkExportBooks')?.checked ?? false,
    includeDiaries: document.getElementById('chkExportDiaries')?.checked ?? false,
    includeNews: document.getElementById('chkExportNews')?.checked ?? false,
    includeAllDocsRegardlessOfDate: document.getElementById('chkExportAllDocsRegardlessOfDate')?.checked ?? true
  };

  if (
    !options.includeMetrics &&
    !options.includeTasks &&
    !options.includeMemos &&
    !options.includeReports &&
    !options.includeManuals &&
    !options.includeIdeas &&
    !options.includeBooks &&
    !options.includeDiaries &&
    !options.includeNews
  ) {
    alert('최소 1개 이상의 포함 항목을 선택해 주세요.');
    return;
  }

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerText = '데이터 조회 및 SKILL.md 생성 중...';
  }

  try {
    const data = await api.getExportDataByDateRange(startDateStr, endDateStr, options);
    const mdContent = buildSkillMarkdownDocument(startDateStr, endDateStr, options, data);

    if (previewWrap) previewWrap.classList.remove('hidden');
    if (previewTextarea) {
      previewTextarea.value = mdContent;
      previewTextarea.scrollTop = 0;
    }
    if (statsText) {
      statsText.textContent = `약 ${mdContent.length.toLocaleString()}자`;
    }
  } catch (err) {
    console.error('handleGenerateSkillMd error:', err);
    alert('SKILL.md 생성 중 오류가 발생했습니다.');
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.innerText = 'SKILL.md 내용 생성 및 미리보기';
    }
  }
}

function buildSkillMarkdownDocument(startDateStr, endDateStr, options, data) {
  const lines = [];

  // 1. YAML Frontmatter & AI 지침 (클로드 스킬 및 챗GPT/클로드 프로젝트 통합 호환)
  lines.push('---');
  lines.push('name: work-context-and-metrics-partner');
  lines.push(`description: ${startDateStr}부터 ${endDateStr}까지의 실제 업무 지표, 할 일, 메모, 보고문서, 업무 매뉴얼을 기반으로 데이터 분석, 회고, 의사결정 및 보고서 작성을 수행하는 전용 업무 파트너 스킬입니다.`);
  lines.push('---');
  lines.push('');
  lines.push('# 업무 맥락 및 데이터 기반 AI 파트너 지침 (SKILL.md)');
  lines.push('');
  lines.push('## 1. 역할 및 목적');
  lines.push(`당신은 사용자의 실제 업무 기록(${startDateStr} ~ ${endDateStr})과 업무 매뉴얼, 보고문서, 일일 지표 흐름을 완벽히 숙지한 전략 및 실무 파트너입니다.`);
  lines.push('사용자가 질문하거나 보고서·기획안·회고·SQL 지표 해석을 요청할 때, 일반적인 추상적 답변을 지양하고 아래 수록된 **실제 수치, 업무 히스토리, 매뉴얼 기준**을 근거로 답변하세요.');
  lines.push('');
  lines.push('## 2. 필수 응답 규칙');
  lines.push('- **이모지 절대 사용 금지**: 답변, 제목, 표, 목록 등 어디에도 이모지(Emoji)를 절대 사용하지 마세요.');
  lines.push('- **한국어 전용 및 명확한 설명**: 항상 한국어로만 답변하며, 친절하고 구조화된 비즈니스 문체를 유지하세요.');
  lines.push('- **데이터 및 사실 기반 추론**: 일일 지표(계약, DB 유입, 방문, 플래너 실적 등)와 할 일/메모의 시계열 흐름을 교차 확인하여 원인과 인사이트를 도출하세요.');
  lines.push('- **업무 매뉴얼 및 보고문서 기준 준수**: 새로운 보고서나 매뉴얼 초안을 작성할 때는 아래 수록된 기존 보고문서와 업무 매뉴얼의 용어, 구조, 판단 기준을 일관되게 따르세요.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`# 수록 데이터 요약 (${startDateStr} ~ ${endDateStr})`);
  lines.push('');

  // 2. 목표 및 실행 아이디어
  if (options.includeIdeas && (data.goal || (data.goalExecutions && data.goalExecutions.length > 0))) {
    lines.push('## [목표 및 핵심 실행 아이디어]');
    if (data.goal && data.goal.text) {
      lines.push(`- **핵심 목표**: ${data.goal.text.trim()}`);
    }
    if (Array.isArray(data.goalExecutions) && data.goalExecutions.length > 0) {
      lines.push('- **세부 실행 항목**:');
      data.goalExecutions.forEach(ex => {
        const statusMark = ex.is_completed ? '[완료]' : '[진행중]';
        lines.push(`  - ${statusMark} ${(ex.text || '').trim()}`);
      });
    }
    lines.push('');
  }

  // 3. 업무 매뉴얼
  if (options.includeManuals && Array.isArray(data.manuals) && data.manuals.length > 0) {
    lines.push('## [업무 매뉴얼 (표준 업무 기준)]');
    lines.push('');
    data.manuals.forEach((manual, idx) => {
      const title = (manual.title || '제목 없음').trim();
      const status = manual.status ? ` (${manual.status})` : '';
      const bodyMd = convertHtmlToMarkdown(manual.notes || '');
      lines.push(`### ${idx + 1}. ${title}${status}`);
      if (bodyMd) {
        lines.push(bodyMd);
      } else {
        lines.push('(내용 없음)');
      }
      lines.push('');
    });
  }

  // 4. 보고문서
  if (options.includeReports && Array.isArray(data.reports) && data.reports.length > 0) {
    lines.push('## [보고문서 (기획·분석·보고 자료)]');
    lines.push('');
    data.reports.forEach((report, idx) => {
      const title = (report.title || '제목 없음').trim();
      const status = report.status ? ` (${report.status})` : '';
      const updatedDate = report.updated_at ? ` | 최종 수정: ${report.updated_at.slice(0, 10)}` : '';
      const bodyMd = convertHtmlToMarkdown(report.content || '');
      lines.push(`### ${idx + 1}. ${title}${status}${updatedDate}`);
      if (bodyMd) {
        lines.push(bodyMd);
      } else {
        lines.push('(내용 없음)');
      }
      lines.push('');
    });
  }

  // 5. 독서 기록 (선택 시)
  if (options.includeBooks && Array.isArray(data.books) && data.books.length > 0) {
    lines.push('## [독서 기록 및 인사이트 노트]');
    lines.push('');
    data.books.forEach((book, idx) => {
      const title = (book.title || '제목 없음').trim();
      const status = book.status ? ` (${book.status})` : '';
      const bodyMd = convertHtmlToMarkdown(book.notes || '');
      if (!bodyMd && status === ' (읽는 중)') return;
      lines.push(`### ${idx + 1}. ${title}${status}`);
      if (bodyMd) {
        lines.push(bodyMd);
      }
      lines.push('');
    });
  }

  // 6. 일자별 통합 타임라인 (일일 지표 + 할 일 + 일일 메모 + 일기 + 신문)
  const dateMap = new Map();
  const ensureDateBucket = (dStr) => {
    if (!dStr) return null;
    if (!dateMap.has(dStr)) {
      dateMap.set(dStr, {
        metricsText: '',
        tasks: [],
        memo: '',
        diary: '',
        news: ''
      });
    }
    return dateMap.get(dStr);
  };

  if (options.includeMetrics && Array.isArray(data.metrics)) {
    data.metrics.forEach(m => {
      const text = buildUnifiedMetricsText(m);
      if (text && text.trim() && !isUntouchedMetricsTemplate(text, m.date)) {
        const b = ensureDateBucket(m.date);
        if (b) b.metricsText = text.trim();
      }
    });
  }

  if (options.includeTasks && Array.isArray(data.tasks)) {
    data.tasks.forEach(t => {
      if (!t.description || !t.description.trim()) return;
      let dateKey = '';
      if (t.created_at) {
        const dt = new Date(t.created_at);
        if (!isNaN(dt.getTime())) {
          dateKey = formatDateString(dt);
        }
      }
      if (!dateKey && t.due_date) {
        dateKey = t.due_date.slice(0, 10);
      }
      const b = ensureDateBucket(dateKey);
      if (b) b.tasks.push(t);
    });
  }

  if (options.includeMemos && Array.isArray(data.memos)) {
    data.memos.forEach(m => {
      const clean = (m.content || '').replace(/\u0336/g, '').trim();
      if (clean) {
        const b = ensureDateBucket(m.date);
        if (b) b.memo = clean;
      }
    });
  }

  if (options.includeDiaries && Array.isArray(data.diaries)) {
    data.diaries.forEach(d => {
      const clean = (d.content || '').replace(/\u0336/g, '').trim();
      if (clean) {
        const b = ensureDateBucket(d.date);
        if (b) b.diary = clean;
      }
    });
  }

  if (options.includeNews && Array.isArray(data.news)) {
    data.news.forEach(n => {
      const clean = (n.content || '').replace(/\u0336/g, '').trim();
      if (clean) {
        const b = ensureDateBucket(n.date);
        if (b) b.news = clean;
      }
    });
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  if (sortedDates.length > 0) {
    lines.push(`## [일자별 업무·지표·메모 타임라인 (${startDateStr} ~ ${endDateStr})]`);
    lines.push('');

    sortedDates.forEach(dStr => {
      const bucket = dateMap.get(dStr);
      if (!bucket) return;
      const hasAny =
        bucket.metricsText ||
        bucket.tasks.length > 0 ||
        bucket.memo ||
        bucket.diary ||
        bucket.news;
      if (!hasAny) return;

      lines.push(`### ${formatDateKorean(dStr)} (${dStr})`);

      if (bucket.metricsText) {
        lines.push('#### [일일 지표]');
        lines.push(bucket.metricsText);
        lines.push('');
      }

      if (bucket.tasks.length > 0) {
        lines.push('#### [할 일 내역]');
        bucket.tasks.forEach(t => {
          const isDone = t.status === '완료';
          const desc = (t.description || '').replace(/\u0336/g, '').replace(/\r?\n/g, ' ').trim();
          const dueInfo = t.due_date && t.due_date.slice(0, 10) !== dStr ? ` (기한: ${t.due_date.slice(0, 10)})` : '';
          lines.push(`- [${isDone ? 'x' : ' '}] ${desc}${dueInfo}`);
        });
        lines.push('');
      }

      if (bucket.memo) {
        lines.push('#### [일일 메모]');
        lines.push(bucket.memo);
        lines.push('');
      }

      if (bucket.diary) {
        lines.push('#### [일기]');
        lines.push(bucket.diary);
        lines.push('');
      }

      if (bucket.news) {
        lines.push('#### [신문 스크랩]');
        lines.push(bucket.news);
        lines.push('');
      }
    });
  }

  return lines.join('\n').trim() + '\n';
}
