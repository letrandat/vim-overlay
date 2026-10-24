// Fixes i( a( i[ a[ i{ a{ i< a< in monaco-vim. vim.js finds the brackets around the cursor
// with the adapter's scanForBracket, and monaco-vim's version skips an open bracket right
// before a pair it just passed, wraps around the buffer, and stops after ten brackets, so
// ci( in f(g() + x) fails. This swaps in CodeMirror 5's scan, which the other hosts get
// right. monaco-vim reads Vim.findKey for every key, which hands over the adapter.
const MATCHING = { "(": ")>", ")": "(<", "[": "]>", "]": "[<", "{": "}>", "}": "{<", "<": ">>", ">": "<<" };
const MAX_LINES = 1000;

// CodeMirror 5's scanForBracket without its syntax-token check: the nearest bracket in
// the direction dir that closes (or, backward, opens) the pair around pos.
function scanForBracket(pos, dir, _style, config) {
  const re = config?.bracketRegex || /[(){}[\]]/;
  const first = this.firstLine?.() ?? 0;
  const end = dir > 0 ? Math.min(pos.line + MAX_LINES, this.lastLine() + 1) : Math.max(first - 1, pos.line - MAX_LINES);
  const stack = [];
  for (let line = pos.line; line !== end; line += dir) {
    const text = this.getLine(line);
    let ch = line === pos.line ? pos.ch - (dir < 0 ? 1 : 0) : dir > 0 ? 0 : text.length - 1;
    for (; dir > 0 ? ch < text.length : ch >= 0; ch += dir) {
      const c = text.charAt(ch);
      if (!re.test(c) || !MATCHING[c]) continue;
      if ((MATCHING[c].charAt(1) === ">") === dir > 0) stack.push(c);
      else if (!stack.length) return { pos: { line, ch }, ch: c };
      else stack.pop();
    }
  }
  return null;
}

export const install = (Vim) => {
  const findKey = Vim.findKey;
  Vim.findKey = function (cm, ...rest) {
    // Only Monaco's adapter has an editor with a model; CodeMirror and Ace scan correctly.
    if (cm?.editor?.getModel && cm.scanForBracket !== scanForBracket) cm.scanForBracket = scanForBracket;
    return findKey.call(this, cm, ...rest);
  };
};
