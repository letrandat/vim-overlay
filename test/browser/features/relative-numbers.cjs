"use strict";
const { ABC } = require("../buffers.cjs");

const numbers = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".vim-overlay-rel")]
      .map((e) => [parseFloat(e.parentElement.style.top), [...e.classList].find((c) => /-\d+$/.test(c)).split("-").pop()])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1])
      .join(",")
  );
// The margin the column sits in, as set and as laid out (with the folding arrows), and what
// :set rnu? reports.
const state = (page) =>
  page.evaluate(() => {
    const { editor } = window.cm;
    const value = window.testVim.getOption("rnu");
    return {
      option: editor?.getRawOptions().lineDecorationsWidth,
      width: editor?.getLayoutInfo().decorationsWidth,
      rnu: value instanceof Error ? value.message : value,
    };
  });

async function after({ page, cfg, check, play }) {
  // Monaco shows a relative number on each line, counted from the cursor; other hosts show none.
  const monaco = cfg.page.startsWith("monaco");
  await play(ABC, [2, 0], "<Esc>");
  await page.waitForTimeout(300);
  check("relative line numbers", (await numbers(page)) === (monaco ? "2,1,0,1,2" : ""), JSON.stringify(await numbers(page)));
  if (!monaco) {
    const { rnu } = await state(page);
    check("no relativenumber option without the column", rnu === "Unknown option: rnu", JSON.stringify(rnu));
    return;
  }
  const on = await state(page);

  // :set nornu hides the column and gives back Monaco's default margin, which the test pages
  // keep; the cursor moving keeps it hidden.
  await play(ABC, null, ":set nornu<CR>j");
  await page.waitForTimeout(300);
  const off = await state(page);
  check(":set nornu hides the column", (await numbers(page)) === "" && off.rnu === false && off.option === 10 && off.width < on.width,
    JSON.stringify({ numbers: await numbers(page), on, off }));

  // :set rnu brings it back, counted from where the cursor is now.
  await play(ABC, null, ":set rnu<CR>");
  await page.waitForTimeout(300);
  const back = await state(page);
  check(":set rnu shows the column again", (await numbers(page)) === "3,2,1,0,1" && back.rnu === true && back.option === "4.5ch" && back.width === on.width,
    JSON.stringify({ numbers: await numbers(page), back }));
}

module.exports = { after };
