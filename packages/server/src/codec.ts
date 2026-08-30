/**
 * The value channel: what crosses from a server render to `hydrate()`.
 *
 * `JSON.stringify` was the whole encoder here, which meant a `Date` arrived as a
 * string, a `Map` as `{}`, and a cycle threw. seroval carries all three, and its
 * JS mode costs the client nothing: the payload IS the program that rebuilds the
 * value, so there is no decoder in the browser bundle.
 *
 * Two features are refused rather than configured, and both refusals fail
 * CLOSED — the parse throws before any output exists, so there is no partial or
 * ambiguous payload to reason about.
 */

import {
  Feature,
  type Plugin,
  type PluginInfo,
  createPlugin,
  crossSerialize,
  crossSerializeStream,
  fromJSON,
  getCrossReferenceHeader,
  serialize,
  toJSON,
} from "seroval";

/**
 * `RegExp`: seroval escapes `<` at the STRING level, but emits a regular
 * expression as a literal whose source is written through unescaped. Measured
 * on 1.6.2:
 *
 * ```
 * serialize({p: new RegExp("[</script>]")})  →  ({p:/[</script>]/})
 * serialize({p: "</script>"})                →  ({p:"\x3C/script>"})
 * ```
 *
 * Inline in a `<script>`, the first one closes the element and everything after
 * it becomes markup. It cannot be repaired downstream: seroval's JS output
 * inlines helpers that use `<` as a real operator (`for (let i = 0; i < n; i++)`
 * in the typed-array decoder), so a blanket escape over the output corrupts the
 * payload instead. The only safe consumer-side answer is to refuse the type.
 *
 * `ErrorPrototypeStack`: suppresses the PROTOTYPE `stack`, which is necessary
 * and not sufficient — see {@link redactError}.
 */
const DISABLED = Feature.RegExp | Feature.ErrorPrototypeStack;

interface ErrorInfo extends PluginInfo {
  name: never;
  message: never;
  /** `"redirect"`, `"not-found"`, or `""` for an ordinary failure. */
  kind: never;
  /** A redirect's target and status; empty for everything else. */
  to: never;
  status: never;
}

/**
 * The two control-flow brands, which an Error has to keep across the wire.
 *
 * `Symbol.for`, declared here as well as in `packages/router/src/errors.ts` and
 * `packages/start/src/client.ts`, because this package cannot import either —
 * the same constraint and the same answer as those two.
 *
 * WHAT WENT WRONG WITHOUT IT. `redactError` reduced every Error to its name and
 * its message, so a `notFound()` that crossed the seed arrived as a plain
 * `Error` named `"NotFound"` carrying no brand. `isNotFound` therefore answered
 * false on the client, and a route with both fallbacks rendered its
 * `errorComponent` where the server had rendered its `notFoundComponent` — the
 * same page, hydrating into a different one. A route with ONLY a
 * `notFoundComponent` matched nothing at all and rendered blank.
 *
 * The KIND is not sensitive. `name` already crosses, and it is the thing that
 * carries the class's identity in the first place; a brand alongside it leaks
 * strictly nothing new, while keying on `name` alone would let any handler that
 * happens to throw `Object.assign(new Error(), { name: "Redirect" })` steer the
 * router.
 */
const REDIRECT = Symbol.for("barq.redirect");
const NOT_FOUND = Symbol.for("barq.not-found");

/**
 * One parse body for all three modes.
 *
 * The three contexts differ only in what `ctx.parse` may return, and every
 * field here is a string or a number, so the same body serves them all. Typed
 * against the sync context and reached by the other two through a cast, which
 * is narrower than declaring the union.
 */
function parseError(value: Error, ctx: { parse: (input: unknown) => unknown }): ErrorInfo {
  const kind = kindOf(value);
  const redirect = kind === "redirect" ? (value as unknown as RedirectShape) : undefined;
  return {
    name: ctx.parse(value.name),
    message: ctx.parse(value.message),
    kind: ctx.parse(kind),
    // A redirect's target is where the browser is about to be sent, so it is
    // already the least secret thing about the request.
    to: ctx.parse(typeof redirect?.to === "string" ? redirect.to : ""),
    status: ctx.parse(typeof redirect?.status === "number" ? redirect.status : 0),
  } as unknown as ErrorInfo;
}

function kindOf(value: Error): "redirect" | "not-found" | "" {
  const branded = value as unknown as Record<symbol, unknown>;
  if (branded[REDIRECT] === true) return "redirect";
  if (branded[NOT_FOUND] === true) return "not-found";
  return "";
}

