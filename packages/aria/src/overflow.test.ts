import { describe, expect, test } from "bun:test";

import { overflowingKeys } from "./overflow.ts";

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
