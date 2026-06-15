(function() {
  // === 1. Feature Selection Menu ===
  class FeatureMenu {
    constructor() {
      this.modal = document.getElementById('featureSelectionModal');
      this.closeBtn = document.getElementById('featureSelectionClose');
      this.btnTetris = document.getElementById('btnSelectTetris');
      this.btnNap = document.getElementById('btnSelectNap');
      
      this.initEvents();
    }
    
    initEvents() {
      if (this.closeBtn) this.closeBtn.onclick = () => this.close();
      
      if (this.modal) {
        this.modal.onclick = (e) => {
          if (e.target === this.modal) this.close();
        };
      }
      
      if (this.btnTetris) {
        this.btnTetris.onclick = () => {
          this.close();
          if (window.growTetris && typeof window.growTetris.open === 'function') {
            window.growTetris.open();
          }
        };
      }
      
      if (this.btnNap) {
        this.btnNap.onclick = () => {
          this.close();
          if (window.napPlayer && typeof window.napPlayer.open === 'function') {
            window.napPlayer.open();
          }
        };
      }
    }
    
    open() {
      if (this.modal) {
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }
    
    close() {
      if (this.modal) {
        this.modal.classList.add('hidden');
        // 다른 모달이 열려 있지 않을 때만 스크롤 복원
        const isAnyModalOpen = document.querySelectorAll('.tetris-modal-overlay:not(.hidden), .nap-modal-overlay:not(.hidden)').length > 0;
        if (!isAnyModalOpen) {
          document.body.style.overflow = '';
        }
      }
    }
  }

  // === 2. Nap Binaural Beats Player ===
  class NapPlayer {
    constructor() {
      this.modal = document.getElementById('napModalOverlay');
      this.closeBtn = document.getElementById('napModalClose');
      
      this.btnPlay = document.getElementById('btnNapPlay');
      this.btnStop = document.getElementById('btnNapStop');
      this.volRange = document.getElementById('napVol');
      this.volOut = document.getElementById('napVolOut');
      this.alarmToggle = document.getElementById('napAlarmToggle');
      this.alarmLabel = document.getElementById('napAlarmLabel');
      
      this.prog = document.getElementById('napProg');
      this.elapsedEl = document.getElementById('napElapsed');
      this.phaseDot = document.getElementById('napPhaseDot');
      this.phaseName = document.getElementById('napPhaseName');
      this.phaseDesc = document.getElementById('napPhaseDesc');
      
      this.freqLEl = document.getElementById('napFreqL');
      this.freqBeatEl = document.getElementById('napFreqBeat');
      this.freqREl = document.getElementById('napFreqR');
      
      // 상태 변수
      this.TOTAL = 40 * 60; // 40분 = 2400초
      this.PHASES = [
        {start: 0,       end: 10 * 60,  name: '입면 유도', desc: 'Alpha→Theta — 졸음을 천천히 유도합니다',  dot: '#9FE1CB', beatStart: 10, beatEnd: 4,  baseFreq: 300},
        {start: 10 * 60, end: 35 * 60,  name: '낮잠 수면', desc: 'Theta — 가벼운 수면 상태를 유지합니다',    dot: '#1D9E75', beatStart: 4,  beatEnd: 4,  baseFreq: 300},
        {start: 35 * 60, end: 40 * 60,  name: '기상 준비', desc: 'Theta→Beta — 자연스럽게 깨어납니다',       dot: '#5DCAA5', beatStart: 4,  beatEnd: 14, baseFreq: 300}
      ];
      
      this.ctx = null;
      this.leftOsc = null;
      this.rightOsc = null;
      this.merger = null;
      this.gainNode = null;
      
      this.alarmOsc = null;
      this.alarmGain = null;
      
      this.running = false;
      this.elapsed = 0;
      this.realStartTime = 0;
      this.animId = null;
      this.prevPhaseIdx = -1;
      this.alarmOn = true;
      this.isOpen = false;
      
      this.initEvents();
    }
    
    initEvents() {
      if (this.closeBtn) this.closeBtn.onclick = () => this.close();
      
      if (this.modal) {
        this.modal.onclick = (e) => {
          if (e.target === this.modal) this.close();
        };
      }
      
      if (this.btnPlay) {
        this.btnPlay.onclick = () => this.togglePlay();
      }
      
      if (this.btnStop) {
        this.btnStop.onclick = () => this.stop();
      }
      
      if (this.volRange) {
        this.volRange.oninput = () => {
          const val = this.volRange.value;
          if (this.volOut) this.volOut.textContent = val;
          if (this.gainNode) {
            // 볼륨 감쇄 조절 (Web Audio API 볼륨은 지수 스케일 적용 권장)
            this.gainNode.gain.value = (parseFloat(val) / 100) * 0.3;
          }
        };
      }
      
      if (this.alarmToggle) {
        this.alarmToggle.onclick = () => {
          this.alarmOn = !this.alarmOn;
          this.alarmToggle.classList.toggle('on', this.alarmOn);
          if (this.alarmLabel) this.alarmLabel.textContent = this.alarmOn ? '켜짐' : '꺼짐';
          
          // 재생 중일 때 알람 예약 실시간 업데이트
          if (this.running) {
            this.cancelAlarm();
            if (this.alarmOn) {
              this.scheduleAlarm(this.elapsed, this.ctx.currentTime);
            }
          }
        };
      }
    }
    
    initAudio() {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      this.merger = this.ctx.createChannelMerger(2);
      this.gainNode = this.ctx.createGain();
      
      const volVal = this.volRange ? parseFloat(this.volRange.value) : 40;
      this.gainNode.gain.value = (volVal / 100) * 0.3;
      
      this.merger.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      
      this.leftOsc = this.ctx.createOscillator();
      this.rightOsc = this.ctx.createOscillator();
      
      this.leftOsc.type = 'sine';
      this.rightOsc.type = 'sine';
      
      const lGain = this.ctx.createGain(); lGain.gain.value = 1;
      const rGain = this.ctx.createGain(); rGain.gain.value = 1;
      
      this.leftOsc.connect(lGain);
      this.rightOsc.connect(rGain);
      
      lGain.connect(this.merger, 0, 0); // Left
      rGain.connect(this.merger, 0, 1); // Right
      
      this.leftOsc.start();
      this.rightOsc.start();
    }
    
    getPhaseIdx(t) {
      for (let i = 0; i < this.PHASES.length; i++) {
        if (t >= this.PHASES[i].start && t < this.PHASES[i].end) return i;
      }
      return this.PHASES.length - 1;
    }
    
    getBeat(t) {
      const idx = this.getPhaseIdx(t);
      const ph = this.PHASES[idx];
      const prog = (t - ph.start) / (ph.end - ph.start);
      return ph.beatStart + (ph.beatEnd - ph.beatStart) * prog;
    }
    
    scheduleAudioTimeline(elapsed, now) {
      if (!this.ctx || !this.leftOsc || !this.rightOsc) return;
      
      // 기존 예약되어있던 주파수 스케줄 제거
      this.leftOsc.frequency.cancelScheduledValues(now);
      this.rightOsc.frequency.cancelScheduledValues(now);
      
      // 왼쪽 주파수는 300Hz 고정
      this.leftOsc.frequency.setValueAtTime(300, now);
      
      // 오른쪽 귀 주파수 (300 + beat) 스케줄링
      const rightParam = this.rightOsc.frequency;
      
      // 1. 현재 시점 예약
      const currentBeat = this.getBeat(elapsed);
      rightParam.setValueAtTime(300 + currentBeat, now);
      
      // 2. 이후 구간 경계별 점진적 주파수 변동 예약
      // 입면 유도 구간 (0 ~ 10분)
      if (elapsed < 600) {
        const timeToPhase1End = 600 - elapsed;
        rightParam.linearRampToValueAtTime(300 + 4, now + timeToPhase1End);
      }
      
      // 낮잠 수면 구간 (10 ~ 35분)
      if (elapsed < 2100) {
        const timeToPhase2End = 2100 - elapsed;
        rightParam.setValueAtTime(300 + 4, now + Math.max(0, 600 - elapsed));
        rightParam.linearRampToValueAtTime(300 + 4, now + timeToPhase2End);
      }
      
      // 기상 준비 구간 (35 ~ 40분)
      if (elapsed < 2400) {
        const timeToPhase3End = 2400 - elapsed;
        rightParam.setValueAtTime(300 + 4, now + Math.max(0, 2100 - elapsed));
        rightParam.linearRampToValueAtTime(300 + 14, now + timeToPhase3End);
      }
      
      // 3. 기상 알람 예약
      this.cancelAlarm();
      if (this.alarmOn) {
        this.scheduleAlarm(elapsed, now);
      }
    }
    
    scheduleAlarm(elapsed, now) {
      if (!this.ctx) return;
      const timeToAlarm = this.TOTAL - elapsed;
      if (timeToAlarm <= 0) return;
      
      const alarmTime = now + timeToAlarm;
      
      this.alarmOsc = this.ctx.createOscillator();
      this.alarmGain = this.ctx.createGain();
      
      this.alarmOsc.type = 'sine';
      this.alarmOsc.frequency.value = 880;
      
      this.alarmOsc.connect(this.alarmGain);
      this.alarmGain.connect(this.ctx.destination);
      
      // 3초간 비프음 반복 (0.8초 온, 0.2초 오프)
      this.alarmGain.gain.setValueAtTime(0, now);
      this.alarmGain.gain.setValueAtTime(0, alarmTime);
      this.alarmGain.gain.linearRampToValueAtTime(0.3, alarmTime + 0.2);
      this.alarmGain.gain.linearRampToValueAtTime(0, alarmTime + 0.8);
      this.alarmGain.gain.linearRampToValueAtTime(0.3, alarmTime + 1.0);
      this.alarmGain.gain.linearRampToValueAtTime(0, alarmTime + 1.8);
      this.alarmGain.gain.linearRampToValueAtTime(0.3, alarmTime + 2.0);
      this.alarmGain.gain.linearRampToValueAtTime(0, alarmTime + 2.8);
      
      this.alarmOsc.start(alarmTime);
      this.alarmOsc.stop(alarmTime + 3);
    }
    
    cancelAlarm() {
      if (this.alarmOsc) {
        try {
          this.alarmOsc.stop();
        } catch(e) {}
        this.alarmOsc.disconnect();
        this.alarmOsc = null;
      }
      if (this.alarmGain) {
        this.alarmGain.disconnect();
        this.alarmGain = null;
      }
    }
    
    updateUI(t) {
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      
      if (this.elapsedEl) {
        this.elapsedEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }
      
      if (this.prog) {
        this.prog.style.width = (t / this.TOTAL * 100).toFixed(2) + '%';
      }
      
      const idx = this.getPhaseIdx(t);
      const ph = this.PHASES[idx];
      
      if (idx !== this.prevPhaseIdx) {
        if (this.phaseName) this.phaseName.textContent = ph.name;
        if (this.phaseDesc) this.phaseDesc.textContent = ph.desc;
        if (this.phaseDot) this.phaseDot.style.background = ph.dot;
        this.prevPhaseIdx = idx;
      }
      
      // 주파수 실시간 렌더링
      const beat = this.getBeat(t);
      const lf = ph.baseFreq;
      const rf = lf + beat;
      
      if (this.freqLEl) this.freqLEl.textContent = lf.toFixed(0);
      if (this.freqBeatEl) this.freqBeatEl.textContent = beat.toFixed(1);
      if (this.freqREl) this.freqREl.textContent = rf.toFixed(1);
    }
    
    tick() {
      if (!this.running) return;
      
      // Date.now()와 실제 시작 시간을 비교하여 경과 시간을 계산하므로 백그라운드 멈춤 대응 가능
      this.elapsed = (Date.now() - this.realStartTime) / 1000;
      
      if (this.elapsed >= this.TOTAL) {
        this.elapsed = this.TOTAL;
        this.updateUI(this.elapsed);
        this.running = false;
        
        if (this.phaseName) this.phaseName.textContent = '완료!';
        if (this.phaseDesc) this.phaseDesc.textContent = '40분 낮잠이 끝났습니다. 개운하게 일어나세요 :)';
        if (this.btnPlay) this.btnPlay.textContent = '시작';
        
        // 오디오 정리
        if (this.ctx) {
          // 약간의 알람음 울릴 여유(3.2초)를 주고 컨텍스트 종료
          setTimeout(() => {
            if (!this.running && this.ctx) {
              this.ctx.close();
              this.ctx = null;
            }
          }, 3200);
        }
        return;
      }
      
      this.updateUI(this.elapsed);
      this.animId = requestAnimationFrame(() => this.tick());
    }
    
    togglePlay() {
      if (!this.running) {
        // 재생 시작
        if (!this.ctx) {
          this.initAudio();
        } else if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        
        if (this.elapsed >= this.TOTAL) {
          this.elapsed = 0;
        }
        
        this.realStartTime = Date.now() - this.elapsed * 1000;
        this.running = true;
        this.prevPhaseIdx = -1;
        
        if (this.btnPlay) this.btnPlay.textContent = '일시정지';
        
        // 오디오 파라미터 타임라인 스케줄 설정
        this.scheduleAudioTimeline(this.elapsed, this.ctx.currentTime);
        this.tick();
      } else {
        // 일시 정지
        this.running = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        
        if (this.ctx) {
          this.ctx.suspend();
          // 오디오 파라미터 예약 취소
          if (this.leftOsc) this.leftOsc.frequency.cancelScheduledValues(0);
          if (this.rightOsc) this.rightOsc.frequency.cancelScheduledValues(0);
          this.cancelAlarm();
        }
        
        if (this.btnPlay) this.btnPlay.textContent = '재개';
      }
    }
    
    stop() {
      this.running = false;
      if (this.animId) cancelAnimationFrame(this.animId);
      
      this.elapsed = 0;
      this.prevPhaseIdx = -1;
      
      if (this.elapsedEl) this.elapsedEl.textContent = '00:00';
      if (this.prog) this.prog.style.width = '0%';
      if (this.freqBeatEl) this.freqBeatEl.textContent = '10';
      if (this.freqLEl) this.freqLEl.textContent = '300';
      if (this.freqREl) this.freqREl.textContent = '310';
      if (this.phaseName) this.phaseName.textContent = '대기 중';
      if (this.phaseDesc) this.phaseDesc.textContent = '시작 버튼을 눌러 낮잠을 시작하세요';
      if (this.phaseDot) this.phaseDot.style.background = '#9FE1CB';
      if (this.btnPlay) this.btnPlay.textContent = '시작';
      
      this.cancelAlarm();
      
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
        this.leftOsc = null;
        this.rightOsc = null;
      }
    }
    
    open() {
      this.isOpen = true;
      if (this.modal) {
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }
    
    close() {
      this.isOpen = false;
      if (this.modal) {
        this.modal.classList.add('hidden');
        // 테트리스가 열려있지 않을 때만 스크롤 복원
        const isTetrisOpen = !document.getElementById('tetrisModalOverlay').classList.contains('hidden');
        if (!isTetrisOpen) {
          document.body.style.overflow = '';
        }
      }
    }
  }

  // === 3. 전역 인스턴스 등록 ===
  document.addEventListener('DOMContentLoaded', () => {
    window.featureMenu = new FeatureMenu();
    window.napPlayer = new NapPlayer();
  });
})();
