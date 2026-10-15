/**
 * URL rewrites: a two-way mapping between the URL a browser shows and the one
 * the router matches. TanStack's `rewrite` option, and its `composeRewrites`.
 *
 * Applied at the history, which is the one place a location is read and
 * written, so nothing above it knows the public spelling.
 */

import { type History, type Location, addBase, href, parseLocation } from "./history.ts";
import { leavesTheApp } from "./path.ts";

/**
 * One direction of a URL rewrite. Handed a `URL` it may mutate and return, or
 * answer with a replacement; `undefined` leaves the URL as it was mutated.
 */
export type LocationRewriteFunction = (options: { url: URL }) => undefined | string | URL;

/**
 * A two-way mapping between the URL a browser shows and the one the router
 * matches: `input` on the way in, `output` on the way out. A locale prefix is
 * the usual reason for one.
 */
export interface LocationRewrite {
  readonly input?: LocationRewriteFunction;
  readonly output?: LocationRewriteFunction;
}

function runRewrite(step: LocationRewriteFunction | undefined, url: URL): URL {
  const answer = step?.({ url });
  if (typeof answer === "string") return new URL(answer, url);
  return answer instanceof URL ? answer : url;
}

/** Several rewrites as one: inputs run first to last, outputs last to first. */
export function composeRewrites(rewrites: readonly LocationRewrite[]): Required<LocationRewrite> {
  return {
    input: ({ url }) => {
      let current = url;
      for (const rewrite of rewrites) current = runRewrite(rewrite.input, current);
      return current;
    },
    output: ({ url }) => {
      let current = url;
      for (let at = rewrites.length - 1; at >= 0; at--) {
        current = runRewrite(rewrites[at]?.output, current);
      }
      return current;
    },
  };
}

/** The origin a rewrite's `URL` is built on when nothing says otherwise. */
export function defaultOrigin(): string {
  const origin = typeof window === "undefined" ? undefined : window.location?.origin;
  return origin === undefined || origin === "null" ? "http://localhost" : origin;
}

/**
 * Run one direction of a rewrite over a `path?query#hash`.
 *
 * A result on another origin comes back absolute, so `leavesTheApp` sees it for
 * what it is.
 */
export function rewriteHref(
  step: LocationRewriteFunction | undefined,
  to: string,
  origin: string = defaultOrigin(),
): string {
  if (step === undefined) return to;
  const url = runRewrite(step, new URL(to, origin));
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

/**
 * A target, as the BROWSER must see it.
 *
 * Everything inside the router works in application space, where `/about` is
 * `/about` whatever the deployment mounted it under and whatever a rewrite
 * shows instead. An `href` attribute, a `Location` header and a document load
 * are the strings that leave for the browser, so they carry both: the rewrite's
 * `output` first, and the base outside it.
 */
export function publicHref(
  to: string,
  options: {
    readonly rewrite?: LocationRewrite;
    readonly origin?: string;
    readonly base?: string;
  },
): string {
  if (leavesTheApp(to)) return to;
  const written = rewriteHref(options.rewrite?.output, to, options.origin);
  const base = options.base ?? "";
  return base === "" || leavesTheApp(written) ? written : addBase(written, base);
}

/**
 * A history seen through a rewrite: locations are read through `input` and
 * written through `output`, so nothing above it knows the public spelling.
 */
export function rewriteHistory(
  inner: History,
  rewrite: LocationRewrite,
  origin: string = defaultOrigin(),
): History {
  let last: { from: Location; to: Location } | null = null;
  const read = (location: Location): Location => {
    if (rewrite.input === undefined) return location;
    if (last?.from === location) return last.to;
    const mapped = parseLocation(
      rewriteHref(rewrite.input, href(location), origin),
      location.state,
    );
    const to = { ...mapped, key: location.key };
    last = { from: location, to };
    return to;
  };
  return {
    current: () => read(inner.current()),
    go: (delta) => inner.go(delta),
    ...(inner.depth === undefined ? {} : { depth: () => inner.depth?.() ?? 0 }),
    push: (to, options) => inner.push(rewriteHref(rewrite.output, to, origin), options),
    subscribe: (listener) =>
      inner.subscribe((location, action) => listener(read(location), action)),
  };
}
