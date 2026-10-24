#!/usr/bin/env node
// No browser. Loads the manifest's scripts into a vm sandbox with stub hosts and
// a stub Vim API, checks main.js, then drives the indent-object motion through
// every case in oracle.json (recorded from the real plugin in Vim).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts[0].js.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]);
const oracle = JSON.parse(fs.readFileSync(path.join(__dirname, "oracle.json"), "utf8"));

function stubVim() {
  const Vim = { motions: {}, actions: {}, operators: {}, commands: [], maps: [], defines: 0 };
  const controller = Object.create({ pushText() {} });
  Vim.defineMotion = (name, fn) => {
    Vim.defines++;
    Vim.motions[name] = fn;
  };
  Vim.mapCommand = (keys, type, name, args) => Vim.commands.push({ keys, type, name, args });
  Vim.map = (lhs, rhs, ctx) => Vim.maps.push([lhs, rhs, ctx]);
  Vim.defineAction = (name, fn) => (Vim.actions[name] = fn);
  Vim.defineOperator = (name, fn) => (Vim.operators[name] = fn);
  Vim.getRegisterController = () => controller;
  return Vim;
}

function load({ before = () => {}, only } = {}) {
  const timers = [];
  const warnings = [];
  const sandbox = {
    document: { querySelector: () => null, querySelectorAll: () => [] },
    console: { ...console, warn: (...a) => warnings.push(a.join(" ")) },
    setInterval: (fn) => timers.push(fn),
    addEventListener: () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const [file, code] of scripts) {
    if (only && !only.includes(file)) continue;
    if (file === "src/main.js") before(sandbox);
    vm.runInContext(code, sandbox, { filename: file });
  }
  return { sandbox, tick: () => timers.forEach((fn) => fn()), timers, warnings };
}

{
  const vims = [];
  const installs = [];
  const run = load({
    before(w) {
      w.vimOverlay.hosts["broken-host"] = () => { throw new Error("boom"); };
      w.vimOverlay.hosts.fake = () => vims;
      w.vimOverlay.features = {
        "broken-feature": () => { throw new Error("bad"); },
        ...w.vimOverlay.features,
        probe: (Vim) => installs.push(Vim),
      };
    },
  });
  const { sandbox, tick, warnings } = run;
  assert.strictEqual(installs.length, 0, "nothing to install before a Vim object appears");
  const a = stubVim();
  vims.push(a, a);
  tick();
  tick();
  assert.deepStrictEqual(installs, [a], "one install per Vim object across duplicates and polls");
  assert.deepStrictEqual(a.commands.map((c) => c.keys), ["ii", "ai", "iI", "aI", "ae", "<C-n>", "<C-p>", "<C-j>", "<C-k>", "<C-j>", "<C-k>", "iq", "aq", "gc", "g;", "g,", "`.", "'.", "grn", "gh"], "a throwing feature does not stop the others");
  assert.deepStrictEqual(a.maps, [["Y", "y$", "normal"]], "Y maps to y$ in Normal mode");
  assert.ok(warnings.some((w) => w.includes("broken-feature")), "warning names the feature");
  assert.ok(warnings.some((w) => w.includes("broken-host")), "warning names the host");
  const b = stubVim();
  vims.push(b);
  tick();
  assert.deepStrictEqual(installs, [a, b], "a new Vim object gets every feature");
  for (const [file, code] of scripts) vm.runInContext(code, sandbox, { filename: file });
  tick();
  assert.strictEqual(run.timers.length, 1, "a second copy of the scripts does not poll again");
  assert.deepStrictEqual([a.commands.length, a.maps.length], [20, 1], "a second copy of the scripts does not install again");
  assert.strictEqual(Object.keys(sandbox.vimOverlay.hosts).length, 7, "a second copy of the scripts adds no hosts");
  const c = stubVim();
  vims.push(c);
  tick();
  assert.deepStrictEqual([c.defines, c.commands.length], [5, 20], "a Vim object found after a second copy installs once");
  console.log("ok  main.js: once per Vim object, failures isolated and named, second copy is a no-op");
}

