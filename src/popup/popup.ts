// The toolbar popup: a master switch and a checkbox per feature, saved in extension storage.
// Pages read the settings when they load, so a change asks for a reload.
import { DEFAULTS, type Settings } from "../settings.ts";
import { KEYS } from "./features.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const names = Object.keys(KEYS) as (keyof typeof KEYS)[];
let settings: Settings = DEFAULTS;

function render() {
  $<HTMLInputElement>("on").checked = settings.on;
  $("features").classList.toggle("off", !settings.on);
  for (const box of document.querySelectorAll<HTMLInputElement>("#features input")) {
    box.checked = !settings.off.includes(box.value);
    box.disabled = !settings.on;
  }
  const on = names.length - settings.off.length;
  $("count").textContent = settings.on ? `${on} of ${names.length} on` : "Off on every site";
  $("all-on").hidden = !settings.off.length;
}

function save(next: Settings) {
  settings = next;
  render();
  $("reload").hidden = false;
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
$("all-on").addEventListener("click", () => save({ ...settings, off: [] }));
$("reload-page").addEventListener("click", () => chrome.tabs.reload().then(() => close()));

chrome.storage.sync.get(DEFAULTS).then((stored) => {
  // Drop the names of features the extension no longer has.
  settings = { on: stored.on, off: stored.off.filter((n) => n in KEYS) };
  render();
});
