/**
 * The one resource — `CODESIGN.md` §3.8, `SEMANTICS.md` A1–A3.
 *
 * Three things changed shape when the several async primitives collapsed into
 * one, and every test below is written against the new contract rather than
 * around it:
 *
 * 1. **The read is a Cell that throws `NotReadyError` before settlement** (A3).
 *    Where a test used to assert `r()` is `undefined` while pending it now
 *    asserts the throw, and `r.latest()` is the read that never throws.
 * 2. **It is a memo, so it is lazy.** The fetch starts at the first READ, not
 *    at creation; `kick` is that read. A resource nobody renders costs nothing,
 *    which is the same rule `computed` has always followed.
 * 3. `createResource`, `suspend` and `awaitAll` are gone. `createResource(f)`
 *    is `resource(() => null, f)`; `suspend` was a promise nobody awaited and
 *    is the `NotReady` read; `awaitAll` is `resolve()`.
 */

import { describe, expect, test } from "bun:test";
import { type Resource, resource } from "./async.ts";
import { NotReadyError, batch, createScope, effect, resolve, signal } from "./signals.ts";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** The read that starts a lazy memo without caring what it currently holds. */
function kick(r: Resource<unknown>): void {
  r.loading();
}

function createControllable<T>() {
  let resolveWith!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolveWith = res;
    reject = rej;
  });
  return { promise, resolve: resolveWith, reject };
}

describe("resource", () => {
  test("initial state is pending, then ready", async () => {
    const source = signal(1);
    const { promise, resolve: settle } = createControllable<string>();

    const r = resource(
      () => source(),
      () => promise,
    );

    expect(r.state()).toBe("pending");
    expect(r.loading()).toBe(true);
    expect(r.latest()).toBeUndefined();
    expect(() => r()).toThrow(NotReadyError);

    settle("data");
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

    kick(r);
    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("test error");
    expect(r.latest()).toBeUndefined();
    expect(() => r()).toThrow("test error");
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

    kick(r);
    await delay(20);
    expect(r()).toBe("data-1");
    expect(fetchCount).toBe(1);

    source.set(2);
    kick(r);
    await delay(20);

    expect(r()).toBe("data-2");
    expect(fetchCount).toBe(2);
  });

  test("reports refreshing rather than pending once data exists", async () => {
    const source = signal(1);

    const r = resource(
      () => source(),
      async (s) => {
        await delay(10);
        return `data-${s}`;
      },
    );

    kick(r);
    await delay(20);
    expect(r.state()).toBe("ready");

    source.set(2);
    kick(r);

    expect(r.state()).toBe("refreshing");
    expect(r.loading()).toBe(true);
    expect(r.latest()).toBe("data-1");

    await delay(20);
    expect(r.state()).toBe("ready");
    expect(r()).toBe("data-2");
  });

  test("a source change while a request is in flight leaves the newer one winning", async () => {
    const source = signal(1);

    const r = resource(
      () => source(),
      async (s) => {
        await delay(100);
        return `data-${s}`;
      },
    );

    kick(r);
    await delay(10);
    source.set(2);
    kick(r);

    await delay(150);

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

    kick(r);
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

    kick(r);
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

    kick(r);
    await delay(20);
    expect(r()).toBe("success");

    shouldFail.set(true);
    kick(r);
    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("failed");
    expect(r.latest()).toBe("success");
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

    kick(r);
    await delay(20);
    expect(r.latest()).toBe("data-1");

    source.set(2);
    kick(r);
    expect(r.latest()).toBe("data-1");

    await delay(20);
    expect(r.latest()).toBe("data-2");
  });

  test("a fetcher that answers synchronously never has a pending frame", () => {
    const r = resource(
      () => 3,
      (n: number) => `data-${n}`,
    );

    expect(r()).toBe("data-3");
    expect(r.state()).toBe("ready");
    expect(r.latest()).toBe("data-3");
  });

  test("a resource with no reactive source is the same primitive", async () => {
    let fetchCount = 0;

    const r = resource(
      () => null,
      async () => {
        fetchCount++;
        await delay(10);
        return "data";
      },
    );

    kick(r);
    await delay(20);

    expect(r()).toBe("data");
    expect(fetchCount).toBe(1);

    await r.refetch();
    expect(fetchCount).toBe(2);
  });
});

