/**
 * Reveal coordination + Loading revalidation semantics (Solid 2.0).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { boundary, reveal } from "./flow.ts";
import type { Scope } from "./scope.ts";
import { render } from "./dom.ts";
import { NotReadyError, computed, createScope, flush, signal } from "./signals.ts";

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

    createScope(() => {
      const el = boundary(
        null,
        null,
        null,
        "loading",
        document.createTextNode("loading..."),
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

    createScope((_dispose, scope) => {
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
            document.createTextNode("[fa]"),
            asyncChild(() => dataA(), "A"),
          ),
          boundary(
            inner,
            null,
            null,
            "loading",
            document.createTextNode("[fb]"),
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
});
