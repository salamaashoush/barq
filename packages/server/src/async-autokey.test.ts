/**
 * createAsync auto-keying: the serialization key defaults to the
 * owner-tree id of the call site, so SSR seeding works without the
 * developer hand-writing a key for every async read.
 */

import {
  DEV,
  NotReadyError,
  boundary,
  createMemo,
  getOwner,
  hydrate,
  latest,
  peekNextChildId,
  resetChildIds,
  createRoot,
  rootScope,
  runWithOwner,
  settle,
} from "@barqjs/core";
import {
  clearHydrationData,
  disposeScope,
  getHydrationData,
  setAsyncSession,
  unclaimedSeeds,
} from "@barqjs/core/internal";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { renderPage } from "./server.ts";

type Payload = Record<string, unknown>;

function seedStore(data: Payload | undefined): void {
  const target = globalThis as { __BARQ_DATA__?: Payload };
  if (data === undefined) delete target.__BARQ_DATA__;
  else target.__BARQ_DATA__ = { ...data };
}

/** A render's root: detached, and carrying the id every auto-key below it is formed from. */
function underRoot(build: () => void): () => void {
  const root = rootScope();
  runWithOwner(root, build);
  return () => disposeScope(root);
}

/** Run `build` under a fresh root inside its own async session, then serialize. */
async function renderInSession(build: () => void): Promise<Payload> {
  const session = Symbol("epoch");
  const prev = setAsyncSession(session);
  let dispose!: () => void;
  try {
    dispose = underRoot(build);
  } finally {
    setAsyncSession(prev);
  }
  await settle(session);
  const data = getHydrationData(session);
  clearHydrationData(session);
  dispose();
  return data;
}

/**
 * A fetch whose promise is also handed to `sink`. Sessionless renders can't
 * use settle(): with no session it waits on every promise in the process,
 * including ones other test files left in flight.
 */
function tracked<T>(value: T, sink: Promise<unknown>[]): () => Promise<T> {
  return () => {
    const promise = Promise.resolve(value);
    sink.push(promise);
    return promise;
  };
}

beforeEach(() => {
  clearHydrationData();
  seedStore(undefined);
});

afterEach(() => {
  clearHydrationData();
  seedStore(undefined);
});

