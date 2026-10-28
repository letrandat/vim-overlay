import type { Adapter, VimApi } from "../vim-api.ts";
import { bufferLines } from "../editor/lines.ts";
import { isMonaco } from "../editor/adapter.ts";
import { notify } from "../editor/notify.ts";
import { organizeImports } from "../python/imports.ts";

// Shift-Alt-O organizes imports, Zed's and VS Code's key for it. Where Monaco has an organize
// imports provider for the language (TypeScript and JavaScript in stock Monaco), it runs Monaco's
// own. In Python it sorts the imports as ruff does, which is what Zed runs. Ace's and CodeMirror
// 6's vim modes do not pass the key to vim.js, so there it does nothing.
const ACTION = "vimOverlayOrganizeImports";

function isPython(cm: Adapter) {
  if (isMonaco(cm)) {
    const model = cm.editor.getModel();
    // LeetCode names the language python3.
    return /^python/.test(model?.getLanguageId?.() ?? model?.getModeId?.() ?? "");
  }
  return cm.getModeAt?.(cm.getCursor()).name === "python";
}

// Replaces old lines from..to (exclusive) with next as one edit, so one u undoes it.
function replaceLines(cm: Adapter, first: number, old: string[], from: number, to: number, next: string[]) {
  const at = (line: number, ch: number) => ({ line: first + line, ch });
  if (from === to) {
    if (from < old.length) cm.replaceRange(next.join("\n") + "\n", at(from, 0), at(from, 0));
    else cm.replaceRange("\n" + next.join("\n"), at(from - 1, old[from - 1].length), at(from - 1, old[from - 1].length));
  } else if (next.length) cm.replaceRange(next.join("\n"), at(from, 0), at(to - 1, old[to - 1].length));
  else if (to < old.length) cm.replaceRange("", at(from, 0), at(to, 0));
  else if (from > 0) cm.replaceRange("", at(from - 1, old[from - 1].length), at(to - 1, old[to - 1].length));
  else cm.replaceRange("", at(0, 0), at(to - 1, old[to - 1].length));
}

function organizeImportsAction(cm: Adapter) {
  const monacoOrganize = cm.editor?.getAction?.("editor.action.organizeImports");
  if (monacoOrganize?.isSupported?.()) return void monacoOrganize.run();
  if (!isPython(cm)) return notify(cm, "Organize imports works on Python here");
  const { first, lines } = bufferLines(cm);
  const { lines: next, lineMap, untouched } = organizeImports(lines);
  if (untouched) return notify(cm, `Left the imports as they are: ${untouched}`);
  let from = 0;
  while (from < lines.length && from < next.length && lines[from] === next[from]) from++;
  let end = 0; // unchanged lines at the end
  while (end < lines.length - from && end < next.length - from && lines[lines.length - 1 - end] === next[next.length - 1 - end]) end++;
  if (from < lines.length || from < next.length) {
    const to = lines.length - end;
    const changed = next.slice(from, next.length - end);
    const cursor = cm.getCursor();
    replaceLines(cm, first, lines, from, to, changed);
    // The cursor follows its line; on a line in a sorted block, it keeps its offset in the block.
    const line = lineMap[cursor.line - first];
    cm.setCursor({ line: first + line, ch: Math.min(cursor.ch, next[line].length) });
  }
}

export const install = (Vim: VimApi) => {
  Vim.defineAction(ACTION, organizeImportsAction);
  Vim.mapCommand("<S-A-o>", "action", ACTION, {}, { context: "normal" });
};
