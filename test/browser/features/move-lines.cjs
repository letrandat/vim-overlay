"use strict";
const { ABC } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["Ctrl-J moves the line down", ABC, [1, 0], "<C-j>", { lines: ["a", "c", "b", "d", "e"], cursor: [2, 0], mode: "normal" }],
  ["Ctrl-K moves the line up", ABC, [1, 0], "<C-k>", { lines: ["b", "a", "c", "d", "e"], cursor: [0, 0] }],
  ["Ctrl-J keeps the column", ["abc", "def"], [0, 2], "<C-j>", { lines: ["def", "abc"], cursor: [1, 2] }],
  ["2 Ctrl-J moves the line two down", ABC, [1, 0], "2<C-j>", { lines: ["a", "c", "d", "b", "e"], cursor: [3, 0] }],
  ["a count past the end stops at the last line", ABC, [2, 0], "9<C-j>", { lines: ["a", "b", "d", "e", "c"], cursor: [4, 0] }],
  ["Ctrl-K on the first line changes nothing", ABC, [0, 0], "<C-k>", { lines: ABC, cursor: [0, 0] }],
  ["Ctrl-J on the last line changes nothing", ABC, [4, 0], "<C-j>", { lines: ABC, cursor: [4, 0] }],
  ["u undoes Ctrl-J", ABC, [1, 0], "<C-j>u", { lines: ABC }],
  ["d Ctrl-J changes nothing", ABC, [1, 0], "d<C-j>", { lines: ABC, mode: "normal" }],
  ["Visual Ctrl-J moves the selected lines and the selection", ABC, [1, 0], "Vj<C-j>", { lines: ["a", "d", "b", "c", "e"], selection: [2, 3], mode: "visual-line" }],
  ["Visual Ctrl-K twice moves them two up", ABC, [2, 0], "Vj<C-k><C-k>", { lines: ["c", "d", "a", "b", "e"], selection: [0, 1], mode: "visual-line" }],
  ["characterwise Visual Ctrl-J moves whole lines", ABC, [1, 0], "vj<C-j>", { lines: ["a", "d", "b", "c", "e"], selection: [2, 3], mode: "visual" }],
  ["Visual Ctrl-J then d deletes the moved lines", ABC, [1, 0], "Vj<C-j>d", { lines: ["a", "d", "e"] }],
];

module.exports = { scenarios };
