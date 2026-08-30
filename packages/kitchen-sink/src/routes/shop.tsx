/**
 * `/shop` — a layout, so a mistyped path under it has somewhere to land.
 *
 * With `notFoundMode: "fuzzy"` (the default) `/shop/nope` renders THIS layout
 * and the `notFoundComponent` below it, rather than throwing the page away for
 * one bad segment.
 */

import { Outlet, createFileRoute } from "@barqjs/router";

function Shop() {
  return (
    <section>
      <h2 id="shop-layout">Shop</h2>
      <Outlet />
    </section>
  );
}

export const Route = createFileRoute("/shop")({
  component: Shop,
  notFoundComponent: () => <p id="shop-404">no such aisle</p>,
});
