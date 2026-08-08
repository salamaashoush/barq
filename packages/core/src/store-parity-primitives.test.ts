import { describe, expect, test } from "bun:test";
import { computed, createScope, effect, flush, signal } from "./signals.ts";
import { $PROXY, $TARGET, $TRACK, deep, isWrappable, storePath, useStore } from "./store.ts";

describe("isWrappable", () => {
  test("plain objects and arrays are wrappable", () => {
    expect(isWrappable({})).toBe(true);
    expect(isWrappable([])).toBe(true);
  });

  test("primitives and class instances are not", () => {
    expect(isWrappable(null)).toBe(false);
    expect(isWrappable(1)).toBe(false);
    expect(isWrappable("s")).toBe(false);
    expect(isWrappable(new Date())).toBe(false);
    expect(isWrappable(new Map())).toBe(false);
  });
});

describe("$TARGET / $PROXY", () => {
  test("$TARGET gives the raw object behind a store", () => {
    const raw = { a: 1 };
    const [state] = useStore(raw);
    expect((state as unknown as Record<symbol, unknown>)[$TARGET]).toBe(raw);
  });

  test("$PROXY on the raw object gives the store proxy back", () => {
    const raw = { a: 1 };
    const [state] = useStore(raw);
    expect((raw as unknown as Record<symbol, unknown>)[$PROXY]).toBe(state);
  });
});

describe("$TRACK", () => {
  test("subscribes to key additions and removals, not value changes", () => {
    const dispose = createScope((d) => {
      const [state, setState] = useStore<Record<string, number>>({ a: 1 });
      let runs = 0;
      effect(() => {
        (state as unknown as Record<symbol, unknown>)[$TRACK];
        runs++;
      });
      flush();
      expect(runs).toBe(1);

      setState((s) => {
        s.a = 2; // existing key, shape unchanged
      });
      flush();
      expect(runs).toBe(1);

      setState((s) => {
        s.b = 3; // new key
      });
      flush();
      expect(runs).toBe(2);
      return d;
    }, true);
    dispose();
  });
});

describe("deep", () => {
  test("returns a plain deep copy, not proxies", () => {
    const [state] = useStore({ user: { name: "Ada", tags: ["x"] } });
    const snap = deep(state);
    expect(snap).toEqual({ user: { name: "Ada", tags: ["x"] } });
    expect((snap.user as unknown as Record<symbol, unknown>)[$TARGET]).toBeUndefined();
  });

  test("subscribes to every nested property it reads", () => {
    const dispose = createScope((d) => {
      const [state, setState] = useStore({ user: { name: "Ada", age: 36 } });
      let runs = 0;
      const view = computed(() => {
        runs++;
        return deep(state);
      });
      view();
      expect(runs).toBe(1);

      setState((s) => {
        s.user.age = 37;
      });
      expect(view().user.age).toBe(37);
      expect(runs).toBe(2);
      return d;
    }, true);
    dispose();
  });

  test("handles cycles without recursing forever", () => {
    const raw: Record<string, unknown> = { name: "root" };
    raw.self = raw;
    const [state] = useStore(raw);
    const snap = deep(state) as Record<string, unknown>;
    expect(snap.name).toBe("root");
    expect(snap.self).toBe(snap);
  });

  test("leaves non-wrappable values alone", () => {
    const date = new Date(0);
    const [state] = useStore({ when: date, n: 1 });
    const snap = deep(state);
    expect(snap.when).toBe(date);
    expect(snap.n).toBe(1);
  });
});

describe("storePath", () => {
  test("sets a nested value", () => {
    const [state, setState] = useStore({ user: { name: "Ada" } });
    setState(storePath("user", "name", "Grace"));
    expect(state.user.name).toBe("Grace");
  });

  test("accepts an updater function", () => {
    const [state, setState] = useStore({ count: 1 });
    setState(storePath("count", (n: number) => n + 10));
    expect(state.count).toBe(11);
  });

  test("DELETE removes the property", () => {
    const [state, setState] = useStore<{ user: { name: string; nick?: string } }>({
      user: { name: "Ada", nick: "A" },
    });
    setState(storePath("user", "nick", storePath.DELETE));
    expect(state.user.nick).toBeUndefined();
    expect("nick" in state.user).toBe(false);
  });

  test("an array of keys writes several siblings", () => {
    const [state, setState] = useStore({ a: 0, b: 0, c: 0 });
    setState(storePath(["a", "c"], 5));
    expect([state.a, state.b, state.c]).toEqual([5, 0, 5]);
  });

  test("a filter targets matching array entries", () => {
    const [state, setState] = useStore({
      todos: [
        { id: 1, done: false },
        { id: 2, done: true },
        { id: 3, done: false },
      ],
    });
    setState(storePath("todos", (t: { done: boolean }) => !t.done, "done", true));
    expect(state.todos.map((t) => t.done)).toEqual([true, true, true]);
  });

  test("a range targets a slice", () => {
    const [state, setState] = useStore({ nums: [0, 1, 2, 3, 4] });
    setState(storePath("nums", { from: 1, to: 3 }, 9));
    expect(state.nums).toEqual([0, 9, 9, 9, 4]);
  });

  test("a range with by steps", () => {
    const [state, setState] = useStore({ nums: [0, 1, 2, 3, 4] });
    setState(storePath("nums", { from: 0, to: 4, by: 2 }, 7));
    expect(state.nums).toEqual([7, 1, 7, 3, 7]);
  });

  test("a single argument merges into the root", () => {
    const [state, setState] = useStore({ a: 1, b: 2 });
    setState(storePath({ b: 20 }));
    expect([state.a, state.b]).toEqual([1, 20]);
  });

  test("writes through storePath are reactive", () => {
    const dispose = createScope((d) => {
      const [state, setState] = useStore({ user: { name: "Ada" } });
      const seen: string[] = [];
      effect(() => {
        seen.push(state.user.name);
      });
      flush();
      setState(storePath("user", "name", "Grace"));
      flush();
      expect(seen).toEqual(["Ada", "Grace"]);
      return d;
    }, true);
    dispose();
  });

  test("missing intermediate paths are a no-op, not a crash", () => {
    const [state, setState] = useStore<{ a?: { b?: { c?: number } } }>({});
    expect(() => setState(storePath("a", "b", "c", 1))).not.toThrow();
    expect(state.a).toBeUndefined();
  });
});

describe("store parity primitives interop", () => {
  test("deep inside an effect re-runs on nested array change", () => {
    const dispose = createScope((d) => {
      const [state, setState] = useStore({ items: [{ n: 1 }] });
      const snapshots: unknown[] = [];
      effect(() => {
        snapshots.push(deep(state));
      });
      flush();
      setState(storePath("items", 0, "n", 2));
      flush();
      expect(snapshots).toEqual([{ items: [{ n: 1 }] }, { items: [{ n: 2 }] }]);
      return d;
    }, true);
    dispose();
  });

  test("signals still work alongside store paths", () => {
    const dispose = createScope((d) => {
      const toggle = signal(false);
      const [state, setState] = useStore({ n: 0 });
      const view = computed(() => (toggle() ? state.n : -1));
      expect(view()).toBe(-1);
      toggle.set(true);
      setState(storePath("n", 5));
      expect(view()).toBe(5);
      return d;
    }, true);
    dispose();
  });
});
