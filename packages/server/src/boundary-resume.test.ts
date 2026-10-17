/**
 * An async memo DECLARED inside a Loading body.
 *
 * `<Loading><User /></Loading>` where `User` owns its fetch is the ordinary way
 * to write a data component. The string backend builds the content again on
 * every resume, so the memo is declared again each time, and it has to be the
 * same declaration: under the same id it finds what the first build asked for,
 * and under any other it would fetch again and the boundary would never be
 * ready.
 */

import { DEV, createMemo } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderPage, renderToStream } from "./server.ts";
import { esc, html, reveal, ssrLoading } from "./ssr.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The delay of every timer of a deadline's length that fired while `run` was
 * pending. Which timer let a render go is a fact about the render; how long it
 * took is a fact about the machine.
 */
async function deadlinesFired<T>(run: () => Promise<T>): Promise<{ value: T; fired: number[] }> {
  const real = globalThis.setTimeout;
  const fired: number[] = [];
  const recording = (handler: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) =>
    real(
      (...passed: unknown[]) => {
        if (ms >= 1000) fired.push(ms);
        handler(...passed);
      },
      ms,
      ...args,
    );
  globalThis.setTimeout = recording as unknown as typeof setTimeout;
  try {
    return { value: await run(), fired };
  } finally {
    globalThis.setTimeout = real;
  }
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

afterEach(() => {
  clearHydrationData();
});

function makePage(): { page: () => unknown; fetches: () => number } {
  let fetches = 0;
  const User = (): unknown => {
    const user = createMemo(async () => {
      fetches++;
      await tick();
      return "salama";
    });
    return html(`<b>${esc(user())}</b>`);
  };
  const page = (): unknown =>
    html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html("<i>loading</i>"),
          children: () => User(),
        }),
      )}</main>`,
    );
  return { page, fetches: () => fetches };
}

test("a stream resumes a boundary whose body declares its own async memo", async () => {
  const { page, fetches } = makePage();

  const out = await collect(renderToStream(page as never, { timeout: 200 }).readable);

  expect(out).toContain("<b>salama</b>");
  expect(fetches()).toBe(1);
});

test("renderPage settles it rather than refetching until the boundary deadline", async () => {
  const { page, fetches } = makePage();

  const { value: out, fired } = await deadlinesFired(() => renderPage(page as never));

  expect(out.html).toBe("<main><b>salama</b></main>");
  expect(fetches()).toBe(1);
  expect(Object.keys(out.data)).toHaveLength(1);
  expect(fired, "the boundary settled, so no deadline let the render go").toEqual([]);
}, 15_000);

test("a boundary inside the body keeps its own declarations apart from the body's", async () => {
  let fetches = 0;
  const fetched = (value: string) => async (): Promise<string> => {
    fetches++;
    await tick();
    return value;
  };
  const Inner = (): unknown => {
    const inner = createMemo(fetched("inner"));
    return html(`<u>${esc(inner())}</u>`);
  };
  const Outer = (): unknown => {
    const outer = createMemo(fetched("outer"));
    const nested = ssrLoading({ fallback: () => html("<i>inner</i>"), children: () => Inner() });
    return html(`<b>${esc(outer())}</b>${esc(nested)}`);
  };
  const page = (): unknown => {
    const after = createMemo(fetched("after"));
    return html(
      `<main>${esc(
        ssrLoading({ fallback: () => html("<i>outer</i>"), children: () => Outer() }),
      )}${esc(
        ssrLoading({
          fallback: () => html("<i>after</i>"),
          children: () => html(`<s>${esc(after())}</s>`),
        }),
      )}</main>`,
    );
  };

  const capture = DEV.diagnostics.capture();
  const out = await renderPage(page as never);
  const codes = capture.stop().map((event) => event.code);

  expect(out.html).toBe("<main><b>outer</b><u>inner</u><s>after</s></main>");
  expect(fetches).toBe(3);
  expect(new Set(Object.values(out.data))).toEqual(new Set(["after", "inner", "outer"]));
  expect(codes).not.toContain("RUN_WITH_DISPOSED_OWNER");
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A boundary that parks inside a body which then reads a value of its own that
 * has not arrived: the body unwinds and takes the inner boundary's range with
 * it, and only the rebuild's copy of that boundary stands on the page.
 */
function nestedUnderUnwind(innerMs: number): {
  page: () => unknown;
  fetches: () => number;
} {
  let fetches = 0;
  const Inner = (): unknown => {
    const inner = createMemo(async () => {
      fetches++;
      await wait(innerMs);
      return "inner";
    });
    return html(`<u>${esc(inner())}</u>`);
  };
  const Outer = (): unknown => {
    const outer = createMemo(async () => {
      fetches++;
      await tick();
      return "outer";
    });
    const nested = ssrLoading({ fallback: () => html("<i>inner</i>"), children: () => Inner() });
    return html(`${esc(nested)}<b>${esc(outer())}</b>`);
  };
  const page = (): unknown =>
    html(
      `<main>${esc(
        ssrLoading({ fallback: () => html("<i>outer</i>"), children: () => Outer() }),
      )}</main>`,
    );
  return { page, fetches: () => fetches };
}

/** Every swap whose `<!--[b:N-->` range had not reached the page before its template did. */
function swapsWithoutRange(out: string): string[] {
  return [...out.matchAll(/<template data-barq="(\d+)">/g)]
    .filter((swap) => !out.slice(0, swap.index).includes(`<!--[b:${swap[1]}-->`))
    .map((swap) => swap[1]);
}

test("a stream resumes a boundary the rebuilt body parked, not the one it unwound", async () => {
  const { page, fetches } = nestedUnderUnwind(15);

  const capture = DEV.diagnostics.capture();
  const out = await collect(renderToStream(page as never, { timeout: 1000 }).readable);
  const codes = capture.stop().map((event) => event.code);

  expect(swapsWithoutRange(out)).toEqual([]);
  expect(out).toContain("<b>outer</b>");
  expect(out).toContain("<u>inner</u>");
  expect(out.match(/<template data-barq=/g)).toHaveLength(2);
  expect(fetches()).toBe(2);
  expect(codes).not.toContain("RUN_WITH_DISPOSED_OWNER");
});

test("a stream inlines the rebuilt inner boundary when its value arrived with the body's", async () => {
  const { page, fetches } = nestedUnderUnwind(0);

  const capture = DEV.diagnostics.capture();
  const out = await collect(renderToStream(page as never, { timeout: 1000 }).readable);
  const codes = capture.stop().map((event) => event.code);

  expect(swapsWithoutRange(out)).toEqual([]);
  expect(out).toContain("<u>inner</u><b>outer</b></template>");
  expect(out.match(/<template data-barq=/g)).toHaveLength(1);
  expect(fetches()).toBe(2);
  expect(codes).not.toContain("RUN_WITH_DISPOSED_OWNER");
});

test("a buffered page settles the rebuilt inner boundary and seeds both values once", async () => {
  const { page, fetches } = nestedUnderUnwind(15);

  const capture = DEV.diagnostics.capture();
  const out = await renderPage(page as never);
  const codes = capture.stop().map((event) => event.code);

  expect(out.html).toBe("<main><u>inner</u><b>outer</b></main>");
  expect(fetches()).toBe(2);
  expect(Object.keys(out.data)).toHaveLength(2);
  expect(new Set(Object.values(out.data))).toEqual(new Set(["inner", "outer"]));
  expect(codes).not.toContain("RUN_WITH_DISPOSED_OWNER");
});

test("a sequential Reveal does not hold a sibling back for a boundary the body unwound", async () => {
  const value = (name: string, ms: number) =>
    createMemo(async () => {
      await wait(ms);
      return name;
    });
  const page = (): unknown =>
    html(
      `<main>${esc(
        reveal("sequential", false, () => {
          const outer = ssrLoading({
            fallback: () => html("<i>outer</i>"),
            children: () => {
              const slow = value("slow", 40);
              const fast = value("fast", 0);
              const nested = ssrLoading({
                fallback: () => html("<i>slow</i>"),
                children: () => html(`<u>${esc(slow())}</u>`),
              });
              return html(`${esc(nested)}<b>${esc(fast())}</b>`);
            },
          });
          const sibling = value("sibling", 0);
          const after = ssrLoading({
            fallback: () => html("<i>sibling</i>"),
            children: () => html(`<s>${esc(sibling())}</s>`),
          });
          return html(`${esc(outer)}${esc(after)}`);
        }),
      )}</main>`,
    );

  const reader = renderToStream(page as never, { timeout: 1000 }).readable.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    parts.push(decoder.decode(next.value));
  }
  const chunkWith = (text: string): number => parts.findIndex((part) => part.includes(text));

  expect(chunkWith("<b>fast</b>")).toBeGreaterThan(0);
  expect(chunkWith("<s>sibling</s>")).toBeGreaterThan(0);
  expect(chunkWith("<b>fast</b>")).toBeLessThan(chunkWith("<u>slow</u>"));
  expect(chunkWith("<s>sibling</s>")).toBeLessThan(chunkWith("<u>slow</u>"));
  expect(swapsWithoutRange(parts.join(""))).toEqual([]);
});
