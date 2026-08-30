import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Breadcrumb, Breadcrumbs } from "./breadcrumbs.tsx";
import type { Key } from "./collections.ts";

interface Crumb {
  id: string;
  name: string;
  href?: string;
}

const TRAIL: Crumb[] = [
  { id: "home", name: "Home", href: "/" },
  { id: "shop", name: "Shop", href: "/shop" },
  { id: "hats", name: "Hats", href: "/shop/hats" },
];

function Trail(props: Incoming<{ onAction?: (key: Key) => void }>) {
  return (
    <Breadcrumbs items={TRAIL} onAction={props.onAction?.()}>
      {(crumb: Crumb) => <Breadcrumb href={crumb.href}>{crumb.name}</Breadcrumb>}
    </Breadcrumbs>
  );
}

describe("Breadcrumbs", () => {
  test("is a named navigation landmark holding an ordered list", () => {
    render(() => <Trail />);

    expect(accessibleName(screen.getByRole("navigation"))).toBe("Breadcrumbs");
    expect(screen.getByRole("list")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  test("every crumb is a link, including the one you are on", () => {
    render(() => <Trail />);

    const links = screen.getAllByRole("link");
    expect(links.map((link: Element) => link.textContent)).toEqual(["Home", "Shop", "Hats"]);
  });

  test("a crumb with no address is not dressed up as a link", () => {
    render(() => (
      <Breadcrumbs items={[{ id: "here", name: "Here" }]}>
        {(crumb: Crumb) => <Breadcrumb>{crumb.name}</Breadcrumb>}
      </Breadcrumbs>
    ));

    // An `<a>` with no `href` has no role: it would be read as text while
    // looking like something to press.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Here")).not.toBeNull();
  });

  test("the last crumb says it is the page you are on", () => {
    render(() => <Trail />);

    const current = screen.getByRole("link", { current: "page" });
    expect(current.textContent).toBe("Hats");
  });

  test("only one of them claims to be current", () => {
    render(() => <Trail />);

    const current = screen
      .getAllByRole("link")
      .filter((link: Element) => link.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
  });

  test("pressing a crumb reports its key", () => {
    const acted: Key[] = [];
    render(() => <Trail onAction={(key) => acted.push(key)} />);

    user.click(screen.getByRole("link", { name: "Shop" }));
    flush();

    expect(acted).toEqual(["shop"]);
  });

  test("a disabled trail does not report a press", () => {
    const acted: Key[] = [];
    render(() => (
      <Breadcrumbs items={TRAIL} isDisabled onAction={(key) => acted.push(key)}>
        {(crumb: Crumb) => <Breadcrumb href={crumb.href}>{crumb.name}</Breadcrumb>}
      </Breadcrumbs>
    ));

    // Disabled, so it is not a link any more: there is nothing to press.
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    user.click(screen.getByText("Shop"));
    flush();

    expect(acted).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Trail />);
    expectNoAriaViolations(container);
  });
});
