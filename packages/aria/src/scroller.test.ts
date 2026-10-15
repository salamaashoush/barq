import { describe, expect, test } from "bun:test";
import { createRoot, flush } from "@barqjs/core";

import {
  messageScroller,
  scrollPositionAt,
  scrollbar,
  thumbOffset,
  thumbSize,
} from "./scroller.ts";

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
  test("attach is usable as a ref: it measures while a scope is being built", () => {
    // What `ref={scroller.attach}` does. Under an owner a plain signal write is
    // refused, so a scroller that measured into one could not be attached here.
    const scroller = messageScroller();
    const dispose = createRoot((disposeRoot) => {
      scroller.attach(viewport({ height: 100, content: 500 }));
      return disposeRoot;
    });
    flush();
    expect(scroller.isScrollable()).toBe(true);
    dispose();
  });

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

interface Box {
  readonly element: HTMLElement;
  /** Move it the way a wheel does: the position and then the event. */
  readonly scroll: (to: number) => void;
}

/** A viewport that overflows on one axis, with the geometry declared. */
function overflowing(
  axis: "vertical" | "horizontal",
  options: { size: number; content: number; at?: number },
): Box {
  const element = document.createElement("div");
  let at = options.at ?? 0;
  const [client, offset, scroll, position] =
    axis === "vertical"
      ? (["clientHeight", "offsetHeight", "scrollHeight", "scrollTop"] as const)
      : (["clientWidth", "offsetWidth", "scrollWidth", "scrollLeft"] as const);
  Object.defineProperty(element, client, { get: () => options.size });
  Object.defineProperty(element, offset, { get: () => options.size });
  Object.defineProperty(element, scroll, { get: () => options.content });
  Object.defineProperty(element, position, {
    get: () => at,
    set: (next: number) => {
      at = next;
    },
  });
  return {
    element,
    scroll: (to) => {
      at = to;
      element.dispatchEvent(new Event("scroll"));
    },
  };
}

/** A track of a known length, at a known place on the page. */
function track(axis: "vertical" | "horizontal", length: number, start = 0): HTMLElement {
  const element = document.createElement("div");
  const thumb = document.createElement("div");
  element.append(thumb);
  Object.defineProperty(element, axis === "vertical" ? "clientHeight" : "clientWidth", {
    get: () => length,
  });
  element.getBoundingClientRect = () =>
    ({ top: start, left: start, width: length, height: length }) as DOMRect;
  element.setPointerCapture = () => {};
  element.releasePointerCapture = () => {};
  return element;
}

const pointer = (type: string, at: number, target?: Element): PointerEvent => {
  const event = new PointerEvent(type, {
    clientX: at,
    clientY: at,
    button: 0,
    pointerId: 1,
    bubbles: true,
    cancelable: true,
  });
  if (target !== undefined) Object.defineProperty(event, "target", { value: target });
  return event;
};

describe("scrollbar geometry", () => {
  const sizes = { content: 1000, viewport: 200, track: 200, paddingStart: 0, paddingEnd: 0 };

  test("the thumb is the share of the content that is on screen", () => {
    expect(thumbSize(sizes)).toBe(40);
  });

  test("it never shrinks past what a finger can still take hold of", () => {
    expect(thumbSize({ ...sizes, content: 100_000 })).toBe(18);
    expect(thumbSize({ ...sizes, content: 100_000 }, 30)).toBe(30);
  });

  test("the track's own padding is not somewhere the thumb can be", () => {
    expect(thumbSize({ ...sizes, paddingStart: 10, paddingEnd: 10 })).toBe(36);
  });

  test("the thumb travels the track as the viewport travels the content", () => {
    expect(thumbOffset(0, sizes)).toBe(0);
    expect(thumbOffset(400, sizes)).toBe(80);
    expect(thumbOffset(800, sizes)).toBe(160);
  });

  test("a rubber-band overscroll does not carry the thumb off the track", () => {
    expect(thumbOffset(-50, sizes)).toBe(0);
    expect(thumbOffset(900, sizes)).toBe(160);
  });

  test("right to left the position counts down from zero, and the thumb starts at the far end", () => {
    expect(thumbOffset(0, sizes, "rtl")).toBe(160);
    expect(thumbOffset(-800, sizes, "rtl")).toBe(0);
  });

  test("a pointer on the track asks for the position that puts the thumb under it", () => {
    // Held by its middle: 20px in from either end of a 40px thumb.
    expect(scrollPositionAt(20, 20, sizes)).toBe(0);
    expect(scrollPositionAt(100, 20, sizes)).toBe(400);
    expect(scrollPositionAt(180, 20, sizes)).toBe(800);
  });

  test("and right to left it asks for the mirrored one", () => {
    expect(scrollPositionAt(20, 20, sizes, "rtl")).toBe(-800);
    expect(scrollPositionAt(180, 20, sizes, "rtl")).toBe(0);
  });

  test("nothing to scroll is a thumb with nowhere to go, not a division by zero", () => {
    const fits = { ...sizes, content: 200 };
    expect(thumbOffset(0, fits)).toBe(0);
    expect(scrollPositionAt(100, 20, fits)).toBe(0);
  });
});

