/**
 * `/control` — what a server function's `throw redirect()` and `throw
 * notFound()` do on each of the two paths.
 *
 * BOTH PATHS ARE EXERCISED HERE ON PURPOSE. The loader runs on the SERVER for
 * the first request, where the server function is an in-process call and the
 * throw is a real instance; the buttons run on the CLIENT, where the same throw
 * has crossed the wire and been rebuilt by `@barqjs/start/client` as a
 * different class carrying the same brand. Those are two genuinely different
 * code paths and only one of them was ever the hard one.
 *
 * `ssr: false` is deliberately NOT set: the point is that the loader's
 * `notFound()` reaches the server render and the page comes back with a 404
 * status and the not-found markup already in the HTML.
 */

import {
  createFileRoute,
  isNotFound,
  isRedirect,
  useLocation,
  useNavigate,
  useServerFn,
} from "@barqjs/router";

import { gatedAction, loadRow } from "../data/control.ts";

interface Row {
  readonly title: string;
}

function Control() {
  const row = Route.useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * The redirect, THROUGH THE HOOK. `useServerFn` catches it and hands `.to` to
   * the router, which is a soft navigation: no document load, no second render
   * of the shell, and the target's loader starts from the cache this page
   * already has.
   */
  const gated = useServerFn(gatedAction);

  const runGated = async (): Promise<void> => {
    await gated({ data: "button" });
    document.getElementById("outcome")!.textContent = `redirect -> ${location().pathname}`;
  };

  /**
   * The same redirect, BY HAND, which is what the hook is doing. `isRedirect`
   * accepts it even though it is not an instance of the router's `Redirect` —
   * the brand is what both sides agree on — and both spellings are here because
   * an application that wants to do something else with the redirect first
   * writes this one.
   */
  const runGatedByHand = async (): Promise<void> => {
    try {
      await gatedAction({ data: "by-hand" });
    } catch (error) {
      if (isRedirect(error)) {
        document.getElementById("outcome")!.textContent = `redirect -> ${error.to}`;
        await navigate(error.to);
        return;
      }
      document.getElementById("outcome")!.textContent = `unexpected: ${String(error)}`;
    }
  };

  const runMissing = async (): Promise<void> => {
    try {
      await loadRow({ data: "404" });
      document.getElementById("outcome")!.textContent = "unexpected: resolved";
    } catch (error) {
      document.getElementById("outcome")!.textContent = isNotFound(error)
        ? `notFound -> ${(error as Error).message}`
        : `unexpected: ${String(error)}`;
    }
  };

  return (
    <section>
      <h2>Control-flow throws</h2>
      <p>
        A server function may answer with <code>redirect()</code> or <code>notFound()</code>. The
        loader below already used one on the server; the buttons use them from the browser, where
        the throw has crossed the wire.
      </p>
      <p id="loaded">loaded: {() => row()?.title ?? "—"}</p>
      <button type="button" id="gated" onClick={runGated}>
        server fn that redirects
      </button>
      <button type="button" id="gated-by-hand" onClick={runGatedByHand}>
        the same redirect, by hand
      </button>
      <button type="button" id="missing" onClick={runMissing}>
        server fn that 404s
      </button>
      <p id="outcome">—</p>
    </section>
  );
}

export const Route = createFileRoute<Row>("/control")({
  // `?row=` so the SSR half of the same throw is reachable from a URL: with
  // `?row=404` the server function's `notFound()` happens during the server
  // render, and the page must come back 404 with the not-found markup already
  // in the HTML rather than 200 with a hole in it.
  loader: ({ search }): Promise<Row> => loadRow({ data: search.get("row") ?? "1" }),
  component: Control,
  // Written INLINE, which is the shape a route file wants and the one that used
  // to be silently miscompiled: an arrow in a plain object literal kept the
  // `(props)` signature while the router called it `(scope, props)`.
  notFoundComponent: ({ error }) => <p id="not-found">not found: {() => error().message}</p>,
});
