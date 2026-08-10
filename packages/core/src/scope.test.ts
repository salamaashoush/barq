/**
 * The M2 ownership machinery: `SEMANTICS.md` §2 (O) and §4 (X).
 *
 * The L1 fixtures in `packages/compiler-rs/fixtures/semantics/` ask these
 * questions of COMPILED code, which is what makes them the oracle. These ask
 * them of the primitives directly, which is what makes a failure point at a
 * line rather than at a milestone.
 */

import { describe, expect, test } from "bun:test";

import { render } from "./dom.ts";
import {
  abortSignal,
  dispose,
  enter,
  enterRoot,
  exit,
  install,
  isDisposed,
  ownRange,
  pin,
  provide,
  read,
  type Scope,
} from "./scope.ts";
import {
  DEV,
  createContext,
  createScope,
  effect,
  flush,
  getContext,
  getObserver,
  getOwner,
  onCleanup,
  scopeAllocations,
  setContext,
  signal,
  untrack,
  useContext,
} from "./signals.ts";

describe("O3 — disposal is total and ordered", () => {
  test("O3.2/O3.3: every kid dies before the first cleanup runs", () => {
    const log: string[] = [];
    const root = enterRoot();
    onCleanup(() => log.push("root-cleanup-1"));
    const a = enter(root);
    onCleanup(() => log.push("a"));
    exit(a);
    const b = enter(root);
    onCleanup(() => log.push("b"));
    exit(b);
    onCleanup(() => log.push("root-cleanup-2"));
    exit(root);

    dispose(root);
    // Kids in reverse creation order first (O3.2), then cleanups LIFO (O3.3).
    // While a child scope's disposer lived in the parent's `cleanups`, this
    // order was ["root-cleanup-2", "b", "a", "root-cleanup-1"] and the two
    // rules had no observation that told them apart.
    expect(log).toEqual(["b", "a", "root-cleanup-2", "root-cleanup-1"]);
  });

  test("O3.2: a kid is fully disposed before its earlier sibling begins", () => {
    const log: string[] = [];
    const root = enterRoot();
    for (const name of ["first", "second"]) {
      const kid = enter(root);
      onCleanup(() => log.push(`${name}-outer`));
      const grand = enter(kid);
      onCleanup(() => log.push(`${name}-inner`));
      exit(grand);
      exit(kid);
    }
    exit(root);

    dispose(root);
    expect(log).toEqual(["second-inner", "second-outer", "first-inner", "first-outer"]);
  });

  test("O3.1: a cleanup observes a dead scope and a bumped gen", () => {
    const root = enterRoot();
    const before = root.gen;
    const seen: { dead: boolean; gen: number }[] = [];
    onCleanup(() => {
      seen.push({ dead: root.dead, gen: root.gen });
    });
    exit(root);

    dispose(root);
    expect(seen).toEqual([{ dead: true, gen: before + 1 }]);
  });

  test("dispose is idempotent", () => {
    let ran = 0;
    const root = enterRoot();
    onCleanup(() => ran++);
    exit(root);

    dispose(root);
    dispose(root);
    expect(ran).toBe(1);
  });

  test("O3.7: a scope disposed on its own leaves nothing on its parent", () => {
    const root = enterRoot();
    exit(root);
    for (let i = 0; i < 1000; i++) {
      const kid = enter(root);
      exit(kid);
      dispose(kid);
    }
    expect(root.kids?.length ?? 0).toBe(0);
    dispose(root);
  });

  test("O3.2: unlinking a disposed kid preserves the order of the rest", () => {
    const log: string[] = [];
    const root = enterRoot();
    const kids = ["a", "b", "c"].map((name) => {
      const kid = enter(root);
      onCleanup(() => log.push(name));
      exit(kid);
      return kid;
    });
    exit(root);

    dispose(kids[1]);
    expect(log).toEqual(["b"]);
    dispose(root);
    expect(log).toEqual(["b", "c", "a"]);
  });

  test("entering a disposed scope is reported, not silent", () => {
    const root = enterRoot();
    exit(root);
    dispose(root);

    const capture = DEV.diagnostics.capture();
    const late = enter(root);
    exit(late);
    const seen = capture.stop();
    expect(seen.map((event) => event.code)).toEqual(["RUN_WITH_DISPOSED_OWNER"]);
  });

  test("O3.4: disposal aborts the scope's signal", () => {
    const root = enterRoot();
    const aborted = abortSignal(root);
    exit(root);
    expect(aborted.aborted).toBe(false);

    dispose(root);
    expect(aborted.aborted).toBe(true);
  });

  test("O3.5: the range is removed last, after every cleanup", () => {
    const log: string[] = [];
    const root = enterRoot();
    onCleanup(() => log.push("cleanup"));
    ownRange(root, () => log.push("range"));
    exit(root);

    dispose(root);
    expect(log).toEqual(["cleanup", "range"]);
  });
});

