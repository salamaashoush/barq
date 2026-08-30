/**
 * The two traps these helpers exist for, as gates.
 *
 * Both are properties of the ENVIRONMENT rather than of barq, which is why they
 * cost every suite the same afternoon: a `Request` you construct silently drops
 * a `Cookie`, and a `Response` happy-dom builds silently drops a `set-cookie`.
 * A test that hits either reads an empty session and blames the session code.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import {
  createServerFn,
  getCookie,
  getRequest,
  getRequestHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  useSession,
} from "@barqjs/start";

import { esc, html as ssrHtml } from "@barqjs/server";
import type { AnyRouteDefinition } from "@barqjs/router";
import { mount, unmountAll } from "@barqjs/start/server";

import { callServerFn, cookiesOf, runInRequest, ssrPage, testRequest } from "./server.ts";

const PASSWORD = "a-password-at-least-thirty-two-chars-long";

describe("testRequest carries what a server would receive", () => {
  /**
   * THE TRAP. `Cookie` is a forbidden header per the fetch spec and happy-dom
   * enforces it, so the constructor drops it without a word. A server receives
   * it off the wire and never constructs one.
   */
  test("a `Cookie` set through the constructor is dropped, which is why this helper exists", () => {
    const naive = new Request("http://localhost/", { headers: { cookie: "session=abc" } });
    expect(naive.headers.get("cookie")).toBeNull();

    const built = testRequest("/", { headers: { cookie: "session=abc" } });
    expect(built.headers.get("cookie")).toBe("session=abc");
  });

  test("`cookies` is the sugar, and it encodes values", () => {
    const request = testRequest("/", { cookies: { session: "a b", other: "x" } });
    expect(request.headers.get("cookie")).toBe("session=a%20b; other=x");
  });

  test("`Origin` and `Sec-` names travel too, because a CSRF check reads them", () => {
    const request = testRequest("/", {
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(request.headers.get("origin")).toBe("https://evil.example");
    expect(request.headers.get("sec-fetch-site")).toBe("cross-site");
  });

  test("an ordinary header still goes through the constructor", () => {
    const request = testRequest("/", { headers: { "x-thing": "1" }, method: "POST" });
    expect(request.headers.get("x-thing")).toBe("1");
    expect(request.method).toBe("POST");
  });

  test("a path is resolved against localhost, so a test need not write an origin", () => {
    expect(new URL(testRequest("/api/health").url).pathname).toBe("/api/health");
  });
});

describe("runInRequest makes the ambient context real", () => {
  test("`getRequest` and the request helpers answer", async () => {
    const run = await runInRequest(testRequest("/x", { headers: { "x-thing": "1" } }), () => ({
      path: new URL(getRequest().url).pathname,
      thing: getRequestHeader("x-thing"),
    }));
    expect(run.value).toEqual({ path: "/x", thing: "1" });
  });

  test("a cookie the request carried is readable", async () => {
    const run = await runInRequest(testRequest("/", { cookies: { theme: "dark" } }), () =>
      getCookie("theme"),
    );
    expect(run.value).toBe("dark");
  });

  /**
   * THE SECOND TRAP. `new Response(body, { headers })` drops every `set-cookie`
   * under happy-dom, so a test that builds one to inspect finds nothing. The
   * draft is where the handler actually wrote, and it is handed back for that
   * reason.
   */
  test("a `set-cookie` is readable on the draft, where a Response would lose it", async () => {
    const run = await runInRequest("/", () => {
      setCookie("session", "abc", { httpOnly: true, path: "/" });
    });

    expect(run.cookies).toHaveLength(1);
    expect(run.cookies[0]).toContain("session=abc");
    expect(run.cookies[0]).toContain("HttpOnly");
    expect(cookiesOf(run)).toEqual({ session: "abc" });

    // What the naive spelling does with the same header, so the reason this
    // helper returns a draft is visible rather than asserted.
    const naive = new Response(null, { headers: { "set-cookie": run.cookies[0] } });
    expect(naive.headers.getSetCookie()).toEqual([]);
  });

  test("`apply` puts the draft on a real response, cookies included", async () => {
    const run = await runInRequest("/", () => {
      setCookie("a", "1");
      setResponseHeader("x-thing", "2");
      setResponseStatus(201);
    });
    const response = run.apply();
    expect(response.status).toBe(201);
    expect(response.headers.get("x-thing")).toBe("2");
    expect(response.headers.getSetCookie().some((one) => one.startsWith("a=1"))).toBe(true);
  });

  test("the status the handler asked for is on the draft", async () => {
    const run = await runInRequest("/", () => setResponseStatus(404));
    expect(run.status).toBe(404);
  });
});

