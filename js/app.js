let currentPeriod = 'today', selectedDate = null, currentMetricsDate = null;
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;
let loadedTasks = [];

let calDisplayDate = new Date();
let memoDatesSet = new Set();
let diaryDatesSet = new Set();
let newsDatesSet = new Set();

let currentGoal = null;
let currentBooks = [];
let selectedBook = null;
let currentBookFilter = 'all';

const THEMES = {
  0: { primary: '#9f383a', dark: '#6d2224', light: '#faf0f0', header: 'linear-gradient(135deg, #b55052 0%, #6d2224 100%)' }, // 일: Lava Falls (용암 폭포 레드 - 열정적인 레드)
  1: { primary: '#f5b800', dark: '#5c3e00', light: '#fffdf0', header: 'linear-gradient(135deg, #ffe543 0%, #f5b800 100%)' }, // 월: Lemon & Mango (레몬 망고 옐로우 - 맑고 상큼한 팬톤 옐로우 에너지)
  2: { primary: '#e88c67', dark: '#a45634', light: '#fdf7f4', header: 'linear-gradient(135deg, #f5a788 0%, #a45634 100%)' }, // 화: Muskmelon (머스크멜론 오렌지 - 기분 좋은 생기)
  3: { primary: '#4a7a96', dark: '#2f5268', light: '#eef3f6', header: 'linear-gradient(135deg, #6c9bc0 0%, #2f5268 100%)' }, // 수: Marina (마리나 블루 - 한 주의 절반을 환기하는 평온한 블루)
  4: { primary: '#2b8285', dark: '#1a5658', light: '#ecf6f6', header: 'linear-gradient(135deg, #44a2a5 0%, #1a5658 100%)' }, // 목: Alexandrite (알렉산드라이트 틸 - 고급스럽고 깊이 있는 청록색)
  5: { primary: '#d1af4e', dark: '#91772f', light: '#faf8ee', header: 'linear-gradient(135deg, #e5c66b 0%, #91772f 100%)' }, // 금: Acacia (아카시아 옐로우 골드 - 주말을 앞둔 긍정적인 에너지)
  6: { primary: '#8a456c', dark: '#5c2847', light: '#faf3f6', header: 'linear-gradient(135deg, #a55e87 0%, #5c2847 100%)' }  // 토: Amaranth (아마란스 딥 퍼플 - 주말 밤의 매혹적인 와인 퍼플)
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

function formatDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
    let input = prompt('접근 권한이 필요합니다. 4자리 비밀번호를 입력하세요:');
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
  
  document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, {passive: true});
  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, {passive: true});
  
  document.getElementById('searchToggleBtn').onclick = () => toggleHeader('search');
  document.getElementById('memoToggleBtn').onclick = () => toggleHeader('memo');
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
  
  document.querySelectorAll('.period-tab').forEach(tab => {
    tab.onclick = function() {
      closeAllHeaders();
      document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('calendarBtn').classList.remove('active');
      document.getElementById('selectedDateLabel').style.display = 'none';
      this.classList.add('active');
      
      currentPeriod = this.dataset.period;
      
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
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // 독서 메모 저장 리스너 (실시간 포커스 아웃 및 디바운싱 저장)
  const bookNotesArea = document.getElementById('bookNotesTextarea');
  let bookNotesSaveTimeout = null;
  bookNotesArea.oninput = function() {
    if (!selectedBook) return;
    const statusEl = document.getElementById('bookNotesSaveStatus');
    statusEl.innerText = '입력 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';

    clearTimeout(bookNotesSaveTimeout);
    bookNotesSaveTimeout = setTimeout(() => {
      saveBookNotesRealtime();
    }, 1000);
  };
  bookNotesArea.onblur = function() {
    saveBookNotesRealtime();
  };

  document.getElementById('bookNotesDeleteBtn').onclick = deleteBook;

  // === 회사 비밀번호 금고(비밀 메모장) 기능 바인딩 ===
  setupVaultEvents();
  document.getElementById('todoListHeaderTitle').onclick = openVaultAuthModal;

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
});

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
  const [memoDates, diaryDates, newsDates] = await Promise.all([
    api.getAllMemoDates(),
    api.getAllDiaryDates(),
    api.getAllNewsDates()
  ]);
  memoDatesSet = new Set(memoDates);
  diaryDatesSet = new Set(diaryDates);
  newsDatesSet = new Set(newsDates);
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
    
    if(hasMemo || hasDiary || hasNews) {
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
      div.appendChild(dotsRow);
    }
    
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
  document.getElementById('selectedDateLabel').style.display = 'inline-block';
  
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
  ['searchWrapper','memoWrapper','diaryWrapper','newsWrapper','customCalendarWrapper'].forEach(id => document.getElementById(id).classList.remove('show'));
  ['searchToggleBtn','memoToggleBtn','diaryToggleBtn','newsToggleBtn'].forEach(id => document.getElementById(id).classList.remove('active'));

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
  label.style.display = 'inline-block';
}

