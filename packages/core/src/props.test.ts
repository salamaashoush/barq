/**
 * LAZINESS CONFORMANCE, as an acceptance test.
 *
 * A counting Cell must read **zero** after spread, rest-destructure,
 * `Object.assign`, `for…in`, `mergeProps`, `splitProps`, `omit`, and
 * forwarding through three wrappers.
 *
 * This is the falsification procedure for C3's Law 4 (copy-transparency). It
 * matters because the defect it replaces was not diagnosable: barq's six props
 * helpers all flattened getters, so `mergeProps(a, b)` EVALUATED every prop of
 * both, and a component that spread its props evaluated them again at every
 * hop. With a Cell there is nothing to flatten — copying a function copies a
 * function — and the property is a consequence of the language rather than of
 * the runtime remembering to be careful.
 *
 * The counter is the observation. Every case asserts `reads === 0` after the
 * operation AND that the copy still resolves to the live value, because a
 * carrier that has been destroyed also reads zero.
 */

import { describe, expect, test } from "bun:test";
import { cell, merge, mergeProps, omit, props, splitProps, SOURCES } from "./props.ts";
import { signal } from "./signals.ts";

/** A Cell that records every call. Reading it is the only way to its value. */
function counting<T>(value: T): { readonly carrier: () => T; reads: number } {
  const box = {
    reads: 0,
    carrier: (): T => {
      box.reads++;
      return value;
    },
  };
  return box;
}

describe("laziness conformance: a counting Cell reads 0 after", () => {
  test("spread", () => {
    const box = counting("v");
    const source = { x: box.carrier, y: cell(1) };

    const copy = { ...source };

    expect(box.reads).toBe(0);
    expect(copy.x()).toBe("v");
    expect(box.reads).toBe(1);
  });

  test("rest-destructure", () => {
    const box = counting("v");
    const source = props([{ x: box.carrier, y: cell(1), z: cell(2) }, { w: cell(3) }]);

    const { y, ...rest } = source as { y: () => number } & Record<string, () => unknown>;

    expect(box.reads).toBe(0);
    expect(Object.keys(rest).toSorted()).toEqual(["w", "x", "z"]);
    expect(rest.x()).toBe("v");
    expect(box.reads).toBe(1);
    expect(y()).toBe(1);
  });

  test("Object.assign", () => {
    const box = counting("v");
    const source = props([{ a: cell(0) }, { x: box.carrier }]);

    const copy = Object.assign({}, source) as { x: () => string };

    expect(box.reads).toBe(0);
    expect(copy.x()).toBe("v");
    expect(box.reads).toBe(1);
  });

  test("for…in", () => {
    const box = counting("v");
    const source = props([{ x: box.carrier }, { y: cell(1) }]);

    const seen: string[] = [];
    for (const key in source) seen.push(key);

    expect(box.reads).toBe(0);
    expect(seen.toSorted()).toEqual(["x", "y"]);
  });

  test("mergeProps", () => {
    const box = counting("v");
    const other = counting("w");
    const merged = mergeProps({ x: box.carrier }, { y: other.carrier });

    expect(box.reads).toBe(0);
    expect(other.reads).toBe(0);
    expect((merged.x as () => string)()).toBe("v");
    expect(box.reads).toBe(1);
    expect(other.reads).toBe(0);
  });

  test("splitProps", () => {
    const box = counting("v");
    const other = counting("w");
    const [picked, rest] = splitProps({ x: box.carrier, y: other.carrier }, ["x"]);

    expect(box.reads).toBe(0);
    expect(other.reads).toBe(0);
    expect(Object.keys(picked)).toEqual(["x"]);
    expect(Object.keys(rest)).toEqual(["y"]);
    expect(box.reads).toBe(0);
    expect(picked.x()).toBe("v");
    expect(box.reads).toBe(1);
  });

  test("omit", () => {
    const box = counting("v");
    const dropped = counting("gone");
    const rest = omit({ x: box.carrier, secret: dropped.carrier }, "secret");

    expect(box.reads).toBe(0);
    expect(dropped.reads).toBe(0);
    expect(Object.keys(rest)).toEqual(["x"]);
    expect("secret" in rest).toBe(false);
    expect(rest.x()).toBe("v");
    expect(box.reads).toBe(1);
    expect(dropped.reads).toBe(0);
  });

  test("forwarding through three wrappers", () => {
    const box = counting("v");

    // C5: forwarding is IDENTITY. Each hop passes the same Cell, so depth costs
    // nothing and the kind cannot change on the way.
    const one = (p: Record<string, unknown>): Record<string, unknown> => props([p]);
    const two = (p: Record<string, unknown>): Record<string, unknown> =>
      one(mergeProps(p, { hop: cell(2) }));
    const three = (p: Record<string, unknown>): Record<string, unknown> =>
      two(merge(p, { hop: cell(3) }));

    const forwarded = three({ x: box.carrier });

    expect(box.reads).toBe(0);
    expect(forwarded.x).toBe(box.carrier);
    expect((forwarded.x as () => string)()).toBe("v");
    expect(box.reads).toBe(1);
  });

  test("every operation in sequence, on one carrier", () => {
    const box = counting("v");
    let carried: Record<string, unknown> = { x: box.carrier };
    carried = { ...carried };
    carried = Object.assign({}, carried);
    carried = mergeProps(carried, { pad: cell(0) });
    carried = omit(carried, "pad");
    const [split] = splitProps(carried, ["x"]);
    for (const _key in split) {
      // walking the keys is itself one of the eight operations
    }
    const { ...rest } = split;

    expect(box.reads).toBe(0);
    expect((rest.x as () => string)()).toBe("v");
    expect(box.reads).toBe(1);
  });
});

