// Some pages bundle their Vim mode with webpack 5 and set no global (CodeSignal bundles monaco-vim).
// Webpack keeps loaded chunks in a page global, webpackChunk<name>. Pushing a chunk with a runtime
// function hands back each runtime's require. The host reads Vim from modules the page has already
// run and never runs one itself: a module run early can throw and leave the page a broken copy.
(() => {
  const pushed = new WeakSet(); // chunk arrays this copy of the script has pushed into
  const runtimes = new Map(); // require -> { seen: Set of module ids, candidates: Set of ids, vims }
  const isVim = (v) => typeof v?.defineMotion === "function" && typeof v.mapCommand === "function";
  // Where vim.js builds its API object. Most modules that only use the API do not match. Development
  // builds wrap each module in an eval string, where line breaks are the two characters \n.
  const DEFINES_VIM = /[{,](?:\s|\\[nrt])*defineMotion(?:\s|\\[nrt])*[:(,}]/;
  const MISS = Symbol("vim-overlay probe");
  // The exports vim.js ports put Vim under. Other exports may be getters that run page code.
  const EXPORTS = ["Vim", "default", "VimMode"];

  // A module's exports if the page has run it, else undefined. Webpack's require turns the id into
  // a property key at each use. This id gives the real key to the cache lookup only; after a miss,
  // the cache write and the factory lookup get MISS, which has no factory, so the call throws.
  function ranExports(require, id) {
    if (require.c) return require.c[id]?.exports;
    if (require.i?.length) return undefined; // interceptors run page code on a miss, before the lookup
    let uses = 0;
    try {
      return require({ [Symbol.toPrimitive]: () => (uses++ ? MISS : id) });
    } catch {
      return undefined;
    }
  }

  function vimsIn(exports) {
    const vims = [];
    for (const read of [() => exports, ...EXPORTS.map((name) => () => exports[name])]) {
      try {
        const value = read();
        const Vim = isVim(value) ? value : value?.Vim;
        if (isVim(Vim)) vims.push(Vim);
      } catch {} // a getter threw; the other exports may still hold Vim
    }
    return vims;
  }

  window.vimOverlay.hosts.webpack = () => {
    for (const key of Object.keys(window).filter((k) => k.startsWith("webpackChunk"))) {
      let chunks;
      try {
        chunks = window[key];
      } catch {
        continue;
      }
      if (!Array.isArray(chunks) || pushed.has(chunks)) continue;
      pushed.add(chunks);
      // Every runtime sharing the array calls this, and one loading later replays it from the array.
      // The id is new each time: a runtime skips a chunk whose ids it has installed.
      chunks.push([[Symbol("vim-overlay")], {}, (require) => {
        if (!runtimes.has(require)) runtimes.set(require, { seen: new Set(), candidates: new Set(), vims: [] });
      }]);
    }
    const found = [];
    for (const [require, runtime] of runtimes) {
      for (const id of Object.keys(require.m)) {
        if (runtime.seen.has(id)) continue;
        runtime.seen.add(id);
        if (DEFINES_VIM.test(require.m[id])) runtime.candidates.add(id);
      }
      // Asked every poll: a module may run later, or run again after a hot update.
      for (const id of runtime.candidates) {
        const exports = ranExports(require, id);
        if (exports == null) continue;
        for (const Vim of vimsIn(exports)) if (!runtime.vims.includes(Vim)) runtime.vims.push(Vim);
      }
      found.push(...runtime.vims);
    }
    return found;
  };
})();
