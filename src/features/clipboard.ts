import type { RegisterController, VimApi } from "../vim-api.ts";
import { afterYank } from "../vim/yank.ts";

// Yanks into the unnamed register also go to the system clipboard. Deletes and
// named registers do not.
const copy = (controller: RegisterController, registerName: string | undefined) => {
  if (!registerName || registerName === '"')
    // Rejected when the page lacks focus or clipboard permission; the register still holds the text.
    navigator.clipboard?.writeText(controller.unnamedRegister.toString()).catch(() => {});
};

export const install = (Vim: VimApi) => afterYank(Vim, copy);
