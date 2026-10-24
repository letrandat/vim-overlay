// Every host and feature, by the name a failure warning shows. Features install in this order.
import { find as monacoVim } from "./hosts/monaco-vim.js";
import { find as codemirror6 } from "./hosts/codemirror6.js";
import { find as codemirror5 } from "./hosts/codemirror5.js";
import { find as ace } from "./hosts/ace.js";
import { find as webpack } from "./hosts/webpack.js";
import { install as indentObject } from "./features/indent-object.js";
import { install as entireObject } from "./features/entire-object.js";
import { install as yankToEol } from "./features/yank-to-eol.js";
import { install as clipboard } from "./features/clipboard.js";
import { install as complete } from "./features/complete.js";
import { install as moveLines } from "./features/move-lines.js";
import { install as bracketObjects } from "./features/bracket-objects.js";
import { install as quoteObject } from "./features/quote-object.js";
import { install as comment } from "./features/comment.js";
import { install as changeList } from "./features/change-list.js";
import { install as relativeNumbers } from "./features/relative-numbers.js";
import { install as rename } from "./features/rename.js";
import { install as hover } from "./features/hover.js";

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
};
