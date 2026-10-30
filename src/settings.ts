// The popup's choices, and how the content script in the page's world gets them. That world
// cannot read extension storage, so src/bridge.ts, in the extension's own world, reads them and
// answers the content script's question with DOM events, which both worlds share.

export type Settings = { on: boolean; off: string[] };
export const DEFAULTS: Settings = { on: true, off: [] };

export const ASK = "vim-overlay:ask";
export const ANSWER = "vim-overlay:settings";

// Calls back once with the settings. The bridge answers at once: with the settings, or with an
// empty answer while it still reads them and the settings after. No answer means no bridge, as
// when a test injects the content script alone, so every feature runs.
export function whenSettings(callback: (settings: Settings) => void) {
  let answered = false;
  const listen = (event: Event) => {
    answered = true;
    const detail = (event as CustomEvent).detail;
    if (!detail) return;
    document.removeEventListener(ANSWER, listen);
    callback(JSON.parse(detail));
  };
  document.addEventListener(ANSWER, listen);
  document.dispatchEvent(new CustomEvent(ASK));
  if (answered) return;
  document.removeEventListener(ANSWER, listen);
  callback(DEFAULTS);
}

// The features the settings leave on, in the order given.
export function pick<T>(features: Record<string, T>, settings: Settings): Record<string, T> {
  if (!settings.on) return {};
  return Object.fromEntries(Object.entries(features).filter(([name]) => !settings.off.includes(name)));
}
