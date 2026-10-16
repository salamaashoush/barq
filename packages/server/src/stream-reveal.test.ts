import { createMemo } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderToStream } from "./server.ts";
import { esc, html, reveal, ssrLoading } from "./ssr.ts";

afterEach(() => {
  clearHydrationData();
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Two boundaries in a `<Reveal>`, the SECOND of which settles first. */
const page = (order: string) => () =>
  html(
    `<main>${esc(
      reveal(order, false, () =>
        html(
          [
            ["slow", 30],
            ["fast", 1],
          ]
            .map(([name, ms]) => {
              const value = createMemo(async () => {
                await wait(ms as number);
                return name as string;
              });
              return esc(
                ssrLoading({
                  fallback: () => html("<i>wait</i>"),
                  children: () => html(`<b>${esc(value())}</b>`),
                }),
              );
            })
            .join(""),
        ),
      ),
    )}</main>`,
  );

async function chunks(order: string): Promise<string[]> {
  const reader = renderToStream(page(order)).readable.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    out.push(decoder.decode(next.value));
  }
  return out;
}

const chunkWith = (parts: string[], text: string): number =>
  parts.findIndex((part) => part.includes(text));

test("a sequential Reveal swaps a boundary only after the ones before it", async () => {
  const parts = await chunks("sequential");

  expect(chunkWith(parts, "<b>slow</b>")).toBeGreaterThan(-1);
  expect(chunkWith(parts, "<b>fast</b>")).toBeGreaterThanOrEqual(chunkWith(parts, "<b>slow</b>"));
  const whole = parts.join("");
  expect(whole.indexOf("__BARQ_SWAP__(0)")).toBeLessThan(whole.indexOf("__BARQ_SWAP__(1)"));
});

test("a together Reveal swaps its boundaries in one go", async () => {
  const parts = await chunks("together");

  expect(chunkWith(parts, "<b>fast</b>")).toBe(chunkWith(parts, "<b>slow</b>"));
});

test("a natural Reveal swaps each boundary as it settles", async () => {
  const parts = await chunks("natural");

  expect(chunkWith(parts, "<b>fast</b>")).toBeLessThan(chunkWith(parts, "<b>slow</b>"));
});
