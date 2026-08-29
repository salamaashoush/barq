/**
 * The root route: the document, and the layout every page renders inside.
 *
 * `__root.tsx` is the root by name, and it is the one route that may declare a
 * `shellComponent`. `<Outlet />` places the matched route, constructed inside
 * this scope — so the providers here still wrap what it renders.
 */

import { type Child, For } from "@barqjs/core";
// The ISOMORPHIC entry, not `/server`: this module is the ROOT ROUTE and ships
// to the browser like every other route module. `@barqjs/router/server` reaches
// `node:async_hooks`, and importing it here made Vite externalise that for the
// browser, throw inside the root route, and render an empty page.
import { HeadContent, NavLink, Outlet, Scripts, createRootRoute, useLocation } from "@barqjs/router";

import { collectStyles, css, globalCss } from "../styles";

/**
 * The DOCUMENT, and only a root route may declare one.
 *
 * `<HeadContent />` renders every route's merged `head` plus the framework's own
 * tags — the matched chunks' modulepreloads, the `beforeLoad` handoff, the
 * client CSS. `<Scripts />` renders the body scripts and the client entry. There
 * is no order to get right and no `<title>` here: the site title is this route's
 * own `head`, which merges with every route below it.
 */
const shellComponent = (props: { children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style id="_goober">{collectStyles()}</style>
      <HeadContent />
    </head>
    <body>
      <div id="app">{props.children}</div>
      <Scripts />
    </body>
  </html>
);

const head = {
  meta: [
    { title: "Barq Kitchen Sink" },
    { name: "description", content: "Every barq feature, in one application." },
    { property: "og:site_name", content: "Barq" },
    { property: "og:type", content: "website" },
  ],
  links: [{ rel: "canonical", href: "https://barq.example/" }],
};

export const sections = [
  { id: "signals", label: "Signals & State" },
  { id: "components", label: "Components" },
  { id: "store", label: "Store" },
  { id: "async", label: "Async & Resources" },
  { id: "css", label: "CSS-in-JS" },
  { id: "hooks", label: "Utility Hooks" },
  { id: "query", label: "TanStack Query" },
  { id: "routing", label: "Routing" },
  { id: "jsx-types", label: "JSX Types" },
] as const;

globalCss`
  ::view-transition-old(root),
  ::view-transition-new(root) { animation-duration: 0.3s; animation-timing-function: ease-in-out; }
  ::view-transition-old(root) { animation-name: vt-slide-to-left; }
  ::view-transition-new(root) { animation-name: vt-slide-from-right; }
  @keyframes vt-slide-to-left {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(-100px); }
  }
  @keyframes vt-slide-from-right {
    from { opacity: 0; transform: translateX(100px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

function Layout() {
  const location = useLocation();
  const title = () => {
    const path = location().pathname;
    if (path === "/") return "Signals & State";
    const id = path.slice(1);
    const section = sections.find((entry) => entry.id === id);
    return section?.label ?? id.charAt(0).toUpperCase() + id.slice(1);
  };

  return (
    <div class={layoutStyle}>
      <nav class={sidebarStyle}>
        <div class={logoStyle}>Barq</div>
        <div class={subtitleStyle}>Kitchen Sink Demo</div>
        <For each={sections}>
          {(section: (typeof sections)[number]) => (
            <NavLink to={`/${section.id}`} class={navItemStyle} activeClass={navItemActiveStyle}>
              {section.label}
            </NavLink>
          )}
        </For>
        {/* Not a demo section: it is here so the PRERENDER CRAWL has a link to
            follow out of `/`. `/about` declares `prerender = true`; the crawl
            renders every page it reaches and keeps only the ones that do. */}
        <NavLink to="/about" class={navItemStyle} activeClass={navItemActiveStyle}>
          About
        </NavLink>
      </nav>
      <main class={mainStyle}>
        <header class={headerStyle}>
          <h1 class={titleStyle}>{() => title()}</h1>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({ shellComponent, head, component: Layout });

const layoutStyle = css`
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
`;

const sidebarStyle = css`
  background: #1e293b;
  padding: 24px 0;
  border-right: 1px solid #334155;
`;

const logoStyle = css`
  font-size: 24px;
  font-weight: 700;
  padding: 0 24px 4px;
  color: #60a5fa;
`;

const subtitleStyle = css`
  font-size: 12px;
  padding: 0 24px 24px;
  color: #94a3b8;
`;

const navItemStyle = css`
  display: block;
  padding: 10px 24px;
  color: #cbd5e1;
  font-size: 14px;
  &:hover { background: #334155; text-decoration: none; }
`;

const navItemActiveStyle = css`
  background: #334155;
  color: #60a5fa;
  border-left: 3px solid #60a5fa;
`;

const mainStyle = css`
  padding: 32px 40px;
  max-width: 1100px;
`;

const headerStyle = css`
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #334155;
`;

const titleStyle = css`
  font-size: 28px;
  font-weight: 700;
`;
