/**
 * The two bindings the universal target emits so a custom host pays for an
 * effect only where a value can change: `bindSlot` for a bare name, and
 * `bindPlain` for literals and the fields of one object.
 */

import { describe, expect, test } from "bun:test";

import { bindPlain, bindSlot } from "./signals.ts";
import { createRoot, createSignal, createStore, effectAllocations, flush } from "./index.ts";
import { rooted } from "./test-root.ts";

type Writes = [name: string, value: unknown, prev: unknown][];

/** Build under a root, and leave the writes that follow to the test, outside any scope. */
function owned(build: () => void): () => void {
  return createRoot((dispose) => {
    build();
    return dispose;
  });
}

function recorder(): {
  writes: Writes;
  write: (node: object, name: string, value: unknown, prev: unknown) => unknown;
} {
  const writes: Writes = [];
  return {
    writes,
    write: (_node, name, value, prev) => {
      writes.push([name, value, prev]);
      return value;
    },
  };
}

describe("bindSlot", () => {
  test(
    "a value that is not a function is written once, with no effect",
    rooted(() => {
      const { writes, write } = recorder();
      const before = effectAllocations();
      bindSlot({}, write, "geometry", "box");
      expect(writes).toEqual([["geometry", "box", undefined]]);
      expect(effectAllocations()).toBe(before);
    }),
  );

  test("a Cell is followed", () => {
    const { writes, write } = recorder();
    const [size, setSize] = createSignal(1);
    const dispose = owned(() => bindSlot({}, write, "size", size));
    setSize(2);
    flush();
    expect(writes).toEqual([
      ["size", 1, undefined],
      ["size", 2, 1],
    ]);
    dispose();
  });
});

describe("bindPlain", () => {
  const apply =
    (writes: unknown[]) =>
    (value: unknown): void => {
      writes.push(value);
    };

  test(
    "fields of plain data are read once and written once, with no effect",
    rooted(() => {
      const row = { x: 1, y: 2 };
      const writes: unknown[] = [];
      const before = effectAllocations();
      bindPlain(() => [row.x, row.y, 0], apply(writes), ["x", "y"], row);
      expect(writes).toEqual([[1, 2, 0]]);
      expect(effectAllocations()).toBe(before);
    }),
  );

  test("a store, a getter that reads a signal, or a field holding a Cell is followed", () => {
    const [store, setStore] = createStore({ x: 1 });
    const [count, setCount] = createSignal(1);
    const getter = {
      get x() {
        return count();
      },
    };
    const cell = { x: count };
    const seen: unknown[][] = [[], [], []];
    const dispose = owned(() => {
      bindPlain(() => store.x, apply(seen[0]), ["x"], store);
      bindPlain(() => getter.x, apply(seen[1]), ["x"], getter);
      bindPlain(() => cell.x(), apply(seen[2]), ["x"], cell);
    });
    setStore((draft) => {
      draft.x = 5;
    });
    setCount(7);
    flush();
    expect(seen).toEqual([
      [1, 5],
      [1, 7],
      [1, 7],
    ]);
    dispose();
  });
});
