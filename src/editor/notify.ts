import type { Adapter } from "../vim-api.ts";

// Shows text in Vim's message line, where the adapter has one.
export function notify(cm: Adapter, text: string) {
  if (!cm.openNotification) return;
  const node = document.createElement("span");
  node.style.cssText = "font-family: monospace; white-space: pre-wrap";
  node.textContent = text;
  cm.openNotification(node, { bottom: true, duration: 8000 });
}
