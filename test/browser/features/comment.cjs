"use strict";
const { same } = require("../harness.cjs");
const { withLine, lead } = require("../buffers.cjs");

const CODE = ["def f():", "    a = 1", "", "    b = 2", "x"];

// [name, lines, cursor, keys, expect]
const scenarios = [
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
];

async function after({ page, cfg, check, play }) {
  if (!cfg.page.startsWith("monaco")) return;
  // The token follows the model's language, with and without Monaco's own toggle.
  // Monaco loads a language's comment settings a moment after the model switches to it.
  await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "javascript"));
  await page.waitForTimeout(1000);
  let got = await play(["a"], [0, 0], "gcc");
  check("gcc in JavaScript uses //", same(got.lines, ["// a"]), JSON.stringify(got.lines));
  await page.evaluate(() => monaco.editor.setModelLanguage(window.cm.editor.getModel(), "python"));
  await page.waitForTimeout(1000);
  await page.evaluate(() => (window.cm.editor.getAction = () => null));
  got = await play(["    a", "b"], [0, 0], "gcjgcc");
  await page.evaluate(() => delete window.cm.editor.getAction);
  check("gc without Monaco's toggle uses the language's token", same(got.lines, ["    a", "# b"]), JSON.stringify(got.lines));
}

module.exports = { scenarios, after };
