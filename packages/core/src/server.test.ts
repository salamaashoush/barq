/**
 * SSR round-trip: renderToString / renderToStringAsync, hydration data
 * serialization, client hydrate() seeding (no refetch), settle().
 */

import { afterEach, describe, expect, test } from "bun:test";
import { Loading } from "./components.ts";
import { createElement, hydrate } from "./dom.ts";
import {
  clearRenderData,
  generateHydrationScript,
  getRenderData,
  renderToString,
  renderToStringAsync,
} from "./server.ts";
import {
  NotReadyError,
  computed,
  createAsync,
  createScope,
  effect,
  flush,
  setAsyncSession,
  settle,
  signal,
} from "./signals.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearRenderData();
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
});

describe("renderToString", () => {
  test("renders components and reactive values synchronously", () => {
    const count = signal(41);
    const doubled = computed(() => count() + 1);

    const html = renderToString(() =>
      createElement("div", { class: "app" }, "Count: ", () => String(doubled())),
    );

    expect(html).toContain('<div class="app">');
    expect(html).toContain("Count: ");
    expect(html).toContain("42");
  });

  test("escapes HTML in text content (XSS-safe by construction)", () => {
    const userInput = '<img src=x onerror="alert(1)">';
    const html = renderToString(() => createElement("p", null, userInput));

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("pending async renders the Loading fallback", () => {
    const data = createAsync(async () => {
      await tick();
      return "late";
    });

    const html = renderToString(() =>
      Loading(null, {
        fallback: document.createTextNode("loading..."),
        children: () => {
          try {
            return document.createTextNode(data());
          } catch (err) {
            if (err instanceof NotReadyError) throw err;
            throw err;
          }
        },
      }),
    );

    expect(html).toContain("loading...");
    expect(html).not.toContain("late");
  });
});

describe("renderToStringAsync", () => {
  test("waits for async values; Loading shows content", async () => {
    const user = createAsync(
      async () => {
        await tick();
        return { name: "Ada" };
      },
      { key: "user" },
    );

    const html = await renderToStringAsync(() =>
      Loading(null, {
        fallback: document.createTextNode("loading..."),
        children: () => document.createTextNode(`Hello ${user().name}`),
      }),
    );

    expect(html).toContain("Hello Ada");
    expect(html).not.toContain("loading...");
  });

  test("records keyed async values for hydration", async () => {
    const a = createAsync(async () => 1, { key: "a" });
    const b = createAsync(
      async () => {
        // waterfall: depends on a
        return a() + 1;
      },
      { key: "b" },
    );

    await renderToStringAsync(() => {
      return createElement("div", null, () => {
        return String(b());
      });
    });

    const data = getRenderData();
    expect(data.a).toBe(1);
    expect(data.b).toBe(2);
  });

  test("generateHydrationScript escapes script-breaking content", async () => {
    const evil = createAsync(async () => "</script><script>alert(1)</script>", { key: "evil" });

    await renderToStringAsync(() => createElement("div", null, () => evil().length.toString()));

    const script = generateHydrationScript();
    expect(script.startsWith("<script>window.__BARQ_DATA__=")).toBe(true);
    expect(script).not.toContain("</script><script>");
    expect(script.match(/<\/script>/g)?.length).toBe(1); // only the closing tag of the wrapper
  });
});

describe("hydrate", () => {
  test("seeded async values resolve synchronously: no refetch, no fallback flash", async () => {
    // --- server ---
    let fetches = 0;
    const makeApp = () => {
      const user = createAsync(
        async () => {
          fetches++;
          await tick();
          return "Ada";
        },
        { key: "user" },
      );
      return () =>
        Loading(null, {
          fallback: document.createTextNode("loading..."),
          children: () => document.createTextNode(`Hello ${user()}`),
        });
    };

    const serverHtml = await renderToStringAsync(makeApp());
    expect(fetches).toBe(1);
    const data = getRenderData();

    // --- client ---
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = serverHtml;

    hydrate(makeApp(), container, { data });
    flush();

    expect(container.textContent).toContain("Hello Ada");
    expect(container.textContent).not.toContain("loading...");
    await tick();
    flush();
    expect(fetches).toBe(1); // seeded: client never refetched
  });

  test("hydrated app is interactive (delegated events)", async () => {
    const makeApp = () => {
      const count = signal(0);
      return () =>
        createElement(
          "button",
          { onClick: () => count.update((n) => n + 1) },
          () => `clicks: ${count()}`,
        );
    };

    const serverHtml = renderToString(makeApp());
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = serverHtml;

    hydrate(makeApp(), container);
    flush();

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("clicks: 0");

    button.click();
    flush();
    expect(button.textContent).toBe("clicks: 1");
  });
});

describe("concurrent server renders", () => {
  test("two renders in flight settle independently with their own data", async () => {
    const makeApp = (label: string, delay: number) => {
      const data = createAsync(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return label;
        },
        { key: `data-${label}` },
      );
      return () =>
        Loading(null, {
          fallback: document.createTextNode("..."),
          children: () => document.createTextNode(`got:${data()}`),
        });
    };

    const [fastHtml, slowHtml] = await Promise.all([
      renderToStringAsync(makeApp("fast", 0)),
      renderToStringAsync(makeApp("slow", 10)),
    ]);

    expect(fastHtml).toContain("got:fast");
    expect(slowHtml).toContain("got:slow");
  });
});

describe("settle", () => {
  test("waits through async waterfalls (session-scoped)", async () => {
    const seen: number[] = [];
    const session = Symbol("test-session");

    const prev = setAsyncSession(session);
    try {
      createScope(() => {
        const first = createAsync(async () => {
          await tick();
          return 1;
        });
        const second = createAsync(async () => {
          const base = first(); // throws NotReady until first resolves
          await tick();
          return base + 1;
        });

        effect(() => {
          try {
            seen.push(second());
          } catch (err) {
            if (!(err instanceof NotReadyError)) throw err;
          }
        });
      }, true);
      flush();
    } finally {
      setAsyncSession(prev);
    }

    // Session-scoped: unrelated in-flight work elsewhere doesn't block this
    await settle(session);
    expect(seen).toEqual([2]);
  });
});
