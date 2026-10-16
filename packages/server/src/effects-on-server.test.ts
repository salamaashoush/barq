/**
 * An effect is where a component reaches outside itself, and a server render
 * has nothing there to reach. `createEffect` and `onSettled` do nothing while
 * a page is being rendered, in every render mode, including the build a
 * parked boundary gets when it resumes.
 */

import { createEffect, createMemo, createSignal, flush, onSettled } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderPage, renderToStream, renderToString } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

afterEach(() => {
  clearHydrationData();
});

function page(ran: string[], body: () => unknown = () => "orders"): string {
  const [count] = createSignal(1);
  createEffect(
    () => count(),
    () => {
      ran.push("effect");
    },
  );
  onSettled(() => {
    ran.push("settled");
  });
  return `<main>${esc(body())}</main>`;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value);
  }
}

test("a buffered render runs none of them", async () => {
  const ran: string[] = [];
  const rendered = await renderPage(() => html(page(ran)));
  flush();
  expect(rendered.html).toContain("<main>orders</main>");
  expect(ran).toEqual([]);
});

test("a synchronous render runs none of them", () => {
  const ran: string[] = [];
  expect(renderToString(() => html(page(ran)))).toContain("<main>orders</main>");
  flush();
  expect(ran).toEqual([]);
});

test("a streamed render runs none of them, in the shell or in a boundary that resumes", async () => {
  const ran: string[] = [];
  const out = await drain(
    renderToStream(() =>
      html(
        page(ran, () =>
          ssrLoading({
            fallback: () => html("<i>wait</i>"),
            children: () => {
              const late = createMemo(async () => {
                await new Promise((resolve) => setTimeout(resolve, 2));
                return "late";
              });
              onSettled(() => {
                ran.push("settled inside");
              });
              return html(`<b>${esc(late())}</b>`);
            },
          }),
        ),
      ),
    ).readable,
  );
  flush();
  expect(out).toContain("<b>late</b>");
  expect(ran).toEqual([]);
});

test("outside a render they run as they always have", () => {
  const ran: string[] = [];
  page(ran);
  flush();
  expect(ran.toSorted()).toEqual(["effect", "settled"]);
});
