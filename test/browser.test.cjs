#!/usr/bin/env node
// Each host page loads its editor from jsDelivr. The built manifest's content
// scripts are injected at document start in manifest order, as the browser
// does with "world": "MAIN". Keys are typed as real key presses. Run
// `npm run build` first; `npm test` does.
//
//   node test/browser.test.cjs                 every host
//   node test/browser.test.cjs codemirror5     one host
//   BROWSER=chromium node test/browser.test.cjs
"use strict";
const { [process.env.BROWSER || "webkit"]: browserType } = require("playwright");
const { SCRIPTS, serve, openPage, play, sweep, same } = require("./browser/harness.cjs");
const { WITH_TAIL, keep } = require("./browser/buffers.cjs");
const BUILTINS = require("./browser/builtins.cjs");

// Each feature's scenarios, and checks to run before or after them: browser/features/<name>.cjs.
const FEATURES = [
  "indent-object",
  "entire-object",
  "yank-to-eol",
  "clipboard",
  "yank-flash",
  "complete",
  "move-lines",
  "bracket-objects",
  "quote-object",
  "comment",
  "change-list",
  "relative-numbers",
  "rename",
  "hover",
  "toggle-boolean",
  "organize-imports",
].map((name) => require(`./browser/features/${name}.cjs`));

// found: whether the host is expected to find the page's Vim object.
// keyUndo: the host undoes typed text one key at a time, so undoScenarios do not apply.
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
  { host: "webpack", page: "monaco-webpack.html?rspack=1", found: true },
];

const installed = (page) => page.evaluate(() => window.calls);
const ONCE = { defineMotion: 5, defineAction: 5, defineOperator: 1, mapCommand: 23, map: 1 };

async function runConfig(browser, base, cfg) {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    if (!ok) console.log(`  FAIL ${name}${detail ? ": " + detail : ""}`);
  };
  console.log(`\n== ${cfg.host}: ${cfg.page}`);
  const url = `${base}/${cfg.page}`;

  const plain = await openPage(browser, url, false);
  const before = [];
  for (const [, lines, cursor, keys] of BUILTINS) before.push(await play(plain, lines, cursor, keys));
  await plain.context().close();

  const page = await openPage(browser, url, true);
  await page.waitForTimeout(2500);
  const calls = await installed(page);
  check(cfg.found ? "features installed" : "host finds nothing", same(calls, cfg.found ? ONCE : { defineMotion: 0, defineAction: 0, defineOperator: 0, mapCommand: 0, map: 0 }), JSON.stringify(calls));

  if (cfg.found) {
    const t = { page, cfg, check, play: (lines, cursor, keys) => play(page, lines, cursor, keys) };
    for (const feature of FEATURES) await feature.before?.(t);
    for (const feature of FEATURES) {
      for (const [name, lines, cursor, keys, expect] of [...(feature.scenarios ?? []), ...(cfg.keyUndo ? [] : feature.undoScenarios ?? [])]) {
        const got = await play(page, lines, cursor, keys);
        const bad = Object.keys(expect).filter((k) => !same(got[k], expect[k]));
        check(`scenario: ${name}`, !bad.length, bad.map((k) => `${k}=${JSON.stringify(got[k])}`).join(" "));
      }
    }
    for (const feature of FEATURES) await feature.after?.(t);
  }
  for (const [i, [name, lines, cursor, keys]] of BUILTINS.entries()) {
    const got = await play(page, lines, cursor, keys);
    // Only the extension copies yanks to the clipboard.
    check(`built-in unchanged: ${name}`, same({ ...got, clipboard: null }, { ...before[i], clipboard: null }), `${JSON.stringify(got)} vs ${JSON.stringify(before[i])}`);
  }

  if (cfg.found) {
    await page.evaluate(() => window.remount());
    for (const file of SCRIPTS) await page.addScriptTag({ path: file });
    await page.waitForTimeout(2500);
    const after = await installed(page);
    check("installed once after editor recreation and a second injection", same(after, ONCE), JSON.stringify(after));
    const got = await play(page, WITH_TAIL, [3, 8], "dii");
    check("dii works on the recreated editor", same(got.lines, keep(WITH_TAIL, 0, 1, 2, 7, 8, 9)));

    const { checks, fails } = await sweep(page);
    fails.slice(0, 5).forEach((f) => console.log("  FAIL oracle " + f));
    check(`oracle sweep: ${checks - fails.length}/${checks} match Vim`, !fails.length);
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
