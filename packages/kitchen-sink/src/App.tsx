/**
 * Main App component with all demos
 */

import { For } from "@barqjs/core";
import { css } from "@barqjs/extra";
import { NavLink, Outlet, type RouteDefinition, Router, route, useLocation } from "@barqjs/extra";

import { AsyncDemo } from "./demos/AsyncDemo";
import { ComponentsDemo } from "./demos/ComponentsDemo";
import { CssDemo } from "./demos/CssDemo";
import { HooksDemo } from "./demos/HooksDemo";
import { JsxTypesDemo } from "./demos/JsxTypesDemo";
import { QueryDemo } from "./demos/QueryDemo";
import { RoutingDemo } from "./demos/RoutingDemo";
import { SignalsDemo } from "./demos/SignalsDemo";
import { StoreDemo } from "./demos/StoreDemo";

const sections = [
  { id: "signals", label: "Signals & State", component: SignalsDemo },
  { id: "components", label: "Components", component: ComponentsDemo },
  { id: "store", label: "Store", component: StoreDemo },
  { id: "async", label: "Async & Resources", component: AsyncDemo },
  { id: "css", label: "CSS-in-JS", component: CssDemo },
  { id: "hooks", label: "Utility Hooks", component: HooksDemo },
  { id: "query", label: "TanStack Query", component: QueryDemo },
  { id: "routing", label: "Routing", component: RoutingDemo },
  { id: "jsx-types", label: "JSX Types", component: JsxTypesDemo },
] as const;

// Build routes from sections
const routes: RouteDefinition[] = [
  route({
    path: "/",
    component: Layout,
    children: [
      // Default route redirects to signals
      route({ path: "/", component: SignalsDemo }),
      ...sections.map((section) =>
        route({
          path: `/${section.id}`,
          component: section.component,
        }),
      ),
    ] as RouteDefinition[],
  }),
];

// Layout with sidebar navigation
function Layout() {
  const location = useLocation();

  const currentSection = () => {
    const path = location().pathname;
    if (path === "/") return sections[0];
    const id = path.slice(1); // Remove leading /
    return sections.find((s) => s.id === id) || sections[0];
  };

  return (
    <div class={layoutStyle}>
      <nav class={sidebarStyle}>
        <div class={logoStyle}>Barq</div>
        <div class={subtitleStyle}>Kitchen Sink Demo</div>

        <For each={sections}>
          {(section) => (
            <NavLink href={`/${section.id}`} class={navItemStyle} activeClass={navItemActiveStyle}>
              {section.label}
            </NavLink>
          )}
        </For>
      </nav>

      <main class={mainStyle}>
        <header class={headerStyle}>
          <h1 class={titleStyle}>{() => currentSection()?.label}</h1>
        </header>

        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return <Router config={{ routes }} />;
}

// Styles
const layoutStyle = css`
  display: flex;
  min-height: 100vh;
`;

const sidebarStyle = css`
  width: 240px;
  background: #1e293b;
  padding: 20px;
  border-right: 1px solid #334155;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  overflow-y: auto;
`;

const logoStyle = css`
  font-size: 24px;
  font-weight: bold;
  color: #60a5fa;
  margin-bottom: 8px;
`;

const subtitleStyle = css`
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 24px;
`;

const navItemStyle = css`
  display: block;
  padding: 10px 12px;
  border-radius: 6px;
  color: #94a3b8;
  margin-bottom: 4px;
  transition: all 0.15s;
  text-decoration: none;

  &:hover {
    background: #334155;
    color: #e2e8f0;
  }
`;

const navItemActiveStyle = css`
  background: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
    color: white;
  }
`;

const mainStyle = css`
  flex: 1;
  margin-left: 240px;
  padding: 24px;
`;

const headerStyle = css`
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #334155;
`;

const titleStyle = css`
  font-size: 28px;
  font-weight: bold;
  color: #f8fafc;
`;
