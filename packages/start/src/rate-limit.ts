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

import { getRequestIP } from "./context.ts";
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
 * Expired entries are dropped on read rather than on a timer: a timer keeps the
 * process alive on Node and has to be unref'd, and a sweep over a map that is
 * only ever read is work nobody asked for. The cost is that a key never asked
 * about again holds its entry until the map is dropped, which is bounded by the
 * key space and not by traffic.
 */
export function memoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, windowMs) {
      const now = Date.now();
      const found = windows.get(key);
      if (found === undefined || found.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      found.count += 1;
      return found;
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
 * A request with no address at all keys as `"unknown"`, which pools every such
 * caller into one bucket — strict rather than exempt, because the alternative is
 * a bucket an attacker can opt into by arranging to have no address.
 */
export function byIP(options: { readonly xForwardedFor?: boolean } = {}): () => string {
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
    throw new RangeError(`[barq] a rate limit must be a positive integer; got ${limit}`);
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`[barq] a rate-limit window must be positive; got ${windowMs}`);
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
      console.error("[barq] rate-limit store failed; letting the request through", error);
      return next();
    }
    if (info.count > limit) throw onLimit({ ...info, limit });
    return next();
  };
}
