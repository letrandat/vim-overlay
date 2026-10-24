import type { Adapter } from "../vim-api.ts";

export const readLines = (cm: Adapter, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => cm.getLine(from + i));

// CodeMirror 5 documents can start at a line other than 0.
export function bufferLines(cm: Adapter) {
  const first = cm.firstLine?.() ?? 0;
  return { first, lines: readLines(cm, first, cm.lastLine()) };
}
