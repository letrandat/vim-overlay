# vim-overlay

A browser extension that adds missing Vim features to the Vim mode a page's code editor already runs. Web Vim modes are ports of CodeMirror's `vim.js` and share its `Vim` API (`defineMotion`, `mapCommand`, `map`, `defineEx`, ...). The extension finds that object in the page and installs each feature on it once.

## Hosts

A host finds the `Vim` objects live in the page. `src/runtime.ts` asks every host once a second.

| Host | How it is found | Tested |
| --- | --- | --- |
| monaco-vim (LeetCode) | `window.monacoVim.VimMode.Vim` (LeetCode) or `window.MonacoVim.VimMode.Vim` (UMD global). monaco-vim keeps its adapter off the editor and the DOM, so only these globals work. | Yes: monaco-vim 0.4.4, Monaco 0.52.2, global set late as LeetCode does. The `MonacoVim` path is not tested. |
| CodeMirror 6 + @replit/codemirror-vim | `.cm-content` element, then its EditorView (`cmTile` in @codemirror/view 6.39+, `cmView` before), then `view.cm.constructor.Vim`. | **No on stock pages.** @replit/codemirror-vim 6.0 to 6.4 exports `Vim` from its module but never sets `CodeMirror.Vim`, so the adapter this host reaches through the DOM does not carry it. On a page bundled by webpack 5, the `webpack` host below may find it instead, but only in builds that keep it as its own module (development builds, or production builds without module concatenation); that path is not tested. Tested: on a stock page the host finds nothing and built-ins are unchanged. On a page that sets `getCM(view).constructor.Vim = Vim`, the feature passes the full suite. |
| CodeMirror 5 vim keymap | `.CodeMirror` element, then `el.CodeMirror.constructor.Vim`. | Yes: CodeMirror 5.65.21. |
| Ace `ace/keyboard/vim` | `.ace_editor` element, then `el.env.editor.state.cm.constructor.Vim` (set when the vim keyboard attaches). | Yes: ace-builds 1.44.0. |
| A Vim mode bundled by webpack 5 as its own module (CodeSignal, CoderPad, HackerRank) | A `webpackChunk*` page global. The host pushes a chunk whose runtime function receives each runtime's `require`, then reads the `Vim` object from the exports of a module whose source defines `defineMotion`. It reads only modules the page has already run and does not run an unrun module's factory. Reading exports calls only getters that return a bare variable name, as webpack writes for a module's own variables. Reading a Proxy export can still run page traps, which can load other modules early, and so can a getter written inside a `with` block in a non-strict module. It walks the modules only while an editor element is on the page, and only after a chunk loads or a hot update. It finds nothing when a production build concatenates an ES module port such as @replit/codemirror-vim into the module that imports it. monaco-vim 0.4 resolves to its UMD build under webpack's default `browser` condition and stays its own module; a build that resolves its ES module entry concatenates it and keeps only the exports the page uses. When such a module exports no `Vim` but exports monaco-vim's `initVimMode` (CoderPad), the host calls it once on a stub editor, reads `Vim` from the class of the adapter it returns, and disposes that adapter. It recognizes `initVimMode` under any export name by the status bar event names in its source, so it calls only exported functions that name both events, as `initVimMode` and copies of it do, and stops at the first that yields `Vim`. | Yes: monaco-vim 0.4.4 as a module in a webpack 5 chunk, with no global; also with the module arriving before its dependency, two runtimes sharing the chunk array, the export under a shortened name, and only `initVimMode` exported (a node test also covers a shortened name, a decoy named `initVimMode`, and a throwing call). Checked by hand on the CoderPad sandbox (app.coderpad.io/sandbox). Checked by hand on a HackerRank challenge, whose module exports the adapter class as `default`. An earlier version was checked by hand on CodeSignal, which bundles an older monaco-vim; the current host is not. |

## Features