describe("scrollbar", () => {
  test("it reports overflow, the thumb and how far through the content it is", () => {
    const bar = scrollbar();
    const box = overflowing("vertical", { size: 200, content: 1000 });
    bar.attach(box.element, track("vertical", 200));
    flush();
    expect(bar.hasOverflow()).toBe(true);
    expect(bar.thumbSize()).toBe(40);
    expect(bar.thumbOffset()).toBe(0);
    expect(bar.value()).toBe(0);

    box.scroll(400);
    flush();
    expect(bar.thumbOffset()).toBe(80);
    expect(bar.value()).toBe(50);
    bar.attach(null, null);
  });

  test("content that fits has no overflow and nothing to drag", () => {
    const bar = scrollbar();
    bar.attach(
      overflowing("vertical", { size: 200, content: 200 }).element,
      track("vertical", 200),
    );
    flush();
    expect(bar.hasOverflow()).toBe(false);
    expect(bar.value()).toBe(0);
    bar.attach(null, null);
  });

  test("a horizontal bar reads the other axis", () => {
    const bar = scrollbar({ orientation: "horizontal" });
    const box = overflowing("horizontal", { size: 100, content: 400 });
    bar.attach(box.element, track("horizontal", 100));
    flush();
    expect(bar.thumbSize()).toBe(25);
    box.scroll(300);
    flush();
    expect(bar.thumbOffset()).toBe(75);
    bar.attach(null, null);
  });

  test("pressing the track brings the thumb's middle to the pointer", () => {
    const bar = scrollbar();
    const box = overflowing("vertical", { size: 200, content: 1000 });
    const rail = track("vertical", 200);
    bar.attach(box.element, rail);
    flush();

    bar.trackProps.onPointerDown(pointer("pointerdown", 100, rail));
    expect(box.element.scrollTop).toBe(400);
    bar.trackProps.onPointerUp(pointer("pointerup", 100, rail));
    bar.attach(null, null);
  });

  test("dragging the thumb keeps the point that was grabbed under the pointer", () => {
    const bar = scrollbar();
    const box = overflowing("vertical", { size: 200, content: 1000 });
    const rail = track("vertical", 200);
    const thumb = rail.firstElementChild as HTMLElement;
    thumb.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 40 }) as DOMRect;
    bar.attach(box.element, rail);
    flush();

    // Grabbed 10px from the thumb's top, so nothing moves on the press itself.
    bar.thumbProps.onPointerDown(pointer("pointerdown", 10, thumb));
    bar.trackProps.onPointerDown(pointer("pointerdown", 10, thumb));
    expect(box.element.scrollTop).toBe(0);
    flush();
    expect(bar.isDragging()).toBe(true);

    bar.trackProps.onPointerMove(pointer("pointermove", 90, thumb));
    expect(box.element.scrollTop).toBe(400);

    bar.trackProps.onPointerUp(pointer("pointerup", 90, thumb));
    flush();
    expect(bar.isDragging()).toBe(false);
    bar.trackProps.onPointerMove(pointer("pointermove", 170, thumb));
    expect(box.element.scrollTop).toBe(400);
    bar.attach(null, null);
  });

  test("only the primary button drags", () => {
    const bar = scrollbar();
    const box = overflowing("vertical", { size: 200, content: 1000 });
    const rail = track("vertical", 200);
    bar.attach(box.element, rail);
    flush();
    const secondary = new PointerEvent("pointerdown", { clientY: 100, button: 2, bubbles: true });
    bar.trackProps.onPointerDown(secondary);
    expect(box.element.scrollTop).toBe(0);
    bar.attach(null, null);
  });

  test("right to left, a horizontal bar starts at the far end and drags the other way", () => {
    const bar = scrollbar({ orientation: "horizontal", direction: "rtl" });
    const box = overflowing("horizontal", { size: 200, content: 1000 });
    const rail = track("horizontal", 200);
    bar.attach(box.element, rail);
    flush();
    expect(bar.thumbOffset()).toBe(160);
    expect(bar.value()).toBe(0);

    bar.trackProps.onPointerDown(pointer("pointerdown", 20, rail));
    expect(box.element.scrollLeft).toBe(-800);
    bar.trackProps.onPointerUp(pointer("pointerup", 20, rail));
    box.scroll(-800);
    flush();
    expect(bar.value()).toBe(100);
    bar.attach(null, null);
  });

  describe("when it shows", () => {
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    /** Waits for it rather than for a length of time, which a busy machine stretches. */
    const gone = async (bar: { isVisible: () => boolean }): Promise<void> => {
      for (let tries = 0; tries < 200 && bar.isVisible(); tries++) {
        await wait(10);
        flush();
      }
    };

    test("auto: whenever there is something to scroll", () => {
      const bar = scrollbar({ type: "auto" });
      bar.attach(
        overflowing("vertical", { size: 200, content: 1000 }).element,
        track("vertical", 200),
      );
      flush();
      expect(bar.isVisible()).toBe(true);
      bar.attach(null, null);

      const fits = scrollbar({ type: "auto" });
      fits.attach(
        overflowing("vertical", { size: 200, content: 200 }).element,
        track("vertical", 200),
      );
      flush();
      expect(fits.isVisible()).toBe(false);
      fits.attach(null, null);
    });

    test("always: even with nothing to scroll", () => {
      const bar = scrollbar({ type: "always" });
      bar.attach(
        overflowing("vertical", { size: 200, content: 200 }).element,
        track("vertical", 200),
      );
      flush();
      expect(bar.isVisible()).toBe(true);
      bar.attach(null, null);
    });

    test("hover, the default: while the pointer is over the area, and a moment after", async () => {
      const bar = scrollbar({ hideDelay: 20 });
      bar.attach(
        overflowing("vertical", { size: 200, content: 1000 }).element,
        track("vertical", 200),
      );
      flush();
      expect(bar.isVisible()).toBe(false);

      bar.hoverStart();
      flush();
      expect(bar.isVisible()).toBe(true);

      bar.hoverEnd();
      flush();
      expect(bar.isVisible()).toBe(true);
      await gone(bar);
      expect(bar.isVisible()).toBe(false);
      bar.attach(null, null);
    });

    test("hover: coming back before the delay runs out keeps it", async () => {
      const bar = scrollbar({ hideDelay: 30 });
      bar.attach(
        overflowing("vertical", { size: 200, content: 1000 }).element,
        track("vertical", 200),
      );
      bar.hoverStart();
      bar.hoverEnd();
      bar.hoverStart();
      await wait(50);
      flush();
      expect(bar.isVisible()).toBe(true);
      bar.attach(null, null);
    });

    test("hover: content that fits shows nothing to hover for", () => {
      const bar = scrollbar();
      bar.attach(
        overflowing("vertical", { size: 200, content: 200 }).element,
        track("vertical", 200),
      );
      bar.hoverStart();
      flush();
      expect(bar.isVisible()).toBe(false);
      bar.attach(null, null);
    });

    test("scroll: while it is moving, and it goes once it has been still", async () => {
      const bar = scrollbar({ type: "scroll", hideDelay: 20 });
      const box = overflowing("vertical", { size: 200, content: 1000 });
      bar.attach(box.element, track("vertical", 200));
      flush();
      expect(bar.isVisible()).toBe(false);

      box.scroll(100);
      flush();
      expect(bar.isVisible()).toBe(true);

      // 100ms without an event is what counts as having stopped.
      await gone(bar);
      expect(bar.isVisible()).toBe(false);
      bar.attach(null, null);
    });

    test("scroll: a drag in progress keeps it, however long the pointer rests", async () => {
      const bar = scrollbar({ type: "scroll", hideDelay: 10 });
      const box = overflowing("vertical", { size: 200, content: 1000 });
      const rail = track("vertical", 200);
      bar.attach(box.element, rail);
      flush();
      bar.trackProps.onPointerDown(pointer("pointerdown", 100, rail));
      box.element.dispatchEvent(new Event("scroll"));
      await wait(100 + 10 + 40);
      flush();
      expect(bar.isVisible()).toBe(true);
      bar.trackProps.onPointerUp(pointer("pointerup", 100, rail));
      await gone(bar);
      expect(bar.isVisible()).toBe(false);
      bar.attach(null, null);
    });
  });

  test("detaching stops listening", () => {
    const bar = scrollbar();
    const box = overflowing("vertical", { size: 200, content: 1000 });
    bar.attach(box.element, track("vertical", 200));
    flush();
    bar.attach(null, null);
    box.scroll(400);
    flush();
    expect(bar.thumbOffset()).toBe(0);
  });
});

