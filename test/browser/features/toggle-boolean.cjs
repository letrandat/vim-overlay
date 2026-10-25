"use strict";

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["Ctrl-A turns True into False", ["x = True"], [0, 0], "<C-a>", { lines: ["x = False"], cursor: [0, 8], mode: "normal" }],
  ["Ctrl-X turns False into True", ["x = False"], [0, 6], "<C-x>", { lines: ["x = True"], cursor: [0, 7] }],
  ["Ctrl-A keeps the case of true and TRUE", ["true TRUE"], [0, 5], "<C-a>", { lines: ["true FALSE"] }],
  ["Ctrl-A takes the boolean before a number", ["f(true, 1)"], [0, 0], "<C-a>", { lines: ["f(false, 1)"] }],
  ["Ctrl-A takes the number before a boolean", ["f(1, true)"], [0, 0], "<C-a>", { lines: ["f(2, true)"] }],
  ["Ctrl-A skips a boolean behind the cursor", ["true, 1"], [0, 5], "<C-a>", { lines: ["true, 2"] }],
  ["Ctrl-A leaves a word that holds true alone", ["istrue = 0"], [0, 0], "<C-a>", { lines: ["istrue = 1"] }],
  ["2 Ctrl-A leaves the boolean as it is", ["True"], [0, 0], "2<C-a>", { lines: ["True"], cursor: [0, 3] }],
  ["3 Ctrl-A flips it", ["True"], [0, 0], "3<C-a>", { lines: ["False"] }],
  ["dot repeats Ctrl-A", ["True", "True"], [0, 0], "<C-a>j0.", { lines: ["False", "False"] }],
  ["u undoes Ctrl-A", ["True"], [0, 0], "<C-a>u", { lines: ["True"] }],
];

module.exports = { scenarios };
