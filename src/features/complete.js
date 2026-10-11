// Insert-mode keyword completion from words in the buffer, like Vim's i_CTRL-N
// and i_CTRL-P, without the popup menu: each press puts the next match in place,
// and after the last match the typed prefix comes back.
(() => {
  const ACTION = "vimOverlayComplete";
  const WORD = /[\p{L}\p{N}_]+/gu;
  const sessions = new WeakMap(); // adapter -> { line, start, end, text, matches, index, forward, base }
  const watched = new WeakSet();

  // Words starting with prefix, nearest first in the direction of the search,
  // wrapping around the buffer as Vim does.
  function candidates(cm, line, start, prefix, forward) {
    const before = [], after = [];
    for (let l = cm.firstLine?.() ?? 0; l <= cm.lastLine(); l++) {
      for (const m of cm.getLine(l).matchAll(WORD)) {
        if (l === line && m.index === start) continue; // the word being completed
        (l < line || (l === line && m.index < start) ? before : after).push(m[0]);
      }
    }
    const order = forward ? [...after, ...before] : [...before.reverse(), ...after.reverse()];
    return [...new Set(order)].filter((w) => w.startsWith(prefix) && w !== prefix);
  }

  function complete(Vim, cm, forward) {
    const cur = cm.getCursor();
    const text = cm.getLine(cur.line);
    const lastInsert = Vim.getVimGlobalState_().macroModeState.lastInsertModeChanges;
    let s = sessions.get(cm);
    // A session continues only while the line and cursor are as the last completion left them.
    if (!s || s.line !== cur.line || s.end !== cur.ch || s.text !== text) {
      let start = cur.ch;
      while (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1])) start--;
      const prefix = text.slice(start, cur.ch);
      const matches = [prefix, ...candidates(cm, cur.line, start, prefix, forward)];
      // base: how many recorded Insert-mode changes precede this completion.
      s = { line: cur.line, start, end: cur.ch, matches, index: 0, forward, base: lastInsert.maybeReset ? 0 : lastInsert.changes.length };
      sessions.set(cm, s);
      if (!watched.has(cm)) {
        watched.add(cm);
        cm.on("vim-mode-change", () => sessions.delete(cm)); // leaving Insert mode ends the session
      }
    }
    if (s.matches.length === 1) return;
    s.index = (s.index + (forward === s.forward ? 1 : -1) + s.matches.length) % s.matches.length;
    const word = s.matches[s.index];
    cm.replaceRange(word, { line: s.line, ch: s.start }, { line: s.line, ch: s.end });
    s.end = s.start + word.length;
    cm.setCursor({ line: s.line, ch: s.end });
    s.text = cm.getLine(s.line);
    // vim.js records inserted text but not removed text, so a replaced word would
    // repeat wrong with ".". Record what Vim does: the text added after the prefix,
    // one character per change as typing records it (monaco-vim replays a longer
    // string as its first character only). CodeMirror 5 records this edit at the
    // end of the key's operation, so correct the record after that.
    const suffix = [...word.slice(s.matches[0].length)];
    queueMicrotask(() => {
      lastInsert.changes = [...lastInsert.changes.slice(0, s.base), ...suffix];
      lastInsert.maybeReset = false;
    });
  }

  window.vimOverlay.features.complete = (Vim) => {
    Vim.defineAction(ACTION, (cm, args) => complete(Vim, cm, args.forward));
    Vim.mapCommand("<C-n>", "action", ACTION, { forward: true }, { context: "insert" });
    Vim.mapCommand("<C-p>", "action", ACTION, { forward: false }, { context: "insert" });
  };
})();
