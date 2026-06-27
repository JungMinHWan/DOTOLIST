(function() {
  // === 1. PRESETS & CONSTANTS ===
  const PRESETS = {
    powernap:{
      name:'오리지널 낮잠 20분', category:'수면', color:'#5DCAA5',
      desc:'Gnaural 오리지널 20분 설계. 12단계에 걸친 피치 전이와 백색 소음 믹싱으로 깊은 이완과 회복을 제공합니다.',
      phases:[
        {name:'입면 시작', desc:'Alpha 11Hz ➔ 8.8Hz로 빠르게 이완 유도', dur:13.17, noiseVol:0.1, voices:[{pitchStart:164.0, pitchEnd:163.349, freqStart:10.991, freqEnd:8.80596, volume:0.515339*1.5}]},
        {name:'이완 심화', desc:'8.8Hz ➔ 7Hz로 낮잠 준비', dur:16.76, noiseVol:0.1, voices:[{pitchStart:163.349, pitchEnd:162.52, freqStart:8.80596, freqEnd:6.99479, volume:0.520837*1.5}]},
        {name:'수면 진입', desc:'7Hz ➔ 5.2Hz 세타파 입면', dur:28.99, noiseVol:0.1, voices:[{pitchStart:162.52, pitchEnd:161.04, freqStart:6.99479, freqEnd:5.22245, volume:0.527834*1.5}]},
        {name:'얕은 수면', desc:'5.2Hz ➔ 4.4Hz 깊은 휴식 유도', dur:38.06, noiseVol:0.1, voices:[{pitchStart:161.04, pitchEnd:159.204, freqStart:5.22245, freqEnd:4.39666, volume:0.539935*1.5}]},
        {name:'세타 휴식', desc:'4.4Hz ➔ 4.15Hz 뇌파 안정화', dur:50.29, noiseVol:0.1, voices:[{pitchStart:159.204, pitchEnd:156.717, freqStart:4.39666, freqEnd:4.1511, volume:0.555823*1.5}]},
        {name:'수면 유지', desc:'4.15Hz ➔ 4Hz 깊은 세타 수면 돌입', dur:67.92, noiseVol:0.1, voices:[{pitchStart:156.717, pitchEnd:153.359, freqStart:4.1511, freqEnd:4.00, volume:0.576815*1.5}]},
        {name:'낮잠 상태', desc:'4Hz 깊은 세타 수면 유지 (핵심 단계)', dur:877.02, noiseVol:0.1, voices:[{pitchStart:153.359, pitchEnd:110.0, freqStart:4.00, freqEnd:4.00, volume:0.605162*1.5}]},
        {name:'얕은 각성', desc:'기저 주파수 변화로 뇌를 깨우기 시작', dur:36.79, noiseVol:0.1, voices:[{pitchStart:110.0, pitchEnd:129.11, freqStart:4.00, freqEnd:4.15692, volume:0.971179}]},
        {name:'의식 상승', desc:'세타 ➔ 알파파 상승 준비', dur:32.26, noiseVol:0.1, voices:[{pitchStart:129.11, pitchEnd:145.87, freqStart:4.15692, freqEnd:5.05209, volume:0.986534}]},
        {name:'알파 활성', desc:'5Hz ➔ 6.8Hz 가벼운 각성', dur:19.81, noiseVol:0.1, voices:[{pitchStart:145.87, pitchEnd:156.16, freqStart:5.05209, freqEnd:6.83576, volume:1.0}]},
        {name:'기상 유도', desc:'6.8Hz ➔ 9.8Hz 두뇌 회전 준비', dur:15.09, noiseVol:0.1, voices:[{pitchStart:156.16, pitchEnd:164.0, freqStart:6.83576, freqEnd:9.81165, volume:0.73053}]},
        {name:'완전 기상', desc:'마무리 9.81Hz 기상', dur:3.77, noiseVol:0.1, voices:[{pitchStart:164.0, pitchEnd:164.0, freqStart:9.81165, freqEnd:9.81165, volume:0.515339*1.5}]}
      ]
    },
    powernap40:{
      name:'오리지널 낮잠 40분', category:'수면', color:'#3cb38d',
      desc:'Gnaural 오리지널 설계를 40분으로 확장. 12단계에 걸친 피치 전이와 백색 소음 믹싱으로 깊은 이완과 회복을 제공합니다.',
      phases:[
        {name:'입면 시작', desc:'Alpha 11Hz ➔ 8.8Hz로 빠르게 이완 유도', dur:13.17*2, noiseVol:0.1, voices:[{pitchStart:164.0, pitchEnd:163.349, freqStart:10.991, freqEnd:8.80596, volume:0.515339*1.5}]},
        {name:'이완 심화', desc:'8.8Hz ➔ 7Hz로 낮잠 준비', dur:16.76*2, noiseVol:0.1, voices:[{pitchStart:163.349, pitchEnd:162.52, freqStart:8.80596, freqEnd:6.99479, volume:0.520837*1.5}]},
        {name:'수면 진입', desc:'7Hz ➔ 5.2Hz 세타파 입면', dur:28.99*2, noiseVol:0.1, voices:[{pitchStart:162.52, pitchEnd:161.04, freqStart:6.99479, freqEnd:5.22245, volume:0.527834*1.5}]},
        {name:'얕은 수면', desc:'5.2Hz ➔ 4.4Hz 깊은 휴식 유도', dur:38.06*2, noiseVol:0.1, voices:[{pitchStart:161.04, pitchEnd:159.204, freqStart:5.22245, freqEnd:4.39666, volume:0.539935*1.5}]},
        {name:'세타 휴식', desc:'4.4Hz ➔ 4.15Hz 뇌파 안정화', dur:50.29*2, noiseVol:0.1, voices:[{pitchStart:159.204, pitchEnd:156.717, freqStart:4.39666, freqEnd:4.1511, volume:0.555823*1.5}]},
        {name:'수면 유지', desc:'4.15Hz ➔ 4Hz 깊은 세타 수면 돌입', dur:67.92*2, noiseVol:0.1, voices:[{pitchStart:156.717, pitchEnd:153.359, freqStart:4.1511, freqEnd:4.00, volume:0.576815*1.5}]},
        {name:'낮잠 상태', desc:'4Hz 깊은 세타 수면 유지 (핵심 단계)', dur:877.02*2, noiseVol:0.1, voices:[{pitchStart:153.359, pitchEnd:110.0, freqStart:4.00, freqEnd:4.00, volume:0.605162*1.5}]},
        {name:'얕은 각성', desc:'기저 주파수 변화로 뇌를 깨우기 시작', dur:36.79*2, noiseVol:0.1, voices:[{pitchStart:110.0, pitchEnd:129.11, freqStart:4.00, freqEnd:4.15692, volume:0.971179}]},
        {name:'의식 상승', desc:'세타 ➔ 알파파 상승 준비', dur:32.26*2, noiseVol:0.1, voices:[{pitchStart:129.11, pitchEnd:145.87, freqStart:4.15692, freqEnd:5.05209, volume:0.986534}]},
        {name:'알파 활성', desc:'5Hz ➔ 6.8Hz 가벼운 각성', dur:19.81*2, noiseVol:0.1, voices:[{pitchStart:145.87, pitchEnd:156.16, freqStart:5.05209, freqEnd:6.83576, volume:1.0}]},
        {name:'기상 유도', desc:'6.8Hz ➔ 9.8Hz 두뇌 회전 준비', dur:15.09*2, noiseVol:0.1, voices:[{pitchStart:156.16, pitchEnd:164.0, freqStart:6.83576, freqEnd:9.81165, volume:0.73053}]},
        {name:'완전 기상', desc:'마무리 9.81Hz 기상', dur:3.77*2, noiseVol:0.1, voices:[{pitchStart:164.0, pitchEnd:164.0, freqStart:9.81165, freqEnd:9.81165, volume:0.515339*1.5}]}
      ]
    },
    sleep:{
      name:'깊은 수면', category:'수면', color:'#4169E1',
      desc:'Beta에서 Delta까지 천천히 내려가는 60분 세션. 밤잠 입면을 도와줍니다. 잠들기 전 재생하고 알람 없이 사용하세요.',
      phases:[
        {name:'이완 시작',desc:'Alpha — 몸과 마음을 이완합니다',color:'#6495ED',dur:10*60,noiseVol:0.15,voices:[{pitchStart:280,pitchEnd:280,freqStart:12,freqEnd:8,volume:0.6}]},
        {name:'졸음 유도',desc:'Theta — 수면 직전 상태로 진입합니다',color:'#4169E1',dur:20*60,noiseVol:0.2,voices:[{pitchStart:280,pitchEnd:280,freqStart:8,freqEnd:4,volume:0.65}]},
        {name:'깊은 수면',desc:'Delta — 깊은 수면 상태를 유지합니다',color:'#1C3A8A',dur:30*60,noiseVol:0.25,voices:[{pitchStart:280,pitchEnd:280,freqStart:4,freqEnd:1.5,volume:0.6}]}
      ]
    },
    focus:{
      name:'집중력 (오리지널)', category:'집중', color:'#FFD700',
      desc:'432Hz 웰니스 피치 스케일 바탕음과 백색 소음 믹싱으로 업무/학습 집중도를 높입니다.',
      phases:[
        {name:'워밍업',desc:'Alpha➔Beta — 두뇌를 서서히 깨웁니다',color:'#FFE55C',dur:5*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:10,freqEnd:15,volume:0.6}]},
        {name:'집중 유지',desc:'Beta 15Hz — 안정적인 집중 상태',color:'#FFD700',dur:20*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:15,freqEnd:15,volume:0.65}]},
        {name:'마무리',desc:'Beta➔Alpha — 부드럽게 마무리합니다',color:'#C8A800',dur:5*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:15,freqEnd:10,volume:0.6}]}
      ]
    },
    meditation_unity:{
      name:'명상 (Unity 3중음)', category:'명상 / 이완', color:'#20B2AA',
      desc:'3개의 바이노럴 비트 보이스(3.7Hz, 2.5Hz, 5.9Hz)가 동시에 작용하여 깊은 입체적 이완 상태를 제공합니다.',
      phases:[
        {
          name:'깊은 이완',
          desc:'Delta 및 Theta 3중 주파수 동조 상태',
          color:'#20B2AA',
          dur:60*60,
          noiseVol:0.4,
          voices:[
            {pitchStart:432.0, pitchEnd:432.0, freqStart:3.7, freqEnd:3.7, volume:0.6},
            {pitchStart:513.7, pitchEnd:513.7, freqStart:2.5, freqEnd:2.5, volume:0.6},
            {pitchStart:647.3, pitchEnd:647.3, freqStart:5.9, freqEnd:5.9, volume:0.6}
          ]
        }
      ]
    },
    healing_morphine:{
      name:'치유 (Morphine 5중음)', category:'명상 / 이완', color:'#DDA0DD',
      desc:'5개의 보이스가 동시에 작용하여 몸과 마음에 부드러운 하모니를 공급하고 긴장을 해소합니다.',
      phases:[
        {
          name:'통증 완화 및 치유',
          desc:'15Hz에서 0.5Hz까지 다양한 진동 자극 동시 적용',
          color:'#DDA0DD',
          dur:60*60,
          noiseVol:0.4,
          voices:[
            {pitchStart:432.0, pitchEnd:432.0, freqStart:15, freqEnd:0.5, volume:0.5},
            {pitchStart:513.7, pitchEnd:513.7, freqStart:10, freqEnd:10, volume:0.5},
            {pitchStart:647.3, pitchEnd:647.3, freqStart:9,  freqEnd:9,  volume:0.5},
            {pitchStart:769.7, pitchEnd:769.7, freqStart:7.5,freqEnd:7.5,volume:0.5},
            {pitchStart:864.0, pitchEnd:864.0, freqStart:38, freqEnd:38, volume:0.5}
          ]
        }
      ]
    },
    schumann:{
      name:'슈만 공명 7.83Hz', category:'명상 / 이완', color:'#32CD32',
      desc:'지구의 고유 전자기 공명 주파수(7.83Hz) 동조. 432Hz 웰니스 피치와 백색 소음 믹싱.',
      phases:[
        {name:'동조',desc:'Alpha → 슈만 — 7.83Hz에 맞춰갑니다',color:'#90EE90',dur:5*60,noiseVol:0.35,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:12,freqEnd:7.83,volume:0.6}]},
        {name:'공명 유지',desc:'Schumann 7.83Hz — 지구 주파수와 동조',color:'#32CD32',dur:12*60,noiseVol:0.4,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:7.83,freqEnd:7.83,volume:0.65}]},
        {name:'안정화',desc:'7.83Hz 유지 — 충분히 흡수합니다',color:'#228B22',dur:3*60,noiseVol:0.35,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:7.83,freqEnd:7.83,volume:0.6}]}
      ]
    },
    hypnosis:{
      name:'자기 최면 (Self Hypnosis)', category:'명상 / 이완', color:'#9370DB',
      desc:'이완 ➔ 최면 유도 ➔ 각성의 3단계 자기 최면 세션. 백색 소음 믹싱.',
      phases:[
        {name:'긴장 완화',desc:'Alpha ➔ Theta로 긴장을 풉니다',color:'#C39BD3',dur:5*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:12,freqEnd:4,volume:0.6}]},
        {name:'최면 상태',desc:'Theta 4Hz 고정 — 잠재의식 활성화',color:'#9370DB',dur:10*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:4,freqEnd:4,volume:0.65}]},
        {name:'각성',desc:'Theta ➔ Alpha — 정신을 맑게 깨웁니다',color:'#6A0DAD',dur:5*60,noiseVol:0.3,voices:[{pitchStart:432.0,pitchEnd:432.0,freqStart:4,freqEnd:12,volume:0.6}]}
      ]
    }
  };

  function getBwName(hz) {
    if (hz < 4) return 'Delta';
    if (hz < 8) return 'Theta';
    if (hz < 14) return 'Alpha';
    if (hz < 30) return 'Beta';
    return 'Gamma';
  }

  // === 2. Feature Selection Menu ===
  class FeatureMenu {
    constructor() {
      this.modal = document.getElementById('featureSelectionModal');
      this.closeBtn = document.getElementById('featureSelectionClose');
      this.btnTetris = document.getElementById('btnSelectTetris');
      this.btnNap = document.getElementById('btnSelectNap');
      this.btnMath = document.getElementById('btnSelectMath');
      this.btnVocab = document.getElementById('btnSelectVocab');
      
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

      if (this.btnMath) {
        this.btnMath.onclick = () => {
          this.close();
          if (window.mathGame && typeof window.mathGame.open === 'function') {
            window.mathGame.open();
          }
        };
      }

      if (this.btnVocab) {
        this.btnVocab.onclick = () => {
          this.close();
          if (window.vocabGame && typeof window.vocabGame.open === 'function') {
            window.vocabGame.open();
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
        const isAnyModalOpen = document.querySelectorAll('.tetris-modal-overlay:not(.hidden), .nap-modal-overlay:not(.hidden), .math-modal-overlay:not(.hidden)').length > 0;
        if (!isAnyModalOpen) {
          document.body.style.overflow = '';
        }
      }
    }
  }

  // === 3. Binaural Beats Player ===
  class NapPlayer {
    constructor() {
      // Modals and Close
      this.modal = document.getElementById('napModalOverlay');
      this.closeBtn = document.getElementById('napModalClose');
      
      // Preset Selection & Info Elements
      this.presetSelect = document.getElementById('napPresetSelect');
      this.npCategory = document.getElementById('napNpCategory');
      this.npName = document.getElementById('napNpName');
      this.npDesc = document.getElementById('napNpDesc');
      
      // Phase Visualization Elements
      this.phaseBar = document.getElementById('napPhaseBar');
      this.phaseLabels = document.getElementById('napPhaseLabels');
      this.timeTickEnd = document.getElementById('napTimeTickEnd');
      
      // Player Control Elements
      this.btnPlay = document.getElementById('btnNapPlay');
      this.btnStop = document.getElementById('btnNapStop');
      
      this.volRange = document.getElementById('napVol');
      this.volOut = document.getElementById('napVolOut');
      this.volNoiseRange = document.getElementById('napVolNoise');
      this.volNoiseOut = document.getElementById('napVolNoiseOut');
      
      this.alarmToggle = document.getElementById('napAlarmToggle');
      this.alarmLabel = document.getElementById('napAlarmLabel');
      
      // Progress / Status Elements
      this.prog = document.getElementById('napProg');
      this.elapsedEl = document.getElementById('napElapsed');
      this.timerTotal = document.getElementById('napTimerTotal');
      this.phaseDot = document.getElementById('napPhaseDot');
      this.phaseName = document.getElementById('napPhaseName');
      this.phaseDesc = document.getElementById('napPhaseDesc');
      
      // Frequency Info Elements
      this.freqLEl = document.getElementById('napFreqL');
      this.freqBeatEl = document.getElementById('napFreqBeat');
      this.freqREl = document.getElementById('napFreqR');
      
      // Audio Objects
      this.ctx = null;
      this.merger = null;
      this.gainNode = null;
      this.noiseNode = null;
      this.noiseGainNode = null;
      this.activeVoices = [];
      
      // Player States
      this.currentPreset = PRESETS.powernap;
      this.TOTAL = this.currentPreset.phases.reduce((s, p) => s + p.dur, 0);
      this.running = false;
      this.elapsed = 0;
      this.realStartTime = 0;
      this.animId = null;
      this.prevPhaseIdx = -1;
      this.alarmOn = true;
      this.isOpen = false;
      this.noiseMasterVolScale = 0.5;
      
      this.initEvents();
    }
    
    initEvents() {
      if (this.closeBtn) this.closeBtn.onclick = () => this.close();
      
      if (this.modal) {
        this.modal.onclick = (e) => {
          if (e.target === this.modal) this.close();
        };
      }
      
      if (this.presetSelect) {
        this.presetSelect.onchange = (e) => {
          this.selectPreset(e.target.value);
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
            this.gainNode.gain.value = (parseFloat(val) / 100) * 0.3;
          }
        };
      }
      
      if (this.volNoiseRange) {
        this.volNoiseRange.oninput = () => {
          const val = this.volNoiseRange.value;
          if (this.volNoiseOut) this.volNoiseOut.textContent = val;
          this.noiseMasterVolScale = parseFloat(val) / 100;
          if (this.running && this.noiseGainNode && this.ctx) {
            const { ph } = this.getPhaseAt(this.elapsed);
            const targetNoiseVol = (ph.noiseVol !== undefined ? ph.noiseVol : 0) * 0.2 * this.noiseMasterVolScale;
            this.noiseGainNode.gain.setTargetAtTime(targetNoiseVol, this.ctx.currentTime, 0.1);
          }
        };
      }
      
      if (this.alarmToggle) {
        this.alarmToggle.onclick = () => {
          this.alarmOn = !this.alarmOn;
          this.alarmToggle.classList.toggle('on', this.alarmOn);
          if (this.alarmLabel) this.alarmLabel.textContent = this.alarmOn ? '켜짐' : '꺼짐';
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
      
      this.createWhiteNoise();
    }
    
    createWhiteNoise() {
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;
      
      this.noiseGainNode = this.ctx.createGain();
      this.noiseGainNode.gain.value = 0;
      
      this.noiseNode.connect(this.noiseGainNode);
      this.noiseGainNode.connect(this.merger, 0, 0);
      this.noiseGainNode.connect(this.merger, 0, 1);
      
      this.noiseNode.start();
    }
    
    startVoices(voicesData) {
      this.stopVoices();
      if (!this.ctx) this.initAudio();
      else if (this.ctx.state === 'suspended') this.ctx.resume();
      
      this.activeVoices = voicesData.map(v => {
        const leftOsc = this.ctx.createOscillator();
        const rightOsc = this.ctx.createOscillator();
        leftOsc.type = 'sine';
        rightOsc.type = 'sine';
        
        const lg = this.ctx.createGain();
        const rg = this.ctx.createGain();
        
        const targetVol = v.volume || 0.6;
        
        // 팝핑 노이즈 방지: 볼륨을 0에서 시작하여 서서히 페이드 인(Fade-in)
        lg.gain.setValueAtTime(0, this.ctx.currentTime);
        rg.gain.setValueAtTime(0, this.ctx.currentTime);
        
        leftOsc.connect(lg);
        rightOsc.connect(rg);
        
        lg.connect(this.merger, 0, 0);
        rg.connect(this.merger, 0, 1);
        
        // 새 오실레이터 생성 시 기본 주파수인 440Hz에서 시작하여 음이 미끄러지는 '위우웅' 소리가 나지 않도록, 
        // 즉시 해당 단계의 시작 주파수로 설정해 줍니다.
        leftOsc.frequency.setValueAtTime(v.pitchStart, this.ctx.currentTime);
        rightOsc.frequency.setValueAtTime(v.pitchStart + v.freqStart, this.ctx.currentTime);

        const fadeTime = 0.15;
        leftOsc.start();
        rightOsc.start();
        
        // linearRamp 대신 setTargetAtTime을 사용하여 팝핑 노이즈를 완벽하게 방지하며 페이드 인
        lg.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.03);
        rg.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.03);
        
        return {
          leftOsc,
          rightOsc,
          lg,
          rg,
          pitchStart: v.pitchStart,
          pitchEnd: v.pitchEnd,
          freqStart: v.freqStart,
          freqEnd: v.freqEnd
        };
      });
    }
    
    stopVoices() {
      if (this.activeVoices && this.activeVoices.length > 0) {
        const fadeTime = 0.15;
        const stopTime = this.ctx ? this.ctx.currentTime + fadeTime : 0;
        const voicesToStop = [...this.activeVoices];
        
        voicesToStop.forEach(v => {
          try {
            if (this.ctx) {
              // linearRamp 대신 setTargetAtTime을 사용하여 이전 보이스를 서서히 페이드 아웃(Fade-out)
              v.lg.gain.setValueAtTime(v.lg.gain.value, this.ctx.currentTime);
              v.lg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
              v.rg.gain.setValueAtTime(v.rg.gain.value, this.ctx.currentTime);
              v.rg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
              
              v.leftOsc.stop(stopTime);
              v.rightOsc.stop(stopTime);

              // 0.2초 후(페이드아웃 및 정지 완료 후) 오디오 노드를 완전히 연결 해제하여 가비지 컬렉션 전 글리치 방지
              setTimeout(() => {
                try {
                  v.leftOsc.disconnect();
                  v.rightOsc.disconnect();
                  v.lg.disconnect();
                  v.rg.disconnect();
                } catch(e){}
              }, 200);
            } else {
              v.leftOsc.stop();
              v.rightOsc.stop();
            }
          } catch(e){}
        });
        this.activeVoices = [];
      }
    }
    
    getPhaseAt(t) {
      let acc = 0;
      const phases = this.currentPreset.phases;
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        if (t < acc + ph.dur) return { ph, idx: i, local: t - acc };
        acc += ph.dur;
      }
      const last = phases[phases.length - 1];
      return { ph: last, idx: phases.length - 1, local: last.dur };
    }
    
    buildPhaseBar() {
      const p = this.currentPreset;
      const total = p.phases.reduce((s, ph) => s + ph.dur, 0);
      if (this.phaseBar) this.phaseBar.innerHTML = '';
      if (this.phaseLabels) this.phaseLabels.innerHTML = '';
      
      p.phases.forEach((ph, i) => {
        const pct = (ph.dur / total * 100).toFixed(2) + '%';
        const seg = document.createElement('div');
        seg.className = 'phase-seg';
        seg.id = 'nap-seg-' + i;
        seg.style.cssText = `flex: 0 0 calc(${pct} - 2px); background: ${ph.color || p.color}; opacity: ${i === 0 ? 1 : 0.35}; height: 6px; border-radius: 3px; transition: opacity .3s;`;
        if (this.phaseBar) this.phaseBar.appendChild(seg);
        
        const lbl = document.createElement('div');
        lbl.className = 'phase-seg-label';
        lbl.style.cssText = `flex: 0 0 ${pct}; font-size: 9px; color: #94a3b8; text-align: center; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`;
        lbl.textContent = p.phases.length > 5 ? (i + 1) : ph.name;
        if (this.phaseLabels) this.phaseLabels.appendChild(lbl);
      });
    }
    
    updateStaticUI() {
      const p = this.currentPreset;
      const total = p.phases.reduce((s, ph) => s + ph.dur, 0);
      const totalMin = Math.floor(total / 60);
      const totalSec = String(Math.floor(total % 60)).padStart(2, '0');
      
      if (this.npCategory) this.npCategory.textContent = p.category;
      if (this.npName) this.npName.textContent = p.name;
      if (this.npDesc) this.npDesc.textContent = p.desc;
      if (this.timerTotal) this.timerTotal.textContent = `/ ${totalMin}:${totalSec}`;
      if (this.timeTickEnd) this.timeTickEnd.textContent = `${totalMin}분`;
      if (this.elapsedEl) this.elapsedEl.textContent = '00:00';
      if (this.prog) this.prog.style.width = '0%';
      
      if (this.phaseName) this.phaseName.textContent = '대기 중';
      if (this.phaseDesc) this.phaseDesc.textContent = '시작 버튼을 눌러 낮잠을 시작하세요';
      if (this.phaseDot) this.phaseDot.style.background = p.color;
      
      const ph0 = p.phases[0];
      const v0 = ph0.voices[0];
      if (this.freqBeatEl) this.freqBeatEl.textContent = v0.freqStart.toFixed(1);
      if (this.freqLEl) this.freqLEl.textContent = v0.pitchStart.toFixed(0);
      if (this.freqREl) this.freqREl.textContent = (v0.pitchStart + v0.freqStart).toFixed(1);
      
      this.buildPhaseBar();
    }
    
    selectPreset(key) {
      this.stop();
      this.currentPreset = PRESETS[key] || PRESETS.powernap;
      this.TOTAL = this.currentPreset.phases.reduce((s, ph) => s + ph.dur, 0);
      this.updateStaticUI();
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
    }
    
    tick() {
      if (!this.running) return;
      
      this.elapsed = (Date.now() - this.realStartTime) / 1000;
      const total = this.TOTAL;
      
      if (this.elapsed >= total) {
        this.elapsed = total;
        this.updateUI(this.elapsed);
        this.stop();
        if (this.alarmOn) this.playAlarm();
        
        if (this.phaseName) this.phaseName.textContent = '완료!';
        if (this.phaseDesc) this.phaseDesc.textContent = `${this.currentPreset.name} 세션이 끝났습니다`;
        return;
      }
      
      this.updateUI(this.elapsed);
      
      const { ph, idx, local } = this.getPhaseAt(this.elapsed);
      
      if (idx !== this.prevPhaseIdx) {
        if (this.phaseName) this.phaseName.textContent = ph.name;
        if (this.phaseDesc) this.phaseDesc.textContent = ph.desc;
        if (this.phaseDot) this.phaseDot.style.background = ph.color || this.currentPreset.color;
        
        const segments = this.phaseBar ? this.phaseBar.querySelectorAll('.phase-seg') : [];
        segments.forEach((s, i) => {
          s.style.opacity = (i === idx) ? '1' : '0.35';
        });
        
        this.startVoices(ph.voices);
        this.prevPhaseIdx = idx;
      }
      
      const targetNoiseVol = (ph.noiseVol !== undefined ? ph.noiseVol : 0) * 0.2 * this.noiseMasterVolScale;
      if (this.noiseGainNode && this.ctx) {
        this.noiseGainNode.gain.setTargetAtTime(targetNoiseVol, this.ctx.currentTime, 0.2);
      }
      
      if (this.activeVoices && this.activeVoices.length > 0 && this.ctx) {
        this.activeVoices.forEach((v, vIdx) => {
          const vData = ph.voices[vIdx];
          if (!vData) return;
          
          const localProg = local / ph.dur;
          const beat = vData.freqStart + (vData.freqEnd - vData.freqStart) * localProg;
          const lf = vData.pitchStart + (vData.pitchEnd - vData.pitchStart) * localProg;
          const rf = lf + beat;
          
          // 매 16.6ms(프레임)마다 계산된 정밀한 주파수를 직접 대입합니다.
          // setTargetAtTime을 매 프레임마다 계속 호출하면 오디오 스레드 내 파라미터 갱신이 충돌하여 팝핑/지직 소리가 납니다.
          v.leftOsc.frequency.setValueAtTime(lf, this.ctx.currentTime);
          v.rightOsc.frequency.setValueAtTime(rf, this.ctx.currentTime);
          
          if (vIdx === 0) {
            if (this.freqLEl) this.freqLEl.textContent = lf.toFixed(0);
            if (this.freqBeatEl) this.freqBeatEl.textContent = beat.toFixed(1);
            if (this.freqREl) this.freqREl.textContent = rf.toFixed(1);
          }
        });
      }
      
      this.animId = requestAnimationFrame(() => this.tick());
    }
    
    togglePlay() {
      if (!this.running) {
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
        
        const { ph } = this.getPhaseAt(this.elapsed);
        this.startVoices(ph.voices);
        
        this.tick();
      } else {
        this.running = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        
        if (this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend();
        }
        
        if (this.btnPlay) this.btnPlay.textContent = '재개';
      }
    }
    
    stop() {
      this.running = false;
      if (this.animId) cancelAnimationFrame(this.animId);
      
      this.elapsed = 0;
      this.prevPhaseIdx = -1;
      
      if (this.btnPlay) this.btnPlay.textContent = '시작';
      
      this.stopVoices();
      if (this.noiseNode) {
        try { this.noiseNode.stop(); } catch(e){}
        this.noiseNode = null;
      }
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
      }
      
      this.updateStaticUI();
    }
    
    playAlarm() {
      if (!this.ctx) return;
      const a = this.ctx.createOscillator(), g = this.ctx.createGain();
      a.connect(g); g.connect(this.ctx.destination);
      a.frequency.value = 880; a.type = 'sine';
      const now = this.ctx.currentTime;
      [[0, .2, .3], [.8, 1, .3], [1.8, 2, .3]].forEach(([s, p, v]) => {
        g.gain.setValueAtTime(0, now + s);
        g.gain.linearRampToValueAtTime(v, now + p);
        g.gain.linearRampToValueAtTime(0, now + s + .8);
      });
      a.start(); a.stop(now + 3);
    }
    
    open() {
      this.isOpen = true;
      if (this.modal) {
        this.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
      this.updateStaticUI();
    }
    
    close() {
      this.isOpen = false;
      if (this.modal) {
        this.modal.classList.add('hidden');
        const isTetrisOpen = !document.getElementById('tetrisModalOverlay').classList.contains('hidden');
        if (!isTetrisOpen) {
          document.body.style.overflow = '';
        }
      }
      this.stop();
    }
  }

  // === 4. Instance Registration ===
  document.addEventListener('DOMContentLoaded', () => {
    window.featureMenu = new FeatureMenu();
    window.napPlayer = new NapPlayer();
  });
})();
