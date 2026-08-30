import { type Accessor, isServer, renderEffect, signal } from "@barqjs/core";
import { on } from "./event.ts";
import {
  type Clear,
  type MaybeAccessor,
  access,
  shared,
  sharedKeyed,
  tryCleanup,
} from "./utils.ts";

/**
 * Whether the browser believes it has a network connection.
 *
 * `navigator.onLine` is a lower bound and nothing more: it reports that a
 * route exists, not that anything is reachable. Treat `false` as certainly
 * offline and `true` as unknown.
 */
export const online: () => Accessor<boolean> = shared(() => {
  if (isServer) return () => true;
  const connected = signal(navigator.onLine);
  on(window, "online", () => connected.set(true));
  on(window, "offline", () => connected.set(false));
  return connected;
});

/** Whether the page is the foreground tab. */
export const pageVisible: () => Accessor<boolean> = shared(() => {
  if (isServer) return () => true;
  const visible = signal(document.visibilityState === "visible");
  on(document, "visibilitychange", () => visible.set(document.visibilityState === "visible"));
  return visible;
});

export interface IdleOptions {
  /** Milliseconds without input before the user counts as idle. Defaults to 60000. */
  after?: number;
  /** What counts as activity. Defaults to pointer, keyboard, wheel and touch. */
  events?: readonly (keyof DocumentEventMap)[];
}

const ACTIVITY = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const satisfies readonly (keyof DocumentEventMap)[];

/**
 * Whether the user has stopped interacting.
 *
 * Backgrounding the tab counts as going idle at once, and returning to it
 * counts as activity: a tab nobody is looking at should not keep a session
 * alive, and `mousemove` never fires while it is hidden.
 */
export function userIdle(options?: IdleOptions): Accessor<boolean> {
  const idle = signal(false);
  if (isServer) return idle;

  const after = options?.after ?? 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const wake = (): void => {
    idle.set(false);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => idle.set(true), after);
  };

  on(document, options?.events ?? ACTIVITY, wake, { passive: true });
  on(document, "visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
    else {
      if (timer !== undefined) clearTimeout(timer);
      idle.set(true);
    }
  });

  wake();
  tryCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  return idle;
}

export type PermissionStatus = PermissionState | "unknown";

const permissionSource = sharedKeyed((name: string): Accessor<PermissionStatus> => {
  const state = signal<PermissionStatus>("unknown");
  if (isServer || typeof navigator === "undefined" || navigator.permissions === undefined) {
    return state;
  }

  let clear: Clear | undefined;
  let dropped = false;
  navigator.permissions
    .query({ name: name as PermissionName })
    .then((status) => {
      if (dropped) return;
      state.set(status.state);
      clear = on(status, "change", () => state.set(status.state));
    })
    .catch(() => {
      // An unsupported name rejects rather than resolving to "denied". Staying
      // at "unknown" is the honest answer; "denied" would read as a decision
      // the user made.
    });

  tryCleanup(() => {
    dropped = true;
    clear?.();
  });
  return state;
});

/**
 * A permission's state, or `"unknown"` where the Permissions API cannot answer
 * — an unsupported name, or Safari, which implements a fraction of the list.
 *
 * Shared per name, and it follows revocation: a user who turns a permission off
 * in site settings updates this without a reload.
 */
export function permission(name: MaybeAccessor<string>): Accessor<PermissionStatus> {
  if (typeof name === "string") return permissionSource(name);
  return () => permissionSource(access(name))();
}

/**
 * The device pixel ratio.
 *
 * Driven by a media query rather than a resize listener, which is the only way
 * to hear about a window moving between two displays of different densities.
 */
export const devicePixelRatio: () => Accessor<number> = shared(() => {
  const ratio = signal(isServer ? 1 : window.devicePixelRatio);
  if (isServer) return ratio;

  let clear: Clear | undefined;
  const watch = (): void => {
    clear?.();
    const current = window.devicePixelRatio;
    ratio.set(current);
    const list = window.matchMedia(`(resolution: ${current}dppx)`);
    clear = on(list, "change", watch);
  };
  watch();
  tryCleanup(() => clear?.());
  return ratio;
});

/**
 * Bind the document title to a value.
 *
 * The previous title is restored when the scope disposes, so a route that sets
 * one does not leave it behind on the way out.
 */
export function documentTitle(value: MaybeAccessor<string>): void {
  if (isServer) return;
  const previous = document.title;
  tryCleanup(() => {
    document.title = previous;
  });
  renderEffect(() => {
    document.title = access(value);
  });
}

/** The languages the user prefers, most preferred first. */
export const languages: () => Accessor<readonly string[]> = shared(() => {
  if (isServer) return () => [];
  const preferred = signal<readonly string[]>(navigator.languages);
  on(window, "languagechange", () => preferred.set(navigator.languages));
  return preferred;
});
