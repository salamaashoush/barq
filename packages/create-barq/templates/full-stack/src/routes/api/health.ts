/**
 * `/api/health` — an API route, which is an ordinary route file that declares
 * handlers instead of a component.
 *
 * There is no second route system and no second directory: this file is scanned
 * and nested by the same generator as every page. The compiler strips `server`
 * from the client build, so nothing here ships to the browser.
 */

import { createFileRoute } from "@barqjs/router";
import { setResponseHeader } from "@barqjs/start";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader("cache-control", "no-store");
        return Response.json({ ok: true });
      },
    },
  },
});
