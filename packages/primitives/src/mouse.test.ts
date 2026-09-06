import { describe, expect, test } from "bun:test";
import { flush, root } from "@barqjs/core";
import { mouseInElement, mousePosition } from "./mouse.ts";

const pointer = (type: string, init: Record<string, number>) =>
  Object.assign(new Event(type, { bubbles: true }), init);

describe("mousePosition", () => {
  test("follows pointer movement and shares one source", () => {
    const dispose = root((d) => {
      const a = mousePosition();
      const b = mousePosition();
      expect(a).toBe(b);
      expect(a.isInside()).toBe(false);

      window.dispatchEvent(
        pointer("pointermove", { pageX: 10, pageY: 20, clientX: 5, clientY: 6 }),
      );
      flush();
      expect(a.x()).toBe(10);
      expect(a.y()).toBe(20);
      expect(a.clientX()).toBe(5);
      expect(a.isInside()).toBe(true);

      document.dispatchEvent(pointer("pointerleave", {}));
      flush();
      expect(a.isInside()).toBe(false);
      return d;
    });
    dispose();
  });
});

describe("mouseInElement", () => {
  test("reports a position relative to the element", () => {
    const box = document.createElement("div");
    document.body.append(box);
    box.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;

    const dispose = root((d) => {
      const position = mouseInElement(box);
      box.dispatchEvent(pointer("pointerenter", {}));
      flush();
      expect(position.isInside()).toBe(true);

      box.dispatchEvent(pointer("pointermove", { clientX: 130, clientY: 70 }));
      flush();
      expect(position.x()).toBe(30);
      expect(position.y()).toBe(20);

      box.dispatchEvent(pointer("pointerleave", {}));
      flush();
      expect(position.isInside()).toBe(false);
      // The last position is kept, so an animation back to rest has a start.
      expect(position.x()).toBe(30);
      return d;
    });
    dispose();
    box.remove();
  });
});
