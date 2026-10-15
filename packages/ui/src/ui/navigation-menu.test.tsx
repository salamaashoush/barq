import { describe, expect, test } from "bun:test";
import { flush, createSignal, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuViewport,
} from "./navigation-menu.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 20));
}

/** A panel that takes focus is focused once it is attached, a microtask on. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

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

/** shadcn's own shape: no `value` on an item, no viewport written out. */
function Site(
  props: Incoming<{
    viewport?: boolean;
    orientation?: "horizontal" | "vertical";
    dir?: "ltr" | "rtl";
    delayDuration?: number;
    skipDelayDuration?: number;
    value?: string | null;
    onValueChange?: (value: string | null) => void;
    onSelect?: (event: Event) => void;
    disableDocs?: boolean;
  }>,
) {
  return (
    <>
      <button type="button">Before</button>
      <NavigationMenu
        viewport={props.viewport?.()}
        orientation={props.orientation?.()}
        dir={props.dir?.()}
        delayDuration={props.delayDuration?.()}
        skipDelayDuration={props.skipDelayDuration?.()}
        value={props.value?.()}
        onValueChange={(next) => props.onValueChange?.()?.(next === null ? null : String(next))}
      >
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Home</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/intro" onSelect={(event) => props.onSelect?.()?.(event)}>
                Introduction
              </NavigationMenuLink>
              <NavigationMenuLink href="/install">Installation</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger disabled={props.disableDocs?.()}>
              Components
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/tabs">Tabs</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/docs" active class={navigationMenuTriggerStyle()}>
              Docs
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuIndicator />
      </NavigationMenu>
      <button type="button">After</button>
    </>
  );
}

const button = (name: string): HTMLElement => screen.getByRole("button", { name });
const anchor = (name: string): HTMLElement => screen.getByRole("link", { name });
const slot = (name: string): HTMLElement | null => document.querySelector(`[data-slot="${name}"]`);
const focused = (): string | null | undefined => document.activeElement?.textContent?.trim();

