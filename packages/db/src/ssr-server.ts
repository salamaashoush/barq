/**
 * The server half of the SSR suite: one render, in a process with no DOM.
 *
 * `bun run ssr-server.ts <module> <mode>`, answered on stdout as JSON after a
 * marker, so anything a fixture logs on the way does not corrupt the result.
 */

import { renderPage, renderToStream } from "@barqjs/server";
import { RESULT } from "./ssr-harness.ts";

interface Fixture {
  counts: { fetches: number };
  page: () => () => unknown;
}

const [modulePath = "", mode = ""] = process.argv.slice(2);
const fixture = (await import(modulePath)) as Fixture;

async function buffered() {
  const page = await renderPage(fixture.page() as never);
  return { html: page.html, script: page.script };
}

async function streamed() {
  const stream = renderToStream(fixture.page() as never, { timeout: 2000 }).readable;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return { chunks };
}

let result: unknown;
if (mode === "buffered") result = await buffered();
else if (mode === "streamed") result = await streamed();
else throw new Error(`unknown mode ${JSON.stringify(mode)}`);

process.stdout.write(RESULT + JSON.stringify({ result, fetches: fixture.counts.fetches }));
process.exit(0);
