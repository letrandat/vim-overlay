import type { FindKey, VimApi } from "../vim-api.ts";

type KeyHook = (this: VimApi, ...args: Parameters<FindKey>) => void;
const hooks = new WeakMap<VimApi, KeyHook[]>();

export function beforeKey(Vim: VimApi, hook: KeyHook) {
  const registered = hooks.get(Vim);
  if (registered) {
    // Each former wrapper ran before the wrapper installed ahead of it.
    hooks.set(Vim, [hook, ...registered]);
    return;
  }
  hooks.set(Vim, [hook]);
  const findKey = Vim.findKey;
  Vim.findKey = function (cm, ...rest) {
    for (const callback of hooks.get(Vim)!) callback.call(this, cm, ...rest);
    return findKey.call(this, cm, ...rest);
  };
}
