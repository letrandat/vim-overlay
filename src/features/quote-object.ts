import type { Adapter, Motion, Selection, VimApi } from "../vim-api.ts";

// Text objects iq and aq: the quotes around the cursor, whichever of " ' ` they are, as
// mini.ai's and Zed's q. Like Vim's i", they look only at the cursor's line.
const MOTION = "vimOverlayQuoteObject";
const QUOTES = "\"'`";
const lastRange = new WeakMap<Adapter, [Selection, number, number]>(); // adapter -> [vim.sel, from, to] of the last Visual result

// The quoted strings in text from..to, read left to right as code reads them: a quote opens
// a string that ends at the next unescaped quote of its kind. A quote that never closes is
// left as text, so the apostrophe in // it's "x" does not hide "x". Each string also holds
// the strings inside it, so 'x' in "a = 'x'" is found. Returns [open, close, inside] trees.
type QuotedString = [number, number, QuotedString[]];

function quotedStrings(text: string, from: number, to: number): QuotedString[] {
  const out: QuotedString[] = [];
  for (let i = from; i < to; i++) {
    if (text[i] === "\\") i++;
    else if (QUOTES.includes(text[i])) {
      let j = i + 1;
      while (j < to && text[j] !== text[i]) j += text[j] === "\\" ? 2 : 1;
      if (j >= to) continue;
      out.push([i, j, quotedStrings(text, i + 1, j)]);
      i = j;
    }
  }
  return out;
}

// The range iq or aq takes from a string, end exclusive.
const span = ([open, close]: QuotedString, inner: boolean): [number, number] => (inner ? [open + 1, close] : [open, close + 1]);

// [from, to] is the cursor or a Visual selection, both inclusive. Walks out from the
// innermost string that holds it: iq takes a string's inside, then the string with its
// quotes (as Vim's 2i" does), then the next string out; aq takes each string with its
// quotes. count steps that far; with grow, steps no bigger than the selection are skipped.
// With no string around the cursor, takes the next one after it.
function findQuotes(text: string, from: number, to: number,
  { inner, count, grow }: { inner: boolean; count: number; grow: boolean | undefined }) {
  const around: QuotedString[] = [];
  for (let level = quotedStrings(text, 0, text.length); ; ) {
    const s = level.find(([open, close]) => open <= from && to <= close);
    if (!s) break;
    around.unshift(s);
    level = s[2];
  }
  const steps = around
    .flatMap((s) => (inner ? [span(s, true), span(s, false)] : [span(s, false)]))
    .filter(([a, b]) => !grow || a < from || b - 1 > to);
  if (steps.length) return steps[count - 1] ?? null;
  if (around.length || count > 1 || from !== to) return null;
  const next = quotedStrings(text, 0, text.length).find(([open]) => open > from);
  return next && span(next, inner);
}

const quoteObjectMotion: Motion<{ inner: boolean }> = (cm, head, args, vim) => {
  const visual = vim.visualMode;
  const anchor = visual ? vim.sel.anchor : head;
  const cur = visual ? vim.sel.head : head;
  if (anchor.line !== cur.line) return null;
  const from = Math.min(anchor.ch, cur.ch), to = Math.max(anchor.ch, cur.ch);
  // Pressing the object again on its own result takes the next step out. vim.js makes a
  // new vim.sel for each Visual session, so a result from an earlier one does not count.
  const last = lastRange.get(cm);
  const grow = visual && !vim.visualLine && !vim.visualBlock && last?.[0] === vim.sel && last[1] === from && last[2] === to;
  const range = findQuotes(cm.getLine(cur.line), from, to, { inner: args.inner, count: args.repeat || 1, grow });
  if (!range) return null;
  const [start, end] = range;
  if (!visual) return [{ line: cur.line, ch: start }, { line: cur.line, ch: end }];
  if (start === end) return null; // nothing between the quotes to select
  lastRange.set(cm, [vim.sel, start, end - 1]);
  if (vim.visualLine || vim.visualBlock) {
    vim.visualLine = vim.visualBlock = false;
    cm.constructor.signal?.(cm, "vim-mode-change", { mode: "visual", subMode: "" });
  }
  // Visual mode keeps the last character inside the selection.
  return [{ line: cur.line, ch: start }, { line: cur.line, ch: end - 1 }];
};

export const install = (Vim: VimApi) => {
  Vim.defineMotion(MOTION, quoteObjectMotion);
  Vim.mapCommand("iq", "motion", MOTION, { inner: true });
  Vim.mapCommand("aq", "motion", MOTION, { inner: false });
};
