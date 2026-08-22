/**
 * `/routing` — CLIENT-ONLY, and it has to be.
 *
 * `RoutingDemo` mounts a SECOND router on a `memoryHistory` inside this page.
 * `ssr = false` means the server renders this depth's `pending` fallback and
 * runs nothing, so the nested router is built once, in the browser, where its
 * history exists.
 *
 * The generator lifts the literal into the table; `resolveSsr` then makes every
 * descendant client-only too, which is the asymmetry `RouteDefinition.ssr`
 * documents — a parent may force `false` down, and a child may always declare it.
 */

export const ssr = false;

export { RoutingDemo as default } from "../demos/RoutingDemo";

export function Pending() {
  return <p style="color:#94a3b8">Loading the routing demo…</p>;
}
