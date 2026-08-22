/**
 * The layout every page renders inside.
 *
 * `.route` makes this the LAYOUT for the prefix, and the leading `_` makes it
 * PATHLESS — it wraps every route without contributing a segment. `children` is
 * a Block, so the matched route is constructed inside this scope, which is what
 * barq has instead of an `<Outlet />`.
 */

import { For } from "@barqjs/core";
import { NavLink, useLocation } from "@barqjs/router";

import { css, globalCss } from "../styles";

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

export default function Layout(props: { children: never }) {
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
        {props.children}
      </main>
    </div>
  );
}

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
