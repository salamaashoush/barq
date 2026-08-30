/**
 * A8 — commit #0.
 *
 * `loadingValue` makes a node BORN holding a value. While the first answer is
 * in flight the node reads as SETTLED everywhere: no throw, no boundary
 * suspends, `isPending` false. First-load affordances come from the value
 * itself rather than from a fallback. Once the first answer lands the loading
 * value leaves the lineage for good, and a refetch is an ordinary
 * revalidation — stale value shown, `isPending` true.
 *
 * The two states are disjoint, which is why every claim here observes the
 * SECOND flight as well as the first: a rule that only ever looked at the
 * loading window is satisfied by a node that simply never reports pending.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { resource } from "./async.ts";
import { boundary } from "./flow.ts";
import { render } from "./dom.ts";
import { NotReadyError, computed, flush, isPending, latest, scope, signal } from "./signals.ts";

const tick = (ms = 0) => new Promise((res) => setTimeout(res, ms));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Reads the node, reporting the pending throw rather than propagating it */
function read<T>(node: () => T): T | "THREW" {
  try {
    return node();
  } catch (err) {
    if (err instanceof NotReadyError) return "THREW";
    throw err;
  }
}

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("A8: the loading window", () => {
  test("the node is born holding commit #0 and never throws while the first answer is in flight", async () => {
    const d = deferred<string>();
    const node = computed<string>(() => d.promise, { loadingValue: "skeleton" });

    expect(read(node)).toBe("skeleton");
    // Not pending, and not merely "pending but readable": commit #0 answers the
    // question by declaration, so there is nothing for a boundary to wait on.
    expect(isPending(() => node())).toBe(false);
    expect(latest(() => node())).toBe("skeleton");

    d.resolve("real");
    await tick();
    flush();
    expect(read(node)).toBe("real");
  });

  test("the loading value leaves the lineage: a refetch is an ordinary revalidation", async () => {
    const source = signal(1);
    let current = deferred<string>();
    const node = computed<string>(
      () => {
        source();
        return current.promise;
      },
      { loadingValue: "skeleton" },
    );

    expect(read(node)).toBe("skeleton");
    expect(isPending(() => node())).toBe(false);

    current.resolve("first");
    await tick();
    flush();
    expect(read(node)).toBe("first");

    // Second flight. The window is CLOSED, so this is the ordinary contract and
    // it differs in every observable: the read THROWS, `latest()` is what
    // yields the stale value, and `isPending` is true. A node that simply never
    // reported pending would pass every claim above and fail all three here,
    // which is why the disjoint state has to be observed.
    current = deferred<string>();
    source.set(2);
    flush();
    expect(read(node)).toBe("THREW");
    expect(latest(() => node())).toBe("first");
    expect(isPending(() => node())).toBe(true);

    current.resolve("second");
    await tick();
    flush();
    expect(read(node)).toBe("second");
    expect(isPending(() => node())).toBe(false);
  });

  test("a Loading boundary above it shows CONTENT during the first flight, and stale content on the second", async () => {
    const source = signal(1);
    let current = deferred<string>();
    const node = computed<string>(
      () => {
        source();
        return current.promise;
      },
      { loadingValue: "skeleton" },
    );

    scope(() => {
      // The body reads DIRECTLY, so a pending read throws into the boundary —
      // which is the only way the boundary can be the thing under test.
      const el = boundary(
        null,
        null,
        null,
        "loading",
        () => document.createTextNode("[fallback]"),
        () => document.createTextNode(node()),
      );
      render(el, container);
    });
    flush();

    // The whole point: no fallback, ever, for a node that declared commit #0.
    expect(container.textContent).toBe("skeleton");

    current.resolve("first");
    await tick();
    flush();
    expect(container.textContent).toBe("first");

    current = deferred<string>();
    source.set(2);
    flush();
    await tick();
    flush();
    // Revalidation keeps stale content — the ordinary rule, not the window's.
    expect(container.textContent).toBe("first");
  });

  test("commit #0 is the compute's first `prev`", async () => {
    const seen: (number | undefined)[] = [];
    const d = deferred<number>();
    const node = computed<number>(
      (prev) => {
        seen.push(prev);
        return d.promise;
      },
      { loadingValue: 41 },
    );

    read(node);
    expect(seen).toEqual([41]);

    d.resolve(42);
    await tick();
    flush();
    expect(read(node)).toBe(42);
  });

  test("an unready SOURCE during the window keeps commit #0 serving rather than propagating", async () => {
    const upstream = deferred<string>();
    const dep = computed<string>(() => upstream.promise);
    const node = computed<string>(() => `<${dep()}>`, { loadingValue: "skeleton" });

    // `dep` throws NotReady synchronously. That is the SOURCE's pendingness and
    // not this node's; commit #0 covers the window, and nothing downstream is
    // marked pending.
    expect(read(node)).toBe("skeleton");
    expect(isPending(() => node())).toBe(false);

    upstream.resolve("v");
    await tick();
    flush();
    // The link the throwing read established is what re-runs us.
    expect(read(node)).toBe("<v>");
  });

  test("a rejection ends the window: the error is the node's, not covered for", async () => {
    const d = deferred<string>();
    const node = computed<string>(() => d.promise, { loadingValue: "skeleton" });

    expect(read(node)).toBe("skeleton");

    d.reject(new Error("refused"));
    await tick();
    flush();
    expect(() => node()).toThrow("refused");
  });

  test("`undefined` is a legal placeholder, so the option's PRESENCE is what opens the window", async () => {
    const d = deferred<string>();
    const declared = computed<string | undefined>(() => d.promise, { loadingValue: undefined });
    // Same compute, no option: the ordinary contract, which throws.
    const undeclared = computed<string>(() => d.promise);

    expect(read(declared)).toBe(undefined);
    expect(read(undeclared)).toBe("THREW");

    d.resolve("real");
    await tick();
    flush();
    expect(read(declared)).toBe("real");
    expect(read(undeclared)).toBe("real");
  });

  test("a synchronous compute closes the window on its first run", () => {
    const source = signal(1);
    const node = computed<number>(() => source() * 10, { loadingValue: -1 });

    // The plain value IS the first real answer, so the option costs a sync node
    // nothing beyond the seeded `prev`.
    expect(read(node)).toBe(10);
    source.set(2);
    flush();
    expect(read(node)).toBe(20);
  });
});

