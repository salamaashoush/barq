import { describe, expect, test } from "bun:test";

import {
  ARC_CONTRAST_DARK,
  ARC_CONTRAST_LIGHT,
  DENSITIES,
  DENSITY,
  TONES,
  arcThemeCss,
  arcThemeValues,
} from "./index.ts";

describe("arc's theme", () => {
  test("adds every tone in three strengths to ui's tokens, light and dark", () => {
    const { light, dark } = arcThemeValues({ base: "neutral" });
    expect(light.primary).toBeDefined();
    for (const name of TONES) {
      for (const token of [name, `${name}-foreground`, `${name}-subtle`]) {
        expect(light[token], token).toBeDefined();
        expect(dark[token], token).toBeDefined();
      }
    }
  });

  test("lets an app override any token and add its brand, light and dark", () => {
    const { light, dark } = arcThemeValues({
      base: "neutral",
      tokens: {
        light: { primary: "oklch(0.5 0.2 150)", brand: "oklch(0.6 0.1 40)", success: "green" },
        dark: { brand: "oklch(0.8 0.1 40)" },
      },
    });
    expect(light.primary).toBe("oklch(0.5 0.2 150)");
    expect(light.success).toBe("green");
    expect(light.brand).toBe("oklch(0.6 0.1 40)");
    expect(dark.brand).toBe("oklch(0.8 0.1 40)");
  });

  test("writes one layered block, dark under the class or the media query asked for", () => {
    const css = arcThemeCss({ base: "neutral" });
    expect(css.startsWith("@layer barq.theme {")).toBe(true);
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--success-subtle:");
    expect(css).toContain("--z-toast: 60;");

    const media = arcThemeCss({ base: "neutral", dark: "media", scope: ".panel" });
    expect(media).toContain("@media (prefers-color-scheme: dark) {\n  .panel {");
  });
});

describe("density", () => {
  test("is the spacing token, per scope and per region", () => {
    expect(arcThemeValues({ base: "neutral", density: "compact" }).light.spacing).toBe("0.2rem");
    const css = arcThemeCss({ base: "neutral" });
    for (const name of DENSITIES) {
      expect(css).toContain(`[data-density="${name}"] {\n  --spacing: ${DENSITY[name].spacing};`);
    }
    expect(arcThemeCss({ base: "neutral", scope: ".panel" })).toContain(
      '.panel [data-density="compact"] {',
    );
  });

  test("a region marked compact computes the compact spacing, and its neighbour does not", () => {
    // happy-dom resolves neither `@layer` nor an inherited custom property, so
    // the sheet goes in unlayered and each element read carries the rule it
    // matches itself; inheritance below it is the browser's.
    const css = arcThemeCss({ base: "neutral", density: "spacious" });
    const style = document.createElement("style");
    style.textContent = css.slice(css.indexOf("\n") + 1, css.lastIndexOf("}"));
    const page = document.createElement("div");
    page.innerHTML =
      '<section data-density="compact"></section><section data-density="spacious"></section>';
    document.head.append(style);
    document.body.append(page);
    try {
      const [compact, spacious] = [...page.children].map((element) =>
        getComputedStyle(element).getPropertyValue("--spacing").trim(),
      );
      expect(compact).toBe("0.2rem");
      expect(spacious).toBe("0.3rem");
    } finally {
      page.remove();
      style.remove();
    }
  });
});

describe("contrast", () => {
  test("high replaces every edge and quiet text colour, light and dark", () => {
    const { light, dark } = arcThemeValues({ base: "neutral", contrast: "high" });
    for (const [name, value] of Object.entries(ARC_CONTRAST_LIGHT)) expect(light[name]).toBe(value);
    for (const [name, value] of Object.entries(ARC_CONTRAST_DARK)) expect(dark[name]).toBe(value);
  });

  test("system applies the same set while the reader asks for more contrast", () => {
    const css = arcThemeCss({ base: "neutral", contrast: "system" });
    expect(css).toContain("@media (prefers-contrast: more) {\n  :root {");
    expect(css).toContain(`--border: ${ARC_CONTRAST_LIGHT.border ?? ""};`);
    expect(arcThemeValues({ base: "neutral", contrast: "system" }).light.border).not.toBe(
      ARC_CONTRAST_LIGHT.border,
    );
  });
});

test("carries a second, emphasized curve beside the standard one", () => {
  const { light } = arcThemeValues({ base: "neutral" });
  expect(light["ease-standard"]).toBeDefined();
  expect(light["ease-emphasized"]).toMatch(/^cubic-bezier\(/);
});
