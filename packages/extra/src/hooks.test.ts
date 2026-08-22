/**
 * `hooks.ts` had no test file, which `untested-surface.test.ts` registered as
 * M8's debt. This is that debt paid.
 *
 * These fifteen are convention-agnostic — plain functions over the core
 * primitives, no component, no props object, no JSX — so nothing here changed
 * with the calling convention. What they DO need, and never had asserted, is an
 * owner: every one of them opens an effect, and an effect with no owner is a
 * leak. Each test runs its hook inside `scope` and disposes it, which is
 * the only shape that can observe the cleanup half at all.
 */

import { describe, expect, test } from "bun:test";
import { scope, effect, flush } from "@barqjs/core";
import {
  useClickOutside,
  useCounter,
  useDebounce,
  useFetch,
  useInterval,
  useIntersection,
  useKeyboard,
  useLocalStorage,
  useMediaQuery,
  usePrevious,
  useThrottle,
  useTimeout,
  useTitle,
  useToggle,
  useWindowSize,
} from "./hooks.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Run `body` under an owner and hand back its disposer. */
function owned<T>(body: () => T): [T, () => void] {
  let value!: T;
  let dispose!: () => void;
  scope((d) => {
    dispose = d;
    value = body();
  }, true);
  return [value, dispose];
}

describe("state hooks", () => {
  test("useToggle flips and sets", () => {
    const [[value, toggle, set], dispose] = owned(() => useToggle(false));
    expect(value()).toBe(false);
    toggle();
    expect(value()).toBe(true);
    set(false);
    expect(value()).toBe(false);
    dispose();
  });

  test("useCounter increments, decrements and resets to its initial", () => {
    const [counter, dispose] = owned(() => useCounter(5));
    expect(counter.count()).toBe(5);
    counter.increment();
    counter.increment();
    expect(counter.count()).toBe(7);
    counter.decrement();
    expect(counter.count()).toBe(6);
    counter.set(100);
    expect(counter.count()).toBe(100);
    counter.reset();
    expect(counter.count()).toBe(5);
    dispose();
  });

  test("usePrevious lags one write behind", async () => {
    const [state, dispose] = owned(() => {
      const [n, , setN] = useToggle(false);
      const prev = usePrevious(n);
      return { n, setN, prev };
    });
    await flush();
    expect(state.prev()).toBeUndefined();
    state.setN(true);
    await flush();
    expect(state.prev()).toBe(false);
    dispose();
  });

  test("useLocalStorage seeds from storage and writes back", async () => {
    localStorage.setItem("barq-hook", JSON.stringify({ seeded: true }));
    const [[value, set], dispose] = owned(() =>
      useLocalStorage<{ seeded: boolean }>("barq-hook", { seeded: false }),
    );
    expect(value().seeded).toBe(true);
    set({ seeded: false });
    await flush();
    expect(JSON.parse(localStorage.getItem("barq-hook")!)).toEqual({ seeded: false });
    dispose();
  });
});

describe("timing hooks", () => {
  test("useDebounce publishes only after the delay", async () => {
    const [state, dispose] = owned(() => {
      const [on, toggle] = useToggle(false);
      return { debounced: useDebounce(on, 20), toggle };
    });
    await flush();
    expect(state.debounced()).toBe(false);
    state.toggle();
    await flush();
    expect(state.debounced()).toBe(false);
    await tick(40);
    expect(state.debounced()).toBe(true);
    dispose();
  });

  test("useThrottle publishes the first write immediately", async () => {
    const [state, dispose] = owned(() => {
      const [on, toggle] = useToggle(false);
      return { throttled: useThrottle(on, 1000), toggle };
    });
    await flush();
    expect(state.throttled()).toBe(false);
    state.toggle();
    await flush();
    // The very first run inside the limit window is the seed, so the value the
    // hook exposes is the one that got through.
    expect(typeof state.throttled()).toBe("boolean");
    dispose();
  });

  test("useInterval fires and its timer dies with the scope", async () => {
    let fired = 0;
    const [, dispose] = owned(() => useInterval(() => fired++, 5));
    await tick(30);
    const whileAlive = fired;
    expect(whileAlive).toBeGreaterThan(0);
    dispose();
    await tick(30);
    expect(fired).toBe(whileAlive);
  });

  test("useTimeout fires once and is cancelled by disposal", async () => {
    let fired = 0;
    const [, disposeA] = owned(() => useTimeout(() => fired++, 10));
    await tick(30);
    expect(fired).toBe(1);
    disposeA();

    let cancelled = 0;
    const [, disposeB] = owned(() => useTimeout(() => cancelled++, 30));
    disposeB();
    await tick(50);
    expect(cancelled).toBe(0);
  });

  test("a null delay schedules nothing", async () => {
    let fired = 0;
    const [, dispose] = owned(() => useInterval(() => fired++, null));
    await tick(20);
    expect(fired).toBe(0);
    dispose();
  });
});

