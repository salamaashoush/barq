/**
 * Solid 2.0 parity primitives: introspection, effect family, resolve.
 */

import { describe, expect, test } from "bun:test";
import {
  DEV,
  computed,
  owner,
  reaction,
  scope,
  trackedEffect,
  effect,
  flush,
  getNextChildId,
  getOwner,
  isDisposed,
  onCleanup,
  peekNextChildId,
  resolve,
  runWithOwner,
  signal,
  untrack,
} from "./index.ts";
import { getObserver, isEqual } from "./signals.ts";

describe("introspection primitives", () => {
  test("getObserver is the tracking computation, null outside", () => {
    expect(getObserver()).toBeNull();
    const dispose = scope((d) => {
      let inside: unknown = "unset";
      let inUntrack: unknown = "unset";
      const a = signal(0);
      const c = computed(() => {
        a();
        inside = getObserver();
        inUntrack = untrack(() => getObserver());
        return 1;
      });
      c();
      expect(inside).not.toBeNull();
      expect(inUntrack).toBeNull();
      return d;
    }, true);
    dispose();
    expect(getObserver()).toBeNull();
  });

  test("isDisposed reflects owner lifecycle", () => {
    let owner: ReturnType<typeof getOwner> = null;
    const dispose = scope((d) => {
      owner = getOwner();
      return d;
    }, true);
    expect(isDisposed(owner!)).toBe(false);
    dispose();
    expect(isDisposed(owner!)).toBe(true);
  });

  test("isEqual matches default signal equality", () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
    const o = {};
    expect(isEqual(o, o)).toBe(true);
    expect(isEqual({}, {})).toBe(false);
  });

  test("owner hosts computations and disposes with its parent", () => {
    const log: string[] = [];
    const dispose = scope((d) => {
      const own = owner();
      runWithOwner(own, () => {
        onCleanup(() => log.push("owned"));
      });
      return d;
    }, true);
    expect(log).toEqual([]);
    dispose();
    expect(log).toEqual(["owned"]);
  });

  test("child ids are stable and sequential; peek does not consume", () => {
    const dispose = scope((d) => {
      const owner = getOwner()!;
      const first = getNextChildId(owner);
      const second = getNextChildId(owner);
      expect(first).not.toBe(second);
      const peeked = peekNextChildId(owner);
      expect(peekNextChildId(owner)).toBe(peeked);
      expect(getNextChildId(owner)).toBe(peeked);
      return d;
    }, true);
    dispose();
  });
});

describe("trackedEffect", () => {
  test("runs on creation and on dependency change", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      const seen: number[] = [];
      trackedEffect(() => {
        seen.push(a());
      });
      expect(seen).toEqual([0]);
      a.set(1);
      flush();
      expect(seen).toEqual([0, 1]);
      return d;
    }, true);
    dispose();
  });

  test("returned function is the cleanup", () => {
    const log: string[] = [];
    const dispose = scope((d) => {
      const a = signal(0);
      trackedEffect(() => {
        const v = a();
        return () => log.push(`clean:${v}`);
      });
      a.set(1);
      flush();
      expect(log).toEqual(["clean:0"]);
      return d;
    }, true);
    dispose();
    expect(log).toEqual(["clean:0", "clean:1"]);
  });

  test("disposing stops it", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      let runs = 0;
      const stop = trackedEffect(() => {
        a();
        runs++;
      });
      stop();
      a.set(1);
      flush();
      expect(runs).toBe(1);
      return d;
    }, true);
    dispose();
  });

  test("creating a primitive inside reports a diagnostic", () => {
    const capture = DEV.diagnostics.capture();
    const dispose = scope((d) => {
      const a = signal(0);
      trackedEffect(() => {
        a();
        computed(() => 1);
      });
      return d;
    }, true);
    dispose();
    const events = capture.stop();
    expect(events.some((e) => e.code === "PRIMITIVE_IN_FORBIDDEN_SCOPE")).toBe(true);
  });
});

describe("reaction", () => {
  test("fires once per arm, then needs re-arming", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      let fires = 0;
      const track = reaction(() => {
        fires++;
      });
      track(() => {
        a();
      });
      expect(fires).toBe(0);

      a.set(1);
      flush();
      expect(fires).toBe(1);

      a.set(2); // not re-armed
      flush();
      expect(fires).toBe(1);

      track(() => {
        a();
      });
      a.set(3);
      flush();
      expect(fires).toBe(2);
      return d;
    }, true);
    dispose();
  });

  test("re-arming inside the callback keeps it listening", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      const seen: number[] = [];
      const track = reaction(() => {
        seen.push(untrack(() => a()));
        track(() => {
          a();
        });
      });
      track(() => {
        a();
      });
      a.set(1);
      flush();
      a.set(2);
      flush();
      expect(seen).toEqual([1, 2]);
      return d;
    }, true);
    dispose();
  });

  test("re-arming with a different source drops the old subscription", () => {
    const dispose = scope((d) => {
      const a = signal(0);
      const b = signal(0);
      let fires = 0;
      const track = reaction(() => {
        fires++;
      });
      track(() => {
        a();
      });
      track(() => {
        b();
      });
      a.set(1);
      flush();
      expect(fires).toBe(0);
      b.set(1);
      flush();
      expect(fires).toBe(1);
      return d;
    }, true);
    dispose();
  });

  test("callback cleanup runs before the next fire and on dispose", () => {
    const log: string[] = [];
    const dispose = scope((d) => {
      const a = signal(0);
      const track = reaction(() => {
        const v = untrack(() => a());
        return () => log.push(`clean:${v}`);
      });
      track(() => {
        a();
      });
      a.set(1);
      flush();
      expect(log).toEqual([]);
      track(() => {
        a();
      });
      a.set(2);
      flush();
      expect(log).toEqual(["clean:1"]);
      return d;
    }, true);
    dispose();
    expect(log).toEqual(["clean:1", "clean:2"]);
  });

  test("disposing the owner stops the reaction", () => {
    const a = signal(0);
    let fires = 0;
    const dispose = scope((d) => {
      const track = reaction(() => {
        fires++;
      });
      track(() => {
        a();
      });
      return d;
    }, true);
    dispose();
    a.set(1);
    flush();
    expect(fires).toBe(0);
  });
});

describe("resolve", () => {
  test("resolves a synchronous expression", async () => {
    const a = signal(21);
    await expect(resolve(() => a() * 2)).resolves.toBe(42);
  });

  test("waits for a pending async computed", async () => {
    const a = signal(2);
    const c = computed(async () => {
      const v = a();
      await Promise.resolve();
      return v * 10;
    });
    await expect(resolve(() => c())).resolves.toBe(20);
  });

  test("rejects when the expression throws", async () => {
    await expect(
      resolve(() => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
  });

  test("rejects when an async source rejects", async () => {
    const c = computed(async () => {
      await Promise.resolve();
      throw new Error("async boom");
    });
    await expect(resolve(() => c())).rejects.toThrow("async boom");
  });

  test("does not keep subscribing after resolving", async () => {
    const a = signal(1);
    let reads = 0;
    await resolve(() => {
      reads++;
      return a();
    });
    const after = reads;
    a.set(2);
    flush();
    expect(reads).toBe(after);
  });

  test("refuses to run inside a tracked scope", async () => {
    const dispose = scope((d) => {
      const a = signal(0);
      let p: Promise<unknown> | undefined;
      effect(() => {
        a();
        p ??= resolve(() => 1);
      });
      flush();
      return [d, p] as const;
    }, true);
    await expect(dispose[1]).rejects.toThrow(/tracked scope/);
    dispose[0]();
  });
});
