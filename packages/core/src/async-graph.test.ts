/**
 * Solid 2.0-style async-as-state tests: promise-returning computeds carry
 * pending/error status through the graph; Loading/Errored boundaries catch
 * NotReadyError and effect errors.
 */

import { describe, expect, test } from "bun:test";
import {
  NotReadyError,
  computed,
  scope,
  effect,
  flush,
  isPending,
  latest,
  refresh,
  render,
  signal,
  type Scope,
} from "./index.ts";
import { Errored, Loading } from "./components.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createAsync", () => {
  test("read before resolution throws NotReadyError; resolves to value", async () => {
    const data = computed(async () => {
      await tick();
      return 42;
    });

    expect(() => data()).toThrow(NotReadyError);

    await tick();
    await tick();
    expect(data()).toBe(42);
  });

  test("re-fetches when a dependency changes, keeps stale value via latest", async () => {
    const id = signal(1);
    const user = computed(async () => {
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

    id.set(2);
    flush();
    // In flight: plain read is pending, latest() returns the stale value
    expect(isPending(() => user())).toBe(true);
    expect(latest(() => user())).toBe("user-1");

    await tick();
    await tick();
    expect(user()).toBe("user-2");
  });

  test("rejection propagates as a thrown error on read", async () => {
    const failing = computed(async () => {
      await tick();
      throw new Error("fetch failed");
    });

    expect(() => failing()).toThrow(NotReadyError);
    await tick();
    await tick();
    expect(() => failing()).toThrow("fetch failed");
  });

  test("pending status propagates through derived computeds", async () => {
    const data = computed(async () => {
      await tick();
      return 10;
    });
    const doubled = computed(() => data() * 2);

    // Pendingness propagates as the THROW: a derived value over an unsettled
    // one is unsettled, which is what reaches the boundary.
    expect(() => doubled()).toThrow(NotReadyError);
    await tick();
    await tick();
    expect(doubled()).toBe(20);

    // And once it HAS a value, a refresh reads as pending through the
    // derivation, with the stale value still available.
    refresh(data);
    expect(isPending(() => doubled())).toBe(true);
    expect(latest(() => doubled())).toBe(20);
  });
});

describe("isPending / latest", () => {
  test("isPending is false for sync values", () => {
    const s = signal(1);
    expect(isPending(() => s())).toBe(false);
  });

  test("isPending rethrows non-NotReady errors", () => {
    expect(() =>
      isPending(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
  });

  // Solid 2.0's rule, read out of `@solidjs/signals@2.0.0-beta.31`:
  // `latest` rethrows ONLY for a value that has never held one AND a caller
  // that is itself a derivation, where the throw is what a `Loading` boundary
  // is for. Outside a derivation there is nothing to suspend and the honest
  // answer is `undefined`.
  test("latest answers undefined for a never-resolved value outside a derivation", () => {
    const data = computed(async () => {
      await tick();
      return 1;
    });
    expect(latest(() => data())).toBeUndefined();
  });

  test("latest rethrows for a never-resolved value INSIDE a derivation", () => {
    const data = computed(async () => {
      await tick();
      return 1;
    });
    const derived = computed(() => latest(() => data()));
    expect(() => derived()).toThrow(NotReadyError);
  });
});

describe("refresh", () => {
  test("recomputes a derived value on demand", () => {
    let runs = 0;
    const source = { value: 1 };
    const c = computed(() => {
      runs++;
      return source.value;
    });

    expect(c()).toBe(1);
    expect(runs).toBe(1);

    source.value = 2;
    expect(c()).toBe(1); // not reactive to plain mutation

    refresh(c);
    expect(c()).toBe(2);
    expect(runs).toBe(2);
  });

  test("observed async computeds re-run and notify on refresh", async () => {
    let fetches = 0;
    const data = computed(async () => {
      fetches++;
      await tick();
      return fetches;
    });

    const seen: number[] = [];
    effect(() => {
      try {
        seen.push(data());
      } catch (err) {
        if (!(err instanceof NotReadyError)) throw err;
      }
    });

    await tick();
    await tick();
    expect(seen).toEqual([1]);

    refresh(data);
    flush();
    await tick();
    await tick();
    expect(seen).toEqual([1, 2]);
    expect(fetches).toBe(2);
  });
});

describe("Loading boundary", () => {
  test("shows fallback while pending, content after resolution", async () => {
    const container = document.createElement("div");
    const data = computed(async () => {
      await tick();
      return "loaded";
    });

    scope(() => {
      const el = Loading(null, {
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
  });
});

describe("Errored boundary", () => {
  test("catches synchronous render errors", () => {
    const container = document.createElement("div");

    scope(() => {
      const el = Errored(null, {
        fallback: (_s: Scope | null, error: () => Error) =>
          document.createTextNode(`error: ${error().message}`),
        children: () => {
          throw new Error("render exploded");
        },
      });
      render(el, container);
    });
    flush();

    expect(container.textContent).toContain("error: render exploded");
  });

  test("catches errors thrown by effects under the boundary", () => {
    const container = document.createElement("div");
    const trigger = signal(false);

    scope(() => {
      const el = Errored(null, {
        fallback: (_s: Scope | null, error: () => Error) =>
          document.createTextNode(`caught: ${error().message}`),
        children: () => {
          effect(() => {
            if (trigger()) throw new Error("effect exploded");
          });
          return document.createTextNode("ok");
        },
      });
      render(el, container);
    });
    flush();

    expect(container.textContent).toContain("ok");

    trigger.set(true);
    flush();
    expect(container.textContent).toContain("caught: effect exploded");
  });

  test("reset re-renders children", () => {
    const container = document.createElement("div");
    let shouldThrow = true;
    let resetFn: (() => void) | null = null;

    scope(() => {
      const el = Errored(null, {
        fallback: (_s: Scope | null, error: () => Error, reset: () => void) => {
          resetFn = reset;
          return document.createTextNode(`error: ${error().message}`);
        },
        children: () => {
          if (shouldThrow) throw new Error("first");
          return document.createTextNode("recovered");
        },
      });
      render(el, container);
    });
    flush();

    expect(container.textContent).toContain("error: first");

    shouldThrow = false;
    resetFn!();
    flush();
    expect(container.textContent).toContain("recovered");
  });
});
