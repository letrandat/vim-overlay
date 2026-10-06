// Indent text objects ii, ai, iI, aI.
// Port of vim-indent-object by Michael Smith (MIT): https://github.com/michaeljsmith/vim-indent-object
(() => {
  const MOTION = "vimOverlayIndentObject";
  // [keys, inner, below]: "a" adds the line above, "I" (with "a") also adds the line below.
  const OBJECTS = [
    ["ii", true, false],
    ["ai", false, false],
    ["iI", true, true],
    ["aI", false, true],
  ];
  const lastRange = new WeakMap(); // adapter -> [top, bottom] of the last result

  // Port of the plugin's TextObject(). Lines are 0-based; -1 and lines.length
  // stand in for Vim's line 0 and line("$") + 1, which getline() and indent()
  // treat as blank with indent -1. Returns [top, bottom], inclusive.
  function findIndentBlock(lines, top, bottom, { inner, below, count, fresh, tabSize }) {
    const n = lines.length;
    const blank = (l) => l < 0 || l >= n || /^[ \t]*$/.test(lines[l]);
    const indent = (l) => {
      if (l < 0 || l >= n) return -1;
      let width = 0;
      for (const ch of lines[l]) {
        if (ch === " ") width++;
        else if (ch === "\t") width += tabSize - (width % tabSize);
        else break;
      }
      return width;
    };

    // One pass of the plugin's loop: grow [l0, l1] to the block around it.
    function grow(l0, l1) {
      let idnt = Infinity;
      for (let l = l0; l <= l1; l++) if (!blank(l)) idnt = Math.min(idnt, indent(l));
      let a = l0, b = l1, aKeep = l0, bKeep = l1;
      if (idnt === Infinity) {
        // Only blank lines: take the deeper of the neighbouring blocks.
        let pnb = l0, nnb = l0;
        while (pnb >= 0 && blank(pnb)) pnb--;
        while (nnb < n && blank(nnb)) nnb++;
        if (nnb === n) nnb = -1; // nextnonblank() returns 0 when nothing follows
        idnt = Math.max(0, indent(pnb), indent(nnb));
        if (pnb >= 0) a = pnb;
        if (idnt > indent(pnb)) a = nnb;
        if (idnt > indent(nnb)) b = pnb;
      }
      // Walk out to the first line on each side with less indent. Blank lines
      // are skipped, except that they end a block at indent 0.
      for (let bl = blank(a); a >= 0 && (bl || indent(a) >= idnt); bl = blank(--a)) {
        if (idnt === 0 && bl) break;
        if (!bl || !inner) aKeep = a;
      }
      for (let bl = blank(b); b < n && (bl || indent(b) >= idnt); bl = blank(++b)) {
        if (idnt === 0 && bl) break;
        if (!bl || !inner) bKeep = b;
      }
      // a and b sit just outside the block. Keep each only if it is the
      // deeper of the two, and keep b only for aI.
      const edge = Math.max(indent(a), indent(b));
      if (inner || indent(a) < edge) a = aKeep;
      if (inner || !below || indent(b) < edge) b = bKeep;
      return [Math.max(a, 0), Math.min(b, n - 1)];
    }

    // A pass counts only if it changes the range. A pass that changes nothing
    // pulls in the line above and retries, which climbs to the enclosing
    // block; the plugin always counts the retry. A fresh selection counts its
    // first pass even when nothing changes. So a count of n acts like n presses
    // in Visual mode, as the plugin's doc says. (Its code counts every pass of
    // a fresh selection, which makes y2ii the same as yii.)
    let range = [top, bottom], probe = range, force = fresh;
    while (count > 0) {
      const [a, b] = grow(probe[0], probe[1]);
      if (force || a !== range[0] || b !== range[1]) {
        // The plugin selects from line a to line b in either order, and its
        // cursor(0, col) for b = -1 stays on line a.
        range = probe = b < 0 ? [a, a] : [Math.min(a, b), Math.max(a, b)];
        count--;
        force = false;
      } else {
        probe = [probe[0] - 1, probe[1]];
        force = true;
      }
    }
    return range;
  }

  // vim.js motion: (cm, head, motionArgs, vim) -> [anchor, head]. cm is the
  // host's CodeMirror-compatible adapter.
  function indentObjectMotion(cm, head, args, vim) {
    const lines = [];
    for (let i = 0; i <= cm.lastLine(); i++) lines.push(cm.getLine(i));
    const visual = vim.visualMode;
    const from = visual ? vim.sel.anchor.line : head.line;
    const to = visual ? vim.sel.head.line : head.line;
    const top = Math.min(from, to), bottom = Math.max(from, to);
    // Pressing the object again on its own result selects the enclosing block.
    const last = lastRange.get(cm);
    const fresh = !(visual && vim.visualLine && last && last[0] === top && last[1] === bottom);
    // Monaco keeps tabSize on the model; monaco-vim's getOption reads editor options only.
    const tabSize = cm.editor?.getModel?.()?.getOptions?.().tabSize || cm.getOption("tabSize") || 4;
    const [start, end] = findIndentBlock(lines, top, bottom, {
      inner: args.inner,
      below: args.below,
      count: args.repeat || 1,
      fresh,
      tabSize,
    });
    lastRange.set(cm, [start, end]);
    args.linewise = true; // operators act on whole lines, as with the built-in `ip`
    if (visual && (!vim.visualLine || vim.visualBlock)) {
      vim.visualLine = true;
      vim.visualBlock = false;
      // Every adapter class has the static signal() that vim.js itself uses for mode changes.
      cm.constructor.signal?.(cm, "vim-mode-change", { mode: "visual", subMode: "linewise" });
    }
    return [{ line: start, ch: 0 }, { line: end, ch: 0 }];
  }

  window.vimOverlay.features.push({
    name: "indent-object",
    install(Vim) {
      Vim.defineMotion(MOTION, indentObjectMotion);
      // mapCommand puts these ahead of the built-in i<character>/a<character>.
      for (const [keys, inner, below] of OBJECTS) Vim.mapCommand(keys, "motion", MOTION, { inner, below });
    },
  });
})();
