# vim-overlay

A browser extension that adds missing Vim features to the Vim mode a page's code editor already runs. Web Vim modes are ports of CodeMirror's `vim.js` and share its `Vim` API (`defineMotion`, `mapCommand`, `map`, `defineEx`, ...). The extension finds that object in the page and installs each feature on it once.

## Hosts

A host finds the `Vim` objects live in the page. `src/main.js` asks every host once a second.

| Host | How it is found | Tested |
| --- | --- | --- |
| monaco-vim (LeetCode) | `window.monacoVim.VimMode.Vim` (LeetCode) or `window.MonacoVim.VimMode.Vim` (UMD global). monaco-vim keeps its adapter off the editor and the DOM, so only these globals work. | Yes: monaco-vim 0.4.4, Monaco 0.52.2, global set late as LeetCode does. The `MonacoVim` path is not tested. |
| CodeMirror 6 + @replit/codemirror-vim | `.cm-content` element, then its EditorView (`cmTile` in @codemirror/view 6.39+, `cmView` before), then `view.cm.constructor.Vim`. | **No on stock pages.** @replit/codemirror-vim 6.0 to 6.4 never sets `CodeMirror.Vim`, and nothing on the editor or DOM leads to its `Vim` object. Tested: on a stock page the host finds nothing and built-ins are unchanged. On a page that sets `getCM(view).constructor.Vim = Vim`, the feature passes the full suite. |
| CodeMirror 5 vim keymap | `.CodeMirror` element, then `el.CodeMirror.constructor.Vim`. | Yes: CodeMirror 5.65.21. |
| Ace `ace/keyboard/vim` | `.ace_editor` element, then `el.env.editor.state.cm.constructor.Vim` (set when the vim keyboard attaches). | Yes: ace-builds 1.44.0. |

## Features

| Feature | Keys | Notes |
| --- | --- | --- |
| `indent-object` | `ii`, `ai`, `iI`, `aI` | Port of [vim-indent-object](https://github.com/michaeljsmith/vim-indent-object). Works with operators, counts, `.`, and Visual mode, where pressing it again selects the enclosing block. A count of n acts like n presses in Visual mode, as the plugin's doc says. |

## Install

- Chrome or Edge: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and select this folder.
- Firefox 128 or later: open `about:debugging`, click **This Firefox**, click **Load Temporary Add-on**, and select `manifest.json`.

## Add or remove a feature

Add one file to `src/features/` and list it in `manifest.json` under `content_scripts[0].js`, before `src/main.js`. To remove a feature, delete the file and its line.

```js
// src/features/yank-to-eol.js
window.vimOverlay.features.push({
  name: "yank-to-eol",
  install(Vim) {
    // Y yanks to the end of the line, as in Neovim.
    Vim.map("Y", "y$", "normal");
  },
});
```

`install(Vim)` runs once per `Vim` object. If it throws, the other features still install, and the console shows a warning with the feature name.

## Add or remove a host

Add one file to `src/hosts/` and list it in `manifest.json` before `src/main.js`. To remove a host, delete the file and its line.

```js
window.vimOverlay.hosts.push({
  name: "my-editor",
  find() {
    return [window.myEditor?.Vim].filter(Boolean); // every Vim object live in the page now
  },
});
```

## Tests

```sh
cd test && npm install && npx playwright install webkit && npm test
```

`node.test.cjs` checks `main.js` and runs the indent range logic against `oracle.json`, which real Vim recorded with the original plugin (`npm run oracle` regenerates it). `browser.test.cjs` loads each host page in WebKit with editors from jsDelivr, injects the manifest's scripts in manifest order, types real keys, and compares built-in commands with a page that has no extension. It needs network access. Run one host with `node browser.test.cjs codemirror5`, or another browser with `BROWSER=chromium`.

## Credits and licence

MIT, see `LICENSE`. The indent text objects port vim-indent-object by Michael Smith (MIT); `test/vim-indent-object.vim` is an unchanged copy of the plugin, used only to build the oracle.
