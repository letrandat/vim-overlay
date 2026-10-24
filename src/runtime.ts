// Asks every host once a second for the Vim objects in the page, and installs every feature on
// each one once.
import type { VimApi } from "./vim-api.ts";

export function start(hosts: Record<string, () => VimApi[]>, features: Record<string, (Vim: VimApi) => void>) {
  // A second copy of the extension's script in this frame leaves the work to the first.
  const STARTED = Symbol.for("vim-overlay");
  const page = window as unknown as Window & { [key: symbol]: unknown };
  if (page[STARTED]) return;
  page[STARTED] = true;
  const installed = new WeakSet<VimApi>();

  function scan() {
    for (const [name, find] of Object.entries(hosts)) {
      let found;
      try {
        found = find();
      } catch (err) {
        console.warn(`[vim-overlay] host ${name} failed:`, err);
        continue;
      }
      for (const Vim of found) {
        if (!Vim || installed.has(Vim)) continue;
        installed.add(Vim);
        for (const [name, install] of Object.entries(features)) {
          try {
            install(Vim);
          } catch (err) {
            console.warn(`[vim-overlay] feature ${name} failed:`, err);
          }
        }
      }
    }
  }

  scan();
  setInterval(scan, 1000);
}
