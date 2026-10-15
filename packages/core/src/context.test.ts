/**
 * Context tests, ported from SolidJS signals.
 */

import { rooted } from "./test-root.ts";
import { describe, expect, test } from "bun:test";
import {
  createRenderEffect,
  createContext,
  createRoot,
  getContext,
  setContext,
  NoOwnerError,
  ContextNotFoundError,
  onCleanup,
  flush,
  createSignal,
  runWithOwner,
} from "./signals.ts";

// Solid's `createRoot`: owned by the scope it is created under, so it sees
// that scope's context.
const root = <T>(fn: (dispose: () => void) => T): T => createRoot(fn);

describe("context", () => {
  test(
    "should create context with default value",
    rooted(() => {
      const ctx = createContext(1);

      expect(ctx.id).toBeDefined();
      expect(ctx.defaultValue).toEqual(1);

      root(() => {
        setContext(ctx);
        flush();
        expect(getContext(ctx)).toEqual(1);
      });
    }),
  );

  test(
    "should forward context across roots",
    rooted(() => {
      const ctx = createContext(1);
      root(() => {
        setContext(ctx, 2);
        root(() => {
          expect(getContext(ctx)).toEqual(2);
          root(() => {
            expect(getContext(ctx)).toEqual(2);
          });
        });
      });
    }),
  );

  test(
    "should not expose context on parent when set in child",
    rooted(() => {
      const ctx = createContext(1);
      root(() => {
        root(() => {
          setContext(ctx, 4);
        });

        flush();
        expect(getContext(ctx)).toEqual(1);
      });
    }),
  );

  test("should throw error when trying to get context outside owner", () => {
    const ctx = createContext<number>();
    expect(() => getContext(ctx)).toThrow(NoOwnerError);
  });

  test("should throw error when trying to set context outside owner", () => {
    const ctx = createContext<number>();
    expect(() => setContext(ctx)).toThrow(NoOwnerError);
  });

  test(
    "should throw error when trying to get context without setting it first",
    rooted(() => {
      const ctx = createContext<number>();
      expect(() => root(() => getContext(ctx))).toThrow(ContextNotFoundError);
    }),
  );

  test(
    "should override context value in nested scope",
    rooted(() => {
      const ctx = createContext(1);
      root(() => {
        setContext(ctx, 10);
        flush();
        expect(getContext(ctx)).toEqual(10);

        root(() => {
          setContext(ctx, 20);
          flush();
          expect(getContext(ctx)).toEqual(20);
        });

        // Parent still has original value
        expect(getContext(ctx)).toEqual(10);
      });
    }),
  );

  test(
    "should work with multiple contexts",
    rooted(() => {
      const context1 = createContext("a");
      const context2 = createContext(1);

      root(() => {
        setContext(context1, "b");
        setContext(context2, 2);

        flush();
        expect(getContext(context1)).toEqual("b");
        expect(getContext(context2)).toEqual(2);

        root(() => {
          setContext(context1, "c");
          flush();
          expect(getContext(context1)).toEqual("c");
          expect(getContext(context2)).toEqual(2); // Inherited
        });
      });
    }),
  );
});

describe("scope (detached mode = root)", () => {
  test(
    "should dispose of inner computations",
    rooted(() => {
      let effectRuns = 0;
      let cleanupRuns = 0;

      const dispose = root((disposeRoot) => {
        createRenderEffect(
          () => {
            effectRuns++;
            onCleanup(() => {
              cleanupRuns++;
            });
          },
          () => {},
        );
        flush();
        return disposeRoot;
      });

      flush();
      expect(effectRuns).toBe(1);
      expect(cleanupRuns).toBe(0);

      dispose();

      expect(effectRuns).toBe(1);
      expect(cleanupRuns).toBe(1);
    }),
  );

  test(
    "should return result",
    rooted(() => {
      const result = root((disposeRoot) => {
        disposeRoot();
        return 10;
      });

      expect(result).toBe(10);
    }),
  );

  test("should not be reactive", () => {
    let rootRuns = 0;
    const [count, setCount] = createSignal(0);

    const dispose = root((disposeRoot) => {
      count();
      rootRuns++;
      return disposeRoot;
    });

    expect(rootRuns).toBe(1);

    setCount(1);
    flush();
    expect(rootRuns).toBe(1); // Root should not re-run
    dispose();
  });

  test(
    "should hold parent context",
    rooted(() => {
      const ctx = createContext("default");

      root(() => {
        setContext(ctx, "parent");

        root(() => {
          expect(getContext(ctx)).toBe("parent");
        });
      });
    }),
  );

  test(
    "should not throw if dispose called during active disposal process",
    rooted(() => {
      expect(() => {
        root((disposeRoot) => {
          onCleanup(() => disposeRoot());
          disposeRoot();
        });
      }).not.toThrow();
    }),
  );
});

