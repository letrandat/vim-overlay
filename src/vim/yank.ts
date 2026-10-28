import type { PushText, RegisterController, VimApi } from "../vim-api.ts";

type YankHook = (controller: RegisterController, registerName: string | undefined) => void;
// Kept per register controller prototype, which every Vim of one vim.js copy shares, so a hook
// added again for another Vim of that copy still runs once.
const hooks = new WeakMap<object, Set<YankHook>>();

// Runs the hook after vim.js puts a yank in a register.
export function afterYank(Vim: VimApi, hook: YankHook) {
  // Wrapped on the prototype so a register controller made by a state reset keeps it.
  const proto = Object.getPrototypeOf(Vim.getRegisterController()) as { pushText: PushText };
  const registered = hooks.get(proto);
  if (registered) {
    registered.add(hook);
    return;
  }
  hooks.set(proto, new Set([hook]));
  const pushText = proto.pushText;
  proto.pushText = function (registerName, operator, ...rest) {
    pushText.call(this, registerName, operator, ...rest);
    if (operator === "yank") for (const callback of hooks.get(proto)!) callback(this, registerName);
  };
}
