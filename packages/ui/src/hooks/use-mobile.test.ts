import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRoot, flush } from "@barqjs/core";

import { useIsMobile } from "./use-mobile.ts";

interface FakeList {
  matches: boolean;
  listeners: Set<(event: { matches: boolean }) => void>;
  addEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
}

const lists = new Map<string, FakeList>();
const realMatchMedia = window.matchMedia;

function resize(query: string, matches: boolean): void {
  const list = lists.get(query);
  if (list === undefined) throw new Error(`nothing asked for ${query}`);
  list.matches = matches;
  for (const handler of list.listeners) handler({ matches });
}

beforeEach(() => {
  lists.clear();
  window.matchMedia = ((query: string) => {
    let list = lists.get(query);
    if (list === undefined) {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      list = {
        matches: false,
        listeners,
        addEventListener: (_type, handler) => listeners.add(handler),
        removeEventListener: (_type, handler) => listeners.delete(handler),
      };
      lists.set(query, list);
    }
    return list;
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const QUERY = "(max-width: 767px)";

describe("useIsMobile", () => {
  test("it asks the one question shadcn asks: narrower than 768px", () => {
    const dispose = createRoot((done) => {
      useIsMobile();
      return done;
    });
    expect([...lists.keys()]).toEqual([QUERY]);
    dispose();
  });

  test("it follows the viewport across the breakpoint, both ways", () => {
    let mobile: () => boolean = () => true;
    const dispose = createRoot((done) => {
      mobile = useIsMobile();
      return done;
    });
    expect(mobile()).toBe(false);

    resize(QUERY, true);
    flush();
    expect(mobile()).toBe(true);

    resize(QUERY, false);
    flush();
    expect(mobile()).toBe(false);
    dispose();
  });

  test("leaving stops listening, so a route change does not leak a listener", async () => {
    const dispose = createRoot((done) => {
      useIsMobile();
      return done;
    });
    expect(lists.get(QUERY)?.listeners.size).toBe(1);
    dispose();
    // The shared list is released a microtask later, so a caller that leaves
    // as another arrives does not tear it down between the two.
    await Promise.resolve();
    expect(lists.get(QUERY)?.listeners.size).toBe(0);
  });

  test("every caller shares one list", () => {
    const dispose = createRoot((done) => {
      useIsMobile();
      useIsMobile();
      return done;
    });
    expect(lists.get(QUERY)?.listeners.size).toBe(1);
    dispose();
  });
});
