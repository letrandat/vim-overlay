"use strict";
const { WITH_TAIL, ENDIF, BLANKS, keep } = require("../buffers.cjs");

// [name, lines, cursor, keys, expect]
const scenarios = [
  ["dii deletes the block", WITH_TAIL, [3, 8], "dii", { lines: keep(WITH_TAIL, 0, 1, 2, 7, 8, 9), cursor: [3, 4] }],
  ["dai also deletes the line above", WITH_TAIL, [3, 8], "dai", { lines: keep(WITH_TAIL, 0, 1, 7, 8, 9) }],
  ["daI also deletes the line below", ENDIF, [1, 3], "daI", { lines: [ENDIF[4]] }],
  ["d2ii deletes the enclosing block", WITH_TAIL, [4, 12], "d2ii", { lines: keep(WITH_TAIL, 0, 1, 2, 7, 8, 9) }],
  ["dii on a blank line", BLANKS, [5, 0], "dii", { lines: BLANKS.filter((_, i) => i !== 6) }],
  ["yii yanks linewise; p pastes lines", WITH_TAIL, [3, 8], "yiiGp", { lines: [...WITH_TAIL, ...WITH_TAIL.slice(3, 7)] }],
  [">ii indents the block", WITH_TAIL, [3, 8], ">ii", { lines: WITH_TAIL.map((l, i) => (i >= 3 && i <= 6 ? "    " + l : l)) }],
  ["<ii dedents the block", WITH_TAIL, [4, 12], "<ii", { lines: WITH_TAIL.map((l, i) => (i === 4 ? l.slice(4) : l)) }],
  ["dot repeats dii", WITH_TAIL, [4, 12], "diij.", { lines: keep(WITH_TAIL, 0, 1, 2, 3, 5, 7, 8, 9) }],
  ["dot repeats >ii", WITH_TAIL, [4, 12], ">ii.", { lines: WITH_TAIL.map((l, i) => (i === 4 ? "        " + l : l)) }],
  ["u undoes dii", WITH_TAIL, [3, 8], "diiu", { lines: WITH_TAIL }],
  ["vii selects linewise", WITH_TAIL, [4, 12], "vii", { selection: [4, 4], mode: "visual-line", lastMode: "visual/linewise" }],
  ["vii ii grows to the enclosing block", WITH_TAIL, [4, 12], "viiii", { selection: [3, 6] }],
  ["vii ii ii grows again", WITH_TAIL, [4, 12], "viiiiii", { selection: [1, 7] }],
  ["v2ii equals vii ii", WITH_TAIL, [4, 12], "v2ii", { selection: [3, 6] }],
  ["vii leaves the cursor on the bottom line; j extends", WITH_TAIL, [3, 8], "viij", { selection: [3, 7] }],
  ["Vai then d", WITH_TAIL, [3, 8], "Vaid", { lines: keep(WITH_TAIL, 0, 1, 7, 8, 9) }],
  ["vaI selects the endif too", ENDIF, [1, 3], "vaI", { selection: [0, 3] }],
];

async function after({ page, cfg, check }) {
  if (!cfg.offsetDoc) return;
  // A CodeMirror 5 document whose first line is 10, not 0.
  await page.evaluate(() => {
    window.testVim.handleKey(window.cm, "<Esc>");
    window.savedDoc = window.cm.swapDoc(CodeMirror.Doc("    a\n    b\ntail", null, 10));
    window.cm.setCursor({ line: 10, ch: 4 });
    window.cm.focus();
  });
  for (const key of "dii") await page.keyboard.press(key);
  const text = await page.evaluate(() => {
    const value = window.cm.getValue();
    window.cm.swapDoc(window.savedDoc);
    return value;
  });
  check("dii in a document that starts at line 10", text === "tail", JSON.stringify(text));
}

module.exports = { scenarios, after };
