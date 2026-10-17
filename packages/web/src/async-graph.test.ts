/**
 * Solid 2.0-style async-as-state tests: promise-returning computeds carry
 * pending/error status through the graph; Loading/Errored boundaries catch
 * NotReadyError and effect errors.
 */

import "./host.ts";
import { rooted } from "../../core/src/test-root.ts";
import { describe, expect, test } from "bun:test";
import {
  NotReadyError,
  createMemo,
  createRoot,
  createEffect,
  flush,
  isPending,
  latest,
  refresh,
  createSignal,
  Errored,
  Loading,
} from "@barqjs/core";
import { render } from "./index.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createAsync", () => {
  test(
    "read before resolution throws NotReadyError; resolves to value",
    rooted(async () => {
      const data = createMemo(async () => {
        await tick();
        return 42;
      });

      expect(() => data()).toThrow(NotReadyError);

      await tick();
      await tick();
      expect(data()).toBe(42);
    }),
  );

  test(
    "re-fetches when a dependency changes, keeps stale value via latest",
    rooted(async () => {
      const [id, setId] = createSignal(1);
      const user = createMemo(async () => {
        const current = id();
        await tick();
        return `user-${current}`;
      });

      // The first read is UNINITIALIZED, which `isPending` reports as `false` —
      // nothing is stale because nothing has ever been there. The read itself is
      // the probe, and it also kicks the lazy fetch.
      expect(() => user()).toThrow(NotReadyError);
      await tick();
      await tick();
      expect(user()).toBe("user-1");

      setId(2);
      flush();
      // In flight: plain read is pending, latest() returns the stale value
      expect(isPending(() => user())).toBe(true);
      expect(latest(() => user())).toBe("user-1");

      await tick();
      await tick();
      expect(user()).toBe("user-2");
    }),
  );

  test(
    "rejection propagates as a thrown error on read",
    rooted(async () => {
      const failing = createMemo(async () => {
        await tick();
        throw new Error("fetch failed");
      });

      expect(() => failing()).toThrow(NotReadyError);
      await tick();
      await tick();
      expect(() => failing()).toThrow("fetch failed");
    }),
  );
});

describe("isPending / latest", () => {
  test(
    "isPending is false for sync values",
    rooted(() => {
      const [s] = createSignal(1);
      expect(isPending(() => s())).toBe(false);
    }),
  );

  test(
    "latest rethrows for a never-resolved value INSIDE a derivation",
    rooted(() => {
      const data = createMemo(async () => {
        await tick();
        return 1;
      });
      const derived = createMemo(() => latest(() => data()));
      expect(() => derived()).toThrow(NotReadyError);
    }),
  );
});

describe("refresh", () => {
  test("recomputes a derived value on demand", () => {
    let runs = 0;
    const source = { value: 1 };
    // Owned, so it is computed once and kept; asked again from outside the
    // root, which is where a re-ask belongs.
    const [c, dispose] = createRoot(
      (disposeRoot) =>
        [
          createMemo(() => {
            runs++;
            return source.value;
          }),
          disposeRoot,
        ] as const,
    );

    expect(c()).toBe(1);
    expect(runs).toBe(1);

    source.value = 2;
    expect(c()).toBe(1); // not reactive to plain mutation

    void refresh(c);
    flush();
    expect(c()).toBe(2);
    expect(runs).toBe(2);
    dispose();
  });

  test(
    "observed async computeds re-run and notify on refresh",
    rooted(async () => {
      let fetches = 0;
      const data = createMemo(async () => {
        fetches++;
        await tick();
        return fetches;
      });

      const seen: number[] = [];
      createEffect(data, (value) => {
        seen.push(value);
      });
      flush();

      await tick();
      await tick();
      expect(seen).toEqual([1]);

      void refresh(data);
      flush();
      await tick();
      await tick();
      expect(seen).toEqual([1, 2]);
      expect(fetches).toBe(2);
    }),
  );
});

describe("Loading boundary", () => {
  test(
    "shows fallback while pending, content after resolution",
    rooted(async () => {
      const container = document.createElement("div");
      const data = createMemo(async () => {
        await tick();
        return "loaded";
      });

      createRoot(() => {
        const el = Loading({
          fallback: document.createTextNode("loading..."),
          children: () => {
            // reactive child reading an async value
            try {
              return data();
            } catch (err) {
              if (err instanceof NotReadyError) throw err;
              throw err;
            }
          },
        });
        render(el, container);
      });
      flush();

      expect(container.textContent).toContain("loading...");

      await tick();
      await tick();
      flush();
      expect(container.textContent).toContain("loaded");
      expect(container.textContent).not.toContain("loading...");
    }),
  );
});

describe("Errored boundary", () => {
  test(
    "catches synchronous render errors",
    rooted(() => {
      const container = document.createElement("div");

      createRoot(() => {
        const el = Errored({
          fallback: (error: () => Error) => document.createTextNode(`error: ${error().message}`),
          children: () => {
            throw new Error("render exploded");
          },
        });
        render(el, container);
      });
      flush();

      expect(container.textContent).toContain("error: render exploded");
    }),
  );

  test("catches errors thrown by effects under the boundary", () => {
    const container = document.createElement("div");
    const [trigger, setTrigger] = createSignal(false);

    const dispose = createRoot((disposeRoot) => {
      const el = Errored({
        fallback: (error: () => Error) => document.createTextNode(`caught: ${error().message}`),
        children: () => {
          createEffect(trigger, (fire) => {
            if (fire) throw new Error("effect exploded");
          });
          return document.createTextNode("ok");
        },
      });
      render(el, container);
      return disposeRoot;
    });
    flush();

    expect(container.textContent).toContain("ok");

    setTrigger(true);
    flush();
    expect(container.textContent).toContain("caught: effect exploded");
    dispose();
  });

  test("reset re-renders children", () => {
    const container = document.createElement("div");
    let shouldThrow = true;
    let resetFn: (() => void) | null = null;

    const dispose = createRoot((disposeRoot) => {
      const el = Errored({
        fallback: (error: () => Error, reset: () => void) => {
          resetFn = reset;
          return document.createTextNode(`error: ${error().message}`);
        },
        children: () => {
          if (shouldThrow) throw new Error("first");
          return document.createTextNode("recovered");
        },
      });
      render(el, container);
      return disposeRoot;
    });
    flush();

    expect(container.textContent).toContain("error: first");

    shouldThrow = false;
    resetFn!();
    flush();
    expect(container.textContent).toContain("recovered");
    dispose();
  });
});
