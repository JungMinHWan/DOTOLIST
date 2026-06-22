/**
 * 🧮 백칸 수학 (100-Cell Math Game)
 * Supabase 연동 랭킹 시스템 탑재
 */
(function() {
  class MathGame {
    constructor() {
      // DOM Elements
      this.modal = document.getElementById('mathModalOverlay');
      this.closeBtn = document.getElementById('mathModalClose');
      
      this.setupScreen = document.getElementById('mathSetup');
      this.gameArea = document.getElementById('mathGameArea');
      
      this.currentOpEl = document.getElementById('mathCurrentOp');
      this.correctCountEl = document.getElementById('mathCorrect');
      this.wrongCountEl = document.getElementById('mathWrong');
      this.progressEl = document.getElementById('mathProgress');
      this.timerEl = document.getElementById('mathTimer');
      
      this.messageEl = document.getElementById('mathMessage');
      this.gridContainer = document.getElementById('mathGrid');
      
      // Ranking Elements
      this.rankingFilter = document.getElementById('mathRankingFilter');
      this.rankingBody = document.getElementById('mathRankingBody');
      
      // Score submit Elements
      this.submitOverlay = document.getElementById('mathRankSubmitOverlay');
      this.finalTimeEl = document.getElementById('mathFinalTime');
      this.finalMistakesEl = document.getElementById('mathFinalMistakes');
      this.playerNameInput = document.getElementById('mathPlayerNameInput');
      
      // Game States
      this.rowNumbers = [];
      this.colNumbers = [];
      this.currentOperation = '';
      this.answers = [];
      this.correctCount = 0;
      this.wrongCount = 0;
      this.startTime = null;
      this.timerInterval = null;
      this.elapsedSeconds = 0;
      this.mistakesCount = 0;
      this.playerNameCache = localStorage.getItem('math_player_name') || '';

      this.operationSymbols = {
        'add': '+',
        'subtract': '−',
        'multiply': '×',
        'divide': '÷'
      };

      this.operationNames = {
        'add': '더하기',
        'subtract': '빼기',
        'multiply': '곱하기',
        'divide': '나누기'
      };

      this.initEvents();
    }

    initEvents() {
      if (this.closeBtn) {
        this.closeBtn.onclick = () => this.close();
      }
      if (this.modal) {
        this.modal.onclick = (e) => {
          if (e.target === this.modal) this.close();
        };
      }
      
      // 입력 필드 복원
      if (this.playerNameInput) {
        this.playerNameInput.value = this.playerNameCache;
      }
    }

    open() {
      if (this.modal) {
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        // 랭킹 보드 초기 로드
        this.loadRanking(this.rankingFilter ? this.rankingFilter.value : 'all');
      }
    }

    close() {
      if (this.modal) {
        this.stopTimer();
        this.modal.classList.add('hidden');
        this.submitOverlay.classList.add('hidden');
        
        // 다른 모달이 열려있는지 확인 후 overflow 복구
        const isAnyModalOpen = document.querySelectorAll('.tetris-modal-overlay:not(.hidden), .nap-modal-overlay:not(.hidden), .math-modal-overlay:not(.hidden)').length > 0;
        if (!isAnyModalOpen) {
          document.body.style.overflow = '';
        }
      }
    }

    async loadRanking(operation) {
      if (!this.rankingBody) return;
      this.rankingBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px 0;">랭킹 정보를 불러오는 중...</td></tr>`;

      const filterOp = (operation === 'all') ? null : operation;
      
      try {
        // Supabase API를 통한 랭킹 탑10 조회
        const scores = await window.api.getTopMathScores(filterOp, 10);
        
        if (!scores || scores.length === 0) {
          this.rankingBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 20px 0;">등록된 기록이 없습니다. 첫 주인공이 되어보세요!</td></tr>`;
          return;
        }

        this.rankingBody.innerHTML = '';
        scores.forEach((row, index) => {
          const tr = document.createElement('tr');
          
          // 순위 이모지 데코레이션
          let rankDecor = index + 1;
          if (index === 0) rankDecor = '🥇';
          else if (index === 1) rankDecor = '🥈';
          else if (index === 2) rankDecor = '🥉';

          const formattedTime = this.formatTime(row.elapsed_time);
          const dateStr = row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
          
          tr.innerHTML = `
            <td style="font-weight: 700;">${rankDecor}</td>
            <td style="font-weight: 700; color: #8b5cf6;">${this.escapeHtml(row.player_name)}</td>
            <td><span class="quest-xp-reward" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${this.operationNames[row.operation]}</span></td>
            <td style="font-family: monospace; font-weight: 700;">${formattedTime}</td>
            <td style="color: ${row.mistakes > 0 ? '#ef4444' : '#64748b'}; font-weight: 700;">${row.mistakes}</td>
            <td style="color: #64748b; font-size: 11px;">${dateStr}</td>
          `;
          this.rankingBody.appendChild(tr);
        });
      } catch (err) {
        console.error('loadRanking error:', err);
        this.rankingBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 20px 0;">랭킹 정보를 불러오지 못했습니다.</td></tr>`;
      }
    }

    startGame(operation) {
      this.currentOperation = operation;
      this.setupScreen.classList.add('hidden');
      this.gameArea.classList.remove('hidden');
      this.currentOpEl.textContent = this.operationSymbols[operation];
      
      this.correctCount = 0;
      this.wrongCount = 0;
      this.mistakesCount = 0;
      this.elapsedSeconds = 0;
      this.updateStats();

      // 빼기 연산 안내 메시지
      if (operation === 'subtract') {
        this.showMessage('💡 음수는 숫자 우측 하단의 − 버튼을 눌러 설정해 주세요!', 'warning');
      } else {
        this.hideMessage();
      }
      
      // 1~10 난수 셔플 생성
      this.rowNumbers = this.getRandomNumbers();
      this.colNumbers = this.getRandomNumbers();
      
      this.initializeAnswers();
      this.renderGrid();
      this.startTimer();
    }

    getRandomNumbers() {
      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      // Fisher-Yates 셔플 알고리즘
      for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = numbers[i];
        numbers[i] = numbers[j];
        numbers[j] = temp;
      }
      return numbers;
    }

    initializeAnswers() {
      this.answers = [];
      for (let i = 0; i < 10; i++) {
        this.answers[i] = [];
        for (let j = 0; j < 10; j++) {
          this.answers[i][j] = {
            userAnswer: '',
            correctAnswer: this.calculateAnswer(i, j),
            isCorrect: null,
            isNegative: false
          };
        }
      }
    }

    calculateAnswer(row, col) {
      const rowNum = this.rowNumbers[row];
      const colNum = this.colNumbers[col];
      
      switch(this.currentOperation) {
        case 'add':
          return rowNum + colNum;
        case 'subtract':
          return rowNum - colNum;
        case 'multiply':
          return rowNum * colNum;
        case 'divide':
          // 소수점 2자리까지만 반올림 허용
          return Math.round((rowNum / colNum) * 100) / 100;
        default:
          return 0;
      }
    }

    renderGrid() {
      if (!this.gridContainer) return;
      this.gridContainer.innerHTML = '';
      
      // 1. 코너 셀 (연산 기호)
      const cornerCell = document.createElement('div');
      cornerCell.className = 'math-cell corner';
      cornerCell.textContent = this.operationSymbols[this.currentOperation];
      this.gridContainer.appendChild(cornerCell);
      
      // 2. 상단 가로 헤더
      for (let j = 0; j < 10; j++) {
        const headerCell = document.createElement('div');
        headerCell.className = 'math-cell header';
        headerCell.textContent = this.colNumbers[j];
        this.gridContainer.appendChild(headerCell);
      }
      
      // 3. 10x10 입력 셀 & 세로 헤더
      for (let i = 0; i < 10; i++) {
        // 세로 헤더
        const headerCell = document.createElement('div');
        headerCell.className = 'math-cell header';
        headerCell.textContent = this.rowNumbers[i];
        this.gridContainer.appendChild(headerCell);
        
        // 입력 셀들
        for (let j = 0; j < 10; j++) {
          const cellData = this.answers[i][j];
          
          const cell = document.createElement('div');
          cell.className = 'math-cell input';
          cell.dataset.row = i;
          cell.dataset.col = j;
          
          const cellContent = document.createElement('div');
          cellContent.className = 'math-cell-content';
          
          // 빼기 연산일 때만 음수 부호 토글 버튼 추가
          if (this.currentOperation === 'subtract') {
            const minusToggle = document.createElement('button');
            minusToggle.className = 'math-minus-toggle';
            minusToggle.textContent = '−';
            minusToggle.dataset.row = i;
            minusToggle.dataset.col = j;
            
            if (cellData.isNegative) {
              minusToggle.classList.add('active');
              cell.classList.add('negative');
            }
            
            minusToggle.onclick = (e) => {
              e.stopPropagation();
              this.toggleNegative(i, j);
            };
            
            cellContent.appendChild(minusToggle);
          }
          
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.pattern = '[0-9]*';
          input.dataset.row = i;
          input.dataset.col = j;
          input.value = cellData.userAnswer;
          
          // 채점 여부에 따른 디자인 바인딩
          if (cellData.userAnswer !== '') {
            if (cellData.isCorrect === true) {
              cell.classList.add('filled');
            } else if (cellData.isCorrect === false) {
              cell.classList.add('wrong');
              
              const wrongMark = document.createElement('span');
              wrongMark.className = 'math-wrong-mark';
              wrongMark.textContent = '✗';
              cell.appendChild(wrongMark);
            }
          }
          
          // 빼기 연산 시 음수 인디케이터 표시
          if (this.currentOperation === 'subtract' && cellData.isNegative && cellData.userAnswer !== '') {
            const minusIndicator = document.createElement('span');
            minusIndicator.className = 'math-minus-indicator';
            minusIndicator.textContent = '−';
            cell.appendChild(minusIndicator);
          }
          
          // 이벤트 핸들러 바인딩
          input.oninput = (e) => this.handleInput(e);
          input.onkeydown = (e) => this.handleKeyDown(e);
          
          cellContent.appendChild(input);
          cell.appendChild(cellContent);
          this.gridContainer.appendChild(cell);
        }
      }
    }

    toggleNegative(row, col) {
      this.answers[row][col].isNegative = !this.answers[row][col].isNegative;
      this.renderGrid();
      
      // 해당 셀의 input에 포커스를 다시 줍니다.
      const targetInput = this.gridContainer.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
      if (targetInput) targetInput.focus();
    }

    handleInput(e) {
      const input = e.target;
      const row = parseInt(input.dataset.row);
      const col = parseInt(input.dataset.col);
      let value = input.value;
      
      if (this.currentOperation === 'divide') {
        // 나누기는 소수점 허용
        value = value.replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
          value = parts[0] + '.' + parts.slice(1).join('');
        }
      } else {
        // 더하기, 빼기, 곱하기는 정수만 입력
        value = value.replace(/[^0-9]/g, '');
      }
      
      input.value = value;
      this.answers[row][col].userAnswer = value;
    }

    handleKeyDown(e) {
      const input = e.target;
      const row = parseInt(input.dataset.row);
      const col = parseInt(input.dataset.col);
      
      let nextRow = row;
      let nextCol = col;
      
      if (e.key === 'Enter') {
        // 엔터 시 다음 셀(오른쪽)로, 행 끝이면 아래 행 첫째 셀로 이동
        nextCol = col + 1;
        if (nextCol >= 10) {
          nextCol = 0;
          nextRow = row + 1;
        }
        if (nextRow < 10) {
          const nextInput = this.gridContainer.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
          }
        }
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        nextCol = col + 1;
        if (nextCol < 10) {
          const nextInput = this.gridContainer.querySelector(`input[data-row="${row}"][data-col="${nextCol}"]`);
          if (nextInput) nextInput.focus();
        }
      } else if (e.key === 'ArrowLeft') {
        nextCol = col - 1;
        if (nextCol >= 0) {
          const nextInput = this.gridContainer.querySelector(`input[data-row="${row}"][data-col="${nextCol}"]`);
          if (nextInput) nextInput.focus();
        }
      } else if (e.key === 'ArrowDown') {
        nextRow = row + 1;
        if (nextRow < 10) {
          const nextInput = this.gridContainer.querySelector(`input[data-row="${nextRow}"][data-col="${col}"]`);
          if (nextInput) nextInput.focus();
        }
      } else if (e.key === 'ArrowUp') {
        nextRow = row - 1;
        if (nextRow >= 0) {
          const nextInput = this.gridContainer.querySelector(`input[data-row="${nextRow}"][data-col="${col}"]`);
          if (nextInput) nextInput.focus();
        }
      }
    }

    checkAnswers() {
      this.correctCount = 0;
      this.wrongCount = 0;
      let unfilledCount = 0;

      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          const cell = this.answers[i][j];
          if (cell.userAnswer === '') {
            cell.isCorrect = null;
            unfilledCount++;
            continue;
          }
          
          let userVal = parseFloat(cell.userAnswer);
          if (this.currentOperation === 'subtract' && cell.isNegative) {
            userVal = -userVal;
          }
          
          const correctVal = cell.correctAnswer;
          
          // 소수점 2자리(0.01오차) 내로 정답 인정
          if (Math.abs(userVal - correctVal) < 0.01) {
            cell.isCorrect = true;
            this.correctCount++;
          } else {
            cell.isCorrect = false;
            this.wrongCount++;
            this.mistakesCount++; // 누적 실수 카운트 (랭킹 등록용)
          }
        }
      }

      this.renderGrid();
      this.updateStats();

      if (this.correctCount === 100) {
        // 100칸 모두 완벽 성공
        this.stopTimer();
        this.showMessage('🎉 완벽합니다! 100칸을 모두 정복하셨습니다!', 'success');
        
        // 랭킹 등록 다이얼로그 노출
        setTimeout(() => {
          this.openRankSubmit();
        }, 800);
      } else {
        if (unfilledCount > 0) {
          this.showMessage(`체크 완료: 정답 ${this.correctCount}개, 오답 ${this.wrongCount}개 (비어있는 칸: ${unfilledCount}개)`, 'info');
        } else {
          this.showMessage(`체크 완료: 정답 ${this.correctCount}개, 오답 ${this.wrongCount}개 (모든 칸을 완료하려면 틀린 부분을 고쳐보세요!)`, 'error');
        }
      }
    }

    clearAll() {
      if (confirm('정말로 작성한 모든 답안을 지우시겠습니까?')) {
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 10; j++) {
            this.answers[i][j].userAnswer = '';
            this.answers[i][j].isCorrect = null;
            this.answers[i][j].isNegative = false;
          }
        }
        this.correctCount = 0;
        this.wrongCount = 0;
        this.renderGrid();
        this.updateStats();
        this.hideMessage();
      }
    }

    backToMenu() {
      if (confirm('게임에서 나가시겠습니까? 현재까지의 게임 내용은 저장되지 않습니다.')) {
        this.stopTimer();
        this.gameArea.classList.add('hidden');
        this.setupScreen.classList.remove('hidden');
        
        // 해당 연산의 최신 랭킹 리스트를 갱신
        this.loadRanking(this.rankingFilter ? this.rankingFilter.value : 'all');
      }
    }

    updateStats() {
      if (this.correctCountEl) this.correctCountEl.textContent = this.correctCount;
      if (this.wrongCountEl) this.wrongCountEl.textContent = this.wrongCount;
      
      const progress = Math.round((this.correctCount / 100) * 100);
      if (this.progressEl) this.progressEl.textContent = progress + '%';
    }

    startTimer() {
      this.stopTimer();
      const startTimeStamp = Date.now();
      
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds = Math.floor((Date.now() - startTimeStamp) / 1000);
        if (this.timerEl) {
          this.timerEl.textContent = this.formatTime(this.elapsedSeconds);
        }
      }, 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    showMessage(text, type) {
      if (!this.messageEl) return;
      this.messageEl.textContent = text;
      this.messageEl.className = `math-message ${type}`;
      this.messageEl.style.display = 'block';
    }

    hideMessage() {
      if (this.messageEl) {
        this.messageEl.style.display = 'none';
      }
    }

    // 랭킹 등록 오버레이 제어
    openRankSubmit() {
      if (!this.submitOverlay) return;
      this.finalTimeEl.textContent = this.formatTime(this.elapsedSeconds);
      this.finalMistakesEl.textContent = this.mistakesCount;
      this.submitOverlay.classList.remove('hidden');
      if (this.playerNameInput) {
        this.playerNameInput.focus();
        this.playerNameInput.select();
      }
    }

    closeRankSubmit() {
      if (this.submitOverlay) {
        this.submitOverlay.classList.add('hidden');
      }
    }

    async submitScore() {
      if (!this.playerNameInput) return;
      const playerName = this.playerNameInput.value.trim();
      
      if (!playerName) {
        alert('이름을 입력해 주세요!');
        this.playerNameInput.focus();
        return;
      }

      // 캐싱 및 로컬스토리지 저장
      this.playerNameCache = playerName;
      localStorage.setItem('math_player_name', playerName);

      try {
        const res = await window.api.saveMathScore(
          playerName,
          this.currentOperation,
          100, // 점수 (100칸 성공)
          this.elapsedSeconds,
          this.mistakesCount
        );

        if (res.success) {
          alert('🥇 명예의 전당에 성공적으로 등록되었습니다!');
          this.closeRankSubmit();
          
          // 게임 영역 종료하고 메인으로 돌아감
          this.gameArea.classList.add('hidden');
          this.setupScreen.classList.remove('hidden');
          
          // 필터와 랭킹 갱신
          if (this.rankingFilter) {
            this.rankingFilter.value = this.currentOperation;
          }
          this.loadRanking(this.currentOperation);
        } else {
          alert('등록에 실패하였습니다: ' + res.error);
        }
      } catch (err) {
        console.error('submitScore error:', err);
        alert('서버 오류로 인해 랭킹을 등록하지 못했습니다.');
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // 전역 인스턴스 초기화
  window.mathGame = new MathGame();
})();
