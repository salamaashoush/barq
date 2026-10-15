/**
 * URL rewrites, at the three places one applies: the history the client reads
 * and writes, the `href` a link shows, and the request the server matches.
 *
 * A locale prefix is the case throughout, because it is the one that has both
 * directions: `/en/about` has to MATCH `/about`, and a link to `/about` has to
 * SAY `/en/about`.
 */

import { html as ssrHtml } from "@barqjs/server";
import { describe, expect, test } from "bun:test";

import { linkAttrHref, linkHref } from "./components.ts";
import { redirect } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import { type LocationRewrite, composeRewrites, rewriteHistory, rewriteHref } from "./rewrite.ts";
import type { AnyRouteDefinition } from "./route.ts";
import { createRouter } from "./router.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

const locale = (prefix: string): LocationRewrite => ({
  input: ({ url }) => {
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
      url.pathname = url.pathname.slice(prefix.length) || "/";
    }
    return url;
  },
  output: ({ url }) => {
    url.pathname = `${prefix}${url.pathname === "/" ? "" : url.pathname}`;
    return url;
  },
});

const table = [
  { path: "/", component: (() => null) as never },
  { path: "/about", component: (() => null) as never },
  { path: "/posts/$id", component: (() => null) as never },
] as never as AnyRouteDefinition[];

describe("one rewrite over a path", () => {
  test("each direction maps the path and leaves the query and hash alone", () => {
    const en = locale("/en");
    expect(rewriteHref(en.input, "/en/about?x=1#top", "https://example.com")).toBe(
      "/about?x=1#top",
    );
    expect(rewriteHref(en.output, "/about?x=1#top", "https://example.com")).toBe(
      "/en/about?x=1#top",
    );
    expect(rewriteHref(en.input, "/en", "https://example.com")).toBe("/");
    expect(rewriteHref(en.output, "/", "https://example.com")).toBe("/en");
  });

  test("a rewrite may answer with a string, a URL, or nothing", () => {
    const origin = "https://example.com";
    expect(rewriteHref(() => "/elsewhere", "/x", origin)).toBe("/elsewhere");
    expect(rewriteHref(({ url }) => new URL("/other?y=2", url), "/x", origin)).toBe("/other?y=2");
    expect(rewriteHref(() => undefined, "/x?q=1", origin)).toBe("/x?q=1");
    expect(rewriteHref(undefined, "/x", origin)).toBe("/x");
  });

  test("a result on another origin comes back absolute", () => {
    expect(
      rewriteHref(() => "https://cdn.example.com/asset", "/asset", "https://example.com"),
    ).toBe("https://cdn.example.com/asset");
  });
});

describe("composeRewrites", () => {
  const tenant: LocationRewrite = {
    input: ({ url }) => {
      url.pathname = url.pathname.replace(/^\/t\/acme/, "") || "/";
      return url;
    },
    output: ({ url }) => {
      url.pathname = `/t/acme${url.pathname === "/" ? "" : url.pathname}`;
      return url;
    },
  };

  test("inputs run first to last and outputs last to first, so the pair round-trips", () => {
    const both = composeRewrites([tenant, locale("/en")]);
    const origin = "https://example.com";
    expect(rewriteHref(both.input, "/t/acme/en/about", origin)).toBe("/about");
    expect(rewriteHref(both.output, "/about", origin)).toBe("/t/acme/en/about");
  });

  test("a rewrite missing one direction is skipped in that direction", () => {
    const both = composeRewrites([{ input: locale("/en").input }, tenant]);
    const origin = "https://example.com";
    expect(rewriteHref(both.input, "/en/t/acme/about", origin)).toBe("/about");
    expect(rewriteHref(both.output, "/about", origin)).toBe("/t/acme/about");
  });
});

describe("a history seen through a rewrite", () => {
  test("locations are read through `input` and pushed through `output`", () => {
    const inner = memoryHistory({ initial: ["/en/about?x=1"] });
    const history = rewriteHistory(inner, locale("/en"), "https://example.com");
    expect(history.current().pathname).toBe("/about");
    expect(history.current().search).toBe("?x=1");

    const seen: string[] = [];
    history.subscribe((location, action) => seen.push(`${action} ${location.pathname}`));
    history.push("/posts/7", { state: { n: 1 } });
    expect(inner.current().pathname).toBe("/en/posts/7");
    expect(inner.current().state).toEqual({ n: 1 });
    expect(seen).toEqual(["push /posts/7"]);

    history.go(-1);
    expect(seen).toEqual(["push /posts/7", "pop /about"]);
    expect(history.depth?.()).toBe(0);
  });
});

