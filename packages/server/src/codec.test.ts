/**
 * What the value channel carries, and what it refuses to.
 *
 * The redaction rules live in `server.test.ts` beside the render they protect;
 * this file is about the one thing an Error has to KEEP.
 */

import { describe, expect, test } from "bun:test";

import { createSeedEncoder, decodeWire, encodeSeed, encodeWire } from "./codec.ts";

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

  const streamOf = async (value: unknown): Promise<string> => {
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
