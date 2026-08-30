/**
 * Reveal coordination + Loading revalidation semantics (Solid 2.0).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { boundary, branch, reveal } from "./flow.ts";
import type { Scope } from "./scope.ts";
import { render } from "./dom.ts";
import { NotReadyError, computed, scope, flush, signal } from "./signals.ts";

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Async value resolved manually */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function asyncChild(data: () => string, label: string) {
  return () => {
    try {
      return document.createTextNode(`${label}:${data()}`);
    } catch (err) {
      if (err instanceof NotReadyError) throw err;
      throw err;
    }
  };
}

/** One loading boundary under `s`: `[fX]` while pending, `X:value` once settled */
function leaf(s: Scope | null, data: () => string, label: string) {
  return boundary(
    s,
    null,
    null,
    "loading",
    () => document.createTextNode(`[f${label}]`),
    asyncChild(data, label),
  );
}

describe("Loading revalidation", () => {
  test("fallback only for initial readiness; revalidation keeps stale content", async () => {
    const source = signal(1);
    const d1 = deferred<string>();
    let d2: ReturnType<typeof deferred<string>> | null = null;
    const data = computed(async () => {
      const v = source();
      if (v === 1) return d1.promise;
      d2 = deferred<string>();
      return d2.promise;
    });

    scope(() => {
      const el = boundary(
        null,
        null,
        null,
        "loading",
        () => document.createTextNode("loading..."),
        asyncChild(() => data(), "v"),
      );
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("loading...");

    d1.resolve("one");
    await tick();
    flush();
    expect(container.textContent).toBe("v:one");

    // Revalidate: stale content stays, no fallback
    source.set(2);
    flush();
    await tick();
    flush();
    expect(container.textContent).toBe("v:one");

    d2!.resolve("two");
    await tick();
    flush();
    expect(container.textContent).toBe("v:two");
  });
});

describe("Reveal", () => {
  function setup(order: "sequential" | "together" | "natural", collapsed = false) {
    const a = deferred<string>();
    const b = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);

    scope((_dispose, scope) => {
      // Children as a BLOCK: the boundaries are constructed under the scope
      // `reveal` hands over, which is the only way they reach the coordinator
      // it installed. A thunk that ignored the scope would build them under
      // whatever was ambient, and the coordinator would never be found.
      const el = reveal(
        scope,
        () => order,
        () => collapsed,
        (inner: Scope | null) => [
          boundary(
            inner,
            null,
            null,
            "loading",
            () => document.createTextNode("[fa]"),
            asyncChild(() => dataA(), "A"),
          ),
          boundary(
            inner,
            null,
            null,
            "loading",
            () => document.createTextNode("[fb]"),
            asyncChild(() => dataB(), "B"),
          ),
        ],
      );
      render(() => el, container);
    });
    flush();
    return { a, b };
  }

  test("together: nothing reveals until all are ready", async () => {
    const { a, b } = setup("together");
    expect(container.textContent).toBe("[fa][fb]");

    a.resolve("1");
    await tick();
    flush();
    // A ready but B not: both still fallback
    expect(container.textContent).toBe("[fa][fb]");

    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2");
  });

  test("sequential: B cannot reveal before A even if ready first", async () => {
    const { a, b } = setup("sequential");
    expect(container.textContent).toBe("[fa][fb]");

    b.resolve("2");
    await tick();
    flush();
    // B ready, but frontier is at A: B keeps fallback
    expect(container.textContent).toBe("[fa][fb]");

    a.resolve("1");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2");
  });

  test("sequential collapsed: boundaries past the frontier render nothing", async () => {
    const { a } = setup("sequential", true);
    // A is the frontier (shows fallback); B renders nothing
    expect(container.textContent).toBe("[fa]");

    a.resolve("1");
    await tick();
    flush();
    // A revealed; B becomes the frontier and shows its fallback
    expect(container.textContent).toBe("A:1[fb]");
  });

  test("natural: each boundary reveals independently", async () => {
    const { b } = setup("natural");
    expect(container.textContent).toBe("[fa][fb]");

    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("[fa]B:2");
  });

  test("sequential is the default order", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => undefined,
        () => undefined,
        (inner: Scope | null) => [leaf(inner, dataA, "A"), leaf(inner, dataB, "B")],
      );
      render(() => el, container);
    });
    flush();

    b.resolve("2");
    await tick();
    flush();
    // Under `natural` — the old default, and the one the DOM, SSR and component
    // spellings each carried while the `revealOrder` primitive beside them said
    // `sequential` — B would already read `B:2` here.
    expect(container.textContent).toBe("[fA][fB]");

    a.resolve("1");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2");
  });
});

/**
 * A6 — a nested group is ONE composite slot in the enclosing one.
 *
 * Each of these observes a moment at which the inner group's own order and the
 * outer's disagree, because a flat group behaves identically under either
 * design: the `describe` above is the whole of what the old flat coordinator
 * could see.
 */
