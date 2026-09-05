/**
 * The document, and the chrome every page renders inside.
 *
 * `__root.tsx` is the root by name and the only route that may declare a
 * `shellComponent`, because the shell renders `<html>`.
 */

import { type Child } from "@barqjs/core";
import { createRootRoute, HeadContent, retainSearchParams, Scripts } from "@barqjs/router";

/**
 * The three stylesheets every page needs, imported from the ROOT so they are in
 * every page's graph and land in the head before anything paints.
 *
 * The reset and the scale are the package's own and are not pulled in by
 * importing a component: a page that renders few of them got neither, and its
 * `--default-font-family` resolved to nothing — the front page came out in
 * Times New Roman while the components page, which imports sixty, was in Geist.
 * A reset is global by definition, so the root is where it belongs.
 */
import "@barqjs/ui/theme/reset.ts";
import "@barqjs/ui/theme/base.ts";
import "../theme.ts";
import { SiteLayout } from "../site.tsx";

/**
 * The document.
 *
 * `<HeadContent />` renders every matched route's merged `head` plus the
 * framework's own tags, and `<Scripts />` the client entry. Neither has an
 * order to get right.
 *
 * `dark` is NOT decided here. The shell renders outside the router's own
 * context — it is the thing the router renders INTO — so `useLocation` has
 * nothing to answer with, and the theme's dark rule is a plain `.dark` class
 * that matches any element. `SiteLayout` carries it, one element in.
 */
function Shell(props: { children: Child }) {
  return (
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
}

const head = {
  meta: [
    { title: "@barqjs/ui — components you can own" },
    {
      name: "description",
      content:
        "shadcn/ui's components, ported to barq. Composable, accessible components with thoughtful defaults, compiled away.",
    },
  ],
};

/**
 * `retainSearchParams(true)` is what keeps the design across a navigation.
 *
 * A `<Link to="/blocks">` mentions no search, and without the middleware the
 * router builds a URL with none — so every page would open in the default
 * theme and the configuration you were looking at would be gone.
 */
export const Route = createRootRoute({
  shellComponent: Shell,
  head,
  component: SiteLayout,
  search: { middlewares: [retainSearchParams(true)] },
});
