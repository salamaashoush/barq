import { describe, expect, test } from "bun:test";
import {
  type RevealSlot,
  currentRevealHandle,
  errorBoundary,
  loadingBoundary,
  revealOrder,
  enforceLoadingBoundary,
  flatten,
  hasEscapedError,
  resetErrorHalt,
} from "./boundaries.ts";
import { computed, scope, effect, flush, signal } from "./signals.ts";

/**
 * Drain pending microtasks and flush. Deliberately not settle(): that awaits
 * every in-flight promise in the process, including other test files'.
 */
async function tick(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  flush();
}

describe("loadingBoundary", () => {
  test("shows the fallback while pending, then the content", async () => {
    let view!: () => unknown;
    const dispose = scope((d) => {
      const src = signal(1);
      const data = computed(async () => {
        const v = src();
        await Promise.resolve();
        return `data:${v}`;
      });
      view = loadingBoundary(
        () => data(),
        () => "loading",
      );
      expect(view()).toBe("loading");
      return d;
    }, true);
    await tick();
    expect(view()).toBe("data:1");
    dispose();
  });

  test("synchronous content passes straight through", () => {
    const dispose = scope((d) => {
      const a = signal(1);
      const view = loadingBoundary(
        () => a() * 2,
        () => "loading",
      );
      expect(view()).toBe(2);
      a.set(5);
      expect(view()).toBe(10);
      return d;
    }, true);
    dispose();
  });

  test("re-shows the fallback when a new async question is asked", async () => {
    let view!: () => unknown;
    let src!: ReturnType<typeof signal<number>>;
    const dispose = scope((d) => {
      src = signal(1);
      const data = computed(async () => {
        const v = src();
        await Promise.resolve();
        return `data:${v}`;
      });
      view = loadingBoundary(
        () => data(),
        () => "loading",
      );
      // Boundaries are lazy: pull once so the async source actually starts
      expect(view()).toBe("loading");
      return d;
    }, true);
    await tick();
    expect(view()).toBe("data:1");
    src.set(2);
    expect(view()).toBe("loading");
    await tick();
    expect(view()).toBe("data:2");
    dispose();
  });

  test("non-pending errors propagate out of the boundary", () => {
    const dispose = scope((d) => {
      const view = loadingBoundary(
        () => {
          throw new Error("kaboom");
        },
        () => "loading",
      );
      expect(() => view()).toThrow("kaboom");
      return d;
    }, true);
    dispose();
  });
});

describe("errorBoundary", () => {
  test("catches a synchronous throw and exposes the error", () => {
    const dispose = scope((d) => {
      const view = errorBoundary(
        () => {
          throw new Error("bad");
        },
        (err) => `caught:${(err() as Error).message}`,
      );
      expect(view()).toBe("caught:bad");
      return d;
    }, true);
    dispose();
  });

  test("passes content through when nothing throws", () => {
    const dispose = scope((d) => {
      const a = signal(1);
      const view = errorBoundary(
        () => a() + 1,
        () => "caught",
      );
      expect(view()).toBe(2);
      a.set(9);
      expect(view()).toBe(10);
      return d;
    }, true);
    dispose();
  });

  test("reset recovers once the source stops throwing", () => {
    const dispose = scope((d) => {
      let boom = true;
      let reset!: () => void;
      const view = errorBoundary(
        () => {
          if (boom) throw new Error("bad");
          return "ok";
        },
        (err, r) => {
          reset = r;
          return `caught:${(err() as Error).message}`;
        },
      );
      expect(view()).toBe("caught:bad");
      boom = false;
      reset();
      expect(view()).toBe("ok");
      return d;
    }, true);
    dispose();
  });

  test("catches errors thrown by effects created under it", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      const view = errorBoundary(
        () => {
          effect(() => {
            if (a() > 0) throw new Error("effect blew up");
          });
          return "content";
        },
        (err) => `caught:${(err() as Error).message}`,
      );
      expect(view()).toBe("content");
      a.set(1);
      flush();
      expect(view()).toBe("caught:effect blew up");
      return d;
    }, true);
    dispose();
  });
});

/** A6: a leaf slot's two predicates are one accessor */
function leafSlot(settled: () => boolean): RevealSlot {
  return { ready: settled, minimallyReady: settled };
}

