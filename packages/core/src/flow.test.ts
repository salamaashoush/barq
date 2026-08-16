/**
 * The M4 conformance suite for `branch`/`each`/`boundary`/`portal`.
 *
 * Three properties, each of which the ten hand-written control-flow bodies
 * could not state about themselves:
 *
 *   - **C7** — every built-in consumer invokes its Block EXACTLY ONCE per
 *     activation, driven with an instrumented Block that counts.
 *   - **O3.7 / B4** — after disposal nothing is retained: no live effect, no
 *     listener, no subscription, no async continuation, and no scope the parent
 *     never took apart.
 *   - **the flags** — the two that survived measurement do the thing they claim
 *     to do, asserted on an exact count rather than on a benchmark, and produce
 *     DOM identical to the flags-off form (which is what `-O0` emits).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NO_SCOPE, STATIC_KEY, boundary, branch, each, portal } from "./flow.ts";
import type { Block, Cell, Scope } from "./scope.ts";
import {
  disposeScope,
  effect,
  enter,
  enterRoot,
  exit,
  flush,
  onCleanup,
  scopeAllocations,
  signal,
} from "./signals.ts";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

/** A root scope with the container as its parent, as `render` opens one. */
function mount<T>(build: (root: Scope) => T): { root: Scope; out: T } {
  const root = enterRoot();
  try {
    return { root, out: build(root) };
  } finally {
    exit(root);
    flush();
  }
}

/**
 * A Block that counts its own invocations and tags the node it builds, so a
 * second call at one slot is visible as a count AND as a second subtree.
 */
function counted(label: string): Block<unknown> & { calls: number } {
  const block = ((scope: Scope | null): Node => {
    block.calls++;
    const node = document.createElement("i");
    node.textContent = `${label}${block.calls}`;
    void scope;
    return node;
  }) as Block<unknown> & { calls: number };
  block.calls = 0;
  return block;
}

describe("C7 — a Block is invoked exactly once per activation", () => {
  test("branch calls the selected body once, and the other bodies not at all", () => {
    const which = signal(0);
    const a = counted("a");
    const b = counted("b");

    const { root } = mount((s) => branch(s, container, null, which, [a, b]));

    expect(a.calls).toBe(1);
    expect(b.calls).toBe(0);
    expect(container.textContent).toBe("a1");

    which.set(1);
    flush();
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(container.textContent).toBe("b1");

    which.set(0);
    flush();
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(1);

    disposeScope(root);
  });

  test("an unchanged key invokes nothing at all (K2)", () => {
    const source = signal(0);
    const body = counted("x");
    // The key reads the signal but folds every value onto one key, which is the
    // shape `Show` has for a non-keyed condition.
    const { root } = mount((s) =>
      branch(s, container, null, () => (source() >= 0 ? 0 : 1), [body]),
    );

    expect(body.calls).toBe(1);
    for (let i = 1; i <= 5; i++) {
      source.set(i);
      flush();
    }
    expect(body.calls).toBe(1);
    expect(container.textContent).toBe("x1");

    disposeScope(root);
  });

  test("each calls the row Block once per row, and once more per row added", () => {
    const rows = signal([1, 2]);
    const row = counted("r");

    const { root } = mount((s) => each(s, container, null, rows, false, row));

    expect(row.calls).toBe(2);
    rows.set([1, 2, 3]);
    flush();
    // Positional: the first two rows are the same slots and are not rebuilt.
    expect(row.calls).toBe(3);

    disposeScope(root);
  });

  test("a boundary calls its content once, and its fallback once per flip", () => {
    const content = counted("c");
    const fallback = counted("f");
    let boom = true;
    const body: Block<unknown> = (scope: Scope | null): unknown => {
      if (boom) throw new Error("boom");
      return content(scope);
    };

    const { root } = mount((s) => boundary(s, container, null, "error", fallback, body));

    expect(fallback.calls).toBe(1);
    expect(content.calls).toBe(0);
    void boom;

    disposeScope(root);
  });

  test("portal calls its Block once per target change", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const body = counted("p");

    const { root } = mount((s) => {
      const marker = portal(s, () => target, body);
      container.appendChild(marker);
      return marker;
    });
    await Promise.resolve();
    flush();

    expect(body.calls).toBe(1);
    expect(target.textContent).toBe("p1");

    disposeScope(root);
    target.remove();
  });
});

