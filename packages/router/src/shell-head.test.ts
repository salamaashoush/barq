/**
 * A streamed page's status, headers and redirect are decided when its shell
 * flushes, by what the shell rendered, and the shell holds everything that was
 * ready by then.
 */

import { DEV, createMemo, httpHeader, httpStatus } from "@barqjs/core";
import { esc, html as ssrHtml, ssrLoading } from "@barqjs/server";
import { describe, expect, spyOn, test } from "bun:test";

import type { AnyRouteDefinition } from "./route.ts";
import { createPageHandler, notFound, redirect, renderRoutes } from "./server.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let seq = 0;

function page(definition: Record<string, unknown>): {
  handler: (request: Request) => Promise<Response>;
  path: string;
} {
  const id = `/shell-head-${seq++}`;
  const routes = [
    {
      id: "__root__",
      path: "/",
      shellComponent: (props: { children: unknown }) =>
        ssrHtml(`<html><head><title>t</title></head><body>${esc(props.children)}</body></html>`),
      component: (props: { children: unknown }) => ssrHtml(esc(props.children)),
      children: [{ id, path: id.slice(1), ...definition }],
    },
  ] as never as AnyRouteDefinition[];
  const handler = createPageHandler({
    routeTree: routes,
    app: (state) => renderRoutes(state),
    nonce: "n0nce",
  });
  return { handler, path: id };
}

const get = (path: string): Request =>
  new Request(`https://example.com${path}`, {
    headers: { "user-agent": "Mozilla/5.0 Chrome/141.0.0.0" },
  });

describe("a streamed page", () => {
  test("renders a route whose loader answered synchronously in the shell, not in a template", async () => {
    const { handler, path } = page({
      loader: () => ({ name: "salama" }),
      component: (props: { data: () => { name: string } }) =>
        ssrHtml(`<main>${esc(props.data().name)}</main>`),
    });
    const body = await (await handler(get(path))).text();

    expect(body).toContain("<main>salama</main>");
    expect(body).not.toContain("<template");
  });

  test("answers 404 for a notFound() its loader threw before the shell flushed", async () => {
    const { handler, path } = page({
      loader: () => notFound("no such account"),
      component: (props: { data: () => unknown }) =>
        ssrHtml(`<main>${esc(String(props.data()))}</main>`),
      notFoundComponent: (props: { error: () => Error }) =>
        ssrHtml(`<p>${esc(props.error().message)}</p>`),
    });
    const response = await handler(get(path));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<p>no such account</p>");
  });

  test("answers a real redirect for a redirect() its loader threw before the shell flushed", async () => {
    const { handler, path } = page({
      loader: () => Promise.reject(redirect("/login")),
      component: () => ssrHtml("<main>never</main>"),
    });
    const response = await handler(get(path));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("writes a redirect that comes after the shell as a script carrying the nonce", async () => {
    const { handler, path } = page({
      loader: async () => {
        await tick();
        redirect("/login");
      },
      component: (props: { data: () => unknown }) =>
        ssrHtml(`<main>${esc(String(props.data()))}</main>`),
    });
    const error = spyOn(console, "error");
    let printed: unknown[][];
    let response: Response;
    let body: string;
    try {
      response = await handler(get(path));
      body = await response.text();
    } finally {
      printed = error.mock.calls.map((call) => [...call]);
      error.mockRestore();
    }

    expect(response.status).toBe(200);
    expect(body).toContain('<script nonce="n0nce">location.replace("/login")</script>');
    // The redirect is the page's answer, so nothing reports it as a failure.
    expect(printed).toEqual([]);
  });

  test("does not tell the route's onCatch about a redirect that comes after the shell", async () => {
    const caught: string[] = [];
    const { handler, path } = page({
      loader: async () => {
        await tick();
        redirect("/login");
      },
      component: (props: { data: () => unknown }) =>
        ssrHtml(`<main>${esc(String(props.data()))}</main>`),
      onCatch: (error: Error) => caught.push(error.message),
    });
    const body = await (await handler(get(path))).text();

    expect(body).toContain('<script nonce="n0nce">location.replace("/login")</script>');
    expect(caught).toEqual([]);
  });

  test("takes the status and headers the shell declared with httpStatus and httpHeader", async () => {
    const { handler, path } = page({
      component: () => {
        httpStatus(410, "Gone");
        httpHeader("cache-control", "no-store");
        return ssrHtml("<main>this page is gone</main>");
      },
    });
    const response = await handler(get(path));

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("reports a status declared after the shell and leaves the status alone", async () => {
    const { handler, path } = page({
      component: () => {
        const late = createMemo(async () => {
          await tick();
          return "salama";
        });
        return ssrHtml(
          `<main>${esc(
            ssrLoading({
              fallback: () => ssrHtml("<i>wait</i>"),
              children: () => {
                const value = late();
                httpStatus(500);
                return ssrHtml(`<b>${esc(value)}</b>`);
              },
            }),
          )}</main>`,
        );
      },
    });
    const capture = DEV.diagnostics.capture();
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    let printed: string[];
    let response: Response;
    let body: string;
    try {
      response = await handler(get(path));
      body = await response.text();
    } finally {
      printed = warn.mock.calls.map((call) => String(call[0]));
      warn.mockRestore();
    }
    const late = capture.stop().filter((event) => event.code === "LATE_HEADER_WRITE");
    // A development build prints the finding as well, once per distinct one.
    for (const line of printed) expect(line).toStartWith("[barq] LATE_HEADER_WRITE: ");

    expect(response.status).toBe(200);
    expect(body).toContain("<b>salama</b>");
    expect(late.map((event) => event.data?.call)).toEqual(
      DEV.diagnostics === undefined ? [] : ["httpStatus(500)"],
    );
  });
});
