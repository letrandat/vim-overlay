"use strict";
const { WITH_TAIL } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["Y yanks to the end of the line", WITH_TAIL, [1, 4], "Y", { lines: WITH_TAIL, cursor: [1, 4], register: ["total = 0", false] }],
  ["2Y yanks to the end of the next line", WITH_TAIL, [1, 4], "2Y", { register: ["total = 0\n    for x in nums:", false] }],
  ["Y then $p pastes characterwise", WITH_TAIL, [1, 10], "Y$p", { lines: WITH_TAIL.map((l, i) => (i === 1 ? l + "= 0" : l)) }],
  ["D deletes to the end of the line", WITH_TAIL, [1, 10], "D", { lines: WITH_TAIL.map((l, i) => (i === 1 ? "    total " : l)), register: ["= 0", false] }],
  ["C changes to the end of the line", WITH_TAIL, [1, 10], "Cx<Esc>", { lines: WITH_TAIL.map((l, i) => (i === 1 ? "    total x" : l)) }],
];

module.exports = { scenarios };
