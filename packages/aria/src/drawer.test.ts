import { describe, expect, test } from "bun:test";

import { canDragFrom, drawerDrag } from "./drawer.ts";

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
    drag.move(at(0, 160));
    expect(drag.offset()).toBe(60);
  });

  test("a top drawer measures the other way", () => {
    const drag = drawerDrag({ direction: "top" });
    drag.start(at(0, 100), 400);
    drag.move(at(0, 40));
    expect(drag.offset()).toBe(60);
  });

  test("a right drawer measures across, not down", () => {
    const drag = drawerDrag({ direction: "right" });
    drag.start(at(100, 0), 400);
    drag.move(at(180, 500));
    expect(drag.offset()).toBe(80);
  });

  test("pulling the wrong way is damped rather than blocked", () => {
    // A drawer that will not move at all reads as broken; one that moves an
    // eighth as far says this is as open as it gets.
    const drag = drawerDrag();
    drag.start(at(0, 100), 400);
    drag.move(at(0, 20));
    expect(drag.offset()).toBe(-10);
  });

  test("moving without starting does nothing", () => {
    const drag = drawerDrag();
    drag.move(at(0, 500));
    expect(drag.offset()).toBe(0);
  });

  test("letting go short of the threshold keeps it", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 400);
    drag.move(at(0, 80));
    expect(drag.end()).toBe(false);
    expect(closed).toBe(0);
    expect(drag.offset()).toBe(0);
    expect(drag.isDragging()).toBe(false);
  });

  test("past the threshold it closes", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 400);
    drag.move(at(0, 120));
    expect(drag.end()).toBe(true);
    expect(closed).toBe(1);
  });

  test("the threshold is a FRACTION, so a tall drawer needs a longer pull", () => {
    // 100px is halfway down a 200px drawer and a nudge on an 800px one.
    const short = drawerDrag();
    short.start(at(0, 0), 200);
    short.move(at(0, 100));
    expect(short.end()).toBe(true);

    const tall = drawerDrag();
    tall.start(at(0, 0), 800);
    tall.move(at(0, 100));
    expect(tall.end()).toBe(false);
  });

  test("a flick closes it however far it got", async () => {
    // Someone who throws the drawer down has already decided.
    const drag = drawerDrag();
    drag.start(at(0, 0), 1000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    drag.move(at(0, 60));
    // 60px in ~20ms is 3px/ms, far past 0.4, and 60 of 1000 is nowhere near
    // the threshold.
    expect(drag.end()).toBe(true);
  });

  test("a slow pull the same distance does not", async () => {
    const drag = drawerDrag();
    drag.start(at(0, 0), 1000);
    for (const y of [10, 20, 30, 40, 50, 60]) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      drag.move(at(0, y));
    }
    expect(drag.end()).toBe(false);
  });

  test("a flick BACK does not close it", async () => {
    const drag = drawerDrag();
    drag.start(at(0, 0), 200);
    drag.move(at(0, 60));
    await new Promise((resolve) => setTimeout(resolve, 20));
    drag.move(at(0, 10));
    expect(drag.end()).toBe(false);
  });

  test("ending twice closes once", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 100);
    drag.move(at(0, 90));
    expect(drag.end()).toBe(true);
    expect(drag.end()).toBe(false);
    expect(closed).toBe(1);
  });

  test("a cancelled pointer took no decision", () => {
    let closed = 0;
    const drag = drawerDrag({ onClose: () => closed++ });
    drag.start(at(0, 0), 100);
    drag.move(at(0, 90));
    drag.cancel();
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