describe("a session round-trips, which is the whole point of the cookie trap", () => {
  test("what one request seals, the next request reads", async () => {
    const config = { password: PASSWORD, name: "sess" } as const;

    // Request one: log in.
    const login = await runInRequest("/login", async () => {
      const session = await useSession<{ user: string }>(config);
      // The RETURNED manager. `data` is `readonly` and `update` answers with a
      // new one, so the handle you already have is deliberately unchanged.
      const updated = await session.update({ user: "sashoush" });
      return updated.data;
    });
    expect(login.value).toEqual({ user: "sashoush" });
    const sealed = cookiesOf(login).sess;
    expect(sealed).toBeTruthy();

    // Request two: the browser sends it back. This is the step that silently
    // read an empty session before `testRequest` existed.
    const next = await runInRequest(testRequest("/me", { cookies: { sess: sealed } }), async () => {
      const session = await useSession<{ user: string }>(config);
      return session.data;
    });
    expect(next.value).toEqual({ user: "sashoush" });
  });

  test("a session cleared in one request does not come back in the next", async () => {
    const config = { password: PASSWORD, name: "sess" } as const;

    // Sealed by logging in, rather than by calling `sealSession` directly —
    // which takes `(config, session)` and is easy to write the other way round.
    const login = await runInRequest("/login", async () => {
      const session = await useSession<{ user: string }>(config);
      await session.update({ user: "sashoush" });
    });
    const sealed = cookiesOf(login).sess;

    const cleared = await runInRequest(
      testRequest("/out", { cookies: { sess: sealed } }),
      async () => {
        const session = await useSession<{ user: string }>(config);
        expect(session.data).toEqual({ user: "sashoush" });
        const gone = await session.clear();
        return gone.data;
      },
    );
    expect(cleared.value).toEqual({});

    // A server removes a cookie by setting an EXPIRED one; there is no other
    // way. So the clear is itself a `set-cookie`, and its value is empty.
    expect(cleared.cookies).toHaveLength(1);
    expect(cookiesOf(cleared).sess).toBe("");
  });
});

/**
 * The two paths nothing drove: a whole document out of `createPageHandler`, and
 * a server function over its own HTTP endpoint.
 */
describe("ssrPage renders a whole document", () => {
  const table: AnyRouteDefinition[] = [
    {
      path: "/",
      // `(scope, props)`, because this shell is hand-written: the compiler
      // prepends the scope for a component it lowers, and `children` is a BLOCK
      // rather than a value. Authored `(props)`, `children` is the scope and the
      // body renders empty with no error at all.
      shellComponent: (_scope: unknown, props: { children: () => unknown }) =>
        ssrHtml(`<html><head><title>t</title></head><body>${esc(props.children())}</body></html>`),
      component: () => ssrHtml("<main>home</main>"),
    },
    {
      path: "/greet",
      loader: async () => {
        await Promise.resolve();
        return "Ada";
      },
      component: (_s: unknown, props: { data: () => unknown }) =>
        ssrHtml(`<main>hello ${esc(String(props.data()))}</main>`),
    },
  ] as never;

  test("answers the markup, the status and the headers together", async () => {
    const page = await ssrPage("/", { routeTree: table });

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    // The DOCUMENT, not the app's fragment: the shell is part of what the
    // handler produces and a test that only saw the fragment could not tell a
    // missing `<Scripts />` from a present one.
    expect(page.html).toStartWith("<!doctype html>");
    expect(page.container.querySelector("main")?.textContent).toBe("home");
  });

  test("a miss is 404 with the page still rendered", async () => {
    const page = await ssrPage("/nothing", { routeTree: table });
    expect(page.status).toBe(404);
  });

  test("a table with no shell renders through the default app", async () => {
    // `app` is only consulted when no root route declares a `shellComponent`:
    // `renderShell` calls `renderRoutes` itself. So this is the one arrangement
    // that proves the default is the framework's own renderer and not a stub.
    const page = await ssrPage("/bare", {
      routeTree: [{ path: "/bare", component: () => ssrHtml("<main>bare</main>") }] as never,
      document: ({ body }: { body: string }) => `<html><body>${body}</body></html>`,
    });
    expect(page.container.querySelector("main")?.textContent).toBe("bare");
  });

  test("a loader's value is IN the markup, not fetched again by the client", async () => {
    // The assertion that catches a page which rendered its pending state and
    // called itself server-rendered.
    const page = await ssrPage("/greet", { routeTree: table });
    expect(page.container.querySelector("main")?.textContent).toBe("hello Ada");
  });
});

