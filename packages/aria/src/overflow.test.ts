import { describe, expect, test } from "bun:test";
import { DEV, createRoot, flush } from "@barqjs/core";
import { ref } from "@barqjs/primitives/refs";

import { overflowItems, overflowingKeys } from "./overflow.ts";

const keys = ["one", "two", "three", "four"];

describe("overflowingKeys", () => {
  test("nothing goes while everything fits", () => {
    expect([...overflowingKeys({ keys, sizes: [50, 50, 50, 50], room: 200, menu: 0 })]).toEqual([]);
  });

  test("the trailing items go, leaving room for the menu button", () => {
    const hidden = overflowingKeys({ keys, sizes: [50, 50, 50, 50], room: 160, menu: 40 });
    expect([...hidden]).toEqual(["three", "four"]);
  });

  test("by priority, the lowest go first and the rest keep their order", () => {
    const priority: Record<string, number> = { one: 0, two: 0, three: 2, four: 1 };
    const hidden = overflowingKeys({
      keys,
      sizes: [50, 50, 50, 50],
      room: 150,
      menu: 50,
      priority: (key) => priority[String(key)] ?? 0,
    });
    expect([...hidden]).toEqual(["one", "two"]);
  });

  test("the kept item stays, wherever it is", () => {
    const hidden = overflowingKeys({
      keys,
      sizes: [50, 50, 50, 50],
      room: 150,
      menu: 50,
      keep: "four",
    });
    expect([...hidden]).toEqual(["two", "three"]);
  });

  test("all or nothing sends every item once one has to go", () => {
    const hidden = overflowingKeys({
      keys,
      sizes: [50, 50, 50, 50],
      room: 150,
      menu: 50,
      isAllOrNothing: true,
    });
    expect([...hidden]).toEqual(keys);
  });
});

describe("overflowItems", () => {
  test("a row too narrow for its items checks the menu button reading only what it tracks", () => {
    const sized = (width: number): HTMLElement => {
      const element = document.createElement("div");
      element.getBoundingClientRect = () => ({ width, height: 20 }) as DOMRect;
      return element;
    };
    const parent = document.createElement("div");
    const wrapper = sized(150);
    const group = document.createElement("div");
    group.append(...keys.map(() => sized(50)));
    const button = sized(40);
    wrapper.append(group, button);
    parent.appendChild(wrapper);
    document.body.appendChild(parent);

    const capture = DEV.diagnostics.capture();
    const { hidden, dispose } = createRoot((disposeRoot) => {
      const wrapperRef = ref<HTMLElement>();
      const groupRef = ref<HTMLElement>();
      const menuRef = ref<HTMLElement>();
      wrapperRef.set(wrapper);
      groupRef.set(group);
      menuRef.set(button);
      const result = overflowItems({
        wrapperRef,
        groupRef,
        menuRef,
        isCollapsing: () => true,
        orientation: () => "horizontal",
        keys: () => keys,
      });
      return { hidden: result.hidden, dispose: disposeRoot };
    });
    for (let pass = 0; pass < 4; pass++) flush();

    expect([...hidden()]).toEqual(["three", "four"]);
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
    dispose();
    parent.remove();
  });
});
