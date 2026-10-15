/**
 * Rate limiting, as a middleware — so one closure guards a server function and
 * a route handler alike.
 *
 * THE STORE HAS NO DEFAULT, and that is the whole design of this file.
 *
 * An in-memory counter is correct for exactly one process. Behind a load
 * balancer with three instances it permits three times the limit, and behind an
 * autoscaler it permits an unbounded multiple — while passing every test, on
 * every machine, in every CI run. That is the silent failure this codebase
 * refuses: a limiter that reads as working and protects nothing. Requiring the
 * store makes the distributed question unavoidable at the call site, which is
 * the only place it can be answered.
 *
 * `memoryStore()` ships beside it and is named for what it is. Use it for a
 * single instance, and know that is what you have chosen.
 *
 * WHAT THIS IS NOT: a defence against a distributed flood. A limiter in the
 * application has already paid for the TLS handshake, the routing and the
 * middleware above it. It is here to stop credential stuffing, scraping and one
 * client hammering an expensive handler — the things a proxy in front cannot see
 * because they are shaped like ordinary traffic. Volumetric denial of service is
 * the edge's problem and always was.
 */

import { type ForwardedForTrust, assertForwardedForTrust, getRequestIP } from "./context.ts";
import type { Middleware } from "./index.ts";

/** One key's usage, as the store hands it back. */
export interface RateLimitCount {
  /** How many requests this key has made in the current window. */
  readonly count: number;
  /** When the current window ends, as a millisecond timestamp. */
  readonly resetAt: number;
}

/**
 * Where the counts live.
 *
 * ONE METHOD, and it is atomic by contract: `hit` must increment and return the
 * new value in a single step. A `get` then `set` pair is a race — two requests
 * read the same count and both write it — and a limiter that loses increments
 * under load is one that stops working exactly when it is needed. Redis does
 * this with `INCR` plus `PEXPIRE`; the memory store below does it by being
 * single-threaded.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): RateLimitCount | Promise<RateLimitCount>;
}

export interface RateLimitOptions {
  /** How many requests a key may make per window. */
  readonly limit: number;
  /** The window, in milliseconds. */
  readonly windowMs: number;
  /**
   * What counts as one caller.
   *
   * There is no default, for the same reason the store has none: keying by IP is
   * right for a public endpoint and wrong for an authenticated one behind a
   * corporate NAT, where it limits a whole building as though it were one user.
   * Key by user id where there is one, and by IP only where there is not.
   *
   * Returning `null` EXEMPTS the request — an internal caller, a health check.
   */
  readonly key: () => string | null | Promise<string | null>;
  readonly store: RateLimitStore;
  /**
   * What to answer when the limit is reached. A 429 with `Retry-After` by
   * default, which is what a well-behaved client backs off on.
   */
  readonly onLimit?: (info: RateLimitCount & { readonly limit: number }) => Response;
}

/**
 * A store for ONE PROCESS. Named so the choice is visible at the call site.
 *
 * Correct for a single instance and wrong for every other deployment — see the
 * header. It is here because "no store at all" would push everyone to write this
 * same map badly, not because it is the one to reach for.
 *
 * Expired entries are swept by a `hit` rather than on a timer: a timer keeps
 * the process alive on Node and has to be unref'd. A key is one caller and most
 * callers are never seen again (a scan, a client rotating through an IPv6
 * prefix), so an entry dropped only when its own key came back would stay for
 * the life of the process and the map would grow with every address ever seen.
 *
 * The sweep runs at most once per the longest window in use, so an entry that
 * has expired is gone by the second sweep after it was made, and the map holds
 * what the last two such windows saw rather than everything since boot.
 */
export function memoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let longest = 0;
  let sweepAt = 0;
  return {
    hit(key, windowMs) {
      const now = Date.now();
      if (windowMs > longest) longest = windowMs;
      if (now >= sweepAt) {
        for (const [seen, window] of windows) {
          if (window.resetAt <= now) windows.delete(seen);
        }
        sweepAt = now + longest;
      }
      const found = windows.get(key);
      if (found === undefined || found.resetAt <= now) {
        const resetAt = now + windowMs;
        windows.set(key, { count: 1, resetAt });
        return { count: 1, resetAt };
      }
      found.count += 1;
      // A COPY, because the record goes on counting. A caller reads this after
      // an `await`, and by then the hits that arrived behind it have landed.
      return { count: found.count, resetAt: found.resetAt };
    },
  };
}

/**
 * Key a limit by client address.
 *
 * `xForwardedFor` IS OFF BY DEFAULT and turning it on is a claim about the
 * deployment: `X-Forwarded-For` is a header a CLIENT can send, so trusting it
 * where no proxy overwrites it lets any caller pick their own bucket and the
 * limit stops existing. See `getRequestIP`.
 *
 * `true` reads the LEFTMOST entry, which is the client only when the edge proxy
 * overwrites the header. Behind a proxy that appends, pass
 * `{ trustedProxies: n }` for the `n` proxies you run: it reads the entry the
 * outermost of them wrote and ignores anything a caller put in front of it.
 *
 * A request with no address at all keys as `"unknown"`, which pools every such
 * caller into one bucket — strict rather than exempt, because the alternative is
 * a bucket an attacker can opt into by arranging to have no address.
 */
export function byIP(options: { readonly xForwardedFor?: ForwardedForTrust } = {}): () => string {
  // Here and not on the first request: `rateLimit` fails OPEN when its key
  // throws, so a bad hop count found per call would switch the limit off.
  assertForwardedForTrust(options.xForwardedFor);
  return () => getRequestIP(options) ?? "unknown";
}

function tooMany(info: RateLimitCount & { limit: number }): Response {
  const seconds = Math.max(1, Math.ceil((info.resetAt - Date.now()) / 1000));
  return new Response("too many requests", {
    status: 429,
    headers: {
      "retry-after": String(seconds),
      "ratelimit-limit": String(info.limit),
      "ratelimit-remaining": "0",
      "ratelimit-reset": String(seconds),
    },
  });
}

/**
 * The middleware.
 *
 * It runs BEFORE the handler and before validation, which is the whole point:
 * refusing after the body has been parsed is a refusal that already did the
 * work. That ordering is `serverRpc`'s and the route dispatch's, and it is why
 * this is a middleware rather than something a handler calls.
 *
 * A STORE THAT THROWS FAILS OPEN, deliberately and loudly. If Redis is down,
 * refusing every request turns a limiter into the outage — so the request
 * proceeds and the failure is reported. That is the right trade for a limiter
 * and the wrong one for an authorization check, which is why this is not one.
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const { limit, windowMs, key, store, onLimit = tooMany } = options;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(
      `[barq] \`rateLimit({ limit })\` must be a positive integer, and it is ${limit}. Pass how many requests one key may make per window, such as \`limit: 10\`.`,
    );
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(
      `[barq] \`rateLimit({ windowMs })\` must be a positive number of milliseconds, and it is ${windowMs}. Pass the window length, such as \`windowMs: 60_000\`.`,
    );
  }

  return async (next) => {
    let info: RateLimitCount;
    try {
      const bucket = await key();
      // `null` exempts — an internal caller, a health check.
      if (bucket === null) return next();
      info = await store.hit(bucket, windowMs);
    } catch (error) {
      // FAIL OPEN. A limiter that refuses everything when its store is down has
      // become the outage it exists to prevent.
      console.error(
        "[barq] The rate-limit `store` or `key` threw, so this request was let through without being counted. The error:",
        error,
      );
      return next();
    }
    if (info.count > limit) throw onLimit({ ...info, limit });
    return next();
  };
}
