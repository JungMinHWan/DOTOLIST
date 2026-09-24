/**
 * 원서 리더 텍스트 유틸
 *  - 선택 범위를 문장 단위로 확장
 *  - 문장 분리 (Intl.Segmenter + 약어 보정)
 *  - 학습모드 단어 토큰화 / 따라쓰기 비교
 */
(function () {
  const BLOCK_SELECTOR = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,th,figcaption,pre';
  const ABBR_END = /(?:^|[\s(“"])(?:Mr|Mrs|Ms|Mx|Dr|St|Jr|Sr|Prof|Mt|Ft|vs|Capt|Col|Gen|Lt|Sgt|Rev|Hon|Vol|Ch|pp|e\.g|i\.e)\.\s*$/i;
  const INITIAL_END = /(?:^|\s)[A-Z]\.\s*$/;

  let segmenter = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    }
  } catch (e) { segmenter = null; }

  /** 텍스트를 [start, end) 문장 구간 배열로 나눈다 */
  function sentenceSpans(text) {
    const raw = [];
    if (segmenter) {
      for (const s of segmenter.segment(text)) raw.push([s.index, s.index + s.segment.length]);
    } else {
      const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!m[0]) { re.lastIndex++; continue; }
        raw.push([m.index, m.index + m[0].length]);
      }
      if (!raw.length && text) raw.push([0, text.length]);
    }
    // 약어/이니셜 뒤에서 잘린 문장은 다음 문장과 합친다 (Mr. Hale, J. Smith)
    const merged = [];
    for (const span of raw) {
      const prev = merged[merged.length - 1];
      if (prev) {
        const prevText = text.slice(prev[0], prev[1]);
        const nextText = text.slice(span[0], span[1]).trimStart();
        // "Is it you?" she asked. 처럼 소문자로 이어지는 문장도 합친다
        if (ABBR_END.test(prevText) || INITIAL_END.test(prevText) || /^[a-z]/.test(nextText)) { prev[1] = span[1]; continue; }
      }
      merged.push([span[0], span[1]]);
    }
    return merged.map(([s, e]) => trimSpan(text, s, e)).filter(([s, e]) => e > s);
  }

  function trimSpan(text, s, e) {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return [s, e];
  }

  function countSentences(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 0;
    return sentenceSpans(clean).filter(([s, e]) => /[A-Za-z]{2,}/.test(clean.slice(s, e))).length;
  }

  function blockOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    return el.closest(BLOCK_SELECTOR) || el.closest('div,section,article,body') || el.ownerDocument.body;
  }

  /** block 시작부터 (node, offset) 까지의 글자 수 */
  function offsetIn(block, node, offset) {
    const r = block.ownerDocument.createRange();
    r.setStart(block, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  }

  /** block 안의 글자 위치 pos 를 DOM 위치로 변환 */
  function domPoint(block, pos, preferEnd) {
    const doc = block.ownerDocument;
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    let acc = 0;
    let last = null;
    let node;
    while ((node = walker.nextNode())) {
      const len = node.data.length;
      if (preferEnd ? pos <= acc + len : pos < acc + len) {
        return { node, offset: Math.max(0, pos - acc) };
      }
      acc += len;
      last = node;
    }
    if (last) return { node: last, offset: last.data.length };
    return { node: block, offset: 0 };
  }

  /**
   * 사용자가 선택한 Range 를 문장 경계까지 확장한 새 Range 를 돌려준다.
   * 서로 다른 문단에 걸친 선택은 시작 문장의 처음 ~ 끝 문장의 끝으로 확장한다.
   */
  function expandToSentence(range) {
    if (!range) return null;
    const startBlock = blockOf(range.startContainer);
    const endBlock = blockOf(range.endContainer);
    if (!startBlock || !endBlock) return null;

    const sText = startBlock.textContent;
    const sPos = offsetIn(startBlock, range.startContainer, range.startOffset);
    const sSpans = sentenceSpans(sText);
    let startSpan = sSpans.find(([s, e]) => sPos >= s && sPos < e) ||
      sSpans.find(([s]) => s >= sPos) || sSpans[sSpans.length - 1];

    const eText = endBlock === startBlock ? sText : endBlock.textContent;
    const ePos = offsetIn(endBlock, range.endContainer, range.endOffset);
    const eSpans = endBlock === startBlock ? sSpans : sentenceSpans(eText);
    let endSpan = eSpans.slice().reverse().find(([s, e]) => ePos > s && ePos <= e) ||
      eSpans.slice().reverse().find(([, e]) => e <= ePos) || eSpans[0];

    if (!startSpan || !endSpan) return null;

    const a = domPoint(startBlock, startSpan[0], false);
    const b = domPoint(endBlock, endSpan[1], true);
    const out = startBlock.ownerDocument.createRange();
    out.setStart(a.node, a.offset);
    out.setEnd(b.node, b.offset);
    if (out.collapsed) return null;
    return out;
  }

  const WORD_CHAR = /[A-Za-z\u00C0-\u024F'\u2019\-]/;

  /**
   * 선택 범위를 단어 경계까지 넓힌다 (hesi|tated → hesitated).
   * 한 문단 안의 선택만 다루며, 여러 문단에 걸치면 null.
   */
  function expandToWords(range) {
    if (!range) return null;
    const block = blockOf(range.startContainer);
    if (!block || block !== blockOf(range.endContainer)) return null;
    const text = block.textContent;
    let s = offsetIn(block, range.startContainer, range.startOffset);
    let e = offsetIn(block, range.endContainer, range.endOffset);
    // 앞뒤 공백/문장부호는 걷어낸다
    while (s < e && !/[A-Za-z\u00C0-\u024F]/.test(text[s])) s++;
    while (e > s && !/[A-Za-z\u00C0-\u024F]/.test(text[e - 1])) e--;
    if (e <= s) return null;
    while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
    while (e < text.length && WORD_CHAR.test(text[e])) e++;
    // 단어 끝의 아포스트로피/하이픈 정리 (dogs' → dogs)
    while (e > s && /['\u2019\-]/.test(text[e - 1])) e--;
    while (s < e && /['\u2019\-]/.test(text[s])) s++;
    const a = domPoint(block, s, false);
    const b = domPoint(block, e, true);
    const out = block.ownerDocument.createRange();
    out.setStart(a.node, a.offset);
    out.setEnd(b.node, b.offset);
    return out.collapsed ? null : out;
  }

  /** 선택이 '어휘'(1~3 단어, 문장부호로 끝나지 않음) 인지 */
  function isVocabSelection(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return false;
    if (/[.!?;:,\u2026"\u201c\u201d]/.test(t)) return false;
    const words = t.split(' ').filter(Boolean);
    return words.length >= 1 && words.length <= 3;
  }

  /** 입력창 문자열을 여러 단어로 나눈다 (쉼표·줄바꿈·공백) */
  function splitWords(input) {
    return String(input || '')
      .split(/[,\n;/]+|\s+/)
      .map((w) => w.replace(/^[^A-Za-z\u00C0-\u024F]+|[^A-Za-z\u00C0-\u024F]+$/g, ''))
      .filter(Boolean)
      .map((w) => w.slice(0, 60));
  }

  function normalizeSentence(text) {
    return String(text || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
  }

  /** 학습모드 표시용 토큰: 단어는 탭 가능 */
  function tokenize(sentence) {
    const out = [];
    const re = /[A-Za-zÀ-ɏ]+(?:['’\-][A-Za-zÀ-ɏ]+)*/g;
    let last = 0;
    let m;
    while ((m = re.exec(sentence)) !== null) {
      if (m.index > last) out.push({ text: sentence.slice(last, m.index), word: false });
      out.push({ text: m[0], word: true });
      last = m.index + m[0].length;
    }
    if (last < sentence.length) out.push({ text: sentence.slice(last), word: false });
    return out;
  }

  function wordCount(sentence) {
    return tokenize(sentence).filter((t) => t.word).length;
  }

  /** 따라쓰기 비교용 정규화: 굽은 따옴표/대시/공백 차이는 무시 */
  function normalizeForTyping(s) {
    return String(s || '')
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”‟″]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ');
  }

  /**
   * 원문과 입력을 글자 단위로 비교한다 (대소문자 무시).
   * return { chars: [{ch, state: 'ok'|'bad'|'todo'}], correct, total, done }
   */
  function compareTyping(original, typed) {
    const o = normalizeForTyping(original).trim();
    const t = normalizeForTyping(typed).replace(/^\s+/, '');
    const chars = [];
    let correct = 0;
    for (let i = 0; i < o.length; i++) {
      if (i < t.length) {
        const ok = o[i].toLowerCase() === t[i].toLowerCase();
        if (ok) correct++;
        chars.push({ ch: o[i], state: ok ? 'ok' : 'bad' });
      } else {
        chars.push({ ch: o[i], state: 'todo' });
      }
    }
    return { chars, correct, total: o.length, done: correct === o.length && t.trim().length >= o.length };
  }

  window.ReaderText = {
    sentenceSpans, countSentences, expandToSentence, expandToWords, isVocabSelection, splitWords, normalizeSentence,
    tokenize, wordCount, compareTyping, normalizeForTyping
  };
})();
