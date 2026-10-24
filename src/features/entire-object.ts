import type { Motion, VimApi } from "../vim-api.ts";

// Text object ae: the whole buffer, linewise, as in vim-textobj-entire.
const MOTION = "vimOverlayEntireObject";

const entireObjectMotion: Motion = (cm, head, args, vim) => {
  args.linewise = true;
  if (vim.visualMode && (!vim.visualLine || vim.visualBlock)) {
    vim.visualLine = true;
    vim.visualBlock = false;
    cm.constructor.signal?.(cm, "vim-mode-change", { mode: "visual", subMode: "linewise" });
  }
  return [{ line: cm.firstLine?.() ?? 0, ch: 0 }, { line: cm.lastLine(), ch: 0 }];
};

export const install = (Vim: VimApi) => {
  Vim.defineMotion(MOTION, entireObjectMotion);
  Vim.mapCommand("ae", "motion", MOTION);
};
