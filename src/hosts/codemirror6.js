// @replit/codemirror-vim (6.0 to 6.4) does not set CodeMirror.Vim on its adapter class, so this
// finds nothing on stock pages. It works where a page sets it, e.g. `getCM(view).constructor.Vim = Vim`.
window.vimOverlay.hosts.push({
  name: "codemirror6",
  find() {
    return [...document.querySelectorAll(".cm-content")]
      .map((el) => {
        // @codemirror/view 6.39+ stores the tile tree on cmTile; older versions on cmView.
        const view = el.cmTile?.root?.view ?? el.cmView?.rootView?.view;
        return view?.cm?.constructor?.Vim;
      })
      .filter(Boolean);
  },
});
