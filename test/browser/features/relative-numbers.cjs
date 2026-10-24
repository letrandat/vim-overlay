"use strict";
const { ABC } = require("../buffers.cjs");

async function after({ page, cfg, check, play }) {
  // Monaco shows a relative number on each line, counted from the cursor; other hosts show none.
  await play(ABC, [2, 0], "<Esc>");
  await page.waitForTimeout(300);
  const rel = await page.evaluate(() =>
    [...document.querySelectorAll(".vim-overlay-rel")]
      .map((e) => [parseFloat(e.parentElement.style.top), [...e.classList].find((c) => /-\d+$/.test(c)).split("-").pop()])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1])
      .join(",")
  );
  const want = cfg.page.startsWith("monaco") ? "2,1,0,1,2" : "";
  check("relative line numbers", rel === want, JSON.stringify(rel));
}

module.exports = { after };