/**
 * A transcript with real geometry: rows of declared heights stacked in a
 * column, a viewport that clamps like a browser's, and rects that move as it
 * scrolls. happy-dom lays nothing out, and every decision below is geometric.
 */
function transcript(height: number) {
  const view = document.createElement("div");
  const content = document.createElement("div");
  const spacer = document.createElement("div");
  spacer.hidden = true;
  content.append(spacer);
  view.append(content);
  document.body.append(view);

  const heights = new Map<Element, number>();
  let top = 0;
  const rows = (): Element[] => [...content.children].filter((child) => child !== spacer);
  const room = (): number => (spacer.hidden ? 0 : Number.parseFloat(spacer.style.height || "0"));
  const total = (): number =>
    rows().reduce((sum, row) => sum + (heights.get(row) ?? 0), 0) + room();
  const most = (): number => Math.max(0, total() - height);

  Object.defineProperty(view, "clientHeight", { get: () => height });
  Object.defineProperty(view, "scrollHeight", { get: () => Math.max(total(), height) });
  Object.defineProperty(view, "scrollTop", {
    get: () => Math.min(top, most()),
    set: (next: number) => {
      top = Math.min(Math.max(0, next), most());
    },
  });
  Object.defineProperty(view, "scrollTo", {
    value: (to: { top: number }) => {
      view.scrollTop = to.top;
      view.dispatchEvent(new Event("scroll"));
    },
  });
  view.getBoundingClientRect = () => ({ top: 0, bottom: height, height }) as DOMRect;

  const row = (id: string, size: number, anchor = false): HTMLElement => {
    const element = document.createElement("div");
    element.dataset.messageId = id;
    element.dataset.scrollAnchor = anchor ? "true" : "false";
    heights.set(element, size);
    element.getBoundingClientRect = () => {
      let offset = 0;
      for (const each of rows()) {
        if (each === element) break;
        offset += heights.get(each) ?? 0;
      }
      const y = offset - view.scrollTop;
      const tall = heights.get(element) ?? 0;
      return { top: y, bottom: y + tall, height: tall } as DOMRect;
    };
    return element;
  };

  return {
    view,
    content,
    spacer,
    row,
    /** Adds at the end, before the spacer, which is where a message goes. */
    append(...elements: HTMLElement[]): void {
      spacer.before(...elements);
    },
    prepend(...elements: HTMLElement[]): void {
      content.prepend(...elements);
    },
    resize(element: HTMLElement, size: number): void {
      heights.set(element, size);
    },
    /** The person scrolling: the position and then the event. */
    scroll(to: number): void {
      view.scrollTop = to;
      view.dispatchEvent(new Event("scroll"));
    },
    remove(): void {
      view.remove();
    },
  };
}

