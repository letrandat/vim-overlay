import type { Adapter, VimApi } from "../vim-api.ts";

// Insert-mode keyword completion from words in the buffer, like Vim's i_CTRL-N
// and i_CTRL-P, without the popup menu: each press puts the next match in place,
// and after the last match the typed prefix comes back.
const ACTION = "vimOverlayComplete";
const WORD = /[\p{L}\p{N}_]+/gu;
interface Session {
  line: number; start: number; end: number; text?: string; matches: string[]; index: number;
  forward: boolean; before: unknown[];
}
const sessions = new WeakMap<Adapter, Session>(); // adapter -> { line, start, end, text, matches, index, forward, before }
const watched = new WeakSet<Adapter>();

// Words starting with prefix, nearest first in the direction of the search,
// wrapping around the buffer as Vim does.
function candidates(cm: Adapter, line: number, start: number, prefix: string, forward: boolean) {
  const before: string[] = [], after: string[] = [];
  for (let l = cm.firstLine?.() ?? 0; l <= cm.lastLine(); l++) {
    for (const m of cm.getLine(l).matchAll(WORD)) {
      if (l === line && m.index === start) continue; // the word being completed
      (l < line || (l === line && m.index < start) ? before : after).push(m[0]);
    }
  }
  const order = forward ? [...after, ...before] : [...before.reverse(), ...after.reverse()];
  return [...new Set(order)].filter((w) => w.startsWith(prefix) && w !== prefix);
}

// Replace text on one line and put the cursor after it, as typing would, so the
// host's undo history groups it with the typing around it like an Insert-mode
// undo. Each adapter's replaceRange and setCursor start a new undo group.
function type(cm: Adapter, text: string, line: number, from: number, to: number) {
  if (cm.cm6) {
    // CodeMirror 6 ends a history group at a selection-only transaction.
    const start = cm.cm6.state.doc.line(line + 1).from;
    cm.cm6.dispatch({
      changes: { from: start + from, to: start + to, insert: text },
      selection: { anchor: start + from + text.length },
      userEvent: "input.type",
    });
  } else if (cm.editor?.trigger) {
    // Monaco groups its own typing command; edits from other sources get their own
    // undo stop. A source other than "keyboard" keeps the suggest widget closed.
    cm.editor.setSelection({ startLineNumber: line + 1, startColumn: from + 1, endLineNumber: line + 1, endColumn: to + 1 });
    cm.editor.trigger("vim", "type", { text });
  } else {
    cm.replaceRange(text, { line, ch: from }, { line, ch: to }, "+input"); // CodeMirror 5 groups "+input" edits
    cm.setCursor({ line, ch: from + text.length });
  }
}

function complete(Vim: VimApi, cm: Adapter, forward: boolean) {
  if (cm.cm6?.state.readOnly) return; // type() skips the CodeMirror 6 adapter, which has this check
  const cur = cm.getCursor();
  const text = cm.getLine(cur.line);
  const lastInsert = Vim.getVimGlobalState_().macroModeState.lastInsertModeChanges;
  let s = sessions.get(cm);
  // A session continues only while the line and cursor are as the last completion
  // left them. vim.js sets maybeReset when the cursor moves without an edit.
  if (!s || s.line !== cur.line || s.end !== cur.ch || s.text !== text || lastInsert.maybeReset) {
    let start = cur.ch;
    while (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1])) start--;
    const prefix = text.slice(start, cur.ch);
    const matches = [prefix, ...candidates(cm, cur.line, start, prefix, forward)];
    // before: the recorded Insert-mode changes that "." repeats ahead of this completion.
    const before = lastInsert.maybeReset ? [] : [...lastInsert.changes];
    s = { line: cur.line, start, end: cur.ch, matches, index: 0, forward, before };
    sessions.set(cm, s);
    if (!watched.has(cm)) {
      watched.add(cm);
      cm.on("vim-mode-change", () => sessions.delete(cm)); // leaving Insert mode ends the session
    }
  }
  if (s.matches.length === 1) return;
  s.index = (s.index + (forward === s.forward ? 1 : -1) + s.matches.length) % s.matches.length;
  const word = s.matches[s.index];
  type(cm, word, s.line, s.start, s.end);
  s.end = s.start + word.length;
  s.text = cm.getLine(s.line);
  // vim.js records inserted text but not removed text, so a replaced word would
  // repeat wrong with ".". Record what Vim does: the text added after the prefix,
  // one character per change as typing records it (monaco-vim replays a longer
  // string as its first character only). CodeMirror 5 records this edit at the
  // end of the key's operation, so correct the record after that.
  const suffix = [...word.slice(s.matches[0].length)];
  queueMicrotask(() => {
    lastInsert.changes = [...s.before, ...suffix];
    lastInsert.maybeReset = false;
  });
}

export const install = (Vim: VimApi) => {
  Vim.defineAction<{ forward: boolean }>(ACTION, (cm, args) => complete(Vim, cm, args.forward));
  Vim.mapCommand("<C-n>", "action", ACTION, { forward: true }, { context: "insert" });
  Vim.mapCommand("<C-p>", "action", ACTION, { forward: false }, { context: "insert" });
};
