// Some pages bundle their Vim mode with webpack 5 and set no global (CodeSignal bundles monaco-vim).
// Webpack keeps loaded chunks in a page global, webpackChunk<name>. Pushing a chunk with a runtime
// function hands back each runtime's require. The host reads Vim from modules the page has already
// run and never runs one itself: a module run early can throw and leave the page a broken copy.
(() => {
  const pushed = new WeakSet(); // chunk arrays this copy of the script has pushed into
  const runtimes = new Map(); // require -> { seen: Set of module ids, pending: Set of ids, vims }
  const isVim = (v) => typeof v?.defineMotion === "function" && typeof v.mapCommand === "function";
  // Where vim.js builds its API object. Most modules that only use the API do not match. Development
  // builds wrap each module in an eval string, where line breaks are the two characters \n.
  const DEFINES_VIM = /[{,](?:\s|\\[nrt])*defineMotion(?:\s|\\[nrt])*[:(,}]/;
  const MISS = Symbol("vim-overlay probe");

  // A module's exports if the page has run it, else undefined. Webpack's require turns the id into
  // a property key at each use. This id gives the real key to the cache lookup only; after a miss,
  // the cache write and the factory lookup get MISS, which has no factory, so the call throws.
  function ranExports(require, id) {
    if (require.c) return require.c[id]?.exports;
    let uses = 0;
    try {
      return require({ [Symbol.toPrimitive]: () => (uses++ ? MISS : id) });
    } catch {
      return undefined;
    }
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
        if (!runtimes.has(require)) runtimes.set(require, { seen: new Set(), pending: new Set(), vims: [] });
      }]);
    }
    const found = [];
    for (const [require, runtime] of runtimes) {
      for (const id of Object.keys(require.m)) {
        if (runtime.seen.has(id)) continue;
        runtime.seen.add(id);
        if (DEFINES_VIM.test(require.m[id])) runtime.pending.add(id);
      }
      for (const id of runtime.pending) {
        const exports = ranExports(require, id);
        if (exports === undefined) continue; // not run yet: ask again on the next poll
        runtime.pending.delete(id);
        try {
          for (const value of [exports, ...Object.values(exports ?? {})]) {
            const Vim = isVim(value) ? value : value?.Vim;
            if (isVim(Vim) && !runtime.vims.includes(Vim)) runtime.vims.push(Vim);
          }
        } catch {} // an export getter threw; this module is not a Vim mode we can use
      }
      found.push(...runtime.vims);
    }
    return found;
  };
})();