// ============================================================================
// A1 — cancellation is structural
// ============================================================================

describe("A1: cancellation is structural", () => {
  test("the fetcher is handed the signal", () => {
    let handed: AbortSignal | undefined;

    const r = resource(
      () => null,
      (_s, info) => {
        handed = info.signal;
        return new Promise<string>(() => {});
      },
    );

    kick(r);
    expect(handed).toBeInstanceOf(AbortSignal);
    expect(handed?.aborted).toBe(false);
  });

  test("disposing the scope that created the resource aborts the in-flight request", () => {
    let handed: AbortSignal | undefined;
    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;
      const r = resource(
        () => null,
        (_s, info) => {
          handed = info.signal;
          return new Promise<string>(() => {});
        },
      );
      kick(r);
    });

    expect(handed?.aborted).toBe(false);
    dispose?.();
    expect(handed?.aborted).toBe(true);
  });

  test("a re-run aborts the previous request", () => {
    const source = signal(1);
    const handed: AbortSignal[] = [];

    const r = resource(
      () => source(),
      (_s, info) => {
        handed.push(info.signal);
        return new Promise<string>(() => {});
      },
    );

    kick(r);
    source.set(2);
    kick(r);

    expect(handed.length).toBe(2);
    expect(handed[0].aborted).toBe(true);
    expect(handed[1].aborted).toBe(false);
  });

  test("a settled request is not aborted by the scope dying afterwards", async () => {
    let handed: AbortSignal | undefined;
    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;
      const r = resource(
        () => null,
        (_s, info) => {
          handed = info.signal;
          return Promise.resolve("done");
        },
      );
      kick(r);
    });

    await delay(0);
    dispose?.();
    expect(handed?.aborted).toBe(false);
  });
});

// ============================================================================
// A2 — staleness is decided by the generation captured at call time
// ============================================================================

