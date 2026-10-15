import { describe, expect, test } from "bun:test";

import { parseConfig } from "../src/schema.ts";
import { themeModule, withItemCss, type ThemeDefinition } from "../src/theme.ts";

const THEMES: readonly ThemeDefinition[] = [
  {
    name: "neutral",
    title: "Neutral",
    kind: "base",
    light: { background: "white", radius: "0.625rem" },
    dark: { background: "black" },
  },
];

const OPTIONS = { reset: false, base: "./base.ts", resetPath: "./reset.ts" };

const choice = parseConfig({}).theme;

describe("what an item adds to the theme", () => {
  test("its tokens join the mode they were declared for", () => {
    const theme = withItemCss(choice, {
      cssVars: { light: { brand: "red" }, dark: { brand: "blue" } },
    });
    const module_ = themeModule(theme, THEMES, OPTIONS);
    expect(module_).toContain(
      "    --background: white;\n    --radius: 0.625rem;\n    --brand: red;",
    );
    expect(module_).toContain("    --background: black;\n    --brand: blue;");
  });

  test("a `theme` token is on the root in either mode", () => {
    const theme = withItemCss(choice, { cssVars: { theme: { "font-heading": "Geist" } } });
    const module_ = themeModule(theme, THEMES, OPTIONS);
    expect(module_.match(/--font-heading: Geist;/g)).toHaveLength(1);
    expect(module_.indexOf("--font-heading")).toBeLessThan(module_.indexOf(".dark"));
  });

  test("a token written with its dashes is the same token", () => {
    const theme = withItemCss(choice, { cssVars: { light: { "--brand": "red" } } });
    expect(theme.cssVars?.light).toEqual({ brand: "red" });
    expect(themeModule(theme, THEMES, OPTIONS)).not.toContain("----brand");
  });

  test("an item's token overrides the base's, which is why it declared it", () => {
    const theme = withItemCss(choice, { cssVars: { light: { background: "ivory" } } });
    const module_ = themeModule(theme, THEMES, OPTIONS);
    expect(module_).toContain("--background: ivory;");
    expect(module_).not.toContain("--background: white;");
  });

  test("a second item adds to the first rather than replacing it", () => {
    const first = withItemCss(choice, { cssVars: { light: { brand: "red", edge: "1px" } } });
    const second = withItemCss(first, { cssVars: { light: { brand: "green" }, dark: { x: "1" } } });
    expect(second.cssVars).toEqual({ light: { brand: "green", edge: "1px" }, dark: { x: "1" } });
  });

  test("rules are written nested, in the theme's own layer", () => {
    const theme = withItemCss(choice, {
      css: {
        "@keyframes spin": { to: { rotate: "360deg" } },
        ".prose h1": { "font-size": "2rem" },
      },
    });
    const module_ = themeModule(theme, THEMES, OPTIONS);
    expect(module_).toContain(
      "@layer barq.theme {\n  @keyframes spin {\n    to {\n      rotate: 360deg;\n    }\n  }\n  .prose h1 {\n    font-size: 2rem;\n  }\n}",
    );
  });

  test("two items' rules for one selector are merged, declaration by declaration", () => {
    const first = withItemCss(choice, { css: { ".x": { color: "red", margin: "0" } } });
    const second = withItemCss(first, { css: { ".x": { color: "blue" } } });
    expect(second.css).toEqual({ ".x": { color: "blue", margin: "0" } });
  });

  test("an item with neither leaves the choice exactly as it was", () => {
    expect(withItemCss(choice, {})).toEqual(choice);
    expect(themeModule(choice, THEMES, OPTIONS)).not.toContain("--brand");
  });
});
