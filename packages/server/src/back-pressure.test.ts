/**
 * A stream whose reader is slow holds the render instead of queueing the page
 * for it. Each boundary's build is counted, so "the render went on without a
 * reader" is a number rather than a guess about memory.
 */

import { HYDRATE, createMemo, onCleanup } from "@barqjs/core";
import { expect, test } from "bun:test";

import { renderToStream } from "./server.ts";
import { type SsrHtml, boundary, esc, html } from "./ssr.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const BOUNDARIES = 5;

function page(counts: { builds: number; disposed: boolean }): () => SsrHtml {
  return () => {
    onCleanup(() => {
      counts.disposed = true;
    });
    let out = "";
    for (let i = 0; i < BOUNDARIES; i++) {
      const value = createMemo(async () => {
        await tick();
        return `V${i}`;
      });
      out += esc(
        boundary(
          null,
          null,
          "loading",
          () => html("<i>skel</i>"),
          () => {
            counts.builds++;
            return html(`<b>${esc(value())}</b>`);
          },
          HYDRATE,
        ),
      );
    }
    return html(`<main>${out}</main>`);
  };
}

async function rest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value);
  }
}

test("a reader that stops reading stops the render", async () => {
  const counts = { builds: 0, disposed: false };
  const reader = renderToStream(page(counts)).readable.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toStartWith("<main>");

  // Every value has arrived by now. The shell built each boundary once; a
  // render that ran on without a reader would have built each one again.
  await pause(30);
  expect(counts.builds).toBe(BOUNDARIES);

  const tail = await rest(reader);
  for (let i = 0; i < BOUNDARIES; i++) expect(tail).toContain(`<b>V${i}</b>`);
  expect(counts.builds).toBe(BOUNDARIES * 2);
});

test("an abort while the render waits for its reader releases the render", async () => {
  const counts = { builds: 0, disposed: false };
  const abort = new AbortController();
  const reader = renderToStream(page(counts), { signal: abort.signal }).readable.getReader();
  await reader.read();
  await pause(30);
  expect(counts.disposed).toBe(false);

  abort.abort();
  await pause(10);
  // Released without another read: a paused render does not wait for a reader
  // that may never come back.
  expect(counts.disposed).toBe(true);
  expect(counts.builds).toBe(BOUNDARIES);

  // What was already owed still reaches the reader, and the stream ends.
  const tail = await rest(reader);
  expect(tail).not.toContain("<template");
});

test("a read that lands while the render waits for its reader still resumes its boundary", async () => {
  const twoReads = (): SsrHtml => {
    const first = createMemo(async () => "A");
    const content = (): SsrHtml => {
      const a = first();
      // Declared only once the first has arrived, so the boundary parks twice
      // and the second flight starts on a resume.
      const second = createMemo(async () => `${a}B`);
      return html(`<b>${esc(second())}</b>`);
    };
    return html(
      `<main>${esc(boundary(null, null, "loading", () => html("<i>skel</i>"), content, HYDRATE))}</main>`,
    );
  };

  const out = await rest(renderToStream(twoReads).readable.getReader());
  expect(out).toContain("<b>AB</b>");
});
