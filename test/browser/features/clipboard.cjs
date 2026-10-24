"use strict";
const { WITH_TAIL } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["yae copies the buffer to the clipboard", WITH_TAIL, [4, 12], "yae", { clipboard: WITH_TAIL.join("\n") + "\n" }],
  ["Y copies to the clipboard", WITH_TAIL, [1, 4], "Y", { clipboard: "total = 0" }],
  ["a named-register yank leaves the clipboard alone", WITH_TAIL, [1, 4], '"ayy', { clipboard: null }],
  ["dd leaves the clipboard alone", WITH_TAIL, [1, 4], "dd", { clipboard: null }],
];

module.exports = { scenarios };
