(function() {
  // 테트리스 게임 클래스
  class GrowTetris {
    constructor() {
      this.modal = document.getElementById('tetrisModalOverlay');
      this.canvas = document.getElementById('tetrisCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.nextCanvas = document.getElementById('tetrisNextCanvas');
      this.nextCtx = this.nextCanvas.getContext('2d');
      
      this.scoreEl = document.getElementById('tetrisScore');
      this.levelEl = document.getElementById('tetrisLevel');
      this.closeBtn = document.getElementById('tetrisModalClose');
      this.pauseBtn = document.getElementById('tetrisPauseBtn');
      this.restartBtn = document.getElementById('tetrisRestartBtn');
      
      // 모바일 가상 패드 버튼
      this.ctrlLeft = document.getElementById('ctrlLeft');
      this.ctrlRotate = document.getElementById('ctrlRotate');
      this.ctrlRight = document.getElementById('ctrlRight');
      this.ctrlSoft = document.getElementById('ctrlSoft');
      this.ctrlHard = document.getElementById('ctrlHard');

      // 게임 기본 세팅
      this.gridCols = 10;
      this.gridRows = 20;
      this.blockSize = 20; // 기본 크기 (css에서 반응형 조정됨)
      this.nextBlockSize = 15;
      
      // 블록(테트리미노) 데이터 및 네온 색상 정의
      this.SHAPES = {
        'I': [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        'J': [[1,0,0], [1,1,1], [0,0,0]],
        'L': [[0,0,1], [1,1,1], [0,0,0]],
        'O': [[1,1], [1,1]],
        'S': [[0,1,1], [1,1,0], [0,0,0]],
        'Z': [[1,1,0], [0,1,1], [0,0,0]],
        'T': [[0,1,0], [1,1,1], [0,0,0]]
      };
      
      this.COLORS = {
        'I': '#00f2fe', // 시안 네온
        'J': '#0072ff', // 블루 네온
        'L': '#f97316', // 오렌지 네온
        'O': '#f5b800', // 옐로우 네온
        'S': '#22c55e', // 그린 네온
        'Z': '#ef4444', // 레드 네온
        'T': '#a855f7'  // 퍼플 네온
      };
      
      this.board = [];
      this.currentPiece = null;
      this.nextPiece = null;
      this.score = 0;
      this.level = 1;
      this.linesClearedTotal = 0;
      this.gameOver = false;
      this.isPaused = false;
      
      // 타이머 및 애니메이션 루프 변수
      this.dropCounter = 0;
      this.dropInterval = 1000; // ms
      this.lastTime = 0;
      this.animationFrameId = null;
      this.isOpen = false;
      
      // 바인딩
      this.initEvents();
    }
    
    // 이벤트 초기화
    initEvents() {
      // 닫기 버튼
      this.closeBtn.onclick = () => this.close();
      
      // 오버레이 클릭 시 닫기 (모달 내부 영역 클릭은 무시)
      this.modal.onclick = (e) => {
        if (e.target === this.modal) this.close();
      };
      
      // 일시정지 및 재시작 버튼
      this.pauseBtn.onclick = () => this.togglePause();
      this.restartBtn.onclick = () => this.reset();
      
      // 키보드 조작 바인딩
      window.addEventListener('keydown', (e) => {
        if (!this.isOpen || this.gameOver) return;
        
        switch (e.code) {
          case 'ArrowLeft':
            e.preventDefault();
            this.move(-1);
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.move(1);
            break;
          case 'ArrowDown':
            e.preventDefault();
            this.drop();
            break;
          case 'ArrowUp':
            e.preventDefault();
            this.rotate();
            break;
          case 'Space':
            e.preventDefault();
            this.hardDrop();
            break;
          case 'KeyP':
            e.preventDefault();
            this.togglePause();
            break;
          case 'Escape':
            e.preventDefault();
            this.close();
            break;
        }
      });
      
      // 모바일 가상 패드 터치 이벤트 (touchstart를 사용해 300ms 딜레이 제거)
      const bindMobileBtn = (btn, action) => {
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          if (!this.isOpen || this.gameOver || this.isPaused) return;
          action();
        }, { passive: false });
      };
      
      bindMobileBtn(this.ctrlLeft, () => this.move(-1));
      bindMobileBtn(this.ctrlRight, () => this.move(1));
      bindMobileBtn(this.ctrlRotate, () => this.rotate());
      bindMobileBtn(this.ctrlSoft, () => this.drop());
      bindMobileBtn(this.ctrlHard, () => this.hardDrop());
    }
    
    // 모달 열기
    open() {
      this.isOpen = true;
      this.modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // 화면 스크롤 금지
      
      // 모바일 바디 터치 스크롤 방지
      document.addEventListener('touchmove', this.preventTouchScroll, { passive: false });
      
      // 캔버스 크기 동적 조절
      this.resizeCanvas();
      
      this.reset();
    }
    
    // 모달 닫기
    close() {
      this.isOpen = false;
      this.modal.classList.add('hidden');
      document.body.style.overflow = ''; // 화면 스크롤 복원
      document.removeEventListener('touchmove', this.preventTouchScroll, { passive: false });
      
      this.stopLoop();
    }
    
    preventTouchScroll(e) {
      // 모달 바디 스크롤 차단
      e.preventDefault();
    }
    
    // 캔버스 드로잉 크기 동적 조정
    resizeCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.blockSize = this.canvas.width / this.gridCols;
      
      const nextRect = this.nextCanvas.getBoundingClientRect();
      this.nextCanvas.width = nextRect.width;
      this.nextCanvas.height = nextRect.height;
      this.nextBlockSize = this.nextCanvas.width / 4;
    }
    
    // 게임 초기화
    reset() {
      // 2차원 배열 보드 생성
      this.board = Array.from({ length: this.gridRows }, () => Array(this.gridCols).fill(0));
      
      this.score = 0;
      this.level = 1;
      this.linesClearedTotal = 0;
      this.gameOver = false;
      this.isPaused = false;
      this.dropInterval = 1000;
      
      this.scoreEl.innerText = this.score;
      this.levelEl.innerText = this.level;
      this.pauseBtn.innerText = 'PAUSE';
      
      this.currentPiece = this.createPiece();
      this.nextPiece = this.createPiece();
      
      this.lastTime = 0;
      this.dropCounter = 0;
      
      this.stopLoop();
      this.startLoop();
    }
    
    // 블록 생성
    createPiece() {
      const shapes = Object.keys(this.SHAPES);
      const randomShapeType = shapes[Math.floor(Math.random() * shapes.length)];
      const matrix = this.SHAPES[randomShapeType];
      
      return {
        type: randomShapeType,
        matrix: JSON.parse(JSON.stringify(matrix)),
        x: Math.floor((this.gridCols - matrix[0].length) / 2),
        y: 0
      };
    }
    
    // 게임 루프 시작
    startLoop() {
      const update = (time = 0) => {
        if (this.isPaused || this.gameOver) return;
        
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
          this.drop();
        }
        
        this.draw();
        this.animationFrameId = requestAnimationFrame(update);
      };
      
      this.lastTime = performance.now();
      this.animationFrameId = requestAnimationFrame(update);
    }
    
    // 게임 루프 중지
    stopLoop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
    
    // 일시정지 토글
    togglePause() {
      if (this.gameOver) return;
      this.isPaused = !this.isPaused;
      this.pauseBtn.innerText = this.isPaused ? 'RESUME' : 'PAUSE';
      
      if (this.isPaused) {
        this.stopLoop();
        this.drawPauseOverlay();
      } else {
        this.startLoop();
      }
    }
    
    // 충돌 감지
    collide(board, piece, xOffset = 0, yOffset = 0, nextMatrix = null) {
      const matrix = nextMatrix || piece.matrix;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            const nextX = piece.x + c + xOffset;
            const nextY = piece.y + r + yOffset;
            
            // 보드 범위를 벗어나거나 기존 블록과 겹치면 충돌
            if (nextX < 0 || nextX >= this.gridCols || nextY >= this.gridRows) {
              return true;
            }
            if (nextY >= 0 && board[nextY][nextX] !== 0) {
              return true;
            }
          }
        }
      }
      return false;
    }
    
    // 블록 이동
    move(dir) {
      if (this.isPaused || this.gameOver) return;
      this.currentPiece.x += dir;
      if (this.collide(this.board, this.currentPiece)) {
        this.currentPiece.x -= dir;
      }
      this.draw();
    }
    
    // 블록 낙하 (소프트 드롭)
    drop() {
      if (this.isPaused || this.gameOver) return;
      this.currentPiece.y++;
      this.dropCounter = 0;
      
      if (this.collide(this.board, this.currentPiece)) {
        this.currentPiece.y--;
        this.merge();
        this.clearLines();
        this.nextTurn();
      }
      this.draw();
    }
    
    // 하드 드롭
    hardDrop() {
      if (this.isPaused || this.gameOver) return;
      while (!this.collide(this.board, this.currentPiece, 0, 1)) {
        this.currentPiece.y++;
      }
      this.dropCounter = 0;
      this.merge();
      this.clearLines();
      this.nextTurn();
      this.draw();
    }
    
    // 블록 회전
    rotate() {
      if (this.isPaused || this.gameOver) return;
      
      const matrix = this.currentPiece.matrix;
      const n = matrix.length;
      
      // 90도 회전 행렬 생성 (전치 후 열 역순)
      const rotated = Array.from({ length: n }, () => Array(n).fill(0));
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          rotated[c][n - 1 - r] = matrix[r][c];
        }
      }
      
      // 벽 차기 (Wall Kick) 보정
      const originalX = this.currentPiece.x;
      let offset = 1;
      
      // 충돌이 감지되면 좌우로 1칸씩 밀어 보며 회전 시도
      while (this.collide(this.board, this.currentPiece, 0, 0, rotated)) {
        this.currentPiece.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (Math.abs(offset) > matrix[0].length) {
          // 보정 실패 시 회전 미적용
          this.currentPiece.x = originalX;
          return;
        }
      }
      
      this.currentPiece.matrix = rotated;
      this.draw();
    }
    
    // 블록 보드에 합체
    merge() {
      const p = this.currentPiece;
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c] !== 0) {
            const boardY = p.y + r;
            if (boardY < 0) {
              this.gameOver = true;
              return;
            }
            this.board[boardY][p.x + c] = p.type;
          }
        }
      }
    }
    
    // 완성된 줄 제거 및 점수 가산
    clearLines() {
      let linesCleared = 0;
      
      for (let r = this.gridRows - 1; r >= 0; r--) {
        const isLineComplete = this.board[r].every(val => val !== 0);
        if (isLineComplete) {
          this.board.splice(r, 1);
          this.board.unshift(Array(this.gridCols).fill(0));
          linesCleared++;
          r++; // 줄이 당겨지므로 인덱스 보정
        }
      }
      
      if (linesCleared > 0) {
        // 점수 계산 (클래식 가산 방식 활용)
        const lineScores = [0, 100, 300, 500, 800];
        const addedScore = (lineScores[linesCleared] || 800) * this.level;
        this.score += addedScore;
        this.linesClearedTotal += linesCleared;
        
        // 10줄마다 레벨업 (낙하 속도 빨라짐)
        this.level = Math.floor(this.linesClearedTotal / 10) + 1;
        this.dropInterval = Math.max(100 - (this.level - 1) * 8, 10) * 10; // 레벨당 속도 80ms 단축 (최소 100ms)
        
        this.scoreEl.innerText = this.score;
        this.levelEl.innerText = this.level;
        
        // 팡파레 효과 (4줄을 동시에 지우면 화려하게 confetti)
        if (linesCleared === 4 && typeof window.confetti === 'function') {
          window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
      }
    }
    
    // 다음 턴 세팅
    nextTurn() {
      if (this.gameOver) {
        this.stopLoop();
        this.drawGameOverOverlay();
        return;
      }
      
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.createPiece();
      
      // 소환되자마자 부딪히면 바로 게임오버
      if (this.collide(this.board, this.currentPiece)) {
        this.gameOver = true;
        this.stopLoop();
        this.drawGameOverOverlay();
      }
    }
    
    // 캔버스 그리기 함수
    draw() {
      // 1. 보드 전체 지우기
      this.ctx.fillStyle = '#020617';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // 2. 그리드 배경선 그리기
      this.drawGridLines();
      
      // 3. 안착된 보드 블록 그리기
      for (let r = 0; r < this.gridRows; r++) {
        for (let c = 0; c < this.gridCols; c++) {
          const type = this.board[r][c];
          if (type !== 0) {
            this.drawBlock(this.ctx, c, r, this.COLORS[type], this.blockSize);
          }
        }
      }
      
      // 4. 낙하 예상선 (Ghost Piece) 그리기
      this.drawGhostPiece();
      
      // 5. 현재 조작중인 활성 블록 그리기
      if (this.currentPiece && !this.gameOver) {
        const p = this.currentPiece;
        for (let r = 0; r < p.matrix.length; r++) {
          for (let c = 0; c < p.matrix[r].length; c++) {
            if (p.matrix[r][c] !== 0) {
              this.drawBlock(this.ctx, p.x + c, p.y + r, this.COLORS[p.type], this.blockSize);
            }
          }
        }
      }
      
      // 6. 넥스트 패널 그리기
      this.drawNextPiece();
    }
    
    // 그리드 보조선
    drawGridLines() {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      this.ctx.lineWidth = 1;
      
      for (let c = 1; c < this.gridCols; c++) {
        const x = c * this.blockSize;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.canvas.height);
        this.ctx.stroke();
      }
      for (let r = 1; r < this.gridRows; r++) {
        const y = r * this.blockSize;
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.canvas.width, y);
        this.ctx.stroke();
      }
    }
    
    // 단일 블록 그리기 (네온 스타일 반영)
    drawBlock(ctx, x, y, colorStr, size, isGhost = false) {
      const padding = 1.5;
      const bx = x * size + padding;
      const by = y * size + padding;
      const bSize = size - padding * 2;
      const radius = 4; // 둥근 블록 스타일
      
      ctx.save();
      
      // 네온 빛 효과 (성능을 위해 고스트는 제외)
      if (!isGhost) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = colorStr;
      }
      
      // 블록 라운드 바디 드로잉
      ctx.fillStyle = isGhost ? 'transparent' : colorStr;
      ctx.strokeStyle = colorStr;
      ctx.lineWidth = isGhost ? 1.5 : 1;
      
      ctx.beginPath();
      ctx.roundRect(bx, by, bSize, bSize, radius);
      
      if (isGhost) {
        ctx.setLineDash([3, 2]); // 점선 효과
        ctx.stroke();
      } else {
        ctx.fill();
        ctx.stroke();
        
        // 안쪽에 살짝 밝은 네온 반사광 하이라이트 추가
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(bx + 2, by + 2, bSize - 4, bSize - 4, radius - 1);
        ctx.fill();
      }
      
      ctx.restore();
    }
    
    // Ghost Piece (바닥 낙하 예상선) 그리기
    drawGhostPiece() {
      if (!this.currentPiece || this.gameOver) return;
      
      const ghost = { ...this.currentPiece };
      while (!this.collide(this.board, ghost, 0, 1)) {
        ghost.y++;
      }
      
      // 현재 조각과 겹치지 않을 때만 고스트 표시
      if (ghost.y !== this.currentPiece.y) {
        for (let r = 0; r < ghost.matrix.length; r++) {
          for (let c = 0; c < ghost.matrix[r].length; c++) {
            if (ghost.matrix[r][c] !== 0) {
              this.drawBlock(this.ctx, ghost.x + c, ghost.y + r, this.COLORS[ghost.type], this.blockSize, true);
            }
          }
        }
      }
    }
    
    // 넥스트 패널 드로잉
    drawNextPiece() {
      this.nextCtx.fillStyle = '#020617';
      this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
      
      if (!this.nextPiece) return;
      
      const p = this.nextPiece;
      const m = p.matrix;
      
      // 화면 중앙 정렬을 위한 오프셋 계산
      const xOffset = (4 - m[0].length) / 2;
      const yOffset = (4 - m.length) / 2;
      
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (m[r][c] !== 0) {
            this.drawBlock(this.nextCtx, c + xOffset, r + yOffset, this.COLORS[p.type], this.nextBlockSize);
          }
        }
      }
    }
    
    // 일시정지 오버레이
    drawPauseOverlay() {
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      this.ctx.fillStyle = '#00f2fe';
      this.ctx.font = 'bold 20px inherit';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
    }
    
    // 게임오버 오버레이
    drawGameOverOverlay() {
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      this.ctx.fillStyle = '#ef4444';
      this.ctx.font = 'bold 22px inherit';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 20);
      
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = '12px inherit';
      this.ctx.fillText('PRESS RESET TO RESTART', this.canvas.width / 2, this.canvas.height / 2 + 15);
    }
  }

  // 전역 인스턴스 등록
  document.addEventListener('DOMContentLoaded', () => {
    window.growTetris = new GrowTetris();
  });
})();
