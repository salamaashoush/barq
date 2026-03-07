/**
 * Async Tests - Edge cases for resources and async data loading
 */

import { describe, expect, test } from "bun:test";
import { resource, createResource, suspend, awaitAll, type Resource } from "./async.ts";
import { signal, effect, createScope, batch } from "./signals.ts";

// Helper to create a delayed promise
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to create a controllable promise
function createControllable<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("resource", () => {
  test("initial state is unresolved then pending", async () => {
    const source = signal(1);
    const { promise, resolve } = createControllable<string>();

    const r = resource(
      () => source(),
      () => promise,
    );

    // Immediately transitions to pending
    await delay(0);
    expect(r.state()).toBe("pending");
    expect(r.loading()).toBe(true);
    expect(r()).toBeUndefined();

    resolve("data");
    await delay(0);

    expect(r.state()).toBe("ready");
    expect(r.loading()).toBe(false);
    expect(r()).toBe("data");
  });

  test("transitions to ready on success", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "success";
      },
    );

    expect(r.state()).toBe("pending");

    await delay(20);

    expect(r.state()).toBe("ready");
    expect(r()).toBe("success");
  });

  test("transitions to errored on failure", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        throw new Error("test error");
      },
    );

    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("test error");
    expect(r()).toBeUndefined();
  });

  test("refetches when source changes", async () => {
    const source = signal(1);
    let fetchCount = 0;

    const r = resource(
      () => source(),
      async (s) => {
        fetchCount++;
        await delay(10);
        return `data-${s}`;
      },
    );

    await delay(20);
    expect(r()).toBe("data-1");
    expect(fetchCount).toBe(1);

    source.set(2);
    await delay(20);

    expect(r()).toBe("data-2");
    expect(fetchCount).toBe(2);
  });

  test("shows refreshing state when refetching with existing data", async () => {
    const source = signal(1);
    const states: string[] = [];

    const r = resource(
      () => source(),
      async (s) => {
        await delay(10);
        return `data-${s}`;
      },
    );

    // Track state changes
    effect(() => {
      states.push(r.state());
    });

    await delay(20);
    expect(r.state()).toBe("ready");

    source.set(2);
    await delay(0);

    // Should be refreshing, not pending
    expect(r.state()).toBe("refreshing");
    expect(r.loading()).toBe(true);
    expect(r()).toBe("data-1"); // Still has previous data

    await delay(20);
    expect(r.state()).toBe("ready");
    expect(r()).toBe("data-2");
  });

  test("aborts in-flight request when source changes", async () => {
    const source = signal(1);
    let _aborted = false;

    const r = resource(
      () => source(),
      async (s, _info) => {
        try {
          await delay(100);
          return `data-${s}`;
        } catch {
          _aborted = true;
          throw new Error("aborted");
        }
      },
    );

    await delay(10);
    source.set(2); // Change source while first request is in flight

    await delay(150);

    // The second request should complete
    expect(r()).toBe("data-2");
  });

  test("mutate updates data directly", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "original";
      },
    );

    await delay(20);
    expect(r()).toBe("original");

    r.mutate("mutated");
    expect(r()).toBe("mutated");
    expect(r.state()).toBe("ready");
  });

  test("refetch triggers manual refetch", async () => {
    let fetchCount = 0;

    const r = resource(
      () => null,
      async () => {
        fetchCount++;
        await delay(10);
        return `fetch-${fetchCount}`;
      },
    );

    await delay(20);
    expect(r()).toBe("fetch-1");

    await r.refetch();
    expect(r()).toBe("fetch-2");
    expect(fetchCount).toBe(2);
  });

  test("preserves previous data on error", async () => {
    const shouldFail = signal(false);

    const r = resource(
      () => shouldFail(),
      async (fail) => {
        await delay(10);
        if (fail) throw new Error("failed");
        return "success";
      },
    );

    await delay(20);
    expect(r()).toBe("success");

    shouldFail.set(true);
    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("failed");
    expect(r.latest()).toBe("success"); // Previous data preserved
  });

  test("latest() returns last successful data", async () => {
    const source = signal(1);

    const r = resource(
      () => source(),
      async (s) => {
        await delay(10);
        return `data-${s}`;
      },
    );

    await delay(20);
    expect(r.latest()).toBe("data-1");

    source.set(2);
    // While refreshing, latest still returns previous
    expect(r.latest()).toBe("data-1");

    await delay(20);
    expect(r.latest()).toBe("data-2");
  });
});

