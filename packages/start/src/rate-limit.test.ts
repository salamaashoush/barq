/**
 * The rate limiter, and the properties that decide whether it is worth having.
 *
 * The interesting cases are not "it counts". They are: the refusal happens
 * BEFORE the handler, a store that is down does not become the outage, and the
 * window actually rolls.
 */

import { describe, expect, spyOn, test } from "bun:test";

import { type RateLimitStore, byIP, memoryStore, rateLimit } from "./rate-limit.ts";
import { withRequest } from "./context.ts";
import { runMiddleware } from "./middleware.ts";

/** Run a middleware the way `serverRpc` does, reporting what the handler saw. */
async function run(
  middleware: ReturnType<typeof rateLimit>,
  request = new Request("http://x/"),
): Promise<{ ran: boolean; refused: Response | null }> {
  let ran = false;
  try {
    await withRequest(request, async () =>
      runMiddleware([middleware], "server", {
        data: undefined,
        signal: request.signal,
        context: {},
        sendContext: {},
        run: async () => {
          ran = true;
        },
      }),
    );
    return { ran, refused: null };
  } catch (error) {
    if (error instanceof Response) return { ran, refused: error };
    throw error;
  }
}

const limiter = (over: Partial<Parameters<typeof rateLimit>[0]> = {}) =>
  rateLimit({
    limit: 2,
    windowMs: 1000,
    key: () => "one-caller",
    store: memoryStore(),
    ...over,
  });

describe("counting", () => {
  test("the limit is inclusive, and the one after it is refused", async () => {
    const middleware = limiter();
    expect((await run(middleware)).refused).toBeNull();
    expect((await run(middleware)).refused).toBeNull();

    const third = await run(middleware);
    expect(third.refused?.status).toBe(429);
    // BEFORE the handler. Refusing after the body has been parsed is a refusal
    // that already did the work.
    expect(third.ran).toBe(false);
  });

  test("the refusal tells a client when to come back", async () => {
    const middleware = limiter({ limit: 1 });
    await run(middleware);
    const refused = (await run(middleware)).refused;
    expect(refused?.headers.get("retry-after")).toBe("1");
    expect(refused?.headers.get("ratelimit-limit")).toBe("1");
    expect(refused?.headers.get("ratelimit-remaining")).toBe("0");
  });

  test("the window rolls", async () => {
    const middleware = limiter({ limit: 1, windowMs: 30 });
    expect((await run(middleware)).refused).toBeNull();
    expect((await run(middleware)).refused?.status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect((await run(middleware)).refused).toBeNull();
  });

  test("separate keys are separate buckets", async () => {
    const store = memoryStore();
    let who = "a";
    const middleware = rateLimit({ limit: 1, windowMs: 1000, key: () => who, store });
    expect((await run(middleware)).refused).toBeNull();
    expect((await run(middleware)).refused?.status).toBe(429);
    who = "b";
    expect((await run(middleware)).refused).toBeNull();
  });

  test("a `null` key exempts the request entirely", async () => {
    // An internal caller, a health check.
    const middleware = limiter({ limit: 1, key: () => null });
    for (let i = 0; i < 5; i++) expect((await run(middleware)).refused).toBeNull();
  });
});

describe("when the store is not there", () => {
  /**
   * FAIL OPEN, deliberately. A limiter that refuses everything because Redis is
   * down has become the outage it exists to prevent. That is the right trade for
   * a limiter and the wrong one for an authorization check — which is why this
   * is not one, and why the file says so.
   */
  test("a store that throws lets the request through", async () => {
    const broken: RateLimitStore = {
      hit() {
        throw new Error("redis is down");
      },
    };
    const result = await run(limiter({ store: broken }));
    expect(result.refused).toBeNull();
    expect(result.ran).toBe(true);
  });

  test("a key function that throws does too", async () => {
    const result = await run(
      limiter({
        key: () => {
          throw new Error("no session");
        },
      }),
    );
    expect(result.ran).toBe(true);
  });
});

describe("the shapes that cannot work are refused at construction", () => {
  test("a non-positive limit or window is a RangeError", () => {
    const base = { windowMs: 1000, key: () => "k", store: memoryStore() };
    expect(() => rateLimit({ ...base, limit: 0 })).toThrow(/positive integer/);
    expect(() => rateLimit({ ...base, limit: 1.5 })).toThrow(/positive integer/);
    expect(() => rateLimit({ ...base, limit: 1, windowMs: 0 })).toThrow(
      /`rateLimit\(\{ windowMs \}\)` must be a positive number of milliseconds/,
    );
  });
});

describe("keying by address", () => {
  test("`X-Forwarded-For` is IGNORED unless the deployment says otherwise", async () => {
    // Otherwise any caller picks their own bucket by sending a header, and the
    // limit stops existing.
    const request = new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.4" } });
    const guessed = await withRequest(request, () => byIP()());
    const trusted = await withRequest(request, () => byIP({ xForwardedFor: true })());
    expect(guessed).toBe("unknown");
    expect(trusted).toBe("203.0.113.4");
  });

  test("the leftmost entry is the client; the rest were added by hops", async () => {
    const request = new Request("http://x/", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1, 10.0.0.2" },
    });
    expect(await withRequest(request, () => byIP({ xForwardedFor: true })())).toBe("203.0.113.4");
  });

  test("no address at all pools into one bucket rather than exempting", async () => {
    // Strict, because the alternative is a bucket an attacker opts into by
    // arranging to have no address.
    expect(await withRequest(new Request("http://x/"), () => byIP()())).toBe("unknown");
  });
});

