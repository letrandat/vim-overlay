// Writes a loadable extension to dist/: the manifest, and src/content.ts bundled with everything
// it imports into one classic script, since a manifest content script cannot be an ES module.
//   node scripts/build.mjs           build once
//   node scripts/build.mjs --watch   rebuild the script on every change
import * as esbuild from "esbuild";
import fs from "node:fs";

const options = {
  entryPoints: ["src/content.ts"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  // The first versions that run a manifest content script in the page's own world.
  target: ["chrome111", "firefox128"],
  logLevel: "info",
};

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist");
fs.copyFileSync("manifest.json", "dist/manifest.json");
if (process.argv.includes("--watch")) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
