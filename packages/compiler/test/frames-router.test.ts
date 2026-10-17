/**
 * A frame through the router: a route's loader calls a server function whose
 * handler returns a component, and the route renders what it answered with.
 * Navigating to another story mounts that story's region; asking for the same
 * story again applies the new answer where the region stands, and the route
 * around it is not rendered again.
 */

import { afterEach, expect, test } from "bun:test";

import { compileText } from "./hydration.ts";

const SOURCE = `
import { createSignal } from "@barqjs/core"
import { dynamic } from "@barqjs/web"
export const stories = {
  1: { title: "story one", comments: [{ id: 1, text: "first" }] },
  2: { title: "story two", comments: [{ id: 7, text: "seventh" }] },
}
export const counts = { routes: 0 }
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
export function StoryRoute(props) {
  counts.routes++
  const View = dynamic(() => props.data())
  return <main><View comment={(p) => <Comment cid={p.cid()}>{p.children}</Comment>} /></main>
}
`;

type Module = {
  StoryRoute: (props: unknown) => Node;
  storyFor: (id: number) => (props: Record<string, unknown>) => unknown;
  stories: Record<number, { title: string; comments: { id: number; text: string }[] }>;
  counts: { routes: number };
};

const ORIGIN = "https://example.com";

// A frame registers the adapter that names it in a seed, and the registry is
// the process's: a later suite's seeds must not carry it.
afterEach(async () => {
  (await import("@barqjs/start/server")).unmountAll();
  (await import("@barqjs/server/codec")).clearSerializationAdapters();
  document.body.innerHTML = "";
});

test("navigation mounts each story's region, and asking again updates the one on the page", async () => {
  const both = await compileText(SOURCE, "frames-router", true, false);
  const ssr = both.ssr as unknown as Module;
  const dom = both.dom as unknown as Module;
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const start = await import("@barqjs/start");
  const startServer = await import("@barqjs/start/server");
  const startClient = await import("@barqjs/start/client");
  const router = await import("@barqjs/router");

  const getStory = start
    .createServerFn({ method: "POST" })
    .validator((input: { id: number }) => input)
    .handler(({ data }) => ssr.storyFor(data.id));
  startServer.mount("frames-router#getStory", getStory as never);
  const stub = startClient.clientRpc<{ id: number }, unknown>("frames-router#getStory");
  let calls = 0;
  const viaServer = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls++;
    const request = new Request(new URL(String(url), ORIGIN), init);
    // Set after construction: `Origin` is a forbidden request header, and the
    // DOM this suite registers drops it from a `Request` built with one.
    Object.defineProperty(request, "headers", {
      value: new Headers({ "content-type": "application/json", origin: ORIGIN }),
    });
    return startServer.handleServerFn(request).then((answer) => answer!);
  };

  const state = router.createRouter({
    routeTree: [
      {
        id: "story",
        path: "/story/$id",
        component: dom.StoryRoute,
        loader: ({ params }: { params: { id: string } }) =>
          stub({ data: { id: Number(params.id) }, fetch: viaServer as typeof fetch }),
      },
    ] as never,
    history: router.memoryHistory({ initial: ["/story/1"] }),
  });
  await state.load();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(
    (() =>
      (router.RouterProvider as never as (p: unknown) => unknown)({ state: () => state })) as never,
    host,
  );
  core.flush();

  expect(host.querySelector("h1")?.textContent).toBe("story one");
  const button = (): HTMLButtonElement => host.querySelector("button")!;
  button().click();
  core.flush();
  expect(button().textContent).toBe("closed");
  const routes = dom.counts.routes;
  const heading = host.querySelector("h1");
  const comment = host.querySelector('[data-cid="1"]');

  ssr.stories[1]!.title = "story one, revised";
  await state.invalidate({ sync: true });
  core.flush();

  expect(calls).toBe(2);
  expect(dom.counts.routes).toBe(routes);
  expect(host.querySelector("h1")).toBe(heading);
  expect(heading!.textContent).toBe("story one, revised");
  expect(host.querySelector('[data-cid="1"]')).toBe(comment);
  expect(button().textContent).toBe("closed");

  await state.navigate("/story/2");
  await state.settled();
  core.flush();
  expect(host.querySelector("h1")?.textContent).toBe("story two");
  expect(host.querySelector('[data-cid="7"]')?.textContent).toBe("openseventh");
  expect(host.querySelector('[data-story="1"]')).toBeNull();

  await state.navigate("/story/1");
  await state.settled();
  core.flush();
  expect(host.querySelector("h1")?.textContent).toBe("story one, revised");
  expect(host.querySelector('[data-cid="1"]')?.textContent).toBe("openfirst");

  dispose();
  state.dispose();
});