describe("the source list", () => {
  test("one plain record is returned unchanged", () => {
    const only = { x: cell(1) };
    expect(props([only])).toBe(only);
  });

  test("later sources win, and a merge over a merge stays flat", () => {
    const inner = props([{ a: cell(1) }, { b: cell(2) }]);
    const outer = props([inner, { b: cell(3) }]);

    expect((outer.a as () => number)()).toBe(1);
    expect((outer.b as () => number)()).toBe(3);
    // $ concatenates rather than nesting: three records, not a record and a proxy.
    expect((outer as unknown as { $: unknown[] }).$.length).toBe(3);
  });

  test("mergeProps skips a later undefined; merge treats it as a value", () => {
    expect(mergeProps({ x: cell(1) }, { x: undefined }).x).not.toBeUndefined();
    expect(merge({ x: cell(1) }, { x: undefined }).x).toBeUndefined();
  });

  test("ownKeys and has union the list", () => {
    const view = props([{ a: cell(1) }, { b: cell(2) }, null]);
    expect(Object.keys(view).toSorted()).toEqual(["a", "b"]);
    expect("a" in view).toBe(true);
    expect("c" in view).toBe(false);
  });

  test("a filtered view does not republish the list it filtered", () => {
    // Otherwise a consumer that spliced `$` back in would resurrect the keys
    // `omit` exists to remove.
    const rest = omit({ x: cell(1), secret: cell(2) }, "secret");
    const rebuilt = props([rest]);
    expect("secret" in rebuilt).toBe(false);
  });

  test("a view is LIVE: it reads the source list, it does not snapshot it", () => {
    const source: Record<string, unknown> = { x: cell(1) };
    const view = props([source, { y: cell(2) }]);
    source.x = cell(9);
    expect((view.x as () => number)()).toBe(9);
  });
});

describe("cell", () => {
  test("evaluates once, so an identity-observable prop keeps its identity", () => {
    const handler = (): void => {};
    const carrier = cell(handler);
    expect(carrier()).toBe(handler);
    expect(carrier()).toBe(carrier());
  });

  test("a Cell is arity-tolerant: cell($s) and cell() are one call", () => {
    const carrier = cell(7);
    const scoped = carrier as unknown as (s: unknown) => number;
    expect(scoped(Symbol("scope"))).toBe(carrier());
  });

  test("a signal accessor is already a Cell, so forwarding needs no wrapper", () => {
    const count = signal(3);
    const view = props([{ n: count }]);
    expect(view.n).toBe(count);
    expect((view.n as () => number)()).toBe(3);
  });
});

/**
 * The claim is about the SOURCE LIST, and the eight named operations do not
 * test it: they read zero because the carrier is a thunk, and an eager
 * plain-object copy of a props record passes every one of them. What the source
 * list buys is that a view READS the list, so these are the cases a copy cannot
 * pass and they are what the claim rests on.
 */
describe("the source list is a view, not a copy", () => {
  test("a key added to a source AFTER the view was built is visible through it", () => {
    // The case an eager copy cannot pass. A copy fixes both the key set and the
    // carriers at construction; a view resolves each read against the sources.
    const later: Record<string, unknown> = { a: () => "first" };
    const view = props([{ base: () => "b" }, later]);
    expect((view.a as () => string)()).toBe("first");
    expect("added" in view).toBe(false);
    expect(Object.keys(view).toSorted()).toEqual(["a", "base"]);

    later.a = (): string => "second";
    later.added = (): string => "new key";

    expect((view.a as () => string)()).toBe("second");
    expect("added" in view).toBe(true);
    expect(Object.keys(view).toSorted()).toEqual(["a", "added", "base"]);
    expect((view.added as () => string)()).toBe("new key");
  });

  test("the fixed part is the LIST: `props([one])` hands the record straight back", () => {
    // Stated because it is the case that makes the test above need two sources.
    // One plain record is returned unchanged — the overwhelming case allocates
    // nothing — so what a consumer holds there IS the caller's record, and the
    // liveness is the record's own.
    const only: Record<string, unknown> = { a: () => "first" };
    expect(props([only])).toBe(only);
  });

  test("a merge over a merge stays FLAT, so forwarding depth is not proxy depth", () => {
    const one = props([{ x: () => 1 }]);
    const two = merge(one, { y: () => 2 });
    const three = merge(two, { z: () => 3 });
    const list = three[SOURCES];
    expect(Array.isArray(list)).toBe(true);
    expect((list as unknown[]).some((s) => s === two)).toBe(false);
    expect(Object.keys(three).toSorted()).toEqual(["x", "y", "z"]);
  });
});
