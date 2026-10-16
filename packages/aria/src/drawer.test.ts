import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";

import {
  canDragFrom,
  drawerBackground,
  drawerBackgroundStyle,
  drawerDrag,
  drawerKeyboard,
  nestedDrawerTransform,
  snapPointExtent,
  snapPointOffset,
} from "./drawer.ts";

const at = (x: number, y: number) => ({ x, y });

describe("drawerDrag", () => {
  test("starts at rest", () => {
    const drag = drawerDrag();
    expect(drag.offset()).toBe(0);
    expect(drag.isDragging()).toBe(false);
  });

  test("a bottom drawer measures a pull DOWN", () => {
    const drag = drawerDrag();
    drag.start(at(0, 100), 400);
    flush();
    drag.move(at(0, 160));
    flush();
    expect(drag.offset()).toBe(60);
  });

  test("a top drawer measures the other way", () => {
    const drag = drawerDrag({ direction: "top" });
    drag.start(at(0, 100), 400);
    flush();
    drag.move(at(0, 40));
    flush();
    expect(drag.offset()).toBe(60);
  });

  test("a right drawer measures across, not down", () => {
    const drag = drawerDrag({ direction: "right" });
    drag.start(at(100, 0), 400);
    flush();
    drag.move(at(180, 500));
    flush();
    expect(drag.offset()).toBe(80);
  });

  test("pulling the wrong way is damped rather than blocked", () => {
    // A drawer that will not move at all reads as broken; one that moves an
    // eighth as far says this is as open as it gets.
    const drag = drawerDrag();
    drag.start(at(0, 100), 400);
    flush();
    drag.move(at(0, 20));
    flush();
    expect(drag.offset()).toBe(-10);
  });

  test("moving without starting does nothing", () => {
    const drag = drawerDrag();
    drag.move(at(0, 500));
    flush();
    expect(drag.offset()).toBe(0);
  });

  test("letting go short of the threshold keeps it", () => {
    let closed = 0;
    let now = 1000;
    const drag = drawerDrag({ onClose: () => closed++, now: () => now });
    drag.start(at(0, 0), 400);
    flush();
    // A second for 80px is a deliberate pull, so only the distance decides.
    now += 1000;
    drag.move(at(0, 80));
    flush();
    expect(drag.end()).toBe(false);
    flush();
    expect(closed).toBe(0);
    expect(drag.offset()).toBe(0);
    expect(drag.isDragging()).toBe(false);
  });

  test("past the threshold it closes", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 400);
    flush();
    drag.move(at(0, 120));
    flush();
    expect(drag.end()).toBe(true);
    expect(closed).toBe(1);
  });

  test("the threshold is a FRACTION, so a tall drawer needs a longer pull", () => {
    // 100px is halfway down a 200px drawer and a nudge on an 800px one.
    let now = 1000;
    const short = drawerDrag({ now: () => now });
    short.start(at(0, 0), 200);
    now += 1000;
    short.move(at(0, 100));
    expect(short.end()).toBe(true);

    const tall = drawerDrag({ now: () => now });
    tall.start(at(0, 0), 800);
    now += 1000;
    tall.move(at(0, 100));
    expect(tall.end()).toBe(false);
  });

  test("a flick closes it however far it got", () => {
    // Someone who throws the drawer down has already decided.
    let now = 1000;
    const drag = drawerDrag({ now: () => now });
    drag.start(at(0, 0), 1000);
    flush();
    now += 20;
    drag.move(at(0, 60));
    flush();
    // 60px in 20ms is 3px/ms, far past 0.4, and 60 of 1000 is nowhere near
    // the threshold.
    expect(drag.end()).toBe(true);
  });

  test("a slow pull the same distance does not", () => {
    let now = 1000;
    const drag = drawerDrag({ now: () => now });
    drag.start(at(0, 0), 1000);
    flush();
    for (const y of [10, 20, 30, 40, 50, 60]) {
      now += 30;
      drag.move(at(0, y));
      flush();
    }
    expect(drag.end()).toBe(false);
  });

  test("a flick BACK does not close it", () => {
    let now = 1000;
    const drag = drawerDrag({ now: () => now });
    drag.start(at(0, 0), 200);
    flush();
    now += 20;
    drag.move(at(0, 60));
    flush();
    now += 20;
    drag.move(at(0, 10));
    flush();
    expect(drag.end()).toBe(false);
  });

  test("a pull that came to rest before it was let go is not a flick", () => {
    let now = 1000;
    const drag = drawerDrag({ now: () => now });
    drag.start(at(0, 0), 1000);
    now += 20;
    // The same 60px in 20ms a flick is made of, and then the hand stops.
    drag.move(at(0, 60));
    now += 2000;
    // Over the whole gesture that is 60px in two seconds, which is vaul's
    // measure: the speed of the last move says nothing about a hand at rest.
    expect(drag.end()).toBe(false);
  });

  test("the same pull let go at once is one", () => {
    let now = 1000;
    const drag = drawerDrag({ now: () => now });
    drag.start(at(0, 0), 1000);
    now += 20;
    drag.move(at(0, 60));
    expect(drag.end()).toBe(true);
  });

  test("ending twice closes once", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 100);
    flush();
    drag.move(at(0, 90));
    flush();
    expect(drag.end()).toBe(true);
    expect(drag.end()).toBe(false);
    expect(closed).toBe(1);
  });

  test("a cancelled pointer took no decision", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 100);
    flush();
    drag.move(at(0, 90));
    flush();
    drag.cancel();
    flush();
    expect(closed).toBe(0);
    expect(drag.offset()).toBe(0);
    expect(drag.end()).toBe(false);
  });
});

