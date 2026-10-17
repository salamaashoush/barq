/**
 * The state of a hydration, apart from the walk that claims nodes.
 *
 * Whether a claim is live, what diverged, who is holding the phase open and
 * the cursors a claim reads from are the same questions whatever the nodes
 * are, and the reactive core asks them on its hot paths: `renderEffect` tests
 * `hydrating()` on every effect it makes. The walk itself reads a document, so
 * it belongs to the renderer and reaches this module through `ClaimWalk`,
 * installed when a hydration begins.
 */

import { OBSERVE, getOwner } from "@solidjs/signals";

/** What a mismatch was, for the report a caller can assert against. */
export type MismatchKind = "structure" | "range" | "key" | "text" | "portal" | "not-hydratable";

export interface Mismatch {
  kind: MismatchKind;
  detail: string;
}

/**
 * Thrown by every claim that cannot be satisfied. It is never caught by the
 * code that raised it: a region catches its own, `hydrate` catches the rest.
 */
export class HydrationMismatch extends Error {
  readonly kind: MismatchKind;
  /**
   * `file:line:column` of the JSX whose template was being claimed, where a
   * development compile wrote it beside the template.
   */
  declare template: string | undefined;
  /** The component path the walk was in, where the engine keeps owner names. */
  declare readonly ownerPath: string[] | undefined;
  constructor(kind: MismatchKind, detail: string) {
    super(`Hydration mismatch (${kind}): ${detail}. ${CAUSES[kind]}`);
    this.name = "HydrationMismatch";
    this.kind = kind;
    // The engine keeps a channel and owner names in its development and
    // observe builds only; in production `OBSERVE` is a literal `undefined`,
    // so the bundler drops both lines.
    if (OBSERVE !== undefined) {
      this.template = SESSION?.template;
      (this as { ownerPath: string[] | undefined }).ownerPath = OBSERVE.ownerPath(getOwner());
    }
  }
}

const CAUSES: Record<MismatchKind, string> = {
  structure:
    "This usually means the component renders different elements on the server and in the " +
    "browser (a branch on `typeof window`, on the time, or on data only one side has), the " +
    "markup nests elements the browser's HTML parser moves (a `<div>` inside a `<p>`), or a " +
    "browser extension changed the page before it hydrated.",
  text:
    "This usually means the value differs between the server and the browser (`Date.now()`, " +
    "`Math.random()`, or `toLocaleString()` in another locale or time zone), a browser " +
    "extension or page translator rewrote the text, or the server and the browser bundle were " +
    "built from different sources.",
  range:
    "The server writes the comments `<!--[-->` and `<!--]-->` around dynamic content, so this " +
    "usually means something removed HTML comments from the response (an HTML minifier, a proxy " +
    "or a CDN), a script changed the page before it hydrated, or the server and the browser " +
    "bundle were built from different sources.",
  key:
    "This usually means the condition reads something that differs between the server and the " +
    "browser, such as `typeof window`, `localStorage`, a media query or the time.",
  portal:
    "This usually means the `mount` target of a `<Portal>` differs between the server and the " +
    "browser.",
  "not-hydratable":
    "Set `ssr: true` in `barq()` from `@barqjs/vite`, which compiles both the server build and the " +
    "browser build hydratable, and deploy the two together.",
};

export function usualCauses(kind: MismatchKind): string {
  return CAUSES[kind];
}

/**
 * The mismatch an error is, or carries. One raised inside a computation leaves
 * it wrapped by the engine, with the mismatch as its cause.
 */
export function mismatchIn(error: unknown): HydrationMismatch | null {
  if (error instanceof HydrationMismatch) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof HydrationMismatch ? cause : null;
}

/**
 * The compiler's `WHOLE` (`ir/region.rs`): this position owns its parent
 * element's entire child list, so the server wrote it no boundary comments and
 * the claim is every child of the parent.
 *
 * ONE number for the two places it is spelled — a region carries it as a bit of
 * the flags integer both backends already take, and a hole carries it as
 * `insert`'s trailing argument. A hole has no flags integer and a region has no
 * spare argument, so the two spellings are unavoidable; the two VALUES are not.
 */
export const WHOLE: number = 1 << 4;

/**
 * A claimed range and the nodes inside it.
 *
 * `open` and `close` stay in the document when they exist: `close` is the anchor
 * every later write to this position uses, so removing it would cost the
 * position its identity the first time the value changed. They are `null` for a
 * position that OWNS its parent's child list — there is nothing to remove and
 * nothing to anchor against, because appending to `parent` is already the right
 * answer for every later write.
 */
export interface Range<N extends object = object, C extends N = N> {
  open: C | null;
  close: C | null;
  /** Where the range lives. The one field both shapes always have. */
  parent: N;
  nodes: N[];
}