describe("createAsync auto-keying", () => {
  test("an unkeyed createAsync serializes under its owner-tree id", async () => {
    let expected!: string;

    const data = await renderInSession(() => {
      expected = peekNextChildId(getOwner()!);
      createMemo(async () => 42);
    });

    expect(Object.keys(data)).toEqual([expected]);
    expect(data[expected]).toBe(42);
  });

  test("an explicit key wins over the auto-key", async () => {
    const data = await renderInSession(() => {
      createMemo(async () => "Ada", { key: "user" });
    });

    expect(data).toEqual({ user: "Ada" });
  });

  test("keying a read does not renumber the reads after it", async () => {
    let second!: string;

    const data = await renderInSession(() => {
      createMemo(async () => "Ada", { key: "user" });
      second = peekNextChildId(getOwner()!);
      createMemo(async () => "Grace");
    });
    // A read is a node and a node holds a position, keyed or not, so the
    // second read is addressed the same way whichever the first one is.
    const unkeyed = await renderInSession(() => {
      createMemo(async () => "Ada");
      createMemo(async () => "Grace");
    });

    expect(data).toEqual({ user: "Ada", [second]: "Grace" });
    expect(Object.keys(unkeyed)[1]).toBe(second);
  });

  test("sibling createAsync calls under one owner do not collide", async () => {
    const data = await renderInSession(() => {
      createMemo(async () => "first");
      createMemo(async () => "second");
      createMemo(async () => "third");
    });

    expect(Object.keys(data)).toHaveLength(3);
    expect(new Set(Object.values(data))).toEqual(new Set(["first", "second", "third"]));
  });

  test("sibling owner scopes do not collide", async () => {
    const branch = (label: string) => {
      createRoot(() => {
        createMemo(async () => label);
      });
    };

    const data = await renderInSession(() => {
      branch("left");
      branch("right");
    });

    expect(Object.keys(data)).toHaveLength(2);
    expect(new Set(Object.values(data))).toEqual(new Set(["left", "right"]));
  });

  test("keys are stable across a server render and the matching client render", async () => {
    // A client records nothing, so the key is observed by what it finds under
    // it: seeded with the server's payload, each memo has to read its own
    // label without its fetcher running.
    let fetches = 0;
    const reads: (() => unknown)[] = [];
    const keyed = (label: string): void => {
      reads.push(
        createMemo(async () => {
          fetches++;
          return label;
        }),
      );
    };
    const tree = () => {
      keyed("top");
      createRoot(() => {
        keyed("nested");
        createRoot(() => {
          keyed("deep");
        });
      });
    };

    // server: inside a render session, under renderPage's root scope
    const server = await renderInSession(tree);
    expect(Object.keys(server)).toHaveLength(3);
    const served = fetches;

    // client: a fresh page — no session, id epoch starts over
    reads.length = 0;
    seedStore(server);
    resetChildIds();
    const dispose = underRoot(tree);

    expect(reads.map((read) => read())).toEqual(["top", "nested", "deep"]);
    expect(fetches).toBe(served);
    dispose();
  });

  test("keys are stable across two server renders in different sessions", async () => {
    const tree = () => {
      createMemo(async () => "a");
      createRoot(() => {
        createMemo(async () => "b");
      });
    };

    const first = await renderInSession(tree);
    const second = await renderInSession(tree);

    expect(Object.keys(first)).toHaveLength(2);
    expect(second).toEqual(first);
  });

  test("auto-keyed server data seeds the client synchronously, with no refetch", async () => {
    let fetches = 0;
    const tree = () => {
      const user = createMemo(async () => {
        fetches++;
        return "Ada";
      });
      createRoot(() => {
        const posts = createMemo(async () => {
          fetches++;
          return ["hello"];
        });
        reads.push(posts);
      });
      reads.push(user);
    };
    const reads: (() => unknown)[] = [];

    const data = await renderInSession(tree);
    expect(fetches).toBe(2);

    reads.length = 0;
    seedStore(data);
    resetChildIds();
    const dispose = underRoot(() => {
      tree();
    });

    expect(reads.map((read) => read())).toEqual([["hello"], "Ada"]);
    expect(fetches).toBe(2);
    dispose();
  });

  test("renderPage and hydrate agree on the auto-keys, with no refetch", async () => {
    let fetches = 0;
    const app = () => {
      const user = createMemo(async () => {
        fetches++;
        return "Ada";
      });
      // waterfall: the second fetch can only start once the first resolves
      const greeting = createMemo(async () => {
        fetches++;
        return `Hello ${user()}`;
      });
      // A Block, not a node: `boundary` takes a deferred construction, and the
      // runtime tolerating an already-built value is not the contract.
      return boundary(
        null,
        null,
        "loading",
        () => document.createTextNode("loading..."),
        () => document.createTextNode(greeting()),
      );
    };

    const { html, data } = await renderPage(app);
    const served = fetches;
    expect(html).toContain("Hello Ada");
    expect(served).toBeGreaterThan(0);
    expect(Object.keys(data)).toHaveLength(2);

    resetChildIds();
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = html;

    const dispose = hydrate(app, container, { data });
    expect(container.textContent).toContain("Hello Ada");
    expect(container.textContent).not.toContain("loading...");
    expect(fetches).toBe(served);
    dispose();
    container.remove();
  });

  /**
   * A position is not an identity. Adding an async-using branch above a read
   * renumbers everything below it, so a client tree that is not the server's
   * can claim a value recorded for a DIFFERENT call and resolve synchronously
   * with it — wrong data where a miss would only have cost a refetch. Nothing
   * positional can tell those apart at the moment of the read.
   */
  test("a divergent client tree shifts the auto-keys, and the drift is reported", async () => {
    const a = () =>
      createRoot(() => {
        createMemo(async () => "A-VALUE");
      });
    const b = () =>
      createRoot(() => {
        const value = createMemo(async () => "B-VALUE");
        return value;
      });

    const both = await renderInSession(() => {
      a();
      b();
    });
    const onlyB = await renderInSession(b);
    expect(Object.keys(both)).toHaveLength(2);
    // B moved: it is the second child of the root when A renders above it.
    expect(Object.keys(onlyB)).toEqual([Object.keys(both)[0]]);

    // The client renders B alone against a payload the server produced for A+B.
    seedStore(both);
    resetChildIds();
    const capture = DEV.diagnostics.capture();
    let read!: () => unknown;
    const dispose = underRoot(() => {
      read = b();
    });
    expect(read()).toBe("A-VALUE"); // the hazard, in one line
    // A's value was claimed by B, so B's is stranded — which is the evidence.
    // `hydrate` runs this once the first render has settled.
    expect(unclaimedSeeds()).toEqual([Object.keys(both)[1]]);
    const events = capture.stop();
    dispose();

    expect(events.map((event) => event.code)).toContain("HYDRATION_SEED_DRIFT");
    expect(events[0]?.data).toEqual([Object.keys(both)[1]]);
  });

  /**
   * ...and the way out. `name` folds an identity into the auto-key, so the
   * drifted read MISSES and refetches instead of resolving with a value that
   * belongs to another call. Siblings only have to differ from each other,
   * which is what makes this usable where a page-unique `key` is not.
   */
  test("a named read refetches on a divergent tree instead of seeding wrong data", async () => {
    let fetches = 0;
    const a = () =>
      createRoot(() => {
        createMemo(async () => "A-VALUE", { name: "a" });
      });
    const b = () =>
      createRoot(() => {
        const value = createMemo(
          async () => {
            fetches++;
            return "B-VALUE";
          },
          { name: "b" },
        );
        return value;
      });

    const both = await renderInSession(() => {
      a();
      b();
    });
    expect(Object.keys(both).every((key) => key.includes("~"))).toBe(true);
    expect(fetches).toBe(1);

    seedStore(both);
    resetChildIds();
    let read!: () => unknown;
    const dispose = underRoot(() => {
      read = b();
    });
    // A miss, not A's value. `isPending` reports STALENESS and this value has
    // never held one, so the honest probe is the read itself: it throws, which
    // is what a `Loading` boundary would catch, and a real fetch is running.
    expect(() => read()).toThrow(NotReadyError);
    expect(() => latest(read)).toThrow(NotReadyError);
    expect(fetches).toBe(2);
    dispose();
  });

  test("hydrate reports the drift once the first render has settled", () => {
    const capture = DEV.diagnostics.capture();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = hydrate(() => document.createTextNode("ok"), container, {
      data: { "r9~ghost": "a value this tree never asks for" },
    });
    const events = capture.stop();
    dispose();
    container.remove();

    expect(events.map((event) => event.code)).toContain("HYDRATION_SEED_DRIFT");
    expect(events[0]?.data).toEqual(["r9~ghost"]);
  });

  test("naming one read does not renumber its siblings", async () => {
    const data = await renderInSession(() => {
      createMemo(async () => "first");
      createMemo(async () => "second", { name: "middle" });
      createMemo(async () => "third");
    });
    const keys = Object.keys(data);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(`${keys[0]?.slice(0, -1)}1~middle`);
    expect(keys[2]).toBe(`${keys[0]?.slice(0, -1)}2`);
  });

  test("with no owner there is no tree to key off, so nothing is serialized", async () => {
    const pending: Promise<unknown>[] = [];
    const orphan = createMemo(tracked("orphan", pending));
    await Promise.allSettled(pending);

    expect(getHydrationData()).toEqual({});
    expect(orphan()).toBe("orphan");
  });
});
