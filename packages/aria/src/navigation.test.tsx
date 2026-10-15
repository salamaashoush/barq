import { describe, expect, test } from "bun:test";
import { flush, Show, type Incoming } from "@barqjs/core";
import { ref } from "@barqjs/primitives/refs";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";

import { provideDirection } from "./i18n.ts";
import {
  navigationMenu,
  navigationMenuState,
  type NavigationMenuItemResult,
  type NavigationMenuResult,
  type NavigationMenuState,
} from "./navigation.ts";

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

interface BarProps {
  orientation?: "horizontal" | "vertical";
  direction?: "ltr" | "rtl";
  delay?: number;
  closeDelay?: number;
  /** Render the panels after the whole list, as a shared viewport does. */
  detached?: boolean;
  disableSolutions?: boolean;
  onSelect?: (event: Event) => void;
  /** What an element around the bar, a dialog say, hears of the keyboard. */
  onOuterKeyDown?: (event: KeyboardEvent) => void;
}

let state: NavigationMenuState;

function Panel(
  props: Incoming<{ menu: NavigationMenuResult; item: NavigationMenuItemResult; names: string[] }>,
) {
  const item = props.item();
  return (
    <Show when={item.isOpen()}>
      <div {...item.contentProps} ref={item.contentRef}>
        {props.names().map((name) => (
          <a {...props.menu().linkProps()} href={`/${name.toLowerCase()}`}>
            {name}
          </a>
        ))}
      </div>
    </Show>
  );
}

function Bar(props: Incoming<BarProps>) {
  const navRef = ref<HTMLElement>();
  if (props.direction?.() !== undefined) provideDirection(() => props.direction?.() ?? "ltr");
  state = navigationMenuState({
    delay: () => props.delay?.(),
    closeDelay: () => props.closeDelay?.(),
  });
  const menu = navigationMenu({ ref: navRef, orientation: () => props.orientation?.() }, state);
  const products = menu.item({ key: "products" });
  const solutions = menu.item({ key: "solutions" });
  const detached = props.detached?.() === true;

  return (
    <div onKeyDown={(event: KeyboardEvent) => props.onOuterKeyDown?.()?.(event)}>
      <button type="button">Before</button>
      <nav {...menu.rootProps} ref={navRef.set}>
        <ul {...menu.listProps}>
          <li>
            <button type="button" {...products.triggerProps()} ref={products.triggerRef}>
              Products
            </button>
            <Show when={!detached}>
              <Panel menu={menu} item={products} names={["Analytics", "Billing"]} />
            </Show>
          </li>
          <li>
            <button
              type="button"
              {...solutions.triggerProps({ isDisabled: () => props.disableSolutions?.() === true })}
              ref={solutions.triggerRef}
            >
              Solutions
            </button>
            <Show when={!detached}>
              <Panel menu={menu} item={solutions} names={["Teams"]} />
            </Show>
          </li>
          <li>
            <a
              {...menu.linkProps({
                isActive: true,
                onSelect: (event) => props.onSelect?.()?.(event),
              })}
              href="/pricing"
            >
              Pricing
            </a>
          </li>
        </ul>
        <div {...menu.indicatorProps} data-testid="indicator" />
        <div {...menu.viewportProps} ref={menu.viewportRef} data-testid="viewport">
          <Show when={detached}>
            <Panel menu={menu} item={products} names={["Analytics", "Billing"]} />
            <Panel menu={menu} item={solutions} names={["Teams"]} />
          </Show>
        </div>
      </nav>
      <button type="button">After</button>
    </div>
  );
}

const trigger = (name: string): HTMLElement => screen.getByRole("button", { name });
const link = (name: string): HTMLElement => screen.getByRole("link", { name });
const focused = (): string | null | undefined => document.activeElement?.textContent?.trim();

