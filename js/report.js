// 보고문서 (Report Studio) 비즈니스 로직 및 블로그형 에디터 모듈 (이모지 미사용)

(function () {
  let currentReports = [];
  let selectedReport = null;
  let currentReportFilter = 'all';
  let currentReportSearch = '';
  let reportSaveTimer = null;
  let reportIndicatorTimer = null;
  let savedSelectionRange = null;
  let activeTableCell = null;
  let activeImageElement = null;

  function escapeHtmlText(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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

  function openReportEditorModal(reportId) {
    selectedReport = currentReports.find(r => r.report_id === reportId);
    if (!selectedReport) return;

    const overlay = document.getElementById('reportEditorModalOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    const titleInput = document.getElementById('reportEditorTitleInput');
    if (titleInput) titleInput.value = selectedReport.title || '';

    updateStatusBadgeAndChips(selectedReport.status || '작성 중');

    const updatedLabel = document.getElementById('reportUpdatedLabel');
    if (updatedLabel) {
      const dt = formatDateTimeShort(selectedReport.updated_at || selectedReport.created_at);
      updatedLabel.textContent = dt ? `최종 수정: ${dt}` : '';
    }

    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      const localDraft = localStorage.getItem(`report_draft_${selectedReport.report_id}`);
      const dbContent = selectedReport.content || '';
      let initialHtml = dbContent;

      if (localDraft && localDraft !== dbContent && localDraft.length > dbContent.length) {
        initialHtml = localDraft;
      }

      editor.innerHTML = initialHtml || '<p><br></p>';
      bindInteractiveCheckboxes(editor);
    }

    hideAllPopovers();
    hideContextBars();
    updateReportSaveIndicator('idle');
  }

  async function closeReportEditorModal() {
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
    await loadReports();

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
      if (status === '완료') badge.classList.add('완독');
      if (status === '보류') badge.classList.add('보류');
    }

    document.querySelectorAll('.report-status-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.status === status);
    });
  }

  async function changeReportStatus(newStatus) {
    if (!selectedReport) return;
    const res = await window.api.updateReportStatus(selectedReport.report_id, newStatus);
    if (res && res.success) {
      selectedReport.status = newStatus;
      selectedReport.updated_at = new Date().toISOString();
      updateStatusBadgeAndChips(newStatus);
      await loadReports();
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

    updateReportSaveIndicator('saving');
    const res = await window.api.updateReportTitle(selectedReport.report_id, newTitle);
    if (res && res.success) {
      selectedReport.title = newTitle;
      selectedReport.updated_at = new Date().toISOString();
      updateReportSaveIndicator('saved');
      await loadReports();
    } else {
      updateReportSaveIndicator('error');
    }
  }

  async function saveReportContentRealtime() {
    if (!selectedReport) return;
    const editor = document.getElementById('reportEditorContent');
    if (!editor) return;

    // 체크박스 상태 attribute 동기화
    editor.querySelectorAll('input.report-check-box').forEach(chk => {
      if (chk.checked) {
        chk.setAttribute('checked', 'checked');
      } else {
        chk.removeAttribute('checked');
      }
    });

    // 선택된 이미지 아웃라인 클래스 제거 후 저장
    editor.querySelectorAll('img.selected-media').forEach(img => {
      img.classList.remove('selected-media');
    });

    const htmlContent = editor.innerHTML;
    try {
      localStorage.setItem(`report_draft_${selectedReport.report_id}`, htmlContent);
    } catch (_) {}

    const res = await window.api.updateReportContent(selectedReport.report_id, htmlContent);
    if (res && res.success) {
      selectedReport.content = htmlContent;
      selectedReport.updated_at = new Date().toISOString();
      try {
        localStorage.removeItem(`report_draft_${selectedReport.report_id}`);
      } catch (_) {}
      const updatedLabel = document.getElementById('reportUpdatedLabel');
      if (updatedLabel) {
        updatedLabel.textContent = `최종 수정: ${formatDateTimeShort(selectedReport.updated_at)}`;
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
    if (!confirm(`'${selectedReport.title}' 보고문서를 삭제하시겠습니까?`)) return;

    const id = selectedReport.report_id;
    const res = await window.api.deleteReport(id);
    if (res && res.success) {
      try {
        localStorage.removeItem(`report_draft_${id}`);
      } catch (_) {}
      selectedReport = null;
      const overlay = document.getElementById('reportEditorModalOverlay');
      if (overlay) overlay.classList.remove('show');
      await loadReports();
    } else {
      alert('문서 삭제에 실패했습니다.');
    }
  }

  // === 리치 에디터 서식 및 블록 삽입 도구 ===
  function execFormat(command, value = null) {
    restoreEditorSelection();
    document.execCommand(command, false, value);
    saveEditorSelection();
    scheduleAutoSave();
  }

  function applyHeadingFormat(tag) {
    restoreEditorSelection();
    document.execCommand('formatBlock', false, tag);
    saveEditorSelection();
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

  // === 표 편집 동작 (행/열 추가 및 삭제) ===
  function handleTableAction(action) {
    if (!activeTableCell) return;
    const table = activeTableCell.closest('table');
    const row = activeTableCell.closest('tr');
    if (!table || !row) return;

    const cellIndex = activeTableCell.cellIndex;

    if (action === 'add-row') {
      const newRow = document.createElement('tr');
      const colCount = row.cells.length;
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        td.innerHTML = '내용';
        newRow.appendChild(td);
      }
      if (row.parentNode.tagName === 'THEAD') {
        const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
        tbody.insertBefore(newRow, tbody.firstChild);
      } else {
        row.parentNode.insertBefore(newRow, row.nextSibling);
      }
    } else if (action === 'add-col') {
      const allRows = table.querySelectorAll('tr');
      allRows.forEach(tr => {
        const isHeader = tr.parentNode.tagName === 'THEAD' || tr.querySelector('th');
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.innerHTML = isHeader ? '항목' : '내용';
        const refCell = tr.cells[cellIndex];
        if (refCell && refCell.nextSibling) {
          tr.insertBefore(cell, refCell.nextSibling);
        } else {
          tr.appendChild(cell);
        }
      });
    } else if (action === 'del-row') {
      const allRows = table.querySelectorAll('tr');
      if (allRows.length <= 1) {
        table.remove();
        hideContextBars();
      } else {
        row.remove();
        hideContextBars();
      }
    } else if (action === 'del-col') {
      const allRows = table.querySelectorAll('tr');
      if (row.cells.length <= 1) {
        table.remove();
        hideContextBars();
      } else {
        allRows.forEach(tr => {
          if (tr.cells[cellIndex]) tr.cells[cellIndex].remove();
        });
        hideContextBars();
      }
    } else if (action === 'del-table') {
      table.remove();
      hideContextBars();
    }

    scheduleAutoSave();
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
      el.style.cssText = 'width:100%; border-collapse:collapse; margin:12px 0; font-size:13.5px;';
    });
    clone.querySelectorAll('th').forEach(el => {
      el.style.cssText = 'border:1px solid #cbd5e1; padding:8px 10px; background:#f1f5f9; font-weight:700; color:#0f172a; text-align:left;';
    });
    clone.querySelectorAll('td').forEach(el => {
      el.style.cssText = 'border:1px solid #cbd5e1; padding:8px 10px; color:#191f28; text-align:left;';
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
    const editor = document.getElementById('reportEditorContent');
    const titleInput = document.getElementById('reportEditorTitleInput');
    const title = (titleInput ? titleInput.value.trim() : '') || '제목 없는 보고서';
    const status = selectedReport ? selectedReport.status : '작성 중';
    const dateStr = formatDateTimeShort(selectedReport?.updated_at || new Date().toISOString());

    const stage = document.createElement('div');
    stage.className = 'report-export-stage';

    const contentClone = editor.cloneNode(true);
    contentClone.removeAttribute('contenteditable');
    contentClone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    contentClone.querySelectorAll('img.selected-media').forEach(img => img.classList.remove('selected-media'));

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
      link.download = `보고문서_${safeTitle}_${getExportDateStamp()}.png`;
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
      pdf.save(`보고문서_${safeTitle}_${getExportDateStamp()}.pdf`);
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

    document.querySelectorAll('[data-img-action]').forEach(btn => {
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = function () {
        handleImageAction(this.dataset.imgAction);
      };
    });

    // 에디터 본문 이벤트 (자동 저장, 선택 영역 추적, 클립보드 이미지 붙여넣기, 컨텍스트 감지)
    const editor = document.getElementById('reportEditorContent');
    if (editor) {
      editor.addEventListener('input', () => {
        saveEditorSelection();
        scheduleAutoSave();
      });

      editor.addEventListener('keyup', () => {
        saveEditorSelection();
      });

      editor.addEventListener('mouseup', () => {
        saveEditorSelection();
      });

      editor.addEventListener('blur', () => {
        saveReportContentRealtime();
      });

      editor.addEventListener('click', (e) => {
        hideAllPopovers();
        const td = e.target.closest('td, th');
        const img = e.target.closest('img');

        hideContextBars();

        if (img) {
          activeImageElement = img;
          img.classList.add('selected-media');
          const imgBar = document.getElementById('reportImageContextBar');
          if (imgBar) imgBar.classList.add('show');
        } else if (td) {
          activeTableCell = td;
          const tableBar = document.getElementById('reportTableContextBar');
          if (tableBar) tableBar.classList.add('show');
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
    closeEditor: closeReportEditorModal,
    moveOrder: moveReportOrder,
    loadReports: loadReports
  };
})();

