#!/usr/bin/env node
// Regenerates imports-oracle.json by running ruff's isort fix on each case in imports-cases.cjs.
// Usage: node test/make-imports-oracle.cjs [path-to-ruff]   (default: ruff on PATH)
// ruff runs in an empty directory, so no module counts as first-party, and with Python 3.14's
// standard library, the list src/python/stdlib.ts holds.
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cases = require("./imports-cases.cjs");

const ruff = process.argv[2] || "ruff";
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "imports-oracle-"));
const args = ["check", "--isolated", "--select", "I", "--fix-only", "--target-version", "py314", "--stdin-filename", "case.py", "-"];
const version = execFileSync(ruff, ["--version"], { encoding: "utf8" }).trim();
const data = cases.map(([name, input]) => ({
  name,
  input,
  output: execFileSync(ruff, args, { cwd, input, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }),
}));
fs.rmSync(cwd, { recursive: true });
fs.writeFileSync(path.join(__dirname, "imports-oracle.json"), JSON.stringify({ ruff: version, cases: data }, null, 1) + "\n");
console.log(`imports-oracle.json: ${data.length} cases from ${version}`);
