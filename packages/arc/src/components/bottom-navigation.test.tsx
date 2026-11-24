import { describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { House } from "@barqjs/lucide/icons/house";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { User } from "@barqjs/lucide/icons/user";
import { Outlet } from "@barqjs/router";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import {
  BottomNavigation,
  type BottomNavItem,
  bottomNavigationStyles,
} from "./bottom-navigation.tsx";

const ROUTED: BottomNavItem[] = [
  { label: "Home", to: "/", exact: true, icon: House },
  { label: "Inbox", to: "/inbox", icon: Inbox, count: 3 },
  { label: "Account", to: "/account", icon: User, dot: true },
];

function tree() {
  return [
    {
      path: "/",
      component: () => (
        <div>
          <Outlet />
          <BottomNavigation items={ROUTED} />
        </div>
      ),
      children: [
        { path: "", component: () => <h1>Home</h1> },
        { path: "inbox", component: () => <h1>Inbox</h1> },
        { path: "account", component: () => <h1>Account</h1> },
      ],
    },
  ];
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("BottomNavigation", () => {
  test("a navigation landmark of router links, the current one marked", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/inbox" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((one) => one.getAttribute("href"))).toEqual(["/", "/inbox", "/account"]);
    expect(
      within(nav)
        .getByRole("link", { name: /^Inbox\W+3 new$/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(nav).getByRole("link", { name: /^Account\W+New$/ })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    view.unmount();
  });

  test("a tap follows the link and moves the mark", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/" });
    user.tap(screen.getByRole("link", { name: /^Account\W+New$/ }));
    await waitFor(() => expect(view.state.location().pathname).toBe("/account"));
    flush();
    expect(screen.getByRole("link", { name: /^Account\W+New$/ }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
    view.unmount();
  });

  test("items that are not routes are buttons held by selectedKey", async () => {
    const [current, setCurrent] = createSignal("feed");
    render(() => (
      <BottomNavigation
        position="static"
        selectedKey={current()}
        onSelectionChange={setCurrent}
        items={[
          { id: "feed", label: "Feed" },
          { id: "saved", label: "Saved" },
        ]}
      />
    ));
    expect(screen.getByRole("button", { name: "Feed" }).getAttribute("aria-current")).toBe("page");
    user.tab();
    user.tab();
    await user.keyboard("{Enter}");
    await settle();
    expect(current()).toBe("saved");
    expect(screen.getByRole("button", { name: "Saved" }).getAttribute("aria-current")).toBe("page");
  });

  test("clears the home indicator, gives each item a finger's room, and hides from md up", () => {
    render(() => <BottomNavigation items={[{ id: "a", label: "A" }]} />);
    expect(wears(slot("bottom-navigation-link"), target.size)).toBe(true);
    const sheet = collectCss();
    expect(sheet).toContain("padding-block-end:env(safe-area-inset-bottom)");
    expect(sheet).toMatch(/@media \(width >= 48rem\)\{[^}]*\{display:none\}/);
    expect(wears(slot("bottom-navigation"), bottomNavigationStyles({ hideFrom: "md" }).root)).toBe(
      true,
    );
  });

  test("reads right to left and takes the locale's words", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <BottomNavigation
          aria-label="التنقل"
          items={[
            { id: "a", label: "الرئيسية" },
            { id: "b", label: "الوارد", count: 12 },
          ]}
        />
      </Arabic>
    ));
    expect(screen.getByRole("navigation", { name: "التنقل" })).toBeDefined();
    expect(slot("indicator-badge").textContent).toBe("١٢");
  });

  test("takes a class per part", () => {
    render(() => (
      <BottomNavigation
        class="mine"
        hideFrom="never"
        position="sticky"
        items={[{ id: "a", label: "A", icon: House, count: 1 }]}
        classes={{
          root: "r",
          list: "l",
          item: "i",
          link: "k",
          icon: "c",
          label: "b",
          hint: "h",
        }}
      />
    ));
    const pairs = [
      ["bottom-navigation", "r"],
      ["bottom-navigation-list", "l"],
      ["bottom-navigation-item", "i"],
      ["bottom-navigation-link", "k"],
      ["bottom-navigation-icon", "c"],
      ["bottom-navigation-label", "b"],
      ["bottom-navigation-hint", "h"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("bottom-navigation").classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { BottomNavigation } from "<arc>";
      export function Page() {
        return (
          <BottomNavigation
            selectedKey="a"
            items={[{ id: "a", label: "Home", href: "/" }, { id: "b", label: "Inbox", count: 2 }]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[aria-current="page"]')?.textContent).toBe("Home");
    result.unmount();
  });
});
