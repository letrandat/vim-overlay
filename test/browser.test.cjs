#!/usr/bin/env node
// Each host page loads its editor from jsDelivr. The manifest's content
// scripts are injected at document start in manifest order, as the browser
// does with "world": "MAIN". Keys are typed as real key presses.
//
//   node browser.test.cjs                 every host
//   node browser.test.cjs codemirror5     one host
//   BROWSER=chromium node browser.test.cjs
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");
const { [process.env.BROWSER || "webkit"]: browserType } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PAGES = path.join(__dirname, "pages");
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).content_scripts[0].js.map(
  (f) => path.join(ROOT, f)
);
const oracle = JSON.parse(fs.readFileSync(path.join(__dirname, "oracle.json"), "utf8"));

// found: whether the host is expected to find the page's Vim object.
// keyUndo: the host undoes typed text one key at a time, so UNDO_SCENARIOS do not apply.
const CONFIGS = [
  { host: "monaco-vim", page: "monaco-vim.html", found: true },
  { host: "codemirror6", page: "codemirror6.html?expose=1", found: true },
  { host: "codemirror6", page: "codemirror6.html?expose=1&view=6.38.8", found: true },
  { host: "codemirror6", page: "codemirror6.html", found: false },
  { host: "codemirror5", page: "codemirror5.html", found: true, offsetDoc: true },
  { host: "ace", page: "ace.html", found: true, keyUndo: true },
  { host: "webpack", page: "monaco-webpack.html", found: true },
  { host: "webpack", page: "monaco-webpack.html?delay=1&runtimes=2&mangle=1", found: true },
  { host: "webpack", page: "monaco-webpack.html?init=1", found: true },
];

const WITH_TAIL = [
  "def f(nums):",
  "    total = 0",
  "    for x in nums:",
  "        if x > 0:",
  "            total += x",
  "        else:",
  "            total -= x",
  "    return total",
  "",
  "print(f([1, -2]))",
];
const keep = (lines, ...idx) => idx.map((i) => lines[i]);
const ENDIF = oracle.find((f) => f.name === "vim-endif").lines;
const BLANKS = oracle.find((f) => f.name === "blank-lines-inside-blocks").lines;
const CALL = ["def f():", "    stack.append(stack.pop() / num)", "    return 1"];
const NESTED = "f((a) + (b) + (c) + (d) + (e) + (g) + x)";
const ABC = ["a", "b", "c", "d", "e"];
const FRESH = ["fresh = 0", "fresh_", "fresh_count += 1", "x = fresh_total"];
const withLine = (lines, i, text) => lines.map((l, j) => (j === i ? text : l));
const RENAME = ["total = 0", "for x in xs:", "    total += x", "print(total, subtotal)"];
const CODE = ["def f():", "    a = 1", "", "    b = 2", "x"];
const NEST = ["q = \"a = 'x' + 1\""];
const lead = (prefix, lines, ...idx) => lines.map((l, i) => (idx.includes(i) ? prefix + l : l));

