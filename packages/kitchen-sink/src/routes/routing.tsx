/**
 * `/routing` — CLIENT-ONLY, and it has to be.
 *
 * `RoutingDemo` mounts a SECOND router on a `memoryHistory` inside this page.
 * `ssr: false` means the server renders this depth's `pendingComponent` and
 * runs nothing, so the nested router is built once, in the browser, where its
 * history exists.
 *
 * The generator lifts the literal into the table; `resolveSsr` then makes every
 * descendant client-only too, which is the asymmetry `RouteDefinition.ssr`
 * documents — a parent may force `false` down, and a child may always declare it.
 */

import { createFileRoute } from "@barqjs/router";

import { RoutingDemo } from "../demos/RoutingDemo";

export const Route = createFileRoute("/routing")({
  ssr: false,
  component: RoutingDemo,
  pendingComponent: () => <p style="color:#94a3b8">Loading the routing demo…</p>,
});