describe("keying by address behind proxies that append", () => {
  const from = (forwarded: string, ip?: string): Request => {
    const request = new Request("https://example.com/", {
      headers: { "x-forwarded-for": forwarded },
    });
    return ip === undefined ? request : Object.assign(request, { ip });
  };

  test("one trusted proxy: the rightmost entry is what it saw", async () => {
    const key = byIP({ xForwardedFor: { trustedProxies: 1 } });
    expect(await withRequest(from("198.51.100.7"), key)).toBe("198.51.100.7");
  });

  test("a prefix the caller forged is never the key", async () => {
    // The caller sent `X-Forwarded-For: 203.0.113.9`; the proxy appended the
    // address it accepted the connection from.
    const forged = from("203.0.113.9, 198.51.100.7");
    expect(await withRequest(forged, byIP({ xForwardedFor: true }))).toBe("203.0.113.9");
    expect(await withRequest(forged, byIP({ xForwardedFor: { trustedProxies: 1 } }))).toBe(
      "198.51.100.7",
    );
  });

  test("two trusted proxies: the second entry from the right", async () => {
    const key = byIP({ xForwardedFor: { trustedProxies: 2 } });
    expect(await withRequest(from("203.0.113.9, 198.51.100.7, 10.0.0.1"), key)).toBe(
      "198.51.100.7",
    );
  });

  test("a header shorter than the chain did not come through it, and is ignored", async () => {
    const key = byIP({ xForwardedFor: { trustedProxies: 2 } });
    expect(await withRequest(from("203.0.113.9"), key)).toBe("unknown");
    expect(await withRequest(from("203.0.113.9", "10.0.0.1"), key)).toBe("10.0.0.1");
  });

  test("an empty entry where the trusted hop should be is not an address", async () => {
    const key = byIP({ xForwardedFor: { trustedProxies: 1 } });
    expect(await withRequest(from("203.0.113.9, "), key)).toBe("unknown");
  });

  test("a hop count that names no entry is refused where it is written", () => {
    // Per request it would throw inside the limiter's key, which fails open.
    expect(() => byIP({ xForwardedFor: { trustedProxies: 0 } })).toThrow(/positive integer/);
    expect(() => byIP({ xForwardedFor: { trustedProxies: 1.5 } })).toThrow(/positive integer/);
  });
});

describe("the memory store", () => {
  test("is atomic enough to survive concurrent hits", async () => {
    // A `get` then `set` pair would lose increments here, and a limiter that
    // loses increments under load stops working exactly when it is needed.
    const store = memoryStore();
    const results = await Promise.all(Array.from({ length: 50 }, () => store.hit("k", 1000)));
    expect(Math.max(...results.map((one) => one.count))).toBe(50);
  });

  test("an expired window starts a fresh count rather than growing forever", async () => {
    const store = memoryStore();
    expect((await store.hit("k", 20)).count).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await store.hit("k", 20)).count).toBe(1);
  });

  test("windows that have expired do not stay in it", async () => {
    // The store keeps its map private, so the first write is where it is seen.
    const writes = spyOn(Map.prototype, "set");
    const store = memoryStore();
    await store.hit("seed", 1);
    const windows = writes.mock.contexts[0] as Map<unknown, unknown> | undefined;
    writes.mockRestore();

    // One caller per address, each seen once: a scan, or a client rotating
    // through an IPv6 prefix.
    for (let index = 0; index < 5_000; index++) await store.hit(`203.0.113.${index}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (let index = 0; index < 5_000; index++) await store.hit(`198.51.100.${index}`, 1);

    expect(windows).toBeDefined();
    // Every one of the first 5,000 expired before the second 5,000 arrived.
    expect(windows?.size).toBeLessThanOrEqual(5_001);
  });

  test("a window still running is not swept with the ones that have ended", async () => {
    const store = memoryStore();
    await store.hit("long", 60_000);
    for (let index = 0; index < 100; index++) await store.hit(`short-${index}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await store.hit("another", 1);

    expect((await store.hit("long", 60_000)).count).toBe(2);
  });
});

describe("a burst that arrives together", () => {
  test("the requests inside the limit pass, and only the ones past it are refused", async () => {
    // Every request has hit the store before the first one reads its count
    // back, so a count that is one shared record reads as the total for all.
    const middleware = limiter({ limit: 2 });
    const results = await Promise.all([run(middleware), run(middleware), run(middleware)]);
    expect(results.map((one) => one.refused?.status ?? 200).toSorted((a, b) => a - b)).toEqual([
      200, 200, 429,
    ]);
  });

  test("a count the store handed back is that hit's, whatever arrives after it", async () => {
    const store = memoryStore();
    const first = await store.hit("k", 1000);
    await store.hit("k", 1000);
    expect(first.count).toBe(1);
  });
});
