import { describe, expect, test } from "bun:test";

import { arcThemeCss, arcThemeValues, TONES } from "./index.ts";

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