/** An element that reports the scroll geometry happy-dom will not. */
function scroller(options: { top?: number; extent?: number } = {}): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "scrollTop", { value: options.top ?? 0 });
  Object.defineProperty(element, "scrollHeight", { value: options.extent ?? 0 });
  Object.defineProperty(element, "clientHeight", { value: 0 });
  return element;
}

describe("canDragFrom", () => {
  test("a drag on the drawer itself is the drawer's", () => {
    const content = document.createElement("div");
    expect(canDragFrom(content, content, "bottom")).toBe(true);
  });

  test("a drag inside something that cannot scroll is still the drawer's", () => {
    const content = document.createElement("div");
    const inner = scroller();
    content.append(inner);
    expect(canDragFrom(inner, content, "bottom")).toBe(true);
  });

  test("a list scrolled to the middle keeps the pull", () => {
    // This is the bug every hand-written sheet has: the drawer leaves while
    // the person is reading.
    const content = document.createElement("div");
    const list = scroller({ top: 120, extent: 400 });
    content.append(list);
    expect(canDragFrom(list, content, "bottom")).toBe(false);
  });

  test("the same list at its top hands it over", () => {
    const content = document.createElement("div");
    const list = scroller({ top: 0, extent: 400 });
    content.append(list);
    expect(canDragFrom(list, content, "bottom")).toBe(true);
  });

  test("a TOP drawer wants the list at its END instead", () => {
    // A top drawer closes upward, which is the direction a list scrolls to
    // its bottom, so the list gives up the gesture only once it is there.
    const content = document.createElement("div");
    const list = scroller({ top: 400, extent: 400 });
    content.append(list);
    expect(canDragFrom(list, content, "top")).toBe(true);
    const middle = scroller({ top: 200, extent: 400 });
    content.append(middle);
    expect(canDragFrom(middle, content, "top")).toBe(false);
  });

  test("the NEAREST scroller decides, not the outermost", () => {
    const content = document.createElement("div");
    const outer = scroller({ top: 0, extent: 400 });
    const inner = scroller({ top: 50, extent: 200 });
    outer.append(inner);
    content.append(outer);
    expect(canDragFrom(inner, content, "bottom")).toBe(false);
  });

  test("a target outside the drawer walks out rather than looping", () => {
    const content = document.createElement("div");
    const loose = document.createElement("div");
    expect(canDragFrom(loose, content, "bottom")).toBe(true);
  });
});

