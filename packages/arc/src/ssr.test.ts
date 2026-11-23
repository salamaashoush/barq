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

  test("ThemeToggle draws the choice from the request's cookie", async () => {
    const jsx = "<ArcProvider toaster={false}><ThemeToggle /></ArcProvider>";
    const dark = await serverProcess(
      routed(["ArcProvider", "ThemeToggle"], jsx, "/", "theme=dark"),
    );
    expect(dark.errors).toBe("");
    expect(dark.html).toMatch(/data-choice="dark"/);
    const unset = await serverProcess(routed(["ArcProvider", "ThemeToggle"], jsx, "/"));
    expect(unset.html).toMatch(/data-choice="system"/);
  });

  test("CopyButton, EmptyState and StatCard render with no DOM", async () => {
    const jsx = `
      <main>
        <CopyButton value="tok_example" label="Copy the token" />
        <EmptyState heading="No invoices yet" description="None sent." />
        <StatCard label="Requests" value="128" trend={[1, 3, 2]} />
      </main>
    `;
    const { code, html, errors } = await serverProcess(
      routed(["CopyButton", "EmptyState", "StatCard"], jsx, "/"),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('aria-label="Copy the token"');
    expect(html).toContain('data-slot="copy-button-status"');
    expect(html).toContain("No invoices yet");
    expect(html).toContain('aria-label="Trend over 3 values, from 1 to 2; lowest 1, highest 3"');
  });
});

describe("the data layer on the server", () => {
  test("DataTable writes its grid, its headers and its rows", async () => {
    const jsx = `
      <DataTable
        label="Invoices"
        getRowId={(invoice) => invoice.id}
        data={[
          { id: "a", number: "INV-001", total: 120 },
          { id: "b", number: "INV-002", total: 80 },
        ]}
        columns={[
          { accessorKey: "number", header: "Number" },
          { accessorKey: "total", header: "Total", align: "end", hideBelow: "md" },
        ]}
        selectionMode="multiple"
        defaultSorting={[{ id: "number", desc: true }]}
      />
    `;
    const { code, html, errors } = await serverProcess(routed(["DataTable"], jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Invoices"');
    expect(html).toContain('aria-sort="descending"');
    expect(html.indexOf("INV-002")).toBeLessThan(html.indexOf("INV-001"));
    expect(html).toContain('aria-label="Select all"');
    // Narrow until the browser says otherwise: the server answers every media query false.
    expect(html).not.toContain(">Total<");
  });
});
