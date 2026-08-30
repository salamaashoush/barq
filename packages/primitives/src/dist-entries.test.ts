/**
 * The published entries must share ONE module instance each.
 *
 * Half of this package is module state: the `ResizeObserver` registry keyed by
 * box, the `MediaQueryList` cache keyed by query, the shared roots behind
 * `windowSize`, `mousePosition` and `activeElement`. Every one of them exists
 * so that a page pays for one listener rather than one per component, and all
 * of that is undone if `@barqjs/primitives` and `@barqjs/primitives/element`
 * are bundled separately: two copies, two registries, two listeners, and a
 * `clear()` obtained through one entry that does not release the other's.
 *
 * INVISIBLE IN THE WORKSPACE. Bun resolution takes every `@barqjs/*` import to
 * `src/`, where there is one copy by construction, so this has to run against
 * `dist` and needs the package built.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const ENTRIES = [
  "index",
  "animation",
  "browser",
  "bus",
  "clipboard",
  "collections",
  "derived",
  "element",
  "event",
  "focus",
  "fullscreen",
  "geolocation",
  "history",
  "keyboard",
  "machine",
  "media",
  "mouse",
  "observers",
  "promise",
  "raf",
  "refs",
  "scheduled",
  "scroll",
  "storage",
  "timer",
  "utils",
  "virtual",
  "websocket",
] as const;

const distOf = (entry: string): string =>
  fileURLToPath(new URL(`../dist/${entry}.js`, import.meta.url));

const built = ENTRIES.every((entry) => existsSync(distOf(entry)));

describe.if(built)("the published entries share one runtime", () => {
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

  test("a shared root reached through two entries is one root", async () => {
    const root = (await import(distOf("index"))) as unknown as {
      windowSize: () => unknown;
    };
    const element = (await import(distOf("element"))) as unknown as {
      windowSize: () => unknown;
    };

    expect(root.windowSize(), "the root barrel and ./element hold separate window listeners").toBe(
      element.windowSize(),
    );
  });

  test("the observer registry is one registry", async () => {
    const root = (await import(distOf("index"))) as unknown as {
      resizeObserver: (target: Element, handler: () => void) => () => void;
    };
    const observers = (await import(distOf("observers"))) as typeof root;

    const seen: Element[] = [];
    const created: unknown[] = [];
    const real = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor() {
        created.push(this);
      }
      observe(target: Element) {
        seen.push(target);
      }
      unobserve() {}
      disconnect() {}
    };

    try {
      const target = document.createElement("div");
      const clearA = root.resizeObserver(target, () => {});
      const clearB = observers.resizeObserver(target, () => {});
      expect(created, "each entry built its own ResizeObserver").toHaveLength(1);
      expect(seen, "the element was observed twice").toHaveLength(1);
      clearA();
      clearB();
    } finally {
      globalThis.ResizeObserver = real;
    }
  });
});
