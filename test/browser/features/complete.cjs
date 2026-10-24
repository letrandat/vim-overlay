"use strict";
const { KEYS } = require("../harness.cjs");
const { withLine } = require("../buffers.cjs");

const FRESH = ["fresh = 0", "fresh_", "fresh_count += 1", "x = fresh_total"];

// [name, lines, cursor, keys, expect]
const scenarios = [
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
const undoScenarios = [
  ["u undoes an insert with a completion", UNDO_LINES, [0, 0], "ifresh_<C-n><Esc>u", { lines: UNDO_LINES }],
  ["u undoes an insert with cycled completions", UNDO_LINES, [0, 0], "ifresh_<C-n><C-n><Esc>u", { lines: UNDO_LINES }],
  ["u undoes typing after a completion with it", UNDO_LINES, [0, 0], "ifresh_<C-n>!<Esc>u", { lines: UNDO_LINES }],
  ["Ctrl-R redoes the whole insert", UNDO_LINES, [0, 0], "ifresh_<C-n>!<Esc>u<C-r>", { lines: withLine(UNDO_LINES, 0, "fresh_count!") }],
];

async function before({ page, cfg, check, play }) {
  if (!cfg.page.startsWith("monaco")) return;
  // Before the scenarios: text they type opens Monaco's own suggest widget.
  await play(["fresh_", "fresh_count", "fresh_countdown"], [0, 0], "A<C-n>");
  await page.waitForTimeout(500);
  const popup = await page.locator(".suggest-widget.visible").count();
  check("Ctrl-N opens no Monaco suggest widget", popup === 0, `${popup} visible`);
}

async function after({ page, cfg, check, play }) {
  if (cfg.host !== "codemirror6") return;
  await play(["fresh_", "fresh_count"], [0, 0], "A");
  await page.evaluate(() => window.setReadOnly(true));
  await page.keyboard.press(KEYS["<C-n>"]);
  const line = await page.evaluate(() => window.cm.getLine(0));
  await page.evaluate(() => window.setReadOnly(false));
  check("Ctrl-N leaves a read-only buffer alone", line === "fresh_", JSON.stringify(line));
}

module.exports = { scenarios, undoScenarios, before, after };