/**
 * An `Error` reaches the wire as its name and message and nothing else.
 *
 * `Feature.ErrorPrototypeStack` is not enough. On Bun an `Error` carries OWN
 * enumerable properties, and those ride out through `Object.assign` with the
 * flag set:
 *
 * ```
 * Object.assign(new Error("db connection failed"),
 *   {originalLine:3,originalColumn:16,line:3,column:15,sourceURL:"/home/…/probe.ts"})
 * ```
 *
 * `sourceURL` is an absolute server path. No flag in seroval's enum covers it,
 * and constructing a replacement `Error` server-side does not help either —
 * the replacement gets its own `sourceURL`, naming this file. Only controlling
 * the emitted string does, which is what a plugin is for.
 *
 * WHAT IT CARRIES BESIDES. An Error's KIND crosses too, so a `notFound()` or a
 * `redirect()` is still one on the other side; `kindOf` below says why that is
 * not a widening of what leaks.
 */
const redactError: Plugin<Error, ErrorInfo> = createPlugin<Error, ErrorInfo>({
  tag: "barq/redacted-error",
  test: (value) => value instanceof Error,
  /**
   * ALL THREE MODES, and defining only `sync` was a live leak rather than a gap.
   *
   * seroval picks the parse mode from the CONTEXT, not from the value: a plain
   * `serialize` is sync, but a promise's settled value goes through `async`, and
   * `crossSerializeStream` — which is what the streaming seed channel uses for
   * every deferred loader — goes through `stream`. With only `sync` defined the
   * plugin simply did not apply on the other two, and seroval fell back to its
   * BUILT-IN Error node, which writes an error's own enumerable properties.
   *
   * On Bun those properties are `sourceURL`, `line`, `column`, `originalLine`
   * and `originalColumn`, so a route whose loader REJECTED streamed the
   * server's absolute filesystem path into the HTML of every such response:
   *
   * ```
   * Object.assign(new Error("no such row"),{name:"NotFound",originalLine:2,
   *   originalColumn:31,line:2,column:30,sourceURL:"/home/…/src/data/rows.ts"})
   * ```
   *
   * The comment above used to say this plugin was "hardening, not a live leak",
   * on the grounds that the seed records resolved values only. A rejection is
   * the case that was missed, and it is the ordinary one: any loader that
   * throws reaches it.
   */
  parse: {
    sync: (value, ctx) => parseError(value, ctx),
    async: (value, ctx) => Promise.resolve(parseError(value, ctx)),
    stream: (value, ctx) => parseError(value, ctx),
  },
  // An IIFE rather than one `Object.assign`: a symbol key cannot be written in
  // an object literal without a computed key, and the redirect branch adds two
  // more fields. It is emitted once per Error in the payload.
  serialize: (node, ctx) =>
    `(()=>{const e=Object.assign(new Error(${ctx.serialize(node.message)}),` +
    `{name:${ctx.serialize(node.name)}});const k=${ctx.serialize(node.kind)};` +
    `if(k==="redirect"){e[Symbol.for("barq.redirect")]=true;` +
    `e.to=${ctx.serialize(node.to)};e.status=${ctx.serialize(node.status)};}` +
    `else if(k==="not-found"){e[Symbol.for("barq.not-found")]=true;}return e;})()`,
  deserialize: (node, ctx) => {
    const error = Object.assign(new Error(ctx.deserialize<string>(node.message)), {
      name: ctx.deserialize<string>(node.name),
    });
    const kind = ctx.deserialize<string>(node.kind);
    if (kind === "redirect") {
      Object.assign(error as object, {
        [REDIRECT]: true,
        to: ctx.deserialize<string>(node.to),
        status: ctx.deserialize<number>(node.status),
      });
    } else if (kind === "not-found") {
      Object.assign(error as object, { [NOT_FOUND]: true });
    }
    return error;
  },
});

/** The two fields a redirect carries beyond an ordinary Error. */
interface RedirectShape {
  readonly to?: unknown;
  readonly status?: unknown;
}

/**
 * Next.js warns above this and the reasoning transfers exactly: the seed is
 * inlined in EVERY response, hydration cannot begin until it has been parsed,
 * and the whole payload stays resident even when one key is read.
 */
export const SEED_WARN_BYTES = 128_000;

// ── the wire ────────────────────────────────────────────────────────────────
//
// The seed and the RPC wire take DIFFERENT seroval modes, and the difference is
// not a detail.
//
// A seed is inlined in a `<script>` the browser is going to parse as JS anyway,
// so JS mode costs nothing and ships no decoder. An RPC response is bytes off
// the network, and evaluating those as JS is remote code execution — no amount
// of escaping makes `eval` safe on attacker-reachable input. So the wire uses
// the JSON channel, which reconstructs through `fromJSON` and never evaluates.
//
// The hardening is shared: the same disabled features and the same Error
// redaction, so a value that cannot leave through one channel cannot leave
// through the other.

