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
 * Today the seed channel records resolved values only (`signals.ts` records in
 * `settled`, never in `failed`), so this is reached by an Error INSIDE a
 * resolved value rather than by a rejection. It is hardening, not a live leak.
 */
const redactError: Plugin<Error, ErrorInfo> = createPlugin<Error, ErrorInfo>({
  tag: "barq/redacted-error",
  test: (value) => value instanceof Error,
  parse: {
    sync: (value, ctx) =>
      ({ name: ctx.parse(value.name), message: ctx.parse(value.message) }) as unknown as ErrorInfo,
  },
  serialize: (node, ctx) =>
    `Object.assign(new Error(${ctx.serialize(node.message)}),{name:${ctx.serialize(node.name)}})`,
  deserialize: (node, ctx) =>
    Object.assign(new Error(ctx.deserialize<string>(node.message)), {
      name: ctx.deserialize<string>(node.name),
    }),
});

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
  };
}
