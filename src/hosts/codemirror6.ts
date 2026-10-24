// @replit/codemirror-vim (6.0 to 6.4) exports Vim from its module but does not set CodeMirror.Vim on
// its adapter class, so this finds nothing on stock pages. It works where a page sets it, e.g.
// `getCM(view).constructor.Vim = Vim`.
import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// This host path supplies the Vim API; keep its original truthy check rather than probing more page properties.
export const find = () =>
  [...document.querySelectorAll(".cm-content")]
    .map((el) => {
      // @codemirror/view 6.39+ stores the tile tree on cmTile; older versions on cmView.
      const view = property(property(property(el, "cmTile"), "root"), "view") ??
        property(property(property(el, "cmView"), "rootView"), "view");
      return property(property(property(view, "cm"), "constructor"), "Vim");
    })
    .filter(Boolean) as VimApi[];
