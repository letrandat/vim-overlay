import type { VimApi } from "../vim-api.ts";

// Y yanks to the end of the line, as in Neovim. vim.js makes Y linewise like yy;
// its C and D already act like c$ and d$. Visual-mode Y stays linewise.
export const install = (Vim: VimApi) => {
  Vim.map("Y", "y$", "normal");
};