/** Encode a value for the wire: JSON-safe, no evaluation on the far side. */
export function encodeWire(value: unknown): unknown {
  return toJSON(value, { disabledFeatures: DISABLED, plugins: [redactError] });
}

/**
 * Decode a wire payload. Reconstructs Dates, Maps, Sets, BigInts and cycles
 * without evaluating anything.
 */
// Used once BY CONSTRUCTION: the parameter is the caller's declaration of
// what comes back, which is this function's whole interface.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function decodeWire<T>(payload: unknown): T {
  return fromJSON<T>(payload as never, { plugins: [redactError] });
}

/** Encode one render's resolved values as the JS expression that rebuilds them. */
export function encodeSeed(data: Record<string, unknown>): string {
  const payload = serialize(data, { disabledFeatures: DISABLED, plugins: [redactError] });
  warnIfLarge(payload.length);
  return payload;
}

function warnIfLarge(bytes: number): void {
  if (bytes <= SEED_WARN_BYTES) return;
  console.warn(
    `[barq] hydration seed is ${bytes} bytes (over ${SEED_WARN_BYTES}). ` +
      "It is inlined in every response and hydration blocks on parsing it.",
  );
}

let scopes = 0;

export interface SeedEncoder {
  /** Emitted once, before the first payload. Defines the reference table. */
  readonly header: string;
  encode(data: Record<string, unknown>): string;
  /**
   * The DEFERRED form: the payload now, the rest when it resolves.
   *
   * `crossSerialize` refuses a pending promise outright — `serialize` throws
   * `SerovalUnsupportedNodeError`, and a loader returning `{ rows, total:
   * countRows() }` is exactly that shape — so a value that carries one goes
   * through `crossSerializeStream` instead. The initial payload is returned
   * synchronously; every later resolution arrives at `onLater` as a complete
   * statement, and `onDone` fires when there is nothing left outstanding.
   *
   * Same `refs` map as `encode`, so a deferred value and an ordinary one that
   * share an object still share it on the client.
   */
  encodeDeferred(
    data: Record<string, unknown>,
    onLater: (statement: string) => void,
    onDone: () => void,
  ): string;
  /** Whether a value contains a promise, and therefore needs the deferred form. */
  readonly hasPending: (value: unknown) => boolean;
}

/**
 * Does this value carry a promise anywhere the encoder will walk?
 *
 * Cheap and conservative: plain objects and arrays only, bounded, and a cycle
 * stops the walk rather than hanging it. A false NEGATIVE would reach
 * `crossSerialize` and throw, which is the failure this exists to prevent, so
 * the walk covers exactly what `settleNested` on the other side covers.
 */
function carriesPending(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (typeof (value as { then?: unknown }).then === "function") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => carriesPending(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).some((item) => carriesPending(item, seen));
}

/**
 * A seed encoder for ONE render, whose flushes share references.
 *
 * A streamed page seeds more than once — once after the shell, once per settled
 * round — and `serialize` per flush makes each one self-contained. That is
 * correct within a flush and wrong across them: an object reachable from two
 * keys seeded in different rounds arrives as two objects, so `a === b` on the
 * server is `a !== b` on the client. Threading one `refs` map through
 * `crossSerialize` is what preserves it; a later flush emits `$R[1]` where an
 * earlier one defined it.
 *
 * The scope id is per render and not a constant, because two independent renders
 * embedded in one document would otherwise index into one `$R` bucket with two
 * different ref maps and overwrite each other's entries.
 */
export function createSeedEncoder(): SeedEncoder {
  const scopeId = `b${scopes++}`;
  const refs = new Map<unknown, number>();
  return {
    header: getCrossReferenceHeader(scopeId),
    hasPending: (value) => carriesPending(value),
    encode(data) {
      const payload = crossSerialize(data, {
        scopeId,
        refs,
        disabledFeatures: DISABLED,
        plugins: [redactError],
      });
      warnIfLarge(payload.length);
      return payload;
    },
    encodeDeferred(data, onLater, onDone) {
      let initial = "";
      crossSerializeStream(data, {
        scopeId,
        refs,
        disabledFeatures: DISABLED,
        plugins: [redactError],
        onSerialize(payload, isInitial) {
          if (isInitial) initial = payload;
          else onLater(payload);
        },
        onDone,
        onError(error) {
          // A rejection after the shell has flushed cannot become a status, and
          // tearing the body over it is worse than the value simply never
          // arriving: the client's read falls through to a fetch when the
          // channel closes.
          onLater(`/* seed serialization failed: ${JSON.stringify(String(error))} */`);
          onDone();
        },
      });
      warnIfLarge(initial.length);
      return initial;
    },
  };
}
