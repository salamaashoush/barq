import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { bounds, elementSize, visible, windowSize } from "./element.ts";

let emitResize: (entries: unknown[]) => void = () => {};
let emitIntersection: (entries: unknown[]) => void = () => {};
const realResize = globalThis.ResizeObserver;
const realIntersection = globalThis.IntersectionObserver;

function fake(sink: (emit: (entries: never[]) => void) => void) {
  return class {
    targets = new Set<Element>();
    disconnected = false;
    constructor(callback: (entries: never[]) => void) {
      sink((entries) => {
        if (this.disconnected) return;
        callback(entries.filter((e: { target: Element }) => this.targets.has(e.target)));
      });
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.disconnected = true;
      this.targets.clear();
    }
  };
}

beforeEach(() => {
  const resizeEmitters: ((entries: never[]) => void)[] = [];
  const intersectionEmitters: ((entries: never[]) => void)[] = [];
  emitResize = (entries) => {
    for (const emit of resizeEmitters) emit(entries as never[]);
  };
  emitIntersection = (entries) => {
    for (const emit of intersectionEmitters) emit(entries as never[]);
  };
  globalThis.ResizeObserver = fake((emit) => {
    resizeEmitters.push(emit);
  }) as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = fake((emit) =>
    intersectionEmitters.push(emit),
  ) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = realResize;
  globalThis.IntersectionObserver = realIntersection;
});

const el = () => document.createElement("div");

describe("elementSize", () => {
  test("reads the content box and keeps the two axes independent", () => {
    const target = el();
    const dispose = root((d) => {
      const size = elementSize(target);
      expect(size.width()).toBe(0);

      emitResize([
        {
          target,
          contentRect: { width: 100, height: 50 },
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
        },
      ]);
      expect(size.width()).toBe(100);
      expect(size.height()).toBe(50);
      return d;
    });
    dispose();
  });

  test("falls back to contentRect when the box arrays are missing", () => {
    const target = el();
    const dispose = root((d) => {
      const size = elementSize(target);
      emitResize([{ target, contentRect: { width: 7, height: 9 } }]);
      expect(size.width()).toBe(7);
      expect(size.height()).toBe(9);
      return d;
    });
    dispose();
  });
});

describe("bounds", () => {
  test("measures on creation and on demand", () => {
    const target = el();
    target.getBoundingClientRect = () =>
      ({ x: 1, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1 }) as DOMRect;

    const dispose = root((d) => {
      const rect = bounds(target);
      expect(rect.x()).toBe(1);
      expect(rect.width()).toBe(3);
      expect(rect.bottom()).toBe(6);

      target.getBoundingClientRect = () =>
        ({ x: 10, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1 }) as DOMRect;
      rect.measure();
      expect(rect.x()).toBe(10);
      return d;
    });
    dispose();
  });

  test("re-measures on scroll", () => {
    const target = el();
    let x = 0;
    target.getBoundingClientRect = () =>
      ({ x, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 }) as DOMRect;

    const dispose = root((d) => {
      const rect = bounds(target);
      x = 42;
      window.dispatchEvent(new Event("scroll"));
      expect(rect.x()).toBe(42);
      return d;
    });
    dispose();
  });
});

describe("visible", () => {
  test("tracks intersection", () => {
    const target = el();
    const dispose = root((d) => {
      const showing = visible(target);
      expect(showing()).toBe(false);
      emitIntersection([{ target, isIntersecting: true }]);
      expect(showing()).toBe(true);
      emitIntersection([{ target, isIntersecting: false }]);
      expect(showing()).toBe(false);
      return d;
    });
    dispose();
  });

  test("once stops observing after the first sighting", () => {
    const target = el();
    const dispose = root((d) => {
      const showing = visible(target, { once: true });
      emitIntersection([{ target, isIntersecting: true }]);
      expect(showing()).toBe(true);
      emitIntersection([{ target, isIntersecting: false }]);
      expect(showing()).toBe(true);
      return d;
    });
    dispose();
  });
});

describe("windowSize", () => {
  test("shares one listener and updates on resize", async () => {
    const dispose = root((d) => {
      const a = windowSize();
      const b = windowSize();
      expect(a).toBe(b);
      expect(a.width()).toBe(window.innerWidth);
      return d;
    });
    dispose();
    await Promise.resolve();
  });
});
