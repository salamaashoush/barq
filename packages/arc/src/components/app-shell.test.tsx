import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { Folder } from "@barqjs/lucide/icons/folder";
import { House } from "@barqjs/lucide/icons/house";
import { Settings } from "@barqjs/lucide/icons/settings";
import { type AnyRouteDefinition, Outlet } from "@barqjs/router";
import { ariaViolations, cleanup, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { AppShell, type AppShellProps, type NavGroup } from "./app-shell.tsx";

const NAVIGATION: NavGroup[] = [
  { items: [{ label: "Overview", to: "/", exact: true, icon: House }] },
  {
    label: "Workspace",
    items: [
      { label: "Projects", to: "/projects", icon: Folder, badge: "3" },
      {
        label: "Settings",
        icon: Settings,
        items: [
          { label: "Profile", to: "/settings/profile" },
          { label: "Billing", to: "/settings/billing" },
        ],
      },
    ],
  },
];

function tree(extra: Partial<AppShellProps> = {}): AnyRouteDefinition[] {
  return [
    {
      path: "/",
      component: () => (
        <AppShell
          navigation={NAVIGATION}
          header={<span>Acme</span>}
          footer={<button type="button">Account</button>}
          actions={<button type="button">Search</button>}
          {...extra}
        >
          <Outlet />
        </AppShell>
      ),
      staticData: { crumb: "Acme" },
      children: [
        { path: "", component: () => <h1>Overview</h1> },
        { path: "projects", component: () => <h1>Projects</h1>, staticData: { crumb: "Projects" } },
        { path: "settings/profile", component: () => <h1>Profile</h1> },
        { path: "settings/billing", component: () => <h1>Billing</h1> },
      ],
    },
  ];
}

function link(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name });
}

function trigger(): HTMLElement {
  return document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement;
}

function shell(): HTMLElement {
  return document.querySelector('[data-slot="sidebar"]') as HTMLElement;
}

// The sidebar keeps its state in a cookie, which happy-dom stores only for a
// document with an origin.
const page = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;

beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));

beforeEach(() => {
  document.cookie = "sidebar_state=; max-age=0; path=/";
});

describe("AppShell", () => {
  test("lays out the slots around the page, with a link past the navigation", async () => {
    const view = await renderRoute({ routeTree: tree() });
    const header = document.querySelector('[data-slot="sidebar-header"]');
    expect(header?.textContent).toBe("Acme");
    expect(screen.getByRole("button", { name: "Account" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Overview");

    const skip = screen.getByRole("link", { name: "Skip to content" });
    const main = document.querySelector('[data-slot="app-shell-main"]') as HTMLElement;
    expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    expect(main.tabIndex).toBe(-1);
    expect(main.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);

    const topBar = document.querySelector('[data-slot="app-shell-top-bar"]') as HTMLElement;
    expect(topBar.querySelector('[data-slot="sidebar-trigger"]')).not.toBeNull();
    expect(topBar.querySelector('[data-slot="breadcrumbs"]')?.textContent).toContain("Acme");
    view.unmount();
  });

  test("holds the caller's own lists below the navigation, in the sidebar's content", async () => {
    const view = await renderRoute({
      routeTree: tree({
        sidebar: (
          <ul aria-label="Channels">
            <li>#general</li>
          </ul>
        ),
      }),
    });
    const content = document.querySelector('[data-slot="sidebar-content"]') as HTMLElement;
    const list = within(content).getByRole("list", { name: "Channels" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();
  });

  test("renders the navigation from data, groups named by their labels", async () => {
    const view = await renderRoute({ routeTree: tree() });
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("a[href]")).toHaveLength(4);
    expect(link("Projects").getAttribute("href")).toBe("/projects");
    expect(link("Profile").getAttribute("href")).toBe("/settings/profile");
    expect(screen.getByRole("group", { name: "Workspace" })).toBeDefined();
    expect(nav.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
    view.unmount();
  });

  test("marks the item for the current location, and moves the mark as it changes", async () => {
    const view = await renderRoute({ routeTree: tree() });
    expect(link("Overview").getAttribute("aria-current")).toBe("page");
    expect(link("Overview").getAttribute("data-active")).toBe("true");
    expect(link("Projects").getAttribute("aria-current")).toBeNull();

    await user.click(link("Projects"));
    await waitFor(() => expect(view.state.location().pathname).toBe("/projects"));
    flush();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Projects");
    expect(link("Projects").getAttribute("aria-current")).toBe("page");
    expect(link("Overview").getAttribute("aria-current")).toBeNull();
    expect(link("Overview").getAttribute("data-active")).toBe("false");

    await view.navigate("/settings/billing");
    expect(link("Billing").getAttribute("aria-current")).toBe("page");
    expect(link("Projects").getAttribute("aria-current")).toBeNull();
    view.unmount();
  });

  test("a parent without a target shows and hides its links, by keyboard too", async () => {
    const view = await renderRoute({ routeTree: tree() });
    const toggle = screen.getByRole("button", { name: "Settings" });
    const sub = document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(sub.contains(link("Profile"))).toBe(true);
    expect(sub.hidden).toBe(false);

    toggle.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(sub.hidden).toBe(true);

    await user.keyboard(" ");
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(sub.hidden).toBe(false);
    view.unmount();
  });

  test("a badge is read after the item it counts", async () => {
    const view = await renderRoute({ routeTree: tree() });
    const projects = link("Projects");
    const badge = document.getElementById(projects.getAttribute("aria-describedby") ?? "");
    expect(badge?.getAttribute("data-slot")).toBe("sidebar-menu-badge");
    expect(badge?.textContent).toBe("3");
    view.unmount();
  });

  test("collapses to its icons from the trigger and from Mod+B, and remembers it", async () => {
    const view = await renderRoute({ routeTree: tree() });
    expect(shell().getAttribute("data-state")).toBe("expanded");

    await user.click(trigger());
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
    expect(shell().getAttribute("data-collapsible")).toBe("icon");
    expect(document.cookie).toContain("sidebar_state=false");
    view.unmount();
    cleanup();

    const again = await renderRoute({ routeTree: tree() });
    expect(shell().getAttribute("data-state")).toBe("collapsed");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }));
    flush();
    expect(shell().getAttribute("data-state")).toBe("expanded");
    expect(document.cookie).toContain("sidebar_state=true");
    again.unmount();
  });

  test("an explicit defaultOpen wins over the remembered state", async () => {
    document.cookie = "sidebar_state=false; path=/";
    const view = await renderRoute({ routeTree: tree({ defaultOpen: true }) });
    expect(shell().getAttribute("data-state")).toBe("expanded");
    view.unmount();
  });

  test("has no accessibility violations", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/projects" });
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });
});

describe("AppShell on a narrow viewport", () => {
  interface FakeList {
    matches: boolean;
    addEventListener: (type: string, handler: () => void) => void;
    removeEventListener: (type: string, handler: () => void) => void;
  }
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    const list: FakeList = {
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    window.matchMedia = (() => list) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = realMatchMedia;
  });

  test("the sidebar is a sheet, which closes once a page is chosen in it", async () => {
    const view = await renderRoute({ routeTree: tree() });
    expect(document.querySelector('[data-slot="sidebar-gap"]')).toBeNull();
    await user.click(trigger());
    flush();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('[data-slot="app-shell-nav"]')).not.toBeNull();

    await user.click(link("Projects"));
    await waitFor(() => expect(view.state.location().pathname).toBe("/projects"));
    flush();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.unmount();
  });
});
