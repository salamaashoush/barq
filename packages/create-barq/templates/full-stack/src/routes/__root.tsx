/**
 * The root route: the document, and the layout every page renders inside.
 *
 * `__root.tsx` is the root by name, and it is the one route that may declare a
 * `shellComponent`. `<Outlet />` places the matched route.
 */

import type { Child } from "@barqjs/core";
import { css, globalCss } from "@barqjs/css";
import { HeadContent, NavLink, Outlet, Scripts, createRootRoute } from "@barqjs/router";

// Compiled away. `css` returns a class name and the block becomes a rule in a
// stylesheet the build emits; nothing of the call survives into the bundle.
globalCss`
  body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.6 }
  a { color: #2563eb; text-decoration: none }
  a.active { font-weight: 600; text-decoration: underline }
`;

const layout = css`
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1rem;

  nav {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
`;

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
    <div class={layout}>
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
