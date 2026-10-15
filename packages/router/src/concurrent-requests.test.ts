/**
 * Two page requests in flight at once share one module graph.
 *
 * A request waits on its loaders, and another request starts and finishes in
 * the meantime. Whatever a request's own code declares after such a wait is
 * that request's or nobody's: it is never written into the page another visitor
 * is about to be sent, and nothing of a finished request is left current for
 * the next one to inherit.
 */

import { esc, html as ssrHtml } from "@barqjs/server";
import { createMemo, createRoot, runWithOwner, settle } from "@barqjs/core";
import { expect, test } from "bun:test";

import { HeadContent } from "./components.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function get(path: string): Request {
  return new Request(`https://example.com${path}`);
}

interface Gate {
  entered: boolean;
  open(): void;
  readonly opened: Promise<void>;
}

function gate(): Gate {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { entered: false, open, opened };
}

async function entered(waiting: Gate): Promise<void> {
  while (!waiting.entered) await tick();
}

/** A keyed read made by code that belongs to no render. */
function detached<T>(key: string, fetch: () => Promise<T>): () => T {
  return runWithOwner(null, () => createRoot(() => createMemo(fetch, { key })));
}

function usersHandler(
  gates: Record<string, Gate>,
  stream: boolean,
): (request: Request) => Promise<Response> {
  return createPageHandler({
    routeTree: [
      {
        id: "__root__",
        path: "/",
        shellComponent: (props: { children: unknown }) =>
          ssrHtml(
            `<html><head>${esc(HeadContent())}</head>` +
              `<body>${esc(props.children)}</body></html>`,
          ),
        component: (props: { children: unknown }) => ssrHtml(esc(props.children)),
        children: [
          {
            id: "/users/$id",
            path: "users/$id",
            loader: async ({ params }: { params: { id: string } }) => {
              const mine = gates[params.id];
              mine.entered = true;
              await mine.opened;
              // Declared after the wait, by which time another request may be
              // the one the process last heard from.
              detached("detail", async () => `detail-of-${params.id}`);
              return { title: `private-${params.id}` };
            },
            head: ({ loaderData }: { loaderData: { title?: string } | undefined }) => ({
              meta: [{ title: loaderData?.title ?? "MISSING" }],
            }),
            component: (props: { data: () => unknown }) =>
              ssrHtml(`<main>${esc((props.data() as { title: string })?.title)}</main>`),
          },
        ],
      },
    ] as never,
    stream,
    app: (state) => renderRoutes(state),
  });
}

for (const stream of [false, true]) {
  test(`two interleaved requests each serialise only their own values (stream=${stream})`, async () => {
    const gates = { salama: gate(), guest: gate() };
    const handler = usersHandler(gates, stream);

    const first = handler(get("/users/salama")).then((response) => response.text());
    await entered(gates.salama);
    const second = handler(get("/users/guest")).then((response) => response.text());
    await entered(gates.guest);

    gates.salama.open();
    const mine = await first;
    gates.guest.open();
    const theirs = await second;

    expect(mine).toContain("<main>private-salama</main>");
    expect(mine).toContain('title:"private-salama"');
    expect(mine).not.toContain("guest");
    expect(theirs).toContain("<main>private-guest</main>");
    expect(theirs).toContain('title:"private-guest"');
    expect(theirs).not.toContain("salama");
  });
}

test("a finished request is not left current for whatever runs next", async () => {
  const gates = { salama: gate(), guest: gate() };
  const handler = usersHandler(gates, false);

  const first = handler(get("/users/salama")).then((response) => response.text());
  await entered(gates.salama);
  const second = handler(get("/users/guest")).then((response) => response.text());
  await entered(gates.guest);
  gates.salama.open();
  await first;
  gates.guest.open();
  await second;

  // Two reads under one key, made outside any render by two different callers.
  // Neither belongs to a request, so neither may answer for the other.
  let fetches = 0;
  const visitor = (name: string) =>
    detached("visitor", async () => {
      fetches++;
      return name;
    });
  const one = visitor("salama");
  await settle();
  const other = visitor("guest");
  await settle();

  expect(one()).toBe("salama");
  expect(other()).toBe("guest");
  expect(fetches).toBe(2);
});
