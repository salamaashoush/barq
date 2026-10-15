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

import { createMemo } from "@barqjs/core";
import { afterEach, expect, test } from "bun:test";

import { clearRenderData, renderPage, renderToStream } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  clearRenderData();
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

  const out = await collect(renderToStream(page as never, { timeout: 200 }));

  expect(out).toContain("<b>salama</b>");
  expect(fetches()).toBe(1);
});

test("renderPage settles it rather than refetching until the boundary deadline", async () => {
  const { page, fetches } = makePage();

  const started = performance.now();
  const out = await renderPage(page as never);
  const elapsed = performance.now() - started;

  expect(out.html).toBe("<main><b>salama</b></main>");
  expect(fetches()).toBe(1);
  expect(Object.keys(out.data)).toHaveLength(1);
  expect(elapsed).toBeLessThan(1000);
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

  const out = await renderPage(page as never);

  expect(out.html).toBe("<main><b>outer</b><u>inner</u><s>after</s></main>");
  expect(fetches).toBe(3);
  expect(new Set(Object.values(out.data))).toEqual(new Set(["after", "inner", "outer"]));
});
