import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "./navigation-menu.tsx";

function Bar() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="products">
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="/a">Analytics</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem value="solutions">
          <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink href="/b" isActive>
              Teams
            </NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuIndicator />
      <NavigationMenuViewport />
    </NavigationMenu>
  );
}

const triggers = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="navigation-menu-trigger"]'),
];
const panel = (): HTMLElement | null =>
  document.querySelector('[data-slot="navigation-menu-content"]');

describe("NavigationMenu", () => {
  test("it is a nav, with a list of items", () => {
    render(() => <Bar />);
    expect(document.querySelector('[data-slot="navigation-menu"]')?.tagName).toBe("NAV");
    expect(document.querySelector('[data-slot="navigation-menu-list"]')?.tagName).toBe("UL");
    expect(triggers()).toHaveLength(2);
  });

  test("nothing is open to begin with, so the DOM holds no panel", () => {
    render(() => <Bar />);
    expect(panel()).toBeNull();
    expect(triggers()[0]?.getAttribute("aria-expanded")).toBe("false");
  });

  test("pressing a trigger opens its panel and says so", async () => {
    render(() => <Bar />);
    await user.click(triggers()[0] as HTMLElement);
    flush();
    expect(triggers()[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(triggers()[0]?.getAttribute("data-state")).toBe("open");
    expect(panel()?.textContent).toContain("Analytics");
  });

  test("a press does not shut what hovering it just opened", async () => {
    // Reaching a trigger with a mouse means entering it first, which opens the
    // panel. A press that toggles then finds it open and shuts it, so the panel
    // flashes and the trigger looks dead. `user.click` sends the pointer
    // events a real one does, which is the only reason this is visible.
    render(() => <Bar />);
    await user.click(triggers()[0] as HTMLElement);
    flush();
    expect(panel()?.textContent).toContain("Analytics");
  });

  test("but a second press does close it", async () => {
    render(() => <Bar />);
    await user.click(triggers()[0] as HTMLElement);
    flush();
    await user.click(triggers()[0] as HTMLElement);
    flush();
    expect(panel()).toBeNull();
  });

  test("ONE panel in the DOM, not one per item", async () => {
    // A panel per item is a row of popovers. One that moves is the component.
    render(() => <Bar />);
    await user.click(triggers()[1] as HTMLElement);
    flush();
    expect(document.querySelectorAll('[data-slot="navigation-menu-content"]')).toHaveLength(1);
    expect(panel()?.textContent).toContain("Teams");
  });

  test("a panel says which side it arrived from, and the one it replaced which way it went", async () => {
    // This is the only thing separating a navigation menu from a row of
    // popovers, so it is the assertion that matters most here.
    render(() => <Bar />);
    await user.click(triggers()[0] as HTMLElement);
    flush();
    // Nothing to compare against, so no direction is invented.
    expect(panel()?.getAttribute("data-motion")).toBeNull();

    await user.click(triggers()[1] as HTMLElement);
    flush();
    // `solutions` is to the right of `products`, so it enters from the end.
    expect(panel()?.getAttribute("data-motion")).toBe("from-end");
  });

  test("the indicator is hidden until something is open", async () => {
    render(() => <Bar />);
    const arrow = document.querySelector('[data-slot="navigation-menu-indicator"]');
    expect(arrow?.getAttribute("data-state")).toBe("hidden");
    await user.click(triggers()[0] as HTMLElement);
    flush();
    expect(arrow?.getAttribute("data-state")).toBe("visible");
  });

  test("the viewport reports its state, which is what the animation reads", async () => {
    render(() => <Bar />);
    const view = document.querySelector('[data-slot="navigation-menu-viewport"]');
    expect(view?.getAttribute("data-state")).toBe("closed");
    await user.click(triggers()[0] as HTMLElement);
    flush();
    expect(view?.getAttribute("data-state")).toBe("open");
  });

  test("the root says whether there is a viewport, which a whole family of rules reads", () => {
    render(() => <Bar />);
    // `group-data-[viewport=false]/navigation-menu:` styles the panel entirely
    // differently, so this attribute is load-bearing rather than informational.
    expect(
      document.querySelector('[data-slot="navigation-menu"]')?.getAttribute("data-viewport"),
    ).toBe("true");
  });

  test("a link marks itself active, which is how the current page reads", () => {
    render(() => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="one">
            <NavigationMenuLink href="/here" isActive>
              Here
            </NavigationMenuLink>
            <NavigationMenuLink href="/there">There</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ));
    const links = [...document.querySelectorAll('[data-slot="navigation-menu-link"]')];
    expect(links[0]?.getAttribute("data-active")).toBe("true");
    expect(links[1]?.getAttribute("data-active")).toBeNull();
    expect(links[0]?.getAttribute("href")).toBe("/here");
  });

  test("an item outside a menu says what is wrong", () => {
    expect(() => render(() => <NavigationMenuItem value="x">nothing</NavigationMenuItem>)).toThrow(
      "inside a <NavigationMenu>",
    );
  });

  test("a trigger outside an item says what is wrong", () => {
    expect(() =>
      render(() => (
        <NavigationMenu>
          <NavigationMenuTrigger>Loose</NavigationMenuTrigger>
        </NavigationMenu>
      )),
    ).toThrow("inside a <NavigationMenuItem>");
  });
});
