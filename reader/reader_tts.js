/**
 * 원서 리더 TTS
 *
 * 제공자(provider) 구조로 분리해 두어 나중에 AI TTS(OpenAI 등)로 교체할 수 있다.
 *   ReaderTTS.speak(text, { rate, onstart, onend, onerror })
 *   ReaderTTS.stop()
 *   ReaderTTS.setGender('female' | 'male') / getGender() / hasGender(g)
 *
 * 브라우저 SpeechSynthesis 주의점
 *  - 음성(voice)에는 성별 정보가 없다 → 알려진 음성 이름으로 여성/남성을 분류한다
 *  - 원하는 성별의 영어 음성이 기기에 없으면 기본 음성을 낮은/높은 톤으로 대신 읽는다
 *  - iOS 는 사용자 탭 이벤트 안에서 speak() 를 호출해야 소리가 난다 → 동기 호출 유지
 *  - Chrome 은 긴 발화가 약 15초 뒤 끊기는 버그가 있다 → 구두점 단위로 나눠 순서대로 읽는다
 */
(function () {
  const synth = window.speechSynthesis;
  let voices = [];
  let koVoices = [];
  let gender = 'female';
  try { gender = localStorage.getItem('rdr-voice') === 'male' ? 'male' : 'female'; } catch (e) { /* noop */ }
  let queueToken = 0;

  // 알려진 음성 이름 (Chrome, Edge, Safari/iOS, macOS, Windows)
  const MALE_NAMES = /\b(male|man)\b|Alex\b|Daniel|Fred\b|Aaron|Arthur|Gordon|Rishi|Oliver|Tom\b|Guy\b|Davis|Christopher|Eric\b|Roger|Steffan|David\b|Mark\b|Ryan\b|Thomas|George|Andrew|Brian|Liam|William|Lee\b|Evan|Nathan|Reed|Rocko|Eddy|Ralph|Albert|Junior|Bruce|Grandpa|Jacques|Kenneth|Brandon|Jason|Tony|Connor|Mitchell|Prabhat|Wayne|Neil|Luke/i;
  const FEMALE_NAMES = /female|woman|Samantha|Karen|Moira|Tessa|Nicky|Martha|Catherine|Serena|Fiona|Kate\b|Susan|Zira|Aria\b|Jenny|\bAna\b|Michelle|Sonia|Libby|Hazel|Emma\b|Ava\b|Allison|Victoria|Veena|Sandy|Shelley|Grandma|Flo\b|Joanna|Kendra|Kimberly|Salli|Ivy\b|Natasha|Clara|Emily|Heera|Neerja|Jessa|Sara\b|Amber|Ashley|Cora|Elizabeth|Monica|Nancy|Isla|Maisie|Google US English|Google UK English Female/i;
  // Android Google TTS 음성 코드 (voiceURI/name 에 포함되는 경우)
  const ANDROID_MALE = /-x-(iol|iom|tpd|gbb|gbd|rjs|aub|aud|end)-/i;
  const ANDROID_FEMALE = /-x-(iob|iog|sfg|tpc|tpf|gba|gbc|gbg|aua|auc|ahp|cxx|ene)-/i;

  function genderOf(v) {
    const key = `${v.name} ${v.voiceURI || ''}`;
    if (ANDROID_MALE.test(key)) return 'male';
    if (ANDROID_FEMALE.test(key)) return 'female';
    if (/female/i.test(key)) return 'female';
    if (MALE_NAMES.test(v.name)) return 'male';
    if (FEMALE_NAMES.test(v.name)) return 'female';
    return 'unknown';
  }

  function isEnglish(v) { return /^en([-_]|$)/i.test(v.lang || ''); }

  function quality(v) {
    let s = 0;
    if (/en[-_]US/i.test(v.lang)) s += 4;
    else if (/en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 2;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 3;
    if (/^Google/i.test(v.name)) s += 2;
    if (v.localService === false) s += 1;
    return s;
  }

  function loadVoices() {
    if (!synth) return;
    const all = synth.getVoices() || [];
    voices = all.filter(isEnglish);
    koVoices = all.filter((v) => /^ko([-_]|$)/i.test(v.lang || ''));
  }

  function best(list) {
    return list.slice().sort((a, b) => quality(b) - quality(a))[0] || null;
  }

  /** 선택한 성별에 맞는 음성. 없으면 { voice: 기본음성, approx: true } */
  function pick(g) {
    if (!voices.length) loadVoices();
    const match = voices.filter((v) => genderOf(v) === g);
    if (match.length) return { voice: best(match), approx: false };
    const other = g === 'male' ? 'female' : 'male';
    const fallback = best(voices.filter((v) => genderOf(v) !== other)) || best(voices);
    return { voice: fallback, approx: true };
  }

  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
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
    return out.flatMap((s) => {
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
      if (!voices.length && !koVoices.length) loadVoices();
      let voice;
      let pitch = 1.0;
      if (opts.lang === 'ko') {
        // 한글(해석·단어 뜻)은 한국어 음성으로
        voice = koVoices.slice().sort((a, b) => (b.localService === false) - (a.localService === false))[0] || null;
      } else {
        const picked = pick(gender);
        voice = picked.voice;
        // 원하는 성별 음성이 없을 때: 톤을 조절해 가깝게 들리도록
        pitch = picked.approx ? (gender === 'male' ? 0.7 : 1.15) : 1.0;
      }
      const fallbackLang = opts.lang === 'ko' ? 'ko-KR' : 'en-US';
      let i = 0;
      const next = () => {
        if (token !== queueToken) return;
        if (i >= pieces.length) { opts.onend && opts.onend(); return; }
        const u = new SpeechSynthesisUtterance(pieces[i++]);
        u.lang = voice ? voice.lang : fallbackLang;
        if (voice) u.voice = voice;
        u.rate = opts.rate || 1.0;
        u.pitch = pitch;
        u.onend = next;
        u.onerror = (e) => {
          if (token !== queueToken) return;
          if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
          opts.onerror && opts.onerror(e);
        };
        synth.speak(u);
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
    getGender: () => gender,
    setGender(g) {
      gender = g === 'male' ? 'male' : 'female';
      try { localStorage.setItem('rdr-voice', gender); } catch (e) { /* noop */ }
    },
    /** 이 기기에 해당 성별의 영어 음성이 실제로 있는지 */
    hasGender: (g) => !pick(g).approx,
    hasKorean: () => { if (!koVoices.length) loadVoices(); return koVoices.length > 0; },
    voiceName: () => { const p = pick(gender); return p.voice ? p.voice.name : ''; },
    // 향후 AI TTS 제공자 교체용: { name, isSupported, speak(text, opts), stop() }
    setProvider(p) { if (p && p.speak && p.stop) { provider.stop(); provider = p; } },
    _chunk: chunk,
    _genderOf: genderOf
  };
})();
