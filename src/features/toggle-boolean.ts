import type { Action, VimApi } from "../vim-api.ts";

// Ctrl-A and Ctrl-X also flip true and false, True and False, TRUE and FALSE, as
// dial.nvim does. Like vim.js's number increment, they take the first boolean or
// number that ends after the cursor on its line. vim.js keeps its increment
// private, so the number branch copies it to keep numbers unchanged.
const ACTION = "vimOverlayIncrement";
const BOOLEAN = /(?<![\w$])(?:true|false|True|False|TRUE|FALSE)(?![\w$])/g;
const NUMBER = /(-?)(?:(0x)([\da-f]+)|(0b|0|)(\d+))/gi;
const FLIP: Record<string, string> = { true: "false", false: "true", True: "False", False: "True", TRUE: "FALSE", FALSE: "TRUE" };
const BASES: Record<string, number> = { "0b": 2, "0": 8, "": 10, "0x": 16 };

const firstAfter = (re: RegExp, text: string, ch: number) =>
  [...text.matchAll(re)].find((m) => ch < m.index + m[0].length);

function incrementNumber([, sign, hex, hexDigits, prefix, decimalDigits]: RegExpMatchArray, by: number) {
  const baseStr = hex ?? prefix;
  const digits = hexDigits ?? decimalDigits;
  const base = BASES[baseStr.toLowerCase()];
  const number = (parseInt(sign + digits, base) + by).toString(base);
  // vim.js keeps a prefixed number's width.
  const padding = baseStr ? "0".repeat(Math.max(0, digits.length - number.length + sign.length)) : "";
  return number.startsWith("-") ? "-" + baseStr + padding + number.slice(1) : baseStr + padding + number;
}

const increment: Action<{ increase: boolean; repeat: number }> = (cm, args) => {
  const cur = cm.getCursor();
  const text = cm.getLine(cur.line);
  const word = firstAfter(BOOLEAN, text, cur.ch);
  const number = firstAfter(NUMBER, text, cur.ch);
  const match = word && !(number && number.index < word.index) ? word : number;
  if (!match) return;
  // A boolean has two values, so an even count leaves it as it is.
  const replacement = match === word
    ? (args.repeat % 2 ? FLIP[match[0]] : match[0])
    : incrementNumber(match, args.increase ? args.repeat : -args.repeat);
  if (replacement !== match[0]) {
    cm.replaceRange(replacement, { line: cur.line, ch: match.index }, { line: cur.line, ch: match.index + match[0].length });
  }
  cm.setCursor({ line: cur.line, ch: match.index + replacement.length - 1 });
};

export const install = (Vim: VimApi) => {
  Vim.defineAction(ACTION, increment);
  Vim.mapCommand("<C-a>", "action", ACTION, { increase: true }, { context: "normal", isEdit: true });
  Vim.mapCommand("<C-x>", "action", ACTION, { increase: false }, { context: "normal", isEdit: true });
};
