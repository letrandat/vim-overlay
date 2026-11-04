#!/usr/bin/env node
// Loads the built extension into Chromium as a browser does, changes its settings in the
// toolbar popup's own page, and checks what a test page installs after each reload: every
// feature, every feature but one, and none. Run `npm run build` first; `npm test` does.
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { serve, play } = require("./browser/harness.cjs");

const DIST = path.join(__dirname, "..", "dist");
// Chromium names an unpacked extension after its folder: the first 32 hex digits of the path's
// SHA-256, each written as a letter from a to p.
const ID = [...crypto.createHash("sha256").update(DIST).digest("hex").slice(0, 32)]
  .map((d) => String.fromCharCode(97 + parseInt(d, 16)))
  .join("");
const ALL = { defineMotion: 5, defineAction: 6, defineOperator: 1, mapCommand: 24, map: 1 };

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/monaco-vim.html`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vim-overlay-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  try {
    const page = await context.newPage();
    const popup = await context.newPage();
    const load = async () => {
      await page.goto(url);
      await page.waitForFunction(() => window.cm && window.calls, null, { timeout: 60000 });
      await page.waitForTimeout(2500);
      return page.evaluate(() => window.calls);
    };
    const moved = async () => (await play(page, ["a", "b"], [0, 0], "<C-j>")).lines;
    const openPopup = async () => {
      await popup.goto(`chrome-extension://${ID}/popup.html`);
      await popup.waitForSelector("#features input");
    };

    // The popup loads once the extension has, so the first page load gets its scripts.
    await openPopup();
    assert.deepStrictEqual(await load(), ALL, "a fresh install runs every feature");
    assert.deepStrictEqual(await moved(), ["b", "a"], "C-j moves the line");

    // The "Relative line numbers" box starts unticked and, ticked or unticked, applies to the open
    // page at once, after the editor's first key, with no reload prompt.
    const numbers = async () => {
      await page.waitForTimeout(500);
      return page.evaluate(() => document.querySelectorAll(".vim-overlay-rel").length);
    };
    const rnu = "#rnu";
    await play(page, ["a", "b", "c"], [1, 0], "<Esc>");
    assert.strictEqual(await popup.isChecked(rnu), false, "relative line numbers start unticked");
    assert.strictEqual(await popup.textContent("#count"), "16 of 16 on", "the box is not one of the listed features");
    assert.strictEqual(await popup.isVisible("#all-on"), false, "nothing to turn on");
    assert.strictEqual(await numbers(), 0, "unticked: no relative numbers");
    await popup.check(rnu);
    assert.strictEqual(await numbers(), 3, "ticked: the open page shows the column");
    assert.strictEqual(await popup.isVisible("#reload"), false, "relative-numbers needs no reload");
    await play(page, null, null, ":set nornu<CR>");
    assert.strictEqual(await numbers(), 0, ":set nornu still hides it");
    await popup.uncheck(rnu);
    await popup.check(rnu);
    assert.strictEqual(await numbers(), 3, "ticking again shows it");
    await popup.uncheck(rnu);
    assert.strictEqual(await numbers(), 0, "unticked: the open page hides the column");
    assert.deepStrictEqual(await load(), ALL, "unticked, relative-numbers stays installed");
    await play(page, ["a", "b", "c"], [1, 0], ":set rnu<CR>");
    assert.strictEqual(await numbers(), 3, "unticked: :set rnu still shows it");
    await popup.check(rnu);
    await load();
    await play(page, ["a", "b", "c"], [1, 0], "<Esc>");
    assert.strictEqual(await numbers(), 3, "ticked: a page loads with the column");
    await popup.uncheck(rnu);
    assert.strictEqual(await numbers(), 0, "unticked again: hidden");

    // Settings saved by the popup before the box existed: no relativeNumbers key, and
    // relative-numbers maybe in off, which once removed the feature. The box reads unticked and
    // the feature is installed.
    for (const old of [{ on: true, off: [] }, { on: true, off: ["relative-numbers"] }]) {
      await popup.evaluate(async (old) => {
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(old);
      }, old);
      await openPopup();
      assert.strictEqual(await popup.isChecked(rnu), false, `saved ${JSON.stringify(old)}: the box reads unticked`);
      assert.strictEqual(await popup.textContent("#count"), "16 of 16 on", `saved ${JSON.stringify(old)}: every listed feature on`);
      assert.deepStrictEqual(await load(), ALL, `saved ${JSON.stringify(old)}: every feature installed`);
      await play(page, ["a", "b", "c"], [1, 0], "<Esc>");
      assert.strictEqual(await numbers(), 0, `saved ${JSON.stringify(old)}: no column`);
    }

    assert.strictEqual(await popup.isVisible("#reload"), false, "no reload prompt before a change");
    await popup.uncheck('#features input[value="move-lines"]');
    assert.strictEqual(await popup.isVisible("#reload"), true, "a change asks for a reload");
    assert.strictEqual(await popup.textContent("#count"), "15 of 16 on");
    // move-lines defines one motion and maps four keys.
    assert.deepStrictEqual(await load(), { ...ALL, defineMotion: 4, mapCommand: 20 }, "every feature but move-lines");
    assert.notDeepStrictEqual(await moved(), ["b", "a"], "move-lines off: C-j does what the page does, not a move");

    await openPopup();
    assert.strictEqual(await popup.isChecked('#features input[value="move-lines"]'), false, "the popup shows the saved setting");
    await popup.uncheck("#on");
    assert.strictEqual(await popup.isDisabled('#features input[value="comment"]'), true, "master off disables the list");
    assert.strictEqual(await popup.isDisabled(rnu), true, "and the relative line numbers box");
    const none = await load();
    assert.ok(Object.values(none).every((n) => n === 0), JSON.stringify(none));

    await openPopup();
    // With the master switch off and move-lines off, "Turn all on" turns both back on.
    await popup.click("#all-on");
    assert.strictEqual(await popup.isChecked("#on"), true, "Turn all on turns the master switch on");
    assert.strictEqual(await popup.isChecked(rnu), false, "Turn all on leaves the relative line numbers box as it was");
    assert.deepStrictEqual(await load(), ALL, "turned back on, every feature runs again");
    console.log("ok  extension: the popup turns every feature, one feature and all of them off and on after a reload");
  } finally {
    await context.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
