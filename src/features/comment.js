// gc{motion}, gcc and Visual gc toggle line comments, as Neovim's gc and vim-commentary
// do: if every non-blank line is commented, uncomment them all, else comment them all at
// the smallest indent. Blank lines are left as they are, as Monaco's own toggle does.
// vim.js runs a multi-key operator linewise when its last key repeats, so gcc needs no map.
const OPERATOR = "vimOverlayComment";
// Monaco language ids whose line comment is not //, for a build without Monaco's toggle.
const MONACO_LINE = {
  python: "#", ruby: "#", r: "#", shell: "#", perl: "#", elixir: "#", julia: "#", coffeescript: "#",
  powershell: "#", yaml: "#", dockerfile: "#", sql: "--", mysql: "--", pgsql: "--", lua: "--",
  haskell: "--", racket: ";", scheme: ";", clojure: ";", erlang: "%", vb: "'",
};
const MONACO_BLOCK = { html: ["<!--", "-->"], xml: ["<!--", "-->"], markdown: ["<!--", "-->"], css: ["/*", "*/"] };

const lines = (cm, from, to) => Array.from({ length: to - from + 1 }, (_, i) => cm.getLine(from + i));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blank = (s) => !/\S/.test(s);

// The comment around a line's text, as Neovim splits 'commentstring' at %s.
function commentParts(cm, line) {
  let lineToken, block; // block: [open, close]
  if (cm.cm6) {
    const { state } = cm.cm6;
    const tokens = state.languageDataAt("commentTokens", state.doc.line(line + 1).from)[0];
    lineToken = tokens?.line;
    block = tokens?.block && [tokens.block.open, tokens.block.close];
  } else if (cm.ace) {
    const mode = cm.ace.session.getMode();
    lineToken = [mode.lineCommentStart].flat()[0];
    block = mode.blockComment && [mode.blockComment.start, mode.blockComment.end];
  } else if (cm.editor?.getModel) {
    const model = cm.editor.getModel();
    // getModeId before Monaco 0.34. LeetCode names its languages python3 and the like.
    const id = (model.getLanguageId?.() ?? model.getModeId?.()).replace(/\d+$/, "");
    lineToken = MONACO_LINE[id];
    block = MONACO_BLOCK[id];
  } else if (cm.getModeAt) {
    const mode = cm.getModeAt({ line, ch: 0 });
    lineToken = mode.lineComment;
    block = mode.blockCommentStart && [mode.blockCommentStart, mode.blockCommentEnd];
  }
  if (lineToken) return { left: lineToken + " ", right: "" };
  if (block?.[0]) return { left: block[0] + " ", right: " " + block[1] };
  return { left: "// ", right: "" };
}

// Neovim's toggle_lines (runtime/lua/vim/_comment.lua), except that blank lines stay blank
// and each line keeps its own indentation.
function toggle(text, { left, right }) {
  const [l, r] = [escape(left.trim()), escape(right.trim())];
  const filled = text.filter((s) => !blank(s));
  if (filled.every((s) => new RegExp(`^\\s*${l}.*${r}\\s*$`).test(s))) {
    const exact = new RegExp(`^(\\s*)${escape(left)}(.*)${escape(right)}(\\s*)$`);
    const trimmed = new RegExp(`^(\\s*)${l}(.*)${r}(\\s*)$`);
    return text.map((s) => {
      const m = s.match(exact) || s.match(trimmed);
      return !m ? s : blank(m[2]) ? m[2] : m[1] + m[2] + m[3];
    });
  }
  // Insert at the smallest indent's length into each line's own whitespace, so a line
  // indented with tabs where another uses spaces comes back unchanged when uncommented.
  const at = Math.min(...filled.map((s) => s.match(/^\s*/)[0].length));
  return text.map((s) => (blank(s) ? s : s.slice(0, at) + left + s.slice(at) + right));
}

// Monaco's own toggle knows the comment of every language the page registers.
function monacoToggle(cm, top, bottom) {
  const action = cm.editor?.getAction?.("editor.action.commentLine");
  if (!action) return false;
  const model = cm.editor.getModel();
  cm.editor.setSelection({ startLineNumber: top + 1, startColumn: 1, endLineNumber: bottom + 1, endColumn: model.getLineMaxColumn(bottom + 1) });
  action.run();
  return true;
}

function commentOperator(cm, _args, ranges, oldAnchor) {
  const vim = cm.state.vim;
  let top = Infinity, bottom = -Infinity;
  for (const { anchor, head } of ranges) {
    const [from, to] = anchor.line < head.line || (anchor.line === head.line && anchor.ch <= head.ch) ? [anchor, head] : [head, anchor];
    top = Math.min(top, from.line);
    // A linewise range ends at the start of the line after it.
    bottom = Math.max(bottom, to.ch === 0 && to.line > from.line ? to.line - 1 : to.line);
  }
  if (!monacoToggle(cm, top, bottom)) {
    const old = lines(cm, top, bottom);
    const next = toggle(old, commentParts(cm, top));
    if (next.some((s, i) => s !== old[i])) cm.replaceRange(next.join("\n"), { line: top, ch: 0 }, { line: bottom, ch: old[old.length - 1].length });
  }
  // Neovim keeps the cursor when it is on the first line, else goes to that line's start.
  if (oldAnchor.line !== top || (vim.visualMode && vim.visualLine)) return { line: top, ch: 0 };
  return { line: top, ch: Math.max(0, Math.min(oldAnchor.ch, cm.getLine(top).length - 1)) };
}

export const install = (Vim) => {
  Vim.defineOperator(OPERATOR, commentOperator);
  Vim.mapCommand("gc", "operator", OPERATOR, {}, { isEdit: true });
};
