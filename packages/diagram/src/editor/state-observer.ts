import type { AppState } from "../types.ts";

type StateChangeSelector = keyof AppState | (keyof AppState)[] | ((appState: AppState) => unknown);

type StateChangePredicateOptions = {
  predicate: (appState: AppState) => boolean;
  callback?: (appState: AppState) => void;
  once?: boolean;
};

type StateChangeArg = StateChangeSelector | StateChangePredicateOptions;

type StateChangeListener = {
  predicate: (appState: AppState, prevState: AppState) => boolean;
  getValue: (appState: AppState) => unknown;
  callback: (value: never, appState: AppState) => void;
  once: boolean;
};

/**
 * Excalidraw's `onStateChange`: a key, keys or a selector and a callback
 * called when what they read changes (the subscription's unsubscribe
 * returned), or without a callback a promise of the next change; or a
 * predicate, called (or resolved) at once when it already holds.
 */
export type OnStateChange = {
  <K extends keyof AppState>(
    prop: K,
    callback: (value: AppState[K], appState: AppState) => void,
    opts?: { once: boolean },
  ): () => void;
  <K extends keyof AppState>(prop: K): Promise<AppState[K]>;
  (
    prop: (keyof AppState)[],
    callback: (appState: AppState, appState2: AppState) => void,
    opts?: { once: boolean },
  ): () => void;
  (prop: (keyof AppState)[]): Promise<AppState>;
  <T>(
    prop: (appState: AppState) => T,
    callback: (value: T, appState: AppState) => void,
    opts?: { once: boolean },
  ): () => void;
  <T>(prop: (appState: AppState) => T): Promise<T>;
  (opts: {
    predicate: (appState: AppState) => boolean;
    callback: (appState: AppState) => void;
    once?: boolean;
  }): () => void;
  (opts: { predicate: (appState: AppState) => boolean }): Promise<AppState>;
};

const isPredicateOptions = (arg: StateChangeArg): arg is StateChangePredicateOptions =>
  typeof arg === "object" && !Array.isArray(arg) && "predicate" in arg;

/** Excalidraw's `AppStateObserver`: the editor flushes it once per commit with the state before. */
export class AppStateObserver {
  private listeners: StateChangeListener[] = [];

  public constructor(private readonly getState: () => AppState) {}

  public readonly onStateChange: OnStateChange = ((
    propOrOpts: StateChangeArg,
    callback?: (value: never, appState: AppState) => void,
    opts?: { once: boolean },
  ) => {
    let predicate: StateChangeListener["predicate"];
    let getValue: StateChangeListener["getValue"];
    let listener = callback;
    let once = opts?.once ?? false;
    let matchesImmediately = false;

    if (isPredicateOptions(propOrOpts)) {
      const { predicate: holds, callback: fromOpts } = propOrOpts;
      predicate = holds;
      getValue = (appState) => appState;
      listener = fromOpts ? (_value, appState) => fromOpts(appState) : undefined;
      once = propOrOpts.once ?? false;
      matchesImmediately = holds(this.getState());
    } else if (typeof propOrOpts === "function") {
      const selector = propOrOpts;
      predicate = (appState, prevState) => selector(appState) !== selector(prevState);
      getValue = selector;
    } else if (Array.isArray(propOrOpts)) {
      const keys = propOrOpts;
      predicate = (appState, prevState) => keys.some((key) => appState[key] !== prevState[key]);
      getValue = (appState) => appState;
    } else {
      const key = propOrOpts;
      predicate = (appState, prevState) => appState[key] !== prevState[key];
      getValue = (appState) => appState[key];
    }

    if (listener) {
      const call = listener;
      if (matchesImmediately) {
        queueMicrotask(() => {
          const state = this.getState();
          call(getValue(state) as never, state);
        });
        if (once) {
          return () => {};
        }
      }
      return this.subscribe({ predicate, getValue, callback: call, once });
    }

    if (matchesImmediately) {
      return Promise.resolve(getValue(this.getState()));
    }
    return new Promise((resolve) => {
      this.subscribe({ predicate, getValue, callback: (value) => resolve(value), once: true });
    });
  }) as OnStateChange;

  public flush(prevState: AppState): void {
    if (this.listeners.length === 0) {
      return;
    }
    const state = this.getState();
    const kept: StateChangeListener[] = [];
    for (const listener of this.listeners) {
      if (listener.predicate(state, prevState)) {
        listener.callback(listener.getValue(state) as never, state);
        if (!listener.once) {
          kept.push(listener);
        }
      } else {
        kept.push(listener);
      }
    }
    this.listeners = kept;
  }

  public clear(): void {
    this.listeners = [];
  }

  private subscribe(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((each) => each !== listener);
    };
  }
}
