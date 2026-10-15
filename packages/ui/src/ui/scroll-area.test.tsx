import { afterEach, describe, expect, test } from "bun:test";
import { provideDirection } from "@barqjs/aria/i18n";
import { Show, createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import { cleanup, render, screen, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import { ScrollArea, ScrollBar } from "./scroll-area.tsx";

afterEach(cleanup);

const slot = (name: string, root: ParentNode = document): HTMLElement =>
  root.querySelector(`[data-slot="${name}"]`) as HTMLElement;

const bar = (orientation: "vertical" | "horizontal"): HTMLElement =>
  document.querySelector(
    `[data-slot="scroll-area-scrollbar"][data-orientation="${orientation}"]`,
  ) as HTMLElement;

/** happy-dom measures nothing, so the geometry is declared. */
function sized(
  viewport: HTMLElement,
  axis: "vertical" | "horizontal",
  size: number,
  content: number,
): void {
  let at = 0;
  const [client, offset, scroll, position] =
    axis === "vertical"
      ? (["clientHeight", "offsetHeight", "scrollHeight", "scrollTop"] as const)
      : (["clientWidth", "offsetWidth", "scrollWidth", "scrollLeft"] as const);
  for (const name of [client, offset]) {
    Object.defineProperty(viewport, name, { get: () => size, configurable: true });
  }
  Object.defineProperty(viewport, scroll, { get: () => content, configurable: true });
  Object.defineProperty(viewport, position, {
    get: () => at,
    set: (next: number) => {
      at = next;
    },
    configurable: true,
  });
}

function railed(track: HTMLElement, axis: "vertical" | "horizontal", length: number): void {
  Object.defineProperty(track, axis === "vertical" ? "clientHeight" : "clientWidth", {
    get: () => length,
    configurable: true,
  });
  track.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: length, height: length }) as DOMRect;
}

/** Declares the geometry and tells the bar, the way a resize would. */
function measure(axis: "vertical" | "horizontal", size: number, content: number): HTMLElement {
  const viewport = slot("scroll-area-viewport");
  sized(viewport, axis, size, content);
  railed(bar(axis), axis, size);
  viewport.dispatchEvent(new Event("scroll"));
  flush();
  return viewport;
}

