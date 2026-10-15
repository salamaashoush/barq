/**
 * `/async` — CLIENT-ONLY, because every demo on it fetches one of the demo
 * endpoints by a relative URL.
 *
 * A server render has no origin to resolve `/api/users` against, and a
 * prerender has no server answering it at all, so the fetch rejects there and
 * the rejection is the page's. `ssr: false` leaves the async memos to the
 * browser, where the endpoints exist: the server emits this depth's
 * `pendingComponent` and the browser builds the rest.
 */

import { createFileRoute } from "@barqjs/router";

import { AsyncDemo } from "../demos/AsyncDemo";

export const Route = createFileRoute("/async")({
  ssr: false,
  component: AsyncDemo,
  pendingComponent: () => <p style="color:#94a3b8">Loading the async demo…</p>,
});
