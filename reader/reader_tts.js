/**
 * 원서 리더 TTS
 *
 * 제공자(provider) 구조로 분리해 두어 나중에 AI TTS(OpenAI 등)로 교체할 수 있다.
 *   ReaderTTS.speak(text, { rate, onstart, onend })
 *   ReaderTTS.stop()
 *   ReaderTTS.isSupported()
 *
 * 브라우저 SpeechSynthesis 주의점
 *  - iOS 는 사용자 탭 이벤트 안에서 speak() 를 호출해야 소리가 난다 → 동기 호출 유지
 *  - 음성 목록이 늦게 로드된다 → voiceschanged 대기
 *  - Chrome 은 긴 발화가 약 15초 뒤 끊기는 버그가 있다 → 구두점 단위로 나눠 순서대로 읽는다
 */
(function () {
  const synth = window.speechSynthesis;
  let voices = [];
  let chosenVoice = null;
  let queueToken = 0;

  const PREFERRED = [
    /Google US English/i, /Samantha/i, /Microsoft (Aria|Jenny|Guy).*Online/i,
    /Microsoft (Zira|David)/i, /en-us/i
  ];

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    const en = voices.filter(v => /^en[-_]/i.test(v.lang) || /^en$/i.test(v.lang));
    chosenVoice = null;
    for (const re of PREFERRED) {
      const hit = en.find(v => re.test(v.name) || re.test(v.lang));
      if (hit) { chosenVoice = hit; break; }
    }
    if (!chosenVoice) chosenVoice = en.find(v => /en[-_]US/i.test(v.lang)) || en[0] || null;
  }

  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
    } else {
      synth.onvoiceschanged = loadVoices;
    }
  }

  // 긴 문장을 구두점 기준으로 180자 이하 조각으로 나눈다
  function chunk(text, max = 180) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean ? [clean] : [];
    const parts = clean.split(/(?<=[,;:—–])\s+/);
    const out = [];
    let buf = '';
    for (const p of parts) {
      if ((buf + ' ' + p).trim().length > max && buf) { out.push(buf.trim()); buf = p; }
      else buf = (buf + ' ' + p).trim();
    }
    if (buf) out.push(buf.trim());
    // 구두점이 없어 여전히 긴 조각은 공백 기준으로 자른다
    return out.flatMap(s => {
      if (s.length <= max) return [s];
      const words = s.split(' '); const res = []; let b = '';
      for (const w of words) { if ((b + ' ' + w).length > max && b) { res.push(b); b = w; } else b = (b + ' ' + w).trim(); }
      if (b) res.push(b);
      return res;
    });
  }

  const browserProvider = {
    name: 'browser',
    isSupported: () => Boolean(synth && window.SpeechSynthesisUtterance),
    speak(text, opts = {}) {
      if (!this.isSupported()) { opts.onerror && opts.onerror(new Error('unsupported')); return; }
      const token = ++queueToken;
      synth.cancel();
      const pieces = chunk(text);
      if (!pieces.length) { opts.onend && opts.onend(); return; }
      if (!chosenVoice) loadVoices();
      let i = 0;
      const next = () => {
        if (token !== queueToken) return;
        if (i >= pieces.length) { opts.onend && opts.onend(); return; }
        const u = new SpeechSynthesisUtterance(pieces[i++]);
        u.lang = chosenVoice ? chosenVoice.lang : 'en-US';
        if (chosenVoice) u.voice = chosenVoice;
        u.rate = opts.rate || 1.0;
        u.pitch = 1.0;
        u.onend = next;
        u.onerror = (e) => {
          if (token !== queueToken) return;
          // 'interrupted' / 'canceled' 는 사용자가 멈춘 경우
          if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
          opts.onerror && opts.onerror(e);
        };
        synth.speak(u); // 첫 조각은 탭 이벤트 안에서 동기 호출됨
      };
      opts.onstart && opts.onstart();
      next();
    },
    stop() {
      queueToken++;
      if (synth) synth.cancel();
    }
  };

  let provider = browserProvider;

  window.ReaderTTS = {
    isSupported: () => provider.isSupported(),
    speak: (text, opts) => provider.speak(text, opts),
    stop: () => provider.stop(),
    voiceName: () => (chosenVoice ? chosenVoice.name : ''),
    // 향후 AI TTS 제공자 교체용: { name, isSupported, speak(text, opts), stop() }
    setProvider(p) { if (p && p.speak && p.stop) { provider.stop(); provider = p; } },
    _chunk: chunk
  };
})();
