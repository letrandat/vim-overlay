// The content script: esbuild bundles this and everything it imports into dist/content.js.
import { hosts, features } from "./registry.ts";
import { start } from "./runtime.ts";
import { pick, whenSettings } from "./settings.ts";

whenSettings((settings) => {
  const on = pick(features, settings);
  if (Object.keys(on).length) start(hosts, on);
});
