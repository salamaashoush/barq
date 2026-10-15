import { describe, expect, test } from "bun:test";

import { CATALOG } from "./catalog.ts";
import { serverRender } from "./test-harness.ts";

const component = (name: string): string =>
  name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

describe("on a server with no DOM", () => {
  for (const block of CATALOG) {
    test.concurrent(`${block.name} renders, and nothing it scheduled brings the process down`, async () => {
      const result = await serverRender(`${block.name}.tsx`, component(block.name));
      expect(result.errors).toBe("");
      expect(result.code).toBe(0);
      expect(result.html.length).toBeGreaterThan(500);
    });
  }
});