describe("A2: a response arriving after a newer request was issued never wins", () => {
  function outOfOrderRig() {
    const which = signal<"slow" | "fast">("slow");
    const slow = createControllable<string>();
    const fast = createControllable<string>();
    const issued: string[] = [];

    const r = resource(
      () => which(),
      (key) => {
        issued.push(key);
        return key === "slow" ? slow.promise : fast.promise;
      },
    );

    return { which, slow, fast, issued, r };
  }

  test("the slow FIRST response is dropped when it lands after the fast second", async () => {
    const { which, slow, fast, issued, r } = outOfOrderRig();

    kick(r);
    which.set("fast");
    kick(r);
    expect(issued).toEqual(["slow", "fast"]);

    fast.resolve("FRESH");
    await delay(0);
    expect(r()).toBe("FRESH");

    // The classic bug: request #1 answers last and overwrites request #2.
    slow.resolve("STALE");
    await delay(0);
    await delay(0);

    expect(r()).toBe("FRESH");
    expect(r.state()).toBe("ready");
  });

  test("a stale REJECTION does not error a resource that already settled fresh", async () => {
    const { which, slow, fast, r } = outOfOrderRig();

    kick(r);
    which.set("fast");
    kick(r);

    fast.resolve("FRESH");
    await delay(0);
    expect(r()).toBe("FRESH");

    slow.reject(new Error("the stale request failed"));
    await delay(0);
    await delay(0);

    expect(r.error()).toBeUndefined();
    expect(r()).toBe("FRESH");
  });

  test("control: settled IN ORDER, the second response is still the one that wins", async () => {
    const { which, slow, fast, r } = outOfOrderRig();

    kick(r);
    which.set("fast");
    kick(r);

    slow.resolve("STALE");
    await delay(0);
    fast.resolve("FRESH");
    await delay(0);
    await delay(0);

    expect(r()).toBe("FRESH");
  });

  // The two below are the claims that OBSERVE the guard rather than its
  // outcome. Everything above holds through the memo alone: a superseded
  // promise is discarded, so `r()` reads the newest answer whatever the stale
  // continuation did to `settled`. Deleting the guard leaves them green — which
  // makes the guard unpinned, and an unpinned invariant is not an invariant.
  test("a stale response does not clobber a mutate() overlay", async () => {
    const { which, slow, fast, r } = outOfOrderRig();

    kick(r);
    which.set("fast");
    kick(r);

    fast.resolve("FRESH");
    await delay(0);
    expect(r()).toBe("FRESH");

    r.mutate("OPTIMISTIC");
    expect(r()).toBe("OPTIMISTIC");

    slow.resolve("STALE");
    await delay(0);
    await delay(0);

    // The stale continuation retires the override on its way past. It has no
    // standing to: the overlay was written after the request it belongs to was
    // already superseded.
    expect(r()).toBe("OPTIMISTIC");
  });

  test("a stale response does not release the newer request's cancellation", async () => {
    const which = signal<"slow" | "fast">("slow");
    const slow = createControllable<string>();
    const handed: AbortSignal[] = [];
    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;
      const r = resource(
        () => which(),
        (key, info) => {
          handed.push(info.signal);
          return key === "slow" ? slow.promise : new Promise<string>(() => {});
        },
      );
      kick(r);
      which.set("fast");
      kick(r);
    });

    expect(handed.length).toBe(2);

    slow.resolve("STALE");
    await delay(0);
    await delay(0);

    // A1's half of the same guard: the stale continuation clears `inflight`,
    // which by then names the LIVE controller, so disposing the scope aborts
    // nothing and the second request outlives its owner.
    expect(handed[1].aborted).toBe(false);
    dispose?.();
    expect(handed[1].aborted).toBe(true);
  });
});

// ============================================================================
// A3 — NotReady is a control signal
// ============================================================================

describe("A3: NotReady is a control signal", () => {
  test("the pending read throws NotReadyError and resolve() awaits it", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "data";
      },
    );

    expect(() => r()).toThrow(NotReadyError);
    expect(await resolve(() => r())).toBe("data");
  });

  test("resolve() rejects with the fetcher's error rather than a NotReady", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        throw new Error("test error");
      },
    );

    expect(resolve(() => r())).rejects.toThrow("test error");
  });

  test("several resources settle through one resolve()", async () => {
    const one = resource(
      () => null,
      async () => {
        await delay(10);
        return "one";
      },
    );
    const two = resource(
      () => null,
      async () => {
        await delay(20);
        return "two";
      },
    );

    expect(await resolve(() => [one(), two()])).toEqual(["one", "two"]);
  });

  test("one erroring resource rejects the whole resolve()", async () => {
    const ok = resource(
      () => null,
      async () => "success",
    );
    const bad = resource(
      () => null,
      async () => {
        throw new Error("failed");
      },
    );

    expect(resolve(() => [ok(), bad()])).rejects.toThrow("failed");
  });
});

