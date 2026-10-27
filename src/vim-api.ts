// The shared vim.js surface we use. Hosts supply their own fork and adapter; no editor package is imported.
export interface Pos {
  line: number;
  ch: number;
}

export interface Selection {
  anchor: Pos;
  head: Pos;
}

// Private vim.js state, shared by its CodeMirror, Monaco and Ace ports.
export interface VimState {
  visualMode?: boolean;
  visualLine?: boolean;
  visualBlock?: boolean;
  insertMode?: boolean;
  sel: Selection;
  inputState?: InputState;
}

export interface InputState {
  operator?: string;
}

export interface MotionArgs {
  repeat: number;
  linewise?: boolean;
}

export type Motion<A = object> = (
  cm: Adapter,
  head: Pos,
  args: A & MotionArgs,
  vim: VimState,
  inputState: InputState,
) => Pos | [Pos, Pos] | null | undefined;
export type Action<A = object> = (cm: Adapter, args: A, vim: VimState) => void;
export type Operator = (cm: Adapter, args: object, ranges: Selection[], oldAnchor: Pos) => Pos | void;
export type FindKey = (this: VimApi, cm: Adapter, key: string, ...rest: unknown[]) => unknown;

export interface Bookmark {
  find(): Pos | null | undefined;
  clear(): void;
}

export interface Change {
  from: Pos;
  text: string[];
  origin?: string;
  next?: Change;
}

interface RegisterController {
  unnamedRegister: { toString(): string };
  pushText: PushText;
}
export interface PushText {
  (this: RegisterController, registerName: string | undefined, operator: string, ...rest: unknown[]): void;
  vimOverlay?: boolean;
}

export interface VimApi {
  defineMotion<A>(name: string, motion: Motion<A>): void;
  defineAction<A>(name: string, action: Action<A>): void;
  defineOperator(name: string, operator: Operator): void;
  mapCommand(keys: string, type: "motion" | "action" | "operator", name: string,
    args?: Record<string, string | boolean | number>, options?: { context?: string; isEdit?: boolean }): void;
  map(lhs: string, rhs: string, context: string): void;
  // vim.js reads a value by calling the callback with no value and sets one by calling it with the value.
  defineOption(name: string, defaultValue: undefined, type: "boolean", aliases: string[],
    callback: (value?: boolean) => boolean | undefined): void;
  findKey: FindKey;
  getRegisterController(): RegisterController;
  // Private vim.js macro record used to keep completion compatible with dot repeat.
  getVimGlobalState_(): {
    macroModeState: { lastInsertModeChanges: { changes: unknown[]; maybeReset?: boolean } };
  };
}

export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
export interface Decoration {
  range: MonacoRange;
  options: { stickiness?: number; linesDecorationsClassName?: string };
}
interface Disposable {
  dispose(): void;
}
interface MonacoModel {
  getOptions?(): { tabSize: number };
  getLanguageId?(): string;
  getModeId?(): string;
  getLineMaxColumn(line: number): number;
  getLineCount(): number;
  deltaDecorations(ids: string[], decorations: Decoration[]): string[];
  getDecorationRange(id: string): MonacoRange | null;
}
export interface MonacoEditor {
  getModel(): MonacoModel | null;
  setSelection(range: MonacoRange): void;
  trigger(source: string, action: string, args: { text: string }): void;
  getAction?(name: string): { run(): unknown; isSupported?(): boolean } | null;
  getRawOptions?(): { lineDecorationsWidth?: string | number; folding?: boolean; showFoldingControls?: string };
  updateOptions(options: { lineDecorationsWidth: string | number }): void;
  createDecorationsCollection?(): { set(decorations: Decoration[]): void };
  deltaDecorations(ids: string[], decorations: Decoration[]): string[];
  getPosition(): { lineNumber: number } | null;
  onDidChangeCursorPosition(callback: () => void): Disposable;
  onDidChangeModelContent(callback: (e: {
    changes: { range: MonacoRange; text: string }[]; isFlush: boolean;
  }) => void): Disposable;
  onDidChangeModel(callback: () => void): Disposable;
  onDidDispose(callback: () => void): Disposable;
}

// These adapter links (editor, cm6, ace), CM6's last offset and CM5's lint markers are private internals.
interface CM6View {
  state: {
    readOnly: boolean;
    doc: { line(number: number): { from: number } };
    languageDataAt(name: "commentTokens", pos: number): { line?: string; block?: { open: string; close: string } }[];
  };
  dispatch(transaction: {
    changes: { from: number; to: number; insert: string };
    selection: { anchor: number };
    userEvent: string;
  }): void;
}
interface AceEditor {
  session: {
    getMode(): { lineCommentStart?: string | string[]; blockComment?: { start: string; end: string } };
    getAnnotations(): { row: number; type: string; text: string }[];
  };
  on(type: "change", callback: (delta: {
    action: string; start: { row: number; column: number }; lines: string[];
  }) => void): void;
}
export interface Adapter {
  constructor: { signal?(cm: Adapter, type: string, event: { mode: string; subMode: string }): void };
  firstLine?(): number;
  lastLine(): number;
  getLine(line: number): string;
  getOption(name: "tabSize"): number | undefined;
  getCursor(): Pos;
  setCursor(pos: Pos): void;
  replaceRange(text: string, from: Pos, to: Pos, origin?: string): void;
  operation?<T>(fn: () => T): T;
  setBookmark(pos: Pos): Bookmark;
  posFromIndex(index: number): Pos;
  scanForBracket?(pos: Pos, dir: number, style?: unknown, config?: { bracketRegex?: RegExp }): { pos: Pos; ch: string } | null;
  on(type: "vim-mode-change", callback: () => void): void;
  on(type: "change", callback: (cm: Adapter, change: Change) => void): void;
  openDialog?(template: DocumentFragment, callback: (value: unknown) => void,
    options: { bottom: boolean; value: string; selectValueOnOpen: boolean }): void;
  openNotification?(node: HTMLElement, options: { bottom: boolean; duration: number }): void;
  getModeAt?(pos: Pos): { lineComment?: string; blockCommentStart?: string; blockCommentEnd?: string };
  state: {
    vim: VimState;
    lint?: { marked: { find(): { from: Pos; to: Pos } | undefined; __annotation?: { severity: string; message: string } }[] };
  };
  editor?: MonacoEditor;
  cm6?: CM6View;
  ace?: AceEditor;
  $lastChangeEndOffset?: number;
}
