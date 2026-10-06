// ace/keyboard/vim puts its CodeMirror adapter on editor.state.cm when it attaches.
window.vimOverlay.hosts.push({
  name: "ace",
  find() {
    return [...document.querySelectorAll(".ace_editor")]
      .map((el) => el.env?.editor?.state?.cm?.constructor?.Vim)
      .filter(Boolean);
  },
});
