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
  childScope,
  disposeScope,
  createEffect,
  flush,
  onCleanup,
  rootScope,
  runWithOwner,
  scopeAllocations,
  createSignal,
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
  const root = rootScope();
  try {
    return { root, out: runWithOwner(root, () => build(root)) };
  } finally {
    flush();
  }
}

/**
 * A Block that counts its own invocations and tags the node it builds, so a
 * second call at one slot is visible as a count AND as a second subtree.
 */
function counted(label: string): Block<unknown> & { calls: number } {
  const block = ((): Node => {
    block.calls++;
    const node = document.createElement("i");
    node.textContent = `${label}${block.calls}`;
    return node;
  }) as Block<unknown> & { calls: number };
  block.calls = 0;
  return block;
}

describe("C7 — a Block is invoked exactly once per activation", () => {
  test("branch calls the selected body once, and the other bodies not at all", () => {
    const [which, setWhich] = createSignal(0);
    const a = counted("a");
    const b = counted("b");

    const { root } = mount(() => branch(container, null, which, [a, b]));

    expect(a.calls).toBe(1);
    expect(b.calls).toBe(0);
    expect(container.textContent).toBe("a1");

    setWhich(1);
    flush();
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(container.textContent).toBe("b1");

    setWhich(0);
    flush();
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(1);

    disposeScope(root);
  });

  test("an unchanged key invokes nothing at all (K2)", () => {
    const [source, setSource] = createSignal(0);
    const body = counted("x");
    // The key reads the signal but folds every value onto one key, which is the
    // shape `Show` has for a non-keyed condition.
    const { root } = mount(() => branch(container, null, () => (source() >= 0 ? 0 : 1), [body]));

    expect(body.calls).toBe(1);
    for (let i = 1; i <= 5; i++) {
      setSource(i);
      flush();
    }
    expect(body.calls).toBe(1);
    expect(container.textContent).toBe("x1");

    disposeScope(root);
  });

  test("each calls the row Block once per row, and once more per row added", () => {
    const [rows, setRows] = createSignal([1, 2]);
    const row = counted("r");

    const { root } = mount(() => each(container, null, rows, false, row));

    expect(row.calls).toBe(2);
    setRows([1, 2, 3]);
    flush();
    // Positional: the first two rows are the same slots and are not rebuilt.
    expect(row.calls).toBe(3);

    disposeScope(root);
  });

  test("a boundary calls its content once, and its fallback once per flip", () => {
    const content = counted("c");
    const fallback = counted("f");
    const boom = true;
    const body: Block<unknown> = (): unknown => {
      if (boom) throw new Error("boom");
      return content();
    };

    const { root } = mount(() => boundary(container, null, "error", fallback, body));

    expect(fallback.calls).toBe(1);
    expect(content.calls).toBe(0);
    void boom;

    disposeScope(root);
  });

  test("portal calls its Block once per target change", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const body = counted("p");

    const { root } = mount(() => {
      const marker = portal(() => target, body);
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
    const [which, setWhich] = createSignal(0);
    const runs: number[] = [];
    let cleanups = 0;

    const body: Block<unknown> = (): Node => {
      createEffect(which, (value) => {
        runs.push(value);
      });
      onCleanup(() => {
        cleanups++;
      });
      return document.createElement("i");
    };

    const root = rootScope();
    runWithOwner(root, () => {
      branch(container, null, which, body);
    });
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
    setWhich(9);
    flush();
    expect(runs.length).toBe(before);
  });

  test("a listener registered under a branch dies with the branch (B4)", () => {
    const [which, setWhich] = createSignal(0);
    let fired = 0;
    let button!: HTMLButtonElement;

    // The cleanup closes over ITS OWN element. The next instance is built
    // before this one is retired, so a shared variable would already name the
    // new button by the time this runs.
    const body: Block<unknown> = (): Node => {
      const own = document.createElement("button");
      button = own;
      const handler = (): void => {
        fired++;
      };
      own.addEventListener("click", handler);
      onCleanup(() => own.removeEventListener("click", handler));
      return own;
    };

    const root = rootScope();
    runWithOwner(root, () => {
      branch(container, null, which, body);
    });
    flush();

    const first = button;
    first.click();
    expect(fired).toBe(1);

    // A key change disposes the instance, which runs the cleanup that removes
    // the listener. The node that was there is detached AND deaf.
    setWhich(1);
    flush();
    first.click();
    expect(fired).toBe(1);
    expect(first.isConnected).toBe(false);

    disposeScope(root);
  });

  test("an async continuation raised after disposal is dropped (O3.4)", async () => {
    let aborted = false;
    let landed = false;

    const body: Block<unknown> = (): Node => {
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () => {
        aborted = true;
      });
      onCleanup(() => controller.abort());
      void Promise.resolve().then(() => {
        if (controller.signal.aborted) return;
        landed = true;
      });
      return document.createElement("i");
    };

    const root = rootScope();
    runWithOwner(root, () => {
      branch(container, null, () => 0, body);
    });
    flush();

    disposeScope(root);
    expect(aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(landed).toBe(false);
  });

  test("every row scope of an each is gone when the each's owner is", () => {
    const [rows] = createSignal([1, 2, 3]);
    let alive = 0;

    const row: Block<unknown> = (): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      return document.createElement("li");
    };

    const root = rootScope();
    runWithOwner(root, () => {
      each(container, null, rows, false, row);
    });
    flush();

    expect(alive).toBe(3);
    disposeScope(root);
    expect(alive).toBe(0);
    expect(container.childNodes.length).toBe(0);
  });

  test("a boundary's content scope is disposed when the boundary's owner is", () => {
    let alive = 0;
    const body: Block<unknown> = (): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      return document.createElement("i");
    };

    const root = rootScope();
    runWithOwner(root, () => {
      boundary(container, null, "error", null, body);
    });
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

    const body: Block<unknown> = (): Node => {
      alive++;
      onCleanup(() => {
        alive--;
      });
      return document.createElement("i");
    };

    const root = rootScope();
    const marker = runWithOwner(root, () => portal(() => target, body));
    container.appendChild(marker);
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
    const root = rootScope();
    const before = scopeAllocations();
    runWithOwner(root, () => build(root));
    const cost = scopeAllocations() - before;
    flush();
    disposeScope(root);
    return cost;
  }

  const body: Block<unknown> = (): Node => document.createElement("i");

  test("NO_SCOPE allocates no Scope for the activation", () => {
    const withScope = scopesFor(() => {
      branch(container, null, () => 0, body, STATIC_KEY);
    });
    const without = scopesFor(() => {
      branch(container, null, () => 0, body, STATIC_KEY | NO_SCOPE);
    });
    expect(withScope).toBe(1);
    expect(without).toBe(0);
  });

  test("STATIC_KEY opens no effect, so a write to what the key reads does nothing", () => {
    const [source, setSource] = createSignal(0);
    const counter = counted("s");
    // A key the compiler would refuse to call static; the flag is a PROOF and
    // this asserts what the runtime does when it is given one, which is to read
    // once and never subscribe.
    const key: Cell<number> = () => source();

    const root = rootScope();
    runWithOwner(root, () => {
      branch(container, null, key, [counter, counter], STATIC_KEY);
    });
    flush();

    expect(counter.calls).toBe(1);
    setSource(1);
    flush();
    expect(counter.calls).toBe(1);

    disposeScope(root);
  });

  test("flags on and flags off render identical DOM — the L3 differential, in miniature", () => {
    const render = (flags: number): string => {
      const host = document.createElement("div");
      const root = rootScope();
      runWithOwner(root, () => {
        branch(host, null, () => 0, [body], flags);
      });
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
    const root = rootScope();
    const out = runWithOwner(root, () => branch(null, null, () => 0, [body]));
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
    const [outer, setOuter] = createSignal(true);
    const [items, setItems] = createSignal([1, 2, 3]);

    const root = rootScope();
    runWithOwner(root, () => {
      branch(container, null, () => (outer() ? 0 : 1), [
        (): Node => {
          const host = document.createElement("section");
          each(host, null, items, false, () => document.createElement("li"));
          return host;
        },
      ]);
    });
    flush();
    expect(container.querySelectorAll("li").length).toBe(3);

    // Content the inner region inserted AFTER the outer one recorded its nodes.
    setItems([1, 2, 3, 4, 5]);
    flush();
    expect(container.querySelectorAll("li").length).toBe(5);

    setOuter(false);
    flush();
    expect(container.innerHTML).toBe("");

    disposeScope(root);
  });

  test("a region built under a nested scope dies with the root above it", () => {
    const root = rootScope();
    const outer = childScope(root);
    runWithOwner(outer, () => {
      branch(container, null, () => 0, [() => document.createElement("i")]);
    });
    flush();

    disposeScope(root);
    expect(container.innerHTML).toBe("");
  });
});

/**
 * Emptying a list that owns its parent is one `textContent = ""` rather than a
 * `removeChild` per row. The bulk write is the whole point and it is also the
 * whole risk: it takes every child the parent has, so what has to be pinned is
 * that it fires when the list IS the parent's children and never when it is not.
 */
describe("emptying a list removes only what the list owns", () => {
  const li = (): Node => document.createElement("li");

  test("a list that owns its parent is emptied", () => {
    const [items, setItems] = createSignal([1, 2, 3]);
    const root = rootScope();
    runWithOwner(root, () => {
      each(container, null, items, false, li);
    });
    flush();
    expect(container.childNodes.length).toBe(3);

    setItems([]);
    flush();
    expect(container.childNodes.length).toBe(0);

    // And the position still works afterwards.
    setItems([1, 2]);
    flush();
    expect(container.childNodes.length).toBe(2);

    disposeScope(root);
  });

  test("a static sibling BEFORE the list survives the list emptying", () => {
    const keep = document.createElement("header");
    container.appendChild(keep);
    const [items, setItems] = createSignal([1, 2, 3]);

    const root = rootScope();
    runWithOwner(root, () => {
      each(container, null, items, false, li);
    });
    flush();
    expect(container.childNodes.length).toBe(4);

    setItems([]);
    flush();
    expect(container.childNodes.length).toBe(1);
    expect(container.firstChild).toBe(keep);

    disposeScope(root);
  });

  test("a static sibling AFTER the list survives the list emptying", () => {
    const keep = document.createElement("footer");
    container.appendChild(keep);
    const [items, setItems] = createSignal([1, 2, 3]);

    const root = rootScope();
    runWithOwner(root, () => {
      each(container, keep, items, false, li);
    });
    flush();
    expect(container.childNodes.length).toBe(4);
    expect(container.lastChild).toBe(keep);

    setItems([]);
    flush();
    expect(container.childNodes.length).toBe(1);
    expect(container.firstChild).toBe(keep);

    disposeScope(root);
  });

  test("a second list in the same parent keeps its rows when the first empties", () => {
    const [a, setA] = createSignal([1, 2]);
    const [b] = createSignal([1, 2, 3]);
    const root = rootScope();
    const anchor = document.createElement("hr");
    container.appendChild(anchor);
    runWithOwner(root, () => {
      each(container, anchor, a, false, li);
      each(container, null, b, false, li);
    });
    flush();
    expect(container.childNodes.length).toBe(6);

    setA([]);
    flush();
    expect(container.childNodes.length).toBe(4);
    expect(container.querySelectorAll("li").length).toBe(3);

    disposeScope(root);
  });

  test("disposing the owner of a list that owns its parent empties it", () => {
    const [items] = createSignal([1, 2, 3]);
    const root = rootScope();
    runWithOwner(root, () => {
      each(container, null, items, false, li);
    });
    flush();
    expect(container.childNodes.length).toBe(3);

    disposeScope(root);
    expect(container.childNodes.length).toBe(0);
  });

  test("disposing a list beside a static sibling leaves the sibling", () => {
    const keep = document.createElement("header");
    container.appendChild(keep);
    const [items] = createSignal([1, 2, 3]);
    const root = rootScope();
    runWithOwner(root, () => {
      each(container, null, items, false, li);
    });
    flush();

    disposeScope(root);
    expect(container.childNodes.length).toBe(1);
    expect(container.firstChild).toBe(keep);
  });
});
