(() => {
  const overlay = window.vimOverlay;
  // Kept on the shared object so a second injected copy neither installs twice nor polls twice.
  if (overlay.installed) return;
  overlay.installed = new WeakSet();

  function scan() {
    for (const host of overlay.hosts) {
      let found;
      try {
        found = host.find();
      } catch (err) {
        console.warn(`[vim-overlay] host ${host.name} failed:`, err);
        continue;
      }
      for (const Vim of found) {
        if (!Vim || overlay.installed.has(Vim)) continue;
        overlay.installed.add(Vim);
        for (const feature of overlay.features) {
          try {
            feature.install(Vim);
          } catch (err) {
            console.warn(`[vim-overlay] feature ${feature.name} failed:`, err);
          }
        }
      }
    }
  }

  scan();
  setInterval(scan, 1000);
})();
