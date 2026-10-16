/**
 * Binding slots: a server component reads a slot call as data and places its
 * properties at positions of its own markup, an attribute, a class name, a
 * style property, a handler, a ref and a text child. The page's fill runs once
 * per occurrence and owns those positions: claimed where the server wrote the
 * first values, kept across an update that morphs the region, and rebound
 * where the update moved them.
 */

import { afterEach, expect, test } from "bun:test";

import { census, compileText, host, reuse } from "./hydration.ts";

const SOURCE = `
import { createSignal, dynamic } from "@barqjs/core"
export const todos = {
  list: [{ id: 1, title: "first", done: false }, { id: 2, title: "second", done: true }],
}
export const counts = { fills: 0, refs: [] }
export function Todos(props) {
  const filters = props.filters()
  return (
    <section>
      <ul>
        {todos.list.map((todo) => {
          const row = props.row({ $key: todo.id, done: todo.done })
          return (
            <li data-id={todo.id} class={{ todo: true, completed: row.completed }} style={{ opacity: row.fade }} title={row.label}>
              <button onClick={row.toggle}>toggle</button>
              <span>{todo.title}</span> is <strong>{row.label}</strong>
            </li>
          )
        })}
      </ul>
      <a href="#/" class={{ selected: filters.all }} onClick={filters.showAll} ref={filters.ref}>All</a>
    </section>
  )
}
export default function Page(props) {
  const View = dynamic(() => props.view())
  const [filter, setFilter] = createSignal("active")
  return (
    <main>
      <View
        row={(row) => {
          counts.fills++
          const [done, setDone] = createSignal(row.done())
          return {
            get completed() { return done() },
            get fade() { return done() ? 0.5 : 1 },
            get label() { return done() ? "done" : "open" },
            toggle: () => setDone((was) => !was),
          }
        }}
        filters={() => {
          counts.fills++
          return {
            get all() { return filter() === "all" },
            showAll: (event) => { event.preventDefault(); setFilter("all") },
            ref: (element) => counts.refs.push(element.localName),
          }
        }}
      />
    </main>
  )
}
`;

type Module = {
  default: (props: Record<string, unknown>) => unknown;
  Todos: (props: Record<string, unknown>) => unknown;
  todos: { list: { id: number; title: string; done: boolean }[] };
  counts: { fills: number; refs: string[] };
};

let serial = 0;
const ORIGIN = "https://example.com";

async function setup() {
  const both = await compileText(SOURCE, `frames-bind-${serial++}`, true, false);
  const ssr = both.ssr as unknown as Module;
  const dom = both.dom as unknown as Module;
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const startClient = await import("@barqjs/start/client");
  const getTodos = start.createServerFn({ method: "POST" }).handler(() => ssr.Todos);
  startServer.mount(`todos-${serial}`, getTodos as never);
  const call = (): Promise<Response | null> => {
    const request = new Request(`${ORIGIN}/_barq/fn/${encodeURIComponent(getTodos.meta.id)}.data`, {
      method: "POST",
      body: JSON.stringify({ input: undefined }),
    });
    // Set after construction: `Origin` is a forbidden request header, and the
    // DOM this suite registers drops it from a `Request` built with one.
    Object.defineProperty(request, "headers", {
      value: new Headers({ "content-type": "application/json", origin: ORIGIN }),
    });
    return startServer.handleServerFn(request);
  };
  return { ssr, dom, getTodos, call, startClient };
}

afterEach(async () => {
  (await import("@barqjs/start/server")).unmountAll();
  (await import("@barqjs/server/codec")).clearSerializationAdapters();
});

const rows = (container: Element): HTMLLIElement[] => [...container.querySelectorAll("li")];

test("the page's render writes each position's first value beside its marker", async () => {
  const { ssr, getTodos } = await setup();
  const server = await import("@barqjs/server");
  const frame = await getTodos();
  const html = server.renderToString(() => ssr.default({ view: () => frame }) as never);

  expect(html).toContain(
    '<li data-id="1" class="todo" _b-class="1:completed=completed" style="opacity: 1;" _b-style="1:fade=opacity" title="open" _b-title="1:label">',
  );
  expect(html).toContain('class="todo completed" _b-class="2:completed=completed"');
  expect(html).toContain('<button _b-on-click="1:toggle">toggle</button>');
  expect(html).toContain("<strong><!--_b:1:label-->open<!--/_b--></strong>");
  expect(html).toContain(
    '<a href="#/" class="" _b-class="0:all=selected" _b-on-click="0:showAll" _b-ref="0:ref">',
  );
  const payload = JSON.parse(
    /<script type="application\/barq-frame">(.*?)<\/script>/.exec(html)![1]!,
  );
  const codec = await import("@barqjs/server/codec");
  expect(
    payload.slots.map((slot: { args?: unknown }) => ({
      ...slot,
      ...(slot.args === undefined ? {} : { args: codec.decodeWire(slot.args) }),
    })),
  ).toEqual([
    { at: 0, name: "filters", key: "filters:0", bind: true },
    { at: 1, name: "row", key: "$1", args: { done: false }, bind: true },
    { at: 2, name: "row", key: "$2", args: { done: true }, bind: true },
  ]);
  // The fill ran once per occurrence, on the server, for the first values.
  expect(ssr.counts.fills).toBe(3);
});

