/**
 * The server half of the SSR suite: one render, in a process with no DOM.
 *
 * `bun run ssr-server.ts <module> <mode> [argument]`, answered on stdout as
 * JSON after a marker, so anything a fixture logs on the way does not corrupt
 * the result.
 */

import { renderPage, renderToStream } from "@barqjs/server";
import { QueryClient, dehydrate } from "./index.ts";
import { RESULT } from "./ssr-harness.ts";

interface Fixture {
  counts: { fetches: number };
  page: (client: QueryClient, who?: string) => () => unknown;
  /** Run against the client before the render, as a loader would. */
  before?: (client: QueryClient) => Promise<unknown>;
  /** A route tree, for the fixtures that render through the router's page handler. */
  routes?: readonly unknown[];
  /** Every client the route tree's context made, one for each request. */
  clients?: QueryClient[];
  /** Builds the router for one request, for the fixtures that set up the integration. */
  getRouter?: () => unknown;
}

const [modulePath = "", mode = "", argument = ""] = process.argv.slice(2);
const fixture = (await import(modulePath)) as Fixture;

const hashes = (client: QueryClient): string[] =>
  client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryHash)
    .toSorted();

async function buffered(who?: string) {
  const client = new QueryClient();
  await fixture.before?.(client);
  const page = await renderPage(fixture.page(client, who) as never);
  return {
    html: page.html,
    script: page.script,
    cached: hashes(client),
    data: dehydrate(client).queries.map((query) => query.state.data),
  };
}

async function streamed() {
  const client = new QueryClient();
  await fixture.before?.(client);
  const stream = renderToStream(fixture.page(client) as never, { timeout: 2000 }).readable;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return { chunks, cached: hashes(client) };
}

async function handled(paths: readonly string[], stream: boolean) {
  const { createPageHandler, renderRoutes } = await import("@barqjs/router/server");
  const handler = createPageHandler({
    routeTree: fixture.routes as never,
    getRouter: fixture.getRouter as never,
    stream,
    bufferForCrawlers: false,
    app: (state) => renderRoutes(state),
    document: (parts) => `[APP[${parts.body}]APP]${parts.seed}`,
  });
  const pages = await Promise.all(
    paths.map(async (path) => {
      const response = await handler(new Request(`https://example.com${path}`));
      const chunks: string[] = [];
      const decoder = new TextDecoder();
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value));
      }
      return { status: response.status, html: chunks.join(""), chunks };
    }),
  );
  return {
    pages,
    clients: (fixture.clients ?? []).map((client) => hashes(client)),
  };
}

let result: unknown;
if (mode === "buffered") result = await buffered();
else if (mode === "streamed") result = await streamed();
else if (mode === "concurrent") {
  result = await Promise.all(argument.split(",").map((who) => buffered(who)));
} else if (mode === "handler") result = await handled(argument.split(","), false);
else if (mode === "handler-streamed") result = await handled(argument.split(","), true);
else throw new Error(`unknown mode ${JSON.stringify(mode)}`);

process.stdout.write(RESULT + JSON.stringify({ result, fetches: fixture.counts.fetches }));
process.exit(0);
