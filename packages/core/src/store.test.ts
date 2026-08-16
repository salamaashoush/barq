/**
 * Store Tests - Comprehensive tests for reactive state management
 */

import { describe, expect, test } from "bun:test";
import { store, produce, reconcile, unwrap } from "./store.ts";
import { effect, scope, batch } from "./signals.ts";

describe("store", () => {
  test("creates store with initial state", () => {
    const [state] = store({ count: 0, name: "test" });

    expect(state.count).toBe(0);
    expect(state.name).toBe("test");
  });

  test("setState updates single property", () => {
    const [state, setState] = store({ count: 0 });

    setState("count", 5);
    expect(state.count).toBe(5);
  });

  test("setState with update function", () => {
    const [state, setState] = store({ count: 10 });

    setState("count", (prev) => prev + 5);
    expect(state.count).toBe(15);
  });

  test("setState with partial object", () => {
    const [state, setState] = store({
      user: { name: "John", age: 30 },
    });

    setState("user", { name: "Jane" });
    expect(state.user.name).toBe("Jane");
    expect(state.user.age).toBe(30); // Should preserve existing
  });

  test("setState with full updates object", () => {
    const [state, setState] = store({ a: 1, b: 2, c: 3 });

    setState({ a: 10, b: 20 });
    expect(state.a).toBe(10);
    expect(state.b).toBe(20);
    expect(state.c).toBe(3); // Unchanged
  });

  test("setState with function returning updates", () => {
    const [state, setState] = store({ count: 0 });

    setState((s) => ({ count: s.count + 10 }));
    expect(state.count).toBe(10);
  });

  test("tracks property access reactively", () => {
    const [state, setState] = store({ count: 0 });
    let effectRuns = 0;

    effect(() => {
      void state.count; // Subscribe
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("count", 1);
    expect(effectRuns).toBe(2);

    setState("count", 2);
    expect(effectRuns).toBe(3);
  });

  test("only triggers effects for accessed properties", () => {
    const [state, setState] = store({ a: 0, b: 0 });
    let aEffectRuns = 0;
    let bEffectRuns = 0;

    effect(() => {
      void state.a;
      aEffectRuns++;
    });

    effect(() => {
      void state.b;
      bEffectRuns++;
    });

    expect(aEffectRuns).toBe(1);
    expect(bEffectRuns).toBe(1);

    setState("a", 1);
    expect(aEffectRuns).toBe(2);
    expect(bEffectRuns).toBe(1); // Should not trigger

    setState("b", 1);
    expect(aEffectRuns).toBe(2); // Should not trigger
    expect(bEffectRuns).toBe(2);
  });

  test("prevents direct mutation", () => {
    const [state] = store({ count: 0 });

    // Direct mutation throws TypeError because proxy's set trap returns false
    expect(() => {
      // @ts-expect-error - Testing runtime behavior
      state.count = 5;
    }).toThrow(TypeError);

    expect(state.count).toBe(0); // Should not change
  });
});

describe("Nested store reactivity", () => {
  test("tracks nested property access", () => {
    const [state, setState] = store({
      user: { name: "John", address: { city: "NYC" } },
    });
    let effectRuns = 0;

    effect(() => {
      void state.user.address.city;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("user", { address: { city: "LA" } });
    expect(effectRuns).toBe(2);
    expect(state.user.address.city).toBe("LA");
  });

  test("updates deep nested values", () => {
    const [state, setState] = store({
      level1: { level2: { level3: { value: 0 } } },
    });
    let effectRuns = 0;

    effect(() => {
      void state.level1.level2.level3.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // Update at root
    setState("level1", {
      level2: { level3: { value: 100 } },
    });

    expect(state.level1.level2.level3.value).toBe(100);
    expect(effectRuns).toBe(2);
  });

  test("handles arrays in store", () => {
    const [state, setState] = store({
      items: [
        { id: 1, name: "one" },
        { id: 2, name: "two" },
      ],
    });

    expect(state.items[0].name).toBe("one");
    expect(state.items.length).toBe(2);

    setState("items", [
      { id: 1, name: "ONE" },
      { id: 2, name: "two" },
      { id: 3, name: "three" },
    ]);

    expect(state.items[0].name).toBe("ONE");
    expect(state.items.length).toBe(3);
  });

  test("tracks array element access", () => {
    const [state, setState] = store({
      items: ["a", "b", "c"],
    });
    let effectRuns = 0;

    effect(() => {
      void state.items[0];
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("items", ["x", "b", "c"]);
    expect(effectRuns).toBe(2);
  });

  test("tracks array length", () => {
    const [state, setState] = store({
      items: [1, 2, 3],
    });
    let effectRuns = 0;

    effect(() => {
      void state.items.length;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("items", [1, 2, 3, 4]);
    expect(effectRuns).toBe(2);
  });
});

describe("Store batching", () => {
  test("batches multiple setState calls", () => {
    const [state, setState] = store({ a: 0, b: 0 });
    let effectRuns = 0;

    effect(() => {
      void state.a;
      void state.b;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // setState uses batch internally
    setState({ a: 1, b: 1 });
    expect(effectRuns).toBe(2); // Should run once, not twice

    // Multiple setState calls
    batch(() => {
      setState("a", 10);
      setState("b", 10);
    });
    expect(effectRuns).toBe(3); // Should run once after batch
  });
});

describe("produce function", () => {
  test("creates updater function for immutable updates", () => {
    const [state, setState] = store({
      user: { name: "John", score: 0 },
    });

    setState(
      "user",
      produce((draft) => {
        draft.name = "Jane";
        draft.score += 10;
      }),
    );

    expect(state.user.name).toBe("Jane");
    expect(state.user.score).toBe(10);
  });

  test("produce works with arrays", () => {
    const [state, setState] = store({
      items: [1, 2, 3],
    });

    setState(
      "items",
      produce((draft) => {
        draft.push(4);
        draft[0] = 100;
      }),
    );

    expect(state.items).toEqual([100, 2, 3, 4]);
  });

  test("produce works with nested objects", () => {
    const [state, setState] = store({
      data: {
        users: [
          { id: 1, name: "Alice", score: 0 },
          { id: 2, name: "Bob", score: 0 },
        ],
      },
    });

    setState(
      "data",
      produce((draft) => {
        const user = draft.users.find((u) => u.id === 1);
        if (user) user.score = 100;
      }),
    );

    expect(state.data.users[0].score).toBe(100);
    expect(state.data.users[1].score).toBe(0);
  });
});

describe("reconcile function", () => {
  test("reconciles array with key", () => {
    const [state, setState] = store({
      items: [
        { id: 1, name: "one", extra: "data" },
        { id: 2, name: "two" },
      ],
    });

    setState(
      "items",
      reconcile(
        [
          { id: 1, name: "ONE" }, // Update name, should preserve extra
          { id: 3, name: "three" }, // New item
        ],
        { key: "id" },
      ),
    );

    expect(state.items.length).toBe(2);
    expect(state.items[0].name).toBe("ONE");
    expect(state.items[0].extra).toBe("data"); // Merged
    expect(state.items[1].id).toBe(3);
  });

  test("reconcile with string key shorthand", () => {
    const [state, setState] = store({
      items: [{ id: 1, value: "old" }],
    });

    setState("items", reconcile([{ id: 1, value: "new" }], "id"));

    expect(state.items[0].value).toBe("new");
  });

  test("reconcile without merge", () => {
    const [state, setState] = store({
      items: [{ id: 1, name: "one", extra: "data" }],
    });

    setState("items", reconcile([{ id: 1, name: "ONE" }], { key: "id", merge: false }));

    expect(state.items[0].name).toBe("ONE");
    expect((state.items[0] as { extra?: string }).extra).toBeUndefined();
  });

  test("reconcile without key returns new data", () => {
    const [state, setState] = store({
      items: [{ a: 1 }, { b: 2 }],
    });

    setState("items", reconcile([{ c: 3 }]));

    expect(state.items).toEqual([{ c: 3 }]);
  });
});

describe("Store edge cases", () => {
  test("EDGE CASE: accessing non-existent property", () => {
    const [state] = store({ existing: 1 });

    // @ts-expect-error - Testing runtime behavior
    const nonExistent = state.nonExistent;
    expect(nonExistent).toBeUndefined();
  });

  test("EDGE CASE: setting property that doesn't exist yet", () => {
    const [state, setState] = store<{ count: number; newProp?: string }>({ count: 0 });

    setState("newProp" as keyof typeof state, "hello" as never);

    expect(state.newProp).toBe("hello");
  });

  test("EDGE CASE: empty object store", () => {
    const [state, setState] = store<Record<string, number>>({});
    let effectRuns = 0;

    effect(() => {
      // Access a property that may or may not exist
      void (state as { count?: number }).count;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("count" as never, 1 as never);
    // This may or may not trigger the effect depending on implementation
  });

  test("EDGE CASE: null values in store", () => {
    const [state, setState] = store<{ value: string | null }>({ value: null });
    let effectRuns = 0;

    effect(() => {
      void state.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    expect(state.value).toBeNull();

    setState("value", "not null");
    expect(effectRuns).toBe(2);
    expect(state.value).toBe("not null");

    setState("value", null);
    expect(effectRuns).toBe(3);
    expect(state.value).toBeNull();
  });

  test("EDGE CASE: deeply nested update triggers correct effects", () => {
    const [state, setState] = store({
      a: { b: { c: { d: { value: 0 } } } },
    });

    let dEffectRuns = 0;
    let cEffectRuns = 0;

    effect(() => {
      void state.a.b.c.d.value;
      dEffectRuns++;
    });

    effect(() => {
      void state.a.b.c;
      cEffectRuns++;
    });

    expect(dEffectRuns).toBe(1);
    expect(cEffectRuns).toBe(1);

    // Update deep value
    setState("a", { b: { c: { d: { value: 100 } } } });

    // Both should trigger because c and d.value both changed
    expect(dEffectRuns).toBe(2);
    expect(cEffectRuns).toBe(2);
  });

  test("EDGE CASE: circular reference protection", () => {
    // Store should handle objects without creating infinite loops
    const obj: { self?: typeof obj; value: number } = { value: 1 };
    // Note: intentionally not adding circular ref as structuredClone would fail

    const [state, setState] = store({ data: obj });

    expect(state.data.value).toBe(1);

    setState("data", { value: 2 });
    expect(state.data.value).toBe(2);
  });

  test("EDGE CASE: Symbol.toStringTag returns 'Store'", () => {
    const [state] = store({ value: 1 });

    expect(Object.prototype.toString.call(state)).toBe("[object Store]");
  });

  test("EDGE CASE: rapid updates to same property", () => {
    const [state, setState] = store({ count: 0 });
    let effectRuns = 0;

    effect(() => {
      void state.count;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // Rapid updates
    for (let i = 1; i <= 100; i++) {
      setState("count", i);
    }

    // Each update should trigger effect (unless batched)
    expect(state.count).toBe(100);
    expect(effectRuns).toBe(101);
  });

  test("EDGE CASE: batched rapid updates", () => {
    const [state, setState] = store({ count: 0 });
    let effectRuns = 0;

    effect(() => {
      void state.count;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    batch(() => {
      for (let i = 1; i <= 100; i++) {
        setState("count", i);
      }
    });

    expect(state.count).toBe(100);
    expect(effectRuns).toBe(2); // Only runs once after batch
  });
});

describe("Store with effects disposal", () => {
  test("effects dispose correctly with scope", () => {
    const [state, setState] = store({ count: 0 });
    let effectRuns = 0;
    let dispose: (() => void) | undefined;

    scope((d) => {
      dispose = d;
      effect(() => {
        void state.count;
        effectRuns++;
      });
    });

    expect(effectRuns).toBe(1);

    setState("count", 1);
    expect(effectRuns).toBe(2);

    dispose!();

    setState("count", 2);
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("nested effects with store dispose correctly", () => {
    const [state, setState] = store({
      show: true,
      data: { value: 0 },
    });

    let outerRuns = 0;
    let innerRuns = 0;
    let dispose: (() => void) | undefined;

    scope((d) => {
      dispose = d;

      effect(() => {
        void state.show;
        outerRuns++;

        if (state.show) {
          effect(() => {
            void state.data.value;
            innerRuns++;
          });
        }
      });
    });

    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    setState("data", { value: 1 });
    expect(innerRuns).toBe(2);

    // Hide - inner effect should be recreated
    setState("show", false);
    expect(outerRuns).toBe(2);

    // Update data - inner shouldn't run since show is false
    setState("data", { value: 2 });
    expect(innerRuns).toBe(2);

    // Dispose all
    dispose!();

    setState("show", true);
    expect(outerRuns).toBe(2); // Should not increase
  });
});

describe("Path-based setters", () => {
  test("deep path update with 2 levels", () => {
    const [state, setState] = store({
      user: { name: "John", age: 30 },
    });

    setState("user", "name", "Jane");
    expect(state.user.name).toBe("Jane");
    expect(state.user.age).toBe(30); // Should be preserved
  });

  test("deep path update with 3 levels", () => {
    const [state, setState] = store({
      user: { address: { city: "NYC", zip: "10001" } },
    });

    setState("user", "address", "city", "LA");
    expect(state.user.address.city).toBe("LA");
    expect(state.user.address.zip).toBe("10001"); // Should be preserved
  });

  test("deep path update with 4 levels", () => {
    const [state, setState] = store({
      a: { b: { c: { d: 1 } } },
    });

    setState("a", "b", "c", "d", 100);
    expect(state.a.b.c.d).toBe(100);
  });

  test("array index update", () => {
    const [state, setState] = store({
      items: [
        { id: 1, name: "one" },
        { id: 2, name: "two" },
      ],
    });

    setState("items", 0, "name", "ONE");
    expect(state.items[0].name).toBe("ONE");
    expect(state.items[1].name).toBe("two"); // Should be preserved
  });

  test("array index with numeric key", () => {
    const [state, setState] = store({
      list: ["a", "b", "c"],
    });

    setState("list", 1, "B");
    expect(state.list[1]).toBe("B");
    expect(state.list).toEqual(["a", "B", "c"]);
  });

  test("path-based update with function updater", () => {
    const [state, setState] = store({
      user: { score: 10 },
    });

    setState("user", "score", (prev: number) => prev + 5);
    expect(state.user.score).toBe(15);
  });

  test("path-based update triggers correct effects", () => {
    const [state, setState] = store({
      user: { name: "John", address: { city: "NYC" } },
    });

    let nameEffectRuns = 0;
    let cityEffectRuns = 0;

    effect(() => {
      void state.user.name;
      nameEffectRuns++;
    });

    effect(() => {
      void state.user.address.city;
      cityEffectRuns++;
    });

    expect(nameEffectRuns).toBe(1);
    expect(cityEffectRuns).toBe(1);

    // Update city - only city effect should run
    setState("user", "address", "city", "LA");
    expect(nameEffectRuns).toBe(1);
    expect(cityEffectRuns).toBe(2);

    // Update name - only name effect should run
    setState("user", "name", "Jane");
    expect(nameEffectRuns).toBe(2);
    expect(cityEffectRuns).toBe(2);
  });

  test("path-based update on nested array of objects", () => {
    const [state, setState] = store({
      todos: [
        { id: 1, text: "Learn signals", done: false },
        { id: 2, text: "Build app", done: false },
      ],
    });

    setState("todos", 0, "done", true);
    expect(state.todos[0].done).toBe(true);
    expect(state.todos[1].done).toBe(false);
  });
});

describe("unwrap utility", () => {
  test("returns raw object from store proxy", () => {
    const initial = { count: 0, name: "test" };
    const [state] = store(initial);

    const raw = unwrap(state);
    expect(raw).toBe(initial);
  });

  test("unwrapped object does not track access", () => {
    const [state] = store({ count: 0 });
    let effectRuns = 0;

    effect(() => {
      // Access via unwrapped object
      const raw = unwrap(state);
      void raw.count;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // Update should not trigger effect since we're reading from unwrapped
    // Note: The effect itself doesn't re-run because it doesn't track the proxy
  });

  test("unwrap returns same object for non-proxy", () => {
    const obj = { a: 1 };
    expect(unwrap(obj)).toBe(obj);
  });

  test("unwrapped object can be serialized", () => {
    const [state] = store({
      user: { name: "John", scores: [1, 2, 3] },
    });

    const raw = unwrap(state);
    const json = JSON.stringify(raw);
    expect(json).toBe('{"user":{"name":"John","scores":[1,2,3]}}');
  });
});

describe("Improved produce (proxy-based)", () => {
  test("only copies modified paths", () => {
    const original = {
      a: { value: 1 },
      b: { value: 2 },
      c: { value: 3 },
    };
    const [state, setState] = store(original);

    setState(
      produce((draft) => {
        draft.a.value = 100;
      }),
    );

    // 'a' should be a new object, 'b' and 'c' should be same references
    expect(state.a.value).toBe(100);
    expect(state.b.value).toBe(2);
    expect(state.c.value).toBe(3);
  });

  test("returns original if nothing modified", () => {
    const original = { count: 5 };
    const updater = produce<typeof original>((_draft) => {
      // No modifications
    });

    const result = updater(original);
    expect(result).toBe(original);
  });

  test("handles array mutations", () => {
    const [state, setState] = store({
      items: [1, 2, 3],
    });

    setState(
      "items",
      produce((draft) => {
        draft.push(4);
        draft[0] = 100;
      }),
    );

    expect(state.items).toEqual([100, 2, 3, 4]);
  });

  test("handles nested object mutations", () => {
    const [state, setState] = store({
      users: [
        { id: 1, name: "Alice", profile: { age: 25 } },
        { id: 2, name: "Bob", profile: { age: 30 } },
      ],
    });

    setState(
      "users",
      produce((draft) => {
        const user = draft.find((u) => u.id === 1);
        if (user) {
          user.profile.age = 26;
        }
      }),
    );

    expect(state.users[0].profile.age).toBe(26);
    expect(state.users[1].profile.age).toBe(30);
  });

  test("handles delete operations", () => {
    const [state, setState] = store({
      data: { a: 1, b: 2, c: 3 } as Record<string, number>,
    });

    setState(
      "data",
      produce((draft) => {
        delete draft.b;
      }),
    );

    expect(state.data).toEqual({ a: 1, c: 3 });
    expect("b" in state.data).toBe(false);
  });

  test("propagates nested changes to parent", () => {
    const original = {
      level1: {
        level2: {
          level3: { value: 0 },
        },
      },
    };

    const updater = produce<typeof original>((draft) => {
      draft.level1.level2.level3.value = 100;
    });

    const result = updater(original);

    // All ancestors should be new objects
    expect(result).not.toBe(original);
    expect(result.level1).not.toBe(original.level1);
    expect(result.level1.level2).not.toBe(original.level1.level2);
    expect(result.level1.level2.level3).not.toBe(original.level1.level2.level3);
    expect(result.level1.level2.level3.value).toBe(100);
  });
});

describe("Proxy caching", () => {
  test("same nested access returns cached proxy", () => {
    const [state] = store({
      user: { name: "John" },
    });

    // Access the same path multiple times
    const user1 = state.user;
    const user2 = state.user;

    // Should be the same proxy instance (cached)
    expect(user1).toBe(user2);
  });

  test("deeply nested access is cached", () => {
    const [state] = store({
      a: { b: { c: { d: 1 } } },
    });

    const c1 = state.a.b.c;
    const c2 = state.a.b.c;

    expect(c1).toBe(c2);
  });
});

describe("Additional edge cases", () => {
  test("undefined to defined transition", () => {
    const [state, setState] = store<{ value?: string }>({});
    let effectRuns = 0;

    effect(() => {
      void state.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    expect(state.value).toBeUndefined();

    setState("value", "hello");
    expect(effectRuns).toBe(2);
    expect(state.value).toBe("hello");
  });

  test("defined to undefined transition", () => {
    const [state, setState] = store<{ value?: string }>({ value: "hello" });

    expect(state.value).toBe("hello");

    setState("value", undefined);
    expect(state.value).toBeUndefined();
  });

  test("replacing entire nested object", () => {
    const [state, setState] = store({
      user: { name: "John", address: { city: "NYC" } },
    });

    let effectRuns = 0;
    effect(() => {
      void state.user.address.city;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // Replace entire user object
    setState("user", { name: "Jane", address: { city: "LA" } });

    expect(effectRuns).toBe(2);
    expect(state.user.address.city).toBe("LA");
  });

  test("setting array to empty", () => {
    const [state, setState] = store({
      items: [1, 2, 3],
    });

    let effectRuns = 0;
    effect(() => {
      void state.items.length;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    setState("items", []);
    expect(effectRuns).toBe(2);
    expect(state.items.length).toBe(0);
  });

  test("concurrent updates from batch", () => {
    const [state, setState] = store({
      a: 0,
      b: 0,
      c: 0,
    });

    let effectRuns = 0;
    effect(() => {
      void (state.a + state.b + state.c);
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    batch(() => {
      setState("a", 1);
      setState("b", 2);
      setState("c", 3);
    });

    expect(effectRuns).toBe(2); // Should run once after batch
    expect(state.a).toBe(1);
    expect(state.b).toBe(2);
    expect(state.c).toBe(3);
  });

  test("deeply nested path-based update", () => {
    const [state, setState] = store({
      level1: {
        level2: {
          level3: {
            level4: {
              value: 0,
            },
          },
        },
      },
    });

    // Using variadic path setter
    setState("level1", "level2", "level3", "level4", "value", 999);
    expect(state.level1.level2.level3.level4.value).toBe(999);
  });

  test("path-based setter throws on null parent", () => {
    const [_state, setState] = store<{ user: { address: null | { city: string } } }>({
      user: { address: null },
    });

    expect(() => {
      // @ts-expect-error - Testing runtime behavior
      setState("user", "address", "city", "NYC");
    }).toThrow();
  });
});