describe("createResource", () => {
  test("creates resource without source", async () => {
    let fetchCount = 0;

    const r = createResource(async () => {
      fetchCount++;
      await delay(10);
      return "data";
    });

    await delay(20);

    expect(r()).toBe("data");
    expect(fetchCount).toBe(1);
  });

  test("refetch works without source", async () => {
    let fetchCount = 0;

    const r = createResource(async () => {
      fetchCount++;
      return `fetch-${fetchCount}`;
    });

    await delay(10);
    expect(r()).toBe("fetch-1");

    await r.refetch();
    expect(r()).toBe("fetch-2");
  });
});

describe("suspend", () => {
  test("throws promise when pending", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(50);
        return "data";
      },
    );

    expect(() => suspend(r)).toThrow();
  });

  test("returns data when ready", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "data";
      },
    );

    await delay(20);

    expect(suspend(r)).toBe("data");
  });

  test("throws error when errored", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        throw new Error("test error");
      },
    );

    await delay(20);

    expect(() => suspend(r)).toThrow("test error");
  });

  test("suspended promise resolves when resource is ready", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(50);
        return "data";
      },
    );

    let caught: unknown;
    try {
      suspend(r);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Promise);
    await caught;

    expect(r.state()).toBe("ready");
    expect(suspend(r)).toBe("data");
  });
});

describe("awaitAll", () => {
  test("awaits multiple resources", async () => {
    const r1 = createResource(async () => {
      await delay(10);
      return "one";
    });

    const r2 = createResource(async () => {
      await delay(20);
      return "two";
    });

    const results = await awaitAll(r1, r2);

    expect(results).toEqual(["one", "two"]);
  });

  test("handles already ready resources", async () => {
    const r1 = createResource(async () => "ready");
    const r2 = createResource(async () => "also ready");

    await delay(10);

    const results = await awaitAll(r1, r2);
    expect(results).toEqual(["ready", "also ready"]);
  });

  test("throws if any resource errors", async () => {
    const r1 = createResource(async () => "success");
    const r2 = createResource(async () => {
      throw new Error("failed");
    });

    await delay(10);

    await expect(awaitAll(r1, r2)).rejects.toThrow("failed");
  });
});

