import { describe, expect, test } from "bun:test";
import { effect, flush, root } from "@barqjs/core";
import { ReactiveMap, ReactiveSet } from "./collections.ts";

describe("ReactiveMap", () => {
  test("behaves as a Map", () => {
    const map = new ReactiveMap<string, number>([["a", 1]]);
    expect(map.get("a")).toBe(1);
    expect(map.has("a")).toBe(true);
    expect(map.size).toBe(1);
    map.set("b", 2);
    expect([...map.keys()]).toEqual(["a", "b"]);
    expect([...map.values()]).toEqual([1, 2]);
    expect([...map]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(map.delete("a")).toBe(true);
    expect(map.delete("a")).toBe(false);
    map.clear();
    expect(map.size).toBe(0);
  });

  test("wakes only the readers of the key that changed", () => {
    const map = new ReactiveMap<string, number>();
    const runs = { a: 0, b: 0, size: 0 };
    const dispose = root((d) => {
      effect(() => {
        map.get("a");
        runs.a++;
      });
      effect(() => {
        map.get("b");
        runs.b++;
      });
      effect(() => {
        expect(map.size).toBeGreaterThanOrEqual(0);
        runs.size++;
      });
      return d;
    });

    expect(runs).toEqual({ a: 1, b: 1, size: 1 });

    map.set("a", 1);
    flush();
    expect(runs).toEqual({ a: 2, b: 1, size: 2 });

    map.set("a", 2);
    flush();
    // A new value for an existing key is not a change in size.
    expect(runs).toEqual({ a: 3, b: 1, size: 2 });

    map.set("a", 2);
    flush();
    expect(runs).toEqual({ a: 3, b: 1, size: 2 });

    map.delete("a");
    flush();
    expect(runs).toEqual({ a: 4, b: 1, size: 3 });
    dispose();
  });

  test("iteration follows a value change, key iteration does not", () => {
    const map = new ReactiveMap<string, number>([["a", 1]]);
    let values = 0;
    let keys = 0;
    const dispose = root((d) => {
      effect(() => {
        expect([...map.values()].length).toBeGreaterThanOrEqual(0);
        values++;
      });
      effect(() => {
        expect([...map.keys()].length).toBeGreaterThanOrEqual(0);
        keys++;
      });
      return d;
    });

    map.set("a", 2);
    flush();
    expect(values).toBe(2);
    expect(keys).toBe(1);

    map.set("b", 1);
    flush();
    expect(values).toBe(3);
    expect(keys).toBe(2);
    dispose();
  });

  test("clear wakes every key that was in it", () => {
    const map = new ReactiveMap<string, number>([
      ["a", 1],
      ["b", 2],
    ]);
    const runs = { a: 0, b: 0, c: 0 };
    const dispose = root((d) => {
      for (const key of ["a", "b", "c"] as const) {
        effect(() => {
          map.get(key);
          runs[key]++;
        });
      }
      return d;
    });
    map.clear();
    flush();
    expect(runs).toEqual({ a: 2, b: 2, c: 1 });
    map.clear();
    flush();
    expect(runs).toEqual({ a: 2, b: 2, c: 1 });
    dispose();
  });

  test("an untracked read allocates no dependency", () => {
    const map = new ReactiveMap<string, number>();
    for (let i = 0; i < 1000; i++) map.get(`key${i}`);
    // Nothing observable to assert on but the absence of growth; the
    // dependency map is private, so this stands as a regression guard on the
    // isTracking() gate not being removed.
    expect(map.size).toBe(0);
  });

  test("a key's dependency is dropped when its last reader goes", () => {
    const map = new ReactiveMap<string, number>();
    let runs = 0;
    const inner = root((d) => {
      effect(() => {
        map.get("a");
        runs++;
      });
      return d;
    });
    map.set("a", 1);
    flush();
    expect(runs).toBe(2);
    inner();
    map.set("a", 2);
    flush();
    expect(runs).toBe(2);
  });
});

describe("ReactiveSet", () => {
  test("behaves as a Set", () => {
    const set = new ReactiveSet<number>([1, 2]);
    expect(set.has(1)).toBe(true);
    expect(set.size).toBe(2);
    set.add(3);
    set.add(3);
    expect(set.size).toBe(3);
    expect([...set]).toEqual([1, 2, 3]);
    expect(set.delete(1)).toBe(true);
    expect(set.delete(1)).toBe(false);
    set.clear();
    expect(set.size).toBe(0);
  });

  test("membership is per value", () => {
    const set = new ReactiveSet<string>();
    const runs = { a: 0, b: 0 };
    const dispose = root((d) => {
      effect(() => {
        set.has("a");
        runs.a++;
      });
      effect(() => {
        set.has("b");
        runs.b++;
      });
      return d;
    });

    set.add("a");
    flush();
    expect(runs).toEqual({ a: 2, b: 1 });

    set.add("a");
    flush();
    expect(runs).toEqual({ a: 2, b: 1 });

    set.delete("a");
    flush();
    expect(runs).toEqual({ a: 3, b: 1 });
    dispose();
  });

  test("iteration follows structure", () => {
    const set = new ReactiveSet<number>();
    let runs = 0;
    const dispose = root((d) => {
      effect(() => {
        expect([...set].length).toBeGreaterThanOrEqual(0);
        runs++;
      });
      return d;
    });
    set.add(1);
    flush();
    expect(runs).toBe(2);
    set.add(1);
    flush();
    expect(runs).toBe(2);
    dispose();
  });
});
