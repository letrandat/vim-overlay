// Buffers used by both the Vim oracle and the browser test.
// Hand-written Python-shaped cases first, then deterministic random ones.
"use strict";

const T = "\t";
const hand = {
  "two-sum": [
    "class Solution:",
    "    def twoSum(self, nums, target):",
    "        seen = {}",
    "        for i, x in enumerate(nums):",
    "            if target - x in seen:",
    "                return [seen[target - x], i]",
    "            seen[x] = i",
    "        return []",
  ],
  "blank-lines-inside-blocks": [
    "def f(x):",
    "    a = 1",
    "",
    "    b = 2",
    "    if a:",
    "",
    "        c = 3",
    "",
    "    d = 4",
    "",
    "g = f(1)",
    "h = 2",
  ],
  "top-level-paragraphs": [
    "import os",
    "import sys",
    "",
    "x = 1",
    "y = 2",
    "",
    "",
    "def main():",
    "    pass",
  ],
  "whitespace-only-lines": ["def f():", "    a = 1", "    ", "    b = 2", "        ", "c = 3"],
  "leading-trailing-blanks": ["", "    ", "def f():", "    return 1", "", ""],
  "vim-endif": [
    "if foo > 3",
    '   echo "foo is big"',
    "   let foo = 3",
    "endif",
    "call do_something_else()",
  ],
  "deep-dedent": [
    "def a():",
    "    def b():",
    "        def c():",
    "            return 1",
    "        return c",
    "    return b",
    "x = a()",
  ],
  "elif-else": [
    "def f(x):",
    "    if x > 0:",
    "        return 1",
    "    elif x < 0:",
    "        return -1",
    "    else:",
    "        return 0",
  ],
  "brackets": ["nums = [", "    1,", "    2,", "]", "total = sum(", "        nums", "    )"],
  "tabs": ["def f():", T + "if x:", T + T + "return 1", T + "return 2"],
  "mixed-tab-space": ["def f():", T + "a = 1", "    b = 2", T + T + "c = 3", "        d = 4"],
  "single-line": ["x = 1"],
  "single-blank": [""],
  "all-blank": ["", "  ", ""],
};

// Small deterministic PRNG (mulberry32) so the fixture set never changes.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBuffers(count, seed) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const out = {};
  for (let f = 0; f < count; f++) {
    const n = 3 + Math.floor(r() * 10);
    const lines = [];
    let ind = pick([0, 0, 4]);
    for (let i = 0; i < n; i++) {
      if (r() < 0.22) {
        lines.push(" ".repeat(pick([0, 0, 0, 4, 8])));
        continue;
      }
      ind = Math.max(0, Math.min(16, ind + pick([-8, -4, -4, 0, 0, 4, 4, 2])));
      lines.push(" ".repeat(ind) + "s" + i);
    }
    out["random-" + f] = lines;
  }
  return out;
}

module.exports = function fixtures() {
  return Object.entries({ ...hand, ...randomBuffers(150, 20261006) }).map(([name, lines]) => ({
    name,
    lines,
  }));
};
