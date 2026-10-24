"use strict";
const { WITH_TAIL } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["yae yanks the whole buffer linewise", WITH_TAIL, [4, 12], "yae", { lines: WITH_TAIL, register: [WITH_TAIL.join("\n") + "\n", true] }],
  ["dae empties the buffer", WITH_TAIL, [4, 12], "dae", { lines: [""] }],
  ["vae selects every line", WITH_TAIL, [4, 12], "vae", { selection: [0, 9], mode: "visual-line", lastMode: "visual/linewise" }],
];

module.exports = { scenarios };
