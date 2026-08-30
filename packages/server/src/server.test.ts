// oxlint-disable no-eval -- the seed payload IS a program: seroval's JS mode
// emits the expression that rebuilds the value, and running it is how a browser
// consumes it. Asserting on the string instead would test the encoder against
// itself rather than against an evaluator.

/**
 * SSR round-trip: renderToString / renderToStringAsync, hydration data
 * serialization, client hydrate() seeding (no refetch), settle().
 */

import {
  HYDRATE,
  Loading,
  NotReadyError,
  boundary,
  computed,
  effect,
  element,
  flush,
  hydrate,
  runWithOwner,
  template,
  scope,
  settle,
  signal,
} from "@barqjs/core";
import { SEED_ABANDONED, getHydrationData, setAsyncSession } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";

import {
  clearRenderData,
  generateHydrationScript,
  getRenderData,
  renderPage,
  renderToStream,
  renderToString,
  renderToStringAsync,
  swapDeferredRange,
} from "./server.ts";
import { type SsrHtml, boundary as ssrBoundary, esc, html as ssrHtml, ssrLoading } from "./ssr.ts";
import { encodeSeed } from "./codec.ts";

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

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Run every inline seed script in document order, as a browser would.
 *
 * All of them, not the assignment alone: the cross-reference header is its own
 * statement and the payload refers to a bare `$R`, so evaluating a payload
 * without its header fails with `$R is not defined`. That is precisely the
 * mistake a regex over `__BARQ_DATA__=` makes.
 */
function runSeedScripts(html: string): Record<string, unknown> {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1] ?? "")
    // THREE kinds, and missing any one of them breaks the rest. The cross-
    // reference header defines `$R`; the payload assigns `__BARQ_DATA__` and
    // refers to a bare `$R`; and a RESOLUTION statement settles a promise the
    // payload already stored, mentioning only `$R`. Filtering on
    // `__BARQ_DATA__` alone dropped the third and left every eagerly-seeded key
    // pending for good — which is a harness bug that looks exactly like a
    // product hang.
    .filter((source) => source.includes("__BARQ_DATA__") || source.includes("$R"));
  (0, eval)(scripts.join(";"));
  return (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__ ?? {};
}

afterEach(() => {
  clearRenderData();
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
});

