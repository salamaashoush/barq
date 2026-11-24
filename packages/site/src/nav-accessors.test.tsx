import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { renderRoute } from "@barqjs/testing/router";
import { user } from "@barqjs/testing";

import { routeTree } from "./routeTree.gen.ts";

/**
 * The site hands `aria-current`, `aria-pressed` and `data-active` to `Link`
 * and `Button` as accessors. Each has to reach its element as the value the
 * accessor answers, never as the function's source text.
 */

function noFunctionText(root: Element): void {
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      expect(attribute.value, `${element.localName}[${attribute.name}]`).not.toContain("=>");
    }
  }
}

describe("the site's accessor attributes", () => {
  test("the main nav marks the page it is on", async () => {
    const page = await renderRoute({ routeTree, path: "/charts/bar" });
    const nav = page.container.querySelector('nav[aria-label="Main"]')!;
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Charts");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(current?.querySelector('[data-active="true"]')).not.toBeNull();
    expect(nav.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    noFunctionText(page.container);
    page.unmount();
  });

  test("the chart types mark the one shown", async () => {
    const page = await renderRoute({ routeTree, path: "/charts/bar" });
    const active = [...page.container.querySelectorAll('[data-active="true"]')].map(
      (element) => element.textContent,
    );
    expect(active).toContain("Bar");
    expect(active).not.toContain("Area");
    noFunctionText(page.container);
    page.unmount();
  });

  test("the docs rail marks the guide it is on", async () => {
    const page = await renderRoute({ routeTree, path: "/docs/installation" });
    const marked = [...page.container.querySelectorAll('[aria-current="true"]')].map((element) =>
      element.getAttribute("href"),
    );
    expect(marked).toEqual(["/docs/installation"]);
    noFunctionText(page.container);
    page.unmount();
  });

  test("the designer's preview switcher presses the view shown, and follows a press", async () => {
    const page = await renderRoute({ routeTree, path: "/create" });
    const switcher = page.container.querySelector('[data-slot="preview-switcher"]')!;
    function pressed(): string[] {
      return [...switcher.querySelectorAll('[aria-pressed="true"]')].map(
        (element) => element.textContent ?? "",
      );
    }
    expect(pressed()).toHaveLength(1);
    const other = switcher.querySelector<HTMLElement>('[aria-pressed="false"]')!;
    expect(other.getAttribute("data-active")).toBe("false");
    await user.click(other);
    flush();
    expect(pressed()).toEqual([other.textContent ?? ""]);
    expect(other.getAttribute("data-active")).toBe("true");
    noFunctionText(page.container);
    page.unmount();
  });

  test("the menu sheet marks the page, and a link in it closes it", async () => {
    const page = await renderRoute({ routeTree, path: "/colors" });
    await user.click(page.container.querySelector<HTMLElement>('[aria-label="Open the menu"]')!);
    flush();
    const sheet = document.querySelector('[role="dialog"]')!;
    expect(sheet.querySelector('[aria-current="page"]')?.textContent).toBe("Colors");
    noFunctionText(sheet);
    await user.click(sheet.querySelector<HTMLElement>('a[href="/blocks"]')!);
    flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    page.unmount();
  });
});
