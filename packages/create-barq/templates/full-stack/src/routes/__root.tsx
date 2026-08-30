/**
 * The root route: the document, and the layout every page renders inside.
 *
 * `__root.tsx` is the root by name, and it is the one route that may declare a
 * `shellComponent`. `<Outlet />` places the matched route.
 */

import type { Child } from "@barqjs/core";
import { HeadContent, NavLink, Outlet, Scripts, createRootRoute } from "@barqjs/router";

// The whole document, and only a root route may declare one. `<HeadContent />`
// renders every matched route's merged `head` plus the framework's own tags;
// `<Scripts />` renders the client entry. There is no order to get right.
const shellComponent = (props: { children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <HeadContent />
    </head>
    <body>
      <div id="app">{props.children}</div>
      <Scripts />
    </body>
  </html>
);

// Merged with every route below this one, which replaces the identities it
// names and inherits the rest.
const head = {
  meta: [
    { title: "barq" },
    { name: "description", content: "A barq application." },
  ],
};

function Layout() {
  return (
    <div>
      <nav>
        <NavLink to="/" activeClass="active">
          Home
        </NavLink>{" "}
        <NavLink to="/about" activeClass="active">
          About
        </NavLink>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({ shellComponent, head, component: Layout });
