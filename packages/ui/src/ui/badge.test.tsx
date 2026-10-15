import { describe, expect, test } from "bun:test";

import { rulesFor } from "../test-rules.ts";

import { badgeVariants } from "./badge.tsx";

describe("Badge in a right-to-left page", () => {
  test("an icon takes the padding in on the side it is actually on", () => {
    const rules = rulesFor(badgeVariants());
    expect(rules).toContain(
      '[data-icon="inline-end"]){padding-inline-end: calc(var(--spacing) * 1.5)',
    );
    expect(rules).toContain(
      '[data-icon="inline-start"]){padding-inline-start: calc(var(--spacing) * 1.5)',
    );
    expect(rules).not.toContain("padding-right");
    expect(rules).not.toContain("padding-left");
  });
});
