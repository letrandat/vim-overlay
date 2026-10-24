// The content script: esbuild bundles this and everything it imports into dist/content.js.
import { hosts, features } from "./registry.js";
import { start } from "./runtime.js";

start(hosts, features);
