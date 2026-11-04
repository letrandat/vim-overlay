// The toolbar popup: a master switch, the "Relative line numbers" box and a checkbox per feature,
// saved in extension storage. Pages read the settings when they load, so a change asks for a
// reload, except a change to the relative line numbers box alone, which open pages apply at once.
import { DEFAULTS, OWN_ROW, type Settings } from "../settings.ts";
import { KEYS } from "./features.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// The features listed with a box each; one with a row of its own is not.
const names = (Object.keys(KEYS) as (keyof typeof KEYS)[]).filter((name) => !OWN_ROW.includes(name));
let settings: Settings = DEFAULTS;

function render() {
  $<HTMLInputElement>("on").checked = settings.on;
  $("features").classList.toggle("off", !settings.on);
  $("numbers").classList.toggle("off", !settings.on);
  const numbers = $<HTMLInputElement>("rnu");
  numbers.checked = settings.relativeNumbers;
  numbers.disabled = !settings.on;
  for (const box of document.querySelectorAll<HTMLInputElement>("#features input")) {
    box.checked = !settings.off.includes(box.value);
    box.disabled = !settings.on;
  }
  const on = names.length - settings.off.length;
  $("count").textContent = settings.on ? `${on} of ${names.length} on` : "Off on every site";
  $("all-on").hidden = !settings.off.length;
}

// Whether open pages need a reload to apply the change from prev to next.
function needsReload(prev: Settings, next: Settings) {
  return prev.on !== next.on || [...prev.off].sort().join() !== [...next.off].sort().join();
}

function save(next: Settings) {
  if (needsReload(settings, next)) $("reload").hidden = false;
  settings = next;
  render();
  chrome.storage.sync.set(settings);
}

$("features").append(
  ...names.map((name) => {
    const label = document.createElement("label");
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: name });
    const kbd = Object.assign(document.createElement("kbd"), { textContent: KEYS[name] });
    label.append(box, ` ${name}`, kbd);
    box.addEventListener("change", () =>
      save({ ...settings, off: box.checked ? settings.off.filter((n) => n !== name) : [...settings.off, name] })
    );
    return label;
  })
);
$("on").addEventListener("change", () => save({ ...settings, on: $<HTMLInputElement>("on").checked }));
$("rnu").addEventListener("change", () => save({ ...settings, relativeNumbers: $<HTMLInputElement>("rnu").checked }));
$("all-on").addEventListener("click", () => save({ ...settings, on: true, off: [] }));
$("reload-page").addEventListener("click", () => chrome.tabs.reload().then(() => close()));

chrome.storage.sync.get(DEFAULTS).then((stored) => {
  // Drop the names of features the extension no longer lists, such as relative-numbers, which an
  // older popup listed.
  settings = { on: stored.on, off: stored.off.filter((n) => (names as string[]).includes(n)), relativeNumbers: stored.relativeNumbers };
  render();
});
