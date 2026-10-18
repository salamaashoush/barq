import { describe, expect, test } from "bun:test";

import { asCopied } from "./copied.ts";
import { COMPONENTS } from "./index.ts";

describe("shown code imports the copies barq-ui writes", () => {
  test("a barrel import splits into one import per copied file", () => {
    expect(asCopied('import { Button, Card, CardTitle } from "@barqjs/ui";')).toBe(
      [
        'import { Button } from "./components/ui/button.tsx";',
        'import { Card, CardTitle } from "./components/ui/card.tsx";',
      ].join("\n"),
    );
  });

  test("a subpath import names its file, and other imports are left alone", () => {
    expect(
      asCopied(
        'import { css } from "@barqjs/css";\nimport { Toaster, toast } from "@barqjs/ui/toast";',
      ),
    ).toBe(
      'import { css } from "@barqjs/css";\nimport { Toaster, toast } from "./components/ui/toast.tsx";',
    );
  });

  test("a name the package does not export fails loudly", () => {
    expect(() => asCopied('import { Nothing } from "@barqjs/ui";')).toThrow(
      "@barqjs/ui has no Nothing",
    );
  });

  test("no page shows an import of @barqjs/ui", () => {
    for (const entry of COMPONENTS) {
      for (const code of [entry.usage, ...entry.demos.map((demo) => demo.code)]) {
        expect(asCopied(code), entry.slug).not.toMatch(/from\s*["']@barqjs\/ui[/"']/);
      }
    }
  });
});
