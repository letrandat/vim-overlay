"use strict";
// Run with and without the extension; results must be identical. [name, lines, cursor, keys]
const ONE = ["def f(a, b):", '    s = "hi there"', "    xs = [a, b]", "    return (a + b)", "", "y = f(1, 2)"];
const BUILTINS = [
  ["i", ONE, [5, 4], "iX<Esc>"],
  ["a", ONE, [5, 4], "aX<Esc>"],
  ["I", ONE, [1, 8], "IX<Esc>"],
  ["A", ONE, [1, 8], "AX<Esc>"],
  ["diw", ONE, [1, 10], "diw"],
  ["daw", ONE, [1, 10], "daw"],
  ["ciw", ONE, [5, 0], "ciwz<Esc>"],
  ["viw", ONE, [1, 10], "viw"],
  ["di(", ONE, [3, 14], "di("],
  ['di"', ONE, [1, 10], 'di"'],
  ["dip", ONE, [1, 4], "dip"],
  ["dap", ONE, [1, 4], "dap"],
  ["yip P", ONE, [5, 0], "yipP"],
  ["vipd", ONE, [2, 4], "vipd"],
  ["di then Esc then x", ONE, [1, 4], "di<Esc>x"],
  ["dd, >>, cc", ONE, [1, 4], "dd>>ccnew<Esc>"],
  ["yy", ONE, [1, 4], "yy"],
  ["Visual Y yanks lines", ONE, [1, 4], "vjY"],
  ["2D", ONE, [1, 4], "2D"],
  ["Ctrl-A on a number", ONE, [5, 0], "<C-a>"],
  ["3 Ctrl-X past zero", ["x = 1"], [0, 0], "3<C-x>"],
  ["Ctrl-A on a padded hex number", ["0x0f"], [0, 0], "<C-a>"],
  ["Ctrl-X on a negative number", ["-1"], [0, 1], "<C-x>"],
  ["Ctrl-A after the last number", ["1 b"], [0, 2], "<C-a>"],
];

module.exports = BUILTINS;
