/**
 * Search validation, and the middlewares that build one.
 *
 * Three accepted shapes, probed in TanStack's order — a Standard Schema first,
 * then a `.parse` object, then a plain function (`router.ts:2709-2735`). The
 * order matters: a zod v4 schema has BOTH `~standard` and `parse`, and the
 * Standard Schema path is the one that reports issues rather than throwing a
 * vendor error.
 *
 * ASYNC VALIDATION IS REFUSED, not awaited. A schema that returns a promise
 * means the search cannot be known before the location commits, and a location
 * that commits before its own search is validated has already rendered the
 * wrong page. TanStack refuses it too.
 *
 * NO SECOND DEPENDENCY: `StandardSchema` is `@barqjs/start`'s, declared once for
 * server-function validators and reused here.
 *
 * WHAT THIS DELIBERATELY DOES NOT COPY. TanStack encodes each search value as
 * JSON and decodes with a heuristic, and the result is not a fixpoint: `?k=a&k=b`
 * decodes to an array (`qss.ts:64-80`) and re-encodes as one JSON string
 * (`searchParams.ts:67-73`), so decode-then-encode is not identity. barq's wire
 * format stays a plain query string and coercion is the schema's job — which is
 * where the author already declared what the types are.
 */

import type { StandardSchema } from "@barqjs/start";

/** What a route may declare to validate and type its slice of the search. */
export type SearchValidator<Out = Record<string, unknown>> =
  | StandardSchema<unknown, Out>
  | { parse: (input: unknown) => Out }
  | ((input: Record<string, unknown>) => Out);

/** The search failed its route's validator. Lands on that route's error boundary. */
export class SearchParamError extends Error {
  readonly issues: readonly unknown[];
  constructor(message: string, issues: readonly unknown[] = []) {
    super(message);
    this.name = "SearchParamError";
    this.issues = issues;
  }
}

/** A `URLSearchParams` as a plain record; a repeated key becomes an array. */
export function searchRecord(search: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of search) {
    const seen = out[name];
    if (seen === undefined) out[name] = value;
    else if (Array.isArray(seen)) (seen as string[]).push(value);
    else out[name] = [seen as string, value];
  }
  return out;
}

/** Run one route's validator over the search it inherits. */
export function validateSearch(
  validator: SearchValidator | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (validator === undefined) return {};

  if (typeof validator === "object" && "~standard" in validator) {
    const result = validator["~standard"].validate(input);
    if (result instanceof Promise) {
      throw new SearchParamError(
        "a search validator returned a promise; validation has to finish before the location commits",
      );
    }
    if ("issues" in result && result.issues !== undefined) {
      throw new SearchParamError("search did not validate", result.issues);
    }
    return (result as { value: Record<string, unknown> }).value;
  }

  if (typeof validator === "object" && "parse" in validator) {
    return validator.parse(input);
  }

  if (typeof validator === "function") return validator(input);
  return {};
}

// ------------------------------------------------------------- middlewares

/**
 * What a middleware sees and what it may hand on.
 *
 * `next` is the rest of the chain, innermost last, so a middleware may act
 * before it, after it, or instead of it. `defaults` records what a validator
 * ADDED rather than what the caller asked for, which is the channel
 * `stripSearchParams` uses to tell a schema default from a real value.
 */
export interface SearchMiddlewareContext {
  readonly search: Record<string, unknown>;
  readonly defaults: ReadonlyMap<string, unknown>;
  readonly next: (search: Record<string, unknown>) => Record<string, unknown>;
}

export type SearchMiddleware = (context: SearchMiddlewareContext) => Record<string, unknown>;

/**
 * Drop keys from a built location.
 *
 * `true` drops everything. An array drops the named keys. A record drops a key
 * whose value EQUALS the default it names, which is what keeps `?page=1` out of
 * a URL whose schema already defaults `page` to 1.
 */
export function stripSearchParams(
  input: true | readonly string[] | Record<string, unknown>,
): SearchMiddleware {
  return ({ search, next }) => {
    if (input === true) return {};
    const out = { ...next(search) };
    if (Array.isArray(input)) {
      for (const key of input) delete out[key];
      return out;
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (out[key] === value) delete out[key];
    }
    return out;
  };
}

/**
 * Carry keys across a navigation that did not mention them.
 *
 * A key the caller set EXPLICITLY wins over a retained one — otherwise
 * `search: { tab: undefined }` on a link could never clear a retained key.
 */
export function retainSearchParams(keys: true | readonly string[]): SearchMiddleware {
  return ({ search, next }) => {
    const result = next(search);
    const out = { ...result };
    const wanted = keys === true ? Object.keys(search) : keys;
    for (const key of wanted) {
      if (!(key in result) && key in search) out[key] = search[key];
    }
    return out;
  };
}

/** Run a chain outermost-first, ending in the caller's own intent. */
export function applySearchMiddleware(
  middlewares: readonly SearchMiddleware[],
  current: Record<string, unknown>,
  intent: Record<string, unknown>,
  defaults: ReadonlyMap<string, unknown>,
): Record<string, unknown> {
  const step = (index: number, search: Record<string, unknown>): Record<string, unknown> => {
    const middleware = middlewares[index];
    if (middleware === undefined) return intent;
    return middleware({ search, defaults, next: (next) => step(index + 1, next) });
  };
  return step(0, current);
}

/**
 * A record back onto the wire. `undefined`, `null` and `""` drop their key.
 *
 * An array becomes REPEATED keys, which `searchRecord` reads back as an array —
 * so the pair is a fixpoint, which TanStack's is not. A non-primitive value has
 * no lossless plain-query spelling, so it is JSON-encoded rather than allowed to
 * stringify itself into `[object Object]`; a schema that produces one has to
 * parse it back. Keeping search values primitive avoids the question.
 */
export function toSearchString(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const write = (key: string, value: unknown): void => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "string") {
      params.append(key, value);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      params.append(key, value.toString());
      return;
    }
    params.append(key, JSON.stringify(value) ?? "");
  };
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) write(key, item);
      continue;
    }
    write(key, value);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
