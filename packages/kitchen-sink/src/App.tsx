/**
 * Main App component with all demos
 */

import { For, Show } from "@barqjs/core";
import {
  css,
  globalCss,
} from "./styles";
import {
  NavLink,
  type NavigationGuard,
  type RouteDefinition,
  Router,
  route,
  setRouterDebugMode,
  useIsLoading,
  useLocation,
} from "@barqjs/extra";

// Enable router debug mode
setRouterDebugMode(true);

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

// Navigation guard - logs all navigations
const logGuard: NavigationGuard = (ctx) => {
  console.log(`[Router] Navigation: ${ctx.from.pathname} → ${ctx.to.pathname}`);
  return true;
};

// Test loader with delay to demonstrate loading bar
// Use Date.now() to prevent caching
const testLoader = async () => {
  console.log("[testLoader] Starting load...");
  await new Promise((r) => setTimeout(r, 800));
  console.log("[testLoader] Load complete");
  return { loaded: true, timestamp: Date.now() };
};

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
          // Add loader to Store and Query routes to demo loading bar
          loader: section.id === "store" || section.id === "query" ? testLoader : undefined,
        }),
      ),
    ] as RouteDefinition[],
  }),
];

// View transition styles
globalCss`
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0.3s;
    animation-timing-function: ease-in-out;
  }

  ::view-transition-old(root) {
    animation-name: vt-slide-to-left;
  }

  ::view-transition-new(root) {
    animation-name: vt-slide-from-right;
  }

  @keyframes vt-slide-to-left {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(-100px);
    }
  }

  @keyframes vt-slide-from-right {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;

// Global Loading Indicator
function GlobalLoadingIndicator() {
  const isLoading = useIsLoading();

  return (
    <Show when={isLoading()}>
      <div class={globalLoadingStyle}>
        <div class={loadingBarStyle} />
      </div>
    </Show>
  );
}

/**
 * C2: a component handed to the router through a route table is called with a
 * scope by another module, and nothing module-local proves that — so it is
 * exported, which is the evidence C2 accepts. Every route component below is
 * either exported here or imported from its own demo module.
 *
 * `props.children` is the next matched route, as a Block taking a scope, so it
 * is constructed inside this layout. That is what replaced `<Outlet />`.
 */
export function Layout(props: { children: unknown }) {
  const location = useLocation();

  const currentSection = () => {
    const path = location().pathname;
    if (path === "/") return sections[0];
    const id = path.slice(1); // Remove leading /
    return sections.find((s) => s.id === id) || sections[0];
  };

  return (
    <div class={layoutStyle}>
      <GlobalLoadingIndicator />
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

        {props.children}
      </main>
    </div>
  );
}

export function App() {
  return (
    <Router
      config={{
        routes,
        // Disable loader caching to demo loading bar
        cache: { ttl: 0 },
        // View transitions for smooth page changes
        viewTransitions: {
          enabled: true,
          onTransitionStart: () => console.log("[Router] View transition starting"),
          onTransitionEnd: () => console.log("[Router] View transition complete"),
        },
        // Navigation guards
        beforeEach: [logGuard],
        afterEach: [(ctx) => console.log(`[Router] Navigation complete: ${ctx.to.pathname}`)],
        // Scroll restoration
        scrollRestoration: {
          enabled: true,
          behavior: "smooth",
        },
      }}
    />
  );
}

// Loading indicator styles
const globalLoadingStyle = css`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(59, 130, 246, 0.2);
  z-index: 9999;
`;

const loadingBarStyle = css`
  height: 100%;
  background: #3b82f6;
  animation: loading 1s ease-in-out infinite;

  @keyframes loading {
    0% { width: 0%; margin-left: 0; }
    50% { width: 50%; margin-left: 25%; }
    100% { width: 0%; margin-left: 100%; }
  }
`;

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
