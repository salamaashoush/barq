import { describe, expect, test } from "bun:test";

import { rooted } from "./test-root.ts";
import { Loading, lazy } from "./index.ts";
import { flush, render } from "./index.ts";
import type { Child } from "./index.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Wait for THIS module's import to land, and nothing else.
 *
 * Not `settle()`: with no session it waits on every in-flight promise in the
 * process, so these two tests passed alone and timed out at 5 s inside the full
 * suite, waiting on work another file had left running.
 */
const settled = async () => {
  await tick();
  await tick();
  flush();
};

function mountWithFallback(component: (p: unknown) => Child) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    () =>
      Loading({
        fallback: () => document.createTextNode("loading"),
        children: () => component({}),
      }),
    host,
  );
  flush();
  return { host, dispose };
}

describe("lazy", () => {
  test(
    "shows the fallback, then the module, and loads once",
    rooted(async () => {
      let loads = 0;
      const Late = lazy(async () => {
        loads++;
        await tick();
        return { default: () => document.createTextNode("arrived") };
      });

      const { host, dispose } = mountWithFallback(Late);
      expect(host.textContent).toBe("loading");

      await settled();
      expect(host.textContent).toBe("arrived");
      expect(loads).toBe(1);
      dispose();
    }),
  );

  test(
    "preload warms the same cell, so rendering does not fetch again",
    rooted(async () => {
      let loads = 0;
      const Late = lazy(async () => {
        loads++;
        await tick();
        return { default: () => document.createTextNode("arrived") };
      });

      await Late.preload();
      expect(loads).toBe(1);

      // Already settled, so the fallback is never shown.
      const { host, dispose } = mountWithFallback(Late);
      expect(host.textContent).toBe("arrived");
      expect(loads).toBe(1);
      dispose();
    }),
  );

  test(
    "`pick` takes a named export",
    rooted(async () => {
      const Late = lazy(
        async () => ({ Page: () => document.createTextNode("named") }),
        (module) => module.Page,
      );
      await Late.preload();
      const { host, dispose } = mountWithFallback(Late);
      expect(host.textContent).toBe("named");
      dispose();
    }),
  );

  test(
    "the cell outlives the boundary that first read it",
    rooted(async () => {
      // A cell owned by the content it was read inside dies when that content is
      // discarded — which is what happens on a string render when a boundary
      // parks. `lazy` creates its cell with no owner for that reason.
      let loads = 0;
      const Late = lazy(async () => {
        loads++;
        await tick();
        return { default: () => document.createTextNode("arrived") };
      });

      const first = mountWithFallback(Late);
      expect(first.host.textContent).toBe("loading");
      first.dispose();

      await settled();

      const second = mountWithFallback(Late);
      flush();
      expect(second.host.textContent).toBe("arrived");
      expect(loads).toBe(1);
      second.dispose();
    }),
  );
});