describe("revealOrder", () => {
  test("returns the inner value and installs a coordinator", () => {
    const dispose = scope((d) => {
      const value = revealOrder(() => "inner");
      expect(value).toBe("inner");
      return d;
    }, true);
    dispose();
  });

  test("sequential holds later boundaries until earlier ones settle", () => {
    const dispose = scope((d) => {
      const first = signal(false);
      const second = signal(true);
      let displays!: Array<() => string>;
      revealOrder(
        () => {
          const handle = currentRevealHandle()!;
          const a = handle.register(leafSlot(first));
          const b = handle.register(leafSlot(second));
          displays = [a.display, b.display];
        },
        { order: () => "sequential" },
      );
      expect(displays[0]()).toBe("fallback");
      expect(displays[1]()).toBe("fallback");
      first.set(true);
      expect(displays[0]()).toBe("content");
      expect(displays[1]()).toBe("content");
      return d;
    }, true);
    dispose();
  });

  test("together holds everyone until all settle", () => {
    const dispose = scope((d) => {
      const first = signal(true);
      const second = signal(false);
      let displays!: Array<() => string>;
      revealOrder(
        () => {
          const handle = currentRevealHandle()!;
          const a = handle.register(leafSlot(first));
          const b = handle.register(leafSlot(second));
          displays = [a.display, b.display];
        },
        { order: () => "together" },
      );
      expect(displays[0]()).toBe("fallback");
      second.set(true);
      expect(displays[0]()).toBe("content");
      expect(displays[1]()).toBe("content");
      return d;
    }, true);
    dispose();
  });

  test("collapsed suppresses output past the sequential frontier", () => {
    const dispose = scope((d) => {
      const first = signal(false);
      let displays!: Array<() => string>;
      revealOrder(
        () => {
          const handle = currentRevealHandle()!;
          const a = handle.register(leafSlot(first));
          const b = handle.register(leafSlot(() => false));
          displays = [a.display, b.display];
        },
        { order: () => "sequential", collapsed: () => true },
      );
      expect(displays[0]()).toBe("fallback");
      expect(displays[1]()).toBe("nothing");
      return d;
    }, true);
    dispose();
  });
});

describe("flatten", () => {
  test("unwraps zero-arg accessors, recursively", () => {
    expect(flatten(() => () => 5)).toBe(5);
  });

  test("flattens nested arrays", () => {
    expect(flatten([1, [2, [3, 4]], 5])).toEqual([1, 2, 3, 4, 5]);
  });

  test("calls accessors inside arrays", () => {
    expect(flatten([1, () => 2, [() => 3]])).toEqual([1, 2, 3]);
  });

  test("skipNonRendered drops empty values", () => {
    expect(flatten([1, null, undefined, true, false, "", 2], { skipNonRendered: true })).toEqual([
      1, 2,
    ]);
    expect(flatten(null, { skipNonRendered: true })).toBeUndefined();
  });

  test("doNotUnwrap keeps functions and returns a thunk for arrays", () => {
    const fn = (): number => 1;
    expect(flatten(fn, { doNotUnwrap: true })).toBe(fn);
    const result = flatten([fn, 2], { doNotUnwrap: true }) as () => unknown[];
    expect(typeof result).toBe("function");
    expect(result()).toEqual([1, 2]);
  });

  test("leaves non-function, non-array values alone", () => {
    expect(flatten("text")).toBe("text");
    expect(flatten(42)).toBe(42);
  });

  test("does not unwrap functions that take arguments", () => {
    const withArg = (x: number): number => x;
    expect(flatten(withArg)).toBe(withArg);
  });
});

describe("enforceLoadingBoundary", () => {
  test("makes an unbounded pending read throw", () => {
    const dispose = scope((d) => {
      enforceLoadingBoundary(true);
      try {
        const data = computed(async () => {
          await Promise.resolve();
          return 1;
        });
        expect(() => {
          effect(() => {
            void data();
          });
        }).toThrow(/ASYNC_OUTSIDE_LOADING_BOUNDARY/);
      } finally {
        enforceLoadingBoundary(false);
      }
      return d;
    }, true);
    dispose();
  });

  test("off by default", async () => {
    let ok = true;
    const dispose = scope((d) => {
      const data = computed(async () => {
        await Promise.resolve();
        return 1;
      });
      try {
        effect(() => {
          void data();
        });
      } catch {
        ok = false;
      }
      return d;
    }, true);
    await tick();
    expect(ok).toBe(true);
    dispose();
  });
});

describe("resetErrorHalt", () => {
  test("clears the escaped-error latch", () => {
    resetErrorHalt();
    expect(hasEscapedError()).toBe(false);
    const dispose = scope((d) => {
      const a = signal(0);
      effect(() => {
        if (a() > 0) throw new Error("escaped");
      });
      a.set(1);
      expect(() => flush()).toThrow("escaped");
      return d;
    }, true);
    expect(hasEscapedError()).toBe(true);
    resetErrorHalt();
    expect(hasEscapedError()).toBe(false);
    dispose();
  });
});