function handleSwipeGesture() {
  if(document.getElementById('searchWrapper').classList.contains('show') || 
     document.getElementById('memoWrapper').classList.contains('show') ||
     document.getElementById('diaryWrapper').classList.contains('show') ||
     document.getElementById('newsWrapper').classList.contains('show') ||
     document.getElementById('customCalendarWrapper').classList.contains('show')) return;
  
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  
  if(Math.abs(diffY) > Math.abs(diffX)) return;
  
  if(diffX > 80) changeDate(-1);
  else if(diffX < -80) changeDate(1);
}

function changeDate(offset) {
  const d = new Date(currentMetricsDate);
  d.setDate(d.getDate() + offset);
  const newDateStr = formatDateString(d);
  selectDateFromCalendar(newDateStr);
}

async function refreshAllData() {
  console.log('refreshAllData called');
  document.getElementById('metricsDate').textContent = formatDateKorean(currentMetricsDate);
  document.getElementById('inputDueDate').value = currentMetricsDate;
  
  // 월요일 여부 판별하여 주말 건수 입력란 표시 제어
  const isMon = getDayOfWeek(currentMetricsDate) === 1;
  const mondayItems = ['satFestaDressItem', 'sunFestaDressItem', 'satWeddingItem', 'sunWeddingItem'];
  
  mondayItems.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (isMon) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
  
  console.log('calling api.getDailyMetrics');
  const m = await api.getDailyMetrics(currentMetricsDate);
  console.log('api.getDailyMetrics resolved', m);
  if(m) {
    document.getElementById('contractsCount').value = m.contracts_count !== null && m.contracts_count !== undefined ? m.contracts_count : '';
    document.getElementById('cumulativeContractsCount').value = m.cumulative_contracts_count !== null && m.cumulative_contracts_count !== undefined ? m.cumulative_contracts_count : '';
    document.getElementById('dbCount').value = m.db_count !== null && m.db_count !== undefined ? m.db_count : '';
    document.getElementById('cumulativeDbCount').value = m.cumulative_db_count !== null && m.cumulative_db_count !== undefined ? m.cumulative_db_count : '';
    document.getElementById('saturdayVisitors').value = m.saturday_visitors !== null && m.saturday_visitors !== undefined ? m.saturday_visitors : '';
    document.getElementById('sundayVisitors').value = m.sunday_visitors !== null && m.sunday_visitors !== undefined ? m.sunday_visitors : '';
    
    document.getElementById('saturdayFestaDressOrders').value = m.saturday_festa_dress_orders !== null && m.saturday_festa_dress_orders !== undefined ? m.saturday_festa_dress_orders : '';
    document.getElementById('sundayFestaDressOrders').value = m.sunday_festa_dress_orders !== null && m.sunday_festa_dress_orders !== undefined ? m.sunday_festa_dress_orders : '';
    document.getElementById('saturdayWeddingReservations').value = m.saturday_wedding_reservations !== null && m.saturday_wedding_reservations !== undefined ? m.saturday_wedding_reservations : '';
    document.getElementById('sundayWeddingReservations').value = m.sunday_wedding_reservations !== null && m.sunday_wedding_reservations !== undefined ? m.sunday_wedding_reservations : '';
    document.getElementById('contractTop').value = m.contract_top || '';
    document.getElementById('contractBottom').value = m.contract_bottom || '';
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
  const content = r.content || '';
  memo.value = content;
  memo.placeholder = `${formatDateKorean(currentMetricsDate)} 메모...`;
  updateMemoBadge(content);

  const rd = await api.getDailyDiary(currentMetricsDate);
  const diaryContent = rd.content || '';
  diary.value = diaryContent;
  diary.placeholder = `${formatDateKorean(currentMetricsDate)} 일기...`;
  updateBadge('diaryBadge', diaryContent);

  const rn = await api.getDailyNews(currentMetricsDate);
  const newsContent = rn.content || '';
  newsEl.value = newsContent;
  newsEl.placeholder = `${formatDateKorean(currentMetricsDate)} 신문...`;
  updateBadge('newsBadge', newsContent);
  
  loadTasks();
  loadBooks();
}

function updateMemoBadge(content) {
  const badge = document.getElementById('memoBadge');
  if(content && content.trim().length > 0) badge.style.display = 'flex';
  else badge.style.display = 'none';
}

function updateBadge(badgeId, content) {
  const badge = document.getElementById(badgeId);
  if(badge) {
    if(content && content.trim().length > 0) badge.style.display = 'flex';
    else badge.style.display = 'none';
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
  if(selectedDate) {
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
    
    return `<div class="task-item ${compClass}" data-id="${t.task_id}" draggable="false">
      <div class="drag-handle" title="끌어서 순서 조정">☰</div>
      <div class="task-checkbox ${checked}" onclick="toggleStatus('${t.task_id}', '${t.status==='완료'?'진행중':'완료'}')"></div>
      <div class="task-content">
        <div class="task-description ${compClass}">${escapeHtml(t.description)}</div>
        <div class="task-meta"><span>${dateStr}</span><span class="status-badge ${t.status}" onclick="handleStatusBadgeClick('${t.task_id}')">${t.status}</span></div>
      </div>
      <div class="task-actions">
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
  
  const tasks = await api.searchTasks(kw);
  if(!tasks || tasks.length === 0) list.innerHTML = `<div class="empty-state"><p>'${kw}' 결과 없음</p></div>`;
  else renderTasks(tasks);
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
  btn.disabled = true; btn.innerText = '...';
  
  const val = {
    contracts_count: document.getElementById('contractsCount').value,
    cumulative_contracts_count: document.getElementById('cumulativeContractsCount').value,
    db_count: document.getElementById('dbCount').value,
    cumulative_db_count: document.getElementById('cumulativeDbCount').value,
    saturday_visitors: document.getElementById('saturdayVisitors').value,
    sunday_visitors: document.getElementById('sundayVisitors').value,
    saturday_festa_dress_orders: document.getElementById('saturdayFestaDressOrders').value,
    sunday_festa_dress_orders: document.getElementById('sundayFestaDressOrders').value,
    saturday_wedding_reservations: document.getElementById('saturdayWeddingReservations').value,
    sunday_wedding_reservations: document.getElementById('sundayWeddingReservations').value,
    contract_top: document.getElementById('contractTop').value,
    contract_bottom: document.getElementById('contractBottom').value
  };
  
  const res = await api.saveDailyMetrics(currentMetricsDate, val);
  if(res.success) {
    btn.disabled = false; btn.innerText = '저장'; st.innerText = 'V';
    setTimeout(() => st.innerText = '', 2000);
    triggerQuestUpdate('metrics_logged', true);
  } else {
    btn.disabled = false; btn.innerText = '저장'; 
    alert('저장에 실패했습니다.');
  }
}

async function saveMemo() {
  const btn = document.getElementById('saveMemoBtn');
  const content = document.getElementById('memoInput').value;
  
  btn.disabled = true; btn.innerText = '...';
  
  const res = await api.saveDailyMemo(currentMetricsDate, content);
  if(res.success) {
    btn.disabled = false; btn.innerText = '메모 저장';
    const st = document.getElementById('memoStatus'); st.innerText = '완료';
    updateMemoBadge(content);
    fetchAllDates();
    setTimeout(() => st.innerText = '', 2000);
    triggerQuestUpdate('memo_written', true);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '메모 저장';
    alert('저장에 실패했습니다.');
  }
}

async function saveDiary() {
  const btn = document.getElementById('saveDiaryBtn');
  const content = document.getElementById('diaryInput').value;
  
  btn.disabled = true; btn.innerText = '...';
  
  const res = await api.saveDailyDiary(currentMetricsDate, content);
  if(res.success) {
    btn.disabled = false; btn.innerText = '일기 저장';
    const st = document.getElementById('diaryStatus'); st.innerText = '완료';
    updateBadge('diaryBadge', content);
    fetchAllDates();
    triggerQuestUpdate('diary_written', true);
    setTimeout(() => st.innerText = '', 2000);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '일기 저장';
    alert('저장에 실패했습니다.');
  }
}

async function saveNews() {
  const btn = document.getElementById('saveNewsBtn');
  const content = document.getElementById('newsInput').value;
  
  btn.disabled = true; btn.innerText = '...';
  
  const res = await api.saveDailyNews(currentMetricsDate, content);
  if(res.success) {
    btn.disabled = false; btn.innerText = '신문 저장';
    const st = document.getElementById('newsStatus'); st.innerText = '완료';
    updateBadge('newsBadge', content);
    fetchAllDates();
    triggerQuestUpdate('news_written', true);
    setTimeout(() => st.innerText = '', 2000);
    closeAllHeaders();
  } else {
    btn.disabled = false; btn.innerText = '신문 저장';
    alert('저장에 실패했습니다.');
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
    if(e.key === 'Enter' && !e.shiftKey) {
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

// 📚 독서 기록(Book Shelf & Notes) 프론트엔드 연동 구현
async function loadBooks() {
  currentBooks = await api.getBooks();
  
  // 📚 독서 기록 바 요약 문구 업데이트
  const bookTextEl = document.getElementById('bookText');
  const readingBooksCount = currentBooks.filter(b => b.status === '읽는 중').length;
  
  if (currentBooks.length === 0) {
    bookTextEl.innerText = '현재 읽고 있는 책이 없습니다. 독서 기록을 시작해보세요!';
  } else {
    if (readingBooksCount > 0) {
      const recentReading = currentBooks.find(b => b.status === '읽는 중');
      bookTextEl.innerHTML = `📚 지금 <strong style="color:var(--theme-primary-dark); font-weight:800;">'${escapeHtml(recentReading.title)}'</strong> 등 ${readingBooksCount}권의 책을 읽고 있습니다.`;
    } else {
      const recentBook = currentBooks[0];
      const statusText = recentBook.status === '완독' ? '완독했습니다!' : '보류 중입니다.';
      bookTextEl.innerHTML = `📚 최근 <strong style="color:var(--theme-primary-dark); font-weight:800;">'${escapeHtml(recentBook.title)}'</strong>을(를) ${statusText}`;
    }
  }
  
  // 만약 서재 모달이 열려 있다면 목록도 갱신
  if (document.getElementById('bookShelfModalOverlay').classList.contains('show')) {
    renderBookList();
  }
}

function openBookShelfModal() {
  document.getElementById('bookShelfModalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  document.getElementById('bookInput').value = '';
  // 디폴트로 '전체' 탭 활성화
  document.querySelectorAll('.book-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.book-tab[data-status="all"]').classList.add('active');
  currentBookFilter = 'all';
  renderBookList();
}

function closeBookShelfModal() {
  document.getElementById('bookShelfModalOverlay').classList.remove('show');
  checkAndUnlockBodyScroll();
}

function renderBookList() {
  const listEl = document.getElementById('bookList');
  listEl.innerHTML = '<div class="loading" style="padding:20px;"><div class="spinner" style="width:24px; height:24px;"></div></div>';
  
  let filteredBooks = currentBooks;
  if (currentBookFilter !== 'all') {
    filteredBooks = currentBooks.filter(b => b.status === currentBookFilter);
  }
  
  if (filteredBooks.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px; font-weight:600;">책 목록이 비어 있습니다.</div>';
    return;
  }
  
  listEl.innerHTML = filteredBooks.map(b => {
    const statusClass = b.status === '읽는 중' ? '읽는_중' : b.status;
    return `
      <div class="book-item" onclick="openBookNotesModal('${b.book_id}')">
        <div class="book-item-title">${escapeHtml(b.title)}</div>
        <span class="book-item-status ${statusClass}">${b.status}</span>
      </div>
    `;
  }).join('');
}

async function addBook() {
  const input = document.getElementById('bookInput');
  const title = input.value.trim();
  if (!title) return;
  
  const addBtn = document.getElementById('bookAddBtn');
  addBtn.disabled = true;
  
  const res = await api.addBook(title);
  addBtn.disabled = false;
  
  if (res.success) {
    input.value = '';
    await loadBooks();
    triggerQuestUpdate('book_logged', true);
  } else {
    alert('책 추가에 실패했습니다.');
  }
}

function openBookNotesModal(bookId) {
  selectedBook = currentBooks.find(b => b.book_id === bookId);
  if (!selectedBook) return;
  
  // 서재 모달을 닫지 않고 독서 노트 모달을 띄워 UX를 매끄럽게 함
  const overlay = document.getElementById('bookNotesModalOverlay');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  document.getElementById('bookNotesTitleInput').value = selectedBook.title;
  
  // 배지 설정
  const badge = document.getElementById('bookNotesBadge');
  badge.innerText = selectedBook.status;
  badge.className = 'book-notes-badge';
  if (selectedBook.status === '완독') badge.classList.add('완독');
  if (selectedBook.status === '보류') badge.classList.add('보류');
  
  // 상태 칩 활성화 설정
  document.querySelectorAll('.status-chip').forEach(chip => {
    chip.classList.remove('active');
    if (chip.dataset.status === selectedBook.status) {
      chip.classList.add('active');
    }
  });
  
  // 메모 세팅
  const textarea = document.getElementById('bookNotesTextarea');
  textarea.value = selectedBook.notes || '';
  
  // 저장 마크 비우기
  document.getElementById('bookNotesSaveStatus').innerText = '';
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
  
  const statusEl = document.getElementById('bookNotesSaveStatus');
  
  const res = await api.updateBookNotes(selectedBook.book_id, notes);
  if (res.success) {
    selectedBook.notes = notes;
    statusEl.innerText = '실시간 저장 완료';
    triggerQuestUpdate('book_logged', true);
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

async function saveBookTitleRealtime() {
  if (!selectedBook) return;
  const input = document.getElementById('bookNotesTitleInput');
  const newTitle = input.value.trim();
  if (!newTitle || newTitle === selectedBook.title) return;
  
  const statusEl = document.getElementById('bookNotesSaveStatus');
  statusEl.innerText = '제목 저장 중...';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.style.fontWeight = '700';
  
  const res = await api.updateBookTitle(selectedBook.book_id, newTitle);
  if (res.success) {
    selectedBook.title = newTitle;
    statusEl.innerText = '제목 저장 완료';
    statusEl.style.color = '#10b981';
    statusEl.style.fontWeight = '800';
    await loadBooks(); // 독서 기록 요약 및 목록 새로고침
    setTimeout(() => {
      if (statusEl.innerText === '제목 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    statusEl.innerText = '제목 저장 실패';
    statusEl.style.color = '#ef4444';
    statusEl.style.fontWeight = '800';
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

// 실시간 목록 렌더링
async function renderVaultList(searchQuery) {
  const container = document.getElementById('vaultListContainer');
  const rawText = await loadVaultData();
  
  if (!rawText.trim()) {
    container.innerHTML = '<div class="vault-no-data">저장된 비밀번호 정보가 없습니다.<br>"메모장 편집" 탭에서 정보를 추가해 보세요!</div>';
    return;
  }
  
  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line !== '');
  const filtered = searchQuery.trim() 
    ? lines.filter(line => line.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines;
    
  if (filtered.length === 0) {
    container.innerHTML = `<div class="vault-no-data">'${searchQuery}' 검색 결과가 없습니다.</div>`;
    return;
  }
  
  container.innerHTML = filtered.map((line, index) => {
    return `
      <div class="vault-item">
        <div class="vault-item-text">${escapeHtml(line)}</div>
        <button class="vault-item-copy" onclick="copyVaultItem(this, \`${line.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">복사</button>
      </div>
    `;
  }).join('');
}

// 클립보드 복사
async function copyVaultItem(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.innerText = '복사 완료!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerText = '복사';
      btn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
    // 폴백 브라우저 복사 시도
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      btn.innerText = '복사 완료!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerText = '복사';
        btn.classList.remove('copied');
      }, 2000);
    } catch (e) {
      alert('복사에 실패했습니다. 직접 복사해 주세요.');
    }
    document.body.removeChild(textarea);
  }
}

// 온클릭 어트리뷰트 바인딩을 위한 전역 스코프 노출
window.copyVaultItem = copyVaultItem;

// 이벤트 바인딩 셋업
function setupVaultEvents() {
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

// 메모, 일기, 신문 실시간 자동 저장 기능
function setupAutoSaveEvents() {
  const memoInput = document.getElementById('memoInput');
  const diaryInput = document.getElementById('diaryInput');
  const newsInput = document.getElementById('newsInput');
  
  // 취소선 단축키 적용
  setupStrikethroughShortcut(memoInput);
  setupStrikethroughShortcut(diaryInput);
  setupStrikethroughShortcut(newsInput);
  
  let memoAutoSaveTimeout = null;
  let diaryAutoSaveTimeout = null;
  let newsAutoSaveTimeout = null;
  
  // 1. 메모 실시간 자동 저장
  memoInput.oninput = function() {
    const statusEl = document.getElementById('memoStatus');
    statusEl.innerText = '입력 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
    
    clearTimeout(memoAutoSaveTimeout);
    memoAutoSaveTimeout = setTimeout(() => {
      saveMemoRealtime();
    }, 1000);
  };
  memoInput.onblur = function() {
    clearTimeout(memoAutoSaveTimeout);
    saveMemoRealtime();
  };

  // 2. 일기 실시간 자동 저장
  diaryInput.oninput = function() {
    const statusEl = document.getElementById('diaryStatus');
    statusEl.innerText = '입력 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
    
    clearTimeout(diaryAutoSaveTimeout);
    diaryAutoSaveTimeout = setTimeout(() => {
      saveDiaryRealtime();
    }, 1000);
  };
  diaryInput.onblur = function() {
    clearTimeout(diaryAutoSaveTimeout);
    saveDiaryRealtime();
  };

  // 3. 신문 실시간 자동 저장
  newsInput.oninput = function() {
    const statusEl = document.getElementById('newsStatus');
    statusEl.innerText = '입력 중...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.fontWeight = '700';
    
    clearTimeout(newsAutoSaveTimeout);
    newsAutoSaveTimeout = setTimeout(() => {
      saveNewsRealtime();
    }, 1000);
  };
  newsInput.onblur = function() {
    clearTimeout(newsAutoSaveTimeout);
    saveNewsRealtime();
  };
}

async function saveMemoRealtime() {
  const content = document.getElementById('memoInput').value;
  const statusEl = document.getElementById('memoStatus');
  statusEl.innerText = '저장 중...';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.style.fontWeight = '700';
  
  const res = await api.saveDailyMemo(currentMetricsDate, content);
  if (res.success) {
    statusEl.innerText = '실시간 저장 완료';
    statusEl.style.color = '#10b981';
    statusEl.style.fontWeight = '800';
    updateMemoBadge(content);
    triggerQuestUpdate('memo_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    statusEl.innerText = '저장 실패';
    statusEl.style.color = '#ef4444';
  }
}

async function saveDiaryRealtime() {
  const content = document.getElementById('diaryInput').value;
  const statusEl = document.getElementById('diaryStatus');
  statusEl.innerText = '저장 중...';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.style.fontWeight = '700';
  
  const res = await api.saveDailyDiary(currentMetricsDate, content);
  if (res.success) {
    statusEl.innerText = '실시간 저장 완료';
    statusEl.style.color = '#10b981';
    statusEl.style.fontWeight = '800';
    updateBadge('diaryBadge', content);
    triggerQuestUpdate('diary_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    statusEl.innerText = '저장 실패';
    statusEl.style.color = '#ef4444';
  }
}

async function saveNewsRealtime() {
  const content = document.getElementById('newsInput').value;
  const statusEl = document.getElementById('newsStatus');
  statusEl.innerText = '저장 중...';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.style.fontWeight = '700';
  
  const res = await api.saveDailyNews(currentMetricsDate, content);
  if (res.success) {
    statusEl.innerText = '실시간 저장 완료';
    statusEl.style.color = '#10b981';
    statusEl.style.fontWeight = '800';
    updateBadge('newsBadge', content);
    triggerQuestUpdate('news_written', true);
    fetchAllDates();
    setTimeout(() => {
      if (statusEl.innerText === '실시간 저장 완료') {
        statusEl.innerText = '';
      }
    }, 2000);
  } else {
    statusEl.innerText = '저장 실패';
    statusEl.style.color = '#ef4444';
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