// [name, lines, cursor, keys, expect]
const SCENARIOS = [
  ["dii deletes the block", WITH_TAIL, [3, 8], "dii", { lines: keep(WITH_TAIL, 0, 1, 2, 7, 8, 9), cursor: [3, 4] }],
  ["dai also deletes the line above", WITH_TAIL, [3, 8], "dai", { lines: keep(WITH_TAIL, 0, 1, 7, 8, 9) }],
  ["daI also deletes the line below", ENDIF, [1, 3], "daI", { lines: [ENDIF[4]] }],
  ["d2ii deletes the enclosing block", WITH_TAIL, [4, 12], "d2ii", { lines: keep(WITH_TAIL, 0, 1, 2, 7, 8, 9) }],
  ["dii on a blank line", BLANKS, [5, 0], "dii", { lines: BLANKS.filter((_, i) => i !== 6) }],
  ["yii yanks linewise; p pastes lines", WITH_TAIL, [3, 8], "yiiGp", { lines: [...WITH_TAIL, ...WITH_TAIL.slice(3, 7)] }],
  [">ii indents the block", WITH_TAIL, [3, 8], ">ii", { lines: WITH_TAIL.map((l, i) => (i >= 3 && i <= 6 ? "    " + l : l)) }],
  ["<ii dedents the block", WITH_TAIL, [4, 12], "<ii", { lines: WITH_TAIL.map((l, i) => (i === 4 ? l.slice(4) : l)) }],
  ["dot repeats dii", WITH_TAIL, [4, 12], "diij.", { lines: keep(WITH_TAIL, 0, 1, 2, 3, 5, 7, 8, 9) }],
  ["dot repeats >ii", WITH_TAIL, [4, 12], ">ii.", { lines: WITH_TAIL.map((l, i) => (i === 4 ? "        " + l : l)) }],
  ["u undoes dii", WITH_TAIL, [3, 8], "diiu", { lines: WITH_TAIL }],
  ["vii selects linewise", WITH_TAIL, [4, 12], "vii", { selection: [4, 4], mode: "visual-line", lastMode: "visual/linewise" }],
  ["vii ii grows to the enclosing block", WITH_TAIL, [4, 12], "viiii", { selection: [3, 6] }],
  ["vii ii ii grows again", WITH_TAIL, [4, 12], "viiiiii", { selection: [1, 7] }],
  ["v2ii equals vii ii", WITH_TAIL, [4, 12], "v2ii", { selection: [3, 6] }],
  ["vii leaves the cursor on the bottom line; j extends", WITH_TAIL, [3, 8], "viij", { selection: [3, 7] }],
  ["Vai then d", WITH_TAIL, [3, 8], "Vaid", { lines: keep(WITH_TAIL, 0, 1, 7, 8, 9) }],
  ["vaI selects the endif too", ENDIF, [1, 3], "vaI", { selection: [0, 3] }],
  ["Y yanks to the end of the line", WITH_TAIL, [1, 4], "Y", { lines: WITH_TAIL, cursor: [1, 4], register: ["total = 0", false] }],
  ["2Y yanks to the end of the next line", WITH_TAIL, [1, 4], "2Y", { register: ["total = 0\n    for x in nums:", false] }],
  ["Y then $p pastes characterwise", WITH_TAIL, [1, 10], "Y$p", { lines: WITH_TAIL.map((l, i) => (i === 1 ? l + "= 0" : l)) }],
  ["D deletes to the end of the line", WITH_TAIL, [1, 10], "D", { lines: WITH_TAIL.map((l, i) => (i === 1 ? "    total " : l)), register: ["= 0", false] }],
  ["C changes to the end of the line", WITH_TAIL, [1, 10], "Cx<Esc>", { lines: WITH_TAIL.map((l, i) => (i === 1 ? "    total x" : l)) }],
  ["yae yanks the whole buffer linewise", WITH_TAIL, [4, 12], "yae", { lines: WITH_TAIL, register: [WITH_TAIL.join("\n") + "\n", true] }],
  ["dae empties the buffer", WITH_TAIL, [4, 12], "dae", { lines: [""] }],
  ["vae selects every line", WITH_TAIL, [4, 12], "vae", { selection: [0, 9], mode: "visual-line", lastMode: "visual/linewise" }],
  ["yae copies the buffer to the clipboard", WITH_TAIL, [4, 12], "yae", { clipboard: WITH_TAIL.join("\n") + "\n" }],
  ["Y copies to the clipboard", WITH_TAIL, [1, 4], "Y", { clipboard: "total = 0" }],
  ["a named-register yank leaves the clipboard alone", WITH_TAIL, [1, 4], '"ayy', { clipboard: null }],
  ["dd leaves the clipboard alone", WITH_TAIL, [1, 4], "dd", { clipboard: null }],
  ["Ctrl-N completes the nearest match below", FRESH, [1, 0], "A<C-n><Esc>", { lines: withLine(FRESH, 1, "fresh_count"), mode: "normal" }],
  ["Ctrl-N again takes the next match", FRESH, [1, 0], "A<C-n><C-n><Esc>", { lines: withLine(FRESH, 1, "fresh_total") }],
  ["Ctrl-N past the last match restores the prefix", FRESH, [1, 0], "A<C-n><C-n><C-n><Esc>", { lines: FRESH }],
  ["Ctrl-P scans backward and wraps", FRESH, [1, 0], "A<C-p><Esc>", { lines: withLine(FRESH, 1, "fresh_total") }],
  ["typing after a completion keeps it", FRESH, [1, 0], "A<C-n>!<Esc>", { lines: withLine(FRESH, 1, "fresh_count!") }],
  ["dot repeats a completed insert", ["", "", "fresh_count"], [0, 0], "ifresh_<C-n><Esc>j.", { lines: ["fresh_count", "fresh_count", "fresh_count"] }],
  ["dot repeats a completion and the typing after it", ["", "", "fresh_count"], [0, 0], "ifresh_<C-n>!<Esc>j.", { lines: ["fresh_count!", "fresh_count!", "fresh_count"] }],
  ["dot repeats the last of several matches", ["", "", "fresh_count", "fresh_total"], [0, 0], "ifresh_<C-n><C-n><Esc>j.", { lines: ["fresh_total", "fresh_total", "fresh_count", "fresh_total"] }],
  ["dot after completing an existing prefix adds the suffix", ["fresh_", "fresh_", "fresh_count"], [0, 0], "A<C-n><Esc>j.", { lines: ["fresh_count", "fresh_count", "fresh_count"] }],
  ["a new Insert session completes the new prefix", ["fresh_", "fresh_count", "fresh_total", "fresh_count_extra"], [0, 0], "A<C-n><Esc>A<C-n><Esc>", { lines: withLine(["fresh_", "fresh_count", "fresh_total", "fresh_count_extra"], 0, "fresh_count_extra") }],
  ["Ctrl-P takes the nearest match above when words repeat", ["fresh_total", "fresh_count", "fresh_", "fresh_count"], [2, 0], "A<C-p><Esc>", { lines: withLine(["fresh_total", "fresh_count", "fresh_", "fresh_count"], 2, "fresh_count") }],
  ["Ctrl-N steps back through a Ctrl-P list", ["fresh_total", "fresh_count", "fresh_", "fresh_count"], [2, 0], "A<C-p><C-p><C-n><Esc>", { lines: withLine(["fresh_total", "fresh_count", "fresh_", "fresh_count"], 2, "fresh_count") }],
  ["moving the cursor ends the completion; dot repeats what came after", ["", "", "fresh_count", "fresh_countdown"], [0, 0], "ifresh_<C-n><Left><Right><C-n><Esc>j.", { lines: ["fresh_countdown", "down", "fresh_count", "fresh_countdown"] }],
  ["u after completing an existing prefix undoes the completion", ["fresh_", "fresh_count"], [0, 0], "A<C-n><Esc>u", { lines: ["fresh_", "fresh_count"] }],
  ["Ctrl-N without a match changes nothing", FRESH, [0, 0], "Azz<C-n><Esc>", { lines: withLine(FRESH, 0, "fresh = 0zz") }],
  ["Ctrl-J moves the line down", ABC, [1, 0], "<C-j>", { lines: ["a", "c", "b", "d", "e"], cursor: [2, 0], mode: "normal" }],
  ["Ctrl-K moves the line up", ABC, [1, 0], "<C-k>", { lines: ["b", "a", "c", "d", "e"], cursor: [0, 0] }],
  ["Ctrl-J keeps the column", ["abc", "def"], [0, 2], "<C-j>", { lines: ["def", "abc"], cursor: [1, 2] }],
  ["2 Ctrl-J moves the line two down", ABC, [1, 0], "2<C-j>", { lines: ["a", "c", "d", "b", "e"], cursor: [3, 0] }],
  ["a count past the end stops at the last line", ABC, [2, 0], "9<C-j>", { lines: ["a", "b", "d", "e", "c"], cursor: [4, 0] }],
  ["Ctrl-K on the first line changes nothing", ABC, [0, 0], "<C-k>", { lines: ABC, cursor: [0, 0] }],
  ["Ctrl-J on the last line changes nothing", ABC, [4, 0], "<C-j>", { lines: ABC, cursor: [4, 0] }],
  ["u undoes Ctrl-J", ABC, [1, 0], "<C-j>u", { lines: ABC }],
  ["d Ctrl-J changes nothing", ABC, [1, 0], "d<C-j>", { lines: ABC, mode: "normal" }],
  ["Visual Ctrl-J moves the selected lines and the selection", ABC, [1, 0], "Vj<C-j>", { lines: ["a", "d", "b", "c", "e"], selection: [2, 3], mode: "visual-line" }],
  ["Visual Ctrl-K twice moves them two up", ABC, [2, 0], "Vj<C-k><C-k>", { lines: ["c", "d", "a", "b", "e"], selection: [0, 1], mode: "visual-line" }],
  ["characterwise Visual Ctrl-J moves whole lines", ABC, [1, 0], "vj<C-j>", { lines: ["a", "d", "b", "c", "e"], selection: [2, 3], mode: "visual" }],
  ["Visual Ctrl-J then d deletes the moved lines", ABC, [1, 0], "Vj<C-j>d", { lines: ["a", "d", "e"] }],
  ["ci( on a closing paren after a nested pair", CALL, [1, 34], "ci(x<Esc>", { lines: withLine(CALL, 1, "    stack.append(x)") }],
  ["ci( before a closing paren after a nested pair", CALL, [1, 33], "ci(x<Esc>", { lines: withLine(CALL, 1, "    stack.append(x)") }],
  ["di( past more than ten parens", [NESTED], [0, 38], "di(", { lines: ["f()"] }],
  ["da( on a closing paren after a nested pair", CALL, [1, 34], "da(", { lines: withLine(CALL, 1, "    stack.append") }],
  ["ciq changes inside double quotes", ['    s = "hi there"'], [0, 12], "ciqyo<Esc>", { lines: ['    s = "yo"'], mode: "normal" }],
  ["diq deletes inside single quotes", ["x = 'abc'"], [0, 6], "diq", { lines: ["x = ''"] }],
  ["daq deletes a backtick string with its quotes", ["x = `a ${b}`"], [0, 5], "daq", { lines: ["x = "] }],
  ["yiq yanks inside the quotes", ['s = "hi there"'], [0, 6], "yiq", { register: ["hi there", false] }],
  ["diq before a string takes the next one", ['print("hi")'], [0, 0], "diq", { lines: ['print("")'] }],
  ["diq takes the innermost of nested quotes", NEST, [0, 10], "diq", { lines: ["q = \"a = '' + 1\""] }],
  ["d2iq takes the inner string with its quotes", NEST, [0, 10], "d2iq", { lines: ['q = "a =  + 1"'] }],
  ["an apostrophe before a string is not a quote", ['// it\'s "y"'], [0, 9], "diq", { lines: ['// it\'s ""'] }],
  ["an apostrophe inside a string is not a quote", ['"it\'s" + x'], [0, 2], "diq", { lines: ['"" + x'] }],
  ["an escaped quote does not end the string", ['s = "a\\"b"'], [0, 5], "diq", { lines: ['s = ""'] }],
  ["diq on a closing quote takes its string", ['"a" "b"'], [0, 2], "diq", { lines: ['"" "b"'] }],
  ["diq between strings takes the next one", ['"a" "b"'], [0, 3], "diq", { lines: ['"a" ""'] }],
  ["viq selects inside the quotes", NEST, [0, 10], "viqd", { lines: ["q = \"a = '' + 1\""] }],
  ["viq iq adds the quotes", NEST, [0, 10], "viqiqd", { lines: ['q = "a =  + 1"'] }],
  ["viq iq iq takes the enclosing string", NEST, [0, 10], "viqiqiqd", { lines: ['q = ""'] }],
  ["vaq aq takes the enclosing string with its quotes", NEST, [0, 10], "vaqaqd", { lines: ["q = "] }],
  ["Viq selects characterwise", ['s = "hi"'], [0, 5], "Viq", { mode: "visual", lastMode: "visual" }],
  ["dot repeats diq", ["a = 'x', b = 'y'"], [0, 5], "diq$.", { lines: ["a = '', b = ''"] }],
  ["u undoes diq", NEST, [0, 10], "diqu", { lines: NEST }],
  ["diq without quotes does nothing", ["x = 1"], [0, 0], "diqx", { lines: [" = 1"], mode: "normal" }],
  ["gcc comments the line and keeps the cursor", CODE, [1, 6], "gcc", { lines: withLine(CODE, 1, "    # a = 1"), cursor: [1, 6], mode: "normal" }],
  ["gcj comments two lines at the smaller indent", CODE, [0, 2], "gcj", { lines: lead("# ", CODE, 0, 1), cursor: [0, 2] }],
  ["gck goes to the start of the upper line", CODE, [3, 6], "gck", { lines: withLine(CODE, 3, "    # b = 2"), cursor: [2, 0] }],
  ["gc2j leaves a blank line blank", CODE, [1, 0], "gc2j", { lines: ["def f():", "    # a = 1", "", "    # b = 2", "x"] }],
  ["3gcc comments three lines", CODE, [0, 0], "3gcc", { lines: ["# def f():", "#     a = 1", "", "    b = 2", "x"] }],
  ["gcip comments the paragraph", CODE, [0, 0], "gcip", { lines: lead("# ", CODE, 0, 1) }],
  ["gcc twice restores the line", CODE, [1, 6], "gccgcc", { lines: CODE }],
  ["gcc uncomments without a space after the token", ["    #a = 1"], [0, 0], "gcc", { lines: ["    a = 1"] }],
  ["gcj uncomments when every line is commented", ["# a", "    # b"], [0, 0], "gcj", { lines: ["a", "    b"] }],
  ["gcj comments a mix of lines again", ["# a", "b"], [0, 0], "gcj", { lines: ["# # a", "# b"] }],
  ["gcj twice keeps mixed tab and space indents", ["\talpha()", "    beta()"], [0, 0], "gcjgcj", { lines: ["\talpha()", "    beta()"] }],
  ["dot repeats gcc", CODE, [0, 0], "gccj.", { lines: ["# def f():", "    # a = 1", "", "    b = 2", "x"] }],
  ["u undoes gcj", CODE, [0, 0], "gcju", { lines: CODE }],
  ["Visual gc comments the selected lines", CODE, [3, 4], "Vjgc", { lines: lead("# ", CODE, 3, 4), cursor: [3, 0], mode: "normal" }],
  ["characterwise Visual gc comments whole lines", CODE, [0, 2], "vjgc", { lines: lead("# ", CODE, 0, 1), cursor: [0, 2] }],
  ["g; goes to the last change", ABC, [0, 0], "Ax<Esc>3GAy<Esc>Gg;", { lines: ["ax", "b", "cy", "d", "e"], cursor: [2, 1], mode: "normal" }],
  ["g; again goes to the change before", ABC, [0, 0], "Ax<Esc>3GAy<Esc>Gg;g;", { cursor: [0, 1] }],
  ["g; at the oldest change stays", ABC, [0, 0], "Ax<Esc>3GAy<Esc>Gg;g;g;", { cursor: [0, 1] }],
  ["g, goes back to the newer change", ABC, [0, 0], "Ax<Esc>3GAy<Esc>Gg;g;g,", { cursor: [2, 1] }],
  ["g, right after a change does nothing", ABC, [0, 0], "Ax<Esc>3GAy<Esc>Gg,", { cursor: [4, 0] }],
  ["2g; skips a change", ABC, [0, 0], "Ax<Esc>3GAy<Esc>5GAz<Esc>gg2g;", { cursor: [2, 1] }],
  ["changes close together on one line keep one position", ABC, [0, 0], "Ax<Esc>0iw<Esc>Gg;g;", { lines: ["wax", "b", "c", "d", "e"], cursor: [0, 0] }],
  ["one Insert session over two lines keeps one position", ABC, [0, 0], "Ax<CR>y<Esc>Gg;g;", { cursor: [1, 0] }],
  ["dd is a change", ABC, [2, 0], "ddGg;", { lines: ["a", "b", "d", "e"], cursor: [2, 0] }],
  ["a position moves with lines added above it", ABC, [3, 0], "Ax<Esc>ggOn<Esc>Gg;g;", { lines: ["n", "a", "b", "c", "dx", "e"], cursor: [4, 1] }],
  ["backtick dot goes to the last change", ABC, [0, 0], "Ax<Esc>3GAy<Esc>G`.", { cursor: [2, 1] }],
  ["quote dot goes to the line of the last change", ["a", "  b", "c"], [0, 0], "jAy<Esc>G'.", { cursor: [1, 2] }],
  ["g; after a macro goes to the macro's last edit", ABC, [0, 0], "qqAx<Esc>jjq@qg;", { lines: ["ax", "b", "cx", "d", "e"], cursor: [2, 1] }],
  ["typing into an empty buffer is a change", [""], [0, 0], "ix<Esc>oy<Esc>g;g;", { lines: ["x", "y"], cursor: [0, 0] }],
  ["grn renames every whole-word match", RENAME, [2, 6], "grnsum<CR>", { lines: ["sum = 0", "for x in xs:", "    sum += x", "print(sum, subtotal)"], cursor: [2, 4], mode: "normal" }],
  ["grn keeps the cursor on the word as names before it change length", ["ab ab ab"], [0, 6], "grnxyz<CR>", { lines: ["xyz xyz xyz"], cursor: [0, 8] }],
  ["grn on a space renames the next word", ["  foo(bar)", "bar"], [0, 0], "grnbaz<CR>", { lines: ["  baz(bar)", "bar"] }],
  ["Esc in the grn prompt changes nothing", RENAME, [2, 6], "grnsum<Esc>", { lines: RENAME, mode: "normal" }],
  ["an empty grn name changes nothing", RENAME, [2, 6], "grn<BS><CR>", { lines: RENAME }],
  ["u undoes a rename in one step", RENAME, [2, 6], "grnsum<CR>u", { lines: RENAME }],
  ["g; with no change does nothing", ABC, [3, 0], "g;", { cursor: [3, 0], mode: "normal" }],
];

