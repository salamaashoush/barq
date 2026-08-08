import { describe, expect, test } from "bun:test";
import { createScope, effect, flush, onCleanup, signal } from "./signals.ts";
import { mapArray, repeat } from "./map.ts";

describe("mapArray - keyed by identity (default)", () => {
  test("maps and reuses rows across updates", () => {
    const dispose = createScope((d) => {
      const a = { id: 1 };
      const b = { id: 2 };
      const c = { id: 3 };
      const list = signal<{ id: number }[]>([a, b]);
      let calls = 0;
      const view = mapArray(list, (item) => {
        calls++;
        return item.id * 10;
      });
      expect(view()).toEqual([10, 20]);
      expect(calls).toBe(2);

      list.set([a, b, c]);
      expect(view()).toEqual([10, 20, 30]);
      expect(calls).toBe(3); // only the new row ran
      return d;
    }, true);
    dispose();
  });

  test("reorders without re-running mappers", () => {
    const dispose = createScope((d) => {
      const a = { id: 1 };
      const b = { id: 2 };
      const c = { id: 3 };
      const list = signal([a, b, c]);
      let calls = 0;
      const view = mapArray(list, (item) => {
        calls++;
        return item.id;
      });
      expect(view()).toEqual([1, 2, 3]);
      calls = 0;
      list.set([c, a, b]);
      expect(view()).toEqual([3, 1, 2]);
      expect(calls).toBe(0);
      return d;
    }, true);
    dispose();
  });

  test("index accessor tracks position", () => {
    const dispose = createScope((d) => {
      const a = { id: 1 };
      const b = { id: 2 };
      const list = signal([a, b]);
      const indexes: Array<() => number> = [];
      const view = mapArray(list, (item, index) => {
        indexes.push(index);
        return () => `${item.id}@${index()}`;
      });
      const rows = view();
      expect(rows.map((r) => r())).toEqual(["1@0", "2@1"]);
      list.set([b, a]);
      const rows2 = view();
      expect(rows2.map((r) => r())).toEqual(["2@0", "1@1"]);
      return d;
    }, true);
    dispose();
  });

  test("removed rows are disposed", () => {
    const disposed: number[] = [];
    const dispose = createScope((d) => {
      const a = { id: 1 };
      const b = { id: 2 };
      const list = signal([a, b]);
      const view = mapArray(list, (item) => {
        onCleanup(() => disposed.push(item.id));
        return item.id;
      });
      view();
      list.set([a]);
      view();
      expect(disposed).toEqual([2]);
      return d;
    }, true);
    dispose();
    expect(disposed.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  test("handles duplicate keys as distinct rows", () => {
    const dispose = createScope((d) => {
      const list = signal(["x", "x", "y"]);
      let calls = 0;
      const view = mapArray(list, (item) => {
        calls++;
        return item;
      });
      expect(view()).toEqual(["x", "x", "y"]);
      expect(calls).toBe(3);
      return d;
    }, true);
    dispose();
  });

  test("empty list uses the fallback", () => {
    const dispose = createScope((d) => {
      const list = signal<number[]>([]);
      const view = mapArray(list, (n) => n * 2, { fallback: () => "empty" });
      expect(view()).toEqual(["empty" as unknown as number]);
      list.set([1, 2]);
      expect(view()).toEqual([2, 4]);
      list.set([]);
      expect(view()).toEqual(["empty" as unknown as number]);
      return d;
    }, true);
    dispose();
  });

  test("null and undefined lists are treated as empty", () => {
    const dispose = createScope((d) => {
      const list = signal<number[] | null>(null);
      const view = mapArray(list, (n) => n);
      expect(view()).toEqual([]);
      list.set([1]);
      expect(view()).toEqual([1]);
      return d;
    }, true);
    dispose();
  });

  test("stable identity when nothing changes", () => {
    const dispose = createScope((d) => {
      const items = [{ id: 1 }];
      const list = signal(items);
      const view = mapArray(list, (i) => i.id);
      const first = view();
      list.set(items.slice());
      expect(view()).toBe(first);
      return d;
    }, true);
    dispose();
  });
});

describe("mapArray - keyed by function", () => {
  test("reuses rows when the key is unchanged and updates the value", () => {
    const dispose = createScope((d) => {
      const list = signal([
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ]);
      let calls = 0;
      const view = mapArray(
        list,
        (item, index) => {
          calls++;
          return () => `${item().label}@${index()}`;
        },
        { keyed: (item) => item.id },
      );
      expect(view().map((r) => r())).toEqual(["a@0", "b@1"]);
      expect(calls).toBe(2);

      // same keys, new objects with new labels: rows reused, values updated
      list.set([
        { id: 1, label: "A" },
        { id: 2, label: "B" },
      ]);
      expect(view().map((r) => r())).toEqual(["A@0", "B@1"]);
      expect(calls).toBe(2);
      return d;
    }, true);
    dispose();
  });
});

describe("mapArray - by index (keyed: false)", () => {
  test("rows are positional and values update in place", () => {
    const dispose = createScope((d) => {
      const list = signal(["a", "b"]);
      let calls = 0;
      const view = mapArray(
        list,
        (item, index) => {
          calls++;
          return () => `${item()}@${index}`;
        },
        { keyed: false },
      );
      expect(view().map((r) => r())).toEqual(["a@0", "b@1"]);
      expect(calls).toBe(2);

      list.set(["x", "b"]);
      expect(view().map((r) => r())).toEqual(["x@0", "b@1"]);
      expect(calls).toBe(2); // reused positionally

      list.set(["x", "b", "c"]);
      expect(view().map((r) => r())).toEqual(["x@0", "b@1", "c@2"]);
      expect(calls).toBe(3);
      return d;
    }, true);
    dispose();
  });
});

describe("mapArray - reactivity", () => {
  test("effects downstream see the mapped list", () => {
    const dispose = createScope((d) => {
      const list = signal([1, 2]);
      const view = mapArray(list, (n) => n * 2);
      const seen: number[][] = [];
      effect(() => {
        seen.push(view());
      });
      flush();
      list.set([1, 2, 3]);
      flush();
      expect(seen).toEqual([
        [2, 4],
        [2, 4, 6],
      ]);
      return d;
    }, true);
    dispose();
  });
});

describe("repeat", () => {
  test("creates and disposes rows as the count changes", () => {
    const log: string[] = [];
    const dispose = createScope((d) => {
      const n = signal(2);
      const view = repeat(n, (i) => {
        onCleanup(() => log.push(`clean:${i}`));
        return i * 10;
      });
      expect(view()).toEqual([0, 10]);
      n.set(4);
      expect(view()).toEqual([0, 10, 20, 30]);
      expect(log).toEqual([]);
      n.set(1);
      expect(view()).toEqual([0]);
      expect(log).toEqual(["clean:1", "clean:2", "clean:3"]);
      return d;
    }, true);
    dispose();
    expect(log).toEqual(["clean:1", "clean:2", "clean:3", "clean:0"]);
  });

  test("from shifts the index range", () => {
    const dispose = createScope((d) => {
      const n = signal(3);
      const from = signal(5);
      const view = repeat(n, (i) => i, { from });
      expect(view()).toEqual([5, 6, 7]);
      from.set(10);
      expect(view()).toEqual([10, 11, 12]);
      return d;
    }, true);
    dispose();
  });

  test("zero count uses the fallback", () => {
    const dispose = createScope((d) => {
      const n = signal(0);
      const view = repeat(n, (i) => i, { fallback: () => -1 });
      expect(view()).toEqual([-1]);
      n.set(2);
      expect(view()).toEqual([0, 1]);
      n.set(0);
      expect(view()).toEqual([-1]);
      return d;
    }, true);
    dispose();
  });

  test("negative count is treated as zero", () => {
    const dispose = createScope((d) => {
      const n = signal(-5);
      const view = repeat(n, (i) => i);
      expect(view()).toEqual([]);
      return d;
    }, true);
    dispose();
  });
});
