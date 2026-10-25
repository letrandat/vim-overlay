// Every host and feature, by the name a failure warning shows. Features install in this order.
import { find as monacoVim } from "./hosts/monaco-vim.ts";
import { find as codemirror6 } from "./hosts/codemirror6.ts";
import { find as codemirror5 } from "./hosts/codemirror5.ts";
import { find as ace } from "./hosts/ace.ts";
import { find as webpack } from "./hosts/webpack.ts";
import { install as indentObject } from "./features/indent-object.ts";
import { install as entireObject } from "./features/entire-object.ts";
import { install as yankToEol } from "./features/yank-to-eol.ts";
import { install as clipboard } from "./features/clipboard.ts";
import { install as complete } from "./features/complete.ts";
import { install as moveLines } from "./features/move-lines.ts";
import { install as bracketObjects } from "./features/bracket-objects.ts";
import { install as quoteObject } from "./features/quote-object.ts";
import { install as comment } from "./features/comment.ts";
import { install as changeList } from "./features/change-list.ts";
import { install as relativeNumbers } from "./features/relative-numbers.ts";
import { install as rename } from "./features/rename.ts";
import { install as hover } from "./features/hover.ts";
import { install as toggleBoolean } from "./features/toggle-boolean.ts";

export const hosts = { "monaco-vim": monacoVim, codemirror6, codemirror5, ace, webpack };

export const features = {
  "indent-object": indentObject,
  "entire-object": entireObject,
  "yank-to-eol": yankToEol,
  clipboard,
  complete,
  "move-lines": moveLines,
  "bracket-objects": bracketObjects,
  "quote-object": quoteObject,
  comment,
  "change-list": changeList,
  "relative-numbers": relativeNumbers,
  rename,
  hover,
  "toggle-boolean": toggleBoolean,
};