describe("a router with a rewrite", () => {
  test("it matches the rewritten path and pushes the public one", async () => {
    const inner = memoryHistory({ initial: ["/en/about"] });
    const state = createRouter({
      routeTree: table,
      history: inner,
      rewrite: locale("/en"),
      origin: "https://example.com",
    });
    expect(state.location().pathname).toBe("/about");
    expect(state.match()?.route.id).toBe("/about");

    await state.navigate({ to: "/posts/$id", params: { id: "7" } });
    expect(state.location().pathname).toBe("/posts/7");
    expect(inner.current().pathname).toBe("/en/posts/7");
    state.dispose();
  });

  test("a link's href carries the rewrite, and the base outside it", () => {
    const state = createRouter({
      routeTree: table,
      history: memoryHistory({ initial: ["/"] }),
      rewrite: locale("/en"),
      basepath: "/app",
      origin: "https://example.com",
    });
    const to = linkHref(state, { to: "/posts/$id", params: { id: "7" } } as never);
    // Application space inside the router, the public spelling on the way out.
    expect(to).toBe("/posts/7");
    expect(linkAttrHref(state, to)).toBe("/app/en/posts/7");
    expect(linkAttrHref(state, "https://example.com/away")).toBe("https://example.com/away");
    state.dispose();
  });
});

describe("the page handler with a rewrite", () => {
  const document = ({ body, seed }: { body: string; seed: string }): string =>
    `<!doctype html><html><head><title>t</title></head><body>${body}${seed}</body></html>`;
  const get = (path: string): Request => new Request(`https://example.com${path}`);

  test("the request is matched after `input`, under the base", async () => {
    const handler = createPageHandler({
      routeTree: table,
      basepath: "/app",
      rewrite: locale("/en"),
      stream: false,
      app: () => ssrHtml("<main>ok</main>"),
      document,
    });
    expect((await handler(get("/app/en/about"))).status).toBe(200);
    expect((await handler(get("/app/en/posts/7"))).status).toBe(200);
    expect((await handler(get("/app/en/nope"))).status).toBe(404);
  });

  test("a rendered link says the public url, and the router sees the rewritten one", async () => {
    const seen: string[] = [];
    const handler = createPageHandler({
      routeTree: [
        {
          path: "/about",
          component: (() => ssrHtml("<main>about</main>")) as never,
          loader: ({ location }: { location: { pathname: string } }) => {
            seen.push(location.pathname);
            return null;
          },
        },
      ] as never,
      rewrite: locale("/en"),
      stream: false,
      app: (state) => {
        seen.push(linkAttrHref(state, "/about"));
        return renderRoutes(state);
      },
      document,
    });
    const response = await handler(get("/en/about"));
    expect(response.status).toBe(200);
    expect(seen).toContain("/en/about");
    expect(seen).toContain("/about");
  });

  test("an options-form redirect is resolved, and its Location is the public url", async () => {
    const handler = createPageHandler({
      routeTree: [
        {
          path: "/old/$id",
          component: (() => null) as never,
          beforeLoad: ({ params }: { params: { id: string } }) => {
            throw redirect({
              to: "/posts/$id",
              params: { id: params.id },
              statusCode: 301,
              headers: { "x-why": "moved" },
            });
          },
        },
        { path: "/posts/$id", component: (() => null) as never },
        {
          path: "/legacy",
          component: (() => null) as never,
          beforeLoad: () => redirect("/about"),
        },
      ] as never,
      basepath: "/app",
      rewrite: locale("/en"),
      stream: false,
      app: () => ssrHtml("<main>ok</main>"),
      document,
    });
    const moved = await handler(get("/app/en/old/7"));
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("/app/en/posts/7");
    expect(moved.headers.get("x-why")).toBe("moved");
    // The positional form is written as given, which is what it has always done.
    const legacy = await handler(get("/app/en/legacy"));
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get("location")).toBe("/about");
  });
});
