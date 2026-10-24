// ace/keyboard/vim puts its CodeMirror adapter on editor.state.cm when it attaches.
export const find = () =>
  [...document.querySelectorAll(".ace_editor")].map((el) => el.env?.editor?.state?.cm?.constructor?.Vim).filter(Boolean);
