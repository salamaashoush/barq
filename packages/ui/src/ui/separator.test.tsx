import { afterEach, describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
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

  test("the hr it renders carries no border, as shadcn's does", () => {
    // The reset gives every <hr> a 1px top border. shadcn's separator is a
    // <div> in its Radix and Base UI builds and an <hr> with `border-0` in its
    // React Aria one, so upstream computes 0px either way.
    render(() => <Separator />);
    const rule = document.querySelector('[data-slot="separator"]') as HTMLElement;
    expect(rule.tagName).toBe("HR");
    const sheet = collectCss();
    const borders = [...rule.classList].filter((name) => sheet.includes(`.${name}{border:0}`));
    expect(borders).toHaveLength(1);
  });
});
