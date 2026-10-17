/**
 * Scroll restoration and view transitions.
 *
 * Both are NEW WORK: the router this replaced had zero tests for either, so
 * what exists is a list of its bugs. Each test below names the one it pins.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { parseLocation } from "./history.ts";
import { flush } from "@barqjs/core";
import { render } from "@barqjs/web";

import { RouterProvider } from "./components.ts";
import { memoryHistory } from "./history.ts";
import { useElementScrollRestoration } from "./hooks.ts";
import { createRouter } from "./router.ts";
import {
  SCROLL_ID_ATTRIBUTE,
  savedScrollPosition,
  scrollKey,
  scrollRestoration,
  withViewTransition,
} from "./scroll.ts";

const at = (url: string) => parseLocation(url);

beforeEach(() => {
  globalThis.sessionStorage?.clear();
  document.body.innerHTML = "";
  window.scrollTo(0, 0);
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** `requestAnimationFrame` is where `restore` does its work. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

describe("scrollKey", () => {
  test("includes the HASH, so two anchors on one page do not share a slot", () => {
    // The old router keyed on `pathname + search`, so `/docs#intro` and
    // `/docs#api` overwrote each other.
    expect(scrollKey(at("/docs#intro"))).not.toBe(scrollKey(at("/docs#api")));
    expect(scrollKey(at("/docs?a=1"))).not.toBe(scrollKey(at("/docs?a=2")));
  });

  test("state is not part of where you are", () => {
    expect(scrollKey(parseLocation("/x", { some: "state" }))).toBe(scrollKey(at("/x")));
  });
});

describe("scrollRestoration", () => {
  test("takes ownership from the browser", () => {
    // The old router never set this, so the browser's own restoration raced it
    // on every popstate and could clobber the position before it was read.
    const restoration = scrollRestoration();
    expect(history.scrollRestoration).toBe("manual");
    restoration.dispose();
  });

  test("an element that opts in has its own scroll remembered", async () => {
    const panel = document.createElement("div");
    panel.setAttribute(SCROLL_ID_ATTRIBUTE, "panel");
    document.body.append(panel);

    const restoration = scrollRestoration();
    panel.scrollTop = 120;
    restoration.save(at("/list"));

    panel.scrollTop = 0;
    restoration.restore(at("/list"));
    await nextFrame();
    expect(panel.scrollTop).toBe(120);
    restoration.dispose();
  });

  test("`reset` ignores what was saved and goes to the top", async () => {
    const panel = document.createElement("div");
    panel.setAttribute(SCROLL_ID_ATTRIBUTE, "panel");
    document.body.append(panel);

    const restoration = scrollRestoration();
    panel.scrollTop = 90;
    restoration.save(at("/list"));
    panel.scrollTop = 40;

    restoration.restore(at("/list"), { reset: true });
    await nextFrame();
    // Untouched by the restore, because a reset scrolls the WINDOW to the top
    // rather than putting every container back.
    expect(panel.scrollTop).toBe(40);
    restoration.dispose();
  });

  test("a hash scrolls to its element rather than to the top", async () => {
    // The old router never read the hash at all: every `#section` link went to
    // (0,0).
    const target = document.createElement("div");
    target.id = "section";
    let seen = false;
    target.scrollIntoView = () => {
      seen = true;
    };
    document.body.append(target);

    const restoration = scrollRestoration();
    restoration.restore(at("/docs#section"));
    await nextFrame();
    expect(seen).toBe(true);
    restoration.dispose();
  });

  test("a saved position WINS over the hash, because you were already there", async () => {
    const target = document.createElement("div");
    target.id = "section";
    let seen = false;
    target.scrollIntoView = () => {
      seen = true;
    };
    document.body.append(target);

    const restoration = scrollRestoration();
    restoration.save(at("/docs#section"));
    restoration.restore(at("/docs#section"));
    await nextFrame();
    expect(seen).toBe(false);
    restoration.dispose();
  });

  test("the store is BOUNDED, unlike the map that grew forever", () => {
    const restoration = scrollRestoration();
    for (let i = 0; i < 120; i++) restoration.save(at(`/p/${i}`));
    const raw = globalThis.sessionStorage?.getItem("barq-scroll-v1") ?? "{}";
    expect(Object.keys(JSON.parse(raw) as object).length).toBeLessThanOrEqual(50);
    // …and it keeps the most RECENT, so going back one page still works.
    expect(raw).toContain("/p/119");
    restoration.dispose();
  });

  test("no DOM means a no-op rather than a throw", () => {
    // The old router touched `window` unguarded and its default was ON, so a
    // server render threw.
    const realDocument = globalThis.document;
    Reflect.deleteProperty(globalThis, "document");
    try {
      const restoration = scrollRestoration();
      expect(() => {
        restoration.save(at("/x"));
        restoration.restore(at("/x"));
        restoration.dispose();
      }).not.toThrow();
    } finally {
      globalThis.document = realDocument;
    }
  });
});

describe("withViewTransition", () => {
  test("commits plainly when nothing is asking for a transition", async () => {
    let committed = 0;
    await withViewTransition(() => committed++, { enabled: false });
    expect(committed).toBe(1);
  });

  test("commits plainly when the browser does not support it", async () => {
    let committed = 0;
    await withViewTransition(() => committed++, { enabled: true });
    expect(committed).toBe(1);
  });

  test("awaits updateCallbackDone and NOT finished", async () => {
    // The old router awaited `finished`, which resolves when the ANIMATION
    // ends — so everything downstream of the commit was pinned for the whole
    // animation, including the scroll restore and the loading flag.
    let resolveFinished: (() => void) | null = null;
    let committed = 0;
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (
      callback: () => void,
    ) => {
      callback();
      return {
        updateCallbackDone: Promise.resolve(),
        finished: new Promise<void>((resolve) => {
          resolveFinished = resolve;
        }),
      };
    };
    try {
      await withViewTransition(() => committed++, { enabled: true });
      // Returned WITHOUT the animation having finished.
      expect(committed).toBe(1);
      expect(resolveFinished).not.toBeNull();
    } finally {
      (resolveFinished as unknown as () => void)();
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  test("a hidden tab commits plainly, because its promises may never settle", async () => {
    let started = 0;
    (document as unknown as { startViewTransition: unknown }).startViewTransition = () => {
      started++;
      return {
        updateCallbackDone: new Promise<void>(() => {}),
        finished: new Promise<void>(() => {}),
      };
    };
    const realVisibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      let committed = 0;
      await withViewTransition(() => committed++, { enabled: true });
      expect(committed).toBe(1);
      expect(started).toBe(0);
    } finally {
      if (realVisibility !== undefined) {
        Object.defineProperty(Document.prototype, "visibilityState", realVisibility);
      }
      Reflect.deleteProperty(document, "visibilityState");
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    }
  });
});

/**
 * The two scroll options a project may need: what a position is filed under,
 * and what a reset actually scrolls.
 */