describe("callServerFn goes over the wire", () => {
  const id = "src/data.ts#greet";

  // The registry is module state and `mount` refuses a duplicate id, so each
  // test starts from an empty one. `unmountAll` is the seam that exists for it.
  beforeEach(() => {
    unmountAll();
  });

  test("POSTs the input and decodes the answer", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(({ data }: { data: unknown }) => ({ hello: data, at: new Date(0) })),
    );
    const call = await callServerFn<{ hello: unknown; at: Date }>({ id, input: "Ada" });

    expect(call.status).toBe(200);
    expect(call.value?.hello).toBe("Ada");
    // Through the same codec the client uses, so a `Date` survives as a `Date`
    // rather than as the string `JSON.stringify` would have made of it.
    expect(call.value?.at).toBeInstanceOf(Date);
  });

  test("refuses anything but POST", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(() => "ok"),
    );
    const call = await callServerFn({ id, method: "GET" });
    // A server function reachable by navigation is a one-click mutation
    // carrying SameSite=Lax cookies.
    expect(call.status).toBe(405);
    expect(call.response.headers.get("allow")).toBe("POST");
  });

  test("refuses a cross-origin caller", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(() => "ok"),
    );
    const call = await callServerFn({ id, input: 1, origin: "https://evil.example" });
    expect(call.status).toBe(403);
  });

  test("allows an origin the handler was told about", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(() => "ok"),
    );
    const call = await callServerFn({
      id,
      origin: "https://trusted.example",
      allowedOrigins: ["https://trusted.example"],
    });
    expect(call.status).toBe(200);
  });

  test("an unreachable id is indistinguishable from an unknown one", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(() => "ok"),
    );
    const unreachable = await callServerFn({ id, reachable: () => false });
    const unknown = await callServerFn({ id: "src/nowhere.ts#nope" });

    expect(unreachable.status).toBe(404);
    expect(unknown.status).toBe(404);
  });

  test("a FormData body takes the no-JS channel", async () => {
    let seen: unknown;
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(({ data }: { data: unknown }) => {
          seen = data;
          return "ok";
        }),
    );

    const form = new FormData();
    form.set("name", "Ada");
    const call = await callServerFn({ id, form });

    // 303 and not a value: the browser goes back where it came from, which is
    // what makes the no-JS path a round trip rather than a dead end.
    expect(call.status).toBe(303);
    // `data` is a real `FormData`, not an object the value codec made of one.
    // The same function seeing two input types depending on whether JS ran is
    // the divergence progressive enhancement exists to prevent.
    expect(seen).toBeInstanceOf(FormData);
    expect((seen as FormData).get("name")).toBe("Ada");
  });

  test("a set-cookie written by the handler survives to the response", async () => {
    mount(
      id,
      createServerFn()
        .validator("unchecked")
        .handler(() => {
          setCookie("session", "abc", { path: "/" });
          return "ok";
        }),
    );

    const call = await callServerFn({ id });
    expect(call.cookies.some((line) => line.startsWith("session=abc"))).toBe(true);
  });
});
