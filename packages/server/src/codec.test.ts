/**
 * What the value channel carries, and what it refuses to.
 *
 * The redaction rules live in `server.test.ts` beside the render they protect;
 * this file is about the one thing an Error has to KEEP.
 */

import { describe, expect, test } from "bun:test";

import { decodeWire, encodeSeed, encodeWire } from "./codec.ts";

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
