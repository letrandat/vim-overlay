export const find = () =>
  [...document.querySelectorAll(".CodeMirror")].map((el) => el.CodeMirror?.constructor?.Vim).filter(Boolean);
