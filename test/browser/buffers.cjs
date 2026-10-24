// Buffers and helpers that several features' scenarios share.
"use strict";
const oracle = require("../oracle.json");

const WITH_TAIL = [
  "def f(nums):",
  "    total = 0",
  "    for x in nums:",
  "        if x > 0:",
  "            total += x",
  "        else:",
  "            total -= x",
  "    return total",
  "",
  "print(f([1, -2]))",
];
const ABC = ["a", "b", "c", "d", "e"];
const ENDIF = oracle.find((f) => f.name === "vim-endif").lines;
const BLANKS = oracle.find((f) => f.name === "blank-lines-inside-blocks").lines;
const keep = (lines, ...idx) => idx.map((i) => lines[i]);
const withLine = (lines, i, text) => lines.map((l, j) => (j === i ? text : l));
const lead = (prefix, lines, ...idx) => lines.map((l, i) => (idx.includes(i) ? prefix + l : l));

module.exports = { WITH_TAIL, ABC, ENDIF, BLANKS, keep, withLine, lead };
