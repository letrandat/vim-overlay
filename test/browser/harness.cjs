// Drives a host page in a real browser: serves test/pages, opens a page with or
// without the built extension's content scripts, types keys and reads the editor back.
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");

// The extension as `npm run build` writes it.
const DIST = path.join(__dirname, "..", "..", "dist");
const PAGES = path.join(__dirname, "..", "pages");
if (!fs.existsSync(path.join(DIST, "manifest.json"))) throw new Error("no dist/manifest.json: run `npm run build` first");
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.json"), "utf8")).content_scripts[0].js.map(
  (f) => path.join(DIST, f)
);
const oracle = require("../oracle.json");

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(PAGES, path.normalize(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(PAGES) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
    res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// Records writes instead of touching the machine's clipboard.
function stubClipboard() {
  const clipboard = navigator.clipboard ?? {};
  clipboard.writeText = async (text) => (window.clipboardText = text);
  if (!navigator.clipboard) Object.defineProperty(navigator, "clipboard", { value: clipboard });
}

async function openPage(browser, url, withExtension) {
  const context = await browser.newContext();
  // One init script, since Playwright does not promise to run several in the order they were added.
  const scripts = withExtension ? SCRIPTS.map((file) => fs.readFileSync(file, "utf8")) : [];
  await context.addInitScript({ content: [`(${stubClipboard})();`, ...scripts].join("\n;\n") });
  const page = await context.newPage();
  // Monaco rejects pending work with "Canceled" when an editor is disposed.
  page.on("pageerror", (e) => e.message !== "Canceled: Canceled" && console.log("  page error:", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.cm && window.calls, null, { timeout: 60000 });
  return page;
}

// Hold Shift for shifted characters, as a real keyboard does. Ace's vim maps
// keys by keyCode and misreads an unshifted ">" after "." as another ".".
const KEYS = { "<Esc>": "Escape", "<C-n>": "Control+KeyN", "<C-p>": "Control+KeyP", "<C-r>": "Control+KeyR", "<C-j>": "Control+KeyJ", "<C-k>": "Control+KeyK", "<C-a>": "Control+KeyA", "<C-x>": "Control+KeyX", "<S-A-o>": "Alt+Shift+KeyO", "<Left>": "ArrowLeft", "<CR>": "Enter", "<BS>": "Backspace", "<Right>": "ArrowRight", ">": "Shift+Period", "<": "Shift+Comma", "(": "Shift+Digit9", '"': "Shift+Quote" };
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = { SCRIPTS, KEYS, serve, openPage, play, sweep, same };
