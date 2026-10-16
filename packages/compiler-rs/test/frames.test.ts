/**
 * Frames, end to end: a server function whose handler returns a component,
 * written into the page by a route, claimed by the browser, and updated in
 * place by a later answer.
 *
 * One source, compiled for both backends: the server component and the page
 * are rendered by the string module, and the page is hydrated and updated by
 * the DOM module, so what is measured is what an application ships.
 */

import { afterEach, expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";

const SOURCE = `
import { createSignal, dynamic, useHead } from "@barqjs/core"
export const story = {
  title: "first",
  comments: [{ id: 1, text: "one" }, { id: 2, text: "two" }],
  sheet: "",
}
export const counts = { stories: 0 }
export function Story(props) {
  counts.stories++
  useHead({ tag: "meta", props: { name: "story", content: story.title } })
  if (story.sheet !== "") useHead({ tag: "link", props: { rel: "stylesheet", href: story.sheet } })
  return (
    <article>
      <h1>{story.title}</h1>
      <ul>
        {story.comments.map((c) => (
          <li><props.comment $key={c.id} cid={c.id}><p>{c.text}</p></props.comment></li>
        ))}
      </ul>
      <footer>{props.children}</footer>
    </article>
  )
}
function Comment(props) {
  const [open, setOpen] = createSignal(true)
  return (
    <section class="comment" data-cid={props.cid()}>
      <button onClick={() => setOpen((was) => !was)}>{open() ? "open" : "closed"}</button>
      {props.children}
    </section>
  )
}
export default function Page(props) {
  const View = dynamic(() => props.view())
  return (
    <main>
      <View comment={(p) => <Comment cid={p.cid()}>{p.children}</Comment>}>
        <b class="share">share</b>
      </View>
    </main>
  )
}
`;

type Story = { title: string; comments: { id: number; text: string }[]; sheet: string };
type Module = {
  default: (props: Record<string, unknown>) => unknown;
  Story: (props: Record<string, unknown>) => unknown;
  story: Story;
  counts: { stories: number };
};

let serial = 0;
const ORIGIN = "https://example.com";

async function setup() {
  const both = await compileText(SOURCE, `frames-${serial++}`, true, false);
  const ssr = both.ssr as unknown as Module;
  const dom = both.dom as unknown as Module;
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const startClient = await import("@barqjs/start/client");
  const getStory = start.createServerFn({ method: "POST" }).handler(() => ssr.Story);
  startServer.mount(`story-${serial}`, getStory as never);
  const call = (): Promise<Response | null> => {
    const request = new Request(`${ORIGIN}/_barq/fn/${encodeURIComponent(getStory.meta.id)}.data`, {
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
  return { ssr, dom, getStory, call, startClient };
}

// A frame registers the adapter that names it in a seed, and the registry is
// the process's: a later suite's seeds must not carry it.
afterEach(async () => {
  (await import("@barqjs/start/server")).unmountAll();
  (await import("@barqjs/server/codec")).clearSerializationAdapters();
});

test("a route writes the frame into the page, its slots filled for the first paint", async () => {
  const { ssr, getStory } = await setup();
  const server = await import("@barqjs/server");
  const frame = await getStory();
  const html = server.renderToString(() => ssr.default({ view: () => frame }) as never);

  expect(html).toMatch(
    /^<main><!--\[--><barq-frame data-frame="story-\d+#\w+" style="display:contents">/,
  );
  const payload = JSON.parse(
    /<script type="application\/barq-frame">(.*?)<\/script>/.exec(html)![1]!,
  );
  expect(
    payload.slots.map((slot: { name: string; key: string }) => `${slot.name} ${slot.key}`),
  ).toEqual(["comment $1", "comment $2", "children children:0"]);
  expect(payload.slots[0].region).toBeUndefined();
  expect(payload.head).toEqual([{ tag: "meta", props: { name: "story", content: "first" } }]);
  expect(html).toContain("<h1>first</h1>");
  expect(html).toContain('<section class="comment" data-cid="1"><button>open</button>');
  expect(html).toContain(
    '<barq-region data-region="0" style="display:contents"><p>one</p></barq-region>',
  );
  expect(html).toContain('<!--s:2--><b class="share">share</b><!--/s:2-->');
  expect(html.match(/<p>one<\/p>/g)).toHaveLength(1);
});

test("over the wire the region comes alone, its slots empty and each region in the payload", async () => {
  const { call } = await setup();
  const response = await call();
  const body = await response!.text();

  expect(response!.headers.get("x-barq-rpc")).toBe("frame");
  expect(response!.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(body).toStartWith('<barq-frame data-frame="');
  expect(body).toContain("<!--s:0--><!--/s:0-->");
  expect(body).not.toContain("<section");
  const payload = JSON.parse(
    /<script type="application\/barq-frame">(.*?)<\/script>/.exec(body)![1]!,
  );
  expect(payload.slots[0]).toMatchObject({ name: "comment", key: "$1", region: "<p>one</p>" });
});

test("the browser claims the frame, fills its slots, and an update morphs it in place", async () => {
  const { ssr, dom, getStory, call, startClient } = await setup();
  const server = await import("@barqjs/server");
  const codec = await import("@barqjs/server/codec");
  const core = await import("@barqjs/core");

  const frame = await getStory();
  const html = server.renderToString(() => ssr.default({ view: () => frame }) as never);
  // What the page's seed carries for the frame, decoded the way the browser does.
  const named = codec.decodeWire<{ id: string; address: string }>(codec.encodeWire(frame));
  const view = startClient.frameAdapter.fromSerializable(named as never) as (
    props: Record<string, unknown>,
  ) => Node;

  const container = host(html);
  const served = { article: container.querySelector("article"), h1: container.querySelector("h1") };
  core.resetChildIds();
  const dispose = core.hydrate(() => dom.default({ view: () => view }) as never, container);
  core.flush();

  expect(core.hydrate.report.recovered).toBe(false);
  expect(core.hydrate.report.mismatches).toEqual([]);
  expect(container.querySelector("article")).toBe(served.article);
  expect(container.querySelector("h1")).toBe(served.h1);
  const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll("button")];
  expect(buttons().map((button) => button.textContent)).toEqual(["open", "open"]);
  buttons()[1]!.click();
  core.flush();
  expect(buttons()[1]!.textContent).toBe("closed");
  const second = container.querySelector('[data-cid="2"]');
  // A slot's content is the browser's from here on, built when the page was claimed.
  const share = container.querySelector(".share");
  expect(share).not.toBeNull();

  ssr.story.title = "second";
  ssr.story.comments = [
    { id: 2, text: "two, edited" },
    { id: 3, text: "three" },
  ];
  let applied = "";
  document.addEventListener("barq:frame-applied", (event) => {
    applied = (event as CustomEvent<{ address: string }>).detail.address;
  });
  const same = await startClient.applyFrameResponse((await call())!);
  core.flush();

  expect(same).toBe(view as never);
  expect(applied).toBe(named.address);
  expect(container.querySelector("article")).toBe(served.article);
  expect(container.querySelector("h1")).toBe(served.h1);
  expect(served.h1!.textContent).toBe("second");
  expect(container.querySelector('[data-cid="1"]')).toBeNull();
  expect(container.querySelector('[data-cid="2"]')).toBe(second);
  expect(second!.textContent).toBe("closedtwo, edited");
  expect(container.querySelector('[data-cid="3"]')?.textContent).toBe("openthree");
  expect(container.querySelector(".share")).toBe(share);
  expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
    "closedtwo, edited",
    "openthree",
  ]);
  expect(document.head.querySelector('meta[name="story"]')?.getAttribute("content")).toBe("second");

  dispose();
  expect(document.head.querySelector('meta[name="story"]')).toBeNull();
  container.remove();
});

test("an update whose region needs a stylesheet is applied once the stylesheet has loaded", async () => {
  const { ssr, dom, getStory, call, startClient } = await setup();
  const core = await import("@barqjs/core");
  const codec = await import("@barqjs/server/codec");
  const frame = await getStory();
  const view = startClient.frameAdapter.fromSerializable(
    codec.decodeWire(codec.encodeWire(frame)) as never,
  ) as (props: Record<string, unknown>) => Node;
  const container = host("");
  const dispose = core.render(() => dom.default({ view: () => view }) as never, container);
  core.flush();
  // A fresh mount over a reference has no markup until an answer brings it.
  await startClient.applyFrameResponse((await call())!);
  core.flush();
  expect(container.querySelector("h1")?.textContent).toBe("first");

  ssr.story.title = "styled";
  ssr.story.sheet = "/story.css";
  const applying = startClient.applyFrameResponse((await call())!);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const sheet = document.head.querySelector('link[href="/story.css"]');
  expect(sheet).not.toBeNull();
  expect(container.querySelector("h1")?.textContent).toBe("first");
  sheet!.dispatchEvent(new Event("load"));
  await applying;
  core.flush();

  expect(container.querySelector("h1")?.textContent).toBe("styled");
  dispose();
  container.remove();
});
