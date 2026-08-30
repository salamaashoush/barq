/**
 * The four published entries must share ONE runtime.
 *
 * `src/signals.ts` holds module state — `activeAsyncSession`, the in-flight
 * registry, the hydration store — and every entry reaches it. A build that
 * emits each entry as its own bundle gives each one a private copy, and the
 * copies cannot see each other: `@barqjs/router/server` calls `setAsyncSession`
 * from `@barqjs/core/internal` while the render's async work is attributed to
 * the session `@barqjs/core` holds, which is a different variable. Measured on
 * a scaffolded project before this was fixed — an SSR route with a loader
 * served its pending fallback forever and seeded no data, on an application
 * that was correct.
 *
 * INVISIBLE IN THE WORKSPACE, which is why it survived: `bun` resolution takes
 * every `@barqjs/*` import to `src/`, where there is one copy by construction.
 * Only a project resolving through `dist` ever sees two, so this has to run
 * against `dist` and needs the package built.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const ENTRIES = ["index", "internal", "interp", "jsx-runtime"] as const;

const distOf = (entry: string): string =>
  fileURLToPath(new URL(`../dist/${entry}.js`, import.meta.url));

const built = ENTRIES.every((entry) => existsSync(distOf(entry)));

interface Index {
  computed: (fn: () => Promise<unknown>, options?: { key?: string }) => () => unknown;
  isPending: (read: () => unknown) => boolean;
  scope: (fn: (dispose: () => void) => void, detached?: boolean) => unknown;
  settle: (session?: symbol) => Promise<void>;
}

interface Internal {
  setAsyncSession: (session: symbol | null) => symbol | null;
  getHydrationData: (session?: symbol) => Record<string, unknown>;
  clearHydrationData: (session?: symbol) => void;
}

describe.if(built)("the published entries share one runtime", () => {
  /**
   * The failure in miniature: `@barqjs/core/internal` opens the session and
   * `@barqjs/core` does the work inside it. Two copies and the seed lands in
   * the other store, which is what a parked SSR page looks like from here.
   */
  test("a session opened through ./internal collects work done through .", async () => {
    const index = (await import(distOf("index"))) as unknown as Index;
    const internal = (await import(distOf("internal"))) as unknown as Internal;

    const session = Symbol("dist-entries");
    const previous = internal.setAsyncSession(session);
    let dispose!: () => void;
    try {
      index.scope((release) => {
        dispose = release;
        const user = index.computed(async () => "Ada", { key: "user" });
        // Reading is what STARTS a lazy async computed, and `isPending` reads
        // without asserting on a value that is not there yet.
        index.isPending(user);
      }, true);
    } finally {
      internal.setAsyncSession(previous);
    }

    await index.settle(session);
    const data = internal.getHydrationData(session);
    internal.clearHydrationData(session);
    dispose();

    expect(data, "./internal and . hold separate async sessions").toEqual({ user: "Ada" });
  });

  test("a name exported by two entries is the SAME binding in both", async () => {
    const loaded = await Promise.all(
      ENTRIES.map(async (entry) => [entry, await import(distOf(entry))] as const),
    );

    const split: string[] = [];
    for (const [index, [leftName, left]] of loaded.entries()) {
      for (const [rightName, right] of loaded.slice(index + 1)) {
        const exports = left as Record<string, unknown>;
        for (const name of Object.keys(exports)) {
          if (!(name in right)) continue;
          // Only a reference tells the copies apart. A duplicated primitive is
          // still `===`; a duplicated function or symbol never is.
          const value = exports[name];
          if (typeof value !== "function" && typeof value !== "symbol") continue;
          if (value !== (right as Record<string, unknown>)[name]) {
            split.push(`${name}: ${leftName} !== ${rightName}`);
          }
        }
      }
    }

    expect(split, "these entries were bundled separately and hold separate state").toEqual([]);
  });
});