describe("Reveal nesting", () => {
  test("outer sequential holds a nested group as one slot, then releases it to run locally", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);
    const dataC = computed(() => c.promise);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "sequential",
        () => false,
        (outer: Scope | null) => [
          leaf(outer, dataA, "A"),
          reveal(
            outer,
            () => "natural",
            () => false,
            (inner: Scope | null) => [leaf(inner, dataB, "B"), leaf(inner, dataC, "C")],
          ),
        ],
      );
      render(() => el, container);
    });
    flush();
    expect(container.textContent).toBe("[fA][fB][fC]");

    // B settles while the outer frontier is still on A. The inner group is the
    // outer's slot 1 and is held, so B's own `natural` order does not run yet —
    // which is the one thing a group that registered no slot at all could not
    // express, and what the flat coordinator did was show `B:2` here.
    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("[fA][fB][fC]");

    // A settles; the inner group becomes the frontier and is RELEASED rather
    // than held, so it runs `natural` locally over what is still pending.
    a.resolve("1");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2[fC]");

    c.resolve("3");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2C:3");
  });

  test("the outer waits on a composite's FULL readiness before advancing past it", async () => {
    const b = deferred<string>();
    const c = deferred<string>();
    const d = deferred<string>();
    const dataB = computed(() => b.promise);
    const dataC = computed(() => c.promise);
    const dataD = computed(() => d.promise);

    // `collapsed` is what makes "the frontier advanced" observable at all: past
    // the frontier a slot renders NOTHING rather than a fallback, so the moment
    // D's `[fD]` appears is the moment the outer decided the group was done.
    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "sequential",
        () => true,
        (outer: Scope | null) => [
          reveal(
            outer,
            () => "sequential",
            () => false,
            (inner: Scope | null) => [leaf(inner, dataB, "B"), leaf(inner, dataC, "C")],
          ),
          leaf(outer, dataD, "D"),
        ],
      );
      render(() => el, container);
    });
    flush();
    // The group is the outer's frontier, so it is released and runs its own
    // sequential order under its OWN collapsed policy, which is false.
    expect(container.textContent).toBe("[fB][fC]");

    b.resolve("2");
    await tick();
    flush();
    // The inner frontier advanced, so the group is now minimally ready. The
    // OUTER one did not advance: `sequential` waits on `ready`, which is every
    // slot, and C is still pending. Reading the group with one predicate — or
    // with `minimallyReady`, which is the one `together` uses — puts `[fD]` on
    // the page here.
    expect(container.textContent).toBe("B:2[fC]");

    c.resolve("3");
    await tick();
    flush();
    expect(container.textContent).toBe("B:2C:3[fD]");

    d.resolve("4");
    await tick();
    flush();
    expect(container.textContent).toBe("B:2C:3D:4");
  });

  test("outer together releases on MINIMAL readiness, not full readiness", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);
    const dataC = computed(() => c.promise);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "together",
        () => false,
        (outer: Scope | null) => [
          leaf(outer, dataA, "A"),
          reveal(
            outer,
            () => "sequential",
            () => false,
            (inner: Scope | null) => [leaf(inner, dataB, "B"), leaf(inner, dataC, "C")],
          ),
        ],
      );
      render(() => el, container);
    });
    flush();
    expect(container.textContent).toBe("[fA][fB][fC]");

    a.resolve("1");
    await tick();
    flush();
    expect(container.textContent).toBe("[fA][fB][fC]");

    // B is the inner sequential's FIRST slot, so the inner group is now
    // minimally ready even though C is still pending — and `together` releases
    // on that. A coordinator with one predicate waits for C here, and the
    // cohesive reveal `together` exists to give never happens until the
    // slowest grandchild lands.
    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2[fC]");

    c.resolve("3");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2C:3");
  });

  test("outer natural always releases a composite", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);
    const dataC = computed(() => c.promise);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "natural",
        () => false,
        (outer: Scope | null) => [
          leaf(outer, dataA, "A"),
          reveal(
            outer,
            () => "natural",
            () => false,
            (inner: Scope | null) => [leaf(inner, dataB, "B"), leaf(inner, dataC, "C")],
          ),
        ],
      );
      render(() => el, container);
    });
    flush();

    // The inner group runs its own order from the first frame: holding a
    // composite under `natural` would make the mode a `sequential` of one, and
    // nesting is the only reason the mode exists. Held-until-ready — the rule a
    // LEAF gets here — keeps B on its fallback until C lands too.
    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("[fA]B:2[fC]");

    c.resolve("3");
    await tick();
    flush();
    expect(container.textContent).toBe("[fA]B:2C:3");
  });

  test("a collapsed outer suppresses a held group's whole subtree", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "sequential",
        () => true,
        (outer: Scope | null) => [
          leaf(outer, dataA, "A"),
          reveal(
            outer,
            () => "natural",
            () => false,
            (inner: Scope | null) => [leaf(inner, dataB, "B")],
          ),
        ],
      );
      render(() => el, container);
    });
    flush();
    // The hold carries the outer's collapsed policy down the whole subtree; the
    // inner group's own `collapsed` (false) does not get a say while it is held.
    expect(container.textContent).toBe("[fA]");

    a.resolve("1");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1[fB]");

    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("A:1B:2");
  });

  test("a disposed boundary leaves the group instead of holding its frontier", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const dataA = computed(() => a.promise);
    const dataB = computed(() => b.promise);
    const present = signal(0);

    scope((_dispose, s) => {
      const el = reveal(
        s,
        () => "sequential",
        () => false,
        (outer: Scope | null) => [
          branch(outer, null, null, () => present(), [
            (inner: Scope | null) => leaf(inner, dataA, "A"),
            () => null,
          ]),
          leaf(outer, dataB, "B"),
        ],
      );
      render(() => el, container);
    });
    flush();
    expect(container.textContent).toBe("[fA][fB]");

    b.resolve("2");
    await tick();
    flush();
    expect(container.textContent).toBe("[fA][fB]");

    // A's boundary is torn down without ever settling. Its registration goes
    // with it, so the frontier advances onto B — where a slot list that only
    // grows pins the group on an index nothing will ever fill.
    present.set(1);
    flush();
    expect(container.textContent).toBe("B:2");
  });
});