// Undo after Insert mode with completion, where the host undoes a typed insert as one step.
const UNDO_LINES = ["", "fresh_count", "fresh_total"];
const UNDO_SCENARIOS = [
  ["u undoes an insert with a completion", UNDO_LINES, [0, 0], "ifresh_<C-n><Esc>u", { lines: UNDO_LINES }],
  ["u undoes an insert with cycled completions", UNDO_LINES, [0, 0], "ifresh_<C-n><C-n><Esc>u", { lines: UNDO_LINES }],
  ["u undoes typing after a completion with it", UNDO_LINES, [0, 0], "ifresh_<C-n>!<Esc>u", { lines: UNDO_LINES }],
  ["Ctrl-R redoes the whole insert", UNDO_LINES, [0, 0], "ifresh_<C-n>!<Esc>u<C-r>", { lines: withLine(UNDO_LINES, 0, "fresh_count!") }],
];

// Run with and without the extension; results must be identical. [name, lines, cursor, keys]
const ONE = ["def f(a, b):", '    s = "hi there"', "    xs = [a, b]", "    return (a + b)", "", "y = f(1, 2)"];
const BUILTINS = [
  ["i", ONE, [5, 4], "iX<Esc>"],
  ["a", ONE, [5, 4], "aX<Esc>"],
  ["I", ONE, [1, 8], "IX<Esc>"],
  ["A", ONE, [1, 8], "AX<Esc>"],
  ["diw", ONE, [1, 10], "diw"],
  ["daw", ONE, [1, 10], "daw"],
  ["ciw", ONE, [5, 0], "ciwz<Esc>"],
  ["viw", ONE, [1, 10], "viw"],
  ["di(", ONE, [3, 14], "di("],
  ['di"', ONE, [1, 10], 'di"'],
  ["dip", ONE, [1, 4], "dip"],
  ["dap", ONE, [1, 4], "dap"],
  ["yip P", ONE, [5, 0], "yipP"],
  ["vipd", ONE, [2, 4], "vipd"],
  ["di then Esc then x", ONE, [1, 4], "di<Esc>x"],
  ["dd, >>, cc", ONE, [1, 4], "dd>>ccnew<Esc>"],
  ["yy", ONE, [1, 4], "yy"],
  ["Visual Y yanks lines", ONE, [1, 4], "vjY"],
  ["2D", ONE, [1, 4], "2D"],
];

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(PAGES, path.normalize(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(PAGES) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function openPage(browser, url, withExtension) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // Records writes instead of touching the machine's clipboard.
    const clipboard = navigator.clipboard ?? {};
    clipboard.writeText = async (text) => (window.clipboardText = text);
    if (!navigator.clipboard) Object.defineProperty(navigator, "clipboard", { value: clipboard });
  });
  if (withExtension) for (const file of SCRIPTS) await context.addInitScript({ path: file });
  const page = await context.newPage();
  // Monaco rejects pending work with "Canceled" when an editor is disposed.
  page.on("pageerror", (e) => e.message !== "Canceled: Canceled" && console.log("  page error:", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.cm && window.calls, null, { timeout: 60000 });
  return page;
}

