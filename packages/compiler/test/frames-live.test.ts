/**
 * `live` frames: a server component over a standing source, kept current over
 * one connection. Each value the source yields renders the region again on
 * the server and is applied where it stands; a connection that dies is
 * reconnected from the last event it applied, which the server does not send
 * again; and a frame the page was served connects once the page is claimed.
 */

import { afterEach, expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";

const SOURCE = `
import { Loading, createMemo, createSignal } from "@barqjs/core"
import { dynamic } from "@barqjs/web"
export function boardFor(feed) {
  return (props) => {
    const latest = createMemo(() => feed)
    return (
      <Loading fallback={<i>wait</i>}>
        <article>
          <h1>{latest().title}</h1>
          {latest().items.map((item) => <props.item $key={item.id} label={item.label} />)}
        </article>
      </Loading>
    )
  }
}
function Item(props) {
  const [done, setDone] = createSignal(false)
  return <p class="item"><button onClick={() => setDone((was) => !was)}>{done() ? "done" : "todo"}</button>{props.label()}</p>
}
export function Page(props) {
  const View = dynamic(() => props.view())
  return <main><View item={(slot) => <Item label={slot.label()} />} /></main>
}
`;

type Board = { title: string; items: { id: number; label: string }[] };
type Module = {
  Page: (props: unknown) => Node;
  boardFor: (feed: AsyncIterable<Board>) => (props: Record<string, unknown>) => unknown;
};

/** A standing source: every reader starts from the current board, then hears each change. */
function channel(initial: Board) {
  let current = initial;
  const readers = new Set<{ push: (board: Board | null) => void }>();
  return {
    publish(board: Board | null): void {
      if (board !== null) current = board;
      for (const reader of readers) reader.push(board);
    },
    readers: (): number => readers.size,
    subscribe(): AsyncIterable<Board> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<Board> {
          const queue: (Board | null)[] = [current];
          let wake: (() => void) | null = null;
          const reader = {
            push(board: Board | null) {
              queue.push(board);
              wake?.();
            },
          };
          readers.add(reader);
          return {
            async next(): Promise<IteratorResult<Board>> {
              while (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
              const board = queue.shift()!;
              if (board === null) {
                readers.delete(reader);
                return { done: true, value: undefined };
              }
              return { done: false, value: board };
            },
            async return(): Promise<IteratorResult<Board>> {
              readers.delete(reader);
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  };
}

const ORIGIN = "https://example.com";
const until = async (ready: () => boolean): Promise<void> => {
  for (let turn = 0; turn < 400 && !ready(); turn++) await new Promise((r) => setTimeout(r, 5));
  if (!ready()) throw new Error("timed out");
};

afterEach(async () => {
  (await import("@barqjs/start")).createStart(() => ({}));
  (await import("@barqjs/start/server")).unmountAll();
  (await import("@barqjs/server/codec")).clearSerializationAdapters();
  document.body.innerHTML = "";
});

async function setup(name: string) {
  const both = await compileText(SOURCE, name, true, false);
  const ssr = both.ssr as unknown as Module;
  const dom = both.dom as unknown as Module;
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const startClient = await import("@barqjs/start/client");
  const feed = channel({ title: "board one", items: [{ id: 1, label: "first" }] });
  const getBoard = start
    .createServerFn({ method: "GET" })
    .handler(() => ssr.boardFor(feed.subscribe()));
  const id = `${name}#getBoard`;
  startServer.mount(id, getBoard as never);

  /** Each connection the page opens, with the request it sent and a way to cut it. */
  const connections: { request: Request; cut: () => void }[] = [];
  const viaServer = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(new URL(String(url), ORIGIN), init);
    // Set after construction: `Origin` is a forbidden request header, and the
    // DOM this suite registers drops it from a `Request` built with one.
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    Object.defineProperty(request, "headers", { value: headers });
    // The connection a browser closes when the fetch is aborted.
    const aborts = new AbortController();
    init?.signal?.addEventListener("abort", () => aborts.abort(), { once: true });
    Object.defineProperty(request, "signal", { value: aborts.signal });
    const answer = (await startServer.handleServerFn(request))!;
    const reader = answer.body!.getReader();
    let cut!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        cut = () => {
          aborts.abort();
          controller.close();
        };
        void (async () => {
          for (;;) {
            const step = await reader.read().catch(() => ({ done: true, value: undefined }));
            if (step.done === true) break;
            try {
              controller.enqueue(step.value!);
            } catch {
              return;
            }
          }
          try {
            controller.close();
          } catch {
            // Cut already.
          }
        })();
      },
      cancel() {
        aborts.abort();
        void reader.cancel();
      },
    });
    connections.push({ request, cut });
    return new Response(body, { status: answer.status, headers: answer.headers });
  };
  start.createStart(() => ({ serverFns: { fetch: viaServer as typeof fetch } }));
  const stub = startClient.clientRpc<undefined, unknown, "GET">(id, [], { method: "GET" });
  return { ssr, dom, feed, getBoard, stub, connections, start, startClient };
}

test("a live frame is applied in place for each value its source yields, over one connection", async () => {
  const { dom, feed, stub, connections, startClient } = await setup("frames-live-a");
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const board = startClient.live(stub)();
  const statuses: string[] = [];
  board.onstatus = (status) => statuses.push(status);
  const container = host("");
  const dispose = web.render(() => {
    const current = core.createMemo(() => board as never);
    return dom.Page({ view: () => current() }) as never;
  }, container);
  await until(() => container.querySelector("h1") !== null);
  core.flush();

  expect(container.querySelector("h1")!.textContent).toBe("board one");
  const heading = container.querySelector("h1");
  container.querySelector("button")!.click();
  core.flush();
  expect(container.querySelector("button")!.textContent).toBe("done");

  feed.publish({
    title: "board two",
    items: [
      { id: 1, label: "first" },
      { id: 2, label: "second" },
    ],
  });
  await until(() => container.querySelector("h1")?.textContent === "board two");
  core.flush();

  expect(connections).toHaveLength(1);
  expect(container.querySelector("h1")).toBe(heading);
  expect([...container.querySelectorAll(".item")].map((item) => item.textContent)).toEqual([
    "donefirst",
    "todosecond",
  ]);
  expect(statuses).toEqual(["connected"]);

  feed.publish(null);
  await until(() => statuses.includes("closed"));
  expect(connections).toHaveLength(1);
  dispose();
  container.remove();
});

test("a connection that dies is reconnected from the event it last applied, and nothing remounts", async () => {
  const { dom, feed, stub, connections, startClient } = await setup("frames-live-b");
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const board = startClient.live(stub)();
  const statuses: string[] = [];
  board.onstatus = (status) => statuses.push(status);
  const container = host("");
  let mounts = 0;
  const dispose = web.render(() => {
    const current = core.createMemo(() => board as never);
    return dom.Page({ view: () => (mounts++, current()) }) as never;
  }, container);
  await until(() => container.querySelector("h1") !== null);
  core.flush();
  const heading = container.querySelector("h1");
  const views = mounts;

  connections[0]!.cut();
  await until(() => connections.length === 2 && statuses.at(-1) === "connected");
  await new Promise((r) => setTimeout(r, 20));
  core.flush();

  expect(statuses).toEqual(["connected", "reconnecting", "connected"]);
  expect(connections[1]!.request.headers.get("last-event-id")).not.toBeNull();
  expect(container.querySelector("h1")).toBe(heading);
  expect(mounts).toBe(views);

  feed.publish({ title: "after the reconnect", items: [{ id: 1, label: "first" }] });
  await until(() => container.querySelector("h1")?.textContent === "after the reconnect");
  expect(container.querySelector("h1")).toBe(heading);
  dispose();
  await until(() => feed.readers() === 0);
  container.remove();
});

test("a live frame the page was served connects once the page is claimed", async () => {
  const { ssr, dom, feed, getBoard, connections, startClient } = await setup("frames-live-c");
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const server = await import("@barqjs/server");
  const codec = await import("@barqjs/server/codec");
  const frame = await startClient.live(getBoard)();
  const page = await server.renderPage(() => ssr.Page({ view: () => frame }) as never);
  expect(page.html).toContain('"live":true');
  expect(page.html).toContain("<h1>board one</h1>");
  // The browser never runs the server component, so nothing it read is seeded.
  expect(page.data).toEqual({});
  const view = startClient.frameAdapter.fromSerializable(
    codec.decodeWire(codec.encodeWire(frame)) as never,
  ) as (props: Record<string, unknown>) => Node;

  const container = host(page.html);
  const heading = container.querySelector("h1");
  core.resetChildIds();
  const dispose = web.hydrate(() => dom.Page({ view: () => view }) as never, container);
  core.flush();
  expect(web.hydrate.report.recovered).toBe(false);
  await until(() => connections.length === 1);

  feed.publish({ title: "pushed after the claim", items: [{ id: 1, label: "first" }] });
  await until(() => container.querySelector("h1")?.textContent === "pushed after the claim");
  expect(container.querySelector("h1")).toBe(heading);

  dispose();
  await until(() => feed.readers() === 0);
  container.remove();
});
