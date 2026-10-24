"use strict";

const NEST = ["q = \"a = 'x' + 1\""];

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["ciq changes inside double quotes", ['    s = "hi there"'], [0, 12], "ciqyo<Esc>", { lines: ['    s = "yo"'], mode: "normal" }],
  ["diq deletes inside single quotes", ["x = 'abc'"], [0, 6], "diq", { lines: ["x = ''"] }],
  ["daq deletes a backtick string with its quotes", ["x = `a ${b}`"], [0, 5], "daq", { lines: ["x = "] }],
  ["yiq yanks inside the quotes", ['s = "hi there"'], [0, 6], "yiq", { register: ["hi there", false] }],
  ["diq before a string takes the next one", ['print("hi")'], [0, 0], "diq", { lines: ['print("")'] }],
  ["diq takes the innermost of nested quotes", NEST, [0, 10], "diq", { lines: ["q = \"a = '' + 1\""] }],
  ["d2iq takes the inner string with its quotes", NEST, [0, 10], "d2iq", { lines: ['q = "a =  + 1"'] }],
  ["an apostrophe before a string is not a quote", ['// it\'s "y"'], [0, 9], "diq", { lines: ['// it\'s ""'] }],
  ["an apostrophe inside a string is not a quote", ['"it\'s" + x'], [0, 2], "diq", { lines: ['"" + x'] }],
  ["an escaped quote does not end the string", ['s = "a\\"b"'], [0, 5], "diq", { lines: ['s = ""'] }],
  ["diq on a closing quote takes its string", ['"a" "b"'], [0, 2], "diq", { lines: ['"" "b"'] }],
  ["diq between strings takes the next one", ['"a" "b"'], [0, 3], "diq", { lines: ['"a" ""'] }],
  ["viq selects inside the quotes", NEST, [0, 10], "viqd", { lines: ["q = \"a = '' + 1\""] }],
  ["viq iq adds the quotes", NEST, [0, 10], "viqiqd", { lines: ['q = "a =  + 1"'] }],
  ["viq iq iq takes the enclosing string", NEST, [0, 10], "viqiqiqd", { lines: ['q = ""'] }],
  ["vaq aq takes the enclosing string with its quotes", NEST, [0, 10], "vaqaqd", { lines: ["q = "] }],
  ["Viq selects characterwise", ['s = "hi"'], [0, 5], "Viq", { mode: "visual", lastMode: "visual" }],
  ["dot repeats diq", ["a = 'x', b = 'y'"], [0, 5], "diq$.", { lines: ["a = '', b = ''"] }],
  ["u undoes diq", NEST, [0, 10], "diqu", { lines: NEST }],
  ["diq without quotes does nothing", ["x = 1"], [0, 0], "diqx", { lines: [" = 1"], mode: "normal" }],
];

module.exports = { scenarios };
