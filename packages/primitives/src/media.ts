import { type Accessor, computed, isServer, signal } from "@barqjs/core";
import { on } from "./event.ts";
import { type MaybeAccessor, access, sharedKeyed } from "./utils.ts";

const source = sharedKeyed((query: string): Accessor<boolean> => {
  if (isServer) return () => false;
  const list = window.matchMedia(query);
  const matches = signal(list.matches);
  // `change` on the list itself, not a resize listener: the browser already
  // knows when the answer changed, and a resize handler that re-evaluates
  // every query on the page is the usual way this gets expensive.
  on(list, "change", (event) => matches.set(event.matches));
  return matches;
});

/**
 * Whether a media query matches.
 *
 * One `MediaQueryList` per distinct query, shared by every caller: a design
 * system asking `(min-width: 768px)` in forty components installs one listener.
 * A reactive query switches which shared source is read.
 *
 * On the server every query reads `false`. Pass an accessor and read it after
 * hydration if a first paint has to differ.
 */
export function mediaQuery(query: MaybeAccessor<string>): Accessor<boolean> {
  if (typeof query === "string") return source(query);
  return computed(() => source(access(query))());
}

/** Whether the user asked for a dark colour scheme. */
export function prefersDark(): Accessor<boolean> {
  return source("(prefers-color-scheme: dark)");
}

/** Whether the user asked for reduced motion. Gate every non-essential animation on this. */
export function prefersReducedMotion(): Accessor<boolean> {
  return source("(prefers-reduced-motion: reduce)");
}

/** Whether the pointer is coarse, which is the honest test for "touch device". */
export function coarsePointer(): Accessor<boolean> {
  return source("(pointer: coarse)");
}

export type Breakpoints<K extends string> = Record<K, string>;

export interface BreakpointState<K extends string> {
  /** Whether each breakpoint's minimum is met. */
  matches: Record<K, Accessor<boolean>>;
  /** The largest breakpoint currently met, or `undefined` below the smallest. */
  current: Accessor<K | undefined>;
}

/**
 * A set of named breakpoints as media queries.
 *
 * ```ts
 * const bp = breakpoints({ sm: "640px", md: "768px", lg: "1024px" });
 * bp.matches.md();  // true at 800px
 * bp.current();     // "md"
 * ```
 *
 * The widths are read as minimums in the order given, so `current` is the last
 * one that matches. Each query is a shared source, so two components asking for
 * the same set cost one listener per breakpoint rather than one per component.
 */
export function breakpoints<K extends string>(
  definitions: Breakpoints<K>,
  options?: { watch?: "min" | "max" },
): BreakpointState<K> {
  const bound = options?.watch === "max" ? "max-width" : "min-width";
  const names = Object.keys(definitions) as K[];
  const matches = {} as Record<K, Accessor<boolean>>;

  for (const name of names) {
    matches[name] = source(`(${bound}: ${definitions[name]})`);
  }

  const current = computed(() => {
    let found: K | undefined;
    for (const name of names) {
      if (matches[name]()) found = name;
    }
    return found;
  });

  return { matches, current };
}
