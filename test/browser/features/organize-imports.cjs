"use strict";

const UNSORTED = ["from dataclasses import dataclass", "import random", "import time", "from typing import Protocol", "from collections.abc import Callable", "", "class A: pass"];
const SORTED = ["import random", "import time", "from collections.abc import Callable", "from dataclasses import dataclass", "from typing import Protocol", "", "", "class A: pass"];

async function after({ page, check, play }) {
  const kind = await page.evaluate(() => (window.cm.editor ? "monaco" : window.cm.ace ? "ace" : window.cm.cm6 ? "cm6" : "cm5"));
  // Ace's and CodeMirror 6's vim modes keep Shift-Alt-O from vim.js.
  if (kind === "ace" || kind === "cm6") return;

  let got = await play(UNSORTED, [6, 3], "<S-A-o>");
  check("Shift-Alt-O sorts the imports as ruff does", JSON.stringify(got.lines) === JSON.stringify(SORTED), JSON.stringify(got.lines));
  check("the cursor moves with its line", JSON.stringify(got.cursor) === "[7,3]" && got.mode === "normal", JSON.stringify([got.cursor, got.mode]));
  got = await play(["import os", "x = 1", "import sys", "y = 2"], [1, 0], "<S-A-o>");
  check("the cursor stays on code between two blocks", JSON.stringify(got.lines) === JSON.stringify(["import os", "", "x = 1", "import sys", "", "y = 2"]) && JSON.stringify(got.cursor) === "[2,0]", JSON.stringify(got));
  got = await play(UNSORTED, [0, 0], "<S-A-o>u");
  check("one u undoes it", JSON.stringify(got.lines) === JSON.stringify(UNSORTED), JSON.stringify(got.lines));
  got = await play(SORTED, [1, 2], "<S-A-o>");
  check("sorted imports stay as they are", JSON.stringify(got.lines) === JSON.stringify(SORTED) && JSON.stringify(got.cursor) === "[1,2]", JSON.stringify(got));

  await page.evaluate(() => {
    const { cm } = window;
    if (cm.editor) monaco.editor.setModelLanguage(cm.editor.getModel(), "plaintext");
    else cm.setOption("mode", "text/plain");
  });
  got = await play(UNSORTED, [0, 0], "<S-A-o>");
  const shown = await page.evaluate(() => document.body.innerText);
  check("other languages are left alone, with a message", JSON.stringify(got.lines) === JSON.stringify(UNSORTED) && shown.includes("Organize imports works on Python here"), JSON.stringify(got.lines));
  await page.evaluate(() => {
    const { cm } = window;
    if (cm.editor) monaco.editor.setModelLanguage(cm.editor.getModel(), "python");
    else cm.setOption("mode", "python");
  });
  await page.keyboard.press("Escape");
  if (kind !== "monaco") return;

  // A language with its own organize imports, as stock Monaco gives TypeScript: Monaco's runs.
  await page.evaluate(() => {
    window.organizeProvider = monaco.languages.registerCodeActionProvider("python", {
      provideCodeActions: (model, range, context) => ({
        actions: (context.only ?? "").startsWith("source.organizeImports")
          ? [{ title: "Organize", kind: "source.organizeImports", edit: { edits: [{ resource: model.uri, textEdit: { range: new monaco.Range(1, 1, 1, 1), text: "# from Monaco\n" }, versionId: undefined }] } }]
          : [],
        dispose() {},
      }),
    }, { providedCodeActionKinds: ["source.organizeImports"] });
  });
  await page.waitForTimeout(300);
  await play(UNSORTED, [0, 0], "<S-A-o>");
  await page.waitForTimeout(1000);
  const first = await page.evaluate(() => window.cm.getLine(0));
  check("Monaco's own organize imports runs where the language has one", first === "# from Monaco", JSON.stringify(first));
  await page.evaluate(() => window.organizeProvider.dispose());
}

module.exports = { after };
