// Some pages bundle their Vim mode with webpack 5 and set no global (CodeSignal bundles monaco-vim).
// Webpack keeps loaded chunks in a page global, webpackChunk<name>. Pushing a chunk with a runtime
// function hands back each runtime's require. The host reads Vim from modules the page has already
// run and does not run an unrun module's factory: a module run early can throw and leave the page a
// broken copy. Reading a Proxy export still runs its traps, which can load other modules early, and so
// can a getter written inside a `with` block, which no check here can tell from a module variable.
// Where a module exports monaco-vim's initVimMode but not Vim, the host calls initVimMode once on a
// stub editor (see vimFromInit).
import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// Webpack runtime internals have no public types; exports stay unknown until the Vim signature check.
interface WebpackRequire {
  (id: string | { [Symbol.toPrimitive](): string | symbol }): unknown;
  c?: Record<string, { exports: unknown }>;
  i?: unknown[];
  m: Record<string, (...args: never[]) => unknown>;
  h?(): string;
}
interface Runtime {
  chunks: unknown[];
  walked: string | null;
  seen: Map<string, (...args: never[]) => unknown>;
  candidates: Set<string>;
  vims: VimApi[];
}

const pushed = new WeakSet<unknown[]>(); // chunk arrays this copy of the script has pushed into
// require -> { chunks, walked: walk key at the last walk, seen: Map of module id -> factory, candidates: Set of ids, vims }
const runtimes = new Map<WebpackRequire, Runtime>();
const EDITOR = ".monaco-editor, .cm-editor, .CodeMirror, .ace_editor";
// Where vim.js builds its API object. Most modules that only use the API do not match. Development
// builds wrap each module in an eval string, where line breaks are the two characters \n.
const DEFINES_VIM = /[{,](?:\s|\\[nrt])*defineMotion(?:\s|\\[nrt])*[:(,}]/;
const MISS = Symbol("vim-overlay probe");
// The getter webpack defines for a module's own export, `() => (x)` or `function () { return x; }`,
// only returns a variable local to the module. Other getters, including re-exports such as
// `() => (other.x)` and a name that is really a global defined by a getter, may run page code.
const ID = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*`;
const BINDING = new RegExp(String.raw`^(?:\(\)\s*=>\s*\(?\s*(${ID})\s*\)?|function\s*(?:${ID})?\s*\(\)\s*\{\s*return\s+(${ID});?\s*\})$`, "u");

// A module's exports if the page has run it, else undefined. Webpack's require turns the id into
// a property key at each use. This id gives the real key to the cache lookup only; after a miss,
// the cache write and the factory lookup get MISS, which has no factory, so the call throws.
function ranExports(require: WebpackRequire, id: string) {
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
function read(obj: unknown, key: PropertyKey): unknown {
  for (let o = obj; o !== null && (typeof o === "object" || typeof o === "function"); o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (!d) continue;
    if ("value" in d) return d.value as unknown;
    const source = d.get && Function.prototype.toString.call(d.get).replace(/\/\*.*?\*\//g, "").trim();
    const m = source && BINDING.exec(source);
    const name = m && (m[1] ?? m[2]);
    return name && !globalAccessor(name) ? d.get!.call(obj) : undefined;
  }
}

// Whether a global named `name` is defined by a getter. The window and its prototypes are not
// proxies and their prototypes cannot change, so reading their descriptors runs no page code.
// A page can reassign globalThis but not window.
function globalAccessor(name: string) {
  for (let o = window; o !== null; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d) return !("value" in d);
  }
  return false;
}

// An editor that accepts every property read, call and construction, for monaco-vim to attach to.
function stubEditor() {
  const any: (...args: never[]) => unknown = new Proxy(function () {}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : any),
    apply: () => any,
    construct: () => any,
  });
  return any;
}

// monaco-vim's entry exports its adapter class, which holds Vim, and initVimMode. A production
// build that drops the unused class (CoderPad) leaves only initVimMode, so the host calls it once
// on a stub editor, reads Vim from the class of the adapter it returns, and disposes the adapter.
// Export names can be shortened, so it calls exported functions whose source wires the status bar
// events initVimMode names, as initVimMode and copies of it do, until one yields Vim.
const INIT_VIM_MODE = /["']vim-keypress["'][^]*["']vim-command-done["']/;
// Not retried: a function's source does not change, and a call that throws may have run page code.
const tried = new WeakSet();
function vimFromInit(init: unknown): unknown {
  if (typeof init !== "function" || tried.has(init)) return undefined;
  tried.add(init);
  if (!INIT_VIM_MODE.test(Function.prototype.toString.call(init))) return undefined;
  let adapter: unknown;
  try {
    adapter = init(stubEditor());
  } catch (err) {
    console.warn("[vim-overlay] initVimMode on a stub editor failed:", err);
    return undefined;
  }
  try {
    return read(read(adapter, "constructor"), "Vim");
  } finally {
    try {
      // initVimMode owns the returned adapter contract; retain its optional cleanup call.
      const disposable = adapter as { dispose?: () => void } | null | undefined;
      disposable?.dispose?.();
    } catch {}
  }
}

const isVim = (v: unknown): v is VimApi => typeof read(v, "defineMotion") === "function" && typeof read(v, "mapCommand") === "function";

function vimsIn(exports: unknown) {
  const values = [exports];
  // Every export: production builds shorten export names, so Vim may be under any of them.
  let keys: string[] = [];
  try {
    keys = Object.keys(Object(exports));
  } catch {} // a Proxy's ownKeys trap threw
  for (const key of keys) {
    try {
      values.push(read(exports, key));
    } catch {} // a binding not yet initialized
  }
  const vims: VimApi[] = [];
  for (const value of values) {
    try {
      const Vim = isVim(value) ? value : read(value, "Vim");
      if (isVim(Vim)) vims.push(Vim);
    } catch {}
  }
  if (!vims.length) {
    for (const value of values) {
      let Vim;
      try {
        Vim = vimFromInit(value);
      } catch {}
      if (isVim(Vim)) {
        vims.push(Vim);
        break;
      }
    }
  }
  return vims;
}

export const find = () => {
  for (const key of Object.keys(window).filter((k) => k.startsWith("webpackChunk"))) {
    let chunks;
    try {
      chunks = property(window, key);
    } catch {
      continue;
    }
    if (!Array.isArray(chunks) || pushed.has(chunks)) continue;
    pushed.add(chunks);
    // Every runtime sharing the array calls this, and one loading later replays it from the array.
    // The id is new each time: a runtime skips a chunk whose ids it has installed.
    chunks.push([[Symbol("vim-overlay")], {}, (require: WebpackRequire) => {
      if (!runtimes.has(require))
        runtimes.set(require, { chunks, walked: null, seen: new Map(), candidates: new Set(), vims: [] });
    }]);
  }
  const found: VimApi[] = [];
  // Walking a large bundle's modules costs tens of milliseconds, so walk only where a Vim mode can
  // be, and only after modules change: the runtime pushes each chunk it installs to its array, and
  // a hot update, which adds and replaces modules without a chunk, changes the full hash, h().
  const editor = document.querySelector(EDITOR);
  for (const [require, runtime] of runtimes) {
    const key = `${runtime.chunks.length}:${require.h?.() ?? ""}`;
    if (editor && runtime.walked !== key) {
      runtime.walked = key;
      for (const [id, factory] of Object.entries(require.m)) {
        if (runtime.seen.get(id) === factory) continue;
        runtime.seen.set(id, factory);
        // RegExp.test coerces the factory to source text; the cast keeps that existing coercion.
        if (DEFINES_VIM.test(factory as unknown as string)) runtime.candidates.add(id);
        else runtime.candidates.delete(id);
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
