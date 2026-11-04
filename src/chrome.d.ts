// The few extension APIs the bridge and the popup use, in Chrome's promise form, which Firefox
// also supports under `chrome`.
declare const chrome: {
  storage: {
    sync: {
      get<T extends object>(defaults: T): Promise<T>;
      set(items: object): Promise<void>;
    };
    onChanged: { addListener(listener: (changes: object, area: string) => void): void };
  };
  tabs: { reload(): Promise<void> };
};
