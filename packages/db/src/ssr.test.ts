/**
 * Live queries across a server render.
 *
 * The server half is a real one: another process, no DOM, the string backend.
 * The browser half hydrates the compiled DOM module over the bytes that
 * process printed. The collections are module singletons over a shared
 * `QueryClient`, as an application on `createCollection` has them: the server
 * fetches to render, the page carries each query's result, and hydration
 * renders that result while the browser's own collections load, then hands
 * over to them.
 */

import { afterEach, expect, test } from "bun:test";
import { flush, resetChildIds } from "@barqjs/core";
import { hydrate } from "@barqjs/web";

import {
  type Compiled,
  ENTRY,
  assemble,
  compile,
  mount,
  runScripts,
  seeds,
  serve,
  unseeded,
} from "./ssr-harness.ts";
import { settle } from "./test-helpers.ts";

const PAGE = `
import { Loading } from "@barqjs/core"
import { QueryClient } from "@tanstack/query-core"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { BasicIndex, createCollection, eq, useLiveInfiniteQuery, useLiveQuery } from ${JSON.stringify(ENTRY)}

export const counts = { fetches: 0 }
export const api = {
  channels: [
    { id: "general", workspace_id: "acme", name: "general" },
    { id: "random", workspace_id: "acme", name: "random" },
    { id: "other", workspace_id: "example", name: "other" },
  ],
  messages: [1, 2, 3].map((n) => ({ id: "m" + n, created_at: "2026-11-0" + n })),
}
const after = (ms, value) => new Promise((done) => setTimeout(() => done(value), ms))
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

export const channels = createCollection(queryCollectionOptions({
  id: "channels",
  queryKey: ["channels"],
  queryFn: () => { counts.fetches++; return after(5, api.channels.map((row) => ({ ...row }))) },
  queryClient,
  getKey: (row) => row.id,
}))
export const messages = createCollection(queryCollectionOptions({
  id: "messages",
  queryKey: ["messages"],
  autoIndex: "eager",
  defaultIndexType: BasicIndex,
  queryFn: () => { counts.fetches++; return after(30, api.messages.map((row) => ({ ...row }))) },
  queryClient,
  getKey: (row) => row.id,
}))

function Channels() {
  const list = useLiveQuery((q) =>
    q.from({ c: channels }).where(({ c }) => eq(c.workspace_id, "acme")).orderBy(({ c }) => c.name))
  return <b class="channels">{list.data.map((row) => row.name).join(",")}:{list.isReady ? "ready" : "loading"}</b>
}
function One() {
  const one = useLiveQuery((q) => q.from({ c: channels }).where(({ c }) => eq(c.id, "random")).findOne())
  return <s class="one">{one.data ? one.data.name : "none"}</s>
}
function Messages() {
  const list = useLiveInfiniteQuery(
    (q) => q.from({ m: messages }).orderBy(({ m }) => m.created_at, "desc"),
    { pageSize: 2 },
  )
  return <q class="messages">{list.data.map((row) => row.id).join(",")}:{list.hasNextPage ? "more" : "end"}</q>
}

export const page = () => () => (
  <div>
    <Loading fallback={<i>wait-channels</i>}><Channels /></Loading>
    <Loading fallback={<i>wait-one</i>}><One /></Loading>
    <Loading fallback={<i>wait-messages</i>}><Messages /></Loading>
  </div>
)
`;

const SHOWN = "general,random:readyrandomm3,m2:more";

interface FetchCounts {
  fetches: number;
}

interface ChannelApi {
  channels: Array<ChannelRow>;
}

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
}

interface ChannelsQuery {
  status: string;
  utils: RefetchUtils;
}

interface RefetchUtils {
  refetch: () => Promise<void>;
}

interface ClientFixture {
  counts: FetchCounts;
  api: ChannelApi;
  channels: ChannelsQuery;
  page: () => () => unknown;
}

let compiled: Compiled | undefined;
function fixture(): Compiled {
  return (compiled ??= compile(PAGE, "round-trip"));
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  unseeded();
  document.body.innerHTML = "";
});

async function hydrated(container: HTMLElement): Promise<ClientFixture> {
  const module = (await import(`${fixture().dom}?${Math.random()}`)) as ClientFixture;
  module.counts.fetches = 0;
  resetChildIds();
  cleanup = hydrate(module.page() as never, container);
  flush();
  return module;
}

interface BufferedServe {
  result: BufferedPage;
  fetches: number;
}

interface BufferedPage {
  html: string;
  script: string;
}

test("a buffered page renders the server's rows and hydrates without a mismatch", async () => {
  unseeded();
  const served = serve(fixture().ssr, "buffered") as BufferedServe;
  expect(served.fetches).toBe(2);

  const container = mount();
  container.innerHTML = served.result.html;
  expect(container.textContent).toBe(SHOWN);
  runScripts(served.result.script);
  expect(seeds().length).toBeGreaterThan(0);

  const module = await hydrated(container);
  // Hydration renders what the server rendered, before the browser's own
  // collections have loaded anything.
  expect(module.channels.status).not.toBe("ready");
  expect(container.textContent).toBe(SHOWN);
  expect(hydrate.report.recovered).toBe(false);
  expect(seeds()).toEqual([]);

  // The browser's collections load and take over, showing the same rows.
  await settle(60);
  expect(module.counts.fetches).toBe(2);
  expect(container.textContent).toBe(SHOWN);

  // And they are live: the server's answer was a stand-in, not a freeze.
  module.api.channels.push({ id: "announcements", workspace_id: "acme", name: "announcements" });
  await module.channels.utils.refetch();
  await settle();
  expect(container.querySelector(".channels")?.textContent).toBe(
    "announcements,general,random:ready",
  );
});

interface StreamedServe {
  result: StreamedPage;
  fetches: number;
}

interface StreamedPage {
  chunks: string[];
}

test("a streamed page delivers what settles after the shell and hydrates it", async () => {
  unseeded();
  const served = serve(fixture().ssr, "streamed") as StreamedServe;
  // The shell went out before the slower collection had answered.
  expect(served.result.chunks.length).toBeGreaterThan(1);
  expect(served.result.chunks[0]).toContain("wait-messages");
  expect(served.result.chunks[0]).not.toContain("m3,m2");

  const container = mount();
  assemble(served.result.chunks, container);
  expect(container.textContent).toContain("general,random:ready");
  expect(container.textContent).toContain("m3,m2:more");

  const module = await hydrated(container);
  expect(hydrate.report.recovered).toBe(false);
  expect(container.textContent).not.toContain("wait-");
  expect(container.textContent).toBe(SHOWN);

  await settle(60);
  expect(module.counts.fetches).toBe(2);
  expect(container.textContent).toBe(SHOWN);
});

test("hydrating before the stream has finished waits for the server's rows", async () => {
  unseeded();
  const served = serve(fixture().ssr, "streamed") as StreamedServe;
  const { chunks } = served.result;
  const settledFrom = chunks.findIndex((chunk) => chunk.includes("<template data-barq="));
  expect(settledFrom).toBeGreaterThan(0);

  const container = mount();
  assemble(chunks.slice(0, settledFrom), container);
  expect(container.textContent).toContain("wait-messages");
  await hydrated(container);
  flush();
  expect(container.textContent).toContain("wait-messages");

  for (const chunk of chunks.slice(settledFrom)) {
    container.insertAdjacentHTML(
      "beforeend",
      chunk.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""),
    );
    runScripts(chunk);
  }
  await settle(60);
  expect(container.textContent).toBe(SHOWN);
  expect(hydrate.report.recovered).toBe(false);
});
