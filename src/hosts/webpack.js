// Some pages bundle their Vim mode with webpack 5 and set no global (CodeSignal bundles monaco-vim).
// Webpack keeps loaded chunks in a page global, webpackChunk<name>. Pushing a chunk with a runtime
// function hands back the bundle's require, which returns the module instance the page already uses.
(() => {
  const bundles = new WeakMap(); // chunk array -> { require, checked: Set of module ids, vims }
  const isVim = (v) => typeof v?.defineMotion === "function" && typeof v.mapCommand === "function";
  // Where vim.js builds its API object; a module that only calls Vim.defineMotion does not match.
  const DEFINES_VIM = /[{,]\s*defineMotion\s*[:(,}]/;

  window.vimOverlay.hosts.webpack = () => {
    // Requiring a module the page has not run yet runs it now, so wait until an editor exists:
    // then the editor library the Vim module imports has loaded.
    const editor = document.querySelector(".monaco-editor, .cm-editor, .CodeMirror, .ace_editor");
    const found = [];
    for (const key of Object.keys(window)) {
      const chunks = window[key];
      if (!key.startsWith("webpackChunk") || !Array.isArray(chunks)) continue;
      let bundle = bundles.get(chunks);
      if (!bundle) {
        bundle = { checked: new Set(), vims: [] };
        bundles.set(chunks, bundle);
        // Before the runtime loads, this waits in the array and the runtime replays it. The id is new
        // each time: the runtime skips a chunk whose ids it has installed.
        chunks.push([[Symbol("vim-overlay")], {}, (require) => (bundle.require = require)]);
      }
      const modules = bundle.require?.m;
      if (editor && modules) {
        for (const id of Object.keys(modules)) {
          if (bundle.checked.has(id)) continue;
          bundle.checked.add(id);
          if (!DEFINES_VIM.test(modules[id])) continue;
          const exports = bundle.require(id);
          for (const value of [exports, ...Object.values(exports ?? {})]) {
            const Vim = isVim(value) ? value : value?.Vim;
            if (isVim(Vim) && !bundle.vims.includes(Vim)) bundle.vims.push(Vim);
          }
        }
      }
      found.push(...bundle.vims);
    }
    return found;
  };
})();