describe("scroll options", () => {
  test("getKey decides the slot, so a filter query can share one", async () => {
    // The default keys on the whole URL, so typing in a search box writes a new
    // slot per keystroke and going back restores a position nobody was at.
    const restoration = scrollRestoration({ getKey: (location) => location.pathname });
    window.scrollTo(0, 400);
    restoration.save(at("/list?q=ab"));

    window.scrollTo(0, 0);
    restoration.restore(at("/list?q=abc"));
    await nextFrame();
    expect(window.scrollY).toBe(400);
    restoration.dispose();
  });

  test("without it, a different query is a different slot", async () => {
    const restoration = scrollRestoration();
    window.scrollTo(0, 400);
    restoration.save(at("/list?q=ab"));

    window.scrollTo(0, 0);
    restoration.restore(at("/list?q=abc"));
    await nextFrame();
    expect(window.scrollY).toBe(0);
    restoration.dispose();
  });

  /**
   * A layout whose `<main>` is the scroller leaves the window at zero, so
   * resetting the window alone moves nothing a visitor can see.
   */
  test("toTop reaches an element the window does not", async () => {
    const main = document.createElement("main");
    main.className = "pane";
    document.body.append(main);
    let scrolledTo: unknown;
    (main as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo = (x, y) => {
      scrolledTo = { x, y };
    };

    const restoration = scrollRestoration({ toTop: [".pane"] });
    restoration.restore(at("/fresh"), { reset: true });
    await nextFrame();
    expect(scrolledTo).toEqual({ x: 0, y: 0 });
    restoration.dispose();
  });

  test("a lookup function works as well as a selector", async () => {
    const pane = document.createElement("div");
    let hit = false;
    (pane as unknown as { scrollTo: () => void }).scrollTo = () => {
      hit = true;
    };
    const restoration = scrollRestoration({ toTop: [() => pane] });
    restoration.restore(at("/fresh"), { reset: true });
    await nextFrame();
    expect(hit).toBe(true);
    restoration.dispose();
  });

  /** A hash still wins: a `#section` link is not a reset. */
  test("a hash target is scrolled to instead of the top", async () => {
    const target = document.createElement("div");
    target.id = "api";
    let intoView = false;
    (target as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {
      intoView = true;
    };
    document.body.append(target);
    let paneScrolled = false;
    const pane = document.createElement("div");
    (pane as unknown as { scrollTo: () => void }).scrollTo = () => {
      paneScrolled = true;
    };

    const restoration = scrollRestoration({ toTop: [() => pane] });
    restoration.restore(at("/docs#api"));
    await nextFrame();
    expect(intoView).toBe(true);
    expect(paneScrolled).toBe(false);
    restoration.dispose();
  });
});

describe("TanStack's scroll options", () => {
  const scrolls = (): { calls: unknown[][]; restore: () => void } => {
    const calls: unknown[][] = [];
    const real = window.scrollTo;
    window.scrollTo = (...given: unknown[]) => {
      calls.push(given);
    };
    return { calls, restore: () => (window.scrollTo = real) };
  };

  test("`behavior` is how a reset and a restore move", async () => {
    const window_ = scrolls();
    try {
      const restoration = scrollRestoration({ behavior: "smooth" });
      restoration.restore(at("/fresh"));
      await nextFrame();
      expect(window_.calls.at(-1)).toEqual([{ left: 0, top: 0, behavior: "smooth" }]);

      restoration.save(at("/seen"));
      restoration.restore(at("/seen"));
      await nextFrame();
      expect(window_.calls.at(-1)).toEqual([{ left: 0, top: 0, behavior: "smooth" }]);
      restoration.dispose();
    } finally {
      window_.restore();
    }
  });

  test("`hashScrollIntoView` decides whether the hash target moves, and how", async () => {
    const target = document.createElement("h2");
    target.id = "api";
    const given: unknown[] = [];
    target.scrollIntoView = (options?: unknown) => {
      given.push(options);
    };
    document.body.append(target);

    const off = scrollRestoration({ hashScrollIntoView: false });
    off.restore(at("/docs#api"));
    await nextFrame();
    expect(given).toEqual([]);
    // One navigation may still ask for it.
    off.restore(at("/docs#api"), { hashScrollIntoView: true });
    await nextFrame();
    expect(given).toEqual([undefined]);
    off.dispose();

    const smooth = scrollRestoration({ hashScrollIntoView: { behavior: "smooth" } });
    smooth.restore(at("/docs#api"));
    await nextFrame();
    expect(given.at(-1)).toEqual({ behavior: "smooth" });
    // And one navigation may refuse it.
    smooth.restore(at("/docs#api"), { hashScrollIntoView: false });
    await nextFrame();
    expect(given).toHaveLength(2);
    smooth.dispose();
  });

  test("the router's names reach the same options", async () => {
    const panel = document.createElement("main");
    panel.className = "scroller";
    let reset = 0;
    panel.scrollTo = () => {
      reset++;
    };
    document.body.append(panel);
    const state = createRouter({
      routeTree: [
        { path: "/", component: (() => null) as never },
        { path: "/list", component: (() => null) as never },
      ] as never,
      history: memoryHistory({ initial: ["/"] }),
      scrollToTopSelectors: [".scroller"],
      getScrollRestorationKey: (location) => location.pathname,
    });
    await state.navigate("/list?q=a");
    await nextFrame();
    expect(reset).toBe(1);

    // Filed under the pathname, as the key function says, whatever the query.
    await state.navigate("/");
    expect(savedScrollPosition("/list", "window")).toEqual({ scrollX: 0, scrollY: 0 });
    expect(savedScrollPosition("/list?q=a", "window")).toBeUndefined();
    state.dispose();
  });

  test("useElementScrollRestoration answers where a container was left for this location", async () => {
    const panel = document.createElement("div");
    panel.setAttribute(SCROLL_ID_ATTRIBUTE, "feed");
    document.body.append(panel);

    let seen: unknown = "unset";
    let byElement: unknown = "unset";
    const read = (): null => {
      seen = useElementScrollRestoration({ id: "feed" });
      byElement = useElementScrollRestoration({ getElement: () => panel });
      return null;
    };
    const state = createRouter({
      routeTree: [
        { path: "/", component: (() => null) as never },
        { path: "/feed", component: read as never },
      ] as never,
      history: memoryHistory({ initial: ["/"] }),
    });
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      (() =>
        (RouterProvider as never as (p: unknown) => unknown)({
          state: () => state,
        })) as never,
      host,
    );
    flush();

    await state.navigate("/feed");
    flush();
    // Never left yet, so nothing was saved for it.
    expect(seen).toBeUndefined();

    panel.scrollTop = 340;
    panel.scrollLeft = 12;
    await state.navigate("/");
    flush();
    await state.navigate("/feed");
    flush();
    expect(seen).toEqual({ scrollX: 12, scrollY: 340 });
    expect(byElement).toEqual({ scrollX: 12, scrollY: 340 });
    dispose();
  });
});

describe("view transition types", () => {
  const transitions = (typed: boolean): { started: unknown[]; restore: () => void } => {
    const started: unknown[] = [];
    const doc = document as unknown as { startViewTransition?: unknown };
    const real = doc.startViewTransition;
    doc.startViewTransition = (given: (() => void) | { update: () => void }) => {
      if (typeof given !== "function" && !typed) throw new TypeError("not a function");
      started.push(given);
      (typeof given === "function" ? given : given.update)();
      return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
    };
    return { started, restore: () => (doc.startViewTransition = real) };
  };

  test("types are handed to the browser with the update", async () => {
    const browser = transitions(true);
    try {
      let committed = 0;
      await withViewTransition(() => committed++, { enabled: true, types: ["slide", "forward"] });
      expect(committed).toBe(1);
      expect((browser.started[0] as { types: string[] }).types).toEqual(["slide", "forward"]);
    } finally {
      browser.restore();
    }
  });

  test("a browser without typed transitions runs a plain one, once", async () => {
    const browser = transitions(false);
    try {
      let committed = 0;
      await withViewTransition(() => committed++, { enabled: true, types: ["slide"] });
      expect(committed).toBe(1);
      expect(typeof browser.started[0]).toBe("function");
    } finally {
      browser.restore();
    }
  });

  test("the router resolves a `types` function per navigation, and `false` skips the transition", async () => {
    const browser = transitions(true);
    try {
      const asked: { from: string | undefined; to: string; pathChanged: boolean }[] = [];
      const state = createRouter({
        routeTree: [
          { path: "/", component: (() => null) as never },
          { path: "/a", component: (() => null) as never },
          { path: "/b", component: (() => null) as never },
        ] as never,
        history: memoryHistory({ initial: ["/"] }),
        defaultViewTransition: {
          types: (info) => {
            asked.push({
              from: info.fromLocation?.pathname,
              to: info.toLocation.pathname,
              pathChanged: info.pathChanged,
            });
            return info.toLocation.pathname === "/b" ? false : ["fade"];
          },
        },
      });
      await state.navigate("/a");
      await nextFrame();
      expect(asked).toEqual([{ from: "/", to: "/a", pathChanged: true }]);
      expect((browser.started[0] as { types: string[] }).types).toEqual(["fade"]);

      await state.navigate("/b");
      await nextFrame();
      expect(browser.started).toHaveLength(1);
      expect(state.location().pathname).toBe("/b");

      // One navigation's own answer wins over the router's.
      await state.navigate({ to: "/a", viewTransition: { types: ["back"] } });
      await nextFrame();
      expect((browser.started[1] as { types: string[] }).types).toEqual(["back"]);
      state.dispose();
    } finally {
      browser.restore();
    }
  });
});
