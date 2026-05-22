let currentPeriod = 'today', selectedDate = null, currentMetricsDate = null;
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;

let calDisplayDate = new Date();
let memoDatesSet = new Set();
let diaryDatesSet = new Set();
let newsDatesSet = new Set();

let currentGoal = null;

const THEMES = {
  0: { primary: '#f43f5e', dark: '#be123c', light: '#ffe4e6', header: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)' }, // 일: Rose
  1: { primary: '#8b5cf6', dark: '#6d28d9', light: '#ede9fe', header: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)' }, // 월: Violet
  2: { primary: '#f97316', dark: '#c2410c', light: '#ffedd5', header: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)' }, // 화: Orange
  3: { primary: '#0ea5e9', dark: '#0369a1', light: '#e0f2fe', header: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' }, // 수: Ocean Blue
  4: { primary: '#10b981', dark: '#047857', light: '#d1fae5', header: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }, // 목: Emerald
  5: { primary: '#f59e0b', dark: '#b45309', light: '#fef3c7', header: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' }, // 금: Amber
  6: { primary: '#6366f1', dark: '#4338ca', light: '#e0e7ff', header: 'linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)' }  // 토: Indigo
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
});

async function loadGoal() {
  currentGoal = await api.getGoal();
  if (currentGoal) {
    document.getElementById('goalText').innerText = currentGoal.text;
    document.getElementById('goalModalTitleInput').value = currentGoal.text;
  }
}

async function openGoalModal() {
  if (!currentGoal) return;
  document.getElementById('goalModalOverlay').classList.add('show');
  renderGoalExecutions();
}

function closeGoalModal() {
  document.getElementById('goalModalOverlay').classList.remove('show');
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
}

function closeAllHeaders() {
  ['searchWrapper','memoWrapper','diaryWrapper','newsWrapper','customCalendarWrapper'].forEach(id => document.getElementById(id).classList.remove('show'));
  ['searchToggleBtn','memoToggleBtn','diaryToggleBtn','newsToggleBtn'].forEach(id => document.getElementById(id).classList.remove('active'));
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
    const dateStr = new Date(t.created_at).getMonth()+1 + '/' + new Date(t.created_at).getDate();
    
    return `<div class="task-item ${compClass}" data-id="${t.task_id}" draggable="false">
      <div class="drag-handle" title="끌어서 순서 조정">☰</div>
      <div class="task-checkbox ${checked}" onclick="toggleStatus('${t.task_id}', '${t.status==='완료'?'진행중':'완료'}')"></div>
      <div class="task-content">
        <div class="task-description ${compClass}">${escapeHtml(t.description)}</div>
        <div class="task-meta"><span>${dateStr}</span><span class="status-badge ${t.status}">${t.status}</span></div>
      </div>
      <div class="task-actions">
        <button class="btn-move-up" onclick="moveTaskUp('${t.task_id}', event)" title="위로 이동">▲</button>
        <button class="btn-move-down" onclick="moveTaskDown('${t.task_id}', event)" title="아래로 이동">▼</button>
        <button class="task-edit" onclick="editTask('${t.task_id}')">✎</button>
        <button class="task-delete" onclick="deleteTask('${t.task_id}')">×</button>
      </div>
    </div>`;
  }).join('');

  // 드래그앤드롭 및 터치 이벤트 바인딩
  bindDragAndTouchEvents();
}

// 3단계 수동 순서 조정 인터랙션 헬퍼 함수군
async function moveTaskUp(taskId, event) {
  if (event) event.stopPropagation();
  const taskEl = document.querySelector(`.task-item[data-id="${taskId}"]`);
  if (!taskEl) return;
  
  const prevEl = taskEl.previousElementSibling;
  if (prevEl && prevEl.classList.contains('task-item')) {
    taskEl.parentNode.insertBefore(taskEl, prevEl);
    await saveTasksOrder();
  }
}

async function moveTaskDown(taskId, event) {
  if (event) event.stopPropagation();
  const taskEl = document.querySelector(`.task-item[data-id="${taskId}"]`);
  if (!taskEl) return;
  
  const nextEl = taskEl.nextElementSibling;
  if (nextEl && nextEl.classList.contains('task-item')) {
    taskEl.parentNode.insertBefore(taskEl, nextEl.nextElementSibling);
    await saveTasksOrder();
  }
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

// 전역 윈도우 스코프 바인딩 (HTML 인라인 온클릭 이벤트 리스너 참조 보장)
window.moveTaskUp = moveTaskUp;
window.moveTaskDown = moveTaskDown;

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