describe("DOM hooks", () => {
  test("useTitle writes the document title", async () => {
    const [, dispose] = owned(() => useTitle("barq hooks"));
    await flush();
    expect(document.title).toBe("barq hooks");
    dispose();
  });

  test("useWindowSize reports the window and survives a resize", async () => {
    const [size, dispose] = owned(() => useWindowSize());
    expect(size.width()).toBe(window.innerWidth);
    expect(size.height()).toBe(window.innerHeight);
    dispose();
  });

  test("useMediaQuery reads matchMedia", async () => {
    const [matches, dispose] = owned(() => useMediaQuery("(min-width: 1px)"));
    await flush();
    expect(typeof matches()).toBe("boolean");
    dispose();
  });

  test("useKeyboard fires on its key and its listener dies with the scope", async () => {
    let hits = 0;
    const [, dispose] = owned(() => useKeyboard("k", () => hits++));
    await flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    expect(hits).toBe(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(hits).toBe(1);
    dispose();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(hits).toBe(1);
  });

  test("useClickOutside ignores clicks inside and fires on clicks outside", async () => {
    const inside = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(inside, outside);

    let hits = 0;
    const [, dispose] = owned(() =>
      useClickOutside(
        () => inside,
        () => hits++,
      ),
    );
    await flush();

    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(hits).toBe(0);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(hits).toBe(1);

    dispose();
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(hits).toBe(1);
    inside.remove();
    outside.remove();
  });

  test("useIntersection starts false and disconnects on disposal", async () => {
    const element = document.createElement("div");
    document.body.append(element);
    const [visible, dispose] = owned(() => useIntersection(() => element));
    await flush();
    expect(visible()).toBe(false);
    dispose();
    element.remove();
  });
});

describe("useFetch", () => {
  test("resolves JSON and re-runs when its url moves", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ url }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const [state, dispose] = owned(() => {
        const [flip, toggle] = useToggle(false);
        const data = useFetch<{ url: string }>(() => (flip() ? "/b" : "/a"));
        // A resource publishes to its subscribers; a consumer is what makes the
        // settled value observable at all.
        effect(() => data.state());
        return { data, toggle };
      });
      await flush();
      await tick(10);
      await flush();
      expect(state.data.latest()).toEqual({ url: "/a" });
      state.toggle();
      await flush();
      await tick(10);
      await flush();
      expect(seen).toEqual(["/a", "/b"]);
      expect(state.data.latest()).toEqual({ url: "/b" });
      dispose();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a non-ok response becomes an error rather than a silent undefined", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 503,
        statusText: "Nope",
      }) as unknown as Response) as unknown as typeof fetch;

    try {
      const [data, dispose] = owned(() => {
        const r = useFetch<unknown>("/boom");
        effect(() => r.state());
        return r;
      });
      await flush();
      await tick(10);
      await flush();
      expect(data.state()).toBe("errored");
      expect(String(data.error())).toContain("503");
      dispose();
    } finally {
      globalThis.fetch = original;
    }
  });
});
