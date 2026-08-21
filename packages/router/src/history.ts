/**
 * History: where the current location comes from and how a navigation is
 * recorded.
 *
 * One rule decides the whole file. **Inside the router every pathname is
 * base-relative.** The base is stripped on the way in and added on the way out,
 * in exactly two places, so nothing downstream has to remember which form it is
 * holding. The old router did it in three and disagreed with itself: an
 * authored `<a href="/app/users">` under `base: "/app"` navigated to
 * `/app/app/users`, because the document-click interceptor handed the raw
 * `href` attribute to a `push` that prepends the base.
 *
 * `memoryHistory` is a real history here. The old one's `push` and `watch` were
 * both no-ops, so a `MemoryRouter` recorded nothing — and since every one of
 * that package's 100 tests drove `MemoryRouter`, the suite validated navigation
 * against a history that could not remember it.
 */

/** Where we are. `pathname` is always base-relative. */
export interface Location {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly state: unknown;
  /** Changes on every entry, so an unchanged URL is still a distinguishable navigation. */
  readonly key: string;
}

export type NavigationAction = "push" | "replace" | "pop";

export interface History {
  current(): Location;
  go(delta: number): void;
  push(to: string, options?: { replace?: boolean; state?: unknown }): void;
  /** Returns an unsubscribe. */
  subscribe(listener: (location: Location, action: NavigationAction) => void): () => void;
}

let keys = 0;
const nextKey = (): string => `k${keys++}`;

/** Split a full `path?query#hash` into its three pieces. */
export function parseLocation(url: string, state: unknown = null): Location {
  // `#` first: a `?` after a `#` is part of the fragment, not the query.
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const searchAt = withoutHash.indexOf("?");
  const search = searchAt === -1 ? "" : withoutHash.slice(searchAt);
  const pathname = searchAt === -1 ? withoutHash : withoutHash.slice(0, searchAt);
  return { pathname: pathname === "" ? "/" : pathname, search, hash, state, key: nextKey() };
}

/** The full URL a location addresses, base-relative. */
export function href(location: Location): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/** Strip a base prefix, on a segment boundary. */
export function stripBase(pathname: string, base: string): string {
  if (base === "" || base === "/") return pathname;
  if (!pathname.startsWith(base)) return pathname;
  const rest = pathname.slice(base.length);
  if (rest === "") return "/";
  return rest.charCodeAt(0) === 47 ? rest : pathname;
}

/** Add it back. The inverse of `stripBase`, and the only place it happens. */
export function addBase(path: string, base: string): string {
  if (base === "" || base === "/") return path;
  return path === "/" ? base : `${base}${path}`;
}

export interface MemoryHistoryOptions {
  readonly initial?: readonly string[];
  readonly index?: number;
}

/**
 * A history in an array. Used for tests, for SSR, and for anything without a
 * `window` — and it really records, so back and forward work.
 */
export function memoryHistory(options: MemoryHistoryOptions = {}): History {
  const initial = options.initial ?? ["/"];
  const stack: Location[] = initial.map((entry) => parseLocation(entry));
  let index = options.index ?? stack.length - 1;
  const listeners = new Set<(location: Location, action: NavigationAction) => void>();

  const emit = (action: NavigationAction): void => {
    const location = stack[index] as Location;
    // A snapshot, not the live Set: a listener that subscribes another during
    // an emit must not have it called in the same emit.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const listener of [...listeners]) listener(location, action);
  };

  return {
    current: () => stack[index] as Location,
    go(delta) {
      const target = index + delta;
      if (target < 0 || target >= stack.length) return;
      index = target;
      emit("pop");
    },
    push(to, pushOptions) {
      const location = parseLocation(to, pushOptions?.state ?? null);
      if (pushOptions?.replace === true) {
        stack[index] = location;
        emit("replace");
        return;
      }
      // A push truncates the forward stack, which is what makes `go(1)` after
      // a back-then-navigate do nothing rather than resurrect a dead entry.
      stack.length = index + 1;
      stack.push(location);
      index = stack.length - 1;
      emit("push");
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface BrowserHistoryOptions {
  /** Mounted under this prefix. Stripped on the way in, added on the way out. */
  readonly base?: string;
  /** Torn down with the router that made it. */
  readonly signal?: AbortSignal;
}

/**
 * The real one, over `window.history`.
 *
 * `popstate` only. There is no `hashchange` listener: a `#`-only href is left
 * to the browser, which is what makes an in-page anchor work without the router
 * deciding it is a navigation.
 */
export function browserHistory(options: BrowserHistoryOptions = {}): History {
  const base = options.base === undefined ? "" : normalizeBase(options.base);
  const listeners = new Set<(location: Location, action: NavigationAction) => void>();

  const read = (): Location =>
    parseLocation(
      stripBase(window.location.pathname, base) + window.location.search + window.location.hash,
      window.history.state,
    );

  let current = read();

  const emit = (location: Location, action: NavigationAction): void => {
    current = location;
    // A snapshot, not the live Set: a listener that subscribes another during
    // an emit must not have it called in the same emit.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const listener of [...listeners]) listener(location, action);
  };

  window.addEventListener(
    "popstate",
    () => {
      emit(read(), "pop");
    },
    { signal: options.signal },
  );

  return {
    current: () => current,
    go(delta) {
      window.history.go(delta);
    },
    push(to, pushOptions) {
      const location = parseLocation(to, pushOptions?.state ?? null);
      const url = addBase(location.pathname, base) + location.search + location.hash;
      const replace = pushOptions?.replace === true;
      if (replace) window.history.replaceState(location.state, "", url);
      else window.history.pushState(location.state, "", url);
      emit(location, replace ? "replace" : "push");
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One leading slash, no trailing slash. `"/"` and `""` both mean no base. */
export function normalizeBase(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.charCodeAt(0) === 47 ? trimmed : `/${trimmed}`;
}
