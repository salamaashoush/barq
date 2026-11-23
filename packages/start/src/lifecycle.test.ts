import { describe, expect, test } from "bun:test";
import { headerMiddleware, headersFor, runSetups } from "./lifecycle.ts";
import { serveBarq } from "./serve.ts";

describe("header rules", () => {
  const find = headersFor({
    "/pyodide/**": { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" },
    "/pyodide/v1/*": { "cache-control": "immutable" },
    "/robots.txt": { "x-exact": "yes" },
  });

  test("match a directory, one segment and an exact path, the later rule winning a name", () => {
    expect(find("/pyodide/v1/lib.wasm")).toEqual([
      ["access-control-allow-origin", "*"],
      ["cache-control", "immutable"],
    ]);
    expect(find("/pyodide/v1/deep/lib.wasm")).toEqual([
      ["access-control-allow-origin", "*"],
      ["cache-control", "public, max-age=60"],
    ]);
    expect(find("/robots.txt")).toEqual([["x-exact", "yes"]]);
    expect(find("/robots.txt.bak")).toEqual([]);
    expect(find("/pyodidex/a")).toEqual([]);
  });

  test("reach a response whose headers are immutable", async () => {
    const middleware = headerMiddleware({ "/away": { "x-rule": "1" } });
    const response = await middleware(new Request("http://localhost/away"), () =>
      Response.redirect("http://localhost/elsewhere", 302),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("x-rule")).toBe("1");
    expect(response.headers.get("location")).toBe("http://localhost/elsewhere");
  });
});

describe("server setup", () => {
  test("runs each setup in order, and closes them in reverse", async () => {
    const order: string[] = [];
    const close = await runSetups([
      async ({ onClose }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("first");
        onClose(() => void order.push("close first"));
      },
      ({ onClose }) => {
        order.push("second");
        onClose(() => void order.push("close second"));
      },
    ]);
    expect(order).toEqual(["first", "second"]);
    await close();
    expect(order).toEqual(["first", "second", "close second", "close first"]);
  });

  test("runs before serveBarq takes a request, and closes with the server", async () => {
    const order: string[] = [];
    const server = await serveBarq({
      port: 0,
      hostname: "127.0.0.1",
      silent: true,
      headers: { "/**": { "x-served": "barq" } },
      setup: [
        ({ onClose }) => {
          order.push("setup");
          onClose(() => void order.push("closed"));
        },
      ],
      fetch: () => {
        order.push("request");
        return new Response("ok");
      },
    });
    await server.ready();
    const response = await fetch(server.url!);
    expect(response.headers.get("x-served")).toBe("barq");
    await server.close(true);
    expect(order).toEqual(["setup", "request", "closed"]);
  });
});

describe("around", () => {
  test("wraps server functions and pages alike, with the request it is handed", async () => {
    const { createFetchHandler } = await import("./serve.ts");
    const seen: string[] = [];
    const handler = createFetchHandler({
      fetch: (request) => {
        seen.push(`page ${request.headers.get("cookie") ?? "none"}`);
        return new Response("page");
      },
      around: async (request, next) => {
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        const response = await next(new Request(request, { headers }));
        const out = new Response(response.body, response);
        out.headers.set("x-around", "1");
        return out;
      },
    });
    const page = await handler(
      new Request("http://localhost/about", {
        // A second header, because Bun 1.4 builds `new Request(request, { headers })`
        // with the ORIGINAL headers when the replacement is empty.
        headers: { cookie: "sid=1", accept: "text/html" },
      }),
    );
    expect(page.headers.get("x-around")).toBe("1");
    expect(seen).toEqual(["page none"]);

    const call = await handler(new Request("http://localhost/_barq/fn/missing.data"));
    expect(call.headers.get("x-around")).toBe("1");
    expect(seen).toEqual(["page none"]);
  });
});
