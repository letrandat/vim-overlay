// The popup's choices, and how the content script in the page's world gets them. That world
// cannot read extension storage, so src/bridge.ts, in the extension's own world, reads them and
// answers the content script's question with DOM events, which both worlds share. It also passes
// on each change the popup makes while the page is open.

// relativeNumbers is the popup's "Relative line numbers" box: whether relative-numbers shows its
// column when a page loads, and again each time the box changes. Settings saved before the box
// existed have no such key, so the box starts unticked for everyone.
export type Settings = { on: boolean; off: string[]; relativeNumbers: boolean };
export const DEFAULTS: Settings = { on: true, off: [], relativeNumbers: false };
// Features the popup gives a row of their own instead of a box in its list. They stay installed
// while the master switch is on, even if an older popup saved them in off, and follow their own
// setting on open pages at once (see watchSettings).
export const OWN_ROW = ["relative-numbers"];

export const ASK = "vim-overlay:ask";
export const ANSWER = "vim-overlay:settings";
export const CHANGE = "vim-overlay:change";

let current: Settings = DEFAULTS;
const watchers: ((settings: Settings) => void)[] = [];
// The settings the page runs with: the bridge's answer, then each change it passes on.
export const currentSettings = () => current;
// Calls back with the settings each time the popup changes them while the page is open.
export const watchSettings = (callback: (settings: Settings) => void) => void watchers.push(callback);

function follow() {
  document.addEventListener(CHANGE, (event) => {
    let next: Settings;
    try {
      next = JSON.parse((event as CustomEvent).detail);
    } catch {
      return;
    }
    if (typeof next?.on !== "boolean" || !Array.isArray(next.off) || typeof next.relativeNumbers !== "boolean") return;
    current = next;
    for (const watcher of watchers) watcher(next);
  });
}

// Calls back once with the settings. The bridge answers at once: with the settings, or with an
// empty answer while it still reads them and the settings after. No answer means no bridge, as
// when a test injects the content script alone, so every feature runs with the defaults. Changes
// are followed either way: a page can send these events as the bridge does.
export function whenSettings(callback: (settings: Settings) => void) {
  follow();
  let answered = false;
  const listen = (event: Event) => {
    answered = true;
    const detail = (event as CustomEvent).detail;
    if (!detail) return;
    document.removeEventListener(ANSWER, listen);
    current = JSON.parse(detail);
    callback(current);
  };
  document.addEventListener(ANSWER, listen);
  document.dispatchEvent(new CustomEvent(ASK));
  if (answered) return;
  document.removeEventListener(ANSWER, listen);
  callback(DEFAULTS);
}

// The features the settings leave on, in the order given. A feature with a row of its own stays on.
export function pick<T>(features: Record<string, T>, settings: Settings): Record<string, T> {
  if (!settings.on) return {};
  return Object.fromEntries(Object.entries(features).filter(([name]) => OWN_ROW.includes(name) || !settings.off.includes(name)));
}
