#!/usr/bin/env node
// Regenerates oracle.json by running the reference Vim plugin in real Vim.
// Usage: node test/make-oracle.cjs [path-to-vim]   (default: vim on PATH)
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const fixtures = require("./fixtures.cjs");

const vim = process.argv[2] || "vim";
const fxPath = path.join(__dirname, ".fixtures.tmp.json");
const outPath = path.join(__dirname, "oracle.json");
fs.writeFileSync(fxPath, JSON.stringify(fixtures()));

execFileSync(vim, ["-Nu", "NONE", "-i", "NONE", "-n", "-es", "-S", path.join(__dirname, "oracle.vim")], {
  env: { ...process.env, PLUGIN: path.join(__dirname, "vim-indent-object.vim"), FIXTURES: fxPath, OUT: outPath },
  stdio: "inherit",
});
fs.rmSync(fxPath);

const data = JSON.parse(fs.readFileSync(outPath, "utf8"));
const cases = data.flatMap((f) => f.cases);
console.log(`oracle.json: ${data.length} buffers, ${cases.length} cursor/object cases`);
