/**
 * Solid 2.0 store parity: draft-first setters, projections, snapshot,
 * merge/omit props utilities.
 */

import { describe, expect, test } from "bun:test";
import { merge, omit } from "./components.ts";
import { effect, flush, signal } from "./signals.ts";
import { createProjection, reconcile, snapshot, unwrap, useStore } from "./store.ts";

describe("draft-first setters", () => {
  test("mutating the draft commits fine-grained updates", () => {
    const [state, setState] = useStore({ count: 0, user: { name: "John", age: 30 } });

    setState((s) => {
      s.count++;
      s.user.age = 31;
    });

    expect(state.count).toBe(1);
    expect(state.user.age).toBe(31);
    expect(state.user.name).toBe("John");
  });

  test("array mutations via draft (push) work", () => {
    const [state, setState] = useStore<{ list: string[] }>({ list: ["a"] });

    setState((s) => {
      s.list.push("b");
    });

    expect(unwrap(state as { list: string[] }).list).toEqual(["a", "b"]);
  });

  test("only mutated paths notify subscribers", () => {
    const [state, setState] = useStore({ a: 1, b: 2 });
    let aRuns = 0;
    let bRuns = 0;

    effect(() => {
      void state.a;
      aRuns++;
    });
    effect(() => {
      void state.b;
      bRuns++;
    });
    expect(aRuns).toBe(1);
    expect(bRuns).toBe(1);

    setState((s) => {
      s.a = 10;
    });
    flush();

    expect(aRuns).toBe(2);
    expect(bRuns).toBe(1); // b untouched
  });

  test("returning a partial still applies a shallow update (compat)", () => {
    const [state, setState] = useStore({ count: 0, label: "x" });

    setState((s) => ({ count: s.count + 5 }));

    expect(state.count).toBe(5);
    expect(state.label).toBe("x");
  });

  test("reconcile composes with draft setters", () => {
    const [state, setState] = useStore<{ items: { id: number; text: string }[] }>({
      items: [{ id: 1, text: "old" }],
    });

    setState((s) => {
      s.items = reconcile(
        [
          { id: 1, text: "new" },
          { id: 2, text: "added" },
        ],
        "id",
      )(s.items);
    });

    const raw = unwrap(state as { items: { id: number; text: string }[] });
    expect(raw.items).toEqual([
      { id: 1, text: "new" },
      { id: 2, text: "added" },
    ]);
  });
});

describe("createProjection", () => {
  test("derives a read-only store reactively (selection map)", () => {
    const selectedId = signal("a");
    const selected = createProjection<Record<string, boolean>>(
      (draft) => {
        for (const key of Object.keys(draft)) draft[key] = false;
        draft[selectedId()] = true;
      },
      { a: false, b: false },
    );

    expect(selected.a).toBe(true);
    expect(selected.b).toBe(false);

    selectedId.set("b");
    flush();
    expect(selected.a).toBe(false);
    expect(selected.b).toBe(true);
  });

  test("subscribers only re-run for keys that changed", () => {
    const source = signal(1);
    const proj = createProjection<{ doubled: number; constant: string }>(
      (draft) => {
        draft.doubled = source() * 2;
        draft.constant = "static";
      },
      { doubled: 0, constant: "" },
    );

    let doubledRuns = 0;
    let constantRuns = 0;
    effect(() => {
      void proj.doubled;
      doubledRuns++;
    });
    effect(() => {
      void proj.constant;
      constantRuns++;
    });

    source.set(5);
    flush();

    expect(proj.doubled).toBe(10);
    expect(doubledRuns).toBe(2);
    expect(constantRuns).toBe(1); // unchanged value: no notify
  });
});

describe("snapshot", () => {
  test("returns the raw object (no tracking, serializable)", () => {
    const [state] = useStore({ user: { name: "John" } });
    const raw = snapshot(state as { user: { name: string } });
    expect(raw.user.name).toBe("John");
    expect(JSON.stringify(raw)).toBe('{"user":{"name":"John"}}');
  });
});

describe("merge / omit", () => {
  test("merge treats undefined as a value", () => {
    const merged = merge({ a: 1, b: 2 }, { b: undefined as unknown as number });
    expect("b" in merged).toBe(true);
    expect(merged.b).toBeUndefined();
    expect(merged.a).toBe(1);
  });

  test("omit drops the given keys", () => {
    const rest = omit({ a: 1, b: 2, c: 3 }, "b");
    expect(rest).toEqual({ a: 1, c: 3 });
  });
});