test("over the wire the markers come alone, and a handler expression elsewhere is never read", async () => {
  const { call } = await setup();
  const body = await (await call())!.text();

  expect(body).toContain(
    '<li data-id="1" class="todo" _b-class="1:completed=completed" _b-style="1:fade=opacity" _b-title="1:label">',
  );
  expect(body).toContain("<strong><!--_b:1:label--><!--/_b--></strong>");

  const server = await import("@barqjs/server");
  const both = await compileText(
    `export default function Plain() { return <button onClick={missing.handler}>go</button> }`,
    `frames-bind-plain-${serial++}`,
    true,
    false,
  );
  const plain = both.ssr as unknown as { default: () => unknown };
  expect(server.renderToString(() => plain.default() as never)).toBe("<button>go</button>");
});

test("the browser claims every position the server wrote, then owns it", async () => {
  const { ssr, dom, getTodos, startClient } = await setup();
  const server = await import("@barqjs/server");
  const codec = await import("@barqjs/server/codec");
  const core = await import("@barqjs/core");
  const frame = await getTodos();
  const html = server.renderToString(() => ssr.default({ view: () => frame }) as never);
  const named = codec.decodeWire<{ id: string; address: string }>(codec.encodeWire(frame));
  const view = startClient.frameAdapter.fromSerializable(named as never) as (
    props: Record<string, unknown>,
  ) => Node;

  const container = host(html);
  const label = container.querySelector("strong")!.firstChild!.nextSibling;
  const before = census(container);
  const frameHost = container.querySelector("barq-frame")!;
  const observer = new MutationObserver(() => {});
  observer.observe(frameHost, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  ssr.counts.fills = 0;
  core.resetChildIds();
  const dispose = core.hydrate(() => dom.default({ view: () => view }) as never, container);
  core.flush();

  expect(core.hydrate.report.recovered).toBe(false);
  // Nothing the server wrote is written again: the claim is the whole of it.
  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
  expect(reuse(before, container)).toMatchObject({ lost: 0, percent: 100 });
  const { counts } = dom;
  expect(counts.fills).toBe(3);
  expect(counts.refs).toEqual(["a"]);

  rows(container)[0]!.querySelector("button")!.click();
  core.flush();
  const first = rows(container)[0]!;
  expect(first.className).toBe("todo completed");
  expect(first.getAttribute("title")).toBe("done");
  expect(first.style.opacity).toBe("0.5");
  expect(container.querySelector("strong")!.firstChild!.nextSibling).toBe(label);
  expect(label!.textContent).toBe("done");

  const link = container.querySelector("a")!;
  link.click();
  core.flush();
  expect(link.className).toBe("selected");

  dispose();
  container.remove();
});

test("an update keeps each fill and its state, and binds what the server added", async () => {
  const { ssr, dom, call, startClient } = await setup();
  const core = await import("@barqjs/core");
  const view = await startClient.applyFrameResponse((await call())!);
  const container = host("");
  const dispose = core.render(() => dom.default({ view: () => view }) as never, container);
  core.flush();
  const { counts } = dom;

  // Built in the browser, every position takes the fill's value.
  expect(rows(container).map((row) => [row.className, row.title, row.textContent])).toEqual([
    ["todo", "open", "togglefirst is open"],
    ["todo completed", "done", "togglesecond is done"],
  ]);
  expect(counts.fills).toBe(3);
  rows(container)[0]!.querySelector("button")!.click();
  core.flush();
  const first = rows(container)[0]!;
  const label = first.querySelector("strong")!.firstChild!.nextSibling;
  expect(label!.textContent).toBe("done");

  ssr.todos.list = [
    { id: 1, title: "first, renamed", done: false },
    { id: 3, title: "third", done: false },
  ];
  await startClient.applyFrameResponse((await call())!);
  core.flush();

  // The kept occurrence keeps its fill, and its state with it.
  expect(counts.fills).toBe(4);
  expect(rows(container)[0]).toBe(first);
  expect(first.className).toBe("todo completed");
  expect(first.title).toBe("done");
  expect(first.style.opacity).toBe("0.5");
  expect(first.querySelector("span")!.textContent).toBe("first, renamed");
  expect(first.querySelector("strong")!.firstChild!.nextSibling).toBe(label);
  expect(rows(container).map((row) => row.textContent)).toEqual([
    "togglefirst, renamed is done",
    "togglethird is open",
  ]);

  // One handler per position: a click toggles once, on the kept row and the new one.
  first.querySelector("button")!.click();
  rows(container)[1]!.querySelector("button")!.click();
  core.flush();
  expect(rows(container).map((row) => row.className)).toEqual(["todo", "todo completed"]);
  expect(counts.refs).toEqual(["a"]);

  dispose();
  container.remove();
});