{
  // The webpack host with webpack 5's runtime finds Vim in a module the page has run, and runs no
  // page code for it: not a module the page has not run, nor a re-export's or a global's getter.
  // A Proxy export whose ownKeys trap throws does not stop it, nor does a page global that shares
  // the name of the module variable holding Vim.
  const { sandbox, warnings } = load({ only: ["src/registry.js", "src/hosts/webpack.js"] });
  sandbox.document.querySelector = () => ({}); // an editor is on the page
  sandbox.self = sandbox;
  sandbox.ran = [];
  vm.runInContext(
    `const modules = {}, cache = {}, installed = {};
    function require(id) {
      const cached = cache[id];
      if (cached !== undefined) return cached.exports;
      const module = (cache[id] = { id, loaded: false, exports: {} });
      modules[id].call(module.exports, module, module.exports, require);
      module.loaded = true;
      return module.exports;
    }
    require.m = modules;
    function callback(parentPush, [chunkIds, more, runtime]) {
      if (chunkIds.some((id) => installed[id] !== 0)) {
        Object.assign(modules, more);
        if (runtime) runtime(require);
      }
      if (parentPush) parentPush([chunkIds, more, runtime]);
      for (const id of chunkIds) installed[id] = 0;
    }
    const chunks = (self.webpackChunktest = []);
    chunks.push = callback.bind(null, chunks.push.bind(chunks));
    window.pageRequire = require;
    Object.defineProperty(globalThis, "optional", { get() { ran.push("global getter"); } });
    globalThis.$ = "a page global with the name of a minified module variable";
    Object.defineProperty(Object.prototype, "protoGetter", { configurable: true, get() { ran.push("prototype getter"); } });
    chunks.push([["main"], {
      proxy(module) {
        module.exports = new Proxy({}, { ownKeys() { throw new Error("trap"); } });
        const unused = { defineMotion() {} };
      },
      vim(module, exports, require) {
        ran.push("vim");
        const dep = require("dep");
        const $ = { defineMotion() {}, mapCommand() {} };
        Object.defineProperty(exports, "a", { enumerable: true, get: () => $ });
        Object.defineProperty(exports, "b", { enumerable: true, get: () => dep.value });
        Object.defineProperty(exports, "c", { enumerable: true, get: () => optional });
        Object.defineProperty(exports, "d", { enumerable: true, get: () => pending });
        Object.defineProperty(exports, "e", { enumerable: true, get: () => protoGetter });
        return;
        let pending; // read before initialization: the getter throws
      },
      dep(module, exports) {
        ran.push("dep");
        Object.defineProperty(exports, "value", { enumerable: true, get() { ran.push("dep getter"); } });
      },
      later(module, exports) {
        ran.push("later");
        exports.Vim = { defineMotion() {}, mapCommand() {} };
        exports.initVimMode = () => ran.push(["later initVimMode", "vim-keypress", "vim-command-done"]);
      },
      init(module, exports) {
        ran.push("init");
        const Vim = (window.initVim = { defineMotion() {}, mapCommand() {} });
        class Adapter { dispose() { ran.push("dispose"); throw new Error("dispose"); } on() {} }
        Adapter.Vim = Vim;
        const i = (editor) => {
          ran.push("initVimMode");
          editor.onKeyDown(() => {}).dispose();
          editor.createContextKey("insertMode", true).set(false);
          const adapter = editor.getConfiguration().fontInfo.typicalFullwidthCharacterWidth + 1 && new Adapter();
          adapter.on("vim-keypress", () => {});
          adapter.on("vim-command-done", () => {});
          return adapter;
        };
        // A shortened export name, and a function named initVimMode that is not monaco-vim's.
        Object.defineProperty(exports, "P", { enumerable: true, get: () => i });
        exports.initVimMode = () => ran.push("not monaco-vim");
      },
      broken(module, exports) {
        const unused = { defineMotion() {} };
        exports.initVimMode = () => {
          ran.push("broken initVimMode");
          throw new Error(["vim-keypress", "vim-command-done"].join());
        };
      },
    }]);`,
    sandbox
  );
  const host = sandbox.vimOverlay.hosts.webpack;
  host();
  assert.deepStrictEqual(sandbox.ran, [], "runs no module the page has not run");
  sandbox.pageRequire("proxy");
  const vimExports = sandbox.pageRequire("vim");
  let found = [host(), host()][1];
  assert.deepStrictEqual(sandbox.ran, ["vim", "dep"], "calls no re-export getter, global getter or unrun module");
  assert.ok(found.length === 1 && found[0] === vimExports.a, "finds Vim under a shortened export name");
  sandbox.pageRequire("later");
  found = host();
  assert.ok(found.length === 2 && found[1] === sandbox.pageRequire("later").Vim, "finds a module once the page runs it");
  sandbox.pageRequire("init");
  sandbox.pageRequire("broken");
  found = [host(), host()][1];
  assert.ok(warnings.length === 1 && warnings[0].startsWith("[vim-overlay] initVimMode on a stub editor failed:"), "names a failing initVimMode once");
  assert.deepStrictEqual(
    sandbox.ran.slice(2),
    ["later", "init", "initVimMode", "dispose", "broken initVimMode"],
    "calls monaco-vim's initVimMode once under any export name, only where no Vim is exported, and disposes the adapter"
  );
  assert.ok(found.length === 3 && found[2] === sandbox.initVim, "finds Vim on the class of the adapter, even when dispose throws");
  console.log("ok  webpack host: finds Vim in modules the page ran; runs no module, re-export or global getter; falls back to initVimMode");
}