/** Long enough for the mutation observer, and for a frame after it. */
const settled = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  flush();
};

function wired(
  height: number,
  options: Parameters<typeof messageScroller>[0] = {},
): ReturnType<typeof transcript> & { scroller: ReturnType<typeof messageScroller> } {
  const model = transcript(height);
  const scroller = messageScroller(options);
  scroller.attachContent(model.content);
  scroller.attachSpacer(model.spacer);
  const add = model.row;
  return {
    ...model,
    scroller,
    row(id, size, anchor) {
      const element = add(id, size, anchor);
      scroller.register(id, element);
      return element;
    },
  };
}

describe("messageScroller: where it opens", () => {
  test("at the end when told to, as soon as it has rows", () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    expect(t.scroller.isPending()).toBe(true);
    t.scroller.attach(t.view);
    flush();
    expect(t.view.scrollTop).toBe(140);
    expect(t.scroller.isPending()).toBe(false);
    t.scroller.attach(null);
    t.remove();
  });

  test("at the start when told to, and nothing waits for that", () => {
    const t = wired(100, { defaultScrollPosition: "start" });
    t.append(t.row("m1", 80), t.row("m2", 80));
    expect(t.scroller.isPending()).toBe(false);
    t.scroller.attach(t.view);
    flush();
    expect(t.view.scrollTop).toBe(0);
    t.scroller.attach(null);
    t.remove();
  });

  test("an empty transcript has nowhere to open at, so nothing is held back", () => {
    const t = wired(100, { defaultScrollPosition: "end" });
    t.scroller.attach(t.view);
    flush();
    expect(t.scroller.isPending()).toBe(false);
    t.scroller.attach(null);
    t.remove();
  });

  test("rows that arrive later are where it opens", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    t.scroller.attach(t.view);
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    await settled();
    expect(t.view.scrollTop).toBe(140);
    t.scroller.attach(null);
    t.remove();
  });

  test("last-anchor opens on the last turn, with the one before it showing above", () => {
    const t = wired(100, { defaultScrollPosition: "last-anchor" });
    t.append(t.row("m1", 80), t.row("m2", 80, true), t.row("m3", 300));
    t.scroller.attach(t.view);
    flush();
    // The turn starts at 80, and 64px of what came before stays readable.
    expect(t.view.scrollTop).toBe(16);
    t.scroller.attach(null);
    t.remove();
  });

  test("last-anchor with a last turn that fits simply opens at the end", () => {
    const t = wired(200, { defaultScrollPosition: "last-anchor" });
    t.append(t.row("m1", 300), t.row("m2", 40, true), t.row("m3", 40));
    t.scroller.attach(t.view);
    flush();
    expect(t.view.scrollTop).toBe(180);
    t.scroller.attach(null);
    t.remove();
  });
});

