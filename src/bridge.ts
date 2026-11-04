// The bridge: runs in the extension's own world from document start, reads the popup's settings
// and answers the content script with them, then passes on each change (see src/settings.ts).
import { ANSWER, ASK, CHANGE, DEFAULTS } from "./settings.ts";

let settings = "";
const answer = () => document.dispatchEvent(new CustomEvent(ANSWER, { detail: settings }));
document.addEventListener(ASK, answer);
chrome.storage.sync.get(DEFAULTS).then((stored) => {
  settings = JSON.stringify(stored);
  answer();
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(DEFAULTS).then((stored) => {
    settings = JSON.stringify(stored);
    document.dispatchEvent(new CustomEvent(CHANGE, { detail: settings }));
  });
});