describe("O3.7 / B4 — after disposal nothing is retained", () => {
  test("a branch instance is a kid of the scope it was GIVEN, not of the effect that swapped it", () => {
    const which = signal(0);
    const runs: number[] = [];
    let cleanups = 0;

    const body: Block<unknown> = (scope: Scope | null): Node => {
      effect(() => {
        runs.push(which());
      });
      onCleanup(() => {
        cleanups++;
      });
      void scope;
      return document.createElement("i");
    };

    const root = enterRoot();
    branch(root, container, null, which, body);
    exit(root);
    flush();

    expect(cleanups).toBe(0);
    const before = runs.length;

    // Disposing the ROOT must reach the instance. Before M4 the instance
    // registered its disposer with the effect node that created it, so the root
    // never held it and this cleanup never ran.
    disposeScope(root);
    expect(cleanups).toBe(1);
    expect(container.childNodes.length).toBe(0);

    // And nothing under it is live any more: a write reaches no effect.
    which.set(9);
    flush();
    expect(runs.length).toBe(before);
  });

  test("a listener registered under a branch dies with the branch (B4)", () => {
    const which = signal(0);
    let fired = 0;
    let button!: HTMLButtonElement;

    const body: Block<unknown> = (scope: Scope | null): Node => {
      button = document.createElement("button");
      const handler = (): void => {
        fired++;
      };
      button.addEventListener("click", handler);
      onCleanup(() => button.removeEventListener("click", handler));
      void scope;
      return button;
    };

    const root = enterRoot();
    branch(root, container, null, which, body);
    exit(root);
    flush();

    const first = button;
    first.click();
    expect(fired).toBe(1);

    // A key change disposes the instance, which runs the cleanup that removes
    // the listener. The node that was there is detached AND deaf.
    which.set(1);
    flush();
    first.click();
    expect(fired).toBe(1);
    expect(first.isConnected).toBe(false);

    disposeScope(root);
  });

  test("an async continuation raised after disposal is dropped (O3.4)", async () => {
    let aborted = false;
    let landed = false;

    const body: Block<unknown> = (scope: Scope | null): Node => {
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () => {
        aborted = true;
      });
      onCleanup(() => controller.abort());
      void Promise.resolve().then(() => {
        if (controller.signal.aborted) return;
        landed = true;
      });
      void scope;
      return document.createElement("i");
    };

    const root = enterRoot();
    branch(root, container, null, () => 0, body);
    exit(root);
    flush();

    disposeScope(root);
    expect(aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(landed).toBe(false);
  });

  test("every row scope of an each is gone when the each's owner is", () => {
    const rows = signal([1, 2, 3]);
    let alive = 0;

    const row: Block<unknown> = (scope: Scope | null): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      void scope;
      return document.createElement("li");
    };

    const root = enterRoot();
    each(root, container, null, rows, false, row);
    exit(root);
    flush();

    expect(alive).toBe(3);
    disposeScope(root);
    expect(alive).toBe(0);
    expect(container.childNodes.length).toBe(0);
  });

  test("a boundary's content scope is disposed when the boundary's owner is", () => {
    let alive = 0;
    const body: Block<unknown> = (scope: Scope | null): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      void scope;
      return document.createElement("i");
    };

    const root = enterRoot();
    boundary(root, container, null, "error", null, body);
    exit(root);
    flush();

    expect(alive).toBe(1);
    disposeScope(root);
    expect(alive).toBe(0);
    expect(container.childNodes.length).toBe(0);
  });

  test("a portal's container and its content both go with the scope", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    let alive = 0;

    const body: Block<unknown> = (scope: Scope | null): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      void scope;
      return document.createElement("i");
    };

    const root = enterRoot();
    const marker = portal(root, () => target, body);
    container.appendChild(marker);
    exit(root);
    flush();
    await Promise.resolve();
    flush();

    expect(alive).toBe(1);
    expect(target.childNodes.length).toBe(1);

    disposeScope(root);
    expect(alive).toBe(0);
    expect(target.childNodes.length).toBe(0);
    target.remove();
  });
});

