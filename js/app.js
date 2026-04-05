let currentPeriod = 'today', selectedDate = null, currentMetricsDate = null;
let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;

let calDisplayDate = new Date();
let memoDatesSet = new Set();

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
  
  fetchMemoDates(); 
  refreshAllData();
  
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
  document.getElementById('calendarBtn').onclick = () => {
    toggleHeader('calendar');
    renderCalendar();
  };
  
  document.getElementById('prevMonthBtn').onclick = () => { calDisplayDate.setMonth(calDisplayDate.getMonth()-1); renderCalendar(); };
  document.getElementById('nextMonthBtn').onclick = () => { calDisplayDate.setMonth(calDisplayDate.getMonth()+1); renderCalendar(); };
  
  document.getElementById('searchBtn').onclick = executeSearch;
  document.getElementById('searchInput').onkeypress = (e) => { if(e.key === 'Enter') executeSearch(); };
  document.getElementById('saveMemoBtn').onclick = saveMemo;
  
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
  document.getElementById('inputDescription').onkeypress = (e) => { if(e.key === 'Enter') addTask(); };
});

async function fetchMemoDates() {
  console.log('fetchMemoDates called');
  const dates = await api.getAllMemoDates();
  console.log('fetchMemoDates resolved', dates);
  memoDatesSet = new Set(dates);
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
    
    if(memoDatesSet.has(dateStr)) {
      div.classList.add('has-memo');
      const dot = document.createElement('div');
      dot.className = 'cal-dot';
      div.appendChild(dot);
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
  const map = { 'search': 'searchWrapper', 'memo': 'memoWrapper', 'calendar': 'customCalendarWrapper' };
  const btnMap = { 'search': 'searchToggleBtn', 'memo': 'memoToggleBtn', 'calendar': 'calendarBtn' };
  
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
  }
}

function closeAllHeaders() {
  ['searchWrapper','memoWrapper','customCalendarWrapper'].forEach(id => document.getElementById(id).classList.remove('show'));
  ['searchToggleBtn','memoToggleBtn'].forEach(id => document.getElementById(id).classList.remove('active'));
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
  
  console.log('calling api.getDailyMemo');
  const r = await api.getDailyMemo(currentMetricsDate);
  console.log('api.getDailyMemo resolved', r);
  const content = r.content || '';
  memo.value = content;
  memo.placeholder = `${formatDateKorean(currentMetricsDate)} 메모...`;
  updateMemoBadge(content);
  
  loadTasks();
}

function updateMemoBadge(content) {
  const badge = document.getElementById('memoBadge');
  if(content && content.trim().length > 0) badge.style.display = 'flex';
  else badge.style.display = 'none';
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
    
    return `<div class="task-item ${compClass}" data-id="${t.task_id}">
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
}

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
    fetchMemoDates();
    setTimeout(() => st.innerText = '', 2000);
  } else {
    btn.disabled = false; btn.innerText = '메모 저장';
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

async function editTask(id) {
  const t = document.querySelector(`.task-item[data-id="${id}"] .task-description`).innerText;
  const n = prompt('수정:', t);
  if(n && n.trim() !== t) {
    const res = await api.updateTaskContent(id, n.trim());
    if(res.success) loadTasks();
  }
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
