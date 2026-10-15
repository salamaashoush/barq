import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CATALOG } from "./catalog.ts";
import { BLOCKS, blockNamed } from "./registry.ts";

describe("the block registry", () => {
  test("every entry has a module of its own name and a component", () => {
    for (const block of BLOCKS) {
      const file = fileURLToPath(new URL(`./${block.name}.tsx`, import.meta.url));
      expect(existsSync(file), `${block.name}.tsx is missing`).toBe(true);
      expect(typeof block.component).toBe("function");
      expect(blockNamed(block.name)).toBe(block);
    }
  });

  test("a name is an address, so no two blocks share one", () => {
    const names = CATALOG.map((block) => block.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every block has a test beside it", () => {
    for (const block of CATALOG) {
      const file = fileURLToPath(new URL(`./${block.name}.test.tsx`, import.meta.url));
      expect(existsSync(file), `${block.name} has no test`).toBe(true);
    }
  });
});
