import { describe, expect, test } from "bun:test";
import { root, signal } from "@barqjs/core";
import { scrollPosition, windowScroll } from "./scroll.ts";

describe("windowScroll", () => {
  test("shares one source and follows the scroll event", () => {
    const dispose = root((d) => {
      const a = windowScroll();
      expect(a).toBe(windowScroll());

      Object.defineProperty(window, "scrollX", { value: 12, configurable: true });
      Object.defineProperty(window, "scrollY", { value: 34, configurable: true });
      window.dispatchEvent(new Event("scroll"));

      expect(a.x()).toBe(12);
      expect(a.y()).toBe(34);
      return d;
    });
    dispose();
  });
});

describe("scrollPosition", () => {
  test("reads the element at once and follows its scroll", () => {
    const box = document.createElement("div");
    Object.defineProperty(box, "scrollLeft", { value: 5, writable: true });
    Object.defineProperty(box, "scrollTop", { value: 7, writable: true });

    const dispose = root((d) => {
      const position = scrollPosition(box);
      expect(position.x()).toBe(5);
      expect(position.y()).toBe(7);

      (box as unknown as { scrollTop: number }).scrollTop = 99;
      box.dispatchEvent(new Event("scroll"));
      expect(position.y()).toBe(99);
      return d;
    });
    dispose();
  });

  test("waits for a target that arrives late", () => {
    const box = document.createElement("div");
    Object.defineProperty(box, "scrollLeft", { value: 0, writable: true });
    Object.defineProperty(box, "scrollTop", { value: 3, writable: true });
    const target = signal<HTMLDivElement | null>(null);

    const dispose = root((d) => {
      const position = scrollPosition(target);
      expect(position.y()).toBe(0);
      target.set(box);
      return [d, position] as const;
    });
    dispose[0]();
  });
});