describe("snap points", () => {
  test("a fraction is of the viewport and a string is pixels", () => {
    expect(snapPointExtent(0.5, 800)).toBe(400);
    expect(snapPointExtent("148px", 800)).toBe(148);
    expect(snapPointExtent(1, 800)).toBe(800);
  });

  test("the offset is what the snap point leaves off screen, never negative", () => {
    // A drawer as tall as the viewport rests 400px down to show half of it.
    expect(snapPointOffset(0.5, 800, 800)).toBe(400);
    expect(snapPointOffset("148px", 800, 800)).toBe(652);
    // A drawer shorter than the snap point is as open as it gets.
    expect(snapPointOffset(1, 800, 300)).toBe(0);
  });

  /** A clock the test moves, so a velocity is a number rather than a race. */
  function clock(): { now: () => number; advance: (ms: number) => void } {
    let current = 1000;
    return { now: () => current, advance: (ms) => (current += ms) };
  }

  function snapping(options: Parameters<typeof drawerDrag>[0] = {}) {
    const time = clock();
    const seen: (number | string | null)[] = [];
    let closed = 0;
    const drag = drawerDrag({
      snapPoints: [0.25, 0.5, 1],
      viewport: () => 800,
      now: time.now,
      onSnapPointChange: (point) => seen.push(point),
      onClose: () => closed++,
      ...options,
    });
    drag.measure(800);
    flush();
    return { drag, time, seen, closed: () => closed };
  }

  test("it opens at the first snap point and rests that far from open", () => {
    const { drag } = snapping();
    expect(drag.activeSnapPoint()).toBe(0.25);
    expect(drag.activeSnapIndex()).toBe(0);
    expect(drag.rest()).toBe(600);
    expect(drag.position()).toBe(600);
  });

  test("without snap points it rests fully open", () => {
    const drag = drawerDrag();
    drag.measure(400);
    flush();
    expect(drag.activeSnapPoint()).toBeNull();
    expect(drag.rest()).toBe(0);
    expect(drag.position()).toBe(0);
  });

  test("a controlled snap point is the one it rests at", () => {
    const { drag } = snapping({ activeSnapPoint: () => 0.5 });
    expect(drag.activeSnapPoint()).toBe(0.5);
    expect(drag.rest()).toBe(400);
  });

  test("a slow drag lands on the nearest snap point", () => {
    const { drag, time, seen } = snapping();
    drag.start(at(0, 600), 800);
    time.advance(2000);
    // 600 - 170 = 430 from open, and 400 (a half) is the nearest of 600, 400, 0.
    drag.move(at(0, 430));
    time.advance(2000);
    expect(drag.position()).toBe(430);
    expect(drag.end()).toBe(false);
    flush();
    expect(seen).toEqual([0.5]);
    expect(drag.activeSnapPoint()).toBe(0.5);
    expect(drag.rest()).toBe(400);
    expect(drag.offset()).toBe(0);
  });

  test("a quick short pull goes one snap point along, not to the nearest", () => {
    const { drag, time, seen } = snapping();
    drag.start(at(0, 600), 800);
    time.advance(50);
    // 40px in 50ms is 0.8px/ms: past the 0.4 threshold, far short of 2.
    drag.move(at(0, 560));
    expect(drag.end()).toBe(false);
    flush();
    expect(seen).toEqual([0.5]);
  });

  test("a throw toward open goes straight to the last snap point", () => {
    const { drag, time, seen } = snapping();
    drag.start(at(0, 600), 800);
    time.advance(20);
    drag.move(at(0, 540));
    expect(drag.end()).toBe(false);
    flush();
    expect(seen).toEqual([1]);
  });

  test("a throw toward the edge closes it", () => {
    const { drag, time, closed } = snapping({ activeSnapPoint: () => 1 });
    drag.start(at(0, 0), 800);
    time.advance(20);
    drag.move(at(0, 60));
    expect(drag.end()).toBe(true);
    expect(closed()).toBe(1);
  });

  test("sequential snapping never skips, however hard the throw", () => {
    const { drag, time, seen } = snapping({ snapToSequentialPoint: true });
    drag.start(at(0, 600), 800);
    time.advance(20);
    drag.move(at(0, 540));
    drag.end();
    flush();
    expect(seen).toEqual([0.5]);
  });

  test("a quick pull down from the first snap point closes it", () => {
    const { drag, time, closed } = snapping();
    drag.start(at(0, 600), 800);
    time.advance(50);
    drag.move(at(0, 640));
    expect(drag.end()).toBe(true);
    expect(closed()).toBe(1);
  });

  test("it cannot be dragged past its largest snap point", () => {
    const { drag } = snapping({ activeSnapPoint: () => 1 });
    drag.start(at(0, 0), 800);
    drag.move(at(0, -200));
    // No higher point to reach, so the pull is damped like any other.
    expect(drag.position()).toBe(-25);
  });

  test("between snap points a pull toward open is not damped", () => {
    const { drag } = snapping();
    drag.start(at(0, 600), 800);
    drag.move(at(0, 500));
    expect(drag.position()).toBe(500);
  });

  test("the overlay fades in over the last stretch, from the snap point before fadeFromIndex", () => {
    const { drag } = snapping();
    // Three points, so the fade is between the half and the full height.
    expect(drag.overlayOpacity()).toBe(0);
    drag.start(at(0, 600), 800);
    drag.move(at(0, 400));
    expect(drag.overlayOpacity()).toBe(0);
    drag.move(at(0, 200));
    expect(drag.overlayOpacity()).toBe(0.5);
    drag.move(at(0, 0));
    expect(drag.overlayOpacity()).toBe(1);
  });

  test("fadeFromIndex 0 dims the page at every snap point", () => {
    const { drag } = snapping({ fadeFromIndex: 0 });
    expect(drag.overlayOpacity()).toBe(1);
  });

  test("without snap points the overlay fades with the pull", () => {
    const drag = drawerDrag();
    expect(drag.overlayOpacity()).toBe(1);
    drag.start(at(0, 0), 400);
    drag.move(at(0, 100));
    expect(drag.overlayOpacity()).toBe(0.75);
    expect(drag.progress()).toBe(0.25);
  });

  test("the handle cycles through the snap points and closes after the last", () => {
    const { drag, seen, closed } = snapping();
    drag.cycle();
    flush();
    drag.cycle();
    flush();
    expect(seen).toEqual([0.5, 1]);
    drag.cycle();
    expect(closed()).toBe(1);
  });

  test("the handle closes a drawer that has no snap points", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.cycle();
    expect(closed).toBe(1);
  });
});