describe("scope (attached mode)", () => {
  test(
    "should auto-dispose when parent disposes",
    rooted(() => {
      let childDisposed = false;

      const dispose = runWithOwner(null, () =>
        createRoot((disposeRoot) => {
          // Child scope (attached by default)
          createRoot(() => {
            onCleanup(() => {
              childDisposed = true;
            });
          });

          return disposeRoot;
        }),
      ); // Parent is detached

      expect(childDisposed).toBe(false);
      dispose();
      expect(childDisposed).toBe(true);
    }),
  );

  test(
    "detached scope should NOT auto-dispose with parent",
    rooted(() => {
      let childDisposed = false;
      let childDisposeRef: (() => void) | null = null;

      const dispose = runWithOwner(null, () =>
        createRoot((disposeRoot) => {
          // Child scope (detached)
          runWithOwner(null, () =>
            createRoot((childDispose) => {
              childDisposeRef = childDispose;
              onCleanup(() => {
                childDisposed = true;
              });
            }),
          ); // detached

          return disposeRoot;
        }),
      );

      expect(childDisposed).toBe(false);
      dispose();
      // Detached child should NOT be disposed
      expect(childDisposed).toBe(false);

      // Manual dispose
      childDisposeRef!();
      expect(childDisposed).toBe(true);
    }),
  );
});

describe("cleanup order (LIFO)", () => {
  test(
    "should clean up in reverse order",
    rooted(() => {
      const disposals: string[] = [];

      const dispose = root((disposeRoot) => {
        createRenderEffect(
          () => {
            onCleanup(() => disposals.push("A"));
            onCleanup(() => disposals.push("B"));
            onCleanup(() => disposals.push("C"));
          },
          () => {},
        );
        flush();
        return disposeRoot;
      });

      dispose();

      // Should be reverse order (LIFO)
      flush();
      expect(disposals).toEqual(["C", "B", "A"]);
    }),
  );

  test(
    "should dispose children before parent",
    rooted(() => {
      const disposals: string[] = [];

      const dispose = root((disposeRoot) => {
        onCleanup(() => disposals.push("ROOT"));

        createRoot(() => {
          onCleanup(() => disposals.push("CHILD1"));
          createRenderEffect(
            () => {
              onCleanup(() => disposals.push("EFFECT1"));
            },
            () => {},
          );
          flush();
        });

        createRoot(() => {
          onCleanup(() => disposals.push("CHILD2"));
          createRenderEffect(
            () => {
              onCleanup(() => disposals.push("EFFECT2"));
            },
            () => {},
          );
          flush();
        });

        return disposeRoot;
      });

      dispose();

      // Children should dispose before parent, in reverse order
      // CHILD2 effects, CHILD2, CHILD1 effects, CHILD1, ROOT
      flush();
      expect(disposals[disposals.length - 1]).toBe("ROOT");
    }),
  );

  test(
    "should run onCleanup in reverse registration order within effect",
    rooted(() => {
      const order: number[] = [];

      const dispose = root((disposeRoot) => {
        createRenderEffect(
          () => {
            onCleanup(() => order.push(1));
            onCleanup(() => order.push(2));
            onCleanup(() => order.push(3));
          },
          () => {},
        );
        flush();
        return disposeRoot;
      });

      dispose();

      flush();
      expect(order).toEqual([3, 2, 1]);
    }),
  );
});
