// Yanks into the unnamed register also go to the system clipboard. Deletes and
// named registers do not.
window.vimOverlay.features.clipboard = (Vim) => {
  // Wrapped on the prototype so a register controller made by a state reset keeps it.
  const proto = Object.getPrototypeOf(Vim.getRegisterController());
  const pushText = proto.pushText;
  if (pushText.vimOverlay) return;
  proto.pushText = function (registerName, operator, ...rest) {
    pushText.call(this, registerName, operator, ...rest);
    if (operator === "yank" && (!registerName || registerName === '"'))
      // Rejected when the page lacks focus or clipboard permission; the register still holds the text.
      navigator.clipboard?.writeText(this.unnamedRegister.toString()).catch(() => {});
  };
  proto.pushText.vimOverlay = true;
};
