"use strict";
const { same } = require("../harness.cjs");

const RENAME = ["total = 0", "for x in xs:", "    total += x", "print(total, subtotal)"];

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["grn renames every whole-word match", RENAME, [2, 6], "grnsum<CR>", { lines: ["sum = 0", "for x in xs:", "    sum += x", "print(sum, subtotal)"], cursor: [2, 4], mode: "normal" }],
  ["grn keeps the cursor on the word as names before it change length", ["ab ab ab"], [0, 6], "grnxyz<CR>", { lines: ["xyz xyz xyz"], cursor: [0, 8] }],
  ["grn on a space renames the next word", ["  foo(bar)", "bar"], [0, 0], "grnbaz<CR>", { lines: ["  baz(bar)", "bar"] }],
  ["Esc in the grn prompt changes nothing", RENAME, [2, 6], "grnsum<Esc>", { lines: RENAME, mode: "normal" }],
  ["an empty grn name changes nothing", RENAME, [2, 6], "grn<BS><CR>", { lines: RENAME }],
  ["u undoes a rename in one step", RENAME, [2, 6], "grnsum<CR>u", { lines: RENAME }],
];

async function after({ page, cfg, check, play }) {
  if (cfg.offsetDoc) {
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
    check("grn in a document that starts at line 10", same(renamed, { value: "sum = 0\nsum += subtotal", line: 11 }), JSON.stringify(renamed));
  }
  if (cfg.page.startsWith("monaco")) {
    // JavaScript has Monaco's own rename, which renames the symbol and not a same-named parameter.
    await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "javascript"));
    await page.waitForTimeout(1000);
    const JS = ["let total = 1;", "function f(total) { return total; }", "total += 2;"];
    await play(JS, [0, 5], "grn");
    // Monaco's JavaScript service starts a few seconds after the language switch.
    const box = await page
      .waitForFunction(() => document.activeElement?.classList.contains("rename-input"), null, { timeout: 20000 })
      .then(() => true, () => false);
    check("grn in JavaScript opens Monaco's rename box", box);
    for (const key of "sum") await page.keyboard.press(key);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    const got = await page.evaluate(() => [0, 1, 2].map((i) => window.cm.getLine(i)));
    check("grn in JavaScript runs Monaco's rename", same(got, ["let sum = 1;", JS[1], "sum += 2;"]), JSON.stringify(got));
    await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "python"));
    await page.waitForTimeout(1000);
  }
}

module.exports = { scenarios, after };