| Feature | Keys | Notes |
| --- | --- | --- |
| `indent-object` | `ii`, `ai`, `iI`, `aI` | Port of [vim-indent-object](https://github.com/michaeljsmith/vim-indent-object). Works with operators, counts, `.`, and Visual mode, where pressing it again selects the enclosing block. A count of n acts like n presses in Visual mode, as the plugin's doc says. |
| `entire-object` | `ae` | The whole buffer, linewise, as in [vim-textobj-entire](https://github.com/kana/vim-textobj-entire): `yae`, `dae`, `vae`. |
| `yank-to-eol` | `Y` | Yanks to the end of the line, as in Neovim. `C` and `D` already act like `c$` and `d$` in every host. Visual-mode `Y` still yanks lines. |
| `clipboard` | any yank | A yank into the unnamed register also goes to the system clipboard. Deletes and named registers do not. |
| `yank-flash` | any yank | Briefly highlights the text a yank copied, as Neovim's `vim.hl.on_yank()` does: `yiw`, `yy`, `yap`, Visual and block yanks, into any register. It lasts 150 ms, Neovim's default. Deletes and changes do not flash. Monaco (LeetCode, CodeSignal, CoderPad, HackerRank), CodeMirror 5 and Ace; CodeMirror 6's Vim gives the extension no way to mark text, so nothing flashes there. |
| `complete` | `Ctrl-N`, `Ctrl-P` in Insert mode | Completes the word before the cursor from words in the buffer, like Vim's `i_CTRL-N`. No popup: each press puts the next match in place, and after the last the typed prefix returns. `Ctrl-N` meets matches below the cursor first, `Ctrl-P` above. `.` repeats the completed text, and `u` undoes it with the rest of the insert, except in Ace, which undoes typing one key at a time. On Windows and Linux, Chrome keeps `Ctrl-N` for a new window. |
| `move-lines` | `Ctrl-J`, `Ctrl-K` in Normal and Visual mode | Moves the current line, or every line a Visual selection touches, down or up, as the nvim and Zed configs bind them. A count moves that many lines, stopping at the first or last line. Visual mode keeps the selection on the moved lines. One `u` undoes a move. Indentation is left as it is. After an operator (`d<C-j>`) the keys do nothing. |
| `bracket-objects` | `i(`, `a(`, `i[`, `a[`, `i{`, `a{`, `i<`, `a<` (and the closing-bracket and `b`/`B` forms) | Fixes these in monaco-vim (LeetCode, CodeSignal, CoderPad, HackerRank) only. monaco-vim's bracket search misses the open bracket when a pair sits between it and the cursor (`ci(` on the last `)` of `f(g() / x)`), wraps around the buffer, and gives up after ten brackets. The feature swaps in CodeMirror 5's search, which the other hosts already use. |
| `quote-object` | `iq`, `aq` | The quotes around the cursor, whichever of `"`, `'` and `` ` `` they are, as mini.ai's and Zed's `q`: `ciq`, `daq`, `viq`. It reads the cursor's line as code does, so an apostrophe in `it's` or an escaped `\"` is not a quote, and `'x'` inside `"a = 'x'"` is a string of its own; `iq` takes the innermost string around the cursor, or the next one after it when there is none. In Visual mode, pressing it again takes the next step out: `iq` adds the quotes, then the next string's inside. A count does the same in one press, so `d2iq` deletes a string with its quotes, as Vim's `2i"` does. `aq` includes the quotes but no space around them, as `a"` does in these editors. Strings across several lines, such as a template literal, are not found. |
| `comment` | `gc{motion}`, `gcc`, Visual `gc` | Toggles line comments, as Neovim's `gc` and [vim-commentary](https://github.com/tpope/vim-commentary) do: `gcc` the current line, `gcj` it and the line below, `3gcc` three lines, `gcip` a paragraph. If every non-blank line is commented it uncomments them all, otherwise it comments them all at the smallest indent. Blank lines stay blank (Neovim comments them too). The cursor stays put when it is on the first line, as in Neovim, else it goes to the start of the first line. `.` repeats and one `u` undoes. Monaco (LeetCode, CodeSignal, CoderPad, HackerRank) runs its own Toggle Line Comment, which knows every language the page registers; other hosts read the comment token from the editor's language (CodeMirror 5 and Ace modes, CodeMirror 6 language data) and use `//` when it has none. Replaces @replit/codemirror-vim's own `gc`, so every host behaves the same. |
| `change-list` | `g;`, `g,`, `` `. ``, `'.` | `g;` goes to the position of the last change, and again to the one before; `g,` goes back toward newer ones, as in Vim and Zed. A count skips that many. `` `. `` goes to the last change and `'.` to its line. Changes close together on one line, or in one Insert-mode session, keep one position, as in Vim, and positions move with the text around them. Only your typing, pasting, cutting and dropping count: a change the page makes, such as loading code, is not a position, and one that replaces the whole buffer empties the list. A macro records each place it edits. Replaces vim.js's own `` `. `` and `'.`, which do nothing in monaco-vim. |
| `relative-numbers` | `:set rnu`, `:set nornu` | Monaco (LeetCode, CodeSignal, CoderPad, HackerRank) only. Adds a column of relative line numbers between Monaco's own numbers and the code, so a count for `j` or `k` reads off the screen while anyone watching a shared screen still sees the usual numbers. Monaco's folding arrows sit between the column and the code. The column starts off: `:set rnu` (or `:set relativenumber`) shows it, `:set nornu` hides it and gives the margin back, and `:set rnu?` prints which. `:set rnu` works from the editor's first key, since monaco-vim hands vim.js the editor only then. The setting covers every editor on the page and lasts until the page reloads. vim.js has no `:set rnu!`. On other hosts `rnu` stays an unknown option. |
| `rename` | `grn` | Renames the word under the cursor, as Zed's and Neovim's `grn` do. Where Monaco has a rename provider for the language (JavaScript and TypeScript in stock Monaco, and any language a site wires one up for), it opens Monaco's own rename box beside the word, which renames that symbol only; type the new name after the box appears. Everywhere else it asks in Vim's command line, with the old name selected, and replaces every whole-word match in the buffer, strings and comments included, as one change that one `u` undoes. `Esc` or an empty name cancels. |
| `hover` | `gh` | Shows the hover at the cursor, as Zed's `gh` does. In Monaco that is Monaco's own hover: the error or warning under the cursor, and the type or docs when the site has a language service (CoderPad does). Put the cursor on the squiggle; `Esc` closes it. Ace and CodeMirror 5, which have no hover, show the errors on the cursor's line in Vim's message line. CodeMirror 6 keeps its errors where the extension cannot read them, so there `gh` says there is none. |
| `toggle-boolean` | `Ctrl-A`, `Ctrl-X` | Also flip `true` and `false`, `True` and `False`, `TRUE` and `FALSE`, as dial.nvim does. They take the first boolean or number that ends after the cursor on its line, so `Ctrl-A` at the start of `f(1, True)` still adds to the 1. A boolean inside a longer word, such as `istrue`, is left alone. An even count leaves a boolean as it is. `.` repeats and one `u` undoes. Numbers change as vim.js changes them. Visual-mode `Ctrl-A` and `Ctrl-X` are unchanged. |

## Install

Build it first:

```sh
npm install && npm run build
```

This writes the extension to `dist/`.

- Chrome or Edge: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and select the `dist` folder.
- Firefox 128 or later: open `about:debugging`, click **This Firefox**, click **Load Temporary Add-on**, and select `dist/manifest.json`.

After changing a file, run `npm run build` again (or keep `npm run watch` running), reload the extension, then refresh the page. `npm run watch` rebuilds the script but not the manifest.

## Add or remove a feature

Add one module to `src/features/` that exports `install`, and list it in `features` in `src/registry.ts`. Its browser scenarios go in `test/browser/features/<name>.cjs`, listed in `FEATURES` in `test/browser.test.cjs`. To remove a feature, delete its files and lines.

```ts
// src/features/my-feature.ts
import type { VimApi } from "../vim-api.ts";

export const install = (Vim: VimApi) => {
  // Q replays the last recorded macro.
  Vim.map("Q", "@@", "normal");
};
```

`install` runs once per `Vim` object, in the order of `features`. If it throws, the other features still install, and the console shows a warning with the feature's name.

## Add or remove a host

Add one module to `src/hosts/` that exports `find`, and list it in `hosts` in `src/registry.ts`. To remove a host, delete the file and its lines.

```ts
// src/hosts/my-editor.ts: return every Vim object live in the page now.
import type { VimApi } from "../vim-api.ts";
import { property } from "./page.ts";

// The known host path supplies the API; keep page property reads unknown until this check.
export const find = () =>
  [property(property(window, "myEditor"), "Vim")].filter(Boolean) as VimApi[];
```

## Layout

```text
manifest.json          the extension's manifest; the build copies it to dist/
scripts/build.mjs      bundles src/content.ts into dist/content.js with esbuild
src/content.ts         the content script: starts the runtime with every host and feature
src/registry.ts        every host and feature, by name
src/runtime.ts         asks the hosts for Vim objects once a second and installs the features on each
src/vim-api.ts         the Vim API and adapter types used by the extension
src/hosts/             one module per way of finding a page's Vim object
src/features/          one module per feature
src/editor/            shared buffer reads and adapter checks
src/vim/               shared Visual-mode signalling, the findKey hook and the yank hook
test/                  see Tests
```

## Tests

```sh
npm install && npx playwright install webkit && npm test
```

`npm run typecheck` checks the source with strict TypeScript and emits nothing; esbuild writes the bundle. Source imports use explicit `.ts` extensions, supported by both tools. `src/vim-api.ts` owns the narrow types for the Vim API and the adapters each host supplies.

`npm test` type-checks, builds, then runs both suites. `test/node.test.cjs` bundles the runtime, the webpack host and the indent object as the build does, runs them in a `vm` sandbox, and runs the indent range logic against `oracle.json`, which real Vim recorded with the original plugin (`npm run oracle` regenerates it). `test/browser.test.cjs` loads each host page in WebKit with editors from jsDelivr, injects the built content script, types real keys, and compares built-in commands with a page that has no extension. `test/browser/harness.cjs` opens pages and plays keys, and each file in `test/browser/features/` holds one feature's scenarios and any checks it runs before or after them. It needs network access. Run one host with `node test/browser.test.cjs codemirror5`, or another browser with `BROWSER=chromium`.

## Credits and licence

MIT, see `LICENSE`. The indent text objects port vim-indent-object by Michael Smith (MIT); `test/vim-indent-object.vim` is an unchanged copy of the plugin, used only to build the oracle.