describe("O3.7 — a live scope retains no dead kid", () => {
  const deadKids = (scope: Scope): number =>
    (scope.kids ?? []).filter((kid) => (kid as Scope).dead).length;

  test("disposing a child reclaims its slot on the parent", () => {
    const parent = enterRoot();
    const kid = enter(parent);
    exit(kid);
    exit(parent);
    expect(parent.kids?.length).toBe(1);
    dispose(kid);
    expect(parent.kids?.length ?? 0).toBe(0);
    dispose(parent);
  });

  test("it reclaims the slot even when an unrelated tree is unwinding", () => {
    // The guard used to be a module-global unwind DEPTH, so any disposal
    // happening anywhere while some other tree was coming apart skipped its
    // splice — and a long-lived parent kept every dead child forever. This
    // disposes five children of a live parent from inside a cleanup registered
    // on a nested scope of a DIFFERENT tree, which is where a portal container,
    // a pinned scope or a row coordinator does its work.
    const longLived = enterRoot();
    const kids: Scope[] = [];
    for (let i = 0; i < 5; i++) {
      const kid = enter(longLived);
      exit(kid);
      kids.push(kid);
    }
    exit(longLived);
    expect(longLived.kids?.length).toBe(5);

    const other = enterRoot();
    const nested = enter(other);
    onCleanup(() => {
      for (const kid of kids) dispose(kid);
    });
    exit(nested);
    exit(other);

    dispose(other);

    expect(kids.every((kid) => isDisposed(kid))).toBe(true);
    expect(deadKids(longLived)).toBe(0);
    expect(longLived.kids?.length ?? 0).toBe(0);
    dispose(longLived);
  });

  test("a parent unwinding its own kids still drops the whole array", () => {
    const parent = enterRoot();
    const kid = enter(parent);
    exit(kid);
    exit(parent);
    dispose(parent);
    expect(isDisposed(kid)).toBe(true);
    expect(parent.kids?.length ?? 0).toBe(0);
  });
});

describe("O1 — the scope creation set is closed", () => {
  test("a scope materialised by a computation is counted, though no enter declares it", () => {
    // The ownership trace cannot see this one: `hostScope` allocates through
    // no `enter`, so the trace's scope count and the allocation count are
    // different numbers and O1's procedure needs the second.
    const before = scopeAllocations();
    const disposer = createScope((d) => {
      effect(() => {
        onCleanup(() => undefined);
      });
      return d;
    }, true);
    flush();
    const declared = scopeAllocations() - before;
    disposer();
    // The createScope root, plus the one the effect materialised because a
    // cleanup asked for an owner.
    expect(declared).toBe(2);
  });

  test("a computation that owns nothing allocates no scope", () => {
    const before = scopeAllocations();
    const disposer = createScope((d) => {
      effect(() => undefined);
      return d;
    }, true);
    flush();
    const declared = scopeAllocations() - before;
    disposer();
    expect(declared).toBe(1);
  });
});

