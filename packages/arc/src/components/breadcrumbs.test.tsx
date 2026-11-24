import { describe, expect, test } from "bun:test";
import { flush, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { type AnyRouteDefinition, Outlet, type RouteMatch } from "@barqjs/router";
import { ariaViolations, screen, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { layout } from "../style/index.ts";
import { Breadcrumbs, type Crumb, breadcrumbsStyles } from "./breadcrumbs.tsx";

function Layout() {
  return (
    <div>
      <Breadcrumbs />
      <Outlet />
    </div>
  );
}

const tree = [
  {
    path: "/",
    component: Layout,
    staticData: { crumb: "Home" },
    children: [
      { path: "", component: () => <p>home</p> },
      {
        path: "projects",
        component: Outlet,
        staticData: { crumb: "Projects" },
        children: [
          { path: "", component: () => <p>projects</p> },
          {
            path: "$id",
            component: Outlet,
            staticData: { crumb: (match: RouteMatch) => `Project ${match.params.id ?? ""}` },
            children: [
              { path: "", component: () => <p>project</p> },
              {
                path: "settings",
                component: () => <p>settings</p>,
                staticData: { crumb: "Settings" },
              },
            ],
          },
        ],
      },
    ],
  },
] as unknown as AnyRouteDefinition[];

function trail(): string[] {
  return [
    ...document.querySelectorAll(
      '[data-slot="breadcrumb-item"]:not([data-slot="breadcrumbs-more"])',
    ),
  ]
    .map((node) => node.textContent ?? "")
    .filter((text) => text !== "");
}

describe("Breadcrumbs", () => {
  test("takes its parent's width, being a query container", () => {
    const root = new Set(breadcrumbsStyles().root.split(" "));
    for (const part of [...layout.container.split(" "), ...layout.fill.split(" ")]) {
      expect(root.has(part)).toBe(true);
    }
  });

  test("reads the trail from the matched routes, each step a link but the page itself", async () => {
    const view = await renderRoute({ routeTree: tree, path: "/projects/acme/settings" });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.getAttribute("data-slot")).toBe("breadcrumbs");
    expect(trail()).toEqual(["Home", "Projects", "Project acme", "Settings"]);
    expect(screen.getByRole("link", { name: "Projects" }).getAttribute("href")).toBe("/projects");
    expect(screen.getByRole("link", { name: "Project acme" }).getAttribute("href")).toBe(
      "/projects/acme",
    );
    const page = nav.querySelector('[aria-current="page"]');
    expect(page?.textContent).toBe("Settings");
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });

  test("follows the location, and a click navigates through the router", async () => {
    const view = await renderRoute({ routeTree: tree, path: "/projects/acme/settings" });
    await user.click(screen.getByRole("link", { name: "Projects" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/projects"));
    flush();
    expect(trail()).toEqual(["Home", "Projects"]);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("Projects");
    view.unmount();
  });

  test("a layout and its index route at one path make one step", async () => {
    const view = await renderRoute({ routeTree: tree, path: "/projects" });
    expect(trail()).toEqual(["Home", "Projects"]);
    view.unmount();
  });

  test("takes its steps as data, and a step without a target is text", async () => {
    const items: Crumb[] = [
      { label: "Acme", to: "/" },
      { label: "Billing" },
      { label: "Invoices", to: "/projects" },
      { label: "INV-001" },
    ];
    const view = await renderRoute({
      routeTree: [{ path: "/", component: () => <Breadcrumbs items={items} /> }] as never,
    });
    expect(trail()).toEqual(["Acme", "Billing", "Invoices", "INV-001"]);
    expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
    expect(screen.getByText("Billing").getAttribute("data-slot")).toBe("breadcrumbs-text");
    view.unmount();
  });

  test("marks the steps a narrow trail folds, behind a button that shows them", async () => {
    const view = await renderRoute({ routeTree: tree, path: "/projects/acme/settings" });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const middle = [...nav.querySelectorAll('[data-slot="breadcrumb-item"][data-middle]')].map(
      (node) => node.textContent,
    );
    expect(middle).toEqual(["Projects", "Project acme"]);

    const expand = screen.getByRole("button", { name: "Show the full path" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expand.focus();
    await user.keyboard("{Enter}");
    expect(expand.getAttribute("aria-expanded")).toBe("true");
    expect(nav.hasAttribute("data-expanded")).toBe(true);
    await user.click(expand);
    expect(nav.hasAttribute("data-expanded")).toBe(false);
    view.unmount();
  });

  test("two steps have nothing to fold", async () => {
    const view = await renderRoute({ routeTree: tree, path: "/projects" });
    expect(screen.queryByRole("button", { name: "Show the full path" })).toBeNull();
    view.unmount();
  });

  test("keeps the document order under a right-to-left locale", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const view = await renderRoute({
      routeTree: [
        {
          path: "/",
          component: () => (
            <Rtl>
              <Breadcrumbs items={[{ label: "الرئيسية", to: "/" }, { label: "الفواتير" }]} />
            </Rtl>
          ),
        },
      ] as never,
    });
    expect(trail()).toEqual(["الرئيسية", "الفواتير"]);
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]');
    expect(separator?.getAttribute("aria-hidden")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });
});
