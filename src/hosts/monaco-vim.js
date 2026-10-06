// monaco-vim keeps its adapter off the editor and the DOM, so only page globals can find it:
// LeetCode sets window.monacoVim; the UMD build sets window.MonacoVim.
window.vimOverlay.hosts.push({
  name: "monaco-vim",
  find() {
    return [window.monacoVim, window.MonacoVim].map((m) => m?.VimMode?.Vim).filter(Boolean);
  },
});
