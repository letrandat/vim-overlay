// The content script: esbuild bundles this and everything it imports into dist/content.js.
import { hosts, features } from "./registry.ts";
import { start } from "./runtime.ts";

start(hosts, features);
