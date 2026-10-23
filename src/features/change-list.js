// g; and g, go to older and newer change positions, as in Vim and Zed, and `. and '. go to
// the newest. vim.js's own `. reads CodeMirror 5's edit history, which monaco-vim's adapter
// does not have, so this keeps one list per editor on every host. As in Vim, changes close
// together on one line, or within one Insert-mode session, keep one position.
(() => {
  const MOTION = "vimOverlayChangeList";
  const MAX = 100;
  const lists = new WeakMap(); // adapter -> { marks: bookmarks, oldest first, index, merge }

  function clear(l) {
    for (const m of l.marks) m.clear();
    l.marks = [];
    l.index = 0;
    l.merge = false;
  }

  // A position that moves with edits around it. monaco-vim's bookmarks keep their line and
  // column whatever changes, so on Monaco this uses a decoration, which Monaco moves.
  function bookmark(cm, pos) {
    const model = cm.editor?.getModel?.();
    if (!model?.deltaDecorations) return cm.setBookmark(pos);
    const range = { startLineNumber: pos.line + 1, startColumn: pos.ch + 1, endLineNumber: pos.line + 1, endColumn: pos.ch + 1 };
    const [id] = model.deltaDecorations([], [{ range, options: { stickiness: 1 } }]); // NeverGrowsWhenTypingAtEdges
    return {
      find() {
        const r = cm.editor.getModel() === model && model.getDecorationRange(id);
        return r ? { line: r.startLineNumber - 1, ch: r.startColumn - 1 } : null;
      },
      clear: () => model.deltaDecorations([id], []),
    };
  }

  // Whether text is the whole buffer. monaco-vim's adapter has no getValue.
  function wholeBuffer(cm, text) {
    const count = cm.lastLine() + 1;
    if (text.split("\n").length !== count) return false;
    return Array.from({ length: count }, (_, i) => cm.getLine(i)).join("\n") === text;
  }

  function record(cm, l, change) {
    // A change that replaced the whole buffer, as a page does when it loads code, starts over.
    for (let c = change; c; c = c.next) if (Array.isArray(c.text) && wholeBuffer(cm, c.text.join("\n"))) return clear(l);
    const vim = cm.state.vim;
    const cur = cm.getCursor();
    // In Insert mode the cursor sits after the typed text; Vim remembers the last typed character.
    const pos = { line: cur.line, ch: vim?.insertMode && cur.ch > 0 ? cur.ch - 1 : cur.ch };
    const last = l.marks.at(-1)?.find();
    if (last && (l.merge || (last.line === pos.line && Math.abs(last.ch - pos.ch) < 79))) l.marks.pop().clear();
    l.marks.push(bookmark(cm, pos));
    if (l.marks.length > MAX) l.marks.shift().clear();
    l.index = l.marks.length;
    l.merge = !!vim?.insertMode;
  }

  function list(cm) {
    let l = lists.get(cm);
    if (!l) {
      l = { marks: [], index: 0, merge: false };
      lists.set(cm, l);
      // After the change, once the key or edit that made it has placed the cursor.
      cm.on("change", (...args) => queueMicrotask(() => record(cm, l, args.find((a) => a?.text))));
      cm.on("vim-mode-change", () => (l.merge = false));
    }
    return l;
  }

  function changeListMotion(cm, head, args) {
    const l = list(cm);
    l.marks = l.marks.filter((m) => m.find());
    l.index = Math.min(l.index, l.marks.length);
    if (args.newest) {
      const pos = l.marks.at(-1)?.find();
      if (!pos) return null;
      return args.linewise ? { line: pos.line, ch: cm.getLine(pos.line).search(/\S|$/) } : pos;
    }
    // At the oldest, g; does nothing (Vim's E662); at the newest, g, does nothing (E663).
    if (args.forward ? l.index >= l.marks.length - 1 : l.index === 0) return null;
    l.index = args.forward ? Math.min(l.index + args.repeat, l.marks.length - 1) : Math.max(l.index - args.repeat, 0);
    return l.marks[l.index].find();
  }

  window.vimOverlay.features["change-list"] = (Vim) => {
    // Start each editor's list at its first key, before any change the list should hold.
    const findKey = Vim.findKey;
    Vim.findKey = function (cm, ...rest) {
      if (cm?.setBookmark) list(cm);
      return findKey.call(this, cm, ...rest);
    };
    Vim.defineMotion(MOTION, changeListMotion);
    Vim.mapCommand("g;", "motion", MOTION, { forward: false });
    Vim.mapCommand("g,", "motion", MOTION, { forward: true });
    Vim.mapCommand("`.", "motion", MOTION, { newest: true, toJumplist: true });
    Vim.mapCommand("'.", "motion", MOTION, { newest: true, toJumplist: true, linewise: true });
  };
})();
