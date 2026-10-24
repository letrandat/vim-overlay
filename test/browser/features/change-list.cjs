"use strict";
const { same } = require("../harness.cjs");
const { ABC } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
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
  ["g; with no change does nothing", ABC, [3, 0], "g;", { cursor: [3, 0], mode: "normal" }],
];

async function after({ page, check, play }) {
  // The page empties the buffer: g; then reaches only changes made after it. Four g; stop at
  // the oldest new change, so g, goes to the line after it, not to a position from before.
  await play(ABC, [0, 0], "Ax<Esc>jjAy<Esc>");
  await page.evaluate(() => window.setText(""));
  const got = await play([], null, "ia<Esc>ob<Esc>oc<Esc>g;g;g;g;g,");
  check("the page emptying the buffer empties the change list", same(got.cursor, [1, 0]), JSON.stringify(got.cursor));
}

module.exports = { scenarios, after };