// Hold Shift for shifted characters, as a real keyboard does. Ace's vim maps
// keys by keyCode and misreads an unshifted ">" after "." as another ".".
const KEYS = { "<Esc>": "Escape", "<C-n>": "Control+KeyN", "<C-p>": "Control+KeyP", "<C-r>": "Control+KeyR", "<C-j>": "Control+KeyJ", "<C-k>": "Control+KeyK", "<Left>": "ArrowLeft", "<CR>": "Enter", "<BS>": "Backspace", "<Right>": "ArrowRight", ">": "Shift+Period", "<": "Shift+Comma", "(": "Shift+Digit9", '"': "Shift+Quote" };
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") KEYS[c] = "Shift+Key" + c;

async function play(page, lines, cursor, keys) {
  // A null cursor keeps the buffer and cursor as they are.
  const [line, ch] = cursor ?? [];
  if (cursor) await page.evaluate(
    ({ text, line, ch }) => {
      window.testVim.handleKey(window.cm, "<Esc>");
      window.setText(text);
      window.cm.setCursor({ line, ch });
      window.cm.focus();
      window.lastMode = null;
      window.testVim.getRegisterController().unnamedRegister.setText("");
      window.clipboardText = null;
    },
    { text: lines.join("\n"), line, ch }
  );
  for (const key of keys.match(/<[A-Za-z-]+>|./g)) await page.keyboard.press(KEYS[key] || key);
  return page.evaluate(() => {
    const { cm } = window;
    const vim = cm.state.vim;
    const pos = cm.getCursor();
    const register = window.testVim.getRegisterController().unnamedRegister;
    return {
      lines: Array.from({ length: cm.lastLine() + 1 }, (_, i) => cm.getLine(i)),
      cursor: [pos.line, pos.ch],
      mode: vim.insertMode ? "insert" : vim.visualMode ? (vim.visualLine ? "visual-line" : "visual") : "normal",
      selection: vim.visualMode ? [vim.sel.anchor.line, vim.sel.head.line].sort((a, b) => a - b) : null,
      lastMode: window.lastMode,
      register: [register.toString(), !!register.linewise],
      clipboard: window.clipboardText,
    };
  });
}

