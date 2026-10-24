import type { Motion, VimApi } from "../vim-api.ts";
import { readLines } from "../editor/lines.ts";

// Ctrl-J and Ctrl-K move the current line, or the lines a Visual selection
// covers, down or up, as the nvim and Zed configs bind them. A count moves that
// many lines. It is a motion so that vim.js moves the Visual selection with the
// lines, as it does for any motion that returns a range.
const MOTION = "vimOverlayMoveLines";

const moveLinesMotion: Motion<{ forward: boolean }> = (cm, head, args, vim, inputState) => {
  if (inputState.operator) return null; // d<C-j> and the like do nothing
  const anchor = vim.visualMode ? vim.sel.anchor : head;
  const top = Math.min(anchor.line, head.line);
  const bottom = Math.max(anchor.line, head.line);
  const by = args.forward ? Math.min(args.repeat, cm.lastLine() - bottom) : -Math.min(args.repeat, top - (cm.firstLine?.() ?? 0));
  if (!by) return null;
  // One edit over the moved lines and the lines they pass, so one u undoes it.
  const moved = readLines(cm, top, bottom);
  const passed = by > 0 ? readLines(cm, bottom + 1, bottom + by) : readLines(cm, top + by, top - 1);
  const from = Math.min(top, top + by);
  const to = Math.max(bottom, bottom + by);
  const text = (by > 0 ? [...passed, ...moved] : [...moved, ...passed]).join("\n");
  cm.replaceRange(text, { line: from, ch: 0 }, { line: to, ch: cm.getLine(to).length });
  return [
    { line: anchor.line + by, ch: anchor.ch },
    { line: head.line + by, ch: head.ch },
  ];
};

export const install = (Vim: VimApi) => {
  Vim.defineMotion(MOTION, moveLinesMotion);
  for (const context of ["normal", "visual"]) {
    Vim.mapCommand("<C-j>", "motion", MOTION, { forward: true }, { context });
    Vim.mapCommand("<C-k>", "motion", MOTION, { forward: false }, { context });
  }
};