/** One cursor over a claimed sequence. `template()` pops from the innermost. */
export interface Cursor<N extends object = object, T extends N = N> {
  parent: N;
  next: N | null;
  /** Exclusive; `null` means "to the end of `parent`". */
  end: N | null;
  /**
   * Text a template claim stepped over, in document order.
   *
   * `["Label ", <i/>]` is evaluated left to right, so the element is claimed
   * before anything has turned the string into a node, and what the cursor is
   * standing on at that moment is the string's text. It is the string's to
   * take, so it waits here for `claimText`.
   */
  held?: T[];
  /**
   * Children are being made into nodes HERE, in document order, so a string
   * arriving now owns the text the cursor is standing on.
   *
   * Not the general case: a string is usually made into a node after its
   * cursor has closed, where the one on the stack is an ancestor's and its
   * next node is a neighbour's.
   */
  ordered?: boolean;
}

export interface Session<N extends object = object, C extends N = N, T extends N = N> {
  container: N;
  /** A streamed boundary's own claim, after the root pass has ended. */
  late?: boolean;
  /** Whether the served markup carries range comments at all. */
  marked: boolean;
  stack: Cursor<N, T>[];
  mismatches: Mismatch[];
  claimed: number;
  ranges: number;
  built: number;
  /** Every range claimed so far, for `split` to keep their node lists whole. */
  taken: Range<N, C>[];
  /** The first mismatch handed over by `abandonClaim`, for `hydrate` to recover from. */
  abandoned: HydrationMismatch | null;
  /** Where the last template claimed was written, in a development build. */
  template?: string;
}

let SESSION: Session | null = null;

/** The live session, typed by the renderer whose walk opened it. */
export function hydrationSession<
  N extends object = object,
  C extends N = N,
  T extends N = N,
>(): Session<N, C, T> | null {
  return SESSION as Session<N, C, T> | null;
}

export function setHydrationSession(session: Session | null): void {
  SESSION = session;
}

/** Record where the template being claimed was written, for a mismatch below it. */
export function claimingTemplate(at: string): void {
  if (SESSION !== null) SESSION.template = at;
}

/** True while a claim is live. Every hot path tests this and nothing else. */
export function hydrating(): boolean {
  return SESSION !== null && SESSION.stack.length > 0;
}

/**
 * The renderer's half of what a construct asks of the server's nodes, reached
 * through this table and installed by the renderer's `hydrate`. A page that
 * only ever renders never installs it, so a bundler drops the walk with it.
 */
export interface ClaimWalk {
  claimAt(parent: object | null, anchor: object | null, mode?: number): Range | null;
  claimRange(parent: object | null, anchor: object | null, mode?: number): Range | null;
  probeRange(parent: object | null, anchor: object | null): Range | null;
  claimLate<T>(container: object, work: () => T): { value: T; abandoned: HydrationMismatch | null };
  isScaffolding(node: object | null): boolean;
  rangeKey(range: Range): string | null;
  releaseRange(range: Range): void;
  openCursor(range: Range): Cursor;
  cursorRest(cursor: Cursor): object[];
  rangeNodes(range: Range): object[];
  spanBetween(from: object | null, to: object | null): object[];
  evict(nodes: readonly object[]): void;
}

let walk: ClaimWalk | null = null;

export function installClaimWalk(table: ClaimWalk): void {
  walk = table;
}

/**
 * The installed walk, for a construct that holds a claim. A claim only exists
 * once a hydration installed a walk, so reaching this without one is a claim
 * made with no session.
 */
export function claimWalk(): ClaimWalk {
  if (walk === null) throw noSession();
  return walk;
}

/**
 * Claim server nodes that arrived after `hydrate` returned: a streamed
 * boundary's content, swapped in where the boundary's fallback was claimed.
 * Where no walk is installed nothing is claiming, and `work` simply runs.
 */
export function claimLate<T>(
  container: object,
  work: () => T,
): { value: T; abandoned: HydrationMismatch | null } {
  return walk === null ? { value: work(), abandoned: null } : walk.claimLate(container, work);
}

export function noSession(): HydrationMismatch {
  return new HydrationMismatch(
    "range",
    "a component looked for server-rendered content while no `hydrate` call is running",
  );
}

export function mismatches(): readonly Mismatch[] {
  return SESSION === null ? [] : SESSION.mismatches;
}

/**
 * Record a divergence that was RECOVERED rather than thrown.
 *
 * A text difference is the case: the server said one thing, the client another,
 * and writing the client's value through the claimed text node keeps the node
 * and fixes the content. It is still a divergence and still gets a row, because
 * "nothing was reported" has to mean "nothing diverged".
 */
export function report(kind: MismatchKind, detail: string): void {
  if (SESSION !== null) SESSION.mismatches.push({ kind, detail });
}

export interface HydrationReport {
  mismatches: readonly Mismatch[];
  /** Nodes taken from the server's markup. */
  claimed: number;
  /** Ranges taken from the server's markup. */
  ranges: number;
  /** Nodes the client built because it could not take one. */
  built: number;
}

/**
 * Give `mismatch` to `hydrate` from a place where throwing it would hand it to
 * the engine instead.
 *
 * A mismatch raised inside a computation, a list row or an error boundary's
 * fallback, reaches no catcher of barq's by being thrown: the engine takes it
 * for an uncaught application error, halts every update and reports a crash.
 * Handed over here, it is the same full-page recovery, raised by `mount` once
 * the build returns.
 *
 * `false` when no hydration is in progress, and the caller still owns it.
 */
