// monaco-vim keeps its adapter off the editor and the DOM, so only page globals can find it:
// LeetCode sets window.monacoVim; the UMD build sets window.MonacoVim.
import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// This host path supplies the Vim API; keep its original truthy check rather than probing more page properties.
export const find = () =>
  [property(window, "monacoVim"), property(window, "MonacoVim")]
    .map((m) => property(property(m, "VimMode"), "Vim"))
    .filter(Boolean) as VimApi[];