describe("renderToString", () => {
  test("renders components and reactive values synchronously", () => {
    const count = signal(41);
    const doubled = computed(() => count() + 1);

    const html = renderToString(() =>
      element(null, "div", { class: "app", children: ["Count: ", () => String(doubled())] }),
    );

    expect(html).toContain('<div class="app">');
    expect(html).toContain("Count: ");
    expect(html).toContain("42");
  });

  test("escapes HTML in text content (XSS-safe by construction)", () => {
    const userInput = '<img src=x onerror="alert(1)">';
    const html = renderToString(() => element(null, "p", { children: userInput }));

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("pending async renders the Loading fallback", () => {
    const data = computed(async () => {
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
    const user = computed(
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
    const a = computed(async () => 1, { key: "a" });
    const b = computed(
      async () => {
        // waterfall: depends on a
        return a() + 1;
      },
      { key: "b" },
    );

    await renderToStringAsync(() => {
      return element(null, "div", {
        children: () => {
          return String(b());
        },
      });
    });

    const data = getRenderData();
    expect(data.a).toBe(1);
    expect(data.b).toBe(2);
  });

  test("the string render's second pass reads what the first one resolved", async () => {
    // `renderPage` re-invokes the page after `settle` because a string boundary
    // has no later frame to swap into. The second pass builds FRESH nodes, so
    // whether it sees the settled value is a question about the seed lookup,
    // and the lookup used to consult only the client's `__BARQ_DATA__` — unset
    // on a server. The failure was silent and total: every loader ran twice and
    // every boundary emitted its fallback, with the right value sitting in the
    // seed beside it.
    let calls = 0;
    const page = (): unknown => {
      const user = computed(
        async () => {
          calls++;
          await tick();
          return "Ada";
        },
        { key: "r:/users/$id|{id:7}" },
      );
      return ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>loading</i>"),
            children: () => ssrHtml(`<b>${esc(user())}</b>`),
          }),
        )}</main>`,
      );
    };

    const out = await renderPage(page as never);

    expect(out.html).toBe("<main><b>Ada</b></main>");
    expect(out.html).not.toContain("loading");
    // Once, not twice: the second pass must not re-run the fetcher. A loader
    // that hits a database or charges for a call cannot be run per render pass.
    expect(calls).toBe(1);
    // And the value still reaches the client.
    expect(out.data["r:/users/$id|{id:7}"]).toBe("Ada");
  });

  test("generateHydrationScript escapes script-breaking content", async () => {
    const evil = computed(async () => "</script><script>alert(1)</script>", { key: "evil" });

    await renderToStringAsync(() =>
      element(null, "div", { children: () => evil().length.toString() }),
    );

    const script = generateHydrationScript();
    expect(script.startsWith("<script>window.__BARQ_DATA__=")).toBe(true);
    expect(script).not.toContain("</script><script>");
    expect(script.match(/<\/script>/g)?.length).toBe(1); // only the closing tag of the wrapper
  });
});

/**
 * The value channel. `JSON.stringify` carried none of this: a Date arrived as a
 * string, a Map as `{}`, a cycle threw.
 */
describe("the seed encoder", () => {
  test("carries Date, Map, Set, BigInt and cycles", async () => {
    const cyclic: Record<string, unknown> = { when: new Date(0), tags: new Set(["a"]) };
    cyclic.self = cyclic;
    const rich = computed(async () => cyclic, { key: "rich" });

    await renderToStringAsync(() =>
      element(null, "div", { children: () => (rich() as { tags: Set<unknown> }).tags.size }),
    );

    const back = (0, eval)(encodeSeed(getRenderData())) as Record<string, { self: unknown }>;
    const value = back.rich as unknown as typeof cyclic;
    expect(value.when).toBeInstanceOf(Date);
    expect((value.when as Date).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(value.tags).toBeInstanceOf(Set);
    expect(value.self).toBe(value);
  });

  /**
   * `Feature.ErrorPrototypeStack` suppresses the prototype `stack` and not the
   * OWN properties Bun puts on an Error — `sourceURL` among them, holding an
   * absolute server path. The redaction plugin is what keeps it off the wire.
   */
  test("redacts an Error to its name and message, with no server path", () => {
    const payload = encodeSeed({ e: new Error("db connection failed") });
    expect(payload).toContain("db connection failed");
    expect(payload).not.toContain("sourceURL");
    expect(payload).not.toContain(import.meta.dir);

    const back = (0, eval)(payload) as { e: Error };
    expect(back.e.message).toBe("db connection failed");
    expect(Object.keys(back.e)).toEqual(["name"]);
  });

  /**
   * seroval escapes `<` inside strings but writes a RegExp as a LITERAL whose
   * source goes out unescaped, so `/[</script>]/` closes the script element.
   * It cannot be repaired downstream — the payload's own helpers use `<` as an
   * operator — so the type is refused, and refused before any output exists.
   */
  test("refuses a RegExp rather than emitting an unescaped literal", () => {
    expect(() => encodeSeed({ r: new RegExp("[</script>]") })).toThrow();
  });

  /**
   * A streamed page emits at least three inline scripts — the swap snippet, one
   * swap per resumed boundary, and the seed. One of them without the nonce
   * forces `script-src 'unsafe-inline'` on the whole document, which is the
   * directive the nonce exists to avoid, so the assertion is over ALL of them.
   */
  test("every inline script a streamed render emits carries the nonce", async () => {
    const late = computed(async () => {
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

    const html = (await collect(renderToStream(page as never, { nonce: "r4nd0m" }))).join("");
    const opens = html.match(/<script[^>]*>/g) ?? [];
    expect(opens.length).toBeGreaterThanOrEqual(2);
    for (const tag of opens) expect(tag).toContain('nonce="r4nd0m"');
  });

  /**
   * A streamed page seeded NOTHING before this: `renderToStream` never called
   * `getHydrationData`, so every value the server had just awaited was refetched
   * by the client. `renderPage`'s answer — render the whole page a second time —
   * has no equivalent here, because the shell is already on the wire.
   */
  test("a streamed page seeds the values it resolved, and seeds each one once", async () => {
    const late = computed(
      async () => {
        await tick();
        return "Ada";
      },
      { key: "streamed-user" },
    );
    const page = (): unknown =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>loading</i>"),
            children: () => ssrHtml(`<b>${esc(late())}</b>`),
          }),
        )}</main>`,
      );

    const html = (await collect(renderToStream(page as never))).join("");
    expect(html).toContain("__BARQ_DATA__");
    expect(html).toContain("streamed-user");

    // A key still in flight is named TWICE now, and the second mention is what
    // makes hydration cheap rather than what makes it expensive: the first
    // payload puts a promise in the store so a read during the stream can await
    // it, and the last one settles the value over that promise so a client
    // hydrating after the stream — every client today, the entry being a
    // deferred module — finds a plain value and never flashes a fallback.
    //
    // What must NOT happen is the VALUE travelling twice. It does not: one
    // `refs` map spans every flush, so the settle-over emits `$R[n]` for an
    // object and only a primitive is ever written out again.
    const payloads = [
      // Up to the `);` that closes the assignment, not to `</script>`: the
      // seed script now runs `SEED_SETTLE_GUARD` after it, so the two are no
      // longer adjacent. `[\s\S]*?` is lazy, so this still stops at the first
      // close rather than running into the guard.
      ...html.matchAll(
        /Object\.assign\(window\.__BARQ_DATA__\|\|\{\},([\s\S]*?)\);for\(var _k in/g,
      ),
    ]
      .map((m) => m[1] ?? "")
      .filter((payload) => payload.includes("streamed-user"));
    expect(payloads).toHaveLength(2);
    // The settle-over carries no second copy of the fetcher's own work.
    expect(payloads[1]).not.toContain("Promise");

    // And the store rebuilds to the value the server resolved, run the way a
    // browser runs it: every seed script, in document order. SYNCHRONOUS,
    // because the last script replaced the promise with the value.
    expect(runSeedScripts(html)["streamed-user"]).toBe("Ada");
  });

  /**
   * A streamed page seeds more than once, and `serialize` per flush would make
   * each self-contained — correct within a flush and wrong across them. An
   * object reachable from two keys settled in different rounds would arrive as
   * two objects, so `a === b` on the server would be `a !== b` on the client.
   */
  test("one object seeded across two rounds is one object on the client", async () => {
    const shared = { id: 7 };
    const fast = computed(
      async () => {
        await tick();
        return { via: "fast", shared };
      },
      { key: "k-fast" },
    );
    let releaseSlow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const slow = computed(
      async () => {
        await gate;
        return { via: "slow", shared };
      },
      { key: "k-slow" },
    );

    const defer = (value: () => unknown): string =>
      esc(
        ssrLoading(null, {
          fallback: () => ssrHtml("<i>…</i>"),
          children: () => ssrHtml(`<b>${esc((value() as { via: string }).via)}</b>`),
        }),
      );
    const page = (): unknown => ssrHtml(`<main>${defer(fast)}${defer(slow)}</main>`);

    const reader = renderToStream(page as never).getReader();
    const decoder = new TextDecoder();
    let html = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
      // Release only once the fast value is on the wire, so the two values are
      // guaranteed to be seeded in different rounds.
      if (html.includes("k-fast")) releaseSlow();
    }

    // Both keys are promises: each was written when its flight started. Sharing
    // is asserted on the RESOLVED values, which is where identity has to hold —
    // one `refs` map across every flush is what preserves it.
    const store = runSeedScripts(html) as Record<string, Promise<{ shared: unknown }>>;
    const fastSeed = await store["k-fast"];
    const slowSeed = await store["k-slow"];
    expect(fastSeed?.shared).toBeDefined();
    expect(fastSeed?.shared).toBe(slowSeed?.shared);
  });

  /**
   * The gap this closes: a streamed page used to seed nothing, and once it did,
   * a client read that ran before its value arrived still refetched — so the
   * server's answer landed with nobody waiting on it.
   *
   * SOLID'S SHAPE, which replaced a waiter channel: the key goes on the wire the
   * moment its flight STARTS, as a promise, so a read that misses finds
   * something to await rather than a hole. `registerFragment` does
   * `serializer.write(key, p)` with `p` still pending, and the consumer awaits
   * whatever the store hands back.
   */
  test("a key still in flight is on the wire as a PROMISE, before it settles", async () => {
    let releaseSlow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const slow = computed(
      async () => {
        await gate;
        return "arrived";
      },
      { key: "late-key" },
    );
    const page = (): unknown =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>…</i>"),
            children: () => ssrHtml(`<b>${esc(slow())}</b>`),
          }),
        )}</main>`,
      );

    const reader = renderToStream(page as never).getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("__BARQ_DATA__")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value);
    }
    // The key is already named on the wire, and its VALUE is not — which is the
    // whole point: a read can await it instead of refetching.
    expect(html, "the key must be seeded before it settles").toContain("late-key");
    expect(html, "the value must not have landed yet").not.toContain("arrived");
    // …and no waiter registry is involved any more.
    expect(html).not.toContain("__BARQ_SEED__");

    releaseSlow();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
    }
    await tick();

    // The resolution arrives in a later statement, settling the promise the
    // initial payload already put in the store.
    expect(html).toContain("arrived");
  });

  test("escapes a script-closing string and the line separators", () => {
    const payload = encodeSeed({ s: "</script><script>alert(1)</script>", u: "a b" });
    expect(payload).not.toContain("</script>");
    expect(payload).not.toContain(" ");
  });
});

describe("hydrate", () => {
  test("seeded async values resolve synchronously: no refetch, no fallback flash", async () => {
    // --- server ---
    let fetches = 0;
    const makeApp = () => {
      const user = computed(
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

  /**
   * A `Loading` boundary that SETTLED on the server has to be claimed, not
   * rebuilt.
   *
   * This is the shape `@barqjs/router` renders every route depth in, and until
   * this test existed nothing in the repo rendered through the string backend
   * and then hydrated the result. Measured before the fix: `claimed: 0`,
   * `recovered: true`, and `"1 server node(s) at a boundary that parks"` —
   * `loadingBoundary` released the claim `boundary` had just taken and rebuilt
   * into a detached fragment, so every route depth of every SSR'd page threw the
   * server's markup away.
   *
   * The assertion is on `hydrate.report`, not on `textContent`: a cold rebuild
   * produces the same text, which is why the two tests below pass without
   * claiming anything.
   */
  test("a settled Loading boundary is CLAIMED, not rebuilt", async () => {
    let fetches = 0;
    const makeApp = (ssr: boolean) => {
      const user = computed(
        async () => {
          fetches++;
          await tick();
          return "Ada";
        },
        { key: "who" },
      );
      // `template()` on the client, which is what the compiler emits and what
      // CLAIMS. `element()` builds a fresh node by construction, so a test
      // written with it can never observe hydration at all.
      const bold = template("<b>x</b>");
      const italic = template("<i>loading</i>");
      const content = () => {
        if (!ssr) {
          const node = bold() as HTMLElement;
          node.textContent = user();
          return node;
        }
        return ssrHtml(`<b>${esc(user())}</b>`);
      };
      const fallback = () => (ssr ? ssrHtml("<i>loading</i>") : italic());
      return ssr
        ? () => ssrBoundary(null, null, null, "loading", fallback, content, HYDRATE)
        : () => boundary(null, null, null, "loading", fallback, content, HYDRATE);
    };

    const serverHtml = await renderToStringAsync(makeApp(true));
    expect(serverHtml).toContain("<b>Ada</b>");
    expect(serverHtml).toContain("<!--[-->");
    const data = getRenderData();

    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = serverHtml;
    const served = container.querySelector("b");

    hydrate(makeApp(false) as never, container, { data });
    flush();

    expect(hydrate.report.recovered).toBe(false);
    expect(hydrate.report.mismatches).toEqual([]);
    expect(hydrate.report.claimed).toBeGreaterThan(0);
    // The very node the server wrote, still in the document — which is what
    // claiming buys over a rebuild that produces identical markup.
    expect(container.querySelector("b")).toBe(served);
    expect(container.textContent).toBe("Ada");
    await tick();
    flush();
    expect(fetches).toBe(1);
  });

  test("hydrated app is interactive (delegated events)", async () => {
    const makeApp = () => {
      const count = signal(0);
      return () =>
        element(null, "button", {
          onClick: () => count.update((n) => n + 1),
          children: () => `clicks: ${count()}`,
        });
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
      const data = computed(
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

  test("a value resolved outside any render is not seeded into one", async () => {
    // A promise is attributed at its first READ — `activeAsyncSession` at the
    // moment it enters `inFlight` — so anything first read outside a render
    // lands in the unattributed bucket. That bucket used to be merged into
    // every session's data and was cleared by nothing, so one such value was
    // served to every user for the life of the process. A prefetch that warms a
    // loader before the render is exactly this shape.
    const leaked = computed(async () => "RENDER-A-SECRET-user7", { key: "acct" });

    // First read with no session: unattributed.
    setAsyncSession(null);
    try {
      leaked();
    } catch {
      // NotReady on the first read is the point; the promise is now in flight.
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Self-check before the assertion that matters: the value really was
    // recorded, and unattributed. Without this the test would also pass if the
    // fetcher had simply never run, which proves nothing.
    expect(
      getHydrationData().acct,
      "the probe did not record anything, so it cannot show a leak",
    ).toBe("RENDER-A-SECRET-user7");

    // An unrelated later render, for a different user.
    const mine = computed(async () => "B-own-user9", { key: "home" });
    const out = await renderPage(() =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>...</i>"),
            children: () => ssrHtml(`<b>${esc(mine())}</b>`),
          }),
        )}</main>`,
      ),
    );

    expect(out.data.home).toBe("B-own-user9");
    expect(out.data.acct, "another render's value reached this seed").toBeUndefined();
  });
});

