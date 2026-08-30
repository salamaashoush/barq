import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { breakpoints, mediaQuery } from "./media.ts";

interface FakeList {
  media: string;
  matches: boolean;
  listeners: Set<(event: { matches: boolean }) => void>;
  addEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, handler: (event: { matches: boolean }) => void) => void;
}

const lists = new Map<string, FakeList>();
const realMatchMedia = window.matchMedia;

function setMatches(query: string, matches: boolean): void {
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
        media: query,
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

let unique = 0;
const query = () => `(min-width: ${1000 + unique++}px)`;

describe("mediaQuery", () => {
  test("follows the list and shares one list per query", async () => {
    const q = query();
    const dispose = root((d) => {
      const a = mediaQuery(q);
      const b = mediaQuery(q);
      expect(a).toBe(b);
      expect(a()).toBe(false);
      setMatches(q, true);
      expect(a()).toBe(true);
      return d;
    });
    expect(lists.get(q)!.listeners.size).toBe(1);
    dispose();
    await Promise.resolve();
    expect(lists.get(q)!.listeners.size).toBe(0);
  });

  test("a reactive query switches sources", () => {
    const first = query();
    const second = query();
    const which = signal(first);
    const dispose = root((d) => {
      const matches = mediaQuery(which);
      expect(matches()).toBe(false);

      window.matchMedia(second);
      setMatches(second, true);
      expect(matches()).toBe(false);

      which.set(second);
      flush();
      expect(matches()).toBe(true);
      return d;
    });
    dispose();
  });
});

describe("breakpoints", () => {
  test("reports each bound and the largest match", () => {
    const suffix = unique++;
    const dispose = root((d) => {
      const bp = breakpoints({
        sm: `${suffix}40px`,
        md: `${suffix}68px`,
        lg: `${suffix}99px`,
      });
      expect(bp.current()).toBeUndefined();

      setMatches(`(min-width: ${suffix}40px)`, true);
      flush();
      expect(bp.matches.sm()).toBe(true);
      expect(bp.current()).toBe("sm");

      setMatches(`(min-width: ${suffix}68px)`, true);
      flush();
      expect(bp.current()).toBe("md");

      setMatches(`(min-width: ${suffix}68px)`, false);
      setMatches(`(min-width: ${suffix}40px)`, false);
      flush();
      expect(bp.current()).toBeUndefined();
      return d;
    });
    dispose();
  });

  test("max-width bounds", () => {
    const suffix = unique++;
    const dispose = root((d) => {
      const bp = breakpoints({ small: `${suffix}00px` }, { watch: "max" });
      setMatches(`(max-width: ${suffix}00px)`, true);
      flush();
      expect(bp.matches.small()).toBe(true);
      return d;
    });
    dispose();
  });
});
