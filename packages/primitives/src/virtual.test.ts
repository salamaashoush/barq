import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { virtual } from "./virtual.ts";

/** A container whose scroll offset and measured size are ours to drive. */
function container(size = 400): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: size, configurable: true });
  el.scrollTo = () => {};
  return el;
}

const scrollTo = (el: HTMLElement, top: number) => {
  (el as unknown as { scrollTop: number }).scrollTop = top;
  el.dispatchEvent(new Event("scroll"));
};

describe("virtual, uniform rows", () => {
  test("renders a window with overscan and the full extent", () => {
    const el = container();
    const dispose = root((d) => {
      const list = virtual(el, { count: 1000, size: 20, overscan: 2 });
      // The viewport falls back to 600 until a ResizeObserver reports.
      expect(list.total()).toBe(20_000);
      const { start, end } = list.range();
      expect(start).toBe(0);
      expect(end).toBeGreaterThan(0);
      expect(end).toBeLessThan(1000);

      const items = list.items();
      expect(items).toHaveLength(end - start);
      expect(items[0]).toEqual({ index: 0, start: 0, size: 20 });
      expect(items[1]?.start).toBe(20);
      return d;
    });
    dispose();
  });

  test("the window follows the scroll", () => {
    const el = container();
    const dispose = root((d) => {
      const list = virtual(el, { count: 1000, size: 20, overscan: 0 });
      expect(list.range().start).toBe(0);

      scrollTo(el, 2000);
      flush();
      expect(list.range().start).toBe(100);
      expect(list.items()[0]?.start).toBe(2000);
      return d;
    });
    dispose();
  });

  test("an empty list renders nothing", () => {
    const el = container();
    const dispose = root((d) => {
      const list = virtual(el, { count: 0, size: 20 });
      expect(list.items()).toEqual([]);
      expect(list.range()).toEqual({ start: 0, end: 0 });
      expect(list.total()).toBe(0);
      return d;
    });
    dispose();
  });

  test("a reactive count re-windows", () => {
    const el = container();
    const count = signal(10);
    const dispose = root((d) => {
      const list = virtual(el, { count, size: 20, overscan: 0 });
      expect(list.total()).toBe(200);
      count.set(50);
      flush();
      expect(list.total()).toBe(1000);
      return d;
    });
    dispose();
  });
});

describe("virtual, ragged rows", () => {
  const sizes = (index: number) => (index % 2 === 0 ? 10 : 30);

  test("offsets come from the prefix sum", () => {
    const el = container();
    const dispose = root((d) => {
      const list = virtual(el, { count: 100, size: sizes, overscan: 0 });
      // 50 rows of 10 and 50 of 30.
      expect(list.total()).toBe(50 * 10 + 50 * 30);
      const items = list.items();
      expect(items[0]).toEqual({ index: 0, start: 0, size: 10 });
      expect(items[1]).toEqual({ index: 1, start: 10, size: 30 });
      expect(items[2]).toEqual({ index: 2, start: 40, size: 10 });
      return d;
    });
    dispose();
  });

  test("a scroll lands on the row whose extent covers the offset", () => {
    const el = container();
    const dispose = root((d) => {
      const list = virtual(el, { count: 100, size: sizes, overscan: 0 });
      // Each pair costs 40px, so 400px is exactly row 20.
      scrollTo(el, 400);
      flush();
      expect(list.range().start).toBe(20);
      expect(list.items()[0]?.start).toBe(400);

      // Mid-row: 405 is still inside row 20, which spans 400..410.
      scrollTo(el, 405);
      flush();
      expect(list.range().start).toBe(20);

      scrollTo(el, 410);
      flush();
      expect(list.range().start).toBe(21);
      return d;
    });
    dispose();
  });

  test("scrollTo asks for the row's own offset", () => {
    const el = container();
    const asked: unknown[] = [];
    el.scrollTo = (options?: ScrollToOptions | number) => asked.push(options);

    const dispose = root((d) => {
      const list = virtual(el, { count: 100, size: sizes });
      list.scrollTo(4, "smooth");
      return d;
    });
    // Two pairs of (10 + 30) before row 4.
    expect(asked).toEqual([{ top: 80, behavior: "smooth" }]);
    dispose();
  });
});
