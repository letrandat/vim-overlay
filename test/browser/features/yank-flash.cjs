"use strict";
const { WITH_TAIL } = require("../buffers.cjs");

// Plays the keys and reports whether a yank highlight appeared, whether it sat within the line
// `line` shows (Monaco, CodeMirror 5 and Ace draw lines in .view-line, .CodeMirror-line and
// .ace_line), and whether one is left 400 ms later.
async function flashes(page, play, cursor, keys, line) {
  await page.evaluate((line) => {
    window.flashed = false;
    window.onLine = false;
    window.flashObserver?.disconnect();
    window.flashObserver = new MutationObserver(() => {
      const flash = document.querySelector(".vim-overlay-yank")?.getBoundingClientRect();
      if (!flash) return;
      window.flashed = true;
      const row = [...document.querySelectorAll(".view-line, .CodeMirror-line, .ace_line")]
        .find((e) => e.textContent.replace(/\s/g, " ") === line)?.getBoundingClientRect();
      const middle = (flash.top + flash.bottom) / 2;
      window.onLine ||= !!row && row.top <= middle && middle <= row.bottom;
    });
    window.flashObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }, line);
  await play(WITH_TAIL, cursor, keys);
  await page.waitForTimeout(400);
  return page.evaluate(() => ({ flashed: window.flashed, onLine: window.onLine, left: !!document.querySelector(".vim-overlay-yank") }));
}

async function after({ page, cfg, check, play }) {
  // CodeMirror 6's adapter has no way to mark text, so nothing flashes there.
  const shown = cfg.host !== "codemirror6";
  for (const [name, cursor, keys] of [
    ["yiw", [1, 4], "yiw"],
    ["yy", [1, 4], "yy"],
    ["Visual y", [1, 4], "vjy"],
    ["a named-register yank", [1, 4], '"ayy'],
  ]) {
    const got = await flashes(page, play, cursor, keys, WITH_TAIL[1]);
    check(`${name} ${shown ? "flashes the yanked text" : "flashes nothing"}`, got.flashed === shown && got.onLine === shown && !got.left, JSON.stringify(got));
  }
  const dd = await flashes(page, play, [1, 4], "dd", WITH_TAIL[1]);
  check("dd flashes nothing", !dd.flashed && !dd.left, JSON.stringify(dd));
}

module.exports = { after };
