import type { Adapter, Pos, VimApi } from "../vim-api.ts";
import { isMonaco } from "../editor/adapter.ts";
import { beforeKey } from "../vim/keys.ts";
import { afterYank } from "../vim/yank.ts";

// Briefly highlights the text a yank copied, as Neovim's vim.hl.on_yank() does. vim.js yanks the
// editor's selection, so the selection at the yank is what to highlight. Monaco, Ace and
// CodeMirror 5; CodeMirror 6's adapter has no way to mark text.
const CLASS = "vim-overlay-yank";
const DURATION = 150; // ms, Neovim's default
let current: Adapter | undefined; // the editor that took the last key

function addStyle() {
  if (document.getElementById(CLASS)) return;
  const style = document.createElement("style");
  style.id = CLASS;
  // Ace places only its own marker classes, so a marker of ours needs position:absolute.
  style.textContent = `.${CLASS}{background-color:rgba(209,154,102,0.45)}.ace_marker-layer .${CLASS}{position:absolute}`;
  (document.head || document.documentElement).append(style);
}

const before = (a: Pos, b: Pos) => a.line < b.line || (a.line === b.line && a.ch < b.ch);

function flash() {
  const cm = current;
  if (!cm) return;
  // An empty selection is :yank, which leaves the cursor where it is.
  const ranges = cm.listSelections()
    .map(({ anchor, head }) => (before(head, anchor) ? [head, anchor] : [anchor, head]))
    .filter(([from, to]) => before(from, to));
  if (!ranges.length) return;
  addStyle();
  let clear;
  if (isMonaco(cm)) {
    const { editor } = cm;
    const ids = editor.deltaDecorations([], ranges.map(([from, to]) => ({
      range: { startLineNumber: from.line + 1, startColumn: from.ch + 1, endLineNumber: to.line + 1, endColumn: to.ch + 1 },
      options: { className: CLASS },
    })));
    clear = () => editor.deltaDecorations(ids, []);
  } else if (cm.ace) {
    const { session } = cm.ace;
    const Range = cm.ace.getSelectionRange().constructor;
    const ids = ranges.map(([from, to]) => session.addMarker(new Range(from.line, from.ch, to.line, to.ch), CLASS, "text"));
    clear = () => ids.forEach((id) => session.removeMarker(id));
  } else if (cm.markText) {
    const marks = ranges.map(([from, to]) => cm.markText!(from, to, { className: CLASS }));
    clear = () => marks.forEach((mark) => mark.clear());
  } else return;
  setTimeout(clear, DURATION);
}

export const install = (Vim: VimApi) => {
  beforeKey(Vim, (cm) => (current = cm));
  afterYank(Vim, flash);
};