describe("navigationMenu: what it says", () => {
  test("a named nav, buttons that say whether they are open, and a panel named by its button", async () => {
    render(() => <Bar />);
    const nav = screen.getByRole("navigation");
    expect(nav.getAttribute("aria-label")).toBe("Main");
    expect(nav.getAttribute("data-orientation")).toBe("horizontal");

    const products = trigger("Products");
    expect(products.getAttribute("aria-expanded")).toBe("false");
    expect(products.hasAttribute("aria-controls")).toBe(false);
    expect(products.getAttribute("data-state")).toBe("closed");

    user.click(products);
    await settle();
    expect(products.getAttribute("aria-expanded")).toBe("true");
    expect(products.getAttribute("data-state")).toBe("open");
    const panel = document.getElementById(products.getAttribute("aria-controls") ?? "");
    expect(panel?.textContent).toContain("Analytics");
    expect(panel?.getAttribute("aria-labelledby")).toBe(products.id);
    expect(panel?.getAttribute("data-state")).toBe("open");
    expect(panel?.getAttribute("data-orientation")).toBe("horizontal");
    expectNoAriaViolations(nav);
  });

  test("the current page's link says so", () => {
    render(() => <Bar />);
    expect(link("Pricing").getAttribute("aria-current")).toBe("page");
    expect(link("Pricing").getAttribute("data-active")).toBe("true");
  });

  test("the indicator is decoration, and says whether anything is open", () => {
    render(() => <Bar />);
    const indicator = screen.getByTestId("indicator");
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(indicator.getAttribute("data-state")).toBe("hidden");
    user.click(trigger("Products"));
    flush();
    expect(indicator.getAttribute("data-state")).toBe("visible");
    expect(screen.getByTestId("viewport").getAttribute("data-state")).toBe("open");
  });

  test("the indicator sits under the open trigger", () => {
    render(() => <Bar />);
    const rect = (left: number, width: number): DOMRect =>
      ({ left, width, top: 0, height: 36, right: left + width, bottom: 36 }) as DOMRect;
    screen.getByRole("navigation").getBoundingClientRect = () => rect(100, 400);
    trigger("Solutions").getBoundingClientRect = () => rect(190, 96);

    user.click(trigger("Solutions"));
    flush();
    const style = screen.getByTestId("indicator").getAttribute("style") ?? "";
    expect(style).toContain("width: 96px");
    expect(style).toContain("translateX(90px)");
  });

  test("the viewport is out of sight until there is a panel to draw in it", () => {
    render(() => <Bar detached />);
    const viewport = screen.getByTestId("viewport");
    expect(viewport.hasAttribute("hidden")).toBe(true);
    expect(viewport.getAttribute("data-state")).toBe("closed");
    user.click(trigger("Products"));
    flush();
    expect(viewport.hasAttribute("hidden")).toBe(false);
    user.click(trigger("Products"));
    flush();
    expect(viewport.hasAttribute("hidden")).toBe(true);
  });

  test("the viewport is told how big the open panel is", () => {
    render(() => <Bar detached />);
    user.click(trigger("Products"));
    flush();
    const style = screen.getByTestId("viewport").getAttribute("style") ?? "";
    expect(style).toContain("--barq-viewport-width");
    expect(style).toContain("--radix-navigation-menu-viewport-height");
  });
});