export function abandonClaim(mismatch: HydrationMismatch): boolean {
  if (SESSION === null) return false;
  SESSION.abandoned ??= mismatch;
  return true;
}

export function abandonedClaim(): HydrationMismatch | null {
  return SESSION === null ? null : SESSION.abandoned;
}

/**
 * Does this markup carry range comments?
 *
 * One scan, at the start, and it is what lets a construct with no flag tell its
 * two situations apart. A module built without the flag over markup built
 * without it is ORDINARY — nothing was ever going to be claimed there, and
 * building cold is exactly right. The same module over markup built WITH it is a
 * deployment mistake, and a bad one: the client's walk is native, so it steps
 * onto a boundary comment and everything it addresses after that is off by an
 * unknown amount. That is not recoverable locally and must not be treated as if
 * it were.
 *
 * `true` proves the markup is hydratable; `false` proves nothing. The comments
 * are off every position whose extent the client can read off its parent, so a
 * hydratable page can now carry none at all. The caller uses it to choose the
 * wording of a diagnostic, which is all a one-way signal can carry.
 */
export function wireIsMarked(): boolean {
  return SESSION !== null && SESSION.marked;
}

let afterHydration: (() => void)[] | null = null;

/** Streamed boundaries the root pass claimed a fallback for, still owed their content. */
let pendingBoundaries = 0;

/**
 * Solid 2.0's `onHydrationEnd`: run `callback` once the hydration phase is
 * over, which is the root pass of `hydrate` and every streamed boundary it
 * claimed a fallback for, each resumed or gone. On the next microtask when no
 * hydration is in progress, on the server included.
 *
 * A microtask later in both cases. `hydrate` is synchronous to its end, and
 * what follows the claim there is the recovery render and the flush: a callback
 * run from `endHydration` itself would see the tree before either.
 *
 * For test tooling and markers. What a component renders must not branch on
 * it: read `isHydrating()` where a value has to match the server.
 */
export function onHydrationEnd(callback: () => void): void {
  if (SESSION === null && pendingBoundaries === 0) {
    queueMicrotask(callback);
    return;
  }
  (afterHydration ??= []).push(callback);
}

/**
 * Hold the end of hydration open for a streamed boundary whose content has not
 * arrived. Answers the release, which is idempotent, or `null` when the phase
 * is not open: nothing is claiming, or a late claim runs after it has ended.
 */
export function holdHydration(): (() => void) | null {
  if (SESSION === null || (SESSION.late === true && pendingBoundaries === 0)) return null;
  pendingBoundaries++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    pendingBoundaries--;
    drainHydrationEnd();
  };
}

export function drainHydrationEnd(): void {
  if (SESSION !== null || pendingBoundaries !== 0 || afterHydration === null) return;
  const callbacks = afterHydration;
  afterHydration = null;
  queueMicrotask(() => {
    for (const callback of callbacks) callback();
  });
}

/**
 * Run `body` with the cursor suspended.
 *
 * A portal builds into a container the server never wrote at this position, and
 * a rebuilt branch builds nodes nobody may claim. Both need the ordinary client
 * path, and both are re-entrant with respect to the claim above them — hence a
 * stack rather than a flag.
 */
export function withoutClaim<T>(body: () => T): T {
  if (SESSION === null) return body();
  const stack = SESSION.stack;
  SESSION.stack = [];
  try {
    return body();
  } finally {
    SESSION.stack = stack;
  }
}

/** Run `body` claiming from `cursor`, which keeps whatever it consumed. */
export function atCursor<T>(cursor: Cursor, body: () => T): T {
  if (SESSION === null) return body();
  SESSION.stack.push(cursor);
  try {
    return body();
  } finally {
    SESSION.stack.pop();
  }
}

/** Whether `cursor` has anything left to claim. */
export function cursorAtEnd(cursor: Cursor): boolean {
  if (cursor.held !== undefined && cursor.held.length > 0) return false;
  return cursor.next === null || cursor.next === cursor.end;
}

/**
 * Run `body`, which makes children into nodes in document order at the open
 * cursor, so that a string among them takes the text it is level with.
 *
 * `[() => name, <Badge/>]` where the badge's root is a region: the region asks
 * the cursor for its `<!--[-->`, and the cursor is still standing on the name
 * unless the string before it took that text on its way past.
 */
export function inDocumentOrder<T>(body: () => T): T {
  const cursor = SESSION?.stack[SESSION.stack.length - 1];
  if (cursor === undefined) return body();
  const outer = cursor.ordered;
  cursor.ordered = true;
  try {
    return body();
  } finally {
    cursor.ordered = outer;
  }
}

/**
 * A server text node a hole kept by writing its value through it rather than
 * taking it at a cursor. It is reused all the same, and a page whose only
 * server node is one, `hydrate(() => <Pass>{label()}</Pass>)`, otherwise read
 * as one that reused nothing.
 */
export function adopted(): void {
  if (SESSION !== null) SESSION.claimed++;
}

/** A node the client had to build because no claim was possible. */
export function built(): void {
  if (SESSION !== null) SESSION.built++;
}
