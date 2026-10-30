// Each feature's keys as the popup shows them, in the registry's order. Typed against the
// registry, so adding or removing a feature there fails the type check until this list matches.
import type { features } from "../registry.ts";

export const KEYS: Record<keyof typeof features, string> = {
  "indent-object": "ii ai",
  "entire-object": "ae",
  "yank-to-eol": "Y",
  clipboard: "yank",
  "yank-flash": "yank",
  complete: "C-n C-p",
  "move-lines": "C-j C-k",
  "bracket-objects": "i( a{",
  "quote-object": "iq aq",
  comment: "gc",
  "change-list": "g; g,",
  "relative-numbers": ":set rnu",
  rename: "grn",
  hover: "gh",
  "toggle-boolean": "C-a C-x",
  "organize-imports": "S-A-O",
};
