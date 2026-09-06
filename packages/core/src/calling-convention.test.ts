/**
 * The calling convention, falsified rather than asserted.
 *
 * Ownership is AMBIENT. A component is a function of its props and a Block
 * takes only what its construct hands it; neither carries a scope, because the
 * runtime enters the scope a body belongs to before it invokes it.
 *
 * That is a weaker-looking rule than the one it replaces, so the claims below
 * are written so the default answer and the correct one are different objects:
 * each arranges for the ambient owner at the DEFINITION site to differ from the
 * one the body must actually run under. An implementation that captured the
 * owner where a body was written, instead of entering the right one before the
 * call, passes none of them.
 */

import { describe, expect, test } from "bun:test";
import { Errored, For, Show } from "./components.ts";
import {
  block,
  context,
  flush,
  getContext,
  getOwner,
  onCleanup,
  pin,
  provideOn,
  scope,
  signal,
} from "./signals.ts";
import { provide } from "./scope.ts";
import type { Scope } from "./scope.ts";
import { insert } from "./dom.ts";

function chain(s: Scope | null, names: Map<Scope, string>): string {
  const out: string[] = [];
  for (let at = s; at !== null; at = at.parent) out.push(names.get(at) ?? "anon");
  out.push("null");
  return out.join(" -> ");
}

describe("a construct's body runs under the scope the construct opened", () => {
  for (const [label, run] of [
    ["Show", (kid: () => Node) => Show({ when: () => true, children: kid })],
    ["For", (kid: () => Node) => For({ each: () => [1], children: (_i: unknown) => kid() })],
    [
      "Errored",
      (kid: () => Node) => Errored({ fallback: () => document.createTextNode("x"), children: kid }),
    ],
  ] as const) {
    test(`${label}: the child's owner descends from the caller, and is not the caller`, () => {
      const names = new Map<Scope, string>();
      let childOwner: Scope | null = null;
      let outerScope!: Scope;

      scope((_dispose, outer) => {
        outerScope = outer;
        names.set(outer, "outer");
        const kid = block((): Node => {
          childOwner = getOwner();
          return document.createTextNode("k");
        });
        // The body has not run yet, so nothing about the definition site can
        // be mistaken for the answer.
        expect(childOwner).toBeNull();
        run(kid);
        flush();
      }, true);

      expect(childOwner).not.toBeNull();
      // A fresh scope UNDER the caller, not the caller itself: that is what
      // makes one activation disposable without touching the next.
      expect(childOwner).not.toBe(outerScope);
      expect(chain(childOwner, names)).toContain("outer");
    });
  }
});

describe("a Block invoked outside a construct uses the ambient owner", () => {
  test("its cleanups are filed on whatever scope is current WHEN IT RUNS", () => {
    let disposed = 0;
    const body = block((): number => {
      onCleanup(() => disposed++);
      return 1;
    });

    // Defined outside every scope, invoked inside one: the scope that owns the
    // cleanup is the one current at the CALL, which is the whole claim.
    const dispose = scope((d) => {
      body();
      return d;
    }, true);

    expect(disposed).toBe(0);
    dispose();
    expect(disposed).toBe(1);
  });

  test("the brand travels with the value, so kind is never guessed from arity", () => {
    const body = block((): number => 1);
    expect((body as unknown as Record<symbol, boolean>)[Symbol.for("barq.block")]).toBe(true);
  });
});

describe("insert owns what it places on the scope that is current", () => {
  test("a function child dies with the scope insert ran under", () => {
    const parent = document.createElement("div");
    let disposed = 0;

    const dispose = scope((d) => {
      insert(parent, () => {
        onCleanup(() => disposed++);
        return "x";
      });
      flush();
      return d;
    }, true);

    expect(parent.textContent).toBe("x");
    expect(disposed).toBe(0);
    dispose();
    expect(disposed).toBe(1);
  });

  test("and so does a child inside an ARRAY — the fragment case", () => {
    const parent = document.createElement("div");
    let disposed = 0;

    const dispose = scope((d) => {
      insert(parent, [
        () => {
          onCleanup(() => disposed++);
          return "a";
        },
        "b",
      ]);
      flush();
      return d;
    }, true);

    expect(parent.textContent).toBe("ab");
    dispose();
    expect(disposed).toBe(1);
  });
});

describe("pin overrides the ambient owner", () => {
  test("a pinned Block ignores what is current and uses what it was pinned to", () => {
    let pinnedOwner!: Scope | null;
    let target!: Scope;

    scope((_d, a) => {
      target = a;
    }, true);

    const body = pin(target, () => {
      pinnedOwner = getOwner();
      return 1;
    });

    scope(() => {
      body();
    }, true);

    expect(pinnedOwner).toBe(target);
  });
});

describe("a Provider binds on the scope its children run under", () => {
  test("a consumer under the provider reads the provided value", () => {
    const ctx = context<string>("default");
    const seen: string[] = [];

    scope(() => {
      provide(
        ctx,
        () => "provided",
        () => {
          seen.push(getContext(ctx));
          return "built";
        },
      );
    }, true);

    expect(seen).toEqual(["provided"]);
  });

  test("a binding installed on one scope is invisible to a sibling", () => {
    const ctx = context<string>("default");
    let inSibling = "";

    scope(() => {
      const a = scope((_d2, s) => s);
      provideOn(a, ctx.id, () => "only-a");
      scope(() => {
        inSibling = getContext(ctx);
      });
    }, true);

    expect(inSibling).toBe("default");
  });
});

describe("a component is a function of its props", () => {
  test("its reactive work is owned by the caller's scope and dies with it", () => {
    const count = signal(0);
    let runs = 0;
    let disposed = 0;

    function Counter(props: { by: number }): number {
      onCleanup(() => disposed++);
      return count() * props.by;
    }

    const dispose = scope((d) => {
      insert(document.createElement("div"), () => {
        runs++;
        return String(Counter({ by: 2 }));
      });
      flush();
      return d;
    }, true);

    expect(runs).toBe(1);
    count.set(3);
    flush();
    expect(runs).toBe(2);
    dispose();
    expect(disposed).toBeGreaterThan(0);
  });
});