describe("messageScroller: anchoring a new turn", () => {
  test("a new anchored row goes near the top, with the previous one peeking", async () => {
    const t = wired(200, { follow: false, defaultScrollPosition: "end" });
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    t.scroller.attach(t.view);
    expect(t.view.scrollTop).toBe(40);
    t.append(t.row("m4", 40, true));
    await settled();
    // 240 down, less the 64px peek. The rows end 96px short of filling the
    // viewport from there, so the spacer makes the room.
    expect(t.view.scrollTop).toBe(176);
    expect(t.spacer.hidden).toBe(false);
    expect(t.spacer.style.height).toBe("96px");
    t.scroller.attach(null);
    t.remove();
  });

  test("a row that is not an anchor is not moved to", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.append(t.row("m1", 80), t.row("m2", 80));
    t.scroller.attach(t.view);
    t.append(t.row("m3", 80));
    await settled();
    expect(t.view.scrollTop).toBe(0);
    t.scroller.attach(null);
    t.remove();
  });

  test("a placeholder replaced by an anchored row anchors it", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    const placeholder = t.row("placeholder", 80);
    t.append(t.row("m1", 80), placeholder);
    t.scroller.attach(t.view);
    expect(t.view.scrollTop).toBe(60);
    placeholder.replaceWith(t.row("m2", 40, true));
    await settled();
    expect(t.view.scrollTop).toBe(16);
    t.scroller.attach(null);
    t.remove();
  });

  test("an old anchor is not gone back to when some other row changes", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    const last = t.row("m3", 80);
    t.append(t.row("m1", 80, true), t.row("m2", 80), last);
    t.scroller.attach(t.view);
    expect(t.view.scrollTop).toBe(140);
    last.replaceWith(t.row("m3b", 80));
    await settled();
    expect(t.view.scrollTop).toBe(140);
    t.scroller.attach(null);
    t.remove();
  });

  test("the turn is held where it is while the reply below it grows", async () => {
    const t = wired(200, { follow: false, defaultScrollPosition: "end" });
    t.append(t.row("m1", 100), t.row("m2", 100), t.row("m3", 100));
    t.scroller.attach(t.view);
    const reply = t.row("reply", 10);
    t.append(t.row("question", 40, true), reply);
    await settled();
    expect(t.view.scrollTop).toBe(236);

    t.resize(reply, 60);
    reply.textContent = "a longer answer";
    await settled();
    expect(t.view.scrollTop).toBe(236);
    // The room made for it shrinks as the reply uses it.
    expect(t.spacer.style.height).toBe("36px");
    t.scroller.attach(null);
    t.remove();
  });

  test("once the reply has used up the room, following the end takes over", async () => {
    const t = wired(200, { defaultScrollPosition: "end" });
    t.append(t.row("m1", 100), t.row("m2", 100), t.row("m3", 100));
    t.scroller.attach(t.view);
    const reply = t.row("reply", 10);
    t.append(t.row("question", 40, true), reply);
    await settled();
    expect(t.view.scrollTop).toBe(236);

    t.resize(reply, 400);
    reply.textContent = "an answer longer than the viewport";
    await settled();
    expect(t.view.scrollTop).toBe(540);

    t.resize(reply, 500);
    reply.textContent = "and still going";
    await settled();
    expect(t.view.scrollTop).toBe(640);
    t.scroller.attach(null);
    t.remove();
  });

  test("a wheel lets go of the held turn, so growth below stops moving it", async () => {
    const t = wired(200, { follow: false, defaultScrollPosition: "end" });
    t.append(t.row("m1", 100), t.row("m2", 100), t.row("m3", 100));
    t.scroller.attach(t.view);
    const reply = t.row("reply", 10);
    t.append(t.row("question", 40, true), reply);
    await settled();

    t.scroller.intent();
    t.scroll(100);
    t.resize(reply, 300);
    reply.textContent = "longer";
    await settled();
    expect(t.view.scrollTop).toBe(100);
    t.scroller.attach(null);
    t.remove();
  });

  test("several turns arriving at once while following keep following the end", async () => {
    const t = wired(100, { defaultScrollPosition: "end" });
    t.append(t.row("m1", 80), t.row("m2", 80));
    t.scroller.attach(t.view);
    t.append(t.row("m3", 80, true), t.row("m4", 80), t.row("m5", 80, true), t.row("m6", 80));
    await settled();
    expect(t.view.scrollTop).toBe(380);
    t.scroller.attach(null);
    t.remove();
  });

  test("room made for a turn is not somewhere to scroll to", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    t.scroller.attach(t.view);
    t.append(t.row("m4", 40, true));
    await settled();
    // The rows end where the viewport does; only the spacer is below.
    expect(t.scroller.scrollable()).toEqual({ start: true, end: false });
    t.scroller.attach(null);
    t.remove();
  });
});

