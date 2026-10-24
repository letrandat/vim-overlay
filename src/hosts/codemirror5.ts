import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// This host path supplies the Vim API; keep its original truthy check rather than probing more page properties.
export const find = () =>
  [...document.querySelectorAll(".CodeMirror")]
    .map((el) => property(property(property(el, "CodeMirror"), "constructor"), "Vim"))
    .filter(Boolean) as VimApi[];
