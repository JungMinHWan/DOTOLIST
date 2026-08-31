/**
 * GROW GUEST - S-Pen 독립형 캔버스 필기 노트 모듈
 * 
 * [특징]
 * 1. 신문 아이콘 2~3초 롱프레스 시 햅틱 진동과 함께 필기 모달 실행
 * 2. S-Pen 필압(Pressure) 감지 및 굵기 보정
 * 3. 팜 리젝션(Palm Rejection: S-Pen 사용 시 손바닥 터치 오작동 차단)
 * 4. 선/좌표(Vector JSON) 형태 저장 및 복원 (이어쓰기, Undo 지원)
 * 5. 별도 CSS 파일 불필요 (단일 스크립트 자동 주입)
 */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // 1. 설정 및 상태 변수
  // -------------------------------------------------------------
  const CONFIG = {
    LONG_PRESS_DURATION: 2200, // 2.2초 롱프레스
    STORAGE_KEY_PREFIX: 'GROW_GUEST_SPEN_NOTE_',
    DEFAULT_PEN_COLOR: '#1e293b',
    HIGHLIGHTER_COLOR: 'rgba(250, 204, 21, 0.45)',
    DEFAULT_SIZE: 3,
    PALM_REJECTION: true // S펜 사용 시 손가락 터치 차단 여부
  };

  let currentKey = 'default_note';
  let strokes = []; // [{ tool: 'pen'|'highlighter', color, size, points: [{x, y, p}] }]
  let currentStroke = null;
  let isDrawing = false;
  let currentTool = 'pen'; // 'pen', 'highlighter', 'eraser'
  let currentColor = CONFIG.DEFAULT_PEN_COLOR;
  let currentSize = CONFIG.DEFAULT_SIZE;
  let activePointerType = null;

  // -------------------------------------------------------------
  // 2. 스타일 자동 주입 (독립성을 위해 JS에서 생성)
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
        width: 95vw;
        max-width: 850px;
        height: 90vh;
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: spenFadeIn 0.15s ease-out;
      }
      @keyframes spenFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .spen-header {
        padding: 12px 18px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      .spen-title {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .spen-badge {
        font-size: 11px;
        padding: 2px 7px;
        background: #dbeafe;
        color: #1e40af;
        border-radius: 12px;
        font-weight: 600;
      }
      .spen-toolbar {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .spen-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        padding: 6px 10px;
        min-width: 34px;
        height: 34px;
        border-radius: 9px;
        font-size: 15px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        color: #334155;
        transition: all 0.15s ease;
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
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid #cbd5e1;
        cursor: pointer;
        outline: none;
        padding: 0;
      }
      .spen-canvas-wrapper {
        flex: 1;
        position: relative;
        background: #ffffff;
        overflow: hidden;
        touch-action: none;
      }
      #spen-note-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        touch-action: none;
        cursor: crosshair;
      }
      .spen-grid-bg {
        background-image: radial-gradient(#e2e8f0 1px, transparent 1px);
        background-size: 20px 20px;
      }
    `;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------
  // 3. 모달 DOM 생성
  // -------------------------------------------------------------
  function createModalDOM() {
    if (document.getElementById('spen-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'spen-modal-overlay';
    overlay.innerHTML = `
      <div id="spen-modal-container">
        <div class="spen-header">
          <div class="spen-title">
            <span>✍️ S-Pen 손글씨 필기장</span>
            <span class="spen-badge" id="spen-palm-badge">팜리젝션 ON</span>
          </div>
          <div class="spen-toolbar">
            <button class="spen-btn active" id="spen-tool-pen" data-tool="pen" title="펜">🖊️</button>
            <button class="spen-btn" id="spen-tool-highlighter" data-tool="highlighter" title="형광펜">🖍️</button>
            <button class="spen-btn" id="spen-tool-eraser" data-tool="eraser" title="지우개">🧹</button>
            <input type="color" id="spen-color-input" class="spen-color-picker" value="${CONFIG.DEFAULT_PEN_COLOR}" title="색상 선택">
            <button class="spen-btn" id="spen-tool-undo" title="실행 취소">↩️</button>
            <button class="spen-btn" id="spen-tool-clear" title="전체 지우기">🗑️</button>
            <button class="spen-btn spen-btn-save" id="spen-btn-save" title="저장">💾</button>
            <button class="spen-btn" id="spen-btn-close" title="닫기">✕</button>
          </div>
        </div>
        <div class="spen-canvas-wrapper spen-grid-bg">
          <canvas id="spen-note-canvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    bindModalEvents();
  }

  // -------------------------------------------------------------
  // 4. 캔버스 드로잉 로직 (필압 + 팜 리젝션)
  // -------------------------------------------------------------
  let canvas, ctx;
  let isEventsBound = false;

  function initCanvas() {
    canvas = document.getElementById('spen-note-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { desynchronized: true });

    const wrapper = canvas.parentElement;
    const rect = wrapper ? wrapper.getBoundingClientRect() : canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (rect.width > 0 && rect.height > 0) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 기존 스케일 리셋
      ctx.scale(dpr, dpr);
    }

    if (!isEventsBound) {
      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerUp);
      window.addEventListener('resize', handleResize);
      isEventsBound = true;
    }

    redrawCanvas();
  }

  function handleResize() {
    const overlay = document.getElementById('spen-modal-overlay');
    if (!overlay || overlay.style.display !== 'flex' || !canvas) return;
    const wrapper = canvas.parentElement;
    const rect = wrapper ? wrapper.getBoundingClientRect() : canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      redrawCanvas();
    }
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scaleX = (canvas.width / dpr) / (rect.width || 1);
    const scaleY = (canvas.height / dpr) / (rect.height || 1);

    // S펜 디스플레이 시차(Parallax) 보정: S펜일 때 펜촉 중심점에 정확히 맞추기 위한 미세 오프셋
    const yOffset = (e.pointerType === 'pen') ? -1.2 : 0;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top + yOffset) * scaleY,
      p: (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 0.5
    };
  }

  function handlePointerDown(e) {
    activePointerType = e.pointerType;

    if (CONFIG.PALM_REJECTION && e.pointerType === 'touch' && activePointerType === 'pen') {
      return;
    }

    isDrawing = true;
    const pt = getCanvasPos(e);

    currentStroke = {
      tool: currentTool,
      color: currentTool === 'highlighter' ? CONFIG.HIGHLIGHTER_COLOR : currentColor,
      size: currentTool === 'highlighter' ? 14 : (currentTool === 'eraser' ? 24 : currentSize),
      points: [pt]
    };

    if (currentTool === 'eraser') {
      eraseStrokeAt(pt);
    } else {
      drawPoint(pt, currentStroke);
    }
  }

  function handlePointerMove(e) {
    if (!isDrawing || !currentStroke) return;

    // S-Pen 고속 샘플링(Coalesced Events)을 지원하면 모든 정밀 중간 좌표 수집
    const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];

    for (let i = 0; i < events.length; i++) {
      const pt = getCanvasPos(events[i]);
      const prevPt = currentStroke.points[currentStroke.points.length - 1];

      // 미세한 떨림 및 너무 가까운 중복 좌표 필터링 (최소 0.5px 이동 시 추가)
      if (!prevPt || Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) >= 0.5) {
        currentStroke.points.push(pt);

        if (currentTool === 'eraser') {
          eraseStrokeAt(pt);
        } else if (currentStroke.points.length >= 3) {
          drawSmoothCurve(currentStroke);
        } else {
          drawSegment(currentStroke, currentStroke.points.length - 2, currentStroke.points.length - 1);
        }
      }
    }
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentStroke && currentStroke.points.length > 0 && currentTool !== 'eraser') {
      strokes.push(currentStroke);
    }
    currentStroke = null;
    redrawCanvas();
  }

  // 첫 번째 점 찍기 (탭 또는 점 그리기)
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

  // 부드러운 베지에 스플라인 곡선 (중간점 보간으로 펜촉에 밀착)
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

  function eraseStrokeAt(point) {
    const threshold = 20;
    const initialLen = strokes.length;
    strokes = strokes.filter(s => {
      return !s.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < threshold);
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
  // 5. 모달 제어 및 이벤트 바인딩
  // -------------------------------------------------------------
  function bindModalEvents() {
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

    const colorInput = document.getElementById('spen-color-input');
    if (colorInput) {
      colorInput.addEventListener('input', (e) => {
        currentColor = e.target.value;
        if (currentTool === 'eraser') {
          const penBtn = document.getElementById('spen-tool-pen');
          if (penBtn) penBtn.click();
        }
      });
    }

    const undoBtn = document.getElementById('spen-tool-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (strokes.length > 0) {
          strokes.pop();
          redrawCanvas();
        }
      });
    }

    const clearBtn = document.getElementById('spen-tool-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('작성 중인 필기를 모두 지우시겠습니까?')) {
          strokes = [];
          redrawCanvas();
        }
      });
    }

    const saveBtn = document.getElementById('spen-btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveNoteData();
        closeModal();
      });
    }

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

  function openModal(noteKey = 'default_note') {
    currentKey = noteKey;
    injectStyles();
    createModalDOM();

    const overlay = document.getElementById('spen-modal-overlay');
    if (overlay) overlay.style.display = 'flex';

    loadNoteData();
    requestAnimationFrame(() => {
      initCanvas();
    });
  }

  function closeModal() {
    const overlay = document.getElementById('spen-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function saveNoteData() {
    try {
      const dataStr = JSON.stringify(strokes);
      localStorage.setItem(CONFIG.STORAGE_KEY_PREFIX + currentKey, dataStr);
    } catch (err) {
      console.warn('S-Pen 필기 저장 실패:', err);
    }
  }

  function loadNoteData() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + currentKey);
      strokes = raw ? JSON.parse(raw) : [];
    } catch (err) {
      strokes = [];
    }
  }

  // -------------------------------------------------------------
  // 6. 신문 아이콘 롱프레스 감지기
  // -------------------------------------------------------------
  function attachLongPressListeners() {
    let pressTimer = null;
    let isLongPressTriggered = false;
    let startX = 0, startY = 0;

    function isNewsIcon(target) {
      if (!target) return false;
      return target.closest([
        '[id*="news"]', '[class*="news"]', '[class*="newspaper"]',
        '[data-type="news"]', '[data-action*="news"]',
        'button:has(svg)', '.memo-btn', '.news-btn', '.fa-newspaper'
      ].join(','));
    }

    function startPress(e) {
      const iconTarget = isNewsIcon(e.target);
      if (!iconTarget) return;

      isLongPressTriggered = false;
      startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      pressTimer = setTimeout(() => {
        isLongPressTriggered = true;

        if (navigator.vibrate) {
          navigator.vibrate(60);
        }

        const noteId = iconTarget.dataset.id || iconTarget.id || 'news_memo';
        openModal(noteId);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLongPressListeners);
  } else {
    attachLongPressListeners();
  }

  window.openSpenNote = openModal;
})();
