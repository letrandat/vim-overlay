// The bridge: runs in the extension's own world from document start, reads the popup's settings
// and answers the content script with them (see src/settings.ts).
import { ANSWER, ASK, DEFAULTS } from "./settings.ts";

let settings = "";
const answer = () => document.dispatchEvent(new CustomEvent(ANSWER, { detail: settings }));
document.addEventListener(ASK, answer);
chrome.storage.sync.get(DEFAULTS).then((stored) => {
  settings = JSON.stringify(stored);
  answer();
});
