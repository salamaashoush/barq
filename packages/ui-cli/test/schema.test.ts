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
    expect(() => parseItem({ ...good, type: "registry:nonesuch" })).toThrow(/type must be one of/);
    expect(() => parseItem({ ...good, name: 1 })).toThrow(/name must be a string/);
    expect(() => parseItem({ ...good, files: {} })).toThrow(/files must be an array/);
    expect(() => parseItem({ ...good, files: [{ path: "a" }] })).toThrow(/files\[0\]\.type/);
  });

  test("refuses something that is not an object", () => {
    expect(() => parseItem("button")).toThrow(/must be an object/);
    expect(() => parseItem(null)).toThrow(/must be an object/);
  });

  test("a block is several files, each of its own type", () => {
    const item = parseItem({
      name: "dashboard-01",
      type: "registry:block",
      files: [
        { path: "blocks/dashboard-01/page.tsx", type: "registry:block", content: "" },
        { path: "hooks/use-rows.ts", type: "registry:hook", content: "" },
        { path: "components/chart.tsx", type: "registry:component", content: "" },
        { path: "examples/demo.tsx", type: "registry:example", content: "" },
      ],
    });
    expect(item.type).toBe("registry:block");
    expect(item.files.map((file) => file.type)).toEqual([
      "registry:block",
      "registry:hook",
      "registry:component",
      "registry:example",
    ]);
  });

  test("a page and a file say where they go, because no directory is theirs", () => {
    const page = { path: "app/login/page.tsx", type: "registry:page", content: "" };
    expect(() => parseItem({ ...good, files: [page] })).toThrow(/files\[0\]\.target is required/);
    expect(() => parseItem({ ...good, files: [{ ...page, type: "registry:file" }] })).toThrow(
      /files\[0\]\.target is required/,
    );

    const item = parseItem({ ...good, files: [{ ...page, target: "src/routes/login.tsx" }] });
    expect(item.files[0]?.target).toBe("src/routes/login.tsx");
  });

  test("what an item says about itself is carried", () => {
    const item = parseItem({
      ...good,
      devDependencies: ["@types/d3-shape"],
      categories: ["charts"],
      meta: { iframeHeight: "800px" },
      cssVars: { light: { brand: "red" }, dark: { brand: "blue" }, theme: { "font-heading": "x" } },
      css: { "@keyframes spin": { to: { rotate: "360deg" } } },
    });
    expect(item.devDependencies).toEqual(["@types/d3-shape"]);
    expect(item.categories).toEqual(["charts"]);
    expect(item.meta).toEqual({ iframeHeight: "800px" });
    expect(item.cssVars?.dark).toEqual({ brand: "blue" });
    expect(item.css).toEqual({ "@keyframes spin": { to: { rotate: "360deg" } } });
  });

  test("an item that says none of it has none of it", () => {
    const item = parseItem(good);
    expect(item.devDependencies).toEqual([]);
    expect(item.categories).toEqual([]);
    expect(item.meta).toBeUndefined();
    expect(item.cssVars).toBeUndefined();
    expect(item.css).toBeUndefined();
  });

  test("a token that is not text names itself", () => {
    expect(() => parseItem({ ...good, cssVars: { light: { brand: 1 } } })).toThrow(
      /cssVars\.light\.brand must be a string/,
    );
    expect(() => parseItem({ ...good, categories: "charts" })).toThrow(
      /categories must be an array/,
    );
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

  test("categories are what search reads, and default to none", () => {
    const index = parseIndex({
      items: [
        { name: "login-01", type: "registry:block", categories: ["authentication", "login"] },
        { name: "button", type: "registry:ui" },
      ],
    });
    expect(index.items[0]?.categories).toEqual(["authentication", "login"]);
    expect(index.items[1]?.categories).toEqual([]);
  });
});

describe("parseConfig", () => {
  test("an empty object is a working default", () => {
    const config = parseConfig({});
    expect(config.registry).toBeUndefined();
    expect(config.paths).toEqual(DEFAULT_PATHS);
    expect(config.theme.base).toBe("neutral");
    expect(config.reset).toBe(true);
    expect(config.items).toEqual({});
  });

  test("a registry is a pattern with {name} in it", () => {
    expect(parseConfig({ registry: "https://example.com/r/{name}.json" }).registry).toBe(
      "https://example.com/r/{name}.json",
    );
    expect(() => parseConfig({ registry: "https://example.com/r" })).toThrow(
      "components.json.registry must contain {name}",
    );
  });

  test("the recorded hashes survive a round trip", () => {
    const config = parseConfig({ items: { button: { "ui/button.tsx": "abc" } } });
    expect(config.items["button"]?.["ui/button.tsx"]).toBe("abc");
  });

  test("reset is opt-out, not opt-in", () => {
    expect(parseConfig({ reset: false }).reset).toBe(false);
    expect(parseConfig({ reset: true }).reset).toBe(true);
  });

  test("components and hooks follow where ui was put", () => {
    const moved = parseConfig({ paths: { ui: "app/widgets/ui" } });
    expect(moved.paths.components).toBe("app/widgets");
    expect(moved.paths.hooks).toBe("app/hooks");

    const flat = parseConfig({ paths: { ui: "components" } });
    expect(flat.paths.components).toBe("components");
    expect(flat.paths.hooks).toBe("hooks");

    const said = parseConfig({ paths: { ui: "app/ui", components: "app/parts", hooks: "app/h" } });
    expect(said.paths.components).toBe("app/parts");
    expect(said.paths.hooks).toBe("app/h");
  });

  test("a registry is named by a scope, as a pattern or with headers", () => {
    const config = parseConfig({
      registries: {
        "@acme": "https://acme.example.com/r/{name}.json",
        "@private": {
          url: "https://registry.example.com/{name}.json",
          headers: { Authorization: "Bearer ${API_TOKEN}" },
        },
      },
    });
    expect(config.registries["@acme"]).toEqual({
      url: "https://acme.example.com/r/{name}.json",
      headers: {},
    });
    expect(config.registries["@private"]?.headers).toEqual({
      Authorization: "Bearer ${API_TOKEN}",
    });
    expect(parseConfig({}).registries).toEqual({});
  });

  test("a registry that could not address an item is refused", () => {
    expect(() => parseConfig({ registries: { acme: "https://example.com/{name}.json" } })).toThrow(
      /"acme" must be a scope, like @acme/,
    );
    expect(() => parseConfig({ registries: { "@acme": "https://example.com/r.json" } })).toThrow(
      /registries\.@acme must contain \{name\}/,
    );
  });

  test("what items added to the theme survives a round trip", () => {
    const config = parseConfig({
      theme: {
        base: "zinc",
        cssVars: { light: { brand: "red" } },
        css: { ".x": { color: "red" } },
      },
    });
    expect(config.theme.cssVars).toEqual({ light: { brand: "red" } });
    expect(config.theme.css).toEqual({ ".x": { color: "red" } });
  });
});
