/**
 * GROW GUEST - S-Pen 독립형 캔버스 필기 노트 모듈 (업무 메모 / 일기 / 신문 통합 지원)
 * 
 * [주요 기능]
 * 1. 업무 메모, 일기장, 신문 스크랩 3대 영역 일자별 손필기 완벽 지원
 * 2. 캔버스 모달 내에서 [메모 / 일기 / 신문] 탭 실시간 스위칭 (자동 저장 연동)
 * 3. S-Pen 필압(Pressure) 정밀 감지, 부드러운 스플라인 곡선 및 팜 리젝션(손터치 오작동 100% 차단)
 * 4. 두 손가락 제스처 지원 (2핑거 스크롤 및 2핑거 탭 실행취소)
 * 5. 손필기 또는 텍스트 입력 유무에 따른 상단 뱃지(동그라미 점) 실시간 자동 동기화
 */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // 1. 설정 및 상태 변수
  // -------------------------------------------------------------
  const CONFIG = {
    LONG_PRESS_DURATION: 1500, // 1.5초 롱프레스
    STORAGE_KEY_PREFIX: 'GROW_GUEST_SPEN_NOTE_',
    SAVED_COLOR_KEY: 'GROW_GUEST_SPEN_LAST_COLOR',
    DEFAULT_PEN_COLOR: '#1e293b',
    HIGHLIGHTER_COLOR: 'rgba(250, 204, 21, 0.45)',
    DEFAULT_SIZE: 3,
    PALM_REJECTION: true
  };

  const TYPE_INFO = {
    memo: { title: '업무 메모', icon: '📝', color: '#ff3b30' },
    diary: { title: '일기장', icon: '📔', color: '#10b981' },
    news: { title: '신문 스크랩', icon: '📰', color: '#3b82f6' }
  };

  let currentType = 'news'; // 'memo' | 'diary' | 'news'
  let currentDate = ''; // YYYY-MM-DD
  let strokes = [];
  let currentStroke = null;
  let isDrawing = false;
  let currentTool = 'pen';
  let currentColor = localStorage.getItem(CONFIG.SAVED_COLOR_KEY) || CONFIG.DEFAULT_PEN_COLOR;
  let currentSize = CONFIG.DEFAULT_SIZE;
  let activePointerType = null;

  // -------------------------------------------------------------
  // 2. 스타일 자동 주입 (반응형 탭 + 현대적인 툴바)
  // -------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('spen-note-styles')) return;
    const style = document.createElement('style');
    style.id = 'spen-note-styles';
    style.textContent = `
      #spen-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      #spen-modal-container {
        width: 96vw;
        max-width: 900px;
        height: 92vh;
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: spenFadeIn 0.15s ease-out;
      }
      @keyframes spenFadeIn {
        from { opacity: 0; transform: scale(0.98); }
        to { opacity: 1; transform: scale(1); }
      }
      .spen-header {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 14px;
      }
      .spen-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .spen-tab-group {
        display: flex;
        align-items: center;
        background: #e2e8f0;
        padding: 3px;
        border-radius: 12px;
        gap: 3px;
      }
      .spen-tab-btn {
        border: none;
        background: transparent;
        padding: 6px 12px;
        border-radius: 9px;
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .spen-tab-btn.active {
        background: #ffffff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .spen-tab-btn.active[data-type="memo"] { color: #e11d48; }
      .spen-tab-btn.active[data-type="diary"] { color: #059669; }
      .spen-tab-btn.active[data-type="news"] { color: #2563eb; }

      .spen-date-display {
        font-size: 13px;
        font-weight: 700;
        color: #475569;
        display: flex;
        align-items: center;
        gap: 5px;
        background: #ffffff;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }
      .spen-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        flex-wrap: nowrap;
        overflow-x: auto;
      }
      .spen-tool-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .spen-tool-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .spen-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        padding: 6px 10px;
        min-width: 36px;
        height: 36px;
        border-radius: 9px;
        font-size: 15px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: #334155;
        transition: all 0.15s ease;
        flex-shrink: 0;
      }
      .spen-btn:active { transform: scale(0.95); }
      .spen-btn.active {
        background: #3b82f6;
        color: #ffffff;
        border-color: #2563eb;
      }
      .spen-btn-save {
        background: #10b981;
        color: white;
        border-color: #059669;
      }
      .spen-color-picker {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid #cbd5e1;
        cursor: pointer;
        outline: none;
        padding: 0;
        flex-shrink: 0;
      }
      .spen-canvas-wrapper {
        flex: 1;
        position: relative;
        background: #ffffff;
        overflow-y: auto;
        overflow-x: hidden;
        touch-action: none;
        -webkit-overflow-scrolling: touch;
      }
      #spen-note-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 2500px;
        touch-action: none;
        cursor: crosshair;
      }
      .spen-grid-bg {
        background-image: radial-gradient(#e2e8f0 1.2px, transparent 1.2px);
        background-size: 20px 20px;
      }
      .spen-toast {
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.88);
        color: #ffffff;
        padding: 8px 18px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 100;
        white-space: nowrap;
      }
      .spen-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(-6px);
      }

      /* 헤더 패널 내 손필기 진입 버튼 공통 스타일 */
      .spen-open-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 8px;
        border: 1px solid var(--border-color, #e2e8f0);
        background: var(--bg-card, #ffffff);
        color: var(--text-main, #334155);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .spen-open-btn:hover {
        border-color: #3b82f6;
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
    `;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------
  // 3. 모달 DOM 생성 (탭 + 도구모음 헤더)
  // -------------------------------------------------------------
  function createModalDOM() {
    if (document.getElementById('spen-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'spen-modal-overlay';
    overlay.innerHTML = `
      <div id="spen-modal-container">
        <div class="spen-header">
          <div class="spen-header-top">
            <div class="spen-tab-group" id="spen-tab-group">
              <button class="spen-tab-btn active" data-type="memo">📝 메모</button>
              <button class="spen-tab-btn" data-type="diary">📔 일기</button>
              <button class="spen-tab-btn" data-type="news">📰 신문</button>
            </div>
            <div class="spen-date-display" id="spen-date-display">
              📅 <span>2026-08-31</span>
            </div>
          </div>
          <div class="spen-toolbar">
            <div class="spen-tool-left">
              <button class="spen-btn active" id="spen-tool-pen" data-tool="pen" title="펜">🖊️ 펜</button>
              <button class="spen-btn" id="spen-tool-highlighter" data-tool="highlighter" title="형광펜">🖍️ 형광펜</button>
              <button class="spen-btn" id="spen-tool-eraser" data-tool="eraser" title="지우개">🧹 지우개</button>
              <input type="color" id="spen-color-input" class="spen-color-picker" value="${currentColor}" title="색상 선택">
            </div>
            <div class="spen-tool-right">
              <button class="spen-btn" id="spen-tool-undo" title="실행 취소">↩️ 취소</button>
              <button class="spen-btn" id="spen-tool-clear" title="전체 지우기">🗑️ 삭제</button>
              <button class="spen-btn spen-btn-save" id="spen-btn-save" title="저장">💾 저장</button>
              <button class="spen-btn" id="spen-btn-close" title="닫기">✕</button>
            </div>
          </div>
        </div>
        <div class="spen-canvas-wrapper spen-grid-bg" id="spen-canvas-wrapper">
          <canvas id="spen-note-canvas"></canvas>
          <div class="spen-toast" id="spen-toast"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    bindModalEvents();
  }

  // -------------------------------------------------------------
  // 4. 스토리지 키 관리 및 데이터 입출력 (호환성 포함)
  // -------------------------------------------------------------
  function getStorageKey(type, dateKey) {
    const t = type || currentType || 'news';
    const d = dateKey || currentDate || getCurrentDateKey();
    return `${CONFIG.STORAGE_KEY_PREFIX}${t}_${d}`;
  }

  function saveNoteData() {
    try {
      const key = getStorageKey(currentType, currentDate);
      const dataStr = JSON.stringify(strokes);
      localStorage.setItem(key, dataStr);
    } catch (err) {
      console.warn('S-Pen 필기 저장 실패:', err);
    }
    syncAllBadges();
  }

  function loadNoteData() {
    try {
      const key = getStorageKey(currentType, currentDate);
      let raw = localStorage.getItem(key);

      // 하위 호환 처리: 기존 신문 데이터가 접두사 없는 날짜 키로 저장되어 있는 경우 마이그레이션
      if (!raw && currentType === 'news') {
        const oldKey = CONFIG.STORAGE_KEY_PREFIX + currentDate;
        const oldRaw = localStorage.getItem(oldKey);
        if (oldRaw) {
          raw = oldRaw;
          localStorage.setItem(key, oldRaw);
        }
      }

      strokes = raw ? JSON.parse(raw) : [];
    } catch (err) {
      strokes = [];
    }
  }

  // -------------------------------------------------------------
  // 5. 캔버스 드로잉 로직 (S-Pen 전용 필기 + 멀티터치 제스처)
  // -------------------------------------------------------------
  let canvas, ctx, wrapper;
  let isEventsBound = false;

  let touchStartTime = 0;
  let touchStartY = 0;
  let isTwoFingerGesture = false;
  let isTwoFingerDragging = false;

  function showToast(msg) {
    const toast = document.getElementById('spen-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1200);
  }

  function triggerUndo() {
    if (strokes.length > 0) {
      strokes.pop();
      redrawCanvas();
      if (navigator.vibrate) navigator.vibrate(35);
      showToast('↩️ 실행 취소 (두 손가락 탭)');
    }
  }

  function initCanvas() {
    canvas = document.getElementById('spen-note-canvas');
    wrapper = document.getElementById('spen-canvas-wrapper');
    if (!canvas || !wrapper) return;
    ctx = canvas.getContext('2d', { desynchronized: true });

    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasH = 2500; // 넉넉한 2500px 세로 길이

    if (rect.width > 0) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(canvasH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    if (!isEventsBound) {
      // 1. S-Pen 및 마우스 필기 이벤트
      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerUp);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // 2. 두 손가락 멀티터치 제스처 (스크롤 & Undo)
      wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
      wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
      wrapper.addEventListener('touchend', handleTouchEnd, { passive: false });
      wrapper.addEventListener('touchcancel', handleTouchEnd, { passive: false });

      window.addEventListener('resize', handleResize);
      isEventsBound = true;
    }

    redrawCanvas();
  }

  function handleResize() {
    const overlay = document.getElementById('spen-modal-overlay');
    if (!overlay || overlay.style.display !== 'flex' || !canvas || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasH = 2500;
    if (rect.width > 0) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(canvasH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      redrawCanvas();
    }
  }

  function handleTouchStart(e) {
    if (e.touches.length >= 2) {
      isTwoFingerGesture = true;
      isTwoFingerDragging = false;
      isDrawing = false;
      currentStroke = null;
      redrawCanvas();
      touchStartTime = Date.now();
      touchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      e.preventDefault();
    }
  }

  function handleTouchMove(e) {
    if (isTwoFingerGesture && e.touches.length === 2 && wrapper) {
      e.preventDefault();
      const curY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dy = curY - touchStartY;

      if (Math.abs(dy) > 4) {
        isTwoFingerDragging = true;
        wrapper.scrollTop -= dy;
        touchStartY = curY;
      }
    }
  }

  function handleTouchEnd(e) {
    if (isTwoFingerGesture) {
      const duration = Date.now() - touchStartTime;
      if (!isTwoFingerDragging && duration < 380) {
        triggerUndo();
      }
      if (e.touches.length < 2) {
        isTwoFingerGesture = false;
        isTwoFingerDragging = false;
      }
    }
  }

  function isSpenEraser(e) {
    if (!e) return false;
    if (e.pointerType === 'eraser') return true;
    if (e.pointerType === 'pen') {
      const b = (e.buttons !== undefined) ? e.buttons : 0;
      const btn = (e.button !== undefined) ? e.button : -1;
      const which = (e.which !== undefined) ? e.which : 0;
      if ((b & 2) !== 0 || (b & 32) !== 0 || b === 2 || b === 3 || b === 32 || b === 33) return true;
      if (btn === 2 || btn === 5 || which === 3) return true;
    }
    return false;
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scaleX = (canvas.width / dpr) / (rect.width || 1);
    const scaleY = 1;

    const yOffset = (e.pointerType === 'pen') ? -1.2 : 0;
    const scrollY = wrapper ? wrapper.scrollTop : 0;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top + scrollY + yOffset) * scaleY,
      p: (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 0.5
    };
  }

  function isPenEvent(e) {
    if (!e) return false;
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse' && !('ontouchstart' in window)) return true;
    return false;
  }

  function handlePointerDown(e) {
    if (!isPenEvent(e) || isTwoFingerGesture) return;

    activePointerType = e.pointerType;
    isDrawing = true;
    const pt = getCanvasPos(e);
    const isEraser = isSpenEraser(e) || currentTool === 'eraser';

    currentStroke = {
      tool: isEraser ? 'eraser' : currentTool,
      color: currentTool === 'highlighter' ? CONFIG.HIGHLIGHTER_COLOR : currentColor,
      size: currentTool === 'highlighter' ? 14 : (isEraser ? 24 : currentSize),
      points: [pt]
    };

    if (isEraser) {
      eraseStrokeAt(pt);
    } else {
      drawPoint(pt, currentStroke);
    }
  }

  function handlePointerMove(e) {
    if (!isDrawing || !currentStroke || !isPenEvent(e) || isTwoFingerGesture) return;

    const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];
    const isEraser = isSpenEraser(e) || currentTool === 'eraser';

    if (isEraser && currentStroke.tool !== 'eraser') {
      currentStroke.tool = 'eraser';
      currentStroke.points = [];
    }

    for (let i = 0; i < events.length; i++) {
      const pt = getCanvasPos(events[i]);
      const prevPt = currentStroke.points[currentStroke.points.length - 1];

      if (isEraser) {
        eraseStrokeAt(pt);
      } else {
        if (!prevPt || Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) >= 0.5) {
          currentStroke.points.push(pt);

          if (currentStroke.points.length >= 3) {
            drawSmoothCurve(currentStroke);
          } else {
            drawSegment(currentStroke, currentStroke.points.length - 2, currentStroke.points.length - 1);
          }
        }
      }
    }
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentStroke && currentStroke.points.length > 0 && currentStroke.tool !== 'eraser') {
      strokes.push(currentStroke);
    }
    currentStroke = null;
    redrawCanvas();
  }

  function drawPoint(pt, stroke) {
    ctx.save();
    ctx.fillStyle = stroke.color;
    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    }
    const r = (stroke.size * (0.6 + pt.p * 0.9)) / 2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSmoothCurve(stroke) {
    const pts = stroke.points;
    const len = pts.length;
    if (len < 3) return;

    const p0 = pts[len - 3];
    const p1 = pts[len - 2];
    const p2 = pts[len - 1];

    const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;

    const pressureMultiplier = (p0.p + p1.p + p2.p) / 3;
    ctx.lineWidth = stroke.size * (0.6 + pressureMultiplier * 0.9);

    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSegment(stroke, idxA, idxB) {
    if (idxA < 0 || idxB >= stroke.points.length) return;
    const p1 = stroke.points[idxA];
    const p2 = stroke.points[idxB];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;

    const pressureMultiplier = (p1.p + p2.p) / 2;
    ctx.lineWidth = stroke.size * (0.6 + pressureMultiplier * 0.9);

    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  function eraseStrokeAt(point) {
    const threshold = 26;
    const initialLen = strokes.length;

    strokes = strokes.filter(s => {
      const pts = s.points;
      if (!pts || pts.length === 0) return false;
      if (pts.length === 1) {
        return Math.hypot(pts[0].x - point.x, pts[0].y - point.y) >= threshold;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(point, pts[i], pts[i + 1]) < threshold) {
          return false;
        }
      }
      return true;
    });

    if (strokes.length !== initialLen) {
      redrawCanvas();
    }
  }

  function redrawCanvas() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    strokes.forEach(stroke => {
      const pts = stroke.points;
      if (!pts || pts.length === 0) return;

      if (pts.length === 1) {
        drawPoint(pts[0], stroke);
        return;
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;

      if (stroke.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'multiply';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }

      if (pts.length === 2) {
        const pAvg = (pts[0].p + pts[1].p) / 2;
        ctx.lineWidth = stroke.size * (0.6 + pAvg * 0.9);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      } else {
        for (let i = 0; i < pts.length - 2; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const p2 = pts[i + 2];
          const mid1 = (i === 0) ? p0 : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          const pAvg = (p0.p + p1.p + p2.p) / 3;
          ctx.lineWidth = stroke.size * (0.6 + pAvg * 0.9);

          ctx.beginPath();
          ctx.moveTo(mid1.x, mid1.y);
          ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  // -------------------------------------------------------------
  // 6. 모달 이벤트 및 탭 제어
  // -------------------------------------------------------------
  function bindModalEvents() {
    // 탭 전환 버튼
    const tabBtns = document.querySelectorAll('.spen-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetType = e.currentTarget.dataset.type;
        if (targetType === currentType) return;

        // 현재 작성 내용 저장
        saveNoteData();

        // 탭 상태 전환
        currentType = targetType;
        updateModalHeaderUI();

        // 새로운 탭 데이터 로드 및 리드로우
        loadNoteData();
        redrawCanvas();
        showToast(`${TYPE_INFO[currentType].icon} ${TYPE_INFO[currentType].title} 필기장`);
      });
    });

    // 툴 선택
    const tools = ['pen', 'highlighter', 'eraser'];
    tools.forEach(t => {
      const btn = document.getElementById(`spen-tool-${t}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          currentTool = t;
          document.querySelectorAll('.spen-toolbar .spen-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        });
      }
    });

    // 색상 선택
    const colorInput = document.getElementById('spen-color-input');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        currentColor = e.target.value;
        try {
          localStorage.setItem(CONFIG.SAVED_COLOR_KEY, currentColor);
        } catch (err) {}

        if (currentTool === 'eraser') {
          const penBtn = document.getElementById('spen-tool-pen');
          if (penBtn) penBtn.click();
        }
      });
    }

    // 실행 취소
    const undoBtn = document.getElementById('spen-tool-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (strokes.length > 0) {
          strokes.pop();
          redrawCanvas();
        }
      });
    }

    // 전체 지우기
    const clearBtn = document.getElementById('spen-tool-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm(`작성 중인 ${TYPE_INFO[currentType].title} 필기를 모두 지우시겠습니까?`)) {
          strokes = [];
          redrawCanvas();
        }
      });
    }

    // 저장 버튼
    const saveBtn = document.getElementById('spen-btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveNoteData();
        closeModal();
      });
    }

    // 닫기 버튼
    const closeBtn = document.getElementById('spen-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (strokes.length > 0) {
          saveNoteData();
        }
        closeModal();
      });
    }
  }

  function updateModalHeaderUI() {
    // 탭 버튼 활성화 상태 업데이트
    document.querySelectorAll('.spen-tab-btn').forEach(btn => {
      if (btn.dataset.type === currentType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 날짜 레이블 업데이트
    const dateDisplay = document.getElementById('spen-date-display');
    if (dateDisplay) {
      const parts = currentDate.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        dateDisplay.innerHTML = `📅 <span>${year}.${month}.${day}</span> <strong style="color:${TYPE_INFO[currentType].color}">(${TYPE_INFO[currentType].title})</strong>`;
      } else {
        dateDisplay.innerHTML = `📅 <span>${currentDate}</span>`;
      }
    }
  }

  // 현재 화면에서 보고 있는 날짜(YYYY-MM-DD) 추출
  function getCurrentDateKey() {
    // 1. TODOLIST의 inputDueDate
    const dueDateInput = document.getElementById('inputDueDate');
    if (dueDateInput && dueDateInput.value && /^\d{4}-\d{2}-\d{2}$/.test(dueDateInput.value)) {
      return dueDateInput.value;
    }

    // 2. 상단 활성 기간 탭 (어제 / 오늘 / 내일)
    const activeTab = document.querySelector('.period-tab.active');
    if (activeTab && activeTab.dataset && activeTab.dataset.period) {
      const period = activeTab.dataset.period;
      const d = new Date();
      if (period === 'yesterday') d.setDate(d.getDate() - 1);
      else if (period === 'tomorrow') d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // 3. 달력 선택 레이블
    const dateLabel = document.getElementById('selectedDateLabel');
    if (dateLabel && dateLabel.dataset && dateLabel.dataset.date) {
      return dateLabel.dataset.date;
    }

    // 4. 기본 오늘
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /**
   * 모달 열기 함수 (다양한 인자 형식 유연 지원)
   * @param {string} [typeOrDate] - 'memo' | 'diary' | 'news' 또는 날짜 'YYYY-MM-DD'
   * @param {string} [dateKey] - 'YYYY-MM-DD'
   */
  function openModal(typeOrDate, dateKey) {
    if (typeOrDate && /^\d{4}-\d{2}-\d{2}$/.test(typeOrDate)) {
      currentDate = typeOrDate;
      currentType = dateKey && TYPE_INFO[dateKey] ? dateKey : 'news';
    } else {
      currentType = (typeOrDate && TYPE_INFO[typeOrDate]) ? typeOrDate : 'news';
      currentDate = dateKey || getCurrentDateKey();
    }

    injectStyles();
    createModalDOM();
    updateModalHeaderUI();

    // 저장된 펜 색상 복원
    const savedColor = localStorage.getItem(CONFIG.SAVED_COLOR_KEY);
    if (savedColor) {
      currentColor = savedColor;
      const colorInput = document.getElementById('spen-color-input');
      if (colorInput) colorInput.value = savedColor;
    }

    const overlay = document.getElementById('spen-modal-overlay');
    if (overlay) overlay.style.display = 'flex';

    loadNoteData();
    requestAnimationFrame(() => {
      initCanvas();
      const parts = currentDate.split('-');
      if (parts.length === 3) {
        showToast(`${TYPE_INFO[currentType].icon} ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일 ${TYPE_INFO[currentType].title} 필기장`);
      }
    });
  }

  function closeModal() {
    const overlay = document.getElementById('spen-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // -------------------------------------------------------------
  // 7. 메모 / 일기 / 신문 뱃지(동그라미 점) 통합 동기화
  // -------------------------------------------------------------
  function checkHasSpenNote(type, dateKey) {
    try {
      const key = getStorageKey(type, dateKey);
      let raw = localStorage.getItem(key);
      if (!raw && type === 'news') {
        raw = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + dateKey);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0;
      }
    } catch (e) {}
    return false;
  }

  function syncAllBadges() {
    try {
      const dateKey = getCurrentDateKey();

      // 1. 메모 뱃지
      const memoBadge = document.getElementById('memoBadge');
      const memoInput = document.getElementById('memoInput');
      const hasMemoText = memoInput && memoInput.value && memoInput.value.trim().length > 0;
      const hasMemoSpen = checkHasSpenNote('memo', dateKey);
      if (memoBadge) {
        memoBadge.style.display = (hasMemoText || hasMemoSpen) ? 'flex' : 'none';
      }

      // 2. 일기 뱃지
      const diaryBadge = document.getElementById('diaryBadge');
      const diaryInput = document.getElementById('diaryInput');
      const hasDiaryText = diaryInput && diaryInput.value && diaryInput.value.trim().length > 0;
      const hasDiarySpen = checkHasSpenNote('diary', dateKey);
      if (diaryBadge) {
        diaryBadge.style.display = (hasDiaryText || hasDiarySpen) ? 'flex' : 'none';
      }

      // 3. 신문 뱃지
      const newsBadge = document.getElementById('newsBadge');
      const newsInput = document.getElementById('newsInput');
      const hasNewsText = newsInput && newsInput.value && newsInput.value.trim().length > 0;
      const hasNewsSpen = checkHasSpenNote('news', dateKey);
      if (newsBadge) {
        newsBadge.style.display = (hasNewsText || hasNewsSpen) ? 'flex' : 'none';
      }
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // 8. 상단 아이콘 롱프레스 감지기 (일기, 신문 등)
  // -------------------------------------------------------------
  function attachLongPressListeners() {
    let pressTimer = null;
    let isLongPressTriggered = false;
    let startX = 0, startY = 0;
    let targetType = 'news';

    function getTargetType(target) {
      if (!target) return null;
      if (target.closest('#newsToggleBtn, [class*="news"], [class*="newspaper"], .fa-newspaper')) {
        return 'news';
      }
      if (target.closest('#diaryToggleBtn, [title*="일기"]')) {
        return 'diary';
      }
      return null;
    }

    function startPress(e) {
      const type = getTargetType(e.target);
      if (!type) return;

      targetType = type;
      isLongPressTriggered = false;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      pressTimer = setTimeout(() => {
        isLongPressTriggered = true;

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        openModal(targetType, getCurrentDateKey());
      }, CONFIG.LONG_PRESS_DURATION);
    }

    function cancelPress(e) {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }

    function handleMove(e) {
      if (!pressTimer) return;
      const curX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const curY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      if (Math.hypot(curX - startX, curY - startY) > 10) {
        cancelPress();
      }
    }

    function handleClickCapture(e) {
      if (isLongPressTriggered) {
        e.preventDefault();
        e.stopImmediatePropagation();
        isLongPressTriggered = false;
      }
    }

    document.addEventListener('pointerdown', startPress, { passive: true });
    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerup', cancelPress, { passive: true });
    document.addEventListener('pointercancel', cancelPress, { passive: true });
    document.addEventListener('click', handleClickCapture, { capture: true });

    // 탭/달력 변경 시 뱃지 상태 실시간 갱신
    document.addEventListener('click', () => {
      setTimeout(syncAllBadges, 100);
      setTimeout(syncAllBadges, 400);
    });

    // 초기 뱃지 동기화
    setTimeout(syncAllBadges, 300);
    setTimeout(syncAllBadges, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLongPressListeners);
  } else {
    attachLongPressListeners();
  }

  // 글로벌 API 노출
  window.openSpenNote = openModal;
  window.syncSpenBadges = syncAllBadges;
  window.syncSpenNewsBadge = syncAllBadges; // 구버전 호환용
})();
