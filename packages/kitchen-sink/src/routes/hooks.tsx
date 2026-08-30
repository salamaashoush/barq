/**
 * `/hooks` — CLIENT-ONLY, because one of the hooks it demonstrates cannot run
 * on a server.
 *
 * The demo drives `@barqjs/primitives` against live browser state — an
 * `IntersectionObserver`, a `MediaQueryList`, `localStorage` — and while every
 * one of those reads a neutral value on the server, the point of the page is
 * what they do once there is a browser to read.
 *
 * `ssr: false` is the front door's answer to a route that cannot be rendered on
 * a server: the server emits this depth's `pendingComponent` and the browser
 * builds the rest.
 */

import { createFileRoute } from "@barqjs/router";

import { HooksDemo } from "../demos/HooksDemo";

export const Route = createFileRoute("/hooks")({
  ssr: false,
  component: HooksDemo,
  pendingComponent: () => <p style="color:#94a3b8">Loading the hooks demo…</p>,
});
