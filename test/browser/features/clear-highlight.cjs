"use strict";
const { ABC } = require("../buffers.cjs");

// Where each host draws vim.js's search highlight.
const MARK = { "monaco-vim": ".findMatch", webpack: ".findMatch", codemirror6: ".cm-searchMatch", codemirror5: ".cm-searching", ace: ".ace_highlight-marker" };
const LINES = ["total = 0", "for x in nums:", "    total += x", "print(total)"];

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["C-l changes nothing in the buffer", ABC, [2, 0], "<C-l>", { lines: ABC, cursor: [2, 0], mode: "normal" }],
];

// Highlighted matches on screen, and whether vim.js still holds a highlight.
// The ": register holds the last ex command, which @: repeats.
const shown = (page, mark) =>
  page.evaluate((mark) => ({
    marks: document.querySelectorAll(mark).length,
    overlay: !!window.cm.state.vim.searchState_?.getOverlay(),
    lastEx: window.testVim.getRegisterController().getRegister(":").toString(),
  }), mark);

async function after({ page, cfg, check, play }) {
  const mark = MARK[cfg.host];
  const step = async (keys) => {
    const got = await play(LINES, null, keys);
    await page.waitForTimeout(300); // vim.js draws a highlight 50 ms after the search
    return { ...(await shown(page, mark)), cursor: got.cursor, lines: got.lines, mode: got.mode };
  };
  await play(LINES, [0, 0], "<Esc>");
  await step(":1<CR>");
  const on = await step("/total<CR>");
  check("a search highlights its matches", on.marks > 0 && on.overlay && String(on.cursor) === "2,4", JSON.stringify(on));

  // C-l takes the highlight away and leaves the cursor, the buffer, the mode and the last ex
  // command as they are.
  const off = await step("<C-l>");
  check("C-l clears the search highlight", off.marks === 0 && !off.overlay && String(off.cursor) === "2,4" && off.mode === "normal" && JSON.stringify(off.lines) === JSON.stringify(LINES) && off.lastEx === "1",
    JSON.stringify(off));

  // The search stays: n goes to the next match and shows the highlight again.
  const next = await step("n");
  check("n after C-l finds the next match and highlights again", next.marks > 0 && next.overlay && String(next.cursor) === "3,6", JSON.stringify(next));

  // vim.js draws a highlight 50 ms after the key. Keys in one go, as a macro replays them: C-l
  // right after n still clears, and n right after C-l still highlights.
  const burst = async (keys) => {
    await page.evaluate((keys) => keys.forEach((k) => window.testVim.handleKey(window.cm, k)), keys);
    await page.waitForTimeout(300);
    return shown(page, mark);
  };
  await step("<C-l>");
  const late = await burst(["n", "<C-l>"]);
  check("C-l right after n clears the highlight", late.marks === 0 && !late.overlay && late.lastEx === "1", JSON.stringify(late));
  const again = await burst(["<C-l>", "n"]);
  check("n right after C-l highlights again", again.marks > 0 && again.overlay, JSON.stringify(again));
  // Visual mode started right after C-l stays on, and the highlight still goes.
  await step("<C-l>");
  const visual = await burst(["n", "<C-l>", "v"]);
  const mode = await page.evaluate(() => !!window.cm.state.vim.visualMode);
  check("v right after C-l keeps Visual mode and the clear", visual.marks === 0 && !visual.overlay && mode, JSON.stringify({ ...visual, mode }));
  await play(LINES, null, "<Esc>");
  await step("<C-l>");
}

module.exports = { scenarios, after };
