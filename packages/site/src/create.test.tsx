import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { renderRoute } from "@barqjs/testing/router";
import { user } from "@barqjs/testing";

import { DEFAULTS, read, write } from "./params.ts";
import { routeTree } from "./routeTree.gen.ts";

describe("the preview's direction", () => {
  test("is a search parameter that a default leaves out of the address", () => {
    expect(read("").rtl).toBe(false);
    expect(read("?rtl=1").rtl).toBe(true);
    expect(read("?rtl=yes").rtl).toBe(false);
    expect(write({ ...DEFAULTS, rtl: true })).toBe("?rtl=1");
    expect(write(DEFAULTS)).toBe("");
    expect(read(write({ ...DEFAULTS, rtl: true, radius: "0.5" }))).toEqual({
      ...DEFAULTS,
      rtl: true,
      radius: read("?radius=0.5").radius,
    });
  });

  test("the customizer's switch turns the preview and leaves the panel alone", async () => {
    // happy-dom's `replaceState` does not move `location`, so the address the
    // designer writes is read off the call.
    const written: string[] = [];
    const replace = history.replaceState;
    history.replaceState = (_data: unknown, _unused: string, url?: string | URL | null): void => {
      written.push(String(url));
    };
    const page = await renderRoute({ routeTree, path: "/create" });
    const preview = page.container.querySelector('[data-slot="preview"]') as HTMLElement;
    const panel = page.container.querySelector('[data-slot="customizer"]') as HTMLElement;
    const toggle = panel.querySelector(
      '[data-slot="direction"] [role="switch"]',
    ) as HTMLInputElement;
    expect(preview.getAttribute("dir")).toBe("ltr");
    expect(toggle.checked).toBe(false);

    await user.click(toggle);
    flush();
    expect(preview.getAttribute("dir")).toBe("rtl");
    expect(toggle.checked).toBe(true);
    expect(panel.closest("[dir]")).toBeNull();
    expect(written.at(-1)).toContain("rtl=1");

    await user.click(toggle);
    flush();
    expect(preview.getAttribute("dir")).toBe("ltr");
    expect(written.at(-1)).not.toContain("rtl");
    page.unmount();
    history.replaceState = replace;
  });
});
