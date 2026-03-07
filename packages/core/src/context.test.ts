/**
 * Context tests - ported from SolidJS signals
 * https://github.com/solidjs/signals/blob/main/tests/context.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  createContext,
  createScope,
  getContext,
  setContext,
  NoOwnerError,
  ContextNotFoundError,
  effect,
  onCleanup,
  flush,
  signal,
} from "./signals.ts";

// Helper: createRoot is createScope with detached=true
const createRoot = <T>(fn: (dispose: () => void) => T): T => createScope(fn, true);

describe("context", () => {
  test("should create context with default value", () => {
    const context = createContext(1);

    expect(context.id).toBeDefined();
    expect(context.defaultValue).toEqual(1);

    createRoot(() => {
      setContext(context);
      expect(getContext(context)).toEqual(1);
    });
  });

  test("should forward context across roots", () => {
    const context = createContext(1);
    createRoot(() => {
      setContext(context, 2);
      createRoot(() => {
        expect(getContext(context)).toEqual(2);
        createRoot(() => {
          expect(getContext(context)).toEqual(2);
        });
      });
    });
  });

  test("should not expose context on parent when set in child", () => {
    const context = createContext(1);
    createRoot(() => {
      createRoot(() => {
        setContext(context, 4);
      });

      expect(getContext(context)).toEqual(1);
    });
  });

  test("should throw error when trying to get context outside owner", () => {
    const context = createContext<number>();
    expect(() => getContext(context)).toThrow(NoOwnerError);
  });

  test("should throw error when trying to set context outside owner", () => {
    const context = createContext<number>();
    expect(() => setContext(context)).toThrow(NoOwnerError);
  });

  test("should throw error when trying to get context without setting it first", () => {
    const context = createContext<number>();
    expect(() => createRoot(() => getContext(context))).toThrow(ContextNotFoundError);
  });

  test("should override context value in nested scope", () => {
    const context = createContext(1);
    createRoot(() => {
      setContext(context, 10);
      expect(getContext(context)).toEqual(10);

      createRoot(() => {
        setContext(context, 20);
        expect(getContext(context)).toEqual(20);
      });

      // Parent still has original value
      expect(getContext(context)).toEqual(10);
    });
  });

  test("should work with multiple contexts", () => {
    const context1 = createContext("a");
    const context2 = createContext(1);

    createRoot(() => {
      setContext(context1, "b");
      setContext(context2, 2);

      expect(getContext(context1)).toEqual("b");
      expect(getContext(context2)).toEqual(2);

      createRoot(() => {
        setContext(context1, "c");
        expect(getContext(context1)).toEqual("c");
        expect(getContext(context2)).toEqual(2); // Inherited
      });
    });
  });
});

describe("createScope (detached mode = createRoot)", () => {
  test("should dispose of inner computations", () => {
    let effectRuns = 0;
    let cleanupRuns = 0;

    const dispose = createRoot((dispose) => {
      effect(() => {
        effectRuns++;
        onCleanup(() => {
          cleanupRuns++;
        });
      });
      return dispose;
    });

    expect(effectRuns).toBe(1);
    expect(cleanupRuns).toBe(0);

    dispose();

    expect(effectRuns).toBe(1);
    expect(cleanupRuns).toBe(1);
  });

  test("should return result", () => {
    const result = createRoot((dispose) => {
      dispose();
      return 10;
    });

    expect(result).toBe(10);
  });

  test("should not be reactive", () => {
    let rootRuns = 0;
    const count = signal(0);

    createRoot(() => {
      count();
      rootRuns++;
    });

    expect(rootRuns).toBe(1);

    count.set(1);
    flush();
    expect(rootRuns).toBe(1); // Root should not re-run
  });

  test("should hold parent context", () => {
    const context = createContext("default");

    createRoot(() => {
      setContext(context, "parent");

      createRoot(() => {
        expect(getContext(context)).toBe("parent");
      });
    });
  });

  test("should not throw if dispose called during active disposal process", () => {
    expect(() => {
      createRoot((dispose) => {
        onCleanup(() => dispose());
        dispose();
      });
    }).not.toThrow();
  });
});

describe("createScope (attached mode)", () => {
  test("should auto-dispose when parent disposes", () => {
    let childDisposed = false;

    const dispose = createScope((dispose) => {
      // Child scope (attached by default)
      createScope(() => {
        onCleanup(() => {
          childDisposed = true;
        });
      });

      return dispose;
    }, true); // Parent is detached

    expect(childDisposed).toBe(false);
    dispose();
    expect(childDisposed).toBe(true);
  });

  test("detached scope should NOT auto-dispose with parent", () => {
    let childDisposed = false;
    let childDisposeRef: (() => void) | null = null;

    const dispose = createScope((dispose) => {
      // Child scope (detached)
      createScope((childDispose) => {
        childDisposeRef = childDispose;
        onCleanup(() => {
          childDisposed = true;
        });
      }, true); // detached

      return dispose;
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

    const dispose = createRoot((dispose) => {
      effect(() => {
        onCleanup(() => disposals.push("A"));
        onCleanup(() => disposals.push("B"));
        onCleanup(() => disposals.push("C"));
      });
      return dispose;
    });

    dispose();

    // Should be reverse order (LIFO)
    expect(disposals).toEqual(["C", "B", "A"]);
  });

  test("should dispose children before parent", () => {
    const disposals: string[] = [];

    const dispose = createRoot((dispose) => {
      onCleanup(() => disposals.push("ROOT"));

      createScope(() => {
        onCleanup(() => disposals.push("CHILD1"));
        effect(() => {
          onCleanup(() => disposals.push("EFFECT1"));
        });
      });

      createScope(() => {
        onCleanup(() => disposals.push("CHILD2"));
        effect(() => {
          onCleanup(() => disposals.push("EFFECT2"));
        });
      });

      return dispose;
    });

    dispose();

    // Children should dispose before parent, in reverse order
    // CHILD2 effects, CHILD2, CHILD1 effects, CHILD1, ROOT
    expect(disposals[disposals.length - 1]).toBe("ROOT");
  });

  test("should run onCleanup in reverse registration order within effect", () => {
    const order: number[] = [];

    const dispose = createRoot((dispose) => {
      effect(() => {
        onCleanup(() => order.push(1));
        onCleanup(() => order.push(2));
        onCleanup(() => order.push(3));
      });
      return dispose;
    });

    dispose();

    expect(order).toEqual([3, 2, 1]);
  });
});
