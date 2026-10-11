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
  { host: "webpack", page: "monaco-webpack.html?delay=1&runtimes=2", found: true },
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
const FRESH = ["fresh = 0", "fresh_", "fresh_count += 1", "x = fresh_total"];
const withLine = (lines, i, text) => lines.map((l, j) => (j === i ? text : l));

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
const KEYS = { "<Esc>": "Escape", "<C-n>": "Control+KeyN", "<C-p>": "Control+KeyP", "<C-r>": "Control+KeyR", "<Left>": "ArrowLeft", "<Right>": "ArrowRight", ">": "Shift+Period", "<": "Shift+Comma", "(": "Shift+Digit9", '"': "Shift+Quote" };
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") KEYS[c] = "Shift+Key" + c;

async function play(page, lines, [line, ch], keys) {
  await page.evaluate(
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
const ONCE = { defineMotion: 2, defineAction: 1, mapCommand: 7, map: 1 };

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
  check(results, cfg.found ? "features installed" : "host finds nothing", same(calls, cfg.found ? ONCE : { defineMotion: 0, defineAction: 0, mapCommand: 0, map: 0 }), JSON.stringify(calls));

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
