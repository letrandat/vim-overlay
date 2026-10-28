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
  // The column starts off on every host; on others than Monaco, rnu stays an unknown option.
  const monaco = cfg.page.startsWith("monaco");
  await play(ABC, [2, 0], "<Esc>");
  await page.waitForTimeout(300);
  const off = await state(page);
  check("no relative line numbers by default", (await numbers(page)) === "" && off.rnu === (monaco ? false : "Unknown option: rnu"),
    JSON.stringify({ numbers: await numbers(page), off }));
  if (!monaco) return;

  // :set rnu shows a relative number on each line, counted from the cursor, in a wider margin.
  await play(ABC, null, ":set rnu<CR>");
  await page.waitForTimeout(300);
  const on = await state(page);
  check(":set rnu shows the column", (await numbers(page)) === "2,1,0,1,2" && on.rnu === true && on.option === "4.5ch" && on.width > off.width,
    JSON.stringify({ numbers: await numbers(page), off, on }));

  // :set nornu hides the column and gives back Monaco's default margin, which the test pages
  // keep; the cursor moving keeps it hidden.
  await play(ABC, null, ":set nornu<CR>j");
  await page.waitForTimeout(300);
  const hidden = await state(page);
  check(":set nornu hides the column", (await numbers(page)) === "" && hidden.rnu === false && hidden.option === 10 && hidden.width === off.width,
    JSON.stringify({ numbers: await numbers(page), off, hidden }));

  // :set rnu brings it back, counted from where the cursor is now.
  await play(ABC, null, ":set rnu<CR>");
  await page.waitForTimeout(300);
  const back = await state(page);
  check(":set rnu shows the column again", (await numbers(page)) === "3,2,1,0,1" && back.rnu === true && back.option === "4.5ch" && back.width === on.width,
    JSON.stringify({ numbers: await numbers(page), back }));

  // On a line that folds, Monaco's arrow shares the column's margin; the number ends before the
  // arrow's glyph starts, with the arrow at the right of the margin.
  await play(["def f():", "    return 1"], [1, 0], "<Esc>");
  await page.waitForTimeout(300);
  const fold = await page.evaluate(() => {
    const arrow = document.querySelector(".cldr[class*=codicon-folding-]");
    const number = [...document.querySelectorAll(".vim-overlay-rel")].find((e) => e.parentElement === arrow?.parentElement);
    if (!arrow || !number) return null;
    const glyph = parseFloat(getComputedStyle(arrow, "::before").width);
    return {
      numberEnd: number.getBoundingClientRect().right - parseFloat(getComputedStyle(number).paddingRight),
      arrowStart: arrow.getBoundingClientRect().right - glyph,
      justify: getComputedStyle(arrow).justifyContent,
    };
  });
  check("folding arrow clear of the number", fold && fold.justify === "flex-end" && fold.numberEnd <= fold.arrowStart, JSON.stringify(fold));
}

module.exports = { after };