// Every oracle case through the page's own vim.js key dispatcher.
function sweep(page) {
  return page.evaluate((oracle) => {
    const { cm, testVim: Vim } = window;
    document.activeElement.blur(); // with focus, CodeMirror 6 takes minutes instead of seconds here
    const keys = (s) => s.match(/<Esc>|./g).forEach((k) => Vim.handleKey(cm, k));
    const register = () => {
      const r = Vim.getRegisterController().unnamedRegister;
      return JSON.stringify([r.toString(), !!r.linewise]);
    };
    const fails = [];
    let checks = 0;
    for (const fx of oracle) {
      window.setText(fx.lines.join("\n"));
      for (const c of fx.cases) {
        for (const n of [1, 2, 3]) {
          // y{n}{obj} must yank what a linewise yank of the plugin's n-press range yanks.
          const [t, b] = c["vis" + n];
          keys(`<Esc>${t}GV${b}Gy`);
          const want = register();
          keys("<Esc>");
          cm.setCursor({ line: c.line - 1, ch: 0 });
          keys("y" + (n > 1 ? n : "") + c.obj);
          checks++;
          if (register() !== want) fails.push(`${fx.name}:${c.line} y${n}${c.obj}`);
          keys("<Esc>");
          cm.setCursor({ line: c.line - 1, ch: 0 });
          keys("v" + c.obj.repeat(n));
          const s = cm.state.vim.sel;
          const got = [s.anchor.line + 1, s.head.line + 1].sort((x, y) => x - y);
          checks++;
          if (got[0] !== t || got[1] !== b || !cm.state.vim.visualLine)
            fails.push(`${fx.name}:${c.line} v${c.obj.repeat(n)} got ${got.join("-")}`);
        }
      }
    }
    keys("<Esc>");
    return { checks, fails };
  }, oracle);
}

