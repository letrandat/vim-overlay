"use strict";
const { withLine } = require("../buffers.cjs");

const CALL = ["def f():", "    stack.append(stack.pop() / num)", "    return 1"];
const NESTED = "f((a) + (b) + (c) + (d) + (e) + (g) + x)";

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["ci( on a closing paren after a nested pair", CALL, [1, 34], "ci(x<Esc>", { lines: withLine(CALL, 1, "    stack.append(x)") }],
  ["ci( before a closing paren after a nested pair", CALL, [1, 33], "ci(x<Esc>", { lines: withLine(CALL, 1, "    stack.append(x)") }],
  ["di( past more than ten parens", [NESTED], [0, 38], "di(", { lines: ["f()"] }],
  ["da( on a closing paren after a nested pair", CALL, [1, 34], "da(", { lines: withLine(CALL, 1, "    stack.append") }],
];

module.exports = { scenarios };
