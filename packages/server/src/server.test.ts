// oxlint-disable no-eval -- the seed payload IS a program: seroval's JS mode
// emits the expression that rebuilds the value, and running it is how a browser
// consumes it. Asserting on the string instead would test the encoder against
// itself rather than against an evaluator.

/**
 * SSR round-trip: renderToString / renderToStringAsync, hydration data
 * serialization, client hydrate() seeding (no refetch), settle().
 */

import {
  Loading,
  NotReadyError,
  computed,
  effect,
  element,
  flush,
  hydrate,
  scope,
  settle,
  signal,
} from "@barqjs/core";
import { seedLater, setAsyncSession } from "@barqjs/core/internal";
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
import { esc, html as ssrHtml, ssrLoading } from "./ssr.ts";
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
    .filter((source) => source.includes("__BARQ_DATA__"));
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

    await renderToStringAsync(() => element(null, "div", { children: () => rich().tags.size }));

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

    // Seeded once, not once per round: a key already on the wire is skipped.
    // Counted over PAYLOADS, because the key also appears in the wake list the
    // flush sends alongside it.
    const payloads = [
      ...html.matchAll(/Object\.assign\(window\.__BARQ_DATA__\|\|\{\},([\s\S]*?)\);window/g),
    ]
      .map((m) => m[1] ?? "")
      .filter((payload) => payload.includes("streamed-user"));
    expect(payloads).toHaveLength(1);

    // And the payload rebuilds to the value the server resolved, run the way a
    // browser runs it: every seed script, in document order.
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

    const data = runSeedScripts(html) as Record<string, { shared: unknown }>;
    expect(data["k-fast"]?.shared).toBeDefined();
    expect(data["k-fast"]?.shared).toBe(data["k-slow"]?.shared);
  });

  /**
   * The gap this closes: a streamed page used to seed nothing, and once it did,
   * a client read that ran before its value arrived still refetched — so the
   * server's answer landed with nobody waiting on it. SvelteKit drops a pending
   * value from its payload for exactly this reason and lets the client fetch it.
   */
  test("a read that misses while the stream is open waits for the value", async () => {
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

    // Each script runs exactly once, the way a browser runs them. Re-running
    // the channel snippet would build a fresh registry and drop the waiter.
    let ran = 0;
    const runNewScripts = (html: string): void => {
      const all = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
      const fresh = all.slice(ran);
      ran = all.length;
      const relevant = fresh.filter(
        (s) => s.includes("__BARQ_SEED__") || s.includes("__BARQ_DATA__"),
      );
      if (relevant.length > 0) (0, eval)(relevant.join(";"));
    };

    const reader = renderToStream(page as never).getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("__BARQ_SEED__")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value);
    }
    // The channel is open and the value is still gated: exactly the window in
    // which a client read would otherwise refetch what the server is sending.
    expect(html, "the value must not have landed yet").not.toContain("arrived");
    runNewScripts(html);

    let resolved: unknown;
    const waiter = seedLater("late-key");
    expect(waiter, "the channel should be open").not.toBeNull();
    void waiter?.then((r) => {
      resolved = r;
    });

    releaseSlow();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
      runNewScripts(html);
    }
    await tick();

    // The waiter was woken by the flush that carried the key — not by a refetch.
    expect(resolved).toEqual({ found: true, value: "arrived" });
    // And the stream closed the channel, so a later miss fetches for real.
    expect(html).toContain("__BARQ_SEED__.done()");
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

  test("a page with nothing to defer streams one chunk and no swap machinery", async () => {
    const parts = await collect(renderToStream((() => ssrHtml("<p>flat</p>")) as never));
    expect(parts).toEqual(["<p>flat</p>"]);
  });
});
