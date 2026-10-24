// Shared by the harness pages. Each page sets window.cm (the current vim.js
// adapter), window.setText(text) and window.remount(), then calls track(Vim)
// before the extension can see the Vim object and watch(cm) on every editor.
window.track = (Vim) => {
  window.testVim = Vim;
  window.testOperators = {};
  window.calls = { defineMotion: 0, defineAction: 0, defineOperator: 0, mapCommand: 0, map: 0 };
  for (const name of Object.keys(window.calls)) {
    const real = Vim[name];
    Vim[name] = function (...args) {
      window.calls[name]++;
      if (name === "defineOperator") window.testOperators[args[0]] = args[1];
      return real.apply(this, args);
    };
  }
};
window.watch = (cm) => {
  window.cm = cm;
  cm.on("vim-mode-change", (e) => (window.lastMode = e.mode + (e.subMode ? "/" + e.subMode : "")));
};
