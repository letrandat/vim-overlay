// Insert-mode keyword completion from words in the buffer, like Vim's i_CTRL-N
// and i_CTRL-P, without the popup menu: each press puts the next match in place,
// and after the last match the typed prefix comes back.
(() => {
  const ACTION = "vimOverlayComplete";
  const WORD = /[\p{L}\p{N}_]+/gu;
  const sessions = new WeakMap(); // adapter -> { line, start, end, matches, index }

  // Words starting with prefix, in the order Ctrl-N meets them: from the cursor
  // to the end of the buffer, then from the top back to the cursor.
  function candidates(cm, line, start, prefix) {
    const before = [], after = [];
    for (let l = cm.firstLine?.() ?? 0; l <= cm.lastLine(); l++) {
      for (const m of cm.getLine(l).matchAll(WORD)) {
        if (l === line && m.index === start) continue; // the word being completed
        const where = l < line || (l === line && m.index < start) ? before : after;
        where.push(m[0]);
      }
    }
    return [...new Set([...after, ...before])].filter((w) => w.startsWith(prefix) && w !== prefix);
  }

  function complete(cm, { forward }) {
    const cur = cm.getCursor();
    const text = cm.getLine(cur.line);
    let s = sessions.get(cm);
    // A session continues only while the cursor sits right after the last completion.
    if (!s || s.line !== cur.line || s.end !== cur.ch || text.slice(s.start, s.end) !== s.matches[s.index]) {
      let start = cur.ch;
      while (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1])) start--;
      const prefix = text.slice(start, cur.ch);
      s = { line: cur.line, start, end: cur.ch, matches: [prefix, ...candidates(cm, cur.line, start, prefix)], index: 0 };
      sessions.set(cm, s);
    }
    if (s.matches.length === 1) return;
    s.index = (s.index + (forward ? 1 : -1) + s.matches.length) % s.matches.length;
    const word = s.matches[s.index];
    cm.replaceRange(word, { line: s.line, ch: s.start }, { line: s.line, ch: s.end });
    s.end = s.start + word.length;
    cm.setCursor({ line: s.line, ch: s.end });
  }

  window.vimOverlay.features.complete = (Vim) => {
    Vim.defineAction(ACTION, complete);
    Vim.mapCommand("<C-n>", "action", ACTION, { forward: true }, { context: "insert" });
    Vim.mapCommand("<C-p>", "action", ACTION, { forward: false }, { context: "insert" });
  };
})();