describe("a drawer that cannot be dismissed", () => {
  test("does not move at all without snap points", () => {
    let closed = 0;
    const drag = drawerDrag({ dismissible: false, onClose: () => closed++ });
    drag.start(at(0, 0), 400);
    drag.move(at(0, 300));
    expect(drag.isDragging()).toBe(false);
    expect(drag.offset()).toBe(0);
    expect(drag.end()).toBe(false);
    drag.cycle();
    expect(closed).toBe(0);
  });

  test("with snap points it moves between them and never below the first", () => {
    let closed = 0;
    const seen: (number | string | null)[] = [];
    let now = 0;
    const drag = drawerDrag({
      dismissible: false,
      snapPoints: [0.5, 1],
      viewport: () => 800,
      now: () => now,
      onClose: () => closed++,
      onSnapPointChange: (point) => seen.push(point),
    });
    drag.measure(800);
    flush();
    drag.start(at(0, 400), 800);
    drag.move(at(0, 700));
    expect(drag.position()).toBe(400);
    now += 20;
    expect(drag.end()).toBe(false);
    expect(closed).toBe(0);

    drag.start(at(0, 400), 800);
    now += 2000;
    drag.move(at(0, 100));
    drag.end();
    flush();
    expect(seen).toEqual([1]);
    drag.cycle();
    expect(closed).toBe(0);
  });
});

describe("what a drag reports", () => {
  test("onDrag hears how much of the drawer is gone, and onRelease whether it stayed", () => {
    const dragged: number[] = [];
    const released: boolean[] = [];
    let now = 1000;
    const drag = drawerDrag({
      now: () => now,
      onDrag: (progress) => dragged.push(progress),
      onRelease: (open) => released.push(open),
    });
    drag.start(at(0, 0), 400);
    now += 1000;
    drag.move(at(0, 100));
    drag.end();
    expect(dragged).toEqual([0.25]);
    expect(released).toEqual([true]);

    drag.start(at(0, 0), 400);
    now += 1000;
    drag.move(at(0, 300));
    drag.end();
    expect(released).toEqual([true, false]);
  });
});

