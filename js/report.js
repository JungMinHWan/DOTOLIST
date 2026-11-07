// 보고문서 / 독서 기록 / 업무 매뉴얼 통합 블로그형 에디터 모듈 (이모지 미사용)

(function () {
  let currentReports = [];
  let selectedReport = null;
  let activeDocType = 'report'; // 'report' | 'book' | 'manual'
  let currentReportFilter = 'all';
  let currentReportSearch = '';
  let reportSaveTimer = null;
  let reportIndicatorTimer = null;
  let savedSelectionRange = null;
  let activeTableCell = null;
  let selectedTableCells = [];
  let justFinishedMultiCellDrag = false;
  let activeImageElement = null;

  const DOC_MODE_CONFIG = {
    report: {
      type: 'report',
      label: '보고문서',
      idField: 'report_id',
      contentField: 'content',
      defaultStatus: '작성 중',
      statuses: ['작성 중', '완료', '보류'],
      titlePlaceholder: '보고문서 제목을 입력하세요',
      editorPlaceholder: '이곳에 보고 내용을 자유롭게 작성하세요. 상단 도구 모음으로 제목, 글자색, 형광펜, 표, 콜아웃 박스, 이미지 등을 삽입할 수 있습니다.',
      deleteBtnText: '문서 삭제',
      exportPrefix: '보고문서',
      draftKeyPrefix: 'report_draft_'
    },
    book: {
      type: 'book',
      label: '독서 기록',
      idField: 'book_id',
      contentField: 'notes',
      defaultStatus: '읽는 중',
      statuses: ['읽는 중', '완독', '보류'],
      titlePlaceholder: '책 제목을 입력하세요',
      editorPlaceholder: '인상 깊은 문장이나 독서 메모를 자유롭게 작성하세요. 상단 도구 모음으로 제목, 글자색, 형광펜, 표, 콜아웃 박스, 이미지 등을 삽입할 수 있습니다.',
      deleteBtnText: '기록 삭제',
      exportPrefix: '독서기록',
      draftKeyPrefix: 'book_draft_'
    },
    manual: {
      type: 'manual',
      label: '업무 매뉴얼',
      idField: 'manual_id',
      contentField: 'notes',
      defaultStatus: '참고 중',
      statuses: ['참고 중', '완료', '보류'],
      titlePlaceholder: '매뉴얼 제목을 입력하세요',
      editorPlaceholder: '업무 프로세스, 체크리스트, 참고 가이드를 자유롭게 작성하세요. 상단 도구 모음으로 제목, 글자색, 형광펜, 표, 콜아웃 박스, 이미지 등을 삽입할 수 있습니다.',
      deleteBtnText: '매뉴얼 삭제',
      exportPrefix: '업무매뉴얼',
      draftKeyPrefix: 'manual_draft_'
    }
  };

  function getActiveModeConfig() {
    return DOC_MODE_CONFIG[activeDocType] || DOC_MODE_CONFIG.report;
  }

  function getDocId(item) {
    if (!item) return '';
    const cfg = getActiveModeConfig();
    return item[cfg.idField] || item.report_id || item.book_id || item.manual_id || '';
  }

  function escapeHtmlText(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // 기존 일반 텍스트(줄바꿈 \n 기반)로 저장된 독서 기록/업무 매뉴얼 노트를 에디터용 HTML 문단(<p>)으로 자동 변환
  function normalizeContentToRichHtml(raw) {
    if (!raw || !String(raw).trim()) return '<p><br></p>';
    const str = String(raw);
    const hasHtmlTag = /<\/?(p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|figure|hr|br|span|b|strong|u|i|em|s|strike|font)\b/i.test(str);
    if (hasHtmlTag) {
      return str;
    }
    const lines = str.split(/\r?\n/);
    return lines.map(line => `<p>${line ? escapeHtmlText(line) : '<br>'}</p>`).join('');
  }

  function stripHtmlTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function formatDateTimeShort(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
  }

  function getExportDateStamp() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function notifyToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    } else {
      console.log(msg);
    }
  }

  // === 선택 영역(Selection) 보존 및 복원 ===
  function saveEditorSelection() {
    const editor = document.getElementById('reportEditorContent');
    if (!editor) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedSelectionRange = range.cloneRange();
      }
    }
  }

  function restoreEditorSelection() {
    const editor = document.getElementById('reportEditorContent');
    if (!editor) return;
    editor.focus();
    if (savedSelectionRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRange);
    }
  }

  // === 보고문서 목록 로드 및 보관함 렌더링 ===
  async function loadReports() {
    if (!window.api || typeof window.api.getReports !== 'function') return;
    currentReports = await window.api.getReports();

    const shelfOverlay = document.getElementById('reportShelfModalOverlay');
    if (shelfOverlay && shelfOverlay.classList.contains('show')) {
      renderReportList();
    }
  }

  function openReportShelfModal() {
    const overlay = document.getElementById('reportShelfModalOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    const input = document.getElementById('reportNewTitleInput');
    if (input) input.value = '';

    const searchInput = document.getElementById('reportSearchInput');
    if (searchInput) searchInput.value = '';
    currentReportSearch = '';
    const clearBtn = document.getElementById('reportSearchClear');
    if (clearBtn) clearBtn.classList.remove('visible');

    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    const allTab = document.querySelector('.report-tab[data-status="all"]');
    if (allTab) allTab.classList.add('active');
    currentReportFilter = 'all';

    loadReports().then(() => {
      renderReportList();
    });
  }

  function closeReportShelfModal() {
    const overlay = document.getElementById('reportShelfModalOverlay');
    if (overlay) overlay.classList.remove('show');
    if (typeof window.checkAndUnlockBodyScroll === 'function') {
      window.checkAndUnlockBodyScroll();
    } else {
      document.body.style.overflow = '';
    }
  }

  function renderReportList() {
    const listEl = document.getElementById('reportList');
    if (!listEl) return;

    let filtered = currentReports;
    if (currentReportFilter !== 'all') {
      filtered = filtered.filter(r => r.status === currentReportFilter);
    }

    if (currentReportSearch) {
      const q = currentReportSearch.toLowerCase();
      filtered = filtered.filter(r => {
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const bodyMatch = stripHtmlTags(r.content || '').toLowerCase().includes(q);
        return titleMatch || bodyMatch;
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:34px 20px; color:var(--text-muted); font-size:13px; font-weight:600;">등록된 보고문서가 없습니다.</div>';
      return;
    }

    listEl.innerHTML = filtered.map((r, idx) => {
      const statusClass = r.status === '작성 중' ? '작성_중' : r.status;
      const isFirst = idx === 0;
      const isLast = idx === filtered.length - 1;
      const dateStr = formatDateTimeShort(r.updated_at || r.created_at);

      return `
        <div class="book-item" onclick="window.reportStudio.openEditor('${r.report_id}')">
          <div class="report-item-info">
            <div class="book-item-title" title="${escapeHtmlText(r.title)}">${escapeHtmlText(r.title)}</div>
            <div class="report-item-meta">${dateStr}</div>
          </div>
          <div class="book-item-right">
            <span class="book-item-status ${statusClass}">${escapeHtmlText(r.status)}</span>
            <div class="book-reorder-group" onclick="event.stopPropagation()">
              <button type="button" class="book-order-btn ${isFirst ? 'disabled' : ''}"
                      title="위로 이동"
                      ${isFirst ? 'disabled' : ''}
                      onclick="window.reportStudio.moveOrder('${r.report_id}', -1, event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
              <button type="button" class="book-order-btn ${isLast ? 'disabled' : ''}"
                      title="아래로 이동"
                      ${isLast ? 'disabled' : ''}
                      onclick="window.reportStudio.moveOrder('${r.report_id}', 1, event)">
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

  async function addReport() {
    const input = document.getElementById('reportNewTitleInput');
    if (!input) return;
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }

    const addBtn = document.getElementById('reportAddBtn');
    if (addBtn) addBtn.disabled = true;

    const res = await window.api.addReport(title);
    if (addBtn) addBtn.disabled = false;

    if (res && res.success && res.data) {
      input.value = '';
      await loadReports();
      openReportEditorModal(res.data.report_id);
    } else {
      alert('보고문서 생성에 실패했습니다.');
    }
  }

  async function moveReportOrder(reportId, direction, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    let filtered = currentReports;
    if (currentReportFilter !== 'all') {
      filtered = currentReports.filter(r => r.status === currentReportFilter);
    }

    const currentIdx = filtered.findIndex(r => r.report_id === reportId);
    if (currentIdx === -1) return;

    const targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= filtered.length) return;

    const targetReport = filtered[targetIdx];
    const globalIdxA = currentReports.findIndex(r => r.report_id === reportId);
    const globalIdxB = currentReports.findIndex(r => r.report_id === targetReport.report_id);
    if (globalIdxA === -1 || globalIdxB === -1) return;

    const temp = currentReports[globalIdxA];
    currentReports[globalIdxA] = currentReports[globalIdxB];
    currentReports[globalIdxB] = temp;

    currentReports.forEach((r, i) => {
      r.sort_order = i + 1;
    });

    renderReportList();

    try {
      const ids = currentReports.map(r => r.report_id);
      await window.api.updateReportOrder(ids);
    } catch (err) {
      console.error('보고문서 순서 저장 오류:', err);
    }
  }

  // === 블로그형 에디터 모달 제어 ===
  function updateReportSaveIndicator(state) {
    const dotContainer = document.getElementById('reportSaveDotContainer');
    const textEl = document.getElementById('reportSaveStatusText');
    if (!dotContainer || !textEl) return;

    if (reportIndicatorTimer) {
      clearTimeout(reportIndicatorTimer);
      reportIndicatorTimer = null;
    }

    dotContainer.className = `save-status-dot-container ${state}`;
    if (state === 'saving') {
      textEl.textContent = '저장 중...';
      textEl.style.color = '#f59e0b';
    } else if (state === 'saved') {
      textEl.textContent = '자동 저장됨';
      textEl.style.color = '#10b981';
      reportIndicatorTimer = setTimeout(() => {
        dotContainer.className = 'save-status-dot-container idle';
        textEl.textContent = '';
      }, 2500);
    } else if (state === 'error') {
      textEl.textContent = '로컬 임시보관됨';
      textEl.style.color = '#ef4444';
    } else {
      dotContainer.className = 'save-status-dot-container idle';
      textEl.textContent = '';
    }
  }

  function renderStatusChipsForMode(docType, activeStatus) {
    const cfg = DOC_MODE_CONFIG[docType] || DOC_MODE_CONFIG.report;
    const container = document.getElementById('reportStatusChipsContainer');
    if (!container) return;

    container.innerHTML = cfg.statuses
      .map(
        st =>
          `<button type="button" class="report-status-chip ${st === activeStatus ? 'active' : ''}" data-status="${escapeHtmlText(st)}">${escapeHtmlText(st)}</button>`
      )
      .join('');

    container.querySelectorAll('.report-status-chip').forEach(chip => {
      chip.onclick = function () {
        changeReportStatus(this.dataset.status);
      };
    });
  }

  async function refreshActiveModeList() {
    if (activeDocType === 'report') {
      await loadReports();
    } else if (activeDocType === 'book') {
      if (typeof window.loadBooks === 'function') {
        await window.loadBooks();
      }
    } else if (activeDocType === 'manual') {
      if (typeof window.loadManuals === 'function') {
        await window.loadManuals();
      }
    }
  }

  function openUnifiedEditor(docType, docItem) {
    if (!docItem) return;
    activeDocType = DOC_MODE_CONFIG[docType] ? docType : 'report';
    selectedReport = docItem;
    const cfg = getActiveModeConfig();
    const docId = getDocId(docItem);

    const overlay = document.getElementById('reportEditorModalOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    const titleInput = document.getElementById('reportEditorTitleInput');
    if (titleInput) {
      titleInput.value = docItem.title || '';
      titleInput.placeholder = cfg.titlePlaceholder;
    }

    const deleteBtn = document.getElementById('reportDeleteBtn');
    if (deleteBtn) {
      deleteBtn.textContent = cfg.deleteBtnText;
    }

    const lexiconBtn = document.getElementById('btnOpenLexiconInEditor');
    if (lexiconBtn) {
      lexiconBtn.style.display = activeDocType === 'book' ? 'inline-flex' : 'none';
    }

    const status = docItem.status || cfg.defaultStatus;
    renderStatusChipsForMode(activeDocType, status);
    updateStatusBadgeAndChips(status);

    const updatedLabel = document.getElementById('reportUpdatedLabel');
    if (updatedLabel) {
      const dt = formatDateTimeShort(docItem.updated_at || docItem.created_at);
      updatedLabel.textContent = dt ? `최종 수정: ${dt}` : '';
    }

    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      editor.setAttribute('data-placeholder', cfg.editorPlaceholder);
      const localDraft = docId ? localStorage.getItem(`${cfg.draftKeyPrefix}${docId}`) : null;
      const dbRaw = docItem[cfg.contentField] || '';
      let initialRaw = dbRaw;

      if (localDraft && localDraft !== dbRaw && localDraft.length > dbRaw.length) {
        initialRaw = localDraft;
      }

      editor.innerHTML = normalizeContentToRichHtml(initialRaw);
      bindInteractiveCheckboxes(editor);
    }

    hideAllPopovers();
    hideContextBars();
    updateReportSaveIndicator('idle');
  }

  function openReportEditorModal(reportIdOrObj) {
    const item =
      typeof reportIdOrObj === 'object' && reportIdOrObj !== null
        ? reportIdOrObj
        : currentReports.find(r => r.report_id === reportIdOrObj);
    if (!item) return;
    openUnifiedEditor('report', item);
  }

  async function openBookEditorModal(bookIdOrObj) {
    let item = null;
    if (typeof bookIdOrObj === 'object' && bookIdOrObj !== null) {
      item = bookIdOrObj;
    } else {
      const list = Array.isArray(window.currentBooks) ? window.currentBooks : [];
      item = list.find(b => b.book_id === bookIdOrObj);
      if (!item && window.api && typeof window.api.getBooks === 'function') {
        const fetched = await window.api.getBooks();
        window.currentBooks = fetched;
        item = fetched.find(b => b.book_id === bookIdOrObj);
      }
    }
    if (!item) return;
    openUnifiedEditor('book', item);
  }

  async function openManualEditorModal(manualIdOrObj) {
    let item = null;
    if (typeof manualIdOrObj === 'object' && manualIdOrObj !== null) {
      item = manualIdOrObj;
    } else {
      const list = Array.isArray(window.currentManuals) ? window.currentManuals : [];
      item = list.find(m => m.manual_id === manualIdOrObj);
      if (!item && window.api && typeof window.api.getManuals === 'function') {
        const fetched = await window.api.getManuals();
        window.currentManuals = fetched;
        item = fetched.find(m => m.manual_id === manualIdOrObj);
      }
    }
    if (!item) return;
    openUnifiedEditor('manual', item);
  }

  async function closeReportEditorModal() {
    if (reportSaveTimer) {
      clearTimeout(reportSaveTimer);
      reportSaveTimer = null;
    }
    if (selectedReport) {
      await saveReportContentRealtime();
      await saveReportTitleRealtime();
    }
    const overlay = document.getElementById('reportEditorModalOverlay');
    if (overlay) overlay.classList.remove('show');
    const modal = document.getElementById('reportEditorModal');
    if (modal) modal.classList.remove('fullscreen');

    selectedReport = null;
    hideAllPopovers();
    hideContextBars();
    await refreshActiveModeList();

    if (typeof window.checkAndUnlockBodyScroll === 'function') {
      window.checkAndUnlockBodyScroll();
    }
  }

  function toggleEditorFullscreen() {
    const modal = document.getElementById('reportEditorModal');
    if (!modal) return;
    modal.classList.toggle('fullscreen');
  }

  function updateStatusBadgeAndChips(status) {
    const badge = document.getElementById('reportEditorBadge');
    if (badge) {
      badge.textContent = status;
      badge.className = 'book-notes-badge';
      if (status === '작성 중') badge.classList.add('작성_중');
      else if (status === '읽는 중') badge.classList.add('읽는_중');
      else if (status === '참고 중') badge.classList.add('참고_중');
      else if (status === '완료' || status === '완독') badge.classList.add('완독');
      else if (status === '보류') badge.classList.add('보류');
    }

    document.querySelectorAll('.report-status-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.status === status);
    });
  }

  async function changeReportStatus(newStatus) {
    if (!selectedReport) return;
    const docId = getDocId(selectedReport);
    if (!docId) return;

    let res = null;
    if (activeDocType === 'book') {
      res = await window.api.updateBookStatus(docId, newStatus);
    } else if (activeDocType === 'manual') {
      res = await window.api.updateManualStatus(docId, newStatus);
    } else {
      res = await window.api.updateReportStatus(docId, newStatus);
    }

    if (res && res.success) {
      selectedReport.status = newStatus;
      selectedReport.updated_at = new Date().toISOString();
      updateStatusBadgeAndChips(newStatus);
      if (activeDocType === 'book' && typeof window.triggerQuestUpdate === 'function') {
        window.triggerQuestUpdate('book_logged', true);
      }
      await refreshActiveModeList();
    } else {
      alert('상태 변경에 실패했습니다.');
    }
  }

  async function saveReportTitleRealtime() {
    if (!selectedReport) return;
    const input = document.getElementById('reportEditorTitleInput');
    if (!input) return;
    const newTitle = input.value.trim();
    if (!newTitle || newTitle === selectedReport.title) return;

    const docId = getDocId(selectedReport);
    if (!docId) return;

    updateReportSaveIndicator('saving');
    let res = null;
    if (activeDocType === 'book') {
      res = await window.api.updateBookTitle(docId, newTitle);
    } else if (activeDocType === 'manual') {
      res = await window.api.updateManualTitle(docId, newTitle);
    } else {
      res = await window.api.updateReportTitle(docId, newTitle);
    }

    if (res && res.success) {
      selectedReport.title = newTitle;
      selectedReport.updated_at = new Date().toISOString();
      updateReportSaveIndicator('saved');
      await refreshActiveModeList();
    } else {
      updateReportSaveIndicator('error');
    }
  }

  async function saveReportContentRealtime() {
    if (!selectedReport) return;
    const editor = document.getElementById('reportEditorContent');
    if (!editor) return;

    const cfg = getActiveModeConfig();
    const docId = getDocId(selectedReport);
    if (!docId) return;

    // 체크박스 상태 attribute 동기화
    editor.querySelectorAll('input.report-check-box').forEach(chk => {
      if (chk.checked) {
        chk.setAttribute('checked', 'checked');
      } else {
        chk.removeAttribute('checked');
      }
    });

    // 선택된 이미지/표 셀 아웃라인 클래스 제거 후 저장 (에디터 내 활성 상태는 즉시 복원)
    editor.querySelectorAll('img.selected-media').forEach(img => {
      img.classList.remove('selected-media');
    });
    editor.querySelectorAll('.table-cell-selected').forEach(cell => {
      cell.classList.remove('table-cell-selected');
    });

    const htmlContent = editor.innerHTML;

    if (activeImageElement && editor.contains(activeImageElement)) {
      activeImageElement.classList.add('selected-media');
    }
    if (selectedTableCells && selectedTableCells.length > 1) {
      selectedTableCells.forEach(cell => {
        if (editor.contains(cell)) cell.classList.add('table-cell-selected');
      });
    }
    try {
      localStorage.setItem(`${cfg.draftKeyPrefix}${docId}`, htmlContent);
    } catch (_) {}

    let res = null;
    if (activeDocType === 'book') {
      res = await window.api.updateBookNotes(docId, htmlContent);
    } else if (activeDocType === 'manual') {
      res = await window.api.updateManualNotes(docId, htmlContent);
    } else {
      res = await window.api.updateReportContent(docId, htmlContent);
    }

    if (res && res.success) {
      selectedReport[cfg.contentField] = htmlContent;
      selectedReport.updated_at = new Date().toISOString();
      try {
        localStorage.removeItem(`${cfg.draftKeyPrefix}${docId}`);
      } catch (_) {}
      const updatedLabel = document.getElementById('reportUpdatedLabel');
      if (updatedLabel) {
        updatedLabel.textContent = `최종 수정: ${formatDateTimeShort(selectedReport.updated_at)}`;
      }
      if (activeDocType === 'book' && typeof window.triggerQuestUpdate === 'function') {
        window.triggerQuestUpdate('book_logged', true);
      }
      updateReportSaveIndicator('saved');
    } else {
      updateReportSaveIndicator('error');
    }
  }

  function scheduleAutoSave() {
    if (!selectedReport) return;
    updateReportSaveIndicator('saving');
    if (reportSaveTimer) clearTimeout(reportSaveTimer);
    reportSaveTimer = setTimeout(() => {
      saveReportContentRealtime();
    }, 900);
  }

  async function deleteCurrentReport() {
    if (!selectedReport) return;
    const cfg = getActiveModeConfig();
    const docId = getDocId(selectedReport);
    if (!docId) return;

    if (!confirm(`'${selectedReport.title}' ${cfg.label} 항목을 삭제하시겠습니까?`)) return;

    let res = null;
    if (activeDocType === 'book') {
      res = await window.api.deleteBook(docId);
    } else if (activeDocType === 'manual') {
      res = await window.api.deleteManual(docId);
    } else {
      res = await window.api.deleteReport(docId);
    }

    if (res && res.success) {
      try {
        localStorage.removeItem(`${cfg.draftKeyPrefix}${docId}`);
      } catch (_) {}
      selectedReport = null;
      const overlay = document.getElementById('reportEditorModalOverlay');
      if (overlay) overlay.classList.remove('show');
      await refreshActiveModeList();
      if (typeof window.checkAndUnlockBodyScroll === 'function') {
        window.checkAndUnlockBodyScroll();
      }
    } else {
      alert(`${cfg.label} 삭제에 실패했습니다.`);
    }
  }

  // === 리치 에디터 서식 및 블록 삽입 도구 ===
  function updateToolbarActiveState() {
    const commands = [
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'justifyLeft',
      'justifyCenter',
      'justifyRight',
      'insertUnorderedList',
      'insertOrderedList'
    ];
    commands.forEach(cmd => {
      const btn = document.querySelector(`[data-report-cmd="${cmd}"]`);
      if (!btn) return;
      try {
        const isActive = document.queryCommandState(cmd);
        btn.classList.toggle('active', !!isActive);
      } catch (_) {}
    });
  }

  function execFormat(command, value = null) {
    restoreEditorSelection();
    document.execCommand(command, false, value);
    saveEditorSelection();
    updateToolbarActiveState();
    scheduleAutoSave();
  }

  function applyHeadingFormat(tag) {
    restoreEditorSelection();
    document.execCommand('formatBlock', false, tag);
    saveEditorSelection();
    updateToolbarActiveState();
    scheduleAutoSave();
  }

  function applyFontSize(pxSize) {
    if (!pxSize) return;
    restoreEditorSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    if (sel.isCollapsed) {
      return;
    }

    document.execCommand('fontSize', false, '7');
    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      const fontElements = editor.querySelectorAll('font[size="7"]');
      fontElements.forEach(fontEl => {
        const span = document.createElement('span');
        span.style.fontSize = pxSize;
        span.innerHTML = fontEl.innerHTML;
        fontEl.parentNode.replaceChild(span, fontEl);
      });
    }
    saveEditorSelection();
    scheduleAutoSave();
  }

  function insertHtmlBlockAtCursor(htmlString) {
    restoreEditorSelection();
    const editor = document.getElementById('reportEditorContent');
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
      editor.insertAdjacentHTML('beforeend', htmlString);
    } else {
      document.execCommand('insertHTML', false, htmlString);
    }
    bindInteractiveCheckboxes(editor);
    saveEditorSelection();
    scheduleAutoSave();
  }

  function insertCalloutBox() {
    const html = `
      <div class="report-callout">
        <div class="report-callout-title">핵심 요약</div>
        <div class="report-callout-body">주요 보고 사항이나 핵심 결론을 이곳에 작성하세요.</div>
      </div>
      <p><br></p>
    `;
    insertHtmlBlockAtCursor(html);
  }

  function insertBlockquote() {
    const html = `
      <blockquote>인용하거나 강조할 참고 문구를 입력하세요.</blockquote>
      <p><br></p>
    `;
    insertHtmlBlockAtCursor(html);
  }

  function insertDivider() {
    const html = `<hr><p><br></p>`;
    insertHtmlBlockAtCursor(html);
  }

  function insertChecklistItem() {
    const html = `
      <div class="report-check-item">
        <input type="checkbox" class="report-check-box">
        <div class="report-check-text">점검 항목을 입력하세요</div>
      </div>
    `;
    insertHtmlBlockAtCursor(html);
  }

  function bindInteractiveCheckboxes(container) {
    if (!container) return;
    container.querySelectorAll('input.report-check-box').forEach(chk => {
      chk.onchange = function () {
        const item = this.closest('.report-check-item');
        if (item) {
          item.classList.toggle('checked', this.checked);
        }
        if (this.checked) {
          this.setAttribute('checked', 'checked');
        } else {
          this.removeAttribute('checked');
        }
        scheduleAutoSave();
      };
    });
  }

  function insertTable(rows, cols) {
    const rCount = Math.max(1, Math.min(20, parseInt(rows, 10) || 3));
    const cCount = Math.max(1, Math.min(10, parseInt(cols, 10) || 3));

    let theadHtml = '<thead><tr>';
    for (let c = 0; c < cCount; c++) {
      theadHtml += `<th>항목 ${c + 1}</th>`;
    }
    theadHtml += '</tr></thead>';

    let tbodyHtml = '<tbody>';
    for (let r = 0; r < rCount - 1; r++) {
      tbodyHtml += '<tr>';
      for (let c = 0; c < cCount; c++) {
        tbodyHtml += '<td>내용</td>';
      }
      tbodyHtml += '</tr>';
    }
    if (rCount === 1) {
      tbodyHtml += '<tr>';
      for (let c = 0; c < cCount; c++) {
        tbodyHtml += '<td>내용</td>';
      }
      tbodyHtml += '</tr>';
    }
    tbodyHtml += '</tbody>';

    const tableHtml = `<table>${theadHtml}${tbodyHtml}</table><p><br></p>`;
    insertHtmlBlockAtCursor(tableHtml);
    hideAllPopovers();
  }

  // === 표 2D 논리 그리드 매트릭스 및 셀 선택/병합/분할 헬퍼 ===
  function clearSelectedTableCells() {
    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      editor.querySelectorAll('.table-cell-selected').forEach(c => c.classList.remove('table-cell-selected'));
    }
    selectedTableCells = [];
  }

  function setSelectedTableCells(cells) {
    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      editor.querySelectorAll('.table-cell-selected').forEach(c => c.classList.remove('table-cell-selected'));
    }
    selectedTableCells = Array.isArray(cells) ? cells : [];
    if (selectedTableCells.length > 1) {
      selectedTableCells.forEach(c => c.classList.add('table-cell-selected'));
    }
  }

  // thead와 tbody 경계를 넘어가는 rowSpan/병합이 깨지지 않도록 단일 tbody 섹션으로 정규화 (th 태그 스타일은 그대로 유지)
  function normalizeTableSections(table) {
    if (!table) return;
    const thead = table.querySelector('thead');
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    if (thead) {
      const headRows = Array.from(thead.rows);
      const firstBodyRow = tbody.firstChild;
      headRows.forEach(tr => {
        tbody.insertBefore(tr, firstBodyRow);
      });
      thead.remove();
    }
  }

  // rowSpan / colSpan을 반영한 2차원 논리 좌표계 매트릭스 생성
  function buildTableGrid(table) {
    const rows = Array.from(table.rows);
    const numRows = rows.length;
    const grid = Array.from({ length: numRows }, () => []);
    const cellBounds = new Map();
    let numCols = 0;

    for (let r = 0; r < numRows; r++) {
      const tr = rows[r];
      let c = 0;
      for (let i = 0; i < tr.cells.length; i++) {
        while (grid[r][c] !== undefined) {
          c++;
        }
        const cell = tr.cells[i];
        const rs = Math.max(1, parseInt(cell.rowSpan, 10) || 1);
        const cs = Math.max(1, parseInt(cell.colSpan, 10) || 1);
        const endRow = Math.min(numRows - 1, r + rs - 1);
        const actualRs = endRow - r + 1;
        if (actualRs !== rs) cell.rowSpan = actualRs;

        const bounds = {
          r,
          c,
          rowSpan: actualRs,
          colSpan: cs,
          endRow,
          endCol: c + cs - 1
        };
        cellBounds.set(cell, bounds);

        for (let dr = 0; dr < actualRs; dr++) {
          for (let dc = 0; dc < cs; dc++) {
            if (!grid[r + dr]) grid[r + dr] = [];
            grid[r + dr][c + dc] = {
              cell,
              originRow: r,
              originCol: c,
              rowSpan: actualRs,
              colSpan: cs,
              isOrigin: dr === 0 && dc === 0
            };
          }
        }
        if (c + cs > numCols) numCols = c + cs;
        c += cs;
      }
    }

    return { grid, cellBounds, numRows, numCols, rows };
  }

  // 주어진 사각형 좌표가 병합된 셀에 걸칠 경우, 모든 걸친 셀을 완전히 포함하는 최소 직사각형(Closure)으로 확장
  function getClosedRect(grid, cellBounds, startMinR, startMinC, startMaxR, startMaxC) {
    let minR = Math.min(startMinR, startMaxR);
    let maxR = Math.max(startMinR, startMaxR);
    let minC = Math.min(startMinC, startMaxC);
    let maxC = Math.max(startMinC, startMaxC);

    let changed = true;
    while (changed) {
      changed = false;
      for (let r = minR; r <= maxR; r++) {
        if (!grid[r]) continue;
        for (let c = minC; c <= maxC; c++) {
          const slot = grid[r][c];
          if (!slot || !slot.cell) continue;
          const b = cellBounds.get(slot.cell);
          if (!b) continue;
          if (b.r < minR) { minR = b.r; changed = true; }
          if (b.endRow > maxR) { maxR = b.endRow; changed = true; }
          if (b.c < minC) { minC = b.c; changed = true; }
          if (b.endCol > maxC) { maxC = b.endCol; changed = true; }
        }
      }
    }

    const seen = new Set();
    const cells = [];
    for (let r = minR; r <= maxR; r++) {
      if (!grid[r]) continue;
      for (let c = minC; c <= maxC; c++) {
        const slot = grid[r][c];
        if (slot && slot.cell && !seen.has(slot.cell)) {
          seen.add(slot.cell);
          cells.push(slot.cell);
        }
      }
    }

    return { minR, minC, maxR, maxC, cells };
  }

  // 특정 행(tr)의 논리적 열(targetCol) 위치에 새 셀을 정확히 삽입
  function insertCellAtLogicalCol(tr, targetCol, newCell, cellBounds) {
    const existingCells = Array.from(tr.cells);
    for (let i = 0; i < existingCells.length; i++) {
      const b = cellBounds.get(existingCells[i]);
      if (b && b.c >= targetCol) {
        tr.insertBefore(newCell, existingCells[i]);
        return;
      }
    }
    tr.appendChild(newCell);
  }

  // 분할 후 재병합 등으로 인해 발생한 빈 행이나 불필요하게 중복된 rowSpan/colSpan을 깔끔하게 정규화
  function cleanupRedundantSpans(table) {
    if (!table) return;
    // 1. DOM 셀이 하나도 없는 빈 행(위쪽 행들의 rowSpan으로만 채워진 행) 정리
    let changedRow = true;
    while (changedRow) {
      changedRow = false;
      const { cellBounds, rows } = buildTableGrid(table);
      if (rows.length <= 1) break;
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].cells.length === 0) {
          cellBounds.forEach((b, cell) => {
            if (b.r < r && b.endRow >= r && cell.rowSpan > 1) {
              cell.rowSpan -= 1;
            }
          });
          rows[r].remove();
          changedRow = true;
          break;
        }
      }
    }

    // 2. 모든 행에서 시작점(originCol)이 하나도 없는 유령 열(모든 행이 colSpan으로 건너뛰는 열) 정리
    let changedCol = true;
    while (changedCol) {
      changedCol = false;
      const { grid, cellBounds, numRows, numCols } = buildTableGrid(table);
      if (numCols <= 1) break;
      for (let c = 1; c < numCols; c++) {
        let hasOriginAtCol = false;
        for (let r = 0; r < numRows; r++) {
          const slot = grid[r] && grid[r][c];
          if (slot && slot.originCol === c) {
            hasOriginAtCol = true;
            break;
          }
        }
        if (!hasOriginAtCol) {
          cellBounds.forEach((b, cell) => {
            if (b.c < c && b.endCol >= c && cell.colSpan > 1) {
              cell.colSpan -= 1;
            }
          });
          changedCol = true;
          break;
        }
      }
    }
  }

  // 직사각형 영역(minR..maxR, minC..maxC)의 셀들을 좌상단 기준 셀 하나로 병합
  function mergeTableRect(table, startMinR, startMinC, startMaxR, startMaxC) {
    normalizeTableSections(table);
    const { grid, cellBounds } = buildTableGrid(table);
    const rect = getClosedRect(grid, cellBounds, startMinR, startMinC, startMaxR, startMaxC);
    if (!rect.cells || rect.cells.length <= 1) {
      return null;
    }

    const topSlot = grid[rect.minR] && grid[rect.minR][rect.minC];
    const survivor = (topSlot && topSlot.cell) ? topSlot.cell : rect.cells[0];

    // 셀 내용 취합: 기본 플레이스홀더('내용', '항목 N')가 아닌 실제 작성 텍스트를 우선 보존
    const isDefaultPlaceholder = (txt) => {
      const t = txt.trim();
      return !t || t === '내용' || /^항목(\s*\d+)?$/.test(t);
    };

    const rawPieces = rect.cells.map(c => ({
      html: (c.innerHTML || '').trim(),
      text: (c.textContent || '').trim()
    })).filter(item => item.text.length > 0);

    const meaningfulPieces = rawPieces.filter(item => !isDefaultPlaceholder(item.text));
    if (meaningfulPieces.length > 0) {
      survivor.innerHTML = meaningfulPieces.map(item => item.html).join('<br>');
    } else if (rawPieces.length > 0) {
      survivor.innerHTML = rawPieces[0].html;
    } else {
      survivor.innerHTML = '<br>';
    }

    survivor.rowSpan = rect.maxR - rect.minR + 1;
    survivor.colSpan = rect.maxC - rect.minC + 1;
    survivor.style.width = '';
    survivor.style.height = '';

    rect.cells.forEach(c => {
      if (c !== survivor) c.remove();
    });

    cleanupRedundantSpans(table);
    activeTableCell = survivor;
    setSelectedTableCells([survivor]);
    return survivor;
  }

  // 브라우저 텍스트 드래그 Selection이 여러 셀에 걸쳐 있을 경우 해당 셀들을 추출
  function getCellsFromSelectionInTable(table) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return [];
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const endNode = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    const startCell = startNode && startNode.closest ? startNode.closest('td, th') : null;
    const endCell = endNode && endNode.closest ? endNode.closest('td, th') : null;
    if (startCell && endCell && startCell.closest('table') === table && endCell.closest('table') === table && startCell !== endCell) {
      return [startCell, endCell];
    }
    return [];
  }

  // === 표 편집 동작 (행/열 추가·삭제 및 셀 병합·분할) ===
  function handleTableAction(action) {
    if (!activeTableCell) return;
    const table = activeTableCell.closest('table');
    const row = activeTableCell.closest('tr');
    if (!table || !row) return;

    if (action === 'merge-selected') {
      let targetCells = selectedTableCells.filter(c => table.contains(c));
      if (targetCells.length <= 1) {
        const selCells = getCellsFromSelectionInTable(table);
        if (selCells.length >= 2) {
          targetCells = selCells;
        }
      }
      if (targetCells.length <= 1) {
        notifyToast('마우스 드래그나 Shift+클릭으로 두 개 이상의 셀을 선택하거나, [우측 병합] / [아래 병합]을 이용해 주세요.');
        return;
      }
      normalizeTableSections(table);
      const { cellBounds } = buildTableGrid(table);
      let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
      targetCells.forEach(c => {
        const b = cellBounds.get(c);
        if (b) {
          if (b.r < minR) minR = b.r;
          if (b.c < minC) minC = b.c;
          if (b.endRow > maxR) maxR = b.endRow;
          if (b.endCol > maxC) maxC = b.endCol;
        }
      });
      if (maxR >= minR && maxC >= minC) {
        const merged = mergeTableRect(table, minR, minC, maxR, maxC);
        if (merged) notifyToast('선택한 셀이 병합되었습니다.');
      }
    } else if (action === 'merge-right') {
      normalizeTableSections(table);
      const { cellBounds, numCols } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      if (!b || b.endCol + 1 >= numCols) {
        notifyToast('오른쪽에 병합할 셀이 없습니다.');
        return;
      }
      const merged = mergeTableRect(table, b.r, b.c, b.endRow, b.endCol + 1);
      if (merged) notifyToast('오른쪽 셀과 병합되었습니다.');
    } else if (action === 'merge-down') {
      normalizeTableSections(table);
      const { cellBounds, numRows } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      if (!b || b.endRow + 1 >= numRows) {
        notifyToast('아래쪽에 병합할 셀이 없습니다.');
        return;
      }
      const merged = mergeTableRect(table, b.r, b.c, b.endRow + 1, b.endCol);
      if (merged) notifyToast('아래쪽 셀과 병합되었습니다.');
    } else if (action === 'split-col') {
      normalizeTableSections(table);
      const { cellBounds } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      if (!b) return;

      const newCell = document.createElement(activeTableCell.tagName.toLowerCase());
      newCell.innerHTML = '내용';
      if (activeTableCell.style.backgroundColor) {
        newCell.style.backgroundColor = activeTableCell.style.backgroundColor;
      }
      activeTableCell.style.width = '';

      if (b.colSpan > 1) {
        const leftSpan = Math.floor(b.colSpan / 2);
        const rightSpan = b.colSpan - leftSpan;
        activeTableCell.colSpan = leftSpan;
        newCell.colSpan = rightSpan;
        newCell.rowSpan = b.rowSpan;
      } else {
        // 1열짜리 단일 셀을 좌우 2개로 분할할 경우: 같은 열(b.c)을 지나가는 다른 행의 셀들의 colSpan을 +1 확장
        cellBounds.forEach((otherB, otherCell) => {
          if (otherCell !== activeTableCell && otherB.c <= b.c && otherB.endCol >= b.c) {
            otherCell.colSpan = (otherB.colSpan || 1) + 1;
          }
        });
        activeTableCell.colSpan = 1;
        newCell.colSpan = 1;
        newCell.rowSpan = b.rowSpan;
      }

      if (activeTableCell.nextSibling) {
        row.insertBefore(newCell, activeTableCell.nextSibling);
      } else {
        row.appendChild(newCell);
      }
      clearSelectedTableCells();
      notifyToast('셀이 좌우로 분할되었습니다.');
    } else if (action === 'split-row') {
      normalizeTableSections(table);
      const { cellBounds, rows } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      if (!b) return;

      const newCell = document.createElement(activeTableCell.tagName.toLowerCase());
      newCell.innerHTML = '내용';
      if (activeTableCell.style.backgroundColor) {
        newCell.style.backgroundColor = activeTableCell.style.backgroundColor;
      }
      activeTableCell.style.height = '';

      if (b.rowSpan > 1) {
        const topSpan = Math.floor(b.rowSpan / 2);
        const bottomSpan = b.rowSpan - topSpan;
        activeTableCell.rowSpan = topSpan;
        newCell.rowSpan = bottomSpan;
        newCell.colSpan = b.colSpan;

        const targetRow = rows[b.r + topSpan];
        if (targetRow) {
          insertCellAtLogicalCol(targetRow, b.c, newCell, cellBounds);
        }
      } else {
        // 1행짜리 단일 셀을 상하 2개로 분할할 경우: 현재 행(b.r)을 덮고 있는 다른 열의 모든 셀들의 rowSpan을 +1 확장하고 아래에 새 tr 삽입
        cellBounds.forEach((otherB, otherCell) => {
          if (otherCell !== activeTableCell && otherB.r <= b.r && otherB.endRow >= b.r) {
            otherCell.rowSpan = (otherB.rowSpan || 1) + 1;
          }
        });
        activeTableCell.rowSpan = 1;
        newCell.rowSpan = 1;
        newCell.colSpan = b.colSpan;

        const newTr = document.createElement('tr');
        newTr.appendChild(newCell);
        if (row.nextSibling) {
          row.parentNode.insertBefore(newTr, row.nextSibling);
        } else {
          row.parentNode.appendChild(newTr);
        }
      }
      clearSelectedTableCells();
      notifyToast('셀이 상하로 분할되었습니다.');
    } else if (action === 'unmerge') {
      normalizeTableSections(table);
      const targets = (selectedTableCells.length > 0 ? selectedTableCells.filter(c => table.contains(c)) : [activeTableCell])
        .filter(c => c && ((c.rowSpan && c.rowSpan > 1) || (c.colSpan && c.colSpan > 1)));

      if (targets.length === 0) {
        notifyToast('병합된 셀이 아닙니다. 일반 셀을 나누려면 [좌우 분할] 또는 [상하 분할]을 눌러주세요.');
        return;
      }

      targets.forEach(cell => {
        const { cellBounds, rows } = buildTableGrid(table);
        const b = cellBounds.get(cell);
        if (!b) return;
        const rs = b.rowSpan;
        const cs = b.colSpan;
        cell.rowSpan = 1;
        cell.colSpan = 1;
        cell.style.width = '';
        cell.style.height = '';

        for (let dr = 0; dr < rs; dr++) {
          for (let dc = 0; dc < cs; dc++) {
            if (dr === 0 && dc === 0) continue;
            const targetTr = rows[b.r + dr];
            if (!targetTr) continue;
            const restoredCell = document.createElement(cell.tagName.toLowerCase());
            restoredCell.innerHTML = '내용';
            if (cell.style.backgroundColor) {
              restoredCell.style.backgroundColor = cell.style.backgroundColor;
            }
            const latestGrid = buildTableGrid(table);
            insertCellAtLogicalCol(targetTr, b.c + dc, restoredCell, latestGrid.cellBounds);
          }
        }
      });

      cleanupRedundantSpans(table);
      clearSelectedTableCells();
      notifyToast('셀 병합이 해제되었습니다.');
    } else if (action === 'add-row') {
      normalizeTableSections(table);
      const { grid, cellBounds, numCols, rows } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      const targetRowIdx = b ? b.endRow : rows.indexOf(row);
      const refRow = rows[targetRowIdx] || row;

      const newRow = document.createElement('tr');
      let c = 0;
      while (c < numCols) {
        const slot = grid[targetRowIdx] && grid[targetRowIdx][c];
        // 위에서 내려온 셀이 targetRowIdx 아래까지 계속 이어지는 경우 rowSpan만 +1 증가
        if (slot && slot.cell && cellBounds.get(slot.cell).endRow > targetRowIdx) {
          const spanCell = slot.cell;
          const spanBounds = cellBounds.get(spanCell);
          spanCell.rowSpan = (spanBounds.rowSpan || 1) + 1;
          c = spanBounds.endCol + 1;
        } else {
          const td = document.createElement('td');
          td.innerHTML = '내용';
          newRow.appendChild(td);
          c++;
        }
      }

      if (refRow.nextSibling) {
        refRow.parentNode.insertBefore(newRow, refRow.nextSibling);
      } else {
        refRow.parentNode.appendChild(newRow);
      }
      clearSelectedTableCells();
    } else if (action === 'add-col') {
      normalizeTableSections(table);
      const { grid, cellBounds, numRows, rows } = buildTableGrid(table);
      const b = cellBounds.get(activeTableCell);
      const targetColIdx = b ? b.endCol : activeTableCell.cellIndex;

      const handledCells = new Set();
      for (let r = 0; r < numRows; r++) {
        const slot = grid[r] && grid[r][targetColIdx];
        if (slot && slot.cell && cellBounds.get(slot.cell).endCol > targetColIdx) {
          if (!handledCells.has(slot.cell)) {
            handledCells.add(slot.cell);
            slot.cell.colSpan = (slot.cell.colSpan || 1) + 1;
          }
        } else {
          const tr = rows[r];
          const isHeader = r === 0 && tr.querySelector('th');
          const newCell = document.createElement(isHeader ? 'th' : 'td');
          newCell.innerHTML = isHeader ? '항목' : '내용';
          const latestGrid = buildTableGrid(table);
          insertCellAtLogicalCol(tr, targetColIdx + 1, newCell, latestGrid.cellBounds);
        }
      }
      table.querySelectorAll('th, td').forEach(c => { c.style.width = ''; });
      clearSelectedTableCells();
    } else if (action === 'del-row') {
      normalizeTableSections(table);
      const { grid, cellBounds, numRows, numCols, rows } = buildTableGrid(table);
      if (numRows <= 1) {
        table.remove();
        hideContextBars();
      } else {
        const b = cellBounds.get(activeTableCell);
        const delR = b ? b.r : rows.indexOf(row);
        const targetTr = rows[delR];
        const nextTr = rows[delR + 1];

        const handledCells = new Set();
        for (let c = 0; c < numCols; c++) {
          const slot = grid[delR] && grid[delR][c];
          if (!slot || !slot.cell || handledCells.has(slot.cell)) continue;
          handledCells.add(slot.cell);
          const cb = cellBounds.get(slot.cell);
          if (cb.r === delR && cb.rowSpan > 1 && nextTr) {
            // 삭제할 행에서 시작해 아래 행으로 이어지는 병합 셀은 아래 행(nextTr)으로 이동시키고 rowSpan - 1
            slot.cell.rowSpan = cb.rowSpan - 1;
            insertCellAtLogicalCol(nextTr, cb.c, slot.cell, cellBounds);
          } else if (cb.r < delR && cb.endRow >= delR) {
            slot.cell.rowSpan = Math.max(1, cb.rowSpan - 1);
          }
        }
        if (targetTr) targetTr.remove();
        cleanupRedundantSpans(table);
        hideContextBars();
      }
    } else if (action === 'del-col') {
      normalizeTableSections(table);
      const { grid, cellBounds, numRows, numCols } = buildTableGrid(table);
      if (numCols <= 1) {
        table.remove();
        hideContextBars();
      } else {
        const b = cellBounds.get(activeTableCell);
        const delC = b ? b.c : activeTableCell.cellIndex;
        const handledCells = new Set();

        for (let r = 0; r < numRows; r++) {
          const slot = grid[r] && grid[r][delC];
          if (!slot || !slot.cell || handledCells.has(slot.cell)) continue;
          handledCells.add(slot.cell);
          const cb = cellBounds.get(slot.cell);
          if (cb.colSpan > 1) {
            slot.cell.colSpan = cb.colSpan - 1;
          } else {
            slot.cell.remove();
          }
        }
        table.querySelectorAll('th, td').forEach(c => { c.style.width = ''; });
        cleanupRedundantSpans(table);
        hideContextBars();
      }
    } else if (action === 'reset-size') {
      table.style.width = '100%';
      table.querySelectorAll('tr').forEach(tr => {
        tr.style.height = '';
        Array.from(tr.cells).forEach(c => {
          c.style.width = '';
          c.style.height = '';
        });
      });
      notifyToast('표 셀 크기가 초기화되었습니다.');
    } else if (action === 'del-table') {
      table.remove();
      hideContextBars();
    }

    scheduleAutoSave();
  }

  // === 표 셀 음영색(배경색) 적용 (단일 셀 및 다중 선택 셀 동시 지원) ===
  function applyTableCellBackground(bgColor) {
    if (!activeTableCell) return;
    const table = activeTableCell.closest('table');
    if (!table) return;

    let targets = selectedTableCells.filter(c => table.contains(c));
    if (targets.length <= 1) {
      const selEndpoints = getCellsFromSelectionInTable(table);
      if (selEndpoints.length >= 2) {
        const { grid, cellBounds } = buildTableGrid(table);
        const b1 = cellBounds.get(selEndpoints[0]);
        const b2 = cellBounds.get(selEndpoints[1]);
        if (b1 && b2) {
          const rect = getClosedRect(
            grid,
            cellBounds,
            Math.min(b1.r, b2.r),
            Math.min(b1.c, b2.c),
            Math.max(b1.endRow, b2.endRow),
            Math.max(b1.endCol, b2.endCol)
          );
          targets = rect.cells;
        }
      }
    }
    if (targets.length === 0) {
      targets = [activeTableCell];
    }

    targets.forEach(cell => {
      if (!bgColor) {
        cell.style.backgroundColor = '';
      } else {
        cell.style.backgroundColor = bgColor;
      }
    });

    scheduleAutoSave();
  }

  // === 표 셀(열 너비 / 행 높이) 마우스 드래그 앤 드롭 크기 조절 및 다중 셀 드래그 선택 ===
  function setupTableResizeInteractions(editor) {
    if (!editor) return;

    let guideEl = document.getElementById('reportTableResizeGuide');
    if (!guideEl) {
      guideEl = document.createElement('div');
      guideEl.id = 'reportTableResizeGuide';
      guideEl.className = 'report-table-resize-guide';
      document.body.appendChild(guideEl);
    }

    let hoverTarget = null;
    let activeDrag = null;
    let cellDragSelect = null;
    let lastHoveredCell = null;
    const BORDER_THRESHOLD = 7;
    const MIN_COL_WIDTH = 40;
    const MIN_ROW_HEIGHT = 28;

    function clearHoverCursor() {
      if (lastHoveredCell) {
        lastHoveredCell.style.cursor = '';
        lastHoveredCell = null;
      }
      hoverTarget = null;
      if (!activeDrag && guideEl) {
        guideEl.classList.remove('active');
      }
    }

    // 표의 각 논리적 열(0..numCols-1)의 현재 렌더링 폭 추정
    function getLogicalColumnWidths(table) {
      const { grid, cellBounds, numRows, numCols } = buildTableGrid(table);
      const colWidths = new Array(numCols).fill(0);

      // 1차: colSpan === 1인 단일 열 셀로부터 정확한 폭 측정
      for (let c = 0; c < numCols; c++) {
        for (let r = 0; r < numRows; r++) {
          const slot = grid[r] && grid[r][c];
          if (slot && slot.colSpan === 1 && slot.cell) {
            colWidths[c] = slot.cell.getBoundingClientRect().width;
            break;
          }
        }
      }
      // 2차: 모든 행이 병합되어 있는 열은 병합 셀 폭을 균등 분배
      const totalTableW = table.getBoundingClientRect().width;
      const defaultW = numCols > 0 ? totalTableW / numCols : 80;
      for (let c = 0; c < numCols; c++) {
        if (!colWidths[c]) colWidths[c] = defaultW;
      }
      return { colWidths, numCols, cellBounds };
    }

    editor.addEventListener('mousemove', (e) => {
      if (activeDrag) return;

      // 다중 셀 마우스 드래그 선택 처리
      if (cellDragSelect) {
        const hoverCell = e.target.closest && e.target.closest('td, th');
        if (hoverCell && hoverCell.closest('table') === cellDragSelect.table) {
          if (hoverCell !== cellDragSelect.startCell || cellDragSelect.isMultiDragging) {
            cellDragSelect.isMultiDragging = true;
            const { grid, cellBounds } = buildTableGrid(cellDragSelect.table);
            const b1 = cellBounds.get(cellDragSelect.startCell);
            const b2 = cellBounds.get(hoverCell);
            if (b1 && b2) {
              const rect = getClosedRect(
                grid,
                cellBounds,
                Math.min(b1.r, b2.r),
                Math.min(b1.c, b2.c),
                Math.max(b1.endRow, b2.endRow),
                Math.max(b1.endCol, b2.endCol)
              );
              setSelectedTableCells(rect.cells);
              const sel = window.getSelection();
              if (sel) sel.removeAllRanges();
            }
          }
        }
        return;
      }

      const cell = e.target.closest && e.target.closest('td, th');
      if (!cell || !editor.contains(cell)) {
        clearHoverCursor();
        return;
      }

      const table = cell.closest('table');
      const row = cell.closest('tr');
      if (!table || !row) {
        clearHoverCursor();
        return;
      }

      const rect = cell.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const distRight = Math.abs(rect.right - e.clientX);
      const distLeft = Math.abs(e.clientX - rect.left);
      const distBottom = Math.abs(rect.bottom - e.clientY);

      if (lastHoveredCell && lastHoveredCell !== cell) {
        lastHoveredCell.style.cursor = '';
      }
      lastHoveredCell = cell;

      const { cellBounds } = buildTableGrid(table);
      const b = cellBounds.get(cell);
      const rightLogicalCol = b ? b.endCol : cell.cellIndex;
      const leftLogicalCol = b ? b.c - 1 : cell.cellIndex - 1;

      if (distRight <= BORDER_THRESHOLD) {
        cell.style.cursor = 'col-resize';
        hoverTarget = {
          type: 'col',
          table: table,
          colIndex: rightLogicalCol,
          borderX: rect.right
        };
        guideEl.style.left = `${rect.right - 1}px`;
        guideEl.style.top = `${tableRect.top}px`;
        guideEl.style.width = '2px';
        guideEl.style.height = `${tableRect.height}px`;
        guideEl.classList.add('active');
      } else if (distLeft <= BORDER_THRESHOLD && leftLogicalCol >= 0) {
        cell.style.cursor = 'col-resize';
        hoverTarget = {
          type: 'col',
          table: table,
          colIndex: leftLogicalCol,
          borderX: rect.left
        };
        guideEl.style.left = `${rect.left - 1}px`;
        guideEl.style.top = `${tableRect.top}px`;
        guideEl.style.width = '2px';
        guideEl.style.height = `${tableRect.height}px`;
        guideEl.classList.add('active');
      } else if (distBottom <= BORDER_THRESHOLD) {
        cell.style.cursor = 'row-resize';
        hoverTarget = {
          type: 'row',
          table: table,
          row: row,
          borderY: rect.bottom
        };
        guideEl.style.left = `${tableRect.left}px`;
        guideEl.style.top = `${rect.bottom - 1}px`;
        guideEl.style.width = `${tableRect.width}px`;
        guideEl.style.height = '2px';
        guideEl.classList.add('active');
      } else {
        clearHoverCursor();
      }
    });

    editor.addEventListener('mouseleave', () => {
      if (!activeDrag) clearHoverCursor();
    });

    editor.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      // 1) 셀 경계선 드래그 리사이즈 시작
      if (hoverTarget) {
        e.preventDefault();
        e.stopPropagation();

        if (hoverTarget.type === 'col') {
          const table = hoverTarget.table;
          const { colWidths, numCols, cellBounds } = getLogicalColumnWidths(table);
          if (numCols === 0) return;

          const startTableWidth = table.getBoundingClientRect().width;
          const tableRect = table.getBoundingClientRect();

          table.style.width = `${startTableWidth}px`;
          cellBounds.forEach((b, c) => {
            let w = 0;
            for (let k = b.c; k <= b.endCol; k++) w += colWidths[k] || 0;
            if (w > 0) c.style.width = `${Math.round(w)}px`;
          });

          activeDrag = {
            type: 'col',
            table: table,
            colIndex: hoverTarget.colIndex,
            numCols: numCols,
            startX: e.clientX,
            startBorderX: hoverTarget.borderX,
            startWidths: colWidths,
            startTableWidth: startTableWidth,
            tableTop: tableRect.top,
            tableHeight: tableRect.height
          };
          editor.classList.add('table-resizing-col');
        } else if (hoverTarget.type === 'row') {
          const table = hoverTarget.table;
          const row = hoverTarget.row;
          const startHeight = row.getBoundingClientRect().height;
          const tableRect = table.getBoundingClientRect();

          activeDrag = {
            type: 'row',
            table: table,
            row: row,
            startY: e.clientY,
            startBorderY: hoverTarget.borderY,
            startHeight: startHeight,
            tableLeft: tableRect.left,
            tableWidth: tableRect.width
          };
          editor.classList.add('table-resizing-row');
        }
        return;
      }

      // 2) 셀 내부 클릭 / Shift+클릭 범위 선택 / 다중 셀 드래그 선택 시작
      const cell = e.target.closest && e.target.closest('td, th');
      if (cell && editor.contains(cell)) {
        const table = cell.closest('table');
        if (e.shiftKey && activeTableCell && activeTableCell.closest('table') === table) {
          e.preventDefault();
          const { grid, cellBounds } = buildTableGrid(table);
          const b1 = cellBounds.get(activeTableCell);
          const b2 = cellBounds.get(cell);
          if (b1 && b2) {
            const rect = getClosedRect(
              grid,
              cellBounds,
              Math.min(b1.r, b2.r),
              Math.min(b1.c, b2.c),
              Math.max(b1.endRow, b2.endRow),
              Math.max(b1.endCol, b2.endCol)
            );
            setSelectedTableCells(rect.cells);
            justFinishedMultiCellDrag = true;
            setTimeout(() => { justFinishedMultiCellDrag = false; }, 80);
            const tableBar = document.getElementById('reportTableContextBar');
            if (tableBar) tableBar.classList.add('show');
          }
          return;
        }

        activeTableCell = cell;
        setSelectedTableCells([cell]);
        cellDragSelect = {
          table: table,
          startCell: cell,
          isMultiDragging: false
        };
      } else {
        clearSelectedTableCells();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!activeDrag) return;
      e.preventDefault();

      if (activeDrag.type === 'col') {
        const { table, colIndex, numCols, startX, startBorderX, startWidths, startTableWidth, tableTop, tableHeight } = activeDrag;
        const rawDeltaX = e.clientX - startX;
        const { cellBounds } = buildTableGrid(table);
        const currentWidths = startWidths.slice();

        if (colIndex < numCols - 1) {
          const minDelta = -(startWidths[colIndex] - MIN_COL_WIDTH);
          const maxDelta = startWidths[colIndex + 1] - MIN_COL_WIDTH;
          const clampedDelta = Math.max(minDelta, Math.min(maxDelta, rawDeltaX));

          currentWidths[colIndex] = Math.round(startWidths[colIndex] + clampedDelta);
          currentWidths[colIndex + 1] = Math.round(startWidths[colIndex + 1] - clampedDelta);

          cellBounds.forEach((b, c) => {
            if (b.c <= colIndex + 1 && b.endCol >= colIndex) {
              let sumW = 0;
              for (let k = b.c; k <= b.endCol; k++) sumW += currentWidths[k] || 0;
              c.style.width = `${Math.round(sumW)}px`;
            }
          });

          guideEl.style.left = `${startBorderX + clampedDelta - 1}px`;
          guideEl.style.top = `${tableTop}px`;
          guideEl.style.width = '2px';
          guideEl.style.height = `${tableHeight}px`;
          guideEl.classList.add('active');
        } else {
          const minDelta = -(startWidths[colIndex] - MIN_COL_WIDTH);
          const clampedDelta = Math.max(minDelta, rawDeltaX);

          currentWidths[colIndex] = Math.round(startWidths[colIndex] + clampedDelta);
          const newTableW = Math.round(startTableWidth + clampedDelta);

          table.style.width = `${newTableW}px`;
          cellBounds.forEach((b, c) => {
            if (b.endCol === colIndex) {
              let sumW = 0;
              for (let k = b.c; k <= b.endCol; k++) sumW += currentWidths[k] || 0;
              c.style.width = `${Math.round(sumW)}px`;
            }
          });

          guideEl.style.left = `${startBorderX + clampedDelta - 1}px`;
          guideEl.style.top = `${tableTop}px`;
          guideEl.style.width = '2px';
          guideEl.style.height = `${tableHeight}px`;
          guideEl.classList.add('active');
        }
      } else if (activeDrag.type === 'row') {
        const { row, startY, startBorderY, startHeight, tableLeft, tableWidth } = activeDrag;
        const rawDeltaY = e.clientY - startY;
        const minDelta = -(startHeight - MIN_ROW_HEIGHT);
        const clampedDelta = Math.max(minDelta, rawDeltaY);
        const newH = Math.round(startHeight + clampedDelta);

        row.style.height = `${newH}px`;
        Array.from(row.cells).forEach(c => {
          if (!c.rowSpan || c.rowSpan === 1) {
            c.style.height = `${newH}px`;
          }
        });

        guideEl.style.left = `${tableLeft}px`;
        guideEl.style.top = `${startBorderY + clampedDelta - 1}px`;
        guideEl.style.width = `${tableWidth}px`;
        guideEl.style.height = '2px';
        guideEl.classList.add('active');
      }
    });

    window.addEventListener('mouseup', () => {
      if (cellDragSelect) {
        if (cellDragSelect.isMultiDragging) {
          justFinishedMultiCellDrag = true;
          setTimeout(() => { justFinishedMultiCellDrag = false; }, 80);
          const tableBar = document.getElementById('reportTableContextBar');
          if (tableBar) tableBar.classList.add('show');
        }
        cellDragSelect = null;
      }
      if (!activeDrag) return;
      editor.classList.remove('table-resizing-col', 'table-resizing-row');
      activeDrag = null;
      clearHoverCursor();
      scheduleAutoSave();
    });
  }

  // === 이미지 첨부 및 리사이징 ===
  function processImageFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const maxWidth = 1400;
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function insertImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await processImageFileToDataUrl(file);
      const html = `
        <figure class="report-image-figure">
          <img src="${dataUrl}" alt="첨부 이미지" style="width: 100%;">
          <figcaption class="report-image-caption" contenteditable="true">이미지 설명 입력 (불필요 시 지우세요)</figcaption>
        </figure>
        <p><br></p>
      `;
      insertHtmlBlockAtCursor(html);
    } catch (err) {
      console.error('이미지 삽입 실패:', err);
      alert('이미지를 불러오는 중 오류가 발생했습니다.');
    }
  }

  function handleImageAction(action) {
    if (!activeImageElement) return;
    if (action === 'w-50') {
      activeImageElement.style.width = '50%';
    } else if (action === 'w-75') {
      activeImageElement.style.width = '75%';
    } else if (action === 'w-100') {
      activeImageElement.style.width = '100%';
    } else if (action === 'del-img') {
      const fig = activeImageElement.closest('.report-image-figure');
      if (fig) {
        fig.remove();
      } else {
        activeImageElement.remove();
      }
      hideContextBars();
    }
    scheduleAutoSave();
  }

  function hideAllPopovers() {
    document.querySelectorAll('.toolbar-popover').forEach(p => p.classList.remove('show'));
  }

  function hideContextBars() {
    activeTableCell = null;
    clearSelectedTableCells();
    if (activeImageElement) {
      activeImageElement.classList.remove('selected-media');
      activeImageElement = null;
    }
    const tableBar = document.getElementById('reportTableContextBar');
    const imgBar = document.getElementById('reportImageContextBar');
    if (tableBar) tableBar.classList.remove('show');
    if (imgBar) imgBar.classList.remove('show');
  }

  // === 내보내기 1: 서식 유지 복사 (Rich Text Copy) ===
  function buildInlineStyledHtmlForClipboard() {
    const editor = document.getElementById('reportEditorContent');
    const titleInput = document.getElementById('reportEditorTitleInput');
    if (!editor) return { html: '', text: '' };

    const title = (titleInput ? titleInput.value.trim() : '') || '제목 없는 보고서';
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.table-cell-selected').forEach(cell => cell.classList.remove('table-cell-selected'));

    clone.querySelectorAll('h1').forEach(el => {
      el.style.cssText = 'font-size:22px; font-weight:800; color:#0f172a; margin:20px 0 10px; padding-bottom:6px; border-bottom:2px solid #e2e8f0;';
    });
    clone.querySelectorAll('h2').forEach(el => {
      el.style.cssText = 'font-size:18px; font-weight:800; color:#1e293b; margin:18px 0 8px; padding-left:10px; border-left:4px solid #334155;';
    });
    clone.querySelectorAll('h3').forEach(el => {
      el.style.cssText = 'font-size:16px; font-weight:700; color:#334155; margin:14px 0 6px;';
    });
    clone.querySelectorAll('.report-callout').forEach(el => {
      el.style.cssText = 'background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #1e293b; border-radius:6px; padding:12px 16px; margin:12px 0;';
    });
    clone.querySelectorAll('.report-callout-title').forEach(el => {
      el.style.cssText = 'font-size:14px; font-weight:800; color:#0f172a; margin-bottom:4px;';
    });
    clone.querySelectorAll('.report-callout-body').forEach(el => {
      el.style.cssText = 'font-size:14px; color:#334155; line-height:1.6;';
    });
    clone.querySelectorAll('blockquote').forEach(el => {
      el.style.cssText = 'margin:12px 0; padding:10px 14px; border-left:3px solid #64748b; background:#f8fafc; color:#475569;';
    });
    clone.querySelectorAll('table').forEach(el => {
      const customW = el.style.width || '100%';
      el.style.cssText = `width:${customW}; border-collapse:collapse; margin:12px 0; font-size:13.5px; table-layout:fixed;`;
    });
    clone.querySelectorAll('th').forEach(el => {
      const w = el.style.width ? `width:${el.style.width};` : '';
      const h = el.style.height ? `height:${el.style.height};` : '';
      const bg = el.style.backgroundColor || '#f1f5f9';
      const align = el.style.textAlign || 'left';
      el.style.cssText = `${w}${h}border:1px solid #cbd5e1; padding:8px 10px; background-color:${bg}; font-weight:700; color:#0f172a; text-align:${align};`;
    });
    clone.querySelectorAll('td').forEach(el => {
      const w = el.style.width ? `width:${el.style.width};` : '';
      const h = el.style.height ? `height:${el.style.height};` : '';
      const bg = el.style.backgroundColor ? `background-color:${el.style.backgroundColor};` : '';
      const align = el.style.textAlign || 'left';
      el.style.cssText = `${w}${h}${bg}border:1px solid #cbd5e1; padding:8px 10px; color:#191f28; text-align:${align};`;
    });
    clone.querySelectorAll('.report-check-item').forEach(el => {
      const chk = el.querySelector('input.report-check-box');
      const txt = el.querySelector('.report-check-text');
      const isChecked = chk && chk.checked;
      const mark = isChecked ? '[완료] ' : '[ ] ';
      const p = document.createElement('p');
      p.style.cssText = `margin:4px 0; font-size:14.5px; ${isChecked ? 'color:#64748b; text-decoration:line-through;' : 'color:#191f28;'}`;
      p.textContent = mark + (txt ? txt.textContent : '');
      el.parentNode.replaceChild(p, el);
    });

    const wrapperHtml = `
      <div style="font-family:'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#191f28; line-height:1.7; font-size:15px; max-width:780px;">
        <h1 style="font-size:26px; font-weight:800; color:#0f172a; margin:0 0 16px 0; padding-bottom:12px; border-bottom:2px solid #0f172a;">${escapeHtmlText(title)}</h1>
        ${clone.innerHTML}
      </div>
    `;

    const plainText = `${title}\n${'='.repeat(30)}\n\n${ (editor.innerText || '').trim() }`;
    return { html: wrapperHtml, text: plainText };
  }

  async function copyFormattedReport() {
    const { html, text } = buildInlineStyledHtmlForClipboard();
    if (!text) return;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
        notifyToast('서식이 포함된 문서가 클립보드에 복사되었습니다.');
        return;
      }
    } catch (err) {
      console.warn('ClipboardItem 복사 폴백 실행:', err);
    }

    // 폴백: 임시 DOM 선택 복사
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);

    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(tempDiv);
    notifyToast('서식이 포함된 문서가 클립보드에 복사되었습니다.');
  }

  // === 내보내기 2 & 3: 고해상도 PNG 및 PDF 렌더링 스테이지 생성 ===
  function createOffscreenExportStage() {
    const cfg = getActiveModeConfig();
    const editor = document.getElementById('reportEditorContent');
    const titleInput = document.getElementById('reportEditorTitleInput');
    const title = (titleInput ? titleInput.value.trim() : '') || `제목 없는 ${cfg.label}`;
    const status = selectedReport ? selectedReport.status : cfg.defaultStatus;
    const dateStr = formatDateTimeShort(selectedReport?.updated_at || new Date().toISOString());

    const stage = document.createElement('div');
    stage.className = 'report-export-stage';

    const contentClone = editor.cloneNode(true);
    contentClone.removeAttribute('contenteditable');
    contentClone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    contentClone.querySelectorAll('img.selected-media').forEach(img => img.classList.remove('selected-media'));
    contentClone.querySelectorAll('.table-cell-selected').forEach(cell => cell.classList.remove('table-cell-selected'));

    // 캡션 기본 플레이스홀더 텍스트인 경우 내보내기에서 숨김
    contentClone.querySelectorAll('.report-image-caption').forEach(cap => {
      if (cap.textContent.trim() === '이미지 설명 입력 (불필요 시 지우세요)' || !cap.textContent.trim()) {
        cap.remove();
      }
    });

    // 체크박스를 선명한 SVG 아이콘 박스로 변환하여 html2canvas에서 깨지지 않도록 처리
    contentClone.querySelectorAll('.report-check-item').forEach(item => {
      const chk = item.querySelector('input.report-check-box');
      const isChecked = chk && chk.checked;
      if (chk) {
        const boxSpan = document.createElement('span');
        boxSpan.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; margin-top:4px; flex-shrink:0;';
        if (isChecked) {
          boxSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" fill="#0f172a"></rect><polyline points="9 12 11 14 15 10" stroke="#ffffff"></polyline></svg>`;
        } else {
          boxSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4" fill="#ffffff"></rect></svg>`;
        }
        chk.parentNode.replaceChild(boxSpan, chk);
      }
    });

    stage.innerHTML = `
      <div class="report-export-header">
        <div class="report-export-title">${escapeHtmlText(title)}</div>
        <div class="report-export-meta">
          <span>분류: ${escapeHtmlText(cfg.label)}</span>
          <span>상태: ${escapeHtmlText(status)}</span>
          <span>작성일시: ${escapeHtmlText(dateStr)}</span>
        </div>
      </div>
      <div class="report-editor-content" style="min-height: auto;">
        ${contentClone.innerHTML}
      </div>
    `;

    document.body.appendChild(stage);
    return { stage, title };
  }

  async function exportReportToPng() {
    if (typeof window.html2canvas !== 'function') {
      alert('이미지 변환 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const cfg = getActiveModeConfig();
    const btn = document.getElementById('btnExportReportPng');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'PNG 생성 중...';
    }

    const { stage, title } = createOffscreenExportStage();

    try {
      const canvas = await window.html2canvas(stage, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 820
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
      link.download = `${cfg.exportPrefix}_${safeTitle}_${getExportDateStamp()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notifyToast('고해상도 PNG 이미지 저장이 완료되었습니다.');
    } catch (err) {
      console.error('PNG 저장 오류:', err);
      alert('PNG 이미지 생성 중 오류가 발생했습니다.');
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>PNG 저장`;
      }
    }
  }

  async function exportReportToPdf() {
    if (typeof window.html2canvas !== 'function' || !window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF 변환 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const cfg = getActiveModeConfig();
    const btn = document.getElementById('btnExportReportPdf');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'PDF 생성 중...';
    }

    const { stage, title } = createOffscreenExportStage();

    try {
      const canvas = await window.html2canvas(stage, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 820
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidthMm = 210; // 표준 문서 폭 (210mm)
      const pdfHeightMm = Math.max(120, (canvas.height * pdfWidthMm) / canvas.width);

      const { jsPDF } = window.jspdf;
      // 표나 이미지가 페이지 경계에서 잘리지 않도록 문서 전체 길이에 맞춘 단일 연속 페이지 PDF로 최적화 생성
      const pdf = new jsPDF({
        orientation: pdfHeightMm >= pdfWidthMm ? 'p' : 'l',
        unit: 'mm',
        format: [pdfWidthMm, pdfHeightMm]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`${cfg.exportPrefix}_${safeTitle}_${getExportDateStamp()}.pdf`);
      notifyToast('최적화 PDF 문서 저장이 완료되었습니다.');
    } catch (err) {
      console.error('PDF 저장 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>PDF 저장`;
      }
    }
  }

  // === 초기 이벤트 바인딩 ===
  function initReportStudio() {
    const reportBar = document.getElementById('reportBar');
    if (reportBar) reportBar.onclick = openReportShelfModal;

    const shelfClose = document.getElementById('reportShelfModalClose');
    if (shelfClose) shelfClose.onclick = closeReportShelfModal;

    const shelfOverlay = document.getElementById('reportShelfModalOverlay');
    if (shelfOverlay) {
      shelfOverlay.onclick = (e) => {
        if (e.target === shelfOverlay) closeReportShelfModal();
      };
    }

    const addBtn = document.getElementById('reportAddBtn');
    if (addBtn) addBtn.onclick = addReport;

    const newTitleInput = document.getElementById('reportNewTitleInput');
    if (newTitleInput) {
      newTitleInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addReport();
        }
      };
    }

    // 보관함 탭 필터
    document.querySelectorAll('.report-tab').forEach(tab => {
      tab.onclick = function () {
        document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentReportFilter = this.dataset.status;
        renderReportList();
      };
    });

    // 보관함 실시간 검색
    const searchInput = document.getElementById('reportSearchInput');
    const searchClear = document.getElementById('reportSearchClear');
    if (searchInput) {
      searchInput.oninput = function () {
        currentReportSearch = this.value.trim();
        if (searchClear) {
          searchClear.classList.toggle('visible', currentReportSearch.length > 0);
        }
        renderReportList();
      };
    }
    if (searchClear) {
      searchClear.onclick = function () {
        if (searchInput) searchInput.value = '';
        currentReportSearch = '';
        this.classList.remove('visible');
        renderReportList();
      };
    }

    // 에디터 모달 닫기 / 전체화면 / 삭제
    const editorClose = document.getElementById('reportEditorModalClose');
    if (editorClose) editorClose.onclick = closeReportEditorModal;

    const editorConfirm = document.getElementById('reportEditorConfirmBtn');
    if (editorConfirm) editorConfirm.onclick = closeReportEditorModal;

    const fullscreenBtn = document.getElementById('reportFullscreenBtn');
    if (fullscreenBtn) fullscreenBtn.onclick = toggleEditorFullscreen;

    const deleteBtn = document.getElementById('reportDeleteBtn');
    if (deleteBtn) deleteBtn.onclick = deleteCurrentReport;

    // 에디터 제목 수정
    const editorTitleInput = document.getElementById('reportEditorTitleInput');
    if (editorTitleInput) {
      editorTitleInput.onblur = saveReportTitleRealtime;
      editorTitleInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          editorTitleInput.blur();
        }
      };
    }

    // 상태 변경 칩
    document.querySelectorAll('.report-status-chip').forEach(chip => {
      chip.onclick = function () {
        changeReportStatus(this.dataset.status);
      };
    });

    // 툴바 명령 바인딩
    const headingSelect = document.getElementById('reportHeadingSelect');
    if (headingSelect) {
      headingSelect.onchange = function () {
        applyHeadingFormat(this.value);
        this.value = 'P';
      };
    }

    const fontSizeSelect = document.getElementById('reportFontSizeSelect');
    if (fontSizeSelect) {
      fontSizeSelect.onchange = function () {
        applyFontSize(this.value);
        this.value = '';
      };
    }

    document.querySelectorAll('[data-report-cmd]').forEach(btn => {
      btn.onmousedown = (e) => {
        // 버튼 클릭 시 에디터 포커스 및 선택 영역 잃지 않도록 방지
        e.preventDefault();
      };
      btn.onclick = function () {
        const cmd = this.dataset.reportCmd;
        const val = this.dataset.reportVal || null;
        execFormat(cmd, val);
      };
    });

    // 팝오버 토글 (글자색, 형광펜, 표 생성)
    const btnTextColor = document.getElementById('btnReportTextColor');
    const popTextColor = document.getElementById('popoverTextColor');
    if (btnTextColor && popTextColor) {
      btnTextColor.onmousedown = (e) => e.preventDefault();
      btnTextColor.onclick = (e) => {
        e.stopPropagation();
        saveEditorSelection();
        const isOpen = popTextColor.classList.contains('show');
        hideAllPopovers();
        if (!isOpen) popTextColor.classList.add('show');
      };
    }

    const btnHighlight = document.getElementById('btnReportHighlight');
    const popHighlight = document.getElementById('popoverHighlight');
    if (btnHighlight && popHighlight) {
      btnHighlight.onmousedown = (e) => e.preventDefault();
      btnHighlight.onclick = (e) => {
        e.stopPropagation();
        saveEditorSelection();
        const isOpen = popHighlight.classList.contains('show');
        hideAllPopovers();
        if (!isOpen) popHighlight.classList.add('show');
      };
    }

    const btnTable = document.getElementById('btnReportTable');
    const popTable = document.getElementById('popoverTable');
    if (btnTable && popTable) {
      btnTable.onmousedown = (e) => e.preventDefault();
      btnTable.onclick = (e) => {
        e.stopPropagation();
        saveEditorSelection();
        const isOpen = popTable.classList.contains('show');
        hideAllPopovers();
        if (!isOpen) popTable.classList.add('show');
      };
    }

    // 색상 스와치 클릭
    document.querySelectorAll('[data-fore-color]').forEach(swatch => {
      swatch.onmousedown = (e) => e.preventDefault();
      swatch.onclick = function () {
        execFormat('foreColor', this.dataset.foreColor);
        hideAllPopovers();
      };
    });

    document.querySelectorAll('[data-hilite-color]').forEach(swatch => {
      swatch.onmousedown = (e) => e.preventDefault();
      swatch.onclick = function () {
        execFormat('hiliteColor', this.dataset.hiliteColor);
        hideAllPopovers();
      };
    });

    // 표 생성 제출
    const btnInsertTableConfirm = document.getElementById('btnInsertTableConfirm');
    if (btnInsertTableConfirm) {
      btnInsertTableConfirm.onclick = () => {
        const rows = document.getElementById('reportTableRowsInput')?.value || 3;
        const cols = document.getElementById('reportTableColsInput')?.value || 3;
        insertTable(rows, cols);
      };
    }

    // 구조 블록 삽입 버튼
    const btnCallout = document.getElementById('btnReportCallout');
    if (btnCallout) {
      btnCallout.onmousedown = (e) => e.preventDefault();
      btnCallout.onclick = insertCalloutBox;
    }

    const btnQuote = document.getElementById('btnReportQuote');
    if (btnQuote) {
      btnQuote.onmousedown = (e) => e.preventDefault();
      btnQuote.onclick = insertBlockquote;
    }

    const btnChecklist = document.getElementById('btnReportChecklist');
    if (btnChecklist) {
      btnChecklist.onmousedown = (e) => e.preventDefault();
      btnChecklist.onclick = insertChecklistItem;
    }

    const btnDivider = document.getElementById('btnReportDivider');
    if (btnDivider) {
      btnDivider.onmousedown = (e) => e.preventDefault();
      btnDivider.onclick = insertDivider;
    }

    // 이미지 업로드
    const btnImage = document.getElementById('btnReportImage');
    const fileInput = document.getElementById('reportImageFileInput');
    if (btnImage && fileInput) {
      btnImage.onmousedown = (e) => {
        e.preventDefault();
        saveEditorSelection();
      };
      btnImage.onclick = () => fileInput.click();
      fileInput.onchange = async function () {
        if (this.files && this.files[0]) {
          await insertImageFile(this.files[0]);
          this.value = '';
        }
      };
    }

    // 표/이미지 컨텍스트 바 액션
    document.querySelectorAll('[data-table-action]').forEach(btn => {
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = function () {
        handleTableAction(this.dataset.tableAction);
      };
    });

    // 표 셀 음영색 스와치 및 직접선택 컬러 피커
    document.querySelectorAll('[data-cell-bg]').forEach(swatch => {
      swatch.onmousedown = (e) => e.preventDefault();
      swatch.onclick = function () {
        applyTableCellBackground(this.dataset.cellBg);
      };
    });

    const cellColorPicker = document.getElementById('reportTableCellColorPicker');
    if (cellColorPicker) {
      cellColorPicker.oninput = function () {
        applyTableCellBackground(this.value);
      };
      cellColorPicker.onchange = function () {
        applyTableCellBackground(this.value);
      };
    }

    document.querySelectorAll('[data-img-action]').forEach(btn => {
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = function () {
        handleImageAction(this.dataset.imgAction);
      };
    });

    // 말머리 기호(ul/ol li)나 문단 안에서 Shift+Enter 입력 시 새 말머리(li)를 만들지 않고 현재 항목 내 줄바꿈(<br>)만 수행하는 헬퍼
    function insertSoftLineBreakAtCursor(editorEl) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!editorEl.contains(range.commonAncestorContainer)) return;

      range.deleteContents();

      const br = document.createElement('br');
      range.insertNode(br);

      // <br> 뒤에 텍스트나 노드가 없으면 커서가 아랫줄에 시각적으로 위치할 수 있도록 보조 <br>을 추가
      let next = br.nextSibling;
      while (next && next.nodeType === Node.TEXT_NODE && next.textContent === '') {
        next = next.nextSibling;
      }
      if (!next) {
        const trailingBr = document.createElement('br');
        br.parentNode.insertBefore(trailingBr, br.nextSibling);
      }

      const newRange = document.createRange();
      newRange.setStartAfter(br);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      saveEditorSelection();
      scheduleAutoSave();
    }

    // 에디터 본문 이벤트 (자동 저장, 단축키, 선택 영역 추적, 클립보드 이미지 붙여넣기, 컨텍스트 감지)
    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      let pendingShiftEnterLi = null;
      let pendingShiftEnterNextLi = null;
      let shiftEnterHandledInBeforeInput = false;

      editor.addEventListener('beforeinput', (e) => {
        if (pendingShiftEnterLi && (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak')) {
          e.preventDefault();
          shiftEnterHandledInBeforeInput = true;
          insertSoftLineBreakAtCursor(editor);
        }
      });

      editor.addEventListener('keydown', (e) => {
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        const code = e.code || '';
        const keyLower = (e.key || '').toLowerCase();

        // 0. Shift + Enter : 말머리 기호(li) 등 내부에서 새 말머리를 생성하지 않고 들여쓰기된 줄바꿈(<br>) 삽입
        if (e.key === 'Enter' && e.shiftKey && !isCmdOrCtrl && !e.altKey) {
          const sel = window.getSelection();
          const anchorEl = sel && sel.anchorNode
            ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement)
            : null;
          const currentLi = anchorEl && anchorEl.closest ? anchorEl.closest('li') : null;

          // 한글 조합 중(isComposing / keyCode 229)에 Shift+Enter를 누른 경우:
          // 브라우저가 조합 완료와 함께 새 <li>로 쪼개버리는 현상을 방지 및 즉시 병합 복구
          if (e.isComposing || e.keyCode === 229) {
            pendingShiftEnterLi = currentLi || editor;
            pendingShiftEnterNextLi = currentLi ? currentLi.nextElementSibling : null;
            shiftEnterHandledInBeforeInput = false;
            e.preventDefault();

            setTimeout(() => {
              const targetLi = currentLi;
              pendingShiftEnterLi = null;

              if (shiftEnterHandledInBeforeInput) {
                shiftEnterHandledInBeforeInput = false;
                return;
              }

              // 만약 브라우저 IME가 강제로 새 <li>를 생성해 분리시켰다면 다시 이전 <li> 내부의 <br> 뒤로 병합
              if (targetLi && targetLi.parentNode && targetLi.nextElementSibling !== pendingShiftEnterNextLi) {
                const splitLi = targetLi.nextElementSibling;
                if (splitLi && splitLi.tagName === 'LI') {
                  // targetLi 끝에 불필요한 빈 <br> 정리 후 줄바꿈 <br> 삽입
                  const br = document.createElement('br');
                  targetLi.appendChild(br);

                  const movedNodes = [];
                  while (splitLi.firstChild) {
                    const child = splitLi.firstChild;
                    targetLi.appendChild(child);
                    movedNodes.push(child);
                  }
                  splitLi.remove();

                  // 병합 후 커서가 아랫줄에 보이도록 보조 <br> 확인
                  const hasVisibleMoved = movedNodes.some(n =>
                    (n.nodeType === Node.TEXT_NODE && n.textContent.length > 0) ||
                    (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BR')
                  );
                  if (!hasVisibleMoved && (!br.nextSibling || br.nextSibling.tagName !== 'BR')) {
                    targetLi.appendChild(document.createElement('br'));
                  }

                  const s = window.getSelection();
                  if (s) {
                    const r = document.createRange();
                    r.setStartAfter(br);
                    r.collapse(true);
                    s.removeAllRanges();
                    s.addRange(r);
                  }
                  saveEditorSelection();
                  scheduleAutoSave();
                  return;
                }
              }

              // 새 <li>로 쪼개지지 않고 기본 동작만 막힌 경우 커서 위치에 <br> 삽입
              insertSoftLineBreakAtCursor(editor);
            }, 0);
            return;
          }

          // 일반(영문 또는 한글 조합 완료 상태) Shift + Enter
          e.preventDefault();
          insertSoftLineBreakAtCursor(editor);
          return;
        }

        // 1. 기본 텍스트 서식 단축키 (한글 입력 상태 ㅠ, ㅕ, ㅑ 등에서도 e.code 및 자모 매칭으로 완벽 동작)
        if (isCmdOrCtrl && !e.shiftKey && !e.altKey) {
          // Cmd/Ctrl + B : 굵게 (Bold)
          if (code === 'KeyB' || keyLower === 'b' || keyLower === 'ㅠ' || e.keyCode === 66) {
            e.preventDefault();
            document.execCommand('bold', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + U : 밑줄 (Underline)
          if (code === 'KeyU' || keyLower === 'u' || keyLower === 'ㅕ' || e.keyCode === 85) {
            e.preventDefault();
            document.execCommand('underline', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + I : 기울임 (Italic)
          if (code === 'KeyI' || keyLower === 'i' || keyLower === 'ㅑ' || e.keyCode === 73) {
            e.preventDefault();
            document.execCommand('italic', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + S : 즉시 저장 (브라우저 웹페이지 저장 창 방지)
          if (code === 'KeyS' || keyLower === 's' || keyLower === 'ㄴ' || e.keyCode === 83) {
            e.preventDefault();
            saveReportContentRealtime();
            notifyToast(`${getActiveModeConfig().label} 내용이 저장되었습니다.`);
            return;
          }
        }

        // 2. 취소선 단축키: Cmd/Ctrl + Shift + X, Cmd/Ctrl + Shift + S, Alt + Shift + 5
        const isStrikeCmd =
          (isCmdOrCtrl && e.shiftKey && (code === 'KeyX' || keyLower === 'x' || keyLower === 'ㅌ' || e.keyCode === 88 || code === 'KeyS' || keyLower === 's' || keyLower === 'ㄴ' || e.keyCode === 83)) ||
          (e.altKey && e.shiftKey && (code === 'Digit5' || keyLower === '5' || e.keyCode === 53));

        if (isStrikeCmd) {
          e.preventDefault();
          document.execCommand('strikeThrough', false, null);
          saveEditorSelection();
          updateToolbarActiveState();
          scheduleAutoSave();
          return;
        }

        // 3. 목록 및 정렬 단축키 (Cmd/Ctrl + Shift + 조합)
        if (isCmdOrCtrl && e.shiftKey && !e.altKey) {
          // Cmd/Ctrl + Shift + 7 : 번호 목록
          if (code === 'Digit7' || keyLower === '7' || e.keyCode === 55) {
            e.preventDefault();
            document.execCommand('insertOrderedList', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + Shift + 8 : 글머리 기호 목록
          if (code === 'Digit8' || keyLower === '8' || e.keyCode === 56) {
            e.preventDefault();
            document.execCommand('insertUnorderedList', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + Shift + L : 좌측 정렬
          if (code === 'KeyL' || keyLower === 'l' || keyLower === 'ㅣ' || e.keyCode === 76) {
            e.preventDefault();
            document.execCommand('justifyLeft', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + Shift + E : 가운데 정렬
          if (code === 'KeyE' || keyLower === 'e' || keyLower === 'ㄷ' || keyLower === 'ㄸ' || e.keyCode === 69) {
            e.preventDefault();
            document.execCommand('justifyCenter', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
          // Cmd/Ctrl + Shift + R : 우측 정렬
          if (code === 'KeyR' || keyLower === 'r' || keyLower === 'ㄱ' || keyLower === 'ㄲ' || e.keyCode === 82) {
            e.preventDefault();
            document.execCommand('justifyRight', false, null);
            saveEditorSelection();
            updateToolbarActiveState();
            scheduleAutoSave();
            return;
          }
        }

        // 4. 문단 제목 단축키 (Cmd/Ctrl + Alt + 1/2/3/0)
        if (isCmdOrCtrl && e.altKey && !e.shiftKey) {
          if (code === 'Digit1' || keyLower === '1' || e.keyCode === 49) {
            e.preventDefault();
            applyHeadingFormat('H1');
            return;
          }
          if (code === 'Digit2' || keyLower === '2' || e.keyCode === 50) {
            e.preventDefault();
            applyHeadingFormat('H2');
            return;
          }
          if (code === 'Digit3' || keyLower === '3' || e.keyCode === 51) {
            e.preventDefault();
            applyHeadingFormat('H3');
            return;
          }
          if (code === 'Digit0' || keyLower === '0' || e.keyCode === 48) {
            e.preventDefault();
            applyHeadingFormat('P');
            return;
          }
        }
      });

      editor.addEventListener('input', () => {
        saveEditorSelection();
        updateToolbarActiveState();
        scheduleAutoSave();
      });

      editor.addEventListener('keyup', () => {
        saveEditorSelection();
        updateToolbarActiveState();
      });

      editor.addEventListener('mouseup', () => {
        saveEditorSelection();
        updateToolbarActiveState();
      });

      editor.addEventListener('blur', () => {
        saveReportContentRealtime();
      });

      editor.addEventListener('click', (e) => {
        hideAllPopovers();
        if (justFinishedMultiCellDrag) {
          return;
        }
        const td = e.target.closest('td, th');
        const img = e.target.closest('img');

        if (img) {
          hideContextBars();
          activeImageElement = img;
          img.classList.add('selected-media');
          const imgBar = document.getElementById('reportImageContextBar');
          if (imgBar) imgBar.classList.add('show');
        } else if (td) {
          if (activeImageElement) {
            activeImageElement.classList.remove('selected-media');
            activeImageElement = null;
          }
          const imgBar = document.getElementById('reportImageContextBar');
          if (imgBar) imgBar.classList.remove('show');

          activeTableCell = td;
          if (selectedTableCells.length <= 1) {
            setSelectedTableCells([td]);
          }
          const tableBar = document.getElementById('reportTableContextBar');
          if (tableBar) tableBar.classList.add('show');
        } else {
          hideContextBars();
        }
      });

      // 클립보드 이미지 붙여넣기 지원
      editor.addEventListener('paste', async (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
              saveEditorSelection();
              await insertImageFile(file);
            }
            return;
          }
        }
      });

      // 표 셀(열 너비 / 행 높이) 마우스 드래그 리사이즈 활성화
      setupTableResizeInteractions(editor);
    }

    // 독서 기록 모드 전용 지식 탐색 버튼 바인딩
    const btnLexiconInEditor = document.getElementById('btnOpenLexiconInEditor');
    if (btnLexiconInEditor) {
      btnLexiconInEditor.onmousedown = (e) => {
        e.preventDefault();
        saveEditorSelection();
      };
      btnLexiconInEditor.onclick = () => {
        const selectedKw = (window.getSelection && window.getSelection().toString().trim()) || '';
        if (window.lexiconUI && typeof window.lexiconUI.open === 'function') {
          window.lexiconUI.open(selectedKw);
        }
      };
    }

    // 내보내기 버튼 바인딩
    const btnCopyRich = document.getElementById('btnCopyReportRich');
    if (btnCopyRich) btnCopyRich.onclick = copyFormattedReport;

    const btnExportPng = document.getElementById('btnExportReportPng');
    if (btnExportPng) btnExportPng.onclick = exportReportToPng;

    const btnExportPdf = document.getElementById('btnExportReportPdf');
    if (btnExportPdf) btnExportPdf.onclick = exportReportToPdf;

    // 초기 데이터 로드
    loadReports();
  }

  document.addEventListener('DOMContentLoaded', initReportStudio);

  window.reportStudio = {
    openShelf: openReportShelfModal,
    closeShelf: closeReportShelfModal,
    openEditor: openReportEditorModal,
    openBookEditor: openBookEditorModal,
    openManualEditor: openManualEditorModal,
    closeEditor: closeReportEditorModal,
    moveOrder: moveReportOrder,
    loadReports: loadReports,
    stripHtmlTags: stripHtmlTags,
    formatDateTimeShort: formatDateTimeShort
  };
})();

