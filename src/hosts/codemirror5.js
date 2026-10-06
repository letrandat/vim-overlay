window.vimOverlay.hosts.codemirror5 = () =>
  [...document.querySelectorAll(".CodeMirror")].map((el) => el.CodeMirror?.constructor?.Vim).filter(Boolean);
