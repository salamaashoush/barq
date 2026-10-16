/**
 * Single flight: a mutation that says which frames it changed answers with
 * those regions, rendered again, beside its value. One request settles both,
 * and the region is updated where it stands before the caller sees the value.
 */

import { afterEach, expect, test } from "bun:test";

import { compileText } from "./hydration.ts";

const SOURCE = `
import { createSignal, dynamic } from "@barqjs/core"
export const stories = { 1: { title: "story one", comments: [{ id: 1, text: "first" }] } }
export function storyFor(id) {
  return (props) => (
    <article data-story={id}>
      <h1>{stories[id].title}</h1>
      {stories[id].comments.map((c) => <props.comment $key={c.id} cid={c.id}><p>{c.text}</p></props.comment>)}
    </article>
  )
}
function Comment(props) {
  const [open, setOpen] = createSignal(true)
  return (
    <section data-cid={props.cid()}>
      <button onClick={() => setOpen((was) => !was)}>{open() ? "open" : "closed"}</button>
      {props.children}
    </section>
  )
}
export function Page(props) {
  const View = dynamic(() => props.view())
  return <main><View comment={(p) => <Comment cid={p.cid()}>{p.children}</Comment>} /></main>
}
`;

type Module = {
  Page: (props: unknown) => Node;
  storyFor: (id: number) => (props: Record<string, unknown>) => unknown;
  stories: Record<number, { title: string; comments: { id: number; text: string }[] }>;
};

const ORIGIN = "https://example.com";

// A frame registers the adapter that names it in a seed, and the registry is
// the process's: a later suite's seeds must not carry it.
afterEach(async () => {
  (await import("@barqjs/start/server")).unmountAll();
  (await import("@barqjs/server/codec")).clearSerializationAdapters();
  document.body.innerHTML = "";
});

test("a mutation answers with the regions it changed, in one request", async () => {
  const both = await compileText(SOURCE, "frames-flight", true, false);
  const ssr = both.ssr as unknown as Module;
  const dom = both.dom as unknown as Module;
  const core = await import("@barqjs/core");
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const startClient = await import("@barqjs/start/client");

  const getStory = start
    .createServerFn({ method: "GET" })
    .validator((input: { id: number }) => input)
    .handler(({ data }) => ssr.storyFor(data.id));
  const rename = start
    .createServerFn({ method: "POST" })
    .validator((input: { title: string }) => input)
    .handler(({ data }) => {
      ssr.stories[1]!.title = data.title;
      start.invalidateFrames(getStory);
      return `renamed to ${data.title}`;
    });
  startServer.mount("frames-flight#getStory", getStory as never);
  startServer.mount("frames-flight#rename", rename as never);

  const urls: string[] = [];
  const viaServer = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    urls.push(String(url));
    const request = new Request(new URL(String(url), ORIGIN), init);
    // Set after construction: `Origin` is a forbidden request header, and the
    // DOM this suite registers drops it from a `Request` built with one.
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    Object.defineProperty(request, "headers", { value: headers });
    return startServer.handleServerFn(request).then((answer) => answer!);
  };
  const story = startClient.clientRpc<{ id: number }, unknown, "GET">(
    "frames-flight#getStory",
    [],
    {
      method: "GET",
    },
  );
  const renameStub = startClient.clientRpc<{ title: string }, string>("frames-flight#rename");

  const view = await story({ data: { id: 1 }, fetch: viaServer as typeof fetch });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = core.render(() => dom.Page({ view: () => view }) as never, host);
  core.flush();
  const heading = host.querySelector("h1");
  host.querySelector("button")!.click();
  core.flush();
  urls.length = 0;

  const value = await renameStub({
    data: { title: "story one, renamed" },
    fetch: viaServer as typeof fetch,
  });
  core.flush();

  expect(value).toBe("renamed to story one, renamed");
  expect(urls).toHaveLength(1);
  expect(host.querySelector("h1")).toBe(heading);
  expect(heading!.textContent).toBe("story one, renamed");
  expect(host.querySelector("button")!.textContent).toBe("closed");

  dispose();
});

test("a mutation that changed no mounted frame answers with its value alone", async () => {
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const plain = start.createServerFn({ method: "POST" }).handler(() => "plain");
  startServer.mount("frames-flight#plain", plain as never);
  const request = new Request(
    `${ORIGIN}/_barq/fn/${encodeURIComponent("frames-flight#plain")}.data`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  Object.defineProperty(request, "headers", {
    value: new Headers({
      "content-type": "application/json",
      origin: ORIGIN,
      "x-barq-frames": JSON.stringify([{ id: "frames-flight#getStory", args: null }]),
    }),
  });
  const answer = (await startServer.handleServerFn(request))!;

  expect(answer.headers.get("x-barq-rpc")).toBeNull();
  const codec = await import("@barqjs/server/codec");
  expect(codec.decodeWire(await answer.json())).toBe("plain");
});
