/**
 * The client half of a server function, and NOTHING the server half needs.
 *
 * Its own module because of what importing it costs. The compiler replaces a
 * server-function module's contents with `export const x = clientRpc("<id>")`,
 * and that stub used to import from `@barqjs/start` — whose index re-exports
 * `context.ts`, which is `node:async_hooks`. Every client bundle that reached
 * one server function therefore pulled the request-context machinery, the
 * middleware runner, the validators and the error classes, and Vite printed
 * "node:async_hooks has been externalized for browser compatibility" on every
 * build.
 *
 * That was survivable while a route module was `lazy()`, because the cost sat
 * in that route's own chunk. It stopped being survivable when `routeTree.gen.ts`
 * started importing route modules STATICALLY: measured on
 * `packages/kitchen-sink`, 25.7 kB of it moved into the set every page
 * preloads, for an application with two server functions on one route.
 *
 * So the stub imports from here. `index.ts` re-exports every name below, so an
 * application still writes `import { createServerFn } from "@barqjs/start"` and
 * nothing about the authoring surface changes.
 */

import { decodeWire, encodeWire } from "@barqjs/server/codec";

export const SERVER_FN = Symbol.for("barq.server-fn");

/** Where mounted server functions answer. */
export const RPC_PREFIX = "/_barq/fn/";

/**
 * What distinguishes an RPC call from a form submission: the URL, not a header.
 *
 * `/_barq/fn/<id>` is what `<form action={fn}>` writes, takes `FormData`, and
 * answers with a redirect a browser can follow with JS disabled.
 * `/_barq/fn/<id>.data` is the JSON channel and answers with a value.
 *
 * React Router's `.data` suffix, and the reason is its reason: a header decides
 * the response shape invisibly, and a form cannot set one. RedwoodSDK shows the
 * failure — it emits the right hidden fields for a no-JS submit and never reads
 * them, so the form posts, returns 200, and nothing happens.
 */
export const DATA_SUFFIX = ".data";

export interface ServerFnMeta {
  /** Stable across edits and deploys: the module path and the export name. */
  id: string;
}

/**
 * How a server function is CALLED: `fn({ data })`, and `fn()` when it takes
 * none.
 *
 * TanStack's convention (`examples/react/start-basic/src/utils/posts.tsx:10-12`,
 * `fetchPost({ data: postId })`; `routes/deferred.tsx:5-8`), and worth matching
 * for a reason beyond fidelity: a named field leaves room for the options that
 * come after it without ever changing the call shape again, and it removes the
 * `adminStats(undefined)` the bare form forced on every no-argument call.
 */
export type ServerFnArgs<In> = [In] extends [undefined]
  ? // No validator means no input, so the call takes no argument. A rest tuple
    // with a `void` element does NOT make the parameter optional — `fn()` was a
    // "Expected 1 arguments, but got 0" until this was written as an optional
    // element instead.
    [options?: FormData]
  : [options: { readonly data: In } | FormData];

/**
 * A server function, from either side.
 *
 * A bare `FormData` is accepted BESIDE the options object, and only there. It is
 * what `<form action={fn}>` hands the function on the enhanced path, and a
 * `FormData` can never be mistaken for an options object — so the no-JS
 * submission and the JS one reach the handler identically, which is the whole
 * point of that path. TanStack has no counterpart to match here.
 */
export type ServerFn<In, Out> = ((...args: ServerFnArgs<In>) => Promise<Out>) & {
  readonly [SERVER_FN]: true;
  readonly meta: ServerFnMeta;
};

/** The `data` out of a call, whichever of the two shapes it arrived in. */
export function dataOf(options: unknown): unknown {
  if (options instanceof FormData) return options;
  if (options === undefined || options === null) return undefined;
  return (options as { data?: unknown }).data;
}

/**
 * The client half. The compiler emits this in a module compiled for the client,
 * with the id and nothing else — no handler body, no validator, no imports the
 * body needed.
 */
export function clientRpc<In, Out>(id: string): ServerFn<In, Out> {
  const call = async (options?: unknown): Promise<Out> => {
    const input = dataOf(options);
    // FormData goes as FormData. Routing it through the value codec would hand
    // the handler a plain OBJECT here and a real `FormData` on the no-JS path —
    // the same function seeing two input types depending on whether JS ran,
    // which is the divergence progressive enhancement exists to avoid. It also
    // keeps files, which no value codec in this class carries.
    const form = input instanceof FormData;
    const response = await fetch(RPC_PREFIX + encodeURIComponent(id) + DATA_SUFFIX, {
      method: "POST",
      // No content-type for the form case: the browser sets the multipart
      // boundary, and setting it by hand produces a body nothing can parse.
      headers: form ? undefined : { "content-type": "application/json" },
      // Otherwise seroval's JSON channel, so an argument carries a Date, a Map
      // or a cycle the same way a hydration seed does — and reconstructs
      // through `fromJSON`, which evaluates nothing.
      body: form ? input : JSON.stringify({ input: encodeWire(input) }),
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`server function ${id} failed: ${response.status}`);
    return decodeWire<Out>(await response.json());
  };
  return Object.assign(call, { [SERVER_FN]: true as const, meta: { id } });
}

/** Whether a value is a server function, by brand rather than by shape. */
export function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[SERVER_FN] === true
  );
}
