import type { Adapter, VimApi } from "../vim-api.ts";

// Ctrl-L in Normal mode clears the search highlight, as Neovim's default Ctrl-L does. It runs
// vim.js's own :nohlsearch, which keeps the last search, so n and N still go to its matches and
// show them again. vim.js has no Ctrl-L of its own.
const ACTION = "vimOverlayClearHighlight";
// vim.js draws a search's highlight this long after the key that asks for it, in every host.
const DRAW_DELAY = 50;

export const install = (Vim: VimApi) => {
  const clear = (cm: Adapter) => {
    // Running an ex command records it in the ": register, which @: repeats. Neovim's Ctrl-L
    // leaves that register as it was, so this does too.
    const last = Vim.getRegisterController().getRegister(":");
    const text = last.toString();
    Vim.handleEx(cm, "nohlsearch");
    last.setText(text);
  };
  // An action, not Vim.map("<C-l>", ":nohlsearch"): newer vim.js (CodeMirror 6, Ace) types a
  // mapped ":" into its command line, which takes the focus and waits for Enter.
  Vim.defineAction(ACTION, (cm) => {
    clear(cm);
    // :nohlsearch does not cancel a highlight still waiting to be drawn, so a Ctrl-L sooner than
    // DRAW_DELAY after a search key, as when a macro replays n<C-l>, would see it come back. Clear
    // again just after it. A search key after Ctrl-L draws DRAW_DELAY after itself, so after this.
    // Skipped in Visual mode, which :nohlsearch would end.
    setTimeout(() => {
      const vim = cm.state?.vim;
      if (vim && !vim.visualMode) clear(cm);
    }, DRAW_DELAY);
  });
  Vim.mapCommand("<C-l>", "action", ACTION, {}, { context: "normal" });
};
