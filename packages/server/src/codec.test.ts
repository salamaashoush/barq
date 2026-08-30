/**
 * What the value channel carries, and what it refuses to.
 *
 * The redaction rules live in `server.test.ts` beside the render they protect;
 * this file is about the one thing an Error has to KEEP.
 */

import { afterEach, describe, expect, test } from "bun:test";

import {
  clearSerializationAdapters,
  createSeedEncoder,
  createSerializationAdapter,
  decodeWire,
  encodeSeed,
  encodeWire,
  registerSerializationAdapters,
  serializationAdapters,
} from "./codec.ts";

/**
 * An Error keeps its KIND across the wire.
 *
 * `redactError` reduced every Error to a name and a message, so a `notFound()`
 * that crossed the hydration seed arrived as a plain `Error` named
 * `"NotFound"` with no brand on it. `isNotFound` answered false on the client,
 * and a route rendered its `errorComponent` where the server had rendered its
 * `notFoundComponent` — the same page hydrating into a different one, with
 * nothing anywhere to say so. A route declaring only a `notFoundComponent`
 * matched nothing and hydrated to blank.
 *
 * The brands are written out rather than imported, for the reason
 * `errors.test.ts` gives: importing the constant under test would make this
 * pass for whatever value it happened to hold.
 */
describe("a control-flow throwable survives the wire", () => {
  const REDIRECT = Symbol.for("barq.redirect");
  const NOT_FOUND = Symbol.for("barq.not-found");

  const notFound = (): Error =>
    Object.assign(new Error("no such row"), { name: "NotFound", [NOT_FOUND]: true });
  const redirect = (): Error =>
    Object.assign(new Error("redirect to /login"), {
      name: "Redirect",
      [REDIRECT]: true,
      to: "/login",
      status: 302,
    });

  test("a notFound is still one on the JSON channel", () => {
    const back = decodeWire<Record<symbol, unknown> & Error>(encodeWire(notFound()));
    expect(back[NOT_FOUND]).toBe(true);
    expect(back.message).toBe("no such row");
    expect(back.name).toBe("NotFound");
  });

  test("a redirect keeps its target and status", () => {
    const back = decodeWire<Record<symbol, unknown> & Error & { to: string; status: number }>(
      encodeWire(redirect()),
    );
    expect(back[REDIRECT]).toBe(true);
    expect(back.to).toBe("/login");
    expect(back.status).toBe(302);
  });

  /** The SEED channel is JS rather than JSON, and rebuilds by evaluation. */
  test("the seed channel rebuilds the brand too", () => {
    const back = (0, eval)(encodeSeed({ e: notFound() })) as {
      e: Record<symbol, unknown> & Error;
    };
    expect(back.e[NOT_FOUND]).toBe(true);
    expect(back.e.name).toBe("NotFound");

    const moved = (0, eval)(encodeSeed({ e: redirect() })) as {
      e: Record<symbol, unknown> & Error & { to: string; status: number };
    };
    expect(moved.e[REDIRECT]).toBe(true);
    expect(moved.e.to).toBe("/login");
    expect(moved.e.status).toBe(302);
  });

  test("an ordinary error is branded as neither", () => {
    const back = decodeWire<Record<symbol, unknown> & Error>(encodeWire(new Error("boom")));
    expect(back[NOT_FOUND]).toBeUndefined();
    expect(back[REDIRECT]).toBeUndefined();
    expect(back.message).toBe("boom");
  });

  /**
   * The kind rides ALONGSIDE the redaction rather than loosening it. A name
   * already crossed; nothing else may start to.
   */
  test("nothing else about the error crosses", () => {
    const leaky = Object.assign(new Error("db failed"), {
      name: "NotFound",
      [NOT_FOUND]: true,
      sourceURL: "/home/someone/secret/probe.ts",
      line: 3,
    });
    const payload = encodeSeed({ leaky });
    expect(payload).not.toContain("sourceURL");
    expect(payload).not.toContain("secret");
  });
});

/**
 * The STREAMING seed channel, which is the one a rejected loader reaches.
 *
 * seroval picks its parse mode from the context rather than from the value:
 * `serialize` is sync, a promise's settled value is `async`, and
 * `crossSerializeStream` is `stream`. `redactError` defined only `sync`, so on
 * the other two the plugin did not apply at all and seroval's BUILT-IN Error
 * node ran instead — which writes an error's own enumerable properties.
 *
 * On Bun those are `sourceURL`, `line`, `column`, `originalLine` and
 * `originalColumn`, so every streamed response whose loader threw carried the
 * server's absolute filesystem path in its HTML.
 */
describe("a rejected loader on the streaming channel", () => {
  const NOT_FOUND = Symbol.for("barq.not-found");

  const streamOf = async (value: Record<string, unknown>): Promise<string> => {
    const encoder = createSeedEncoder();
    const chunks: string[] = [];
    await new Promise<void>((done) => {
      const initial = encoder.encodeDeferred(
        value,
        (payload) => chunks.push(payload),
        () => done(),
      );
      chunks.unshift(initial);
    });
    return chunks.join("\n");
  };

  /** The leak, named by the property that carried it. */
  test("the server's own paths do not reach the wire", async () => {
    // The shape Bun really produces: own enumerable properties on the Error.
    const leaky = Object.assign(new Error("db connection failed"), {
      name: "NotFound",
      [NOT_FOUND]: true,
      sourceURL: "/home/someone/app/src/data/rows.ts",
      originalLine: 2,
      column: 30,
    });
    const rejected = Promise.reject(leaky);
    rejected.catch(() => {});

    const payload = await streamOf({ e: rejected });
    expect(payload).not.toContain("sourceURL");
    expect(payload).not.toContain("/home/someone");
    expect(payload).not.toContain("originalLine");
    // The message and the name still cross, as they always did.
    expect(payload).toContain("db connection failed");
  });

  test("and the kind survives the rejection", async () => {
    const missing = Object.assign(new Error("no such row"), {
      name: "NotFound",
      [NOT_FOUND]: true,
    });
    const rejected = Promise.reject(missing);
    rejected.catch(() => {});

    const payload = await streamOf({ e: rejected });
    expect(payload).toContain("barq.not-found");
  });
});

