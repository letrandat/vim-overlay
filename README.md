# vim-overlay

A browser extension that adds missing Vim features to the Vim mode a page's code editor already runs. Web Vim modes are ports of CodeMirror's `vim.js` and share its `Vim` API (`defineMotion`, `mapCommand`, `map`, `defineEx`, ...). The extension finds that object in the page and installs each feature on it once.

## Hosts

A host finds the `Vim` objects live in the page. `src/main.js` asks every host once a second.

| Host | How it is found | Tested |
| --- | --- | --- |
| monaco-vim (LeetCode) | `window.monacoVim.VimMode.Vim` (LeetCode) or `window.MonacoVim.VimMode.Vim` (UMD global). monaco-vim keeps its adapter off the editor and the DOM, so only these globals work. | Yes: monaco-vim 0.4.4, Monaco 0.52.2, global set late as LeetCode does. The `MonacoVim` path is not tested. |
| CodeMirror 6 + @replit/codemirror-vim | `.cm-content` element, then its EditorView (`cmTile` in @codemirror/view 6.39+, `cmView` before), then `view.cm.constructor.Vim`. | **No on stock pages.** @replit/codemirror-vim 6.0 to 6.4 exports `Vim` from its module but never sets `CodeMirror.Vim`, so the adapter this host reaches through the DOM does not carry it. On a page bundled by webpack 5, the `webpack` host below may find it instead, but only in builds that keep it as its own module (development builds, or production builds without module concatenation); that path is not tested. Tested: on a stock page the host finds nothing and built-ins are unchanged. On a page that sets `getCM(view).constructor.Vim = Vim`, the feature passes the full suite. |
| CodeMirror 5 vim keymap | `.CodeMirror` element, then `el.CodeMirror.constructor.Vim`. | Yes: CodeMirror 5.65.21. |
| Ace `ace/keyboard/vim` | `.ace_editor` element, then `el.env.editor.state.cm.constructor.Vim` (set when the vim keyboard attaches). | Yes: ace-builds 1.44.0. |
| A Vim mode bundled by webpack 5 as its own module (CodeSignal) | A `webpackChunk*` page global. The host pushes a chunk whose runtime function receives each runtime's `require`, then reads the `Vim` object from the exports of a module whose source defines `defineMotion`. It reads only modules the page has already run and does not run an unrun module's factory. Reading exports calls only the getters webpack writes for a module's own variables. Reading a Proxy export can still run page traps, which can load other modules early. It walks the modules only while an editor element is on the page, and only after a chunk loads or a hot update. It finds nothing when a production build concatenates an ES module port such as @replit/codemirror-vim into the module that imports it; monaco-vim 0.4 resolves to its CommonJS build and stays its own module. | Yes: monaco-vim 0.4.4 as a module in a webpack 5 chunk, with no global; also with the module arriving before its dependency, two runtimes sharing the chunk array, and the export under a shortened name. Checked by hand on CodeSignal, which bundles an older monaco-vim. |

## Features

| Feature | Keys | Notes |
| --- | --- | --- |
| `indent-object` | `ii`, `ai`, `iI`, `aI` | Port of [vim-indent-object](https://github.com/michaeljsmith/vim-indent-object). Works with operators, counts, `.`, and Visual mode, where pressing it again selects the enclosing block. A count of n acts like n presses in Visual mode, as the plugin's doc says. |
| `entire-object` | `ae` | The whole buffer, linewise, as in [vim-textobj-entire](https://github.com/kana/vim-textobj-entire): `yae`, `dae`, `vae`. |
| `yank-to-eol` | `Y` | Yanks to the end of the line, as in Neovim. `C` and `D` already act like `c$` and `d$` in every host. Visual-mode `Y` still yanks lines. |
| `clipboard` | any yank | A yank into the unnamed register also goes to the system clipboard. Deletes and named registers do not. |
| `complete` | `Ctrl-N`, `Ctrl-P` in Insert mode | Completes the word before the cursor from words in the buffer, like Vim's `i_CTRL-N`. No popup: each press puts the next match in place, and after the last the typed prefix returns. `Ctrl-N` meets matches below the cursor first, `Ctrl-P` above. `.` repeats the completed text, and `u` undoes it with the rest of the insert, except in Ace, which undoes typing one key at a time. On Windows and Linux, Chrome keeps `Ctrl-N` for a new window. |

## Install

- Chrome or Edge: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and select this folder.
- Firefox 128 or later: open `about:debugging`, click **This Firefox**, click **Load Temporary Add-on**, and select `manifest.json`.

After changing a file, reload the extension, then refresh the page.

## Add or remove a feature

Add one file to `src/features/` and list it in `manifest.json` under `content_scripts[0].js`, before `src/main.js`. To remove a feature, delete the file and its line.

```js
// src/features/my-feature.js
window.vimOverlay.features["my-feature"] = (Vim) => {
  // Q replays the last recorded macro.
  Vim.map("Q", "@@", "normal");
};
```

The function runs once per `Vim` object. If it throws, the other features still install, and the console shows a warning with the feature name.

## Add or remove a host

Add one file to `src/hosts/` and list it in `manifest.json` before `src/main.js`. To remove a host, delete the file and its line.

```js
// src/hosts/my-editor.js: return every Vim object live in the page now.
window.vimOverlay.hosts["my-editor"] = () => [window.myEditor?.Vim].filter(Boolean);
```

## Tests

```sh
cd test && npm install && npx playwright install webkit && npm test
```

`node.test.cjs` checks `main.js` and runs the indent range logic against `oracle.json`, which real Vim recorded with the original plugin (`npm run oracle` regenerates it). `browser.test.cjs` loads each host page in WebKit with editors from jsDelivr, injects the manifest's scripts in manifest order, types real keys, and compares built-in commands with a page that has no extension. It needs network access. Run one host with `node browser.test.cjs codemirror5`, or another browser with `BROWSER=chromium`.

## Credits and licence

MIT, see `LICENSE`. The indent text objects port vim-indent-object by Michael Smith (MIT); `test/vim-indent-object.vim` is an unchanged copy of the plugin, used only to build the oracle.
