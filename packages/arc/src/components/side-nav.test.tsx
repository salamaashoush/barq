import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Outlet } from "@barqjs/router";
import { ariaViolations, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { target } from "../style/index.ts";
import { hydrates, wears } from "../test-arc.ts";
import type { NavGroup } from "./app-shell.tsx";
import { SideNav, type SideNavProps, sideNavStyles } from "./side-nav.tsx";

const NAVIGATION: NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "Profile", to: "/settings/profile", icon: Settings },
      { label: "Security", to: "/settings/security" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Members", to: "/settings/members", badge: "4" },
      { label: "Billing", items: [{ label: "Invoices", to: "/settings/invoices" }] },
    ],
  },
];

function tree(extra: Partial<SideNavProps> = {}) {
  return [
    {
      path: "/settings",
      component: () => (
        <div>
          <SideNav aria-label="Settings" navigation={NAVIGATION} {...extra} />
          <Outlet />
        </div>
      ),
      children: [
        { path: "profile", component: () => <h1>Profile</h1> },
        { path: "security", component: () => <h1>Security</h1> },
        { path: "members", component: () => <h1>Members</h1> },
        { path: "invoices", component: () => <h1>Invoices</h1> },
      ],
    },
  ];
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("SideNav", () => {
  test("a named landmark of grouped router links, the current one marked", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/settings/members" });
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((one) => one.textContent),
    ).toEqual(["Profile", "Security", "Members4", "Invoices"]);
    const members = within(nav).getByRole("link", { name: "Members" });
    expect(members.getAttribute("aria-current")).toBe("page");
    expect(
      document.getElementById(members.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("4");
    expect(screen.getByRole("list", { name: "Workspace" })).toBeDefined();
    expect(slot("side-nav-heading").textContent).toBe("Billing");
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });

  test("a press follows the link and moves the mark", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/settings/profile" });
    await user.click(screen.getByRole("link", { name: "Invoices" }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/settings/invoices"));
    flush();
    expect(screen.getByRole("link", { name: "Invoices" }).getAttribute("aria-current")).toBe(
      "page",
    );
    view.unmount();
  });

  test("links to one page by its search mark only the one whose search holds", async () => {
    const sections: NavGroup[] = [
      {
        items: [
          { label: "Profile", to: "/settings", search: { section: "profile" } },
          { label: "Security", to: "/settings", search: { section: "security" } },
        ],
      },
    ];
    const view = await renderRoute({
      routeTree: [
        {
          path: "/settings",
          component: () => <SideNav aria-label="Settings" navigation={sections} />,
        },
      ],
      path: "/settings?section=security",
    });
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent);
    expect(current).toEqual(["Security"]);
    view.unmount();
  });

  test("Tab walks the links, each with a finger's room", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/settings/profile" });
    user.tab();
    expect(document.activeElement?.textContent).toBe("Profile");
    user.tab();
    expect(document.activeElement?.textContent).toBe("Security");
    expect(wears(slot("side-nav-link"), target.size)).toBe(true);
    view.unmount();
  });

  test("runs as a row that scrolls across a narrow container, unless told not to", async () => {
    const view = await renderRoute({
      routeTree: tree({ collapse: "never" }),
      path: "/settings/profile",
    });
    expect(wears(slot("side-nav"), sideNavStyles({ collapse: "never" }).root)).toBe(true);
    expect(collectCss()).toMatch(/@container \(width < 24rem\)\{[^}]*\{flex-direction:row\}/);
    expect(collectCss()).toContain("padding-inline-start:calc(var(--spacing) * 6)");
    view.unmount();
  });

  test("takes a class per part", async () => {
    const view = await renderRoute({
      routeTree: tree({
        class: "mine",
        classes: {
          root: "r",
          group: "g",
          groupLabel: "gl",
          list: "l",
          sublist: "sl",
          item: "i",
          link: "k",
          label: "b",
          badge: "d",
        },
      }),
      path: "/settings/profile",
    });
    const pairs = [
      ["side-nav", "r"],
      ["side-nav-group", "g"],
      ["side-nav-group-label", "gl"],
      ["side-nav-list", "l"],
      ["side-nav-sublist", "sl"],
      ["side-nav-item", "i"],
      ["side-nav-link", "k"],
      ["side-nav-label", "b"],
      ["side-nav-badge", "d"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("side-nav").classList.contains("mine")).toBe(true);
    view.unmount();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SideNav } from "<arc>";
      export function Page() {
        return <SideNav aria-label="Docs" navigation={[{ label: "Guide", items: [{ label: "Billing" }] }]} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="side-nav-heading"]')?.textContent).toBe(
      "Billing",
    );
    result.unmount();
  });
});
