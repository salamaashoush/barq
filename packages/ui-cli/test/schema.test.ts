import { describe, expect, test } from "bun:test";

import { DEFAULT_PATHS, parseConfig, parseIndex, parseItem } from "../src/schema.ts";

describe("parseItem", () => {
  const good = {
    name: "button",
    type: "registry:ui",
    title: "Button",
    dependencies: ["@barqjs/aria"],
    registryDependencies: ["slot"],
    files: [{ path: "ui/button.tsx", type: "registry:ui", content: "export const x = 1;" }],
  };

  test("accepts a well-formed item", () => {
    expect(parseItem(good).name).toBe("button");
  });

  test("fills in what is optional", () => {
    const item = parseItem({ name: "kbd", type: "registry:ui", files: [] });
    expect(item.title).toBe("kbd");
    expect(item.dependencies).toEqual([]);
    expect(item.registryDependencies).toEqual([]);
  });

  test("names the field that is wrong", () => {
    expect(() => parseItem({ ...good, type: "registry:page" })).toThrow(/type must be one of/);
    expect(() => parseItem({ ...good, name: 1 })).toThrow(/name must be a string/);
    expect(() => parseItem({ ...good, files: {} })).toThrow(/files must be an array/);
    expect(() => parseItem({ ...good, files: [{ path: "a" }] })).toThrow(/files\[0\]\.type/);
  });

  test("refuses something that is not an object", () => {
    expect(() => parseItem("button")).toThrow(/must be an object/);
    expect(() => parseItem(null)).toThrow(/must be an object/);
  });
});

describe("parseIndex", () => {
  test("reads the entries and their names", () => {
    const index = parseIndex({
      name: "@barqjs/ui",
      items: [{ name: "button", type: "registry:ui", files: ["ui/button.tsx"] }],
    });
    expect(index.items).toHaveLength(1);
    expect(index.items[0]?.files).toEqual(["ui/button.tsx"]);
  });
});

describe("parseConfig", () => {
  test("an empty object is a working default", () => {
    const config = parseConfig({});
    expect(config.registry).toBe("node_modules");
    expect(config.paths).toEqual(DEFAULT_PATHS);
    expect(config.theme.base).toBe("neutral");
    expect(config.reset).toBe(true);
    expect(config.items).toEqual({});
  });

  test("the recorded hashes survive a round trip", () => {
    const config = parseConfig({ items: { button: { "ui/button.tsx": "abc" } } });
    expect(config.items["button"]?.["ui/button.tsx"]).toBe("abc");
  });

  test("reset is opt-out, not opt-in", () => {
    expect(parseConfig({ reset: false }).reset).toBe(false);
    expect(parseConfig({ reset: true }).reset).toBe(true);
  });
});