describe("messageScroller: going to a message", () => {
  test("it lines the row up with the top, and following does not take it back", async () => {
    const t = wired(100, { defaultScrollPosition: "end" });
    const last = t.row("m3", 80);
    t.append(t.row("m1", 80), t.row("m2", 80), last);
    t.scroller.attach(t.view);
    expect(t.scroller.scrollToMessage("m2")).toBe(true);
    expect(t.view.scrollTop).toBe(80);

    t.resize(last, 120);
    last.textContent = "grew";
    await settled();
    expect(t.view.scrollTop).toBe(80);
    t.scroller.attach(null);
    t.remove();
  });

  test("the person scrolling back to the end afterwards is followed again", async () => {
    const t = wired(100, { defaultScrollPosition: "end" });
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    t.scroller.attach(t.view);
    t.scroller.scrollToMessage("m1");
    expect(t.view.scrollTop).toBe(0);

    t.scroller.intent();
    t.scroll(140);
    t.append(t.row("m4", 80));
    await settled();
    expect(t.view.scrollTop).toBe(220);
    t.scroller.attach(null);
    t.remove();
  });

  test("the alignment says which edge the row meets", () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.append(t.row("m1", 80), t.row("m2", 40), t.row("m3", 80), t.row("m4", 80));
    t.scroller.attach(t.view);
    t.scroller.scrollToMessage("m2", { align: "start" });
    expect(t.view.scrollTop).toBe(80);
    t.scroller.scrollToMessage("m2", { align: "center" });
    expect(t.view.scrollTop).toBe(50);
    t.scroller.scrollToMessage("m2", { align: "end" });
    expect(t.view.scrollTop).toBe(20);
    // Already wholly on screen, so the nearest edge is where it is.
    t.scroller.scrollToMessage("m2", { align: "nearest" });
    expect(t.view.scrollTop).toBe(20);
    t.scroller.scrollToMessage("m4", { align: "nearest" });
    expect(t.view.scrollTop).toBe(180);
    t.scroller.attach(null);
    t.remove();
  });

  test("a margin keeps the row that far from the edge", () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start", scrollMargin: 10 });
    t.append(t.row("m1", 80), t.row("m2", 40), t.row("m3", 80), t.row("m4", 80));
    t.scroller.attach(t.view);
    t.scroller.scrollToMessage("m2");
    expect(t.view.scrollTop).toBe(70);
    t.scroller.scrollToMessage("m2", { scrollMargin: 30 });
    expect(t.view.scrollTop).toBe(50);
    t.scroller.attach(null);
    t.remove();
  });

  test("an id nothing has registered answers false", () => {
    const t = wired(100, { follow: false });
    t.append(t.row("m1", 80));
    t.scroller.attach(t.view);
    expect(t.scroller.scrollToMessage("nobody")).toBe(false);
    t.scroller.attach(null);
    t.remove();
  });

  test("asked before any row exists, it goes there when the row arrives, and that is the opening", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "end" });
    t.scroller.attach(t.view);
    expect(t.scroller.scrollToMessage("m2")).toBe(true);
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    await settled();
    expect(t.view.scrollTop).toBe(80);
    t.scroller.attach(null);
    t.remove();
  });

  test("an unregistered row is forgotten, but only by the element that left", () => {
    const t = wired(100, { follow: false });
    const first = t.row("dup", 80);
    const second = t.row("dup", 80);
    t.append(first, second);
    t.scroller.attach(t.view);
    // A keyed list mounts the replacement before the old row goes.
    t.scroller.register("dup", null, first);
    expect(t.scroller.scrollToMessage("dup")).toBe(true);
    t.scroller.register("dup", null, second);
    expect(t.scroller.scrollToMessage("dup")).toBe(false);
    t.scroller.attach(null);
    t.remove();
  });

  test("scrollToEnd and scrollToStart answer false until there is a viewport", () => {
    const scroller = messageScroller();
    expect(scroller.scrollToEnd()).toBe(false);
    expect(scroller.scrollToStart()).toBe(false);
    const t = wired(100, { follow: false });
    t.append(t.row("m1", 80), t.row("m2", 80));
    t.scroller.attach(t.view);
    expect(t.scroller.scrollToEnd()).toBe(true);
    expect(t.view.scrollTop).toBe(60);
    expect(t.scroller.scrollToStart()).toBe(true);
    expect(t.view.scrollTop).toBe(0);
    t.scroller.attach(null);
    t.remove();
  });
});

