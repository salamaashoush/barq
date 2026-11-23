/**
 * What a server writes for arc's components, in a process with no DOM.
 */

import { describe, expect, test } from "bun:test";

import { serverProcess } from "./ssr-harness.ts";

/**
 * A page handler over a root route rendering `jsx`, asked for `path` with
 * `cookie`. `names` are what `jsx` takes from arc.
 */
function routed(names: string[], jsx: string, path: string, cookie = ""): string {
  return `
    import { Outlet } from "@barqjs/router";
    import { createPageHandler, renderRoutes } from "@barqjs/router/server";
    import { ${names.join(", ")} } from "<arc>";

    const routeTree = [
      {
        path: "/",
        component: () => (${jsx}),
        staticData: { crumb: "Acme" },
        children: [
          { path: "", component: () => <p>overview</p> },
          { path: "projects", component: () => <p>projects</p>, staticData: { crumb: "Projects" } },
        ],
      },
    ];

    export async function page() {
      const handler = createPageHandler({
        routeTree,
        app: (state) => renderRoutes(state),
        stream: false,
        document: (parts) => parts.body,
      });
      const response = await handler(
        new Request("http://localhost${path}", { headers: { cookie: ${JSON.stringify(cookie)} } }),
      );
      return await response.text();
    }
  `;
}

const SHELL = `
  <AppShell
    navigation={[
      { items: [{ label: "Overview", to: "/", exact: true }] },
      { label: "Workspace", items: [{ label: "Projects", to: "/projects", badge: "3" }] },
    ]}
    header={<span>Acme</span>}
  >
    <Outlet />
  </AppShell>
`;

describe("on the server", () => {
  test("AppShell writes its navigation, the current item and the trail", async () => {
    const { code, html, errors } = await serverProcess(routed(["AppShell"], SHELL, "/projects"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="app-shell"');
    const current = /<a [^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? "";
    expect(current).toContain('href="/projects"');
    expect(current).toContain('data-slot="sidebar-menu-button"');
    expect(html).toContain('data-slot="breadcrumbs"');
    expect(html).toContain("projects</p>");
    expect(html).toContain('data-state="expanded"');
  });

  test("AppShell opens as the request's cookie says it was left", async () => {
    const { code, html } = await serverProcess(
      routed(["AppShell"], SHELL, "/", "sidebar_state=false"),
    );
    expect(code).toBe(0);
    expect(html).toContain('data-state="collapsed"');
    expect(html).toContain('data-collapsible="icon"');
  });
});