describe("the page behind", () => {
  test("it is scaled so 26px of the viewport shows around it, and comes back with the pull", () => {
    expect(drawerBackgroundStyle("bottom", 1000, 0)).toEqual({
      transform: "scale(0.974) translate3d(0, 14px, 0)",
      borderRadius: "8px",
    });
    expect(drawerBackgroundStyle("bottom", 1000, 0.5)).toEqual({
      transform: "scale(0.987) translate3d(0, 7px, 0)",
      borderRadius: "4px",
    });
    expect(drawerBackgroundStyle("right", 1000, 1)).toEqual({
      transform: "scale(1) translate3d(0px, 0, 0)",
      borderRadius: "0px",
    });
  });

  test("the wrapper is styled while a drawer is open and restored after", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-vaul-drawer-wrapper", "");
    wrapper.style.overflow = "auto";
    document.body.append(wrapper);
    const before = document.body.style.background;

    const background = drawerBackground({
      direction: "bottom",
      viewport: () => 1000,
      duration: 10,
    });
    background.open();
    expect(wrapper.style.transform).toBe("scale(0.974) translate3d(0, 14px, 0)");
    expect(wrapper.style.transformOrigin).toBe("top");
    expect(wrapper.style.borderRadius).toBe("8px");
    expect(wrapper.style.overflow).toBe("hidden");
    expect(document.body.style.background).toBe("black");

    background.drag(0.5);
    expect(wrapper.style.transform).toBe("scale(0.987) translate3d(0, 7px, 0)");
    expect(wrapper.style.transitionProperty).toBe("none");

    background.settle();
    expect(wrapper.style.transform).toBe("scale(0.974) translate3d(0, 14px, 0)");
    expect(wrapper.style.transitionProperty).toBe("transform, border-radius");

    background.close();
    // The transform goes at once so the transition carries the page back; the
    // black behind it stays until the corners have finished rounding out.
    expect(wrapper.style.transform).toBe("");
    expect(wrapper.style.borderRadius).toBe("");
    expect(wrapper.style.overflow).toBe("hidden");
    expect(document.body.style.background).toBe("black");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(wrapper.style.overflow).toBe("auto");
    expect(wrapper.style.transitionProperty).toBe("");
    expect(document.body.style.background).toBe(before);
    wrapper.remove();
  });

  test("reopening on the way back keeps the page that was found", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-drawer-wrapper", "");
    wrapper.style.overflow = "auto";
    document.body.append(wrapper);

    const background = drawerBackground({ viewport: () => 1000, duration: 10 });
    background.open();
    background.close();
    background.open();
    expect(wrapper.style.transform).toBe("scale(0.974) translate3d(0, 14px, 0)");
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The pending restore was dropped, so the page is still scaled.
    expect(wrapper.style.overflow).toBe("hidden");

    background.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(wrapper.style.overflow).toBe("auto");
    wrapper.remove();
  });

  test("with no wrapper on the page it does nothing rather than throwing", () => {
    const background = drawerBackground({ direction: "bottom" });
    expect(() => {
      background.open();
      background.drag(0.2);
      background.close();
    }).not.toThrow();
  });

  test("a drawer under a nested one steps back 16px and returns as the nested one leaves", () => {
    expect(nestedDrawerTransform("bottom", 800, 0)).toBe("scale(0.98) translate3d(0, -16px, 0)");
    expect(nestedDrawerTransform("bottom", 800, 0.5)).toBe("scale(0.99) translate3d(0, -8px, 0)");
    expect(nestedDrawerTransform("left", 800, 1)).toBe("scale(1) translate3d(0px, 0, 0)");
  });
});

describe("drawerKeyboard", () => {
  function setup(fixed: boolean): {
    drawer: HTMLElement;
    field: HTMLInputElement;
    viewport: EventTarget & { height: number };
    stop: () => void;
    restore: () => void;
  } {
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const drawer = document.createElement("div");
    drawer.getBoundingClientRect = () => ({ height: 300 }) as DOMRect;
    const field = document.createElement("input");
    drawer.append(field);
    document.body.append(drawer);
    const stop = drawerKeyboard(drawer, { fixed });
    return {
      drawer,
      field,
      viewport,
      stop,
      restore: () => {
        drawer.remove();
        if (original === undefined) Reflect.deleteProperty(window, "visualViewport");
        else Object.defineProperty(window, "visualViewport", original);
      },
    };
  }

  test("lifts the drawer by the keyboard while a field inside has focus, and puts it back", () => {
    const { drawer, field, viewport, stop, restore } = setup(false);
    field.focus();
    viewport.height = window.innerHeight - 250;
    viewport.dispatchEvent(new Event("resize"));
    expect(drawer.style.bottom).toBe("250px");
    viewport.height = window.innerHeight;
    viewport.dispatchEvent(new Event("resize"));
    expect(drawer.style.bottom).toBe("");
    stop();
    restore();
  });

  test("fixed shortens it instead, and a field elsewhere moves nothing", () => {
    const { drawer, field, viewport, stop, restore } = setup(true);
    field.focus();
    viewport.height = window.innerHeight - 100;
    viewport.dispatchEvent(new Event("resize"));
    expect(drawer.style.height).toBe("200px");
    expect(drawer.style.bottom).toBe("");

    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    viewport.dispatchEvent(new Event("resize"));
    expect(drawer.style.height).toBe("");
    outside.remove();
    stop();
    restore();
  });
});