describe("A8: through `resource`", () => {
  test("the window is where an app actually wants it: no fallback, `loading()` false, `state()` ready", async () => {
    const d = deferred<string>();
    let dispose!: () => void;
    let r!: ReturnType<typeof resource<string>>;

    scope((d2) => {
      r = resource(
        () => null,
        () => d.promise,
        { loadingValue: "skeleton" },
      );
      dispose = d2;
      return d2;
    }, true);

    // The first read is what starts a lazy memo, and it must not throw.
    expect(read(r)).toBe("skeleton");
    expect(r.loading()).toBe(false);
    expect(r.state()).toBe("ready");

    d.resolve("real");
    await tick();
    flush();
    expect(read(r)).toBe("real");
    expect(r.state()).toBe("ready");

    dispose();
  });

  test("and a refetch after it is an ordinary revalidation", async () => {
    let current = deferred<string>();
    let dispose!: () => void;
    let r!: ReturnType<typeof resource<string>>;

    scope((d2) => {
      r = resource(
        () => null,
        () => current.promise,
        { loadingValue: "skeleton" },
      );
      dispose = d2;
      return d2;
    }, true);

    expect(read(r)).toBe("skeleton");
    current.resolve("first");
    await tick();
    flush();
    expect(read(r)).toBe("first");

    current = deferred<string>();
    void r.refetch();
    flush();
    // `refreshing`, not `pending`: the window is closed and there is a settled
    // value behind the flight, which is the ordinary contract.
    expect(r.state()).toBe("refreshing");
    expect(r.latest()).toBe("first");

    current.resolve("second");
    await tick();
    flush();
    expect(read(r)).toBe("second");
    dispose();
  });
});
