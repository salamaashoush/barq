import { describe, expect, test } from "bun:test";

import { hasStrongLetter, textDirection } from "./text-direction.ts";

describe("textDirection", () => {
  test("is the first strong letter's", () => {
    expect(textDirection("مرحبا Salama")).toBe("rtl");
    expect(textDirection("Salama مرحبا")).toBe("ltr");
    expect(textDirection("שלום")).toBe("rtl");
    expect(textDirection("ﷺ")).toBe("rtl");
  });

  test("is nothing for text without a strong letter, and passes over scripts it does not place", () => {
    expect(textDirection("123 - 456")).toBeNull();
    expect(textDirection("")).toBeNull();
    expect(textDirection("漢字 abc")).toBe("ltr");
    expect(hasStrongLetter("42")).toBe(false);
    expect(hasStrongLetter("Ωmega")).toBe(true);
  });
});
