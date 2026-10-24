import type { Adapter, Bookmark, Change, Motion, Pos, VimApi } from "../vim-api.ts";

// g; and g, go to older and newer change positions, as in Vim and Zed, and `. and '. go to
// the newest. vim.js's own `. reads CodeMirror 5's edit history, which monaco-vim's adapter
// does not have, so this keeps one list per editor on every host. As in Vim, changes close
// together on one line, or within one Insert-mode session, keep one position.
const MOTION = "vimOverlayChangeList";
const MAX = 100;
interface ChangeList { marks: Bookmark[]; index: number; merge: boolean }
const lists = new WeakMap<Adapter, ChangeList>(); // adapter -> { marks: bookmarks, oldest first, index, merge }

function clear(l: ChangeList) {
  for (const m of l.marks) m.clear();
  l.marks = [];
  l.index = 0;
  l.merge = false;
}

// A position that moves with edits around it. monaco-vim's bookmarks keep their line and
// column whatever changes, so on Monaco this uses a decoration, which Monaco moves.
function bookmark(cm: Adapter, pos: Pos): Bookmark {
  const model = cm.editor?.getModel?.();
  if (!model?.deltaDecorations) return cm.setBookmark(pos);
  const range = { startLineNumber: pos.line + 1, startColumn: pos.ch + 1, endLineNumber: pos.line + 1, endColumn: pos.ch + 1 };
  const [id] = model.deltaDecorations([], [{ range, options: { stickiness: 1 } }]); // NeverGrowsWhenTypingAtEdges
  return {
    find() {
      const r = cm.editor!.getModel() === model && model.getDecorationRange(id);
      return r ? { line: r.startLineNumber - 1, ch: r.startColumn - 1 } : null;
    },
    clear: () => model.deltaDecorations([id], []),
  };
}

// Whether this task holds a trusted key, paste, cut, drop or input event. A page that loads
// code, or a test that sets it, changes the buffer outside one, so its change is not a
// position: one that replaces the whole buffer empties the list, and any other is skipped.
let userInput = false;
for (const type of ["keydown", "beforeinput", "paste", "cut", "drop", "compositionend"]) {
  addEventListener(type, (e) => {
    if (!e.isTrusted || userInput) return;
    userInput = true;
    setTimeout(() => (userInput = false));
  }, true);
}

// Whether text is the whole buffer. monaco-vim's adapter has no getValue, and a CodeMirror 5
// document may start at a line other than 0.
function wholeBuffer(cm: Adapter, text: string) {
  const first = cm.firstLine?.() ?? 0;
  const count = cm.lastLine() - first + 1;
  if (text.split("\n").length !== count) return false;
  return Array.from({ length: count }, (_, i) => cm.getLine(first + i)).join("\n") === text;
}

// Where Vim remembers a change: the last inserted character, or where text was deleted.
// A linewise insert at column 0 ends with a newline; its last character is on the line before.
function changePos(line: number, ch: number, text: string) {
  if (!text) return { line, ch };
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && ch === 0 && lines.at(-1) === "") lines.pop();
  const lastLength = lines.at(-1)!.length;
  return lines.length === 1 ? { line, ch: Math.max(0, ch + lastLength - 1) } : { line: line + lines.length - 1, ch: Math.max(0, lastLength - 1) };
}

function record(cm: Adapter, l: ChangeList, pos: Pos, whole: boolean) {
  if (!userInput) return whole && clear(l);
  const vim = cm.state.vim;
  const last = l.marks.at(-1)?.find();
  if (last && (l.merge || (last.line === pos.line && Math.abs(last.ch - pos.ch) < 79))) l.marks.pop()!.clear();
  l.marks.push(bookmark(cm, pos));
  if (l.marks.length > MAX) l.marks.shift()!.clear();
  l.index = l.marks.length;
  l.merge = !!vim?.insertMode;
}

// Each edit's own position, when it happens, so a macro that edits several places in one
// key records each of them. The adapters' change events carry no positions, so this reads
// each editor's own.
function watch(cm: Adapter, l: ChangeList) {
  const onChange = (pos: Pos, whole: boolean) => record(cm, l, pos, whole);
  if (cm.editor?.onDidChangeModelContent) {
    cm.editor.onDidChangeModelContent((e) => {
      for (const c of e.changes) onChange(changePos(c.range.startLineNumber - 1, c.range.startColumn - 1, c.text), e.isFlush);
    });
    cm.editor.onDidChangeModel(() => clear(l));
  } else if (cm.ace) {
    cm.ace.on("change", (d) => {
      const pos = d.action === "insert" ? changePos(d.start.row, d.start.column, d.lines.join("\n")) : { line: d.start.row, ch: d.start.column };
      // A page that empties the buffer sends only a removal, which leaves it empty.
      onChange(pos, wholeBuffer(cm, d.action === "insert" ? d.lines.join("\n") : ""));
    });
  } else if (cm.cm6) {
    // The CodeMirror 6 adapter signals once per operation, with its changes as a list, and
    // keeps where the last of them ended.
    cm.on("change", (...args) => {
      let c = args.find((a): a is Change => !!(a as Partial<Change>)?.text);
      while (c?.next) c = c.next;
      const text = (c?.text ?? []).join("\n");
      const start = cm.posFromIndex(Math.max(0, (cm.$lastChangeEndOffset ?? 0) - text.length));
      onChange(changePos(start.line, start.ch, text), wholeBuffer(cm, text));
    });
  } else {
    cm.on("change", (_cm, c) => onChange(changePos(c.from.line, c.from.ch, c.text.join("\n")), c.origin === "setValue"));
  }
}

function list(cm: Adapter) {
  let l = lists.get(cm);
  if (!l) {
    l = { marks: [], index: 0, merge: false };
    lists.set(cm, l);
    watch(cm, l);
    cm.on("vim-mode-change", () => (l!.merge = false));
  }
  return l;
}

const changeListMotion: Motion<{ newest?: boolean; forward?: boolean }> = (cm, head, args) => {
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
};

export const install = (Vim: VimApi) => {
  // Start each editor's list at its first key, before any change the list should hold.
  const findKey = Vim.findKey;
  Vim.findKey = function (cm, ...rest) {
    if ((cm as Partial<Adapter> | undefined)?.setBookmark) list(cm);
    return findKey.call(this, cm, ...rest);
  };
  Vim.defineMotion(MOTION, changeListMotion);
  Vim.mapCommand("g;", "motion", MOTION, { forward: false });
  Vim.mapCommand("g,", "motion", MOTION, { forward: true });
  Vim.mapCommand("`.", "motion", MOTION, { newest: true, toJumplist: true });
  Vim.mapCommand("'.", "motion", MOTION, { newest: true, toJumplist: true, linewise: true });
};