describe("messageScroller: older rows arriving above", () => {
  test("the row being read stays where it is", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.append(t.row("m3", 80), t.row("m4", 80), t.row("m5", 80));
    t.scroller.attach(t.view);
    t.scroll(40);
    t.prepend(t.row("m1", 80), t.row("m2", 80));
    await settled();
    expect(t.view.scrollTop).toBe(200);
    t.scroller.attach(null);
    t.remove();
  });

  test("unless that was turned off", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.scroller.preserveOnPrepend(false);
    t.append(t.row("m3", 80), t.row("m4", 80), t.row("m5", 80));
    t.scroller.attach(t.view);
    t.scroll(40);
    t.prepend(t.row("m1", 80), t.row("m2", 80));
    await settled();
    expect(t.view.scrollTop).toBe(40);
    t.scroller.attach(null);
    t.remove();
  });
});

describe("messageScroller: which ways there is somewhere to go", () => {
  test("both edges are reported, and the object is the same one until an edge changes", () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.append(t.row("m1", 80), t.row("m2", 80), t.row("m3", 80));
    t.scroller.attach(t.view);
    flush();
    expect(t.scroller.scrollable()).toEqual({ start: false, end: true });

    t.scroll(60);
    flush();
    const middle = t.scroller.scrollable();
    expect(middle).toEqual({ start: true, end: true });
    t.scroll(70);
    flush();
    expect(t.scroller.scrollable()).toBe(middle);

    t.scroll(140);
    flush();
    expect(t.scroller.scrollable()).toEqual({ start: true, end: false });
    t.scroller.attach(null);
    t.remove();
  });
});