const Vim = stubVim();
{
  const { sandbox } = load({ only: ["src/registry.js", "src/features/indent-object.js"] });
  sandbox.vimOverlay.features["indent-object"](Vim);
}
const motion = Vim.motions[Vim.commands[0].name];
const argsFor = (obj) => ({ ...Vim.commands.find((c) => c.keys === obj).args });
const fmt = (r) => (r ? `${r[0]}-${r[1]}` : "none");
let checks = 0, failures = 0;
function check(label, got, want) {
  checks++;
  if (fmt(got) !== fmt(want) && ++failures <= 10) console.log(`FAIL ${label}: got ${fmt(got)}, want ${fmt(want)}`);
}

// first: the document's first line number. A CodeMirror 5 document can start past 0.
for (const first of [0, 7])
for (const fx of oracle) {
  const signals = [];
  class Adapter {
    static signal(cm, type, e) {
      signals.push([type, e.subMode]);
    }
    firstLine() { return first; }
    lastLine() { return first + fx.lines.length - 1; }
    getLine(i) { return fx.lines[i - first]; }
    getOption(name) { return name === "tabSize" ? 4 : undefined; }
  }
  const cm = new Adapter();
  for (const c of fx.cases) {
    const line = first + c.line - 1;
    const label = (k) => `${fx.name} first line ${first}, line ${c.line} ${k}`;
    // Operator-pending with count n: expect the plugin's n-press Visual result.
    for (const n of [1, 2, 3]) {
      const args = { ...argsFor(c.obj), repeat: n };
      const [a, h] = motion(cm, { line, ch: 0 }, args, { visualMode: false });
      assert.ok(args.linewise, "operator range is linewise");
      check(label(`y${n}${c.obj}`), [a.line - first + 1, h.line - first + 1], c["vis" + n]);
    }
    const vim = { visualMode: true, visualLine: false, sel: { anchor: { line, ch: 0 }, head: { line, ch: 0 } } };
    signals.length = 0;
    for (const k of [1, 2, 3]) {
      const [anchor, head] = motion(cm, vim.sel.head, { ...argsFor(c.obj), repeat: 1 }, vim);
      vim.sel = { anchor, head };
      check(label(`v${c.obj.repeat(k)}`), [anchor.line - first + 1, head.line - first + 1], c["vis" + k]);
    }
    assert.ok(vim.visualLine, "Visual mode switches to linewise");
    assert.deepStrictEqual(signals, [["vim-mode-change", "linewise"]], "mode change signalled once");
  }
}
const cases = oracle.reduce((s, f) => s + f.cases.length, 0);
console.log(
  `${failures ? "FAIL" : "ok "} indent-object vs Vim oracle: ${checks - failures}/${checks} checks pass ` +
    `(${oracle.length} buffers, ${cases} cursor/object cases, documents starting at line 0 and 7)`
);
process.exit(failures ? 1 : 0);
