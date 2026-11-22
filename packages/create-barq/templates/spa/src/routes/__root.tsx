/**
 * The root route: the layout every page renders inside.
 *
 * NO `shellComponent` and no `<HeadContent />`: `index.html` is the document
 * here, and it is served as a file. Those belong to an application whose server
 * renders the page.
 */

import { NavLink, Outlet, createRootRoute } from "@barqjs/router";

import { layout } from "../styles.ts";

function Layout() {
  return (
    <div class={layout}>
      <nav>
        <NavLink to="/" activeClass="active" activeOptions={{ exact: true }}>
          Home
        </NavLink>
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

export const Route = createRootRoute({ component: Layout });
