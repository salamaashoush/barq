import { describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { activeElement, clickOutside, focusWithin, focused } from "./focus.ts";

const mount = <T extends HTMLElement>(el: T): T => {
  document.body.append(el);
  return el;
};

describe("activeElement", () => {
  test("follows focus", () => {
    const input = mount(document.createElement("input"));
    const dispose = root((d) => {
      const active = activeElement();
      input.focus();
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
      expect(active()).toBe(input);
      return d;
    });
    dispose();
    input.remove();
  });
});

describe("focused", () => {
  test("reports the element's own focus", () => {
    const input = mount(document.createElement("input"));
    const dispose = root((d) => {
      const has = focused(input);
      expect(has()).toBe(false);
      input.dispatchEvent(new Event("focus"));
      expect(has()).toBe(true);
      input.dispatchEvent(new Event("blur"));
      expect(has()).toBe(false);
      return d;
    });
    dispose();
    input.remove();
  });
});

describe("focusWithin", () => {
  test("stays true while focus moves between children", () => {
    const box = mount(document.createElement("div"));
    const first = document.createElement("input");
    const second = document.createElement("input");
    box.append(first, second);

    const dispose = root((d) => {
      const inside = focusWithin(box);
      expect(inside()).toBe(false);

      first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(inside()).toBe(true);

      first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: second }));
      expect(inside()).toBe(true);

      second.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      expect(inside()).toBe(false);
      return d;
    });
    dispose();
    box.remove();
  });
});

describe("clickOutside", () => {
  test("fires for a pointer outside and not for one inside", () => {
    const box = mount(document.createElement("div"));
    const child = document.createElement("span");
    box.append(child);
    const outside = mount(document.createElement("div"));

    let calls = 0;
    const dispose = root((d) => {
      clickOutside(box, () => calls++, { escape: false });
      return d;
    });

    child.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(calls).toBe(0);

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(calls).toBe(1);

    dispose();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(calls).toBe(1);
    box.remove();
    outside.remove();
  });

  test("ignores the elements it was told to", () => {
    const box = mount(document.createElement("div"));
    const trigger = mount(document.createElement("button"));
    let calls = 0;
    const dispose = root((d) => {
      clickOutside(box, () => calls++, { ignore: [trigger], escape: false });
      return d;
    });
    trigger.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(calls).toBe(0);
    dispose();
    box.remove();
    trigger.remove();
  });

  test("Escape dismisses unless turned off", () => {
    const box = mount(document.createElement("div"));
    let withEscape = 0;
    let without = 0;
    const dispose = root((d) => {
      clickOutside(box, () => withEscape++);
      clickOutside(box, () => without++, { escape: false });
      return d;
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(withEscape).toBe(1);
    expect(without).toBe(0);
    dispose();
    box.remove();
  });

  test("the returned function removes both listeners", () => {
    const box = mount(document.createElement("div"));
    const outside = mount(document.createElement("div"));
    let calls = 0;
    const clear = clickOutside(box, () => calls++);
    clear();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(calls).toBe(0);
    box.remove();
    outside.remove();
  });
});