describe("O4 — ambient hygiene", () => {
  test("O4.1: exit restores CURRENT on the normal path", () => {
    const before = getOwner();
    const scope = enter(before);
    expect(getOwner()).toBe(scope);
    exit(scope);
    expect(getOwner()).toBe(before);
  });

  test("O4.1: a construct that throws still restores CURRENT through its finally", () => {
    const root = enterRoot();
    const context = createContext<number>();
    expect(() =>
      provide(
        root,
        context,
        () => 1,
        () => {
          throw new Error("built nothing");
        },
      ),
    ).toThrow("built nothing");
    expect(getOwner()).toBe(root);
    exit(root);
    dispose(root);
  });

  test("O4.1: enter/exit inside a running computation restores that computation", () => {
    // CURRENT is the pair (owner, host). Q6 leaves a computation's scope
    // unmaterialised, so `currentOwner` is null while the real owner is the
    // host; capturing only `currentOwner` restored null, and `exit` then
    // detached everything the computation created afterwards.
    const ranCleanup: string[] = [];
    let inner = 0;
    const source = signal(0);

    const disposer = createScope((d) => {
      effect(() => {
        const owner = getOwner();
        const child = enter(owner);
        exit(child);
        expect(getOwner()).toBe(owner);
        onCleanup(() => ranCleanup.push("after-enter-exit"));
        effect(() => {
          source();
          inner++;
        });
      });
      return d;
    }, true);
    flush();
    expect(inner).toBe(1);

    disposer();
    expect(ranCleanup).toEqual(["after-enter-exit"]);
    source.set(1);
    flush();
    expect(inner).toBe(1);
  });

  test("O4.1: exit is idempotent — a second call does not detach CURRENT", () => {
    const before = getOwner();
    const root = enterRoot();
    const scope = enter(root);
    exit(scope);
    expect(getOwner()).toBe(root);
    exit(scope);
    expect(getOwner()).toBe(root);
    exit(root);
    expect(getOwner()).toBe(before);
    dispose(root);
  });

  test("O4.4: provide disposes the instance scope when the block throws", () => {
    const context = createContext<number>();
    const root = enterRoot();
    const ran: string[] = [];
    let instance: Scope | undefined;

    expect(() =>
      provide(
        root,
        context,
        () => 1,
        (s: Scope) => {
          instance = s;
          onCleanup(() => ran.push("half-built"));
          throw new Error("built nothing");
        },
      ),
    ).toThrow("built nothing");

    expect(instance?.dead).toBe(true);
    expect(ran).toEqual(["half-built"]);
    exit(root);
    dispose(root);
  });

  test("O4.3: exit restores to the captured prev, not to the parent", () => {
    // The two differ exactly when the entered scope's parent is not the scope
    // that was current — which is what `pin` arranges, and why `s.parent` is
    // the wrong restore target.
    const outer = enterRoot();
    const elsewhere = enter(outer);
    exit(elsewhere);

    const here = enter(outer);
    const pinned = enter(elsewhere);
    expect(pinned.parent).toBe(elsewhere);
    exit(pinned);
    expect(getOwner()).toBe(here);
    exit(here);
    exit(outer);
    dispose(outer);
  });
});

describe("O2 — a Block runs under the scope it is given", () => {
  test("pin overrides the scope the Block is handed", () => {
    // The two scopes come from different constructs on purpose. Deriving both
    // from `enter(root)` let an `enter` collapsed to the identity satisfy the
    // assertions with `home === away === root`, so the test could not tell
    // `pin` from `enter` being broken.
    const root = enterRoot();
    const home = enter(root);
    exit(home);
    exit(root);
    const away = enterRoot();
    exit(away);
    expect(home).not.toBe(away);
    expect(home).not.toBe(root);

    const seen: Scope[] = [];
    const block = pin(home, (s: Scope) => {
      seen.push(s);
      onCleanup(() => undefined);
      return getOwner();
    });
    const ambient = block(away);

    expect(seen).toEqual([home]);
    expect(ambient).toBe(home);
    dispose(root);
    dispose(away);
  });
});

describe("O5 — render opens a root and returns a disposer that disposes", () => {
  test("the disposer stops effects, runs cleanups and removes the range", () => {
    const count = signal(0);
    const runs: number[] = [];
    const cleanups: string[] = [];
    const host = document.createElement("div");

    const build = (): HTMLElement => {
      effect(() => {
        runs.push(count());
      });
      onCleanup(() => cleanups.push("leaf"));
      const node = document.createElement("span");
      return node;
    };

    const disposer = render(build(), host);
    flush();
    expect(runs.length).toBe(1);
    expect(host.childNodes.length).toBe(1);

    disposer();
    expect(cleanups).toEqual(["leaf"]);
    expect(host.childNodes.length).toBe(0);

    count.set(1);
    flush();
    expect(runs.length).toBe(1);
  });

  test("the Block form is invoked with the root scope", () => {
    const host = document.createElement("div");
    const given: Scope[] = [];
    const disposer = render((scope: Scope) => {
      given.push(scope);
      return document.createElement("i");
    }, host);
    expect(given.length).toBe(1);
    expect(given[0].catcher).not.toBeNull();
    disposer();
  });
});

describe("O6 — owner and observer are separate ambients", () => {
  test("untrack changes the observer and not the owner", () => {
    const source = signal(0);
    let ran = 0;
    const ranCleanup: string[] = [];
    let ownerInside: unknown = null;
    let ownerInUntrack: unknown = null;

    const disposer = createScope((d) => {
      effect(() => {
        ran++;
        ownerInside = getOwner();
        untrack(() => {
          ownerInUntrack = getOwner();
          onCleanup(() => ranCleanup.push("registered inside untrack"));
          source();
        });
      });
      return d;
    }, true);
    flush();

    expect(ran).toBe(1);
    expect(ownerInUntrack).toBe(ownerInside);
    expect(getObserver()).toBeNull();

    source.set(1);
    flush();
    expect(ran).toBe(1);

    disposer();
    expect(ranCleanup).toEqual(["registered inside untrack"]);
  });
});

