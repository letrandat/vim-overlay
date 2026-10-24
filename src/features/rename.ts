import type { Adapter, Pos, VimApi } from "../vim-api.ts";
import { bufferLines } from "../editor/lines.ts";

// grn renames the word under the cursor, as Zed's and Neovim's grn do. Where Monaco has a rename
// provider for the language (JavaScript and TypeScript in stock Monaco), it opens Monaco's own
// rename box. Elsewhere it asks for the new name in Vim's command line, with the old one
// selected, and replaces every whole-word match in the buffer as one change.
const ACTION = "vimOverlayRename";
const WORD = "[\\p{L}\\p{N}_]";

// The word at or after the cursor on its line, as * picks it.
interface Target { word: string; line: number; start: number }

function wordAt(cm: Adapter, { line, ch }: Pos): Target | null {
  for (const m of cm.getLine(line).matchAll(new RegExp(`${WORD}+`, "gu"))) {
    if (m.index + m[0].length > ch) return { word: m[0], line, start: m.index };
  }
  return null;
}

function rename(cm: Adapter, target: Target, name: string) {
  const re = new RegExp(`(?<!${WORD})${target.word}(?!${WORD})`, "gu");
  const { first, lines } = bufferLines(cm);
  let from = -1, to = -1, shift = 0; // indexes into lines of the first and last changed line
  const next = lines.map((text, i) =>
    text.replace(re, (match, at) => {
      if (from < 0) from = i;
      to = i;
      if (first + i === target.line && at < target.start) shift += name.length - match.length;
      return name;
    })
  );
  if (from < 0) return;
  // One edit over the lines that change, so one u undoes the rename.
  cm.replaceRange(next.slice(from, to + 1).join("\n"), { line: first + from, ch: 0 }, { line: first + to, ch: lines[to].length });
  cm.setCursor({ line: target.line, ch: target.start + shift });
}

function prompt(cm: Adapter, target: Target) {
  // The target is assumed to still be in the buffer when the delayed prompt opens.
  const count = bufferLines(cm).lines.join("\n").match(new RegExp(`(?<!${WORD})${target.word}(?!${WORD})`, "gu"))!.length;
  // The shape of vim.js's own prompt, which every adapter's openDialog takes.
  const input = Object.assign(document.createElement("input"), { type: "text", autocomplete: "off", spellcheck: false });
  const label = document.createElement("span");
  label.style.cssText = "font-family: monospace; white-space: pre";
  label.append(`Rename ${target.word} to `, input);
  const desc = document.createElement("span");
  desc.style.color = "#888";
  desc.textContent = ` ${count} in the file`;
  const template = document.createDocumentFragment();
  template.append(label, desc);
  const onClose = (name: unknown) => {
    if (typeof name === "string" && name && name !== target.word) rename(cm, target, name);
  };
  if (!cm.openDialog) return onClose(window.prompt(`Rename ${target.word} to`, target.word));
  cm.openDialog(template, onClose, { bottom: true, value: target.word, selectValueOnOpen: true });
  input.select(); // monaco-vim selects the input before it fills it in
}

function renameAction(cm: Adapter) {
  const target = wordAt(cm, cm.getCursor());
  // After the key: a box or prompt opened while the editor still handles it loses focus to the
  // editor in newer Monaco (CoderPad), which closes it.
  setTimeout(() => {
    const monacoRename = cm.editor?.getAction?.("editor.action.rename");
    if (monacoRename?.isSupported?.()) monacoRename.run();
    else if (target) prompt(cm, target);
  });
}

export const install = (Vim: VimApi) => {
  Vim.defineAction(ACTION, renameAction);
  Vim.mapCommand("grn", "action", ACTION, {}, { context: "normal" });
};