describe("ScrollArea", () => {
  test("on its own it is the native scroller, and the viewport is not a box", () => {
    render(() => <ScrollArea aria-label="Log">lots of text</ScrollArea>);
    const region = screen.getByRole("region", { name: "Log" });
    expect(region.getAttribute("data-slot")).toBe("scroll-area");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.hasAttribute("data-scrollbars")).toBe(false);
    expect(rulesFor(region.className)).toContain("overflow-x: auto");

    // Present so a `<ScrollBar>` has something to draw for, and laid out as
    // though it were not there until one arrives.
    const viewport = slot("scroll-area-viewport", region);
    expect(viewport.textContent).toBe("lots of text");
    expect(rulesFor(viewport.className)).toContain("display: contents");
    expect(viewport.hasAttribute("tabindex")).toBe(false);
    expect(document.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
  });

  test("a ScrollBar hands the scrolling to the viewport and hides the native bars", async () => {
    render(() => (
      <ScrollArea aria-label="Log">
        <p>lots of text</p>
        <ScrollBar />
      </ScrollArea>
    ));
    await tick();
    flush();
    const region = screen.getByRole("region", { name: "Log" });
    expect(region.getAttribute("data-scrollbars")).toBe("custom");
    const rules = rulesFor(region.className);
    expect(rules).toMatch(/\[data-scrollbars="custom"\]\{overflow-x: hidden\}/);

    const viewport = slot("scroll-area-viewport");
    expect(viewport.hasAttribute("data-vertical")).toBe(true);
    expect(viewport.hasAttribute("data-horizontal")).toBe(false);
    const own = rulesFor(viewport.className);
    expect(own).toMatch(/:where\(\[data-scrollbars="custom"\]\) > [^{]*\{display: block\}/);
    expect(own).toContain("scrollbar-width: none");
    expect(own).toMatch(/\[data-vertical\]\{overflow-y: auto\}/);
    expect(own).toMatch(/\[data-horizontal\]\{overflow-x: auto\}/);
  });

  test("the keyboard stop moves to whichever element scrolls", async () => {
    // A scrolling region nobody can reach with Tab is a WCAG failure, and Tab
    // landing on a box that no longer scrolls is a stop that does nothing.
    render(() => (
      <ScrollArea aria-label="Log">
        <p>lots of text</p>
        <ScrollBar />
      </ScrollArea>
    ));
    await tick();
    flush();
    expect(screen.getByRole("region", { name: "Log" }).hasAttribute("tabindex")).toBe(false);
    expect(slot("scroll-area-viewport").getAttribute("tabindex")).toBe("0");
    user.tab();
    expect(document.activeElement).toBe(slot("scroll-area-viewport"));
  });

  test("a bar that arrives later switches it over, and leaving switches it back", async () => {
    const [shown, setShown] = createSignal(false);
    render(() => (
      <ScrollArea aria-label="Log">
        <p>lots of text</p>
        <Show when={shown()}>
          <ScrollBar />
        </Show>
      </ScrollArea>
    ));
    const region = screen.getByRole("region", { name: "Log" });
    expect(region.hasAttribute("data-scrollbars")).toBe(false);

    setShown(true);
    flush();
    await tick();
    flush();
    expect(region.getAttribute("data-scrollbars")).toBe("custom");

    setShown(false);
    flush();
    expect(region.hasAttribute("data-scrollbars")).toBe(false);
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  test("a ScrollBar outside a ScrollArea says what is wrong", () => {
    expect(() => render(() => <ScrollBar />)).toThrow("inside a <ScrollArea>");
  });
});

describe("ScrollBar", () => {
  function Area(
    props: Incoming<{
      type?: "auto" | "always" | "scroll" | "hover";
      horizontal?: boolean;
      scrollHideDelay?: number;
    }>,
  ) {
    return (
      <ScrollArea
        aria-label="Log"
        type={props.type?.()}
        scrollHideDelay={props.scrollHideDelay?.()}
      >
        <p>lots of text</p>
        <ScrollBar />
        <Show when={props.horizontal?.() === true}>
          <ScrollBar orientation="horizontal" />
        </Show>
      </ScrollArea>
    );
  }

  test("it is a scrollbar for the viewport, and says how far through it is", async () => {
    render(() => <Area type="auto" />);
    await tick();
    const viewport = measure("vertical", 200, 1000);

    const track = bar("vertical");
    expect(track.getAttribute("role")).toBe("scrollbar");
    expect(track.getAttribute("aria-orientation")).toBe("vertical");
    expect(track.getAttribute("aria-controls")).toBe(viewport.id);
    expect(viewport.id).not.toBe("");
    expect(track.getAttribute("aria-valuemin")).toBe("0");
    expect(track.getAttribute("aria-valuemax")).toBe("100");
    expect(track.getAttribute("aria-valuenow")).toBe("0");

    viewport.scrollTop = 400;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(track.getAttribute("aria-valuenow")).toBe("50");
  });

  test("the thumb is as long as the share on screen, and moves with the content", async () => {
    render(() => <Area type="auto" />);
    await tick();
    const viewport = measure("vertical", 200, 1000);
    const thumb = slot("scroll-area-thumb");
    expect(thumb.style.height).toBe("40px");
    expect(thumb.style.transform).toBe("translate3d(0px, 0px, 0px)");

    viewport.scrollTop = 400;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(thumb.style.transform).toBe("translate3d(0px, 80px, 0px)");
  });

  test("a horizontal bar is the other axis, and both can be there at once", async () => {
    render(() => <Area type="auto" horizontal />);
    await tick();
    measure("horizontal", 100, 400);
    const track = bar("horizontal");
    expect(track.getAttribute("aria-orientation")).toBe("horizontal");
    const thumb = slot("scroll-area-thumb", track);
    expect(thumb.style.width).toBe("25px");

    const viewport = slot("scroll-area-viewport");
    expect(viewport.hasAttribute("data-vertical")).toBe(true);
    expect(viewport.hasAttribute("data-horizontal")).toBe(true);
    expect(bar("vertical")).not.toBeNull();
  });

  test("pressing the track jumps there, and dragging keeps following", async () => {
    render(() => <Area type="auto" />);
    await tick();
    const viewport = measure("vertical", 200, 1000);
    const track = bar("vertical");

    user.pointerDown(track, { clientX: 5, clientY: 100 });
    expect(viewport.scrollTop).toBe(400);
    expect(track.getAttribute("data-dragging")).toBe("");

    user.pointerMove(track, { clientX: 5, clientY: 180 });
    expect(viewport.scrollTop).toBe(800);

    user.pointerUp(track, { clientX: 5, clientY: 180 });
    expect(track.hasAttribute("data-dragging")).toBe(false);
    user.pointerMove(track, { clientX: 5, clientY: 20 });
    expect(viewport.scrollTop).toBe(800);
  });

  test("the thumb is dragged by the point it was taken hold of", async () => {
    render(() => <Area type="auto" />);
    await tick();
    const viewport = measure("vertical", 200, 1000);
    const thumb = slot("scroll-area-thumb");
    thumb.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 40 }) as DOMRect;

    user.pointerDown(thumb, { clientX: 5, clientY: 10 });
    expect(viewport.scrollTop).toBe(0);
    user.pointerMove(thumb, { clientX: 5, clientY: 90 });
    expect(viewport.scrollTop).toBe(400);
    user.pointerUp(thumb, { clientX: 5, clientY: 90 });
  });

  test("auto shows it only while there is something to scroll", async () => {
    render(() => <Area type="auto" />);
    await tick();
    measure("vertical", 200, 200);
    expect(bar("vertical").getAttribute("data-state")).toBe("hidden");
    measure("vertical", 200, 1000);
    expect(bar("vertical").getAttribute("data-state")).toBe("visible");
  });

  test("hover, the default, shows it while the pointer is over the area", async () => {
    render(() => <Area scrollHideDelay={10} />);
    await tick();
    measure("vertical", 200, 1000);
    const track = bar("vertical");
    expect(track.getAttribute("data-state")).toBe("hidden");

    user.hover(slot("scroll-area"));
    expect(track.getAttribute("data-state")).toBe("visible");

    user.unhover(slot("scroll-area"));
    // Waited for rather than timed: a busy machine stretches a 10ms timer.
    for (let tries = 0; tries < 200 && track.getAttribute("data-state") !== "hidden"; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      flush();
    }
    expect(track.getAttribute("data-state")).toBe("hidden");
  });

  test("a hidden bar is out of the way of the pointer, not out of the tree", async () => {
    render(() => <Area />);
    await tick();
    const rules = rulesFor(bar("vertical").className);
    expect(rules).toMatch(/\[data-state="hidden"\]\{pointer-events: none\}/);
    expect(rules).toMatch(/\[data-state="hidden"\]\{opacity: 0%?\}/);
  });

  test("it sits at the end of the line, wherever the end is", async () => {
    render(() => <Area type="auto" horizontal />);
    await tick();
    const vertical = rulesFor(bar("vertical").className);
    expect(vertical).toContain("inset-inline-end: 0");
    expect(vertical).toContain("border-inline-start-width: 1px");
    expect(vertical).not.toContain(".a-right_");
    const horizontal = rulesFor(bar("horizontal").className);
    expect(horizontal).toContain("inset-inline-start: 0");
    expect(horizontal).toContain("border-top-width: 1px");
  });

  test("right to left, a horizontal thumb starts at the far end", async () => {
    function Rtl(props: { children?: Child }) {
      provideDirection("rtl");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <ScrollArea aria-label="Log" type="auto">
          <p>lots of text</p>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Rtl>
    ));
    await tick();
    measure("horizontal", 200, 1000);
    const thumb = slot("scroll-area-thumb");
    expect(thumb.style.transform).toBe("translate3d(160px, 0px, 0px)");
  });

  test("a finger on the bar drags the thumb rather than panning the page", async () => {
    render(() => <Area />);
    await tick();
    expect(rulesFor(bar("vertical").className)).toContain("touch-action: none");
  });
});
