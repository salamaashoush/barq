import { describe, expect, test } from "bun:test";

import { Loading, flush, lazy, lazyModule, render } from "./index.ts";
import type { Child } from "./index.ts";
import { rooted } from "./test-root.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("lazy with Solid's `{ export }` option", () => {
  test(
    "renders the named export instead of the default one",
    rooted(async () => {
      const Card = lazy(
        async () => ({
          default: () => document.createTextNode("default"),
          Card: () => document.createTextNode("salama's card"),
        }),
        { export: "Card" },
      );

      const host = document.createElement("div");
      document.body.append(host);
      const dispose = render(
        () =>
          Loading({
            fallback: () => document.createTextNode("loading"),
            children: () => (Card as (props: unknown) => Child)({}),
          }),
        host,
      );
      flush();
      expect(host.textContent).toBe("loading");
      await tick();
      await tick();
      flush();
      expect(host.textContent).toBe("salama's card");
      dispose();
      host.remove();
    }),
  );
});

describe("lazyModule", () => {
  test("imports once, shares the promise, and peeks the module after it lands", async () => {
    let loads = 0;
    const settings = lazyModule(async () => {
      loads++;
      await tick();
      return { endpoint: "https://example.com" };
    });

    expect(settings.peek()).toBeUndefined();
    const first = settings();
    expect(settings.preload()).toBe(first);
    expect(await first).toEqual({ endpoint: "https://example.com" });
    expect(settings.peek()).toEqual({ endpoint: "https://example.com" });
    expect(loads).toBe(1);
  });

  test("a failed import is not cached, so the next call imports again", async () => {
    let loads = 0;
    const flaky = lazyModule(async () => {
      loads++;
      if (loads === 1) throw new Error("offline");
      return { ok: true };
    });

    await expect(flaky()).rejects.toThrow("offline");
    expect(await flaky()).toEqual({ ok: true });
    expect(loads).toBe(2);
  });
});
