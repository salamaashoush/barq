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
  renderToStream,
  renderToString,
  renderToStringAsync,
  swapDeferredRange,
} from "./server.ts";
import { esc, html as ssrHtml, ssrLoading } from "./ssr.ts";
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

/**
 * Streaming — `CODESIGN.md` §3.11.
 *
 * "an unready boundary flushes `<!--[b:7-->fallback<!--]-->` plus a continuation
 * record `(Block, Scope)`; when its promises settle the server flushes a
 * `<template>` and a swap. The Block is re-invocable with its scope, so there is
 * no second code path."
 *
 * The tests below are about those three sentences and nothing else: the shell
 * really is flushed before the boundary resolves (which is the only reason to
 * stream at all), the range comment carries the continuation's address, and the
 * SECOND invocation is the same Block under the same scope.
 */
describe("renderToStream", () => {
  async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(decoder.decode(value));
    }
    return parts;
  }

  test("the shell is flushed before the boundary resolves, and the content follows", async () => {
    const late = createAsync(async () => {
      await tick();
      return "Ada";
    });
    const page = (): unknown =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>loading</i>"),
            children: () => ssrHtml(`<b>${esc(late())}</b>`),
          }),
        )}</main>`,
      );

    const parts = await collect(renderToStream(page as never));

    // The shell is its own chunk, and it carries the fallback, not the value.
    expect(parts[0]).toContain("<i>loading</i>");
    expect(parts[0]).not.toContain("Ada");
    // §3.11's range instruction, naming the continuation.
    expect(parts[0]).toContain("<!--[b:0-->");
    expect(parts[0]).toContain("<!--]-->");
    // The content arrives later, in a template plus a swap.
    const rest = parts.slice(1).join("");
    expect(rest).toContain('<template data-barq="0">');
    expect(rest).toContain("<b>Ada</b>");
    expect(rest).toContain("__BARQ_SWAP__(0)");

    // The snippet is script DATA, which is raw text: nothing decodes inside it,
    // so there is no entity to escape a `<` with and a `<` is the first byte of
    // the only sequence that can leave the element early. The shipped function
    // therefore contains none, and this is where that stays true.
    const snippet = parts.join("").match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(snippet).toContain("__BARQ_SWAP__=");
    expect(snippet, "the swap snippet grew a `<`").not.toContain("<");
  });

  test("the swap replaces exactly the deferred range", async () => {
    const late = createAsync(async () => {
      await tick();
      return "Ada";
    });
    const page = (): unknown =>
      ssrHtml(
        `<main><p>before</p>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>loading</i>"),
            children: () => ssrHtml(`<b>${esc(late())}</b>`),
          }),
        )}<p>after</p></main>`,
      );

    const html = (await collect(renderToStream(page as never))).join("");
    const host = document.createElement("div");
    document.body.appendChild(host);
    try {
      host.innerHTML = html;
      // A script assigned through `innerHTML` does not execute, so the swap is
      // driven directly — and `swapDeferredRange` is not a paraphrase of the
      // snippet, it IS the snippet: `SWAP_SNIPPET` is its `toString()`.
      expect(html, "the page carries the function this test calls").toContain("swapDeferredRange");
      swapDeferredRange(0);
      const main = host.querySelector("main")!;
      expect(main.innerHTML).toContain("<b>Ada</b>");
      expect(main.innerHTML).not.toContain("loading");
      // The surrounding markup is untouched: the range is the blast radius.
      expect(main.firstElementChild?.outerHTML).toBe("<p>before</p>");
      expect(main.lastElementChild?.outerHTML).toBe("<p>after</p>");
    } finally {
      host.remove();
    }
  });

  test("a page with nothing to defer streams one chunk and no swap machinery", async () => {
    const parts = await collect(renderToStream((() => ssrHtml("<p>flat</p>")) as never));
    expect(parts).toEqual(["<p>flat</p>"]);
  });
});
