let currentPeriod = 'today', selectedDate = null, currentMetricsDate = null;
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;

let calDisplayDate = new Date();
let memoDatesSet = new Set();
let diaryDatesSet = new Set();
let newsDatesSet = new Set();

let currentGoal = null;
let currentBooks = [];
let selectedBook = null;
let currentBookFilter = 'all';

const THEMES = {
  0: { primary: '#8c5c64', dark: '#613d43', light: '#f5eff0', header: 'linear-gradient(135deg, #a67981 0%, #613d43 100%)' }, // 일: Cabernet Etoupe (버건디 스톤)
  1: { primary: '#7d6b7d', dark: '#534653', light: '#f2f0f2', header: 'linear-gradient(135deg, #9b879b 0%, #534653 100%)' }, // 월: Loro Silk Taupe (실크 토프 바이올렛)
  2: { primary: '#a26c4f', dark: '#72452e', light: '#f5f0ed', header: 'linear-gradient(135deg, #c58f71 0%, #72452e 100%)' }, // 화: Tanned Saddle Leather (탠 가죽 브라운)
  3: { primary: '#4c6a85', dark: '#2e4357', light: '#edf1f5', header: 'linear-gradient(135deg, #6c8aab 0%, #2e4357 100%)' }, // 수: Midnight Ocean Slate (미드나잇 스틸 블루)
  4: { primary: '#557467', dark: '#364c42', light: '#edf2f0', header: 'linear-gradient(135deg, #749789 0%, #364c42 100%)' }, // 목: Nordic Fjord Forest (세이지 올리브 그린)
  5: { primary: '#9b8053', dark: '#6a5433', light: '#f5f2ed', header: 'linear-gradient(135deg, #be9f6f 0%, #6a5433 100%)' }, // 금: Piaget Sand Brass (샌드 골드 브론즈)
  6: { primary: '#4a546c', dark: '#2e3547', light: '#edf0f5', header: 'linear-gradient(135deg, #6b7794 0%, #2e3547 100%)' }  // 토: Asphalt Navy Mirage (아스팔트 네이비)
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
  
  if (storedIp !== currentIp || !storedDevice) {
    let input = prompt('접근 권한이 필요합니다. 4자리 비밀번호를 입력하세요:');
    if (input === PASSWORD) {
      localStorage.setItem('todo_user_ip', currentIp);
      localStorage.setItem('todo_device_id', storedDevice || ('device_' + Math.random().toString(36).substr(2, 9)));
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
    };
  });
  
  document.getElementById('btnSaveMetrics').onclick = saveMetrics;
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
  
  console.log('calling api.getDailyMetrics');
  const m = await api.getDailyMetrics(currentMetricsDate);
  console.log('api.getDailyMetrics resolved', m);
  if(m) {
    document.getElementById('contractsCount').value = m.contracts_count;
    document.getElementById('dbCount').value = m.db_count;
    document.getElementById('saturdayVisitors').value = m.saturday_visitors;
    document.getElementById('sundayVisitors').value = m.sunday_visitors;
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
        <div class="task-meta"><span>${dateStr}</span><span class="status-badge ${t.status}">${t.status}</span></div>
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

async function saveMetrics() {
  const btn = document.getElementById('btnSaveMetrics');
  const st = document.getElementById('saveStatus');
  btn.disabled = true; btn.innerText = '...';
  
  const val = {
    contracts_count: document.getElementById('contractsCount').value,
    db_count: document.getElementById('dbCount').value,
    saturday_visitors: document.getElementById('saturdayVisitors').value,
    sunday_visitors: document.getElementById('sundayVisitors').value
  };
  
  const res = await api.saveDailyMetrics(currentMetricsDate, val);
  if(res.success) {
    btn.disabled = false; btn.innerText = '저장'; st.innerText = 'V';
    setTimeout(() => st.innerText = '', 2000);
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
    setTimeout(() => st.innerText = '', 2000);
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
    setTimeout(() => st.innerText = '', 2000);
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

async function toggleStatus(id, st) { 
  const res = await api.updateTaskStatus(id, st);
  if(res.success) loadTasks();
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
    const res = await api.deleteTask(id);
    if(res.success) loadTasks();
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

