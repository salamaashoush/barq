import { describe, expect, test } from "bun:test";

import { isClient, isServer } from "./env.ts";

describe("which side this is", () => {
  test("they are complements, and this suite runs against a registered DOM", () => {
    expect(isServer).toBe(!isClient);
    // happy-dom is registered by the preload, so `document` exists here — which
    // is the honest answer for a render against a real DOM.
    expect(isClient).toBe(true);
  });

  /**
   * The property that keeps `SEMANTICS.md` H5 intact: the compiler proves
   * constants only for a local `const` with a literal initialiser, so an
   * imported binding is never one and the fold pass cannot move an address
   * between the client and server builds. Asserted on the compiler's own
   * output rather than on the rule.
   */
  test("the compiler does not fold it into the template", async () => {
    const { transform } = await import("@barqjs/compiler-rs");
    const source =
      `import { isServer } from "@barqjs/core";\n` +
      `export const V = () => <p>{isServer ? "s" : "c"}</p>;\n`;

    for (const ssr of [false, true]) {
      const { code } = transform(source, { filename: "v.tsx", ssr });
      // Still a runtime read, not a baked-in "s" or "c".
      expect(code, `ssr=${ssr}`).toContain("isServer");
    }
  });
});