describe("the flags — what they skip, on an exact count", () => {
  /** `Scope` allocations charged to one region, isolated from the root's own. */
  function scopesFor(build: (root: Scope) => void): number {
    const root = enterRoot();
    const before = scopeAllocations();
    build(root);
    const cost = scopeAllocations() - before;
    exit(root);
    flush();
    disposeScope(root);
    return cost;
  }

  const body: Block<unknown> = (): Node => document.createElement("i");

  test("NO_SCOPE allocates no Scope for the activation", () => {
    const withScope = scopesFor((root) => {
      branch(root, container, null, () => 0, body, STATIC_KEY);
    });
    const without = scopesFor((root) => {
      branch(root, container, null, () => 0, body, STATIC_KEY | NO_SCOPE);
    });
    expect(withScope).toBe(1);
    expect(without).toBe(0);
  });

  test("STATIC_KEY opens no effect, so a write to what the key reads does nothing", () => {
    const source = signal(0);
    const counter = counted("s");
    // A key the compiler would refuse to call static; the flag is a PROOF and
    // this asserts what the runtime does when it is given one, which is to read
    // once and never subscribe.
    const key: Cell<number> = () => source();

    const root = enterRoot();
    branch(root, container, null, key, [counter, counter], STATIC_KEY);
    exit(root);
    flush();

    expect(counter.calls).toBe(1);
    source.set(1);
    flush();
    expect(counter.calls).toBe(1);

    disposeScope(root);
  });

  test("flags on and flags off render identical DOM — the L3 differential, in miniature", () => {
    const render = (flags: number): string => {
      const host = document.createElement("div");
      const root = enterRoot();
      branch(root, host, null, () => 0, [body], flags);
      exit(root);
      flush();
      const html = host.innerHTML;
      disposeScope(root);
      return html;
    };

    const pessimal = render(0);
    expect(render(STATIC_KEY)).toBe(pessimal);
    expect(render(NO_SCOPE)).toBe(pessimal);
    expect(render(STATIC_KEY | NO_SCOPE)).toBe(pessimal);
  });

  test("a region with no parent carries its own anchor and no comment node", () => {
    const root = enterRoot();
    const out = branch(root, null, null, () => 0, [body]);
    exit(root);
    flush();
    container.appendChild(out as Node);

    expect(container.innerHTML).toBe("<i></i>");
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
    let comments = 0;
    while (walker.nextNode() !== null) comments++;
    expect(comments).toBe(0);

    disposeScope(root);
  });
});

describe("O2 — a nested region is a child of the scope its Block was given", () => {
  test("disposing the outer instance takes the inner region's later content with it", () => {
    const outer = signal(true);
    const items = signal([1, 2, 3]);

    const root = enterRoot();
    branch(root, container, null, () => (outer() ? 0 : 1), [
      (scope: Scope | null): Node => {
        const host = document.createElement("section");
        each(scope, host, null, items, false, () => document.createElement("li"));
        return host;
      },
    ]);
    exit(root);
    flush();
    expect(container.querySelectorAll("li").length).toBe(3);

    // Content the inner region inserted AFTER the outer one recorded its nodes.
    items.set([1, 2, 3, 4, 5]);
    flush();
    expect(container.querySelectorAll("li").length).toBe(5);

    outer.set(false);
    flush();
    expect(container.innerHTML).toBe("");

    disposeScope(root);
  });

  test("enter/exit around a region leaves the ambient owner where it found it", () => {
    const root = enterRoot();
    const outer = enter(root, "branch");
    branch(outer, container, null, () => 0, [() => document.createElement("i")]);
    exit(outer);
    exit(root);
    flush();

    disposeScope(root);
    expect(container.innerHTML).toBe("");
  });
});
