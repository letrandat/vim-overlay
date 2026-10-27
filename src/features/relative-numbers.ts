import type { Decoration, MonacoEditor, VimApi } from "../vim-api.ts";
import { beforeKey } from "../vim/keys.ts";

// A column of relative line numbers between Monaco's own numbers and the code, so a count for
// j or k reads off the screen while anyone watching a shared screen still sees the usual
// numbers. Monaco only (LeetCode, CodeSignal, CoderPad). monaco-vim hands the editor to vim.js
// only with a key, so the column appears at the editor's first key. `:set nornu` hides it and
// `:set rnu` brings it back, for every editor of that Vim, until the page reloads.
const CLASS = "vim-overlay-rel";
const MAX = 999;
const shown = new WeakSet<MonacoEditor>(); // Monaco editors

// A margin decoration takes only class names, so one rule per number puts it on screen.
function addStyle() {
  if (document.getElementById(CLASS)) return;
  const style = document.createElement("style");
  style.id = CLASS;
  style.textContent =
    `.${CLASS}{box-sizing:border-box;padding-right:0.8ch;text-align:right;color:#d19a66}` +
    `.${CLASS}-0{opacity:0.5}` +
    Array.from({ length: MAX + 1 }, (_, n) => `.${CLASS}-${n}::before{content:"${n}"}`).join("");
  (document.head || document.documentElement).append(style);
}

function show(editor: MonacoEditor, isOn: () => boolean, renders: Set<() => void>) {
  if (shown.has(editor)) return;
  shown.add(editor);
  addStyle();
  // Off gives back the margin the page set, or Monaco's default of 10 px.
  const width = editor.getRawOptions?.().lineDecorationsWidth ?? 10;
  let wide = false;
  // createDecorationsCollection since Monaco 0.34, deltaDecorations before.
  const collection = editor.createDecorationsCollection?.();
  let ids: string[] = [];
  const render = () => {
    const on = isOn();
    if (on !== wide) {
      wide = on;
      editor.updateOptions({ lineDecorationsWidth: on ? "4.5ch" : width });
    }
    const model = editor.getModel();
    const cur = editor.getPosition()?.lineNumber;
    const decorations: Decoration[] = [];
    if (on && model && cur) {
      const first = Math.max(1, cur - MAX);
      const last = Math.min(model.getLineCount(), cur + MAX);
      for (let n = first; n <= last; n++) {
        const range = { startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: 1 };
        decorations.push({ range, options: { linesDecorationsClassName: `${CLASS} ${CLASS}-${Math.abs(n - cur)}` } });
      }
    }
    if (collection) collection.set(decorations);
    else ids = editor.deltaDecorations(ids, decorations);
  };
  // One render after the events of an edit, not one inside each: a render nested in another
  // leaves the outer one's numbers behind.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  };
  const subscriptions = [editor.onDidChangeCursorPosition(schedule), editor.onDidChangeModelContent(schedule), editor.onDidChangeModel(schedule)];
  renders.add(render);
  editor.onDidDispose(() => {
    subscriptions.forEach((s) => s.dispose());
    renders.delete(render);
  });
  render();
}

export const install = (Vim: VimApi) => {
  let on = true;
  const renders = new Set<() => void>(); // one per editor this Vim drew the column in
  let defined = false;
  beforeKey(Vim, (cm) => {
    if (!cm?.editor?.deltaDecorations || !(cm.editor as Partial<MonacoEditor>).onDidChangeCursorPosition) return;
    // Defined at the first Monaco key, so on hosts without the column `:set rnu` stays unknown.
    if (!defined) {
      defined = true;
      Vim.defineOption("relativenumber", undefined, "boolean", ["rnu"], (value) => {
        if (value === undefined) return on;
        on = value;
        renders.forEach((render) => render());
      });
    }
    show(cm.editor, () => on, renders);
  });
};