describe("messageScroller: what is on screen", () => {
  const real = globalThis.IntersectionObserver;

  test("nothing is computed until somebody is watching", async () => {
    const t = wired(100, { follow: false, defaultScrollPosition: "start" });
    t.append(t.row("m1", 80, true), t.row("m2", 80));
    t.scroller.attach(t.view);
    await settled();
    expect(t.scroller.visibility()).toEqual({ currentAnchorId: null, visibleMessageIds: [] });
    t.scroller.attach(null);
    t.remove();
  });

  test("by layout where there is no intersection observer", async () => {
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    try {
      const t = wired(200, { follow: false, defaultScrollPosition: "start" });
      t.append(t.row("m1", 80, true), t.row("m2", 80), t.row("m3", 80, true), t.row("m4", 300));
      t.scroller.attach(t.view);
      const stop = t.scroller.watchVisibility();
      await settled();
      // The reading line is 64px down: m1 crosses it, m4 starts below the fold.
      expect(t.scroller.visibility()).toEqual({
        currentAnchorId: "m1",
        visibleMessageIds: ["m1", "m2", "m3"],
      });

      t.scroll(120);
      await settled();
      // m3 has reached the line and is the turn being read; m1 is above it.
      expect(t.scroller.visibility()).toEqual({
        currentAnchorId: "m3",
        visibleMessageIds: ["m3", "m4"],
      });

      stop();
      flush();
      expect(t.scroller.visibility()).toEqual({ currentAnchorId: null, visibleMessageIds: [] });
      t.scroller.attach(null);
      t.remove();
    } finally {
      globalThis.IntersectionObserver = real;
    }
  });

  test("by the observer where there is one, with the top edge moved to the reading line", async () => {
    const made: {
      options: IntersectionObserverInit | undefined;
      observed: Set<Element>;
      report: (entries: { target: Element; isIntersecting: boolean }[]) => void;
      disconnected: boolean;
    }[] = [];
    class Fake {
      readonly record;
      constructor(
        callback: (entries: { target: Element; isIntersecting: boolean }[]) => void,
        options?: IntersectionObserverInit,
      ) {
        this.record = {
          options,
          observed: new Set<Element>(),
          report: callback,
          disconnected: false,
        };
        made.push(this.record);
      }
      observe(element: Element): void {
        this.record.observed.add(element);
      }
      unobserve(element: Element): void {
        this.record.observed.delete(element);
      }
      disconnect(): void {
        this.record.disconnected = true;
      }
    }
    Object.defineProperty(globalThis, "IntersectionObserver", { value: Fake, configurable: true });
    try {
      const t = wired(200, { follow: false, defaultScrollPosition: "start", scrollMargin: 6 });
      const first = t.row("m1", 80, true);
      const second = t.row("m2", 80);
      t.append(first, second);
      t.scroller.attach(t.view);
      const stop = t.scroller.watchVisibility();
      expect(made).toHaveLength(1);
      expect(made[0]?.options?.root).toBe(t.view);
      expect(made[0]?.options?.rootMargin).toBe("-70px 0px 0px 0px");
      expect([...(made[0]?.observed ?? [])]).toEqual([first, second]);

      made[0]?.report([
        { target: first, isIntersecting: true },
        { target: second, isIntersecting: false },
      ]);
      await settled();
      expect(t.scroller.visibility()).toEqual({
        currentAnchorId: "m1",
        visibleMessageIds: ["m1"],
      });

      // A row that mounts while watching is observed too.
      const third = t.row("m3", 80);
      t.append(third);
      expect(made[0]?.observed.has(third)).toBe(true);

      stop();
      expect(made[0]?.disconnected).toBe(true);
      t.scroller.attach(null);
      t.remove();
    } finally {
      Object.defineProperty(globalThis, "IntersectionObserver", {
        value: real,
        configurable: true,
      });
    }
  });
});
