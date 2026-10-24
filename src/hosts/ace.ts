// ace/keyboard/vim puts its CodeMirror adapter on editor.state.cm when it attaches.
import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// This host path supplies the Vim API; keep its original truthy check rather than probing more page properties.
export const find = () =>
  [...document.querySelectorAll(".ace_editor")]
    .map((el) => {
      const editor = property(property(el, "env"), "editor");
      const cm = property(property(editor, "state"), "cm");
      return property(property(cm, "constructor"), "Vim");
    })
    .filter(Boolean) as VimApi[];
