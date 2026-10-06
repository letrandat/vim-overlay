window.vimOverlay.hosts.push({
  name: "codemirror5",
  find() {
    return [...document.querySelectorAll(".CodeMirror")]
      .map((el) => el.CodeMirror?.constructor?.Vim)
      .filter(Boolean);
  },
});
