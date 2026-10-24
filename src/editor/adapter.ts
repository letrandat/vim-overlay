import type { Adapter, MonacoEditor } from "../vim-api.ts";

// Monaco's adapter alone exposes an editor with a model; Ace and CM6 use their own links.
export const isMonaco = (cm: Adapter | undefined): cm is Adapter & { editor: MonacoEditor } =>
  !!cm?.editor?.getModel;