/**
 * `serializationAdapters` — a type only the application knows, taught to cross.
 *
 * seroval already carries `Date`, `Map`, `Set`, `BigInt` and cycles. What it
 * cannot carry is a domain type, and one arriving as a plain object with its
 * methods gone is a bug that shows up one call later and nowhere near its cause.
 */
describe("serialization adapters", () => {
  /** A type the codec has no idea about. */
  class Money {
    constructor(
      readonly cents: number,
      readonly currency: string,
    ) {}
    format(): string {
      return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
    }
  }

  const money = createSerializationAdapter<Money, { c: number; u: string }>({
    key: "money",
    test: (value): value is Money => value instanceof Money,
    toSerializable: (value) => ({ c: value.cents, u: value.currency }),
    fromSerializable: (value) => new Money(value.c, value.u),
  });

  afterEach(clearSerializationAdapters);

  /**
   * WITHOUT AN ADAPTER THE ENCODE REFUSES, which is better than the silent loss
   * this was assumed to be: seroval will not guess at a class it does not know,
   * so a loader returning one fails where it is returned rather than one call
   * later with its methods missing.
   */
  test("without one, the value cannot cross at all", () => {
    expect(() => encodeWire(new Money(1250, "GBP"))).toThrow();
  });

  test("with one, the value round-trips as itself", () => {
    registerSerializationAdapters([money as never]);
    const back = decodeWire<Money>(encodeWire(new Money(1250, "GBP")));
    expect(back).toBeInstanceOf(Money);
    expect(back.format()).toBe("12.50 GBP");
  });

  test("it reaches a value NESTED in an ordinary structure", () => {
    registerSerializationAdapters([money as never]);
    const back = decodeWire<{ rows: Money[]; when: Date }>(
      encodeWire({ rows: [new Money(1, "GBP")], when: new Date(0) }),
    );
    expect(back.rows[0]).toBeInstanceOf(Money);
    // …and the types seroval already carried still work.
    expect(back.when).toBeInstanceOf(Date);
  });

  /**
   * The SEED is JS rather than JSON, so an adapter cannot inline its rebuild —
   * `fromSerializable` is a closure in the application's bundle. It emits a
   * call into the client registry instead.
   */
  test("the seed emits a call into the client registry", () => {
    registerSerializationAdapters([money as never]);
    const payload = encodeSeed({ price: new Money(1250, "GBP") });
    expect(payload).toContain("__BARQ_REVIVE__");
    expect(payload).toContain('"money"');
    // The reduced form is what travels, not the instance.
    expect(payload).toContain("1250");
  });

  test("the streaming encoder carries one too", async () => {
    registerSerializationAdapters([money as never]);
    const seeds = createSeedEncoder();
    const later: string[] = [];
    let done!: () => void;
    const drained = new Promise<void>((resolve) => {
      done = resolve;
    });
    const initial = seeds.encodeDeferred(
      { price: Promise.resolve(new Money(99, "EUR")) },
      (statement) => later.push(statement),
      done,
    );
    await drained;
    expect(`${initial}${later.join("")}`).toContain("__BARQ_REVIVE__");
  });

  /**
   * `redactError` is asked LAST, so an adapter may claim an `Error` subclass of
   * its own — seroval tries plugins in order and the redactor tests every
   * `Error`, so it would otherwise take them all.
   */
  test("an adapter beats the Error redactor for its own subclass", () => {
    class Refusal extends Error {
      constructor(readonly code: string) {
        super("refused");
      }
    }
    registerSerializationAdapters([
      createSerializationAdapter<Refusal, string>({
        key: "refusal",
        test: (value): value is Refusal => value instanceof Refusal,
        toSerializable: (value) => value.code,
        fromSerializable: (code) => new Refusal(code),
      }) as never,
    ]);
    const back = decodeWire<Refusal>(encodeWire(new Refusal("E_NOPE")));
    expect(back).toBeInstanceOf(Refusal);
    expect(back.code).toBe("E_NOPE");
    // An ordinary Error still goes through the redactor.
    expect(decodeWire<Error>(encodeWire(new Error("plain")))).toBeInstanceOf(Error);
  });

  test("registering the same key twice replaces it, which is what an edit is", () => {
    registerSerializationAdapters([money as never]);
    registerSerializationAdapters([
      createSerializationAdapter<Money, { c: number; u: string }>({
        key: "money",
        test: (value): value is Money => value instanceof Money,
        toSerializable: (value) => ({ c: value.cents, u: "USD" }),
        fromSerializable: (value) => new Money(value.c, value.u),
      }) as never,
    ]);
    expect(serializationAdapters()).toHaveLength(1);
    expect(decodeWire<Money>(encodeWire(new Money(5, "GBP"))).currency).toBe("USD");
  });
});