describe("navigationMenu: the keyboard", () => {
  test("every trigger and top-level link is a Tab stop", () => {
    render(() => <Bar />);
    user.focus(trigger("Before"));
    user.tab();
    expect(focused()).toBe("Products");
    user.tab();
    expect(focused()).toBe("Solutions");
    user.tab();
    expect(focused()).toBe("Pricing");
    user.tab();
    expect(focused()).toBe("After");
  });

  test("the arrows move along the bar and stop at its ends", () => {
    render(() => <Bar />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Solutions");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Pricing");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Pricing");
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Solutions");
    user.keyDown("ArrowUp");
    expect(focused()).toBe("Products");
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Products");
  });

  test("Home and End go to the ends of the bar", () => {
    render(() => <Bar />);
    user.focus(trigger("Solutions"));
    user.keyDown("End");
    expect(focused()).toBe("Pricing");
    user.keyDown("Home");
    expect(focused()).toBe("Products");
  });

  test("a disabled trigger is not somewhere the arrows stop", () => {
    render(() => <Bar disableSolutions />);
    expect(trigger("Solutions").hasAttribute("disabled")).toBe(true);
    expect(trigger("Solutions").getAttribute("data-disabled")).toBe("");
    user.focus(trigger("Products"));
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Pricing");
  });

  test("right-to-left reverses the horizontal arrows and nothing else", () => {
    render(() => <Bar direction="rtl" />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Solutions");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Products");
    user.keyDown("End");
    expect(focused()).toBe("Pricing");
  });

  test("an arrow with a modifier is the browser's, not the bar's", () => {
    render(() => <Bar />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowRight", { altKey: true });
    expect(focused()).toBe("Products");
  });

  test("ArrowDown opens the panel under a trigger and goes into it", async () => {
    render(() => <Bar />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowDown");
    await settle();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Analytics");
  });

  test("ArrowDown on a trigger that is already open goes into its panel", async () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    await settle();
    expect(focused()).toBe("Products");
    user.keyDown("ArrowDown");
    await settle();
    expect(focused()).toBe("Analytics");
  });

  test("on a link, which has no panel, ArrowDown moves along the bar like any arrow", () => {
    render(() => <Bar />);
    user.focus(trigger("Solutions"));
    user.keyDown("ArrowRight");
    user.keyDown("ArrowUp");
    expect(focused()).toBe("Solutions");
  });

  test("beside a vertical bar the inline-end arrow is the one that goes in", async () => {
    render(() => <Bar orientation="vertical" />);
    expect(screen.getByRole("navigation").getAttribute("data-orientation")).toBe("vertical");
    user.focus(trigger("Products"));
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Solutions");
    user.keyDown("ArrowUp");
    user.keyDown("ArrowRight");
    await settle();
    expect(focused()).toBe("Analytics");
  });

  test("and in a right-to-left page that arrow is the left one", async () => {
    render(() => <Bar orientation="vertical" direction="rtl" />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowLeft");
    await settle();
    expect(focused()).toBe("Analytics");
  });

  test("inside a panel the arrows move between its links, and not out of it", async () => {
    render(() => <Bar />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Billing");
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Billing");
    user.keyDown("ArrowUp");
    expect(focused()).toBe("Analytics");
    user.keyDown("End");
    expect(focused()).toBe("Billing");
    user.keyDown("Home");
    expect(focused()).toBe("Analytics");
  });

  test("Enter and Space toggle the panel and leave focus on the trigger", () => {
    render(() => <Bar />);
    const products = trigger("Products");
    user.focus(products);
    user.virtualClick(products);
    flush();
    expect(products.getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Products");
    user.virtualClick(products);
    flush();
    expect(products.getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes the panel and hands focus back to its trigger", async () => {
    const propagated: string[] = [];
    render(() => <Bar onOuterKeyDown={(event: KeyboardEvent) => propagated.push(event.key)} />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowDown");
    await settle();
    expect(focused()).toBe("Analytics");
    propagated.length = 0;

    user.keyDown("Escape");
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
    expect(focused()).toBe("Products");
    // A dialog around the bar must not close with the panel.
    expect(propagated).toEqual([]);
  });

  test("Escape with nothing open is nobody's, and travels on", () => {
    const propagated: string[] = [];
    render(() => <Bar onOuterKeyDown={(event: KeyboardEvent) => propagated.push(event.key)} />);
    user.focus(trigger("Products"));
    user.keyDown("Escape");
    expect(propagated).toEqual(["Escape"]);
  });

  test("a panel beside its trigger is read in the document's own Tab order", () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    flush();
    user.tab();
    expect(focused()).toBe("Analytics");
    user.tab();
    expect(focused()).toBe("Billing");
    user.tab();
    expect(focused()).toBe("Solutions");
  });

  test("a panel in a shared viewport is still read straight after its trigger", () => {
    render(() => <Bar detached />);
    user.click(trigger("Products"));
    flush();
    user.tab();
    expect(focused()).toBe("Analytics");
    user.tab();
    expect(focused()).toBe("Billing");
    user.tab();
    expect(focused()).toBe("Solutions");
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("true");

    user.tab({ shift: true });
    expect(focused()).toBe("Billing");
    user.tab({ shift: true });
    expect(focused()).toBe("Analytics");
    user.tab({ shift: true });
    expect(focused()).toBe("Products");
    user.tab({ shift: true });
    expect(focused()).toBe("Before");
  });

  test("Tab past the end of the bar leaves it, and the panel closes behind", () => {
    render(() => <Bar detached />);
    user.click(trigger("Products"));
    flush();
    user.focus(link("Pricing"));
    user.tab();
    flush();
    expect(focused()).toBe("After");
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("navigationMenu: the pointer", () => {
  test("resting on a trigger opens it after the delay, and not before", async () => {
    render(() => <Bar delay={40} />);
    user.hover(trigger("Products"));
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
    await after(40);
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("true");
  });

  test("leaving before the delay is up opens nothing", async () => {
    render(() => <Bar delay={40} />);
    user.hover(trigger("Products"));
    user.unhover(trigger("Products"));
    await after(40);
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
  });

  test("once one is open, moving to the next trigger switches at once", async () => {
    render(() => <Bar delay={40} />);
    user.hover(trigger("Products"));
    await after(40);
    user.unhover(trigger("Products"));
    user.hover(trigger("Solutions"));
    flush();
    expect(trigger("Solutions").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
  });

  test("leaving closes after a pause, and reaching the panel in time keeps it", async () => {
    render(() => <Bar delay={10} closeDelay={40} />);
    user.hover(trigger("Products"));
    await after(10);
    flush();

    user.unhover(trigger("Products"));
    user.hover(link("Analytics"));
    await after(40);
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("true");

    user.unhover(link("Analytics"));
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("true");
    await after(40);
    flush();
    expect(trigger("Products").getAttribute("aria-expanded")).toBe("false");
  });

  test("a finger or a pen resting on a trigger opens nothing", async () => {
    render(() => <Bar delay={10} />);
    user.hover(trigger("Products"), { pointerType: "touch" });
    user.hover(trigger("Solutions"), { pointerType: "pen" });
    await after(10);
    flush();
    expect(state.value()).toBeNull();
  });

  test("a tap toggles", () => {
    render(() => <Bar />);
    user.tap(trigger("Products"));
    flush();
    expect(state.value()).toBe("products");
    user.tap(trigger("Products"));
    flush();
    expect(state.value()).toBeNull();
  });

  test("a press does not shut what hovering just opened, and the next press does", async () => {
    render(() => <Bar delay={10} />);
    user.hover(trigger("Products"));
    await after(10);
    flush();
    expect(state.value()).toBe("products");
    user.click(trigger("Products"));
    flush();
    expect(state.value()).toBe("products");
    user.click(trigger("Products"));
    flush();
    expect(state.value()).toBeNull();
  });

  test("a disabled trigger ignores the pointer", async () => {
    render(() => <Bar delay={10} disableSolutions />);
    user.hover(trigger("Solutions"));
    await after(10);
    flush();
    expect(state.value()).toBeNull();
  });

  test("a press outside closes it", () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    flush();
    user.pointerDown(trigger("After"));
    flush();
    expect(state.value()).toBeNull();
  });

  test("a press inside the panel does not", () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    flush();
    user.pointerDown(link("Analytics"));
    flush();
    expect(state.value()).toBe("products");
  });

  test("focus going elsewhere closes it", () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    flush();
    user.focus(trigger("After"));
    flush();
    expect(state.value()).toBeNull();
  });
});

describe("navigationMenu: a link", () => {
  function stay(element: HTMLElement): void {
    element.addEventListener("click", (event) => event.preventDefault());
  }

  test("choosing one inside a panel closes the menu and returns focus to its trigger", async () => {
    render(() => <Bar />);
    user.focus(trigger("Products"));
    user.keyDown("ArrowDown");
    await settle();
    stay(link("Analytics"));
    user.virtualClick(link("Analytics"));
    flush();
    expect(state.value()).toBeNull();
    expect(focused()).toBe("Products");
  });

  test("it reports the choice, and cancelling that keeps the menu open", () => {
    const seen: string[] = [];
    render(() => (
      <Bar
        onSelect={(event: Event) => {
          seen.push(event.type);
          event.preventDefault();
        }}
      />
    ));
    stay(link("Pricing"));
    user.virtualClick(link("Pricing"));
    expect(seen).toEqual(["navigationMenu.linkSelect"]);
  });

  test("a modified click opens it elsewhere and leaves the menu alone", async () => {
    render(() => <Bar />);
    user.click(trigger("Products"));
    await settle();
    stay(link("Analytics"));
    link("Analytics").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
    );
    flush();
    expect(state.value()).toBe("products");
  });
});
