/**
 * Reveal coordination + Loading revalidation semantics (Solid 2.0).
 */

import { rooted } from "../../core/src/test-root.ts";
import { beforeEach, describe, expect, test } from "bun:test";
import { boundary, branch, reveal } from "./dom-flow.ts";
import { render } from "./dom.ts";
import { createMemo, createRoot, flush, createSignal, createRenderEffect } from "@barqjs/core";

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

/** A text node bound to `data`, the way a compiled `{data()}` hole is. */
function asyncChild(data: () => string, label: string) {
  return () => {
    const text = document.createTextNode("");
    createRenderEffect(
      () => `${label}:${data()}`,
      (value) => {
        text.data = value;
      },
    );
    return text;
  };
}

/** One loading boundary under `s`: `[fX]` while pending, `X:value` once settled */
function leaf(data: () => string, label: string) {
  return boundary(
    null,
    null,
    "loading",
    () => document.createTextNode(`[f${label}]`),
    asyncChild(data, label),
  );
}

describe("Loading revalidation", () => {
  test(
    "fallback only for initial readiness; revalidation keeps stale content",
    rooted(async () => {
      const [source, setSource] = createSignal(1);
      const d1 = deferred<string>();
      let d2: ReturnType<typeof deferred<string>> | null = null;
      const data = createMemo(async () => {
        const v = source();
        if (v === 1) return d1.promise;
        d2 = deferred<string>();
        return d2.promise;
      });

      createRoot(() => {
        const el = boundary(
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
      setSource(2);
      flush();
      await tick();
      flush();
      expect(container.textContent).toBe("v:one");

      d2!.resolve("two");
      await tick();
      flush();
      expect(container.textContent).toBe("v:two");
    }),
  );
});

describe("Reveal", () => {
  function setup(order: "sequential" | "together" | "natural", collapsed = false) {
    const a = deferred<string>();
    const b = deferred<string>();
    const dataA = createMemo(() => a.promise);
    const dataB = createMemo(() => b.promise);

    createRoot((_dispose) => {
      // Children as a BLOCK: the boundaries are constructed under the scope
      // `reveal` hands over, which is the only way they reach the coordinator
      // it installed. A thunk that ignored the scope would build them under
      // whatever was ambient, and the coordinator would never be found.
      const el = reveal(
        () => order,
        () => collapsed,
        () => [
          boundary(
            null,
            null,
            "loading",
            () => document.createTextNode("[fa]"),
            asyncChild(() => dataA(), "A"),
          ),
          boundary(
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

  test(
    "together: nothing reveals until all are ready",
    rooted(async () => {
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
    }),
  );

  test(
    "sequential: B cannot reveal before A even if ready first",
    rooted(async () => {
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
    }),
  );

  test(
    "sequential collapsed: boundaries past the frontier render nothing",
    rooted(async () => {
      const { a } = setup("sequential", true);
      // A is the frontier (shows fallback); B renders nothing
      expect(container.textContent).toBe("[fa]");

      a.resolve("1");
      await tick();
      flush();
      // A revealed; B becomes the frontier and shows its fallback
      expect(container.textContent).toBe("A:1[fb]");
    }),
  );

  test(
    "natural: each boundary reveals independently",
    rooted(async () => {
      const { b } = setup("natural");
      expect(container.textContent).toBe("[fa][fb]");

      b.resolve("2");
      await tick();
      flush();
      expect(container.textContent).toBe("[fa]B:2");
    }),
  );

  test(
    "sequential is the default order",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);

      createRoot((_dispose) => {
        const el = reveal(
          () => undefined,
          () => undefined,
          () => [leaf(dataA, "A"), leaf(dataB, "B")],
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
    }),
  );
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
  test(
    "outer sequential holds a nested group as one slot, then releases it to run locally",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const c = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);
      const dataC = createMemo(() => c.promise);

      createRoot((_dispose) => {
        const el = reveal(
          () => "sequential",
          () => false,
          () => [
            leaf(dataA, "A"),
            reveal(
              () => "natural",
              () => false,
              () => [leaf(dataB, "B"), leaf(dataC, "C")],
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
    }),
  );

  test(
    "the outer waits on a composite's FULL readiness before advancing past it",
    rooted(async () => {
      const b = deferred<string>();
      const c = deferred<string>();
      const d = deferred<string>();
      const dataB = createMemo(() => b.promise);
      const dataC = createMemo(() => c.promise);
      const dataD = createMemo(() => d.promise);

      // `collapsed` is what makes "the frontier advanced" observable at all: past
      // the frontier a slot renders NOTHING rather than a fallback, so the moment
      // D's `[fD]` appears is the moment the outer decided the group was done.
      createRoot((_dispose) => {
        const el = reveal(
          () => "sequential",
          () => true,
          () => [
            reveal(
              () => "sequential",
              () => false,
              () => [leaf(dataB, "B"), leaf(dataC, "C")],
            ),
            leaf(dataD, "D"),
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
    }),
  );

  test(
    "outer together releases on MINIMAL readiness, not full readiness",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const c = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);
      const dataC = createMemo(() => c.promise);

      createRoot((_dispose) => {
        const el = reveal(
          () => "together",
          () => false,
          () => [
            leaf(dataA, "A"),
            reveal(
              () => "sequential",
              () => false,
              () => [leaf(dataB, "B"), leaf(dataC, "C")],
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
    }),
  );

  test(
    "outer natural always releases a composite",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const c = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);
      const dataC = createMemo(() => c.promise);

      createRoot((_dispose) => {
        const el = reveal(
          () => "natural",
          () => false,
          () => [
            leaf(dataA, "A"),
            reveal(
              () => "natural",
              () => false,
              () => [leaf(dataB, "B"), leaf(dataC, "C")],
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
    }),
  );

  test(
    "a collapsed outer suppresses a held group's whole subtree",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);

      createRoot((_dispose) => {
        const el = reveal(
          () => "sequential",
          () => true,
          () => [
            leaf(dataA, "A"),
            reveal(
              () => "natural",
              () => false,
              () => [leaf(dataB, "B")],
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
    }),
  );

  test(
    "a disposed boundary leaves the group instead of holding its frontier",
    rooted(async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const dataA = createMemo(() => a.promise);
      const dataB = createMemo(() => b.promise);
      const [present, setPresent] = createSignal(0);

      createRoot((_dispose) => {
        const el = reveal(
          () => "sequential",
          () => false,
          () => [
            branch(null, null, () => present(), [() => leaf(dataA, "A"), () => null]),
            leaf(dataB, "B"),
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
      setPresent(1);
      flush();
      expect(container.textContent).toBe("B:2");
    }),
  );
});