describe("settle", () => {
  test("waits through async waterfalls (session-scoped)", async () => {
    const seen: number[] = [];
    const session = Symbol("test-session");

    const prev = setAsyncSession(session);
    try {
      scope(() => {
        const first = computed(async () => {
          await tick();
          return 1;
        });
        const second = computed(async () => {
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
 * Streaming: an unready boundary flushes `<!--[b:7-->fallback<!--]-->` plus a
 * continuation record `(Block, Scope)`, and when its promises settle the server
 * flushes a `<template>` and a swap. The Block is re-invocable with its scope,
 * so there is no second code path.
 *
 * The tests below are about that and nothing else: the shell
 * really is flushed before the boundary resolves (which is the only reason to
 * stream at all), the range comment carries the continuation's address, and the
 * SECOND invocation is the same Block under the same scope.
 */
describe("renderToStream", () => {
  test("the shell is flushed before the boundary resolves, and the content follows", async () => {
    const late = computed(async () => {
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
    // The range instruction, naming the continuation.
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
    // EVERY shipped snippet, not just the first: the page now carries the seed
    // channel too, and one `<` in any of them ends the script element early.
    const snippets = [...parts.join("").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1] ?? "",
    );
    expect(snippets.some((s) => s.includes("__BARQ_SWAP__="))).toBe(true);
    for (const snippet of snippets) {
      expect(snippet, "a shipped snippet grew a `<`").not.toContain("<");
    }
  });

  test("the swap replaces exactly the deferred range", async () => {
    const late = computed(async () => {
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

  /**
   * A boundary is flushed when ITS promises settle, not when the session's
   * slowest one does. The barrier this replaced awaited every in-flight promise
   * before emitting any parked boundary, which made a stream into a shell
   * followed by everything at once: measured at 281 ms of delay on a 20 ms
   * boundary sharing a session with a 300 ms one.
   *
   * The gate makes the claim without a clock. `slow` cannot settle until the
   * fast template has been observed, so under a batch barrier the stream never
   * produces that template and this test hangs rather than failing an
   * inequality — a timeout here is the regression, not flake.
   */
  test("a fast boundary is not held by a slow sibling", async () => {
    let releaseSlow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const fast = computed(async () => {
      await tick();
      return "fast";
    });
    const slow = computed(async () => {
      await gate;
      return "slow";
    });

    const defer = (value: () => unknown): string =>
      esc(
        ssrLoading(null, {
          fallback: () => ssrHtml("<i>…</i>"),
          children: () => ssrHtml(`<b>${esc(value())}</b>`),
        }),
      );
    const page = (): unknown => ssrHtml(`<main>${defer(fast)}${defer(slow)}</main>`);

    const reader = renderToStream(page as never).getReader();
    const decoder = new TextDecoder();
    let sawFast = false;
    let sawSlow = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      if (chunk.includes("<b>fast</b>")) {
        expect(sawSlow, "the slow boundary was flushed before the fast one").toBe(false);
        sawFast = true;
        releaseSlow();
      }
      if (chunk.includes("<b>slow</b>")) sawSlow = true;
    }
    expect(sawFast).toBe(true);
    expect(sawSlow).toBe(true);
  });

  /**
   * The first round attempts every parked boundary before anything has settled,
   * so every one of them is unready and goes back on the queue. That requeue is
   * load-bearing: the code this replaced set `markup = ""` on `NotReadyError`
   * and `continue`d, which under per-settle stepping drops a boundary to its
   * fallback for good.
   */
  test("a boundary unready on its first resume attempt is retried, not dropped", async () => {
    let fetches = 0;
    const late = computed(async () => {
      fetches++;
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

    const html = (await collect(renderToStream(page as never))).join("");
    expect(html).toContain("<b>Ada</b>");
    // Re-invoking the content Block reads the keyed value the session already
    // recorded, so a retried round costs no second fetch.
    expect(fetches).toBe(1);
  });

  /**
   * A promise nobody settles used to hold the render open for good: the loop
   * awaited it, and neither the queue nor any single await was bounded. Both
   * exits below are the same race — what differs is who resolves it.
   */
  describe("bounded", () => {
    const neverSettles = (): unknown =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>loading</i>"),
            children: () =>
              ssrHtml(`<b>${esc(computed(() => new Promise<string>(() => {}))())}</b>`),
          }),
        )}</main>`,
      );

    test("the caller's signal ends a render whose boundary never settles", async () => {
      const controller = new AbortController();
      const stream = renderToStream(neverSettles as never, { signal: controller.signal });
      const reader = stream.getReader();

      const shell = await reader.read();
      expect(new TextDecoder().decode(shell.value)).toContain("<i>loading</i>");
      controller.abort();

      // Drains rather than hanging: the abort resolves the race the loop is
      // parked on, so the stream terminates with the fallback standing.
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    });

    test("a boundary past its timeout is abandoned to its fallback", async () => {
      const html = (await collect(renderToStream(neverSettles as never, { timeout: 20 }))).join("");
      expect(html).toContain("<i>loading</i>");
      expect(html).not.toContain("<template");
    });

    test("cancelling the consumer stops the render", async () => {
      const reader = renderToStream(neverSettles as never, { timeout: 50 }).getReader();
      await reader.read();
      // The throw this would produce if `start` closed an already-cancelled
      // controller is the regression; `cancel` resolving is the assertion.
      await reader.cancel();
    });
  });

  test("a page with nothing to defer streams the shell, the capture, and no swap machinery", async () => {
    const parts = await collect(renderToStream(() => ssrHtml("<p>flat</p>")));
    expect(parts[0]).toBe("<p>flat</p>");
    // The capture goes out even with nothing deferred: a user can click before
    // the bundle arrives on any page, deferred or not.
    expect(parts[1]).toContain("__BARQ_EVTS__");
    expect(parts).toHaveLength(2);
    const html = parts.join("");
    expect(html).not.toContain("<template");
    expect(html).not.toContain("__BARQ_SWAP__");
    expect(html).not.toContain("__BARQ_SEED__");
  });
});

describe("a Loading fallback that is itself not ready", () => {
  /**
   * `@barqjs/router`'s generated route table emits
   * `pending: lazy(() => import(...), (m) => m.Pending ?? Empty)` for EVERY
   * route, so a route whose loader parks on the first render activates a
   * fallback whose chunk has not arrived yet. That activation used to sit
   * outside `loadingBoundary`'s try/catch, so the `NotReadyError` escaped
   * `renderPage` and `renderToStream` alike and the request produced NOTHING —
   * measured, in both modes.
   *
   * The cells are created with no owner, which is how the router creates loader
   * cells and is not incidental: a cell created inside the boundary's content
   * closure dies with that scope when the boundary parks on a string render.
   */
  const build = (label: string): { page: () => unknown } => {
    const data = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return "content";
        },
        { key: `${label}:content` },
      ),
    );
    const skeleton = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return "skeleton";
        },
        { key: `${label}:fallback` },
      ),
    );
    return {
      page: () =>
        ssrLoading(null, {
          fallback: () => ssrHtml(`<i>${esc(skeleton())}</i>`),
          children: () => ssrHtml(`<b>${esc(data())}</b>`),
        }),
    };
  };

  test("renderPage answers with the content instead of throwing", async () => {
    const out = await renderPage(build("rp").page as never);
    expect(out.html).toBe("<b>content</b>");
  });

  test("renderToStream emits a shell instead of producing nothing", async () => {
    const parts = await collect(renderToStream(build("rs").page as never));
    expect(parts.join("")).toContain("<b>content</b>");
  });
});

/**
 * Deferred data: a value that is still a PROMISE when its key is seeded.
 *
 * A loader returning `{ rows, total: countRows() }` is exactly this shape, and
 * it used to kill the request: `crossSerialize` and `serialize` both refuse a
 * promise constructor, so the response died with a `SerovalUnsupportedNodeError`
 * stack and no mention of what caused it.
 */
describe("a pending promise inside a seeded value", () => {
  const late = <T>(value: T, ms = 5): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

  test("renderPage AWAITS it, because it has no later chunk to put it in", async () => {
    const cell = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return { now: "here", later: late("arrived") };
        },
        { key: "d:page" },
      ),
    );
    const out = await renderPage(() =>
      ssrLoading(null, {
        fallback: () => ssrHtml("<i>l</i>"),
        children: () => ssrHtml(`<b>${esc((cell() as { now: string }).now)}</b>`),
      }),
    );
    expect(out.html).toBe("<b>here</b>");
    // Resolved, not a promise: the seed carries the value.
    expect(out.script).toContain("arrived");
  });

  test("a cyclic value still round-trips, because the walk copies nothing it need not", async () => {
    // The first version of the resolver rebuilt every object and turned a cycle
    // into an eight-deep tree.
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    const cell = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return cyclic;
        },
        { key: "d:cycle" },
      ),
    );
    const out = await renderPage(() =>
      ssrLoading(null, {
        fallback: () => ssrHtml("<i>l</i>"),
        children: () => ssrHtml(`<b>${esc((cell() as { name: string }).name)}</b>`),
      }),
    );
    expect(out.data["d:cycle"]).toBe(cyclic);
    expect((out.data["d:cycle"] as { self: unknown }).self).toBe(cyclic);
  });

  /**
   * A deferred value that REJECTS, which the buffered arm used to die on.
   *
   * `settleNested` awaited it and let the rejection out, so it left
   * `renderPage`, left the page handler, and the request got no response at all
   * for a page that had already rendered. The streamed arm has always carried
   * it, and `isbot` routes a crawler to the buffered one — so a browser was
   * served the page and a crawler took the request down.
   */
  test("renderPage PLACES a rejection rather than dying on it", async () => {
    const cell = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return {
            now: "here",
            later: new Promise((_resolve, reject) =>
              setTimeout(() => reject(new Error("the slow part failed")), 5),
            ),
          };
        },
        { key: "d:reject" },
      ),
    );
    const out = await renderPage(() =>
      ssrLoading(null, {
        fallback: () => ssrHtml("<i>l</i>"),
        children: () => ssrHtml(`<b>${esc((cell() as { now: string }).now)}</b>`),
      }),
    );
    expect(out.html).toBe("<b>here</b>");
    // A REJECTED PROMISE on the client, which is what the streamed arm sends —
    // the server's own boundary has already rendered the error, so a settled
    // value here would hydrate different markup.
    expect(out.script).toContain("the slow part failed");
    expect(out.script).toContain("resolver.f");
    // Nothing of the server's filesystem rides along with it.
    expect(out.script).not.toContain("sourceURL");
    // And nothing reports it unhandled after the render is over.
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  test("renderToStream DEFERS it and resolves it in a later chunk", async () => {
    const cell = runWithOwner(null, () =>
      computed(
        async () => {
          await tick();
          return { now: "here", later: late("arrived", 15) };
        },
        { key: "d:stream" },
      ),
    );
    const parts = await collect(
      renderToStream(() =>
        ssrLoading(null, {
          fallback: () => ssrHtml("<i>l</i>"),
          children: () => ssrHtml(`<b>${esc((cell() as { now: string }).now)}</b>`),
        }),
      ),
    );
    const whole = parts.join("");
    expect(whole).toContain("<b>here</b>");
    // The deferred half arrives, and it arrives AFTER the markup that did not
    // need it — which is the entire point of deferring.
    expect(whole).toContain("arrived");
    expect(whole.indexOf("arrived")).toBeGreaterThan(whole.indexOf("<b>here</b>"));
  });
});

/**
 * The stream's ERROR POLICY and its lifecycle.
 *
 * A throw after the shell used to reject the whole `ReadableStream`, which hands
 * the client a truncated document with no error UI when the bytes it already has
 * are a valid page showing fallbacks. React never errors the response after the
 * shell — it errors the BOUNDARY — and these rows pin that barq does not either.
 */
describe("a throw after the shell", () => {
  const pageThatThrowsLate = (): (() => SsrHtml) => {
    const bad = computed(async () => {
      await tick();
      throw new Error("late boom");
    });
    return () =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>skel</i>"),
            children: () => ssrHtml(`<b>${esc(bad())}</b>`),
          }),
        )}</main>`,
      );
  };

  test("does NOT tear the response: the stream completes and the fallback stands", async () => {
    const seen: unknown[] = [];
    const parts = await collect(
      renderToStream(pageThatThrowsLate(), {
        timeout: 100,
        onError: (error) => seen.push(error),
      }),
    );
    // Reading to completion is the assertion: before the policy existed this
    // rejected with `Error: late boom` and produced no page at all.
    const html = parts.join("");
    expect(html).toContain("<main>");
    expect(html).toContain("skel");
    // The failure is REPORTED rather than swallowed.
    expect(seen.map(String)).toEqual(["Error: late boom"]);
  });

  test("onError defaults to console.error rather than silence", async () => {
    const original = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => logged.push(args[0]);
    try {
      await collect(renderToStream(pageThatThrowsLate(), { timeout: 100 }));
    } finally {
      console.error = original;
    }
    expect(logged.map(String)).toEqual(["Error: late boom"]);
  });
});

describe("the stream's lifecycle", () => {
  test("onShellReady fires before onAllReady, and both fire once", async () => {
    const order: string[] = [];
    const late = computed(async () => {
      await tick();
      return "LATE";
    });
    const page = (): unknown =>
      ssrHtml(
        `<main>${esc(
          ssrLoading(null, {
            fallback: () => ssrHtml("<i>skel</i>"),
            children: () => ssrHtml(`<b>${esc(late())}</b>`),
          }),
        )}</main>`,
      );

    const html = (
      await collect(
        renderToStream(page as never, {
          onShellReady: () => order.push("shell"),
          onAllReady: () => order.push("all"),
        }),
      )
    ).join("");

    expect(order).toEqual(["shell", "all"]);
    // …and `onAllReady` really means it: the deferred content is on the wire.
    expect(html).toContain("LATE");
  });
});

/**
 * The CLIENT half of the eager seed, which is the capability the whole change
 * exists for: a read that runs while its value is still in flight must WAIT on
 * what the server sent rather than fetch the same thing again.
 *
 * Solid's shape — `sharedConfig.load(key)` hands back a promise and Suspense
 * awaits it (`solid/src/render/Suspense.ts:144-167`). barq needs no boundary
 * hook for it: a `compute` that returns a promise is already an async node, so
 * handing the seeded promise back IS the wait.
 */
describe("a seeded key that is still in flight", () => {
  const store = (data: Record<string, unknown> | undefined): void => {
    const target = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
    if (data === undefined) delete target.__BARQ_DATA__;
    else target.__BARQ_DATA__ = data;
  };

  test("the read AWAITS the server's promise instead of refetching", async () => {
    let fetches = 0;
    let deliver!: (value: string) => void;
    store({ "in-flight": new Promise<string>((resolve) => (deliver = resolve)) });

    const value = computed(
      async () => {
        fetches++;
        return "refetched";
      },
      { key: "in-flight" },
    );

    // Starts the node. It is pending on the SEED, not on a fetch.
    try {
      value();
    } catch {
      /* NotReadyError: the value has not arrived */
    }
    deliver("from-the-server");
    await settle();

    expect(value()).toBe("from-the-server");
    expect(fetches, "the fetcher must never run for a key the server sent").toBe(0);
    store(undefined);
  });

  test("a key the server ABANDONED falls back to fetching", async () => {
    let fetches = 0;
    // What the end of the stream does to every key still in flight, so nothing
    // waits for a value that is not coming. RESOLVED with a sentinel rather than
    // rejected: nobody is awaiting this promise until a read wants the key, and
    // an unhandled rejection is a console error in the browser and a process
    // kill on Node.
    store({ gone: Promise.resolve({ [SEED_ABANDONED]: 1 }) });

    const value = computed(
      async () => {
        fetches++;
        return "refetched";
      },
      { key: "gone" },
    );

    try {
      value();
    } catch {
      /* pending */
    }
    await settle();

    expect(value()).toBe("refetched");
    expect(fetches, "abandoned is absent, not failed: it fetches").toBe(1);
    store(undefined);
  });
});
