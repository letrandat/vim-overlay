// monaco-vim keeps its adapter off the editor and the DOM, so only page globals can find it:
// LeetCode sets window.monacoVim; the UMD build sets window.MonacoVim.
export const find = () =>
  [window.monacoVim, window.MonacoVim].map((m) => m?.VimMode?.Vim).filter(Boolean);
