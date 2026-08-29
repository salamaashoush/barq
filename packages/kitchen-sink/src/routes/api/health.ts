/**
 * `/api/health` — an API route, which in barq is an ordinary route file that
 * declares handlers instead of a component.
 *
 * There is no second route system and no second directory: this file is scanned,
 * named and nested by the same generator as every page, and it appears in
 * `routeTree.gen.ts` beside them. That is TanStack's arrangement
 * (`examples/react/start-basic/src/routes/api/users.ts`).
 *
 * NOTHING HERE SHIPS TO THE BROWSER. The compiler deletes the `server` option
 * from the client build, so `SERVER_ONLY` below — and any database import a real
 * handler would need — is absent from every client chunk. `packages/router`'s
 * `vite.test.ts` gates exactly that against a real build, and the gate goes red
 * when the strip is turned off.
 */

import { createFileRoute } from "@barqjs/router";
import { getRequestHeader, setResponseHeader } from "@barqjs/start";

/** Proof, for the bundle gate: this string must appear in no client chunk. */
const SERVER_ONLY = "barq-server-only-marker";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        // The ambient response works here exactly as it does in a server
        // function or a loader — one request context, four callers.
        setResponseHeader("cache-control", "no-store");
        return Response.json({
          ok: true,
          marker: SERVER_ONLY,
          agent: getRequestHeader("user-agent") ?? "unknown",
        });
      },
      /**
       * A second method on the same route, which is the thing a page cannot do:
       * `createPageHandler` answers 405 to anything but GET and HEAD, and the
       * handler dispatch runs BEFORE that gate for this reason.
       */
      POST: async ({ request }) => {
        const body = (await request.json()) as { echo?: unknown };
        return Response.json({ echoed: body.echo ?? null }, { status: 201 });
      },
    },
  },
});
