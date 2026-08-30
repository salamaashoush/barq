/**
 * Context tests, ported from SolidJS signals.
 */

import { describe, expect, test } from "bun:test";
import {
  context,
  scope,
  getContext,
  setContext,
  NoOwnerError,
  ContextNotFoundError,
  effect,
  onCleanup,
  flush,
  signal,
} from "./signals.ts";

// Helper: root is scope with detached=true
const root = <T>(fn: (dispose: () => void) => T): T => scope(fn, true);

describe("context", () => {
  test("should create context with default value", () => {
    const ctx = context(1);

    expect(ctx.id).toBeDefined();
    expect(ctx.defaultValue).toEqual(1);

    root(() => {
      setContext(ctx);
      expect(getContext(ctx)).toEqual(1);
    });
  });

  test("should forward context across roots", () => {
    const ctx = context(1);
    root(() => {
      setContext(ctx, 2);
      root(() => {
        expect(getContext(ctx)).toEqual(2);
        root(() => {
          expect(getContext(ctx)).toEqual(2);
        });
      });
    });
  });

  test("should not expose context on parent when set in child", () => {
    const ctx = context(1);
    root(() => {
      root(() => {
        setContext(ctx, 4);
      });

      expect(getContext(ctx)).toEqual(1);
    });
  });

  test("should throw error when trying to get context outside owner", () => {
    const ctx = context<number>();
    expect(() => getContext(ctx)).toThrow(NoOwnerError);
  });

  test("should throw error when trying to set context outside owner", () => {
    const ctx = context<number>();
    expect(() => setContext(ctx)).toThrow(NoOwnerError);
  });

  test("should throw error when trying to get context without setting it first", () => {
    const ctx = context<number>();
    expect(() => root(() => getContext(ctx))).toThrow(ContextNotFoundError);
  });

  test("should override context value in nested scope", () => {
    const ctx = context(1);
    root(() => {
      setContext(ctx, 10);
      expect(getContext(ctx)).toEqual(10);

      root(() => {
        setContext(ctx, 20);
        expect(getContext(ctx)).toEqual(20);
      });

      // Parent still has original value
      expect(getContext(ctx)).toEqual(10);
    });
  });

  test("should work with multiple contexts", () => {
    const context1 = context("a");
    const context2 = context(1);

    root(() => {
      setContext(context1, "b");
      setContext(context2, 2);

      expect(getContext(context1)).toEqual("b");
      expect(getContext(context2)).toEqual(2);

      root(() => {
        setContext(context1, "c");
        expect(getContext(context1)).toEqual("c");
        expect(getContext(context2)).toEqual(2); // Inherited
      });
    });
  });
});

describe("scope (detached mode = root)", () => {
  test("should dispose of inner computations", () => {
    let effectRuns = 0;
    let cleanupRuns = 0;

    const dispose = root((disposeRoot) => {
      effect(() => {
        effectRuns++;
        onCleanup(() => {
          cleanupRuns++;
        });
      });
      return disposeRoot;
    });

    expect(effectRuns).toBe(1);
    expect(cleanupRuns).toBe(0);

    dispose();

    expect(effectRuns).toBe(1);
    expect(cleanupRuns).toBe(1);
  });

  test("should return result", () => {
    const result = root((disposeRoot) => {
      disposeRoot();
      return 10;
    });

    expect(result).toBe(10);
  });

  test("should not be reactive", () => {
    let rootRuns = 0;
    const count = signal(0);

    root(() => {
      count();
      rootRuns++;
    });

    expect(rootRuns).toBe(1);

    count.set(1);
    flush();
    expect(rootRuns).toBe(1); // Root should not re-run
  });

  test("should hold parent context", () => {
    const ctx = context("default");

    root(() => {
      setContext(ctx, "parent");

      root(() => {
        expect(getContext(ctx)).toBe("parent");
      });
    });
  });

  test("should not throw if dispose called during active disposal process", () => {
    expect(() => {
      root((disposeRoot) => {
        onCleanup(() => disposeRoot());
        disposeRoot();
      });
    }).not.toThrow();
  });
});

describe("scope (attached mode)", () => {
  test("should auto-dispose when parent disposes", () => {
    let childDisposed = false;

    const dispose = scope((disposeRoot) => {
      // Child scope (attached by default)
      scope(() => {
        onCleanup(() => {
          childDisposed = true;
        });
      });

      return disposeRoot;
    }, true); // Parent is detached

    expect(childDisposed).toBe(false);
    dispose();
    expect(childDisposed).toBe(true);
  });

  test("detached scope should NOT auto-dispose with parent", () => {
    let childDisposed = false;
    let childDisposeRef: (() => void) | null = null;

    const dispose = scope((disposeRoot) => {
      // Child scope (detached)
      scope((childDispose) => {
        childDisposeRef = childDispose;
        onCleanup(() => {
          childDisposed = true;
        });
      }, true); // detached

      return disposeRoot;
    }, true);

    expect(childDisposed).toBe(false);
    dispose();
    // Detached child should NOT be disposed
    expect(childDisposed).toBe(false);

    // Manual dispose
    childDisposeRef!();
    expect(childDisposed).toBe(true);
  });
});

describe("cleanup order (LIFO)", () => {
  test("should clean up in reverse order", () => {
    const disposals: string[] = [];

    const dispose = root((disposeRoot) => {
      effect(() => {
        onCleanup(() => disposals.push("A"));
        onCleanup(() => disposals.push("B"));
        onCleanup(() => disposals.push("C"));
      });
      return disposeRoot;
    });

    dispose();

    // Should be reverse order (LIFO)
    expect(disposals).toEqual(["C", "B", "A"]);
  });

  test("should dispose children before parent", () => {
    const disposals: string[] = [];

    const dispose = root((disposeRoot) => {
      onCleanup(() => disposals.push("ROOT"));

      scope(() => {
        onCleanup(() => disposals.push("CHILD1"));
        effect(() => {
          onCleanup(() => disposals.push("EFFECT1"));
        });
      });

      scope(() => {
        onCleanup(() => disposals.push("CHILD2"));
        effect(() => {
          onCleanup(() => disposals.push("EFFECT2"));
        });
      });

      return disposeRoot;
    });

    dispose();

    // Children should dispose before parent, in reverse order
    // CHILD2 effects, CHILD2, CHILD1 effects, CHILD1, ROOT
    expect(disposals[disposals.length - 1]).toBe("ROOT");
  });

  test("should run onCleanup in reverse registration order within effect", () => {
    const order: number[] = [];

    const dispose = root((disposeRoot) => {
      effect(() => {
        onCleanup(() => order.push(1));
        onCleanup(() => order.push(2));
        onCleanup(() => order.push(3));
      });
      return disposeRoot;
    });

    dispose();

    expect(order).toEqual([3, 2, 1]);
  });
});