describe("X — context on the scope", () => {
  test("X6: the record is shared by reference until a provide forks it", () => {
    const root = enterRoot();
    const child = enter(root);
    expect(child.ctx).toBe(root.ctx);

    const context = createContext<string>();
    const grand = enter(child);
    install(grand, context, () => "provided");
    expect(grand.ctx).not.toBe(child.ctx);
    expect(Object.getPrototypeOf(grand.ctx)).toBe(child.ctx);
    expect(child.ctx).toBe(root.ctx);

    exit(grand);
    exit(child);
    exit(root);
    dispose(root);
  });

  test("X3: a read walks the chain from the reading scope, at read time", () => {
    const context = createContext<number>();
    const root = enterRoot();
    const value = signal(1);
    const seen: number[] = [];

    const out = provide(
      root,
      context,
      () => value(),
      (inner: Scope) => {
        const deep = enter(inner);
        const nested = enter(deep);
        seen.push(read(context, nested)());
        exit(nested);
        exit(deep);
        return "built";
      },
    );

    expect(out).toBe("built");
    expect(seen).toEqual([1]);

    // X2: the stored value is a Cell, so the consumer sees the new value
    // through its own read without anything being rebuilt.
    value.set(2);
    exit(root);
    dispose(root);
  });

  test("X5: a miss with no default throws", () => {
    const context = createContext<number>();
    const root = enterRoot();
    expect(() => read(context, root)()).toThrow();
    exit(root);
    dispose(root);
  });

  test("X3: a scope built before the provider installed still sees it", () => {
    // X3's own falsification: build the consumer's scope, install a provider
    // ABOVE it, then read. Resolving through `ctx`'s prototype chain answered
    // "default" here, because `early.ctx` is the record `root` had before it
    // forked — construction-time capture, which X3 forbids in as many words.
    // It is also the shape `ErrorBoundary` has: children built at
    // `components.ts:942`, ERROR_BOUNDARY installed 43 lines later.
    const context = createContext<string>("default");
    const root = enterRoot();
    const early = enter(root);
    const deep = enter(early);
    exit(deep);
    exit(early);

    expect(read(context, deep)()).toBe("default");

    install(root, context, () => "late");
    expect(read(context, deep)()).toBe("late");
    expect(read(context, early)()).toBe("late");
    expect(read(context, root)()).toBe("late");
    exit(root);
    dispose(root);
  });

  test("X3: the nearest provider on the chain wins, whenever it installed", () => {
    const context = createContext<string>("default");
    const root = enterRoot();
    install(root, context, () => "root");
    const middle = enter(root);
    const leaf = enter(middle);
    exit(leaf);
    exit(middle);

    expect(read(context, leaf)()).toBe("root");
    install(middle, context, () => "middle");
    expect(read(context, leaf)()).toBe("middle");
    expect(read(context, root)()).toBe("root");
    exit(root);
    dispose(root);
  });

  test("the two context channels agree on Cell vs raw", () => {
    const context = createContext<number>();
    const root = enterRoot();
    install(root, context, () => 42);

    expect(read(context, root)()).toBe(42);
    expect(getContext(context, root)).toBe(42);
    expect(useContext(context)()).toBe(42);
    exit(root);
    dispose(root);
  });

  test("a function stored as a VALUE is handed back, not invoked", () => {
    const context = createContext<() => string>();
    const value = (): string => "I AM THE VALUE";
    const root = enterRoot();
    setContext(context, value, root);

    expect(read(context, root)()).toBe(value);
    expect(getContext(context, root)).toBe(value);
    exit(root);
    dispose(root);
  });
});

describe("X3 — what resolving at READ time costs", () => {
  test("a read from a fully disposed scope still resolves to the dead provider's value", () => {
    // Not a defect report: it is the stated consequence of X3. `ctx` is a plain
    // record that a child captured by reference, and disposal clears kids,
    // cleanups, the abort signal and the range — never the record. So a
    // use-after-dispose read is silent where `enter` and `runWithOwner` both
    // emit RUN_WITH_DISPOSED_OWNER for the WRITE side.
    //
    // Pinned here so the asymmetry is a decision with an observation attached
    // rather than something the next reader rediscovers. If M4's catcher work
    // adds a read-side diagnostic, this test is where that shows up.
    const context = createContext<string>("OUTER-DEFAULT");
    const root = enterRoot();
    const provider = enter(root);
    install(provider, context, () => "PROVIDED");
    const child = enter(provider);
    exit(child);
    exit(provider);

    expect(read(context, child)()).toBe("PROVIDED");

    dispose(provider);
    expect(isDisposed(provider)).toBe(true);
    expect(isDisposed(child)).toBe(true);
    expect(read(context, child)()).toBe("PROVIDED");

    exit(root);
    dispose(root);
  });
});
