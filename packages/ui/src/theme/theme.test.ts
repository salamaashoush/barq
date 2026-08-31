import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";

import { installTheme, themeCss, themeValues } from "./install.ts";
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

  test("radius overrides the base's own rather than following it", () => {
    const css = themeCss({ base: "neutral", radius: "0" });
    expect(css).toContain("--radius: 0;");
    // Every base declares `radius` among its tokens, so appending wrote it
    // twice. The cascade took the second and the page was right, but this is
    // also the text a configurator offers someone to copy out.
    expect(css.match(/--radius:/g)).toHaveLength(1);
  });

  test("themeValues is what themeCss is built from, so the two cannot disagree", () => {
    // A configurator shows the values and offers the CSS. Resolving the accent
    // overlay a second time in the caller is how those drift, which is the
    // shape shadcn's own customiser has.
    const selection = { base: "zinc", accent: "blue", radius: "0.45rem" } as const;
    const { light, dark } = themeValues(selection);
    const css = themeCss(selection);

    for (const [token, value] of Object.entries(light)) {
      expect(css, `--${token} is not in the CSS`).toContain(`--${token}: ${value};`);
    }
    for (const [token, value] of Object.entries(dark)) {
      expect(css, `--${token} is not in the dark rule`).toContain(`--${token}: ${value};`);
    }
  });

  test("an accent overlays its base rather than replacing the set", () => {
    const { light } = themeValues({ base: "zinc", accent: "blue" });
    const zinc = findTheme("zinc");
    const blue = findTheme("blue");
    expect(light["primary"]).toBe(blue?.light["primary"] as string);
    expect(light["background"]).toBe(zinc?.light["background"] as string);
  });

  test("a chosen radius keeps the token's place rather than being appended", () => {
    // Spreading a key that already exists updates the value and leaves the
    // position, so `--radius` stays where the base declared it.
    const base = Object.keys(themeValues({ base: "neutral" }).light);
    const chosen = Object.keys(themeValues({ base: "neutral", radius: "0" }).light);
    expect(chosen).toEqual(base);
  });

  test("a chart ramp comes from its own theme, over the accent's", () => {
    // A blue primary with a warm ramp is a combination someone reaches for, and
    // folding the two decisions into one loses it.
    const { light } = themeValues({ base: "neutral", accent: "blue", chart: "amber" });
    const blue = findTheme("blue");
    const amber = findTheme("amber");
    expect(light["primary"]).toBe(blue?.light["primary"] as string);
    expect(light["chart-1"]).toBe(amber?.light["chart-1"] as string);
    expect(light["chart-1"]).not.toBe(blue?.light["chart-1"] as string);
  });

  test("a font stack replaces the token every component reads", () => {
    const css = themeCss({ base: "neutral", fonts: { sans: "Georgia, serif" } });
    expect(css).toContain("--font-sans: Georgia, serif;");
    // `--font-mono` was not asked for, so the base's own survives untouched.
    expect(css).not.toContain("--font-mono:");
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
