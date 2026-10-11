// Some pages bundle their Vim mode with webpack 5 and set no global (CodeSignal bundles monaco-vim).
// Webpack keeps loaded chunks in a page global, webpackChunk<name>. Pushing a chunk with a runtime
// function hands back each runtime's require. The host reads Vim from modules the page has already
// run and never runs page code itself: a module run early can throw and leave the page a broken copy.
(() => {
  const pushed = new WeakSet(); // chunk arrays this copy of the script has pushed into
  // require -> { chunks, walked: chunks.length at the last walk, seen: Set of module ids, candidates: Set of ids, vims }
  const runtimes = new Map();
  const EDITOR = ".monaco-editor, .cm-editor, .CodeMirror, .ace_editor";
  // Where vim.js builds its API object. Most modules that only use the API do not match. Development
  // builds wrap each module in an eval string, where line breaks are the two characters \n.
  const DEFINES_VIM = /[{,](?:\s|\\[nrt])*defineMotion(?:\s|\\[nrt])*[:(,}]/;
  const MISS = Symbol("vim-overlay probe");
  // The getter webpack defines for an ES module export, such as `() => (x)` or
  // `function () { return x["default"]; }`, only returns a binding. Other getters may run page code.
  const BINDING = /^(?:\(\)\s*=>\s*\(?\s*[\w$.[\]"']+\s*\)?|function\s*\w*\s*\(\)\s*\{\s*return\s+[\w$.[\]"']+;?\s*\})$/;

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

  // obj[key] if reading it runs no page code: a data property or a webpack export getter.
  function read(obj, key) {
    for (let o = obj; o !== null && (typeof o === "object" || typeof o === "function"); o = Object.getPrototypeOf(o)) {
      const d = Object.getOwnPropertyDescriptor(o, key);
      if (!d) continue;
      if ("value" in d) return d.value;
      const source = d.get && Function.prototype.toString.call(d.get).replace(/\/\*.*?\*\//g, "").trim();
      return source && BINDING.test(source) ? d.get.call(obj) : undefined;
    }
  }

  const isVim = (v) => typeof read(v, "defineMotion") === "function" && typeof read(v, "mapCommand") === "function";

  function vimsIn(exports) {
    const values = [exports];
    // Every export: production builds shorten export names, so Vim may be under any of them.
    for (const key of Object.keys(Object(exports))) {
      try {
        values.push(read(exports, key));
      } catch {} // a binding not yet initialized
    }
    const vims = [];
    for (const value of values) {
      try {
        const Vim = isVim(value) ? value : read(value, "Vim");
        if (isVim(Vim)) vims.push(Vim);
      } catch {}
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
        if (!runtimes.has(require))
          runtimes.set(require, { chunks, walked: -1, seen: new Set(), candidates: new Set(), vims: [] });
      }]);
    }
    const found = [];
    // Walking a large bundle's modules costs milliseconds, so walk only where a Vim mode can be,
    // and only after a chunk has loaded: the runtime pushes each chunk it installs to its array.
    const editor = document.querySelector(EDITOR);
    for (const [require, runtime] of runtimes) {
      if (editor && runtime.walked !== runtime.chunks.length) {
        runtime.walked = runtime.chunks.length;
        for (const id of Object.keys(require.m)) {
          if (runtime.seen.has(id)) continue;
          runtime.seen.add(id);
          if (DEFINES_VIM.test(require.m[id])) runtime.candidates.add(id);
        }
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
