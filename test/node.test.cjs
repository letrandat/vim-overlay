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
  const Vim = { motions: {}, commands: [] };
  Vim.defineMotion = (name, fn) => (Vim.motions[name] = fn);
  Vim.mapCommand = (keys, type, name, args) => Vim.commands.push({ keys, type, name, args });
  return Vim;
}

function load({ before = () => {}, only } = {}) {
  const timers = [];
  const warnings = [];
  const sandbox = {
    document: { querySelectorAll: () => [] },
    console: { ...console, warn: (...a) => warnings.push(a.join(" ")) },
    setInterval: (fn) => timers.push(fn),
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
      w.vimOverlay.hosts.push(
        { name: "broken-host", find: () => { throw new Error("boom"); } },
        { name: "fake", find: () => vims }
      );
      w.vimOverlay.features.unshift({ name: "broken-feature", install() { throw new Error("bad"); } });
      w.vimOverlay.features.push({ name: "probe", install: (Vim) => installs.push(Vim) });
    },
  });
  const { sandbox, tick, warnings } = run;
  assert.strictEqual(installs.length, 0, "nothing to install before a Vim object appears");
  const a = stubVim();
  vims.push(a, a);
  tick();
  tick();
  assert.deepStrictEqual(installs, [a], "one install per Vim object across duplicates and polls");
  assert.deepStrictEqual(a.commands.map((c) => c.keys), ["ii", "ai", "iI", "aI"], "a throwing feature does not stop the others");
  assert.ok(warnings.some((w) => w.includes("broken-feature")), "warning names the feature");
  assert.ok(warnings.some((w) => w.includes("broken-host")), "warning names the host");
  const b = stubVim();
  vims.push(b);
  tick();
  assert.deepStrictEqual(installs, [a, b], "a new Vim object gets every feature");
  for (const [file, code] of scripts) vm.runInContext(code, sandbox, { filename: file });
  tick();
  assert.strictEqual(run.timers.length, 1, "a second copy of the scripts does not poll again");
  assert.strictEqual(a.commands.length, 4, "a second copy of the scripts does not install again");
  console.log("ok  main.js: once per Vim object, failures isolated and named, second copy is a no-op");
}

const Vim = stubVim();
{
  const { sandbox } = load({ only: ["src/registry.js", "src/features/indent-object.js"] });
  sandbox.vimOverlay.features[0].install(Vim);
}
const motion = Vim.motions[Vim.commands[0].name];
const argsFor = (obj) => ({ ...Vim.commands.find((c) => c.keys === obj).args });
const fmt = (r) => (r ? `${r[0]}-${r[1]}` : "none");
let checks = 0, failures = 0;
function check(label, got, want) {
  checks++;
  if (fmt(got) !== fmt(want) && ++failures <= 10) console.log(`FAIL ${label}: got ${fmt(got)}, want ${fmt(want)}`);
}

for (const fx of oracle) {
  const signals = [];
  class Adapter {
    static signal(cm, type, e) {
      signals.push([type, e.subMode]);
    }
    lastLine() { return fx.lines.length - 1; }
    getLine(i) { return fx.lines[i]; }
    getOption(name) { return name === "tabSize" ? 4 : undefined; }
  }
  const cm = new Adapter();
  for (const c of fx.cases) {
    const line = c.line - 1;
    const label = (k) => `${fx.name} line ${c.line} ${k}`;
    // Operator-pending with count n: expect the plugin's n-press Visual result.
    for (const n of [1, 2, 3]) {
      const args = { ...argsFor(c.obj), repeat: n };
      const [a, h] = motion(cm, { line, ch: 0 }, args, { visualMode: false });
      assert.ok(args.linewise, "operator range is linewise");
      check(label(`y${n}${c.obj}`), [a.line + 1, h.line + 1], c["vis" + n]);
    }
    const vim = { visualMode: true, visualLine: false, sel: { anchor: { line, ch: 0 }, head: { line, ch: 0 } } };
    signals.length = 0;
    for (const k of [1, 2, 3]) {
      const [anchor, head] = motion(cm, vim.sel.head, { ...argsFor(c.obj), repeat: 1 }, vim);
      vim.sel = { anchor, head };
      check(label(`v${c.obj.repeat(k)}`), [anchor.line + 1, head.line + 1], c["vis" + k]);
    }
    assert.ok(vim.visualLine, "Visual mode switches to linewise");
    assert.deepStrictEqual(signals, [["vim-mode-change", "linewise"]], "mode change signalled once");
  }
}
const cases = oracle.reduce((s, f) => s + f.cases.length, 0);
console.log(
  `${failures ? "FAIL" : "ok "} indent-object vs Vim oracle: ${checks - failures}/${checks} checks pass ` +
    `(${oracle.length} buffers, ${cases} cursor/object cases)`
);
process.exit(failures ? 1 : 0);