function check(results, name, ok, detail) {
  results.push({ name, ok });
  if (!ok) console.log(`  FAIL ${name}${detail ? ": " + detail : ""}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const installed = (page) => page.evaluate(() => window.calls);
const ONCE = { defineMotion: 5, defineAction: 3, defineOperator: 1, mapCommand: 20, map: 1 };

async function runConfig(browser, base, cfg) {
  const results = [];
  console.log(`\n== ${cfg.host}: ${cfg.page}`);
  const url = `${base}/${cfg.page}`;

  const plain = await openPage(browser, url, false);
  const before = [];
  for (const [, lines, cursor, keys] of BUILTINS) before.push(await play(plain, lines, cursor, keys));
  await plain.context().close();

  const page = await openPage(browser, url, true);
  await page.waitForTimeout(2500);
  const calls = await installed(page);
  check(results, cfg.found ? "features installed" : "host finds nothing", same(calls, cfg.found ? ONCE : { defineMotion: 0, defineAction: 0, defineOperator: 0, mapCommand: 0, map: 0 }), JSON.stringify(calls));

  if (cfg.found && cfg.page.startsWith("monaco")) {
    // Before the scenarios: text they type opens Monaco's own suggest widget.
    await play(page, ["fresh_", "fresh_count", "fresh_countdown"], [0, 0], "A<C-n>");
    await page.waitForTimeout(500);
    const popup = await page.locator(".suggest-widget.visible").count();
    check(results, "Ctrl-N opens no Monaco suggest widget", popup === 0, `${popup} visible`);
  }
  if (cfg.found) {
    for (const [name, lines, cursor, keys, expect] of cfg.keyUndo ? SCENARIOS : [...SCENARIOS, ...UNDO_SCENARIOS]) {
      const got = await play(page, lines, cursor, keys);
      const bad = Object.keys(expect).filter((k) => !same(got[k], expect[k]));
      check(results, `scenario: ${name}`, !bad.length, bad.map((k) => `${k}=${JSON.stringify(got[k])}`).join(" "));
    }
  }
  if (cfg.offsetDoc) {
    // A CodeMirror 5 document whose first line is 10, not 0.
    await page.evaluate(() => {
      window.testVim.handleKey(window.cm, "<Esc>");
      window.savedDoc = window.cm.swapDoc(CodeMirror.Doc("    a\n    b\ntail", null, 10));
      window.cm.setCursor({ line: 10, ch: 4 });
      window.cm.focus();
    });
    for (const key of "dii") await page.keyboard.press(key);
    const text = await page.evaluate(() => {
      const value = window.cm.getValue();
      window.cm.swapDoc(window.savedDoc);
      return value;
    });
    check(results, "dii in a document that starts at line 10", text === "tail", JSON.stringify(text));
    await page.evaluate(() => {
      window.savedDoc = window.cm.swapDoc(CodeMirror.Doc("total = 0\ntotal += subtotal", null, 10));
      window.cm.setCursor({ line: 11, ch: 0 });
      window.cm.focus();
    });
    for (const key of ["g", "r", "n", "s", "u", "m", "Enter"]) await page.keyboard.press(key);
    const renamed = await page.evaluate(() => {
      const result = { value: window.cm.getValue(), line: window.cm.getCursor().line };
      window.cm.swapDoc(window.savedDoc);
      return result;
    });
    check(results, "grn in a document that starts at line 10", same(renamed, { value: "sum = 0\nsum += subtotal", line: 11 }), JSON.stringify(renamed));
  }
  if (cfg.found && cfg.page.startsWith("monaco")) {
    // The token follows the model's language, with and without Monaco's own toggle.
    // Monaco loads a language's comment settings a moment after the model switches to it.
    await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "javascript"));
    await page.waitForTimeout(1000);
    let got = await play(page, ["a"], [0, 0], "gcc");
    check(results, "gcc in JavaScript uses //", same(got.lines, ["// a"]), JSON.stringify(got.lines));
    // JavaScript has Monaco's own rename, which renames the symbol and not a same-named parameter.
    const JS = ["let total = 1;", "function f(total) { return total; }", "total += 2;"];
    await play(page, JS, [0, 5], "grn");
    // Monaco's JavaScript service starts a few seconds after the language switch.
    const box = await page
      .waitForFunction(() => document.activeElement?.classList.contains("rename-input"), null, { timeout: 20000 })
      .then(() => true, () => false);
    check(results, "grn in JavaScript opens Monaco's rename box", box);
    for (const key of "sum") await page.keyboard.press(key);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    got = await page.evaluate(() => [0, 1, 2].map((i) => window.cm.getLine(i)));
    check(results, "grn in JavaScript runs Monaco's rename", same(got, ["let sum = 1;", JS[1], "sum += 2;"]), JSON.stringify(got));
    await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "python"));
    await page.waitForTimeout(1000);
    await page.evaluate(() => (window.cm.editor.getAction = () => null));
    got = await play(page, ["    a", "b"], [0, 0], "gcjgcc");
    await page.evaluate(() => delete window.cm.editor.getAction);
    check(results, "gc without Monaco's toggle uses the language's token", same(got.lines, ["    a", "# b"]), JSON.stringify(got.lines));
  }
  if (cfg.found) {
    // Monaco shows a relative number on each line, counted from the cursor; other hosts show none.
    await play(page, ABC, [2, 0], "<Esc>");
    await page.waitForTimeout(300);
    const rel = await page.evaluate(() =>
      [...document.querySelectorAll(".vim-overlay-rel")]
        .map((e) => [parseFloat(e.parentElement.style.top), [...e.classList].find((c) => /-\d+$/.test(c)).split("-").pop()])
        .sort((a, b) => a[0] - b[0])
        .map((x) => x[1])
        .join(",")
    );
    const want = cfg.page.startsWith("monaco") ? "2,1,0,1,2" : "";
    check(results, "relative line numbers", rel === want, JSON.stringify(rel));
  }
  if (cfg.found) {
    // The page empties the buffer: g; then reaches only changes made after it. Four g; stop at
    // the oldest new change, so g, goes to the line after it, not to a position from before.
    await play(page, ABC, [0, 0], "Ax<Esc>jjAy<Esc>");
    await page.evaluate(() => window.setText(""));
    const got = await play(page, [], null, "ia<Esc>ob<Esc>oc<Esc>g;g;g;g;g,");
    check(results, "the page emptying the buffer empties the change list", same(got.cursor, [1, 0]), JSON.stringify(got.cursor));
  }
  if (cfg.found) {
    // An error on the cursor's line, the way each editor keeps one; CodeMirror 6 offers none to read.
    await play(page, ["x = (", "y = 1"], [0, 1], "<Esc>");
    const kind = await page.evaluate(() => {
      const { cm } = window;
      if (cm.editor) {
        monaco.editor.setModelMarkers(cm.editor.getModel(), "test", [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6, message: "boom here", severity: 8 }]);
        return "monaco";
      }
      if (cm.ace) return cm.ace.session.setAnnotations([{ row: 0, column: 0, text: "boom here", type: "error" }]), "ace";
      if (cm.cm6) return "cm6";
      cm.setOption("lint", { getAnnotations: () => [{ from: CodeMirror.Pos(0, 0), to: CodeMirror.Pos(0, 5), message: "boom here", severity: "error" }], delay: 0 });
      return "cm5";
    });
    await page.waitForTimeout(600);
    for (const key of "gh") await page.keyboard.press(key);
    await page.waitForTimeout(1000);
    const shown = await page.evaluate(() => document.body.innerText);
    const want = { monaco: "boom here", ace: "error: boom here", cm5: "error: boom here", cm6: "No error on this line" }[kind];
    check(results, "gh shows the error at the cursor", shown.includes(want), `${kind}: ${JSON.stringify(want)} not shown`);
    await page.evaluate(() => {
      const { cm } = window;
      if (cm.editor) monaco.editor.setModelMarkers(cm.editor.getModel(), "test", []);
      else if (cm.ace) cm.ace.session.clearAnnotations();
      else if (!cm.cm6) cm.setOption("lint", false);
    });
    await page.keyboard.press("Escape");
  }
  if (cfg.found && cfg.host === "codemirror6") {
    await play(page, ["fresh_", "fresh_count"], [0, 0], "A");
    await page.evaluate(() => window.setReadOnly(true));
    await page.keyboard.press(KEYS["<C-n>"]);
    const line = await page.evaluate(() => window.cm.getLine(0));
    await page.evaluate(() => window.setReadOnly(false));
    check(results, "Ctrl-N leaves a read-only buffer alone", line === "fresh_", JSON.stringify(line));
  }
  for (const [i, [name, lines, cursor, keys]] of BUILTINS.entries()) {
    const got = await play(page, lines, cursor, keys);
    // Only the extension copies yanks to the clipboard.
    check(results, `built-in unchanged: ${name}`, same({ ...got, clipboard: null }, { ...before[i], clipboard: null }), `${JSON.stringify(got)} vs ${JSON.stringify(before[i])}`);
  }

  if (cfg.found) {
    await page.evaluate(() => window.remount());
    for (const file of SCRIPTS) await page.addScriptTag({ path: file });
    await page.waitForTimeout(2500);
    const after = await installed(page);
    check(results, "installed once after editor recreation and a second injection", same(after, ONCE), JSON.stringify(after));
    const got = await play(page, WITH_TAIL, [3, 8], "dii");
    check(results, "dii works on the recreated editor", same(got.lines, keep(WITH_TAIL, 0, 1, 2, 7, 8, 9)));

    const { checks, fails } = await sweep(page);
    fails.slice(0, 5).forEach((f) => console.log("  FAIL oracle " + f));
    check(results, `oracle sweep: ${checks - fails.length}/${checks} match Vim`, !fails.length);
  }
  await page.context().close();

  const passed = results.filter((r) => r.ok).length;
  const sweepLine = results.find((r) => r.name.startsWith("oracle"));
  console.log(`  ${passed}/${results.length} checks pass${sweepLine ? "; " + sweepLine.name : ""}`);
  return passed === results.length;
}

(async () => {
  const only = process.argv[2];
  const configs = only ? CONFIGS.filter((c) => c.host === only) : CONFIGS;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await browserType.launch();
  let allOk = true;
  try {
    for (const cfg of configs) allOk = (await runConfig(browser, base, cfg)) && allOk;
  } finally {
    await browser.close();
    server.close();
  }
  console.log(allOk ? "\nALL PASS" : "\nFAILURES");
  process.exit(allOk ? 0 : 1);
})();
