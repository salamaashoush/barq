import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";

import { installTheme, themeCss } from "./install.ts";
import { ACCENT_THEMES, BASE_THEMES, findTheme, THEMES } from "./themes.ts";
import { tokens } from "./tokens.ts";

describe("themes", () => {
  test("every theme shadcn ships is here, split by what it declares", () => {
    expect(BASE_THEMES).toHaveLength(7);
    expect(ACCENT_THEMES).toHaveLength(17);
    expect(THEMES).toHaveLength(24);
    expect(BASE_THEMES.map((entry) => entry.name)).toContain("neutral");
    expect(ACCENT_THEMES.map((entry) => entry.name)).toContain("blue");
  });

  test("a base declares every token the components read, in both modes", () => {
    const needed = Object.values(tokens).map((reference) => reference.slice(4, -1).slice(2));
    for (const theme of BASE_THEMES) {
      for (const token of needed) {
        expect(theme.light[token]).toBeString();
        // `--radius` is a light-mode declaration; dark inherits it.
        if (token !== "radius") expect(theme.dark[token]).toBeString();
      }
    }
  });

  test("an accent declares primary and leaves the rest to its base", () => {
    for (const theme of ACCENT_THEMES) {
      expect(theme.light["primary"]).toBeString();
      expect(theme.light["background"]).toBeUndefined();
    }
  });

  test("findTheme is by name", () => {
    expect(findTheme("zinc")?.title).toBe("Zinc");
    expect(findTheme("nothing-like-this")).toBeUndefined();
  });
});

describe("themeCss", () => {
  test("the light half is :root and the dark half is .dark", () => {
    const css = themeCss({ base: "neutral" });
    expect(css).toContain("@layer barq.theme {");
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--background: oklch(1 0 0);");
  });

  test("an accent overlays the base rather than replacing it", () => {
    const neutral = findTheme("neutral");
    const blue = findTheme("blue");
    const css = themeCss({ base: "neutral", accent: "blue" });
    expect(css).toContain(`--primary: ${blue?.light["primary"]};`);
    expect(css).toContain(`--background: ${neutral?.light["background"]};`);
    expect(css).not.toContain(`--primary: ${neutral?.light["primary"]};`);
  });

  test("radius overrides the base's own", () => {
    expect(themeCss({ base: "neutral", radius: "0" })).toContain("--radius: 0;");
  });

  test("a scoped theme is dark by an ancestor OR by itself", () => {
    const css = themeCss({ base: "neutral", scope: ".panel" });
    expect(css).toContain(".panel {");
    expect(css).toContain(".dark .panel, .panel.dark {");
  });

  test("dark: media asks the operating system instead", () => {
    const css = themeCss({ base: "neutral", dark: "media" });
    expect(css).toContain("@media (prefers-color-scheme: dark) {");
    expect(css).not.toContain(".dark {");
  });

  test("an unknown name is an error rather than an empty theme", () => {
    expect(() => themeCss({ base: "chartreuse" })).toThrow('no theme named "chartreuse"');
  });
});

describe("installTheme", () => {
  test("a second install replaces the first", () => {
    installTheme({ base: "neutral" });
    const first = collectCss();
    expect(first).toContain("--background: oklch(1 0 0);");

    installTheme({ base: "zinc" });
    const second = collectCss();
    const zinc = findTheme("zinc");
    expect(second).toContain(`--background: ${zinc?.light["background"]};`);
    expect(second.split(":root {").length).toBe(first.split(":root {").length);
  });

  test("a scoped theme lives beside the root one", () => {
    installTheme({ base: "neutral" });
    installTheme({ base: "blue", scope: ".promo" });
    expect(collectCss()).toContain(".promo {");
    expect(collectCss()).toContain(":root {");
  });
});

describe("the base stylesheet", () => {
  test("the layer order is declared, and the scale is inside it", async () => {
    await import("./base.ts");
    expect(collectCss()).toContain("@layer barq.reset, barq.base, barq.theme, barq.ui;");
    expect(collectCss()).toContain("--spacing: 0.25rem");
  });

  test("the reset is opt-in", async () => {
    expect(collectCss()).not.toContain("box-sizing: border-box");
    await import("./reset.ts");
    expect(collectCss()).toContain("box-sizing: border-box");
  });
});
