import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";

import { messageScroller } from "./scroller.ts";

/** A viewport with the geometry happy-dom will not measure. */
function viewport(options: { height?: number; content?: number; top?: number } = {}): HTMLElement {
  const element = document.createElement("div");
  const inner = document.createElement("div");
  element.append(inner);
  let top = options.top ?? 0;
  Object.defineProperty(element, "clientHeight", { get: () => options.height ?? 100 });
  Object.defineProperty(element, "scrollHeight", { get: () => options.content ?? 100 });
  Object.defineProperty(element, "scrollTop", {
    get: () => top,
    set: (next: number) => {
      top = next;
    },
  });
  Object.defineProperty(element, "scrollTo", {
    value: (to: { top: number }) => {
      top = to.top;
      element.dispatchEvent(new Event("scroll"));
    },
  });
  return element;
}

const scrollTo = (element: HTMLElement, top: number): void => {
  (element as unknown as { scrollTop: number }).scrollTop = top;
  element.dispatchEvent(new Event("scroll"));
};

describe("messageScroller", () => {
  test("a viewport with nothing to scroll is at its end and has no button", () => {
    const scroller = messageScroller();
    scroller.attach(viewport({ height: 100, content: 100 }));
    flush();
    expect(scroller.isAtEnd()).toBe(true);
    expect(scroller.isScrollable()).toBe(false);
  });

  test("content taller than the box is scrollable", () => {
    const scroller = messageScroller();
    scroller.attach(viewport({ height: 100, content: 500 }));
    flush();
    expect(scroller.isScrollable()).toBe(true);
    expect(scroller.isAtEnd()).toBe(false);
  });

  test("near enough the end counts as being at it", () => {
    // Sub-pixel offsets, zoom and a fractional device pixel ratio all mean an
    // exact test is one that never passes.
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500, top: 396 });
    scroller.attach(box);
    flush();
    expect(scroller.isAtEnd()).toBe(true);
  });

  test("the tolerance can be tightened", () => {
    const scroller = messageScroller({ tolerance: 1 });
    scroller.attach(viewport({ height: 100, content: 500, top: 396 }));
    flush();
    expect(scroller.isAtEnd()).toBe(false);
  });

  test("toEnd goes there and says it is there", () => {
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scroller.toEnd("auto");
    flush();
    expect(box.scrollTop).toBe(500);
    expect(scroller.isAtEnd()).toBe(true);
  });

  test("scrolling away is remembered, so an append does not yank it back", async () => {
    // Someone who scrolled up to read wants to be left alone.
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scroller.toEnd("auto");
    flush();
    scrollTo(box, 100);
    flush();
    expect(scroller.isAtEnd()).toBe(false);

    box.firstElementChild?.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(box.scrollTop).toBe(100);
  });

  test("staying at the end is remembered too, so an append follows", async () => {
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scroller.toEnd("auto");
    flush();
    box.firstElementChild?.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(box.scrollTop).toBe(500);
  });

  test("a programmatic scroll is not the person scrolling", () => {
    // `toEnd` fires the same event a finger does. Reading it as intent is how
    // a scroller decides the user just scrolled away from where it put them.
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scrollTo(box, 0);
    flush();
    scroller.toEnd("auto");
    flush();
    expect(scroller.isAtEnd()).toBe(true);
    box.firstElementChild?.append(document.createElement("p"));
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(box.scrollTop).toBe(500);
        resolve();
      }, 20);
    });
  });

  test("follow: false leaves it wherever it is", async () => {
    const scroller = messageScroller({ follow: false });
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scrollTo(box, 200);
    flush();
    box.firstElementChild?.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(box.scrollTop).toBe(200);
  });

  test("toStart goes to the top and stops following", async () => {
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scroller.toEnd("auto");
    flush();
    scroller.toStart("auto");
    flush();
    expect(box.scrollTop).toBe(0);
    box.firstElementChild?.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(box.scrollTop).toBe(0);
  });

  test("detaching stops the listeners rather than leaving them on a dead node", async () => {
    const scroller = messageScroller();
    const box = viewport({ height: 100, content: 500 });
    scroller.attach(box);
    flush();
    scroller.toEnd("auto");
    flush();
    scroller.attach(null);
    flush();
    box.firstElementChild?.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Still where it was: nothing is watching it any more.
    expect(box.scrollTop).toBe(500);
    scrollTo(box, 0);
    flush();
    expect(scroller.isAtEnd()).toBe(true);
  });
});
