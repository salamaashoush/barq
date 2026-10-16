/**
 * A query across a server render.
 *
 * The server half is a real one: another process, no DOM, the string backend.
 * The client half hydrates the compiled DOM module over the bytes that process
 * printed. Between them is the claim this file exists for: what a server
 * fetched to render a page, the browser does not fetch again to hydrate it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { flush, hydrate, resetChildIds } from "@barqjs/core";

import { QueryClient } from "./index.ts";
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
import { elapse, fakeClock, realClock } from "./test-helpers.ts";

const cachedAt = (client: QueryClient, key: readonly unknown[]): unknown =>
  client.getQueryData(key);

const PAGE = `
import { Loading } from "@barqjs/core"
import {
  QueryClientProvider, queryOptions, useInfiniteQuery, useQueries, useQuery, useSuspenseQuery,
} from ${JSON.stringify(ENTRY.index)}

export const counts = { fetches: 0 }
const after = (ms, value) => new Promise((done) => setTimeout(() => done(value), ms))
const fetched = (ms, value) => () => { counts.fetches++; return after(ms, value) }

const cached = queryOptions({ queryKey: ["cached"], queryFn: fetched(1, "from-a-loader") })
export const before = (client) => client.prefetchQuery(cached)

function Plain(props) {
  const query = useQuery(() => ({ queryKey: ["user", props.who()], queryFn: fetched(2, { name: props.who() }) }))
  return <b class="plain">{query.data?.name}:{query.isPending ? "pending" : "ready"}</b>
}
function Parked() {
  const query = useSuspenseQuery(() => ({ queryKey: ["slow"], queryFn: fetched(25, "slow-value") }))
  return <u class="parked">{query.data}</u>
}
function Cached() {
  const query = useQuery(() => cached)
  return <s class="cached">{query.data}</s>
}
function Many() {
  const set = useQueries(() => ({
    queries: [
      { queryKey: ["set", "a"], queryFn: fetched(3, "set-a") },
      { queryKey: ["set", "b"], queryFn: fetched(4, "set-b") },
    ],
  }))
  return <em class="many">{set[0].data}+{set[1].data}</em>
}
function Paged() {
  const query = useInfiniteQuery(() => ({
    queryKey: ["pages"],
    queryFn: ({ pageParam }) => { counts.fetches++; return after(2, "page-" + pageParam) },
    initialPageParam: 0,
    getNextPageParam: (_last, _all, last) => last + 1,
  }))
  return <q class="paged">{query.data?.pages.join(",")}</q>
}

export const page = (client, who = "salama") => () => (
  <QueryClientProvider client={client}>
    <div>
      <Loading fallback={<i>wait-plain</i>}><Plain who={who} /></Loading>
      <Loading fallback={<i>wait-parked</i>}><Parked /></Loading>
      <Loading fallback={<i>wait-cached</i>}><Cached /></Loading>
      <Loading fallback={<i>wait-many</i>}><Many /></Loading>
      <Loading fallback={<i>wait-paged</i>}><Paged /></Loading>
    </div>
  </QueryClientProvider>
)
`;

const SHOWN = ["salama:ready", "slow-value", "from-a-loader", "set-a+set-b", "page-0"].join("");
const FETCHES = 6;

interface ClientFixture {
  counts: { fetches: number };
  page: (client: QueryClient, who?: string) => () => unknown;
}

let compiled: Compiled | undefined;
const fixture = (): Compiled => (compiled ??= compile(PAGE, "round-trip"));

let cleanup: (() => void) | undefined;
beforeEach(fakeClock);

afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  unseeded();
  document.body.innerHTML = "";
  await realClock();
});

async function hydrated(container: HTMLElement) {
  const module = (await import(fixture().dom)) as ClientFixture;
  module.counts.fetches = 0;
  const client = new QueryClient();
  resetChildIds();
  const dispose = hydrate(module.page(client) as never, container);
  cleanup = () => {
    dispose();
    client.clear();
  };
  flush();
  return { module, client };
}

interface Buffered {
  html: string;
  script: string;
  cached: string[];
  data: unknown[];
}

test("a buffered page: the server waits, and hydration fetches nothing", async () => {
  unseeded();
  const served = serve(fixture().ssr, "buffered") as { result: Buffered; fetches: number };
  expect(served.fetches).toBe(FETCHES);

  const container = mount();
  container.innerHTML = served.result.html;
  expect(container.textContent).toBe(SHOWN);
  runScripts(served.result.script);
  expect(seeds().length).toBeGreaterThan(0);

  const { module, client } = await hydrated(container);
  expect(container.textContent).toBe(SHOWN);
  expect(hydrate.report.recovered).toBe(false);
  expect(seeds()).toEqual([]);
  expect(cachedAt(client, ["user", "salama"])).toEqual({ name: "salama" });
  expect(cachedAt(client, ["cached"])).toBe("from-a-loader");

  await elapse(60);
  flush();
  expect(module.counts.fetches).toBe(0);
  expect(container.textContent).toBe(SHOWN);

  // Seeded is not frozen: the observers are subscribed, and an invalidation
  // reaches the page.
  const invalidated = client.invalidateQueries({ queryKey: ["slow"] });
  await elapse(25);
  await invalidated;
  await elapse(5);
  flush();
  expect(module.counts.fetches).toBe(1);
});

test("a streamed page: what settles after the shell is delivered later, and not refetched", async () => {
  unseeded();
  const served = serve(fixture().ssr, "streamed") as {
    result: { chunks: string[] };
    fetches: number;
  };
  expect(served.fetches).toBe(FETCHES);
  expect(served.result.chunks.length).toBeGreaterThan(1);
  expect(served.result.chunks[0]).toContain("wait-parked");
  expect(served.result.chunks[0]).not.toContain("slow-value");

  const container = mount();
  assemble(served.result.chunks, container);
  expect(container.textContent).toContain("slow-value");

  const { module, client } = await hydrated(container);
  await elapse(60);
  flush();
  expect(module.counts.fetches).toBe(0);
  expect(hydrate.report.recovered).toBe(false);
  for (const value of ["salama:ready", "slow-value", "from-a-loader", "set-a+set-b", "page-0"]) {
    expect(container.textContent).toContain(value);
  }
  expect(container.textContent).not.toContain("wait-");
  expect(cachedAt(client, ["slow"])).toBe("slow-value");
});

test("hydrating before the stream has finished waits for it instead of fetching", async () => {
  unseeded();
  const served = serve(fixture().ssr, "streamed") as {
    result: { chunks: string[] };
    fetches: number;
  };
  // Everything up to the first settled boundary: the shell, and the script
  // that puts each pending answer on the page as a promise.
  const { chunks } = served.result;
  const settledFrom = chunks.findIndex((chunk) => chunk.includes("<template data-barq="));
  expect(settledFrom).toBeGreaterThan(0);

  const container = mount();
  assemble(chunks.slice(0, settledFrom), container);
  expect(container.textContent).toContain("wait-parked");
  const { module, client } = await hydrated(container);
  await elapse(10);
  flush();
  expect(module.counts.fetches).toBe(0);
  expect(cachedAt(client, ["slow"])).toBeUndefined();
  expect(container.textContent).toContain("wait-parked");

  for (const chunk of chunks.slice(settledFrom)) {
    container.insertAdjacentHTML(
      "beforeend",
      chunk.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""),
    );
    runScripts(chunk);
  }
  await elapse(60);
  flush();
  expect(module.counts.fetches).toBe(0);
  expect(cachedAt(client, ["slow"])).toBe("slow-value");
  expect(container.textContent).toContain("slow-value");
  expect(container.textContent).not.toContain("wait-");
  expect(hydrate.report.recovered).toBe(false);
});

test("two renders at once keep to their own client", () => {
  const served = serve(fixture().ssr, "concurrent", "salama,guest") as {
    result: Buffered[];
    fetches: number;
  };
  const [first, second] = served.result;
  const text = (html = ""): string => {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    return holder.textContent;
  };
  expect(text(first?.html)).toContain("salama:ready");
  expect(text(first?.html)).not.toContain("guest");
  expect(text(second?.html)).toContain("guest:ready");
  expect(text(second?.html)).not.toContain("salama");
  expect(first?.cached).toContain('["user","salama"]');
  expect(first?.cached).not.toContain('["user","guest"]');
  expect(second?.cached).toContain('["user","guest"]');
  expect(second?.cached).not.toContain('["user","salama"]');
  // Each render fetched everything for itself: nothing was answered from the
  // other's cache.
  expect(served.fetches).toBe(FETCHES * 2);
});
