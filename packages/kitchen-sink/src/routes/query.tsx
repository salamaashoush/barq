/**
 * `/query` — `"data-only"`.
 *
 * The loader runs on the server and its value is SEEDED, so the client's first
 * read consumes it rather than refetching; the component is not rendered into
 * the HTML. What goes on the wire is this depth's `pendingComponent`, which the
 * client replaces with real markup it builds itself.
 */

import { createFileRoute } from "@barqjs/router";

import { QueryDemo } from "../demos/QueryDemo";

export const Route = createFileRoute("/query")({
  ssr: "data-only",
  loader: async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { renderedOn: typeof document === "undefined" ? "server" : "client" };
  },
  component: QueryDemo,
  pendingComponent: () => <p style="color:#94a3b8">Loading query demo…</p>,
});
