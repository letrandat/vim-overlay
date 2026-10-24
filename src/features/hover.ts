import type { Adapter, VimApi } from "../vim-api.ts";

// gh shows the hover at the cursor, as Zed's gh does: in Monaco, its own hover, with the error or
// warning under the cursor and any type information the site provides. Ace and CodeMirror 5 have
// no hover, so gh shows the errors on the cursor's line in Vim's message line instead.
const ACTION = "vimOverlayHover";

// [severity, message] for the errors the editor marks on a line.
function lineErrors(cm: Adapter, line: number): [string | undefined, string][] {
  if (cm.ace) {
    return cm.ace.session.getAnnotations().filter((a) => a.row === line).map((a) => [a.type, a.text]);
  }
  // CodeMirror 5's lint addon keeps a text marker per problem.
  return (cm.state?.lint?.marked ?? [])
    .map((m) => [m.find(), m.__annotation] as const)
    .filter(([range, a]) => range && a && range.from.line <= line && line <= range.to.line)
    .map(([, a]) => [a!.severity, a!.message]);
}

function notify(cm: Adapter, text: string) {
  if (!cm.openNotification) return;
  const node = document.createElement("span");
  node.style.cssText = "font-family: monospace; white-space: pre-wrap";
  node.textContent = text;
  cm.openNotification(node, { bottom: true, duration: 8000 });
}

function hoverAction(cm: Adapter) {
  const showHover = cm.editor?.getAction?.("editor.action.showHover");
  // After the key, as with rename: newer Monaco closes a widget opened during it.
  if (showHover) return void setTimeout(() => showHover.run());
  const errors = lineErrors(cm, cm.getCursor().line);
  notify(cm, errors.length ? errors.map(([severity, message]) => `${severity || "error"}: ${message}`).join("\n") : "No error on this line");
}

export const install = (Vim: VimApi) => {
  Vim.defineAction(ACTION, hoverAction);
  Vim.mapCommand("gh", "action", ACTION, {}, { context: "normal" });
};
