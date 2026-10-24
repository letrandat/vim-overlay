"use strict";

async function after({ page, check, play }) {
  // An error on the cursor's line, the way each editor keeps one; CodeMirror 6 offers none to read.
  await play(["x = (", "y = 1"], [0, 1], "<Esc>");
  const kind = await page.evaluate(() => {
    const { cm } = window;
    if (cm.editor) {
      monaco.editor.setModelMarkers(cm.editor.getModel(), "test", [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6, message: "boom here", severity: 8 }]);
      return "monaco";
    }
    if (cm.ace) return cm.ace.session.setAnnotations([{ row: 0, column: 0, text: "boom here", type: "error" }]), "ace";
    if (cm.cm6) return "cm6";
    cm.setOption("lint", { getAnnotations: () => [{ from: CodeMirror.Pos(0, 0), to: CodeMirror.Pos(0, 5), message: "boom here", severity: "error" }], delay: 0 });
    return "cm5";
  });
  await page.waitForTimeout(600);
  for (const key of "gh") await page.keyboard.press(key);
  await page.waitForTimeout(1000);
  const shown = await page.evaluate(() => document.body.innerText);
  const want = { monaco: "boom here", ace: "error: boom here", cm5: "error: boom here", cm6: "No error on this line" }[kind];
  check("gh shows the error at the cursor", shown.includes(want), `${kind}: ${JSON.stringify(want)} not shown`);
  await page.evaluate(() => {
    const { cm } = window;
    if (cm.editor) monaco.editor.setModelMarkers(cm.editor.getModel(), "test", []);
    else if (cm.ace) cm.ace.session.clearAnnotations();
    else if (!cm.cm6) cm.setOption("lint", false);
  });
  await page.keyboard.press("Escape");
}

module.exports = { after };