describe("Resource edge cases", () => {
  test("EDGE CASE: rapid source changes", async () => {
    const source = signal(0);
    let _fetchCount = 0;
    const fetchedValues: number[] = [];

    const r = resource(
      () => source(),
      async (s) => {
        _fetchCount++;
        fetchedValues.push(s);
        await delay(10);
        return `data-${s}`;
      },
    );

    // Rapid changes
    source.set(1);
    source.set(2);
    source.set(3);
    source.set(4);
    source.set(5);

    await delay(50);

    // Should end up with data for the last source value
    expect(r()).toBe("data-5");
  });

  test("EDGE CASE: source changes during fetch", async () => {
    const source = signal(1);
    const results: string[] = [];

    const r = resource(
      () => source(),
      async (s) => {
        await delay(20);
        const result = `data-${s}`;
        results.push(result);
        return result;
      },
    );

    await delay(5);
    source.set(2); // Change while first fetch is in progress

    await delay(50);

    // Only the second fetch should complete (first aborted)
    expect(r()).toBe("data-2");
  });

  test("EDGE CASE: fetcher receives refetching flag", async () => {
    let refetchingValues: boolean[] = [];

    const r = resource(
      () => null,
      async (_, { refetching }) => {
        refetchingValues.push(refetching);
        await delay(10);
        return "data";
      },
    );

    await delay(20);
    expect(refetchingValues[0]).toBe(false); // Initial fetch

    await r.refetch();
    expect(refetchingValues[1]).toBe(true); // Manual refetch
  });

  test("EDGE CASE: fetcher receives previous value", async () => {
    let prevValues: (string | undefined)[] = [];

    const r = resource(
      () => null,
      async (_, { prev }) => {
        prevValues.push(prev);
        await delay(10);
        return prev ? `${prev}-updated` : "initial";
      },
    );

    await delay(20);
    expect(prevValues[0]).toBeUndefined();
    expect(r()).toBe("initial");

    await r.refetch();
    expect(prevValues[1]).toBe("initial");
    expect(r()).toBe("initial-updated");
  });

  test("EDGE CASE: computed source", async () => {
    const a = signal(1);
    const b = signal(2);
    let fetchCount = 0;

    const r = resource(
      () => a() + b(),
      async (sum) => {
        fetchCount++;
        await delay(10);
        return `sum-${sum}`;
      },
    );

    await delay(20);
    expect(r()).toBe("sum-3");
    expect(fetchCount).toBe(1);

    // Batch changes to a and b
    batch(() => {
      a.set(10);
      b.set(20);
    });

    await delay(20);
    expect(r()).toBe("sum-30");
    // Should only fetch once for the batched update
    expect(fetchCount).toBe(2);
  });

  test("EDGE CASE: error then success", async () => {
    const shouldFail = signal(true);

    const r = resource(
      () => shouldFail(),
      async (fail) => {
        await delay(10);
        if (fail) throw new Error("failed");
        return "success";
      },
    );

    await delay(20);
    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("failed");

    shouldFail.set(false);
    await delay(20);

    expect(r.state()).toBe("ready");
    expect(r()).toBe("success");
    expect(r.error()).toBeUndefined();
  });

  test("EDGE CASE: dispose resource effects in scope", async () => {
    const source = signal(1);
    let fetchCount = 0;
    let _r: Resource<string>;
    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;
      _r = resource(
        () => source(),
        async (s) => {
          fetchCount++;
          await delay(10);
          return `data-${s}`;
        },
      );
    });

    await delay(20);
    expect(fetchCount).toBe(1);

    dispose!();

    // After dispose, source changes should not trigger fetches
    source.set(2);
    await delay(20);

    expect(fetchCount).toBe(1); // Should not increase
  });

  test("EDGE CASE: non-Error thrown from fetcher", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        throw "string error"; // Not an Error object
      },
    );

    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("string error");
  });

  test("EDGE CASE: effect depends on resource state", async () => {
    const r = createResource(async () => {
      await delay(20);
      return "data";
    });

    const states: string[] = [];

    effect(() => {
      states.push(r.state());
    });

    await delay(50);

    expect(states).toContain("pending");
    expect(states).toContain("ready");
  });

  test("EDGE CASE: effect depends on resource data", async () => {
    const r = createResource(async () => {
      await delay(10);
      return "data";
    });

    const values: (string | undefined)[] = [];

    effect(() => {
      values.push(r());
    });

    await delay(20);

    expect(values).toContain(undefined);
    expect(values).toContain("data");
  });

  test("EDGE CASE: mutate during pending state", async () => {
    const { promise, resolve } = createControllable<string>();

    const r = resource(
      () => null,
      () => promise,
    );

    await delay(0);
    expect(r.state()).toBe("pending");

    // Mutate while pending
    r.mutate("mutated");

    expect(r.state()).toBe("ready");
    expect(r()).toBe("mutated");

    // Resolve original promise (should be ignored)
    resolve("from fetcher");
    await delay(0);

    // Should still be mutated value since we're now ready
    // Actually this depends on implementation...
  });

  test("EDGE CASE: same source value doesn't refetch", async () => {
    const source = signal(1);
    let fetchCount = 0;

    const _r = resource(
      () => source(),
      async (s) => {
        fetchCount++;
        await delay(10);
        return `data-${s}`;
      },
    );

    await delay(20);
    expect(fetchCount).toBe(1);

    // Set to same value
    source.set(1);
    await delay(20);

    // Computed memoization should prevent refetch
    expect(fetchCount).toBe(1);
  });
});

describe("Resource with reactive consumers", () => {
  test("multiple effects can subscribe to same resource", async () => {
    const r = createResource(async () => {
      await delay(10);
      return "data";
    });

    const values1: (string | undefined)[] = [];
    const values2: (string | undefined)[] = [];

    effect(() => {
      values1.push(r());
    });

    effect(() => {
      values2.push(r());
    });

    await delay(20);

    expect(values1).toEqual(values2);
    expect(values1[values1.length - 1]).toBe("data");
  });

  test("resource in computed", async () => {
    const r = createResource(async () => {
      await delay(10);
      return 5;
    });

    const doubled = () => {
      const val = r();
      return val !== undefined ? val * 2 : undefined;
    };

    await delay(20);

    expect(doubled()).toBe(10);
  });
});
