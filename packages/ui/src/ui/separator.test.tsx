import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@barqjs/testing";

import { Separator } from "./separator.tsx";

afterEach(cleanup);

describe("Separator", () => {
  test("decorative takes it out of the accessibility tree and keeps the line", () => {
    render(() => <Separator decorative orientation="vertical" />);
    expect(screen.queryByRole("separator")).toBeNull();
    const rule = document.querySelector('[data-slot="separator"]') as HTMLElement;
    expect(rule.getAttribute("role")).toBe("none");
    expect(rule.hasAttribute("aria-orientation")).toBe(false);
    expect(rule.getAttribute("data-orientation")).toBe("vertical");
  });

  test("without it, a vertical separator is announced as one", () => {
    render(() => <Separator orientation="vertical" />);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical");
  });
});
