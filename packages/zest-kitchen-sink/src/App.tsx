/**
 * Main App component with all demos
 */

import { For, Match, Switch, useState } from "@barqjs/core";
import { clsx, css } from "@barqjs/extra";

import { AsyncDemo } from "./demos/AsyncDemo";
import { ComponentsDemo } from "./demos/ComponentsDemo";
import { CssDemo } from "./demos/CssDemo";
import { HooksDemo } from "./demos/HooksDemo";
import { JsxTypesDemo } from "./demos/JsxTypesDemo";
import { QueryDemo } from "./demos/QueryDemo";
import { RoutingDemo } from "./demos/RoutingDemo";
// Demo components
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

  &:hover {
    background: #334155;
    color: #e2e8f0;
    text-decoration: none;
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

export function App() {
  const [activeSection, setActiveSection] = useState<string>("signals");

  return (
    <div class={layoutStyle}>
      <nav class={sidebarStyle}>
        <div class={logoStyle}>Zest</div>
        <div class={subtitleStyle}>Kitchen Sink Demo</div>

        <For each={sections}>
          {(section) => (
            <a
              href={`#${section.id}`}
              class={clsx(navItemStyle, activeSection() === section.id && navItemActiveStyle)}
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                setActiveSection(section.id);
              }}
            >
              {section.label}
            </a>
          )}
        </For>
      </nav>

      <main class={mainStyle}>
        <header class={headerStyle}>
          <h1 class={titleStyle}>{() => sections.find((s) => s.id === activeSection())?.label}</h1>
        </header>

        <Switch fallback={<div>Select a section</div>}>
          <Match when={() => activeSection() === "signals"}>{() => <SignalsDemo />}</Match>
          <Match when={() => activeSection() === "components"}>{() => <ComponentsDemo />}</Match>
          <Match when={() => activeSection() === "store"}>{() => <StoreDemo />}</Match>
          <Match when={() => activeSection() === "async"}>{() => <AsyncDemo />}</Match>
          <Match when={() => activeSection() === "css"}>{() => <CssDemo />}</Match>
          <Match when={() => activeSection() === "hooks"}>{() => <HooksDemo />}</Match>
          <Match when={() => activeSection() === "query"}>{() => <QueryDemo />}</Match>
          <Match when={() => activeSection() === "routing"}>{() => <RoutingDemo />}</Match>
          <Match when={() => activeSection() === "jsx-types"}>{() => <JsxTypesDemo />}</Match>
        </Switch>
      </main>
    </div>
  );
}