describe("NavigationMenu, written the way shadcn's examples are", () => {
  test("an item needs no value, and the root brings its own viewport", () => {
    render(() => <Site />);
    expect(document.querySelectorAll('[data-slot="navigation-menu-viewport"]')).toHaveLength(1);
    expect(triggers()).toHaveLength(2);
  });

  test("a viewport written out is the only one", () => {
    render(() => <Bar />);
    expect(document.querySelectorAll('[data-slot="navigation-menu-viewport"]')).toHaveLength(1);
  });

  test("viewport={false} draws none, and the root says so", () => {
    render(() => <Site viewport={false} />);
    expect(slot("navigation-menu-viewport")).toBeNull();
    expect(slot("navigation-menu")?.getAttribute("data-viewport")).toBe("false");
  });

  test("with a viewport the open panel is drawn inside it", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    expect(slot("navigation-menu-viewport")?.contains(panel())).toBe(true);
    expect(panel()?.textContent).toContain("Introduction");
  });

  test("the viewport is out of sight while nothing is open", async () => {
    // It keeps the last panel's size, so left in view it is an empty box.
    render(() => <Site />);
    expect(slot("navigation-menu-viewport")?.hasAttribute("hidden")).toBe(true);
    user.click(button("Home"));
    await settle();
    expect(slot("navigation-menu-viewport")?.hasAttribute("hidden")).toBe(false);
  });

  test("without one the panel is drawn under its own item", async () => {
    render(() => <Site viewport={false} />);
    user.click(button("Home"));
    await settle();
    expect(panel()?.parentElement).toBe(button("Home").parentElement);
  });

  test("every part is named as upstream names it, and says its state", async () => {
    render(() => <Site />);
    const nav = screen.getByRole("navigation");
    expect(nav.getAttribute("aria-label")).toBe("Main");
    expect(nav.getAttribute("data-orientation")).toBe("horizontal");
    expect(slot("navigation-menu-list")?.getAttribute("data-orientation")).toBe("horizontal");
    expect(slot("navigation-menu-item")?.tagName).toBe("LI");
    expect(slot("navigation-menu-viewport")?.getAttribute("data-orientation")).toBe("horizontal");
    expect(slot("navigation-menu-indicator")?.getAttribute("aria-hidden")).toBe("true");

    user.click(button("Home"));
    await settle();
    const home = button("Home");
    expect(home.getAttribute("aria-controls")).toBe(panel()?.id ?? null);
    expect(panel()?.getAttribute("aria-labelledby")).toBe(home.id);
    expect(panel()?.getAttribute("data-state")).toBe("open");
    expect(panel()?.getAttribute("data-orientation")).toBe("horizontal");
    expectNoAriaViolations(nav);
  });

  test("a disabled trigger is a disabled button", () => {
    render(() => <Site disableDocs />);
    const docs = button("Components");
    expect(docs.hasAttribute("disabled")).toBe(true);
    expect(docs.getAttribute("data-disabled")).toBe("");
  });

  test("the active link is the current page, under either prop name", () => {
    render(() => <Site />);
    expect(anchor("Docs").getAttribute("aria-current")).toBe("page");
    expect(anchor("Docs").getAttribute("data-active")).toBe("true");
  });

  test("navigationMenuTriggerStyle dresses a plain link as a trigger", () => {
    render(() => <Site />);
    const style = navigationMenuTriggerStyle();
    expect(style.split(" ")).toContain("group");
    expect(rulesFor(style)).toContain("display: inline-flex");
    for (const name of style.split(" ")) expect(anchor("Docs").classList.contains(name)).toBe(true);
    for (const name of style.split(" ")) expect(button("Home").classList.contains(name)).toBe(true);
  });

  test("an aria-label of your own replaces the default", () => {
    render(() => (
      <NavigationMenu aria-label="Documentation">
        <NavigationMenuList />
      </NavigationMenu>
    ));
    expect(screen.getByRole("navigation").getAttribute("aria-label")).toBe("Documentation");
  });

  test("the value can be owned from outside", () => {
    const seen: (string | null)[] = [];
    const [value, setValue] = createSignal<string | null>(null);
    render(() => (
      <NavigationMenu
        value={value()}
        onValueChange={(next) => seen.push(next === null ? null : String(next))}
      >
        <NavigationMenuList>
          <NavigationMenuItem value="home">
            <NavigationMenuTrigger>Home</NavigationMenuTrigger>
            <NavigationMenuContent>Welcome</NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ));
    user.click(button("Home"));
    flush();
    expect(seen).toEqual(["home"]);
    setValue("home");
    flush();
    expect(button("Home").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("NavigationMenu: the keyboard", () => {
  test("the arrows move along the bar, Home and End reach its ends", () => {
    render(() => <Site />);
    user.focus(button("Home"));
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Components");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Docs");
    user.keyDown("Home");
    expect(focused()).toBe("Home");
    user.keyDown("End");
    expect(focused()).toBe("Docs");
  });

  test("dir=rtl reverses the horizontal arrows", () => {
    render(() => <Site dir="rtl" />);
    expect(screen.getByRole("navigation").getAttribute("dir")).toBe("rtl");
    user.focus(button("Home"));
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Components");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Home");
  });

  test("a vertical bar moves with the vertical arrows and opens sideways", async () => {
    render(() => <Site orientation="vertical" />);
    expect(slot("navigation-menu-list")?.getAttribute("data-orientation")).toBe("vertical");
    user.focus(button("Home"));
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Components");
    user.keyDown("ArrowUp");
    user.keyDown("ArrowRight");
    await settle();
    expect(focused()).toBe("Introduction");
  });

  test("ArrowDown opens a panel and moves focus into it", async () => {
    render(() => <Site />);
    user.focus(button("Home"));
    user.keyDown("ArrowDown");
    await settle();
    expect(button("Home").getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Introduction");
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Installation");
  });

  test("Escape closes it and focus is back on the trigger", async () => {
    render(() => <Site />);
    user.focus(button("Home"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("Escape");
    await settle();
    expect(panel()).toBeNull();
    expect(focused()).toBe("Home");
  });

  test("Tab reads the panel straight after its trigger, though the viewport is after the list", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    user.tab();
    expect(focused()).toBe("Introduction");
    user.tab();
    expect(focused()).toBe("Installation");
    user.tab();
    expect(focused()).toBe("Components");
    user.tab({ shift: true });
    expect(focused()).toBe("Installation");
    user.tab({ shift: true });
    user.tab({ shift: true });
    expect(focused()).toBe("Home");
  });

  test("Tab off the end of the bar leaves it and closes the panel", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    user.focus(anchor("Docs"));
    user.tab();
    await settle();
    expect(focused()).toBe("After");
    expect(panel()).toBeNull();
  });

  test("choosing a link reports it, closes the menu and returns focus", async () => {
    const seen: string[] = [];
    render(() => <Site onSelect={(event) => seen.push(event.type)} />);
    user.focus(button("Home"));
    user.keyDown("ArrowDown");
    await settle();
    anchor("Introduction").addEventListener("click", (event) => event.preventDefault());
    user.virtualClick(anchor("Introduction"));
    await settle();
    expect(seen).toEqual(["navigationMenu.linkSelect"]);
    expect(panel()).toBeNull();
    expect(focused()).toBe("Home");
  });
});

describe("NavigationMenu: the pointer", () => {
  test("delayDuration is how long resting on a trigger takes to open it", async () => {
    render(() => <Site delayDuration={40} />);
    user.hover(button("Home"));
    flush();
    expect(panel()).toBeNull();
    await after(40);
    await settle();
    expect(panel()?.textContent).toContain("Introduction");
  });

  test("moving to the next trigger switches at once, and the panel says which way it came", async () => {
    render(() => <Site delayDuration={40} />);
    user.hover(button("Home"));
    await after(40);
    user.unhover(button("Home"));
    user.hover(button("Components"));
    await settle();
    expect(panel()?.textContent).toContain("Tabs");
    expect(panel()?.getAttribute("data-motion")).toBe("from-end");
    expect(slot("navigation-menu-indicator")?.getAttribute("data-state")).toBe("visible");
  });

  test("skipDelayDuration={0} makes every first open wait again", async () => {
    render(() => <Site delayDuration={40} skipDelayDuration={0} />);
    user.click(button("Home"));
    user.click(button("Home"));
    await settle();
    expect(panel()).toBeNull();
    user.unhover(button("Home"));
    user.hover(button("Components"));
    await settle();
    expect(panel()).toBeNull();
    await after(40);
    await settle();
    expect(panel()?.textContent).toContain("Tabs");
  });

  test("a finger resting on a trigger opens nothing, and a tap does", async () => {
    render(() => <Site delayDuration={10} />);
    user.hover(button("Home"), { pointerType: "touch" });
    await after(10);
    await settle();
    expect(panel()).toBeNull();
    user.tap(button("Home"));
    await settle();
    expect(panel()?.textContent).toContain("Introduction");
  });

  test("a press outside closes it, and so does focus leaving", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    user.pointerDown(button("After"));
    await settle();
    expect(panel()).toBeNull();

    user.click(button("Home"));
    await settle();
    user.focus(button("Before"));
    await settle();
    expect(panel()).toBeNull();
  });
});

describe("NavigationMenu: right-to-left", () => {
  /** An atom is named for the property it sets, so the class list says which ones are in use. */
  const properties = (element: Element | null | undefined): string[] =>
    (element?.getAttribute("class") ?? "")
      .split(" ")
      .filter((name) => name.startsWith("a-"))
      .map((name) => name.slice(2, name.lastIndexOf("_")));

  test("nothing in it is placed by a physical left or right", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    // `padding: 8px` is four sides and mirrors itself. One side without the
    // other is what a right-to-left page gets wrong.
    const lopsided = (used: string[]): string[] =>
      used.filter(
        (property) =>
          property === "left" ||
          property === "right" ||
          (/^(margin|padding)-left$/.test(property) &&
            !used.includes(property.replace("left", "right"))) ||
          (/^(margin|padding)-right$/.test(property) &&
            !used.includes(property.replace("right", "left"))),
      );
    for (const name of [
      "navigation-menu-trigger",
      "navigation-menu-content",
      "navigation-menu-viewport-wrapper",
      "navigation-menu-viewport",
      "navigation-menu-link",
      "navigation-menu-indicator",
      "navigation-menu-indicator-arrow",
    ]) {
      const used = properties(slot(name));
      expect(used.length, name).toBeGreaterThan(0);
      expect(lopsided(used), name).toEqual([]);
    }
    expect(properties(button("Home").querySelector("svg"))).toContain("margin-inline-start");
    expect(properties(slot("navigation-menu-viewport-wrapper"))).toContain("inset-inline-start");
    const arrow = properties(slot("navigation-menu-indicator-arrow"));
    expect(arrow).toContain("border-start-start-radius");
    expect(arrow).not.toContain("border-top-left-radius");
  });

  test("a panel slides the other way, because start and end have changed sides", async () => {
    render(() => <Site />);
    user.click(button("Home"));
    await settle();
    const rules = rulesFor(panel()?.getAttribute("class") ?? "");
    expect(rules).toContain("inset-inline-start: 0px");
    expect(rules).toMatch(
      /:dir\(rtl\)\[data-motion="from-end"\]\{--ui-enter-translate-x: calc\(52\*var\(--spacing\)\*-1\)\}/,
    );
  });
});
