import type { Adapter, VimState } from "../vim-api.ts";

export function setVisualSubmode(cm: Adapter, vim: VimState, linewise: boolean) {
  if (!(linewise ? !vim.visualLine || vim.visualBlock : vim.visualLine || vim.visualBlock)) return;
  vim.visualLine = linewise;
  vim.visualBlock = false;
  // Use the same static signal as vim.js so the host's mode display follows the selection.
  cm.constructor.signal?.(cm, "vim-mode-change", { mode: "visual", subMode: linewise ? "linewise" : "" });
}