describe("Resource edge cases", () => {
  test("EDGE CASE: rapid source changes", async () => {
    const source = signal(0);
    const fetchedValues: number[] = [];

    const r = resource(
      () => source(),
      async (s) => {
        fetchedValues.push(s);
        await delay(10);
        return `data-${s}`;
      },
    );

    kick(r);
    source.set(1);
    source.set(2);
    source.set(3);
    source.set(4);
    source.set(5);
    kick(r);

    await delay(50);

    expect(r()).toBe("data-5");
  });

  test("EDGE CASE: fetcher receives refetching flag", async () => {
    const refetchingValues: boolean[] = [];

    const r = resource(
      () => null,
      async (_, { refetching }) => {
        refetchingValues.push(refetching);
        await delay(10);
        return "data";
      },
    );

    kick(r);
    await delay(20);
    expect(refetchingValues[0]).toBe(false);

    await r.refetch();
    expect(refetchingValues[1]).toBe(true);
  });

  test("EDGE CASE: fetcher receives previous value", async () => {
    const prevValues: (string | undefined)[] = [];

    const r = resource<string>(
      () => null,
      async (_, { prev }) => {
        prevValues.push(prev);
        await delay(10);
        return prev ? `${prev}-updated` : "initial";
      },
    );

    kick(r);
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

    kick(r);
    await delay(20);
    expect(r()).toBe("sum-3");
    expect(fetchCount).toBe(1);

    batch(() => {
      a.set(10);
      b.set(20);
    });
    kick(r);

    await delay(20);
    expect(r()).toBe("sum-30");
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

    kick(r);
    await delay(20);
    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("failed");

    shouldFail.set(false);
    kick(r);
    await delay(20);

    expect(r.state()).toBe("ready");
    expect(r()).toBe("success");
    expect(r.error()).toBeUndefined();
  });

  test("EDGE CASE: a disposed scope stops refetching", async () => {
    const source = signal(1);
    let fetchCount = 0;
    let dispose: (() => void) | undefined;
    let held: Resource<string> | undefined;

    createScope((d) => {
      dispose = d;
      held = resource(
        () => source(),
        async (s) => {
          fetchCount++;
          await delay(10);
          return `data-${s}`;
        },
      );
      kick(held);
    });

    await delay(20);
    expect(fetchCount).toBe(1);

    dispose?.();

    source.set(2);
    kick(held as Resource<string>);
    await delay(20);

    expect(fetchCount).toBe(1);
  });

  test("EDGE CASE: non-Error thrown from fetcher", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        throw "string error";
      },
    );

    kick(r);
    await delay(20);

    expect(r.state()).toBe("errored");
    expect(r.error()?.message).toBe("string error");
  });

  test("EDGE CASE: effect depends on resource state", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(20);
        return "data";
      },
    );

    const states: string[] = [];

    effect(() => {
      states.push(r.state());
    });

    await delay(50);

    expect(states).toContain("pending");
    expect(states).toContain("ready");
  });

  test("EDGE CASE: effect depends on resource data", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "data";
      },
    );

    const values: (string | undefined)[] = [];

    effect(() => {
      values.push(r.latest());
    });

    await delay(20);

    expect(values).toContain(undefined);
    expect(values).toContain("data");
  });

  test("EDGE CASE: mutate during pending state", async () => {
    const { promise, resolve: settle } = createControllable<string>();

    const r = resource(
      () => null,
      () => promise,
    );

    kick(r);
    expect(r.state()).toBe("pending");

    r.mutate("mutated");

    expect(r.state()).toBe("ready");
    expect(r()).toBe("mutated");

    // The mutation is an OVERLAY, not a write: the request it was optimistic
    // about is still in flight and its answer retires the overlay.
    settle("from fetcher");
    await delay(0);
    expect(r()).toBe("from fetcher");
  });

  test("EDGE CASE: same source value doesn't refetch", async () => {
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

    kick(r);
    await delay(20);
    expect(fetchCount).toBe(1);

    source.set(1);
    kick(r);
    await delay(20);

    expect(fetchCount).toBe(1);
  });
});

describe("Resource with reactive consumers", () => {
  test("multiple effects can subscribe to same resource", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return "data";
      },
    );

    const values1: (string | undefined)[] = [];
    const values2: (string | undefined)[] = [];

    effect(() => {
      values1.push(r.latest());
    });

    effect(() => {
      values2.push(r.latest());
    });

    await delay(20);

    expect(values1).toEqual(values2);
    expect(values1[values1.length - 1]).toBe("data");
  });

  test("resource in a plain derivation", async () => {
    const r = resource(
      () => null,
      async () => {
        await delay(10);
        return 5;
      },
    );

    const doubled = () => {
      const val = r.latest();
      return val !== undefined ? val * 2 : undefined;
    };

    kick(r);
    await delay(20);

    expect(doubled()).toBe(10);
  });
});
