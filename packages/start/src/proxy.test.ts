import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { proxyRequest } from "./proxy.ts";

interface EchoedRequest {
  method: string;
  body: string;
  headers: Record<string, string>;
}

let upstream: ReturnType<typeof Bun.serve>;
let base = "";

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/echo") {
        return Response.json({
          method: request.method,
          body: await request.text(),
          headers: Object.fromEntries(request.headers),
        });
      }
      if (url.pathname === "/sign-in") {
        return new Response(null, {
          status: 303,
          headers: { location: `${url.origin}/home?from=sign-in`, "set-cookie": "sid=1; Path=/" },
        });
      }
      if (url.pathname === "/away") {
        return new Response(null, { status: 302, headers: { location: "https://example.com/x" } });
      }
      if (url.pathname === "/zipped") {
        return new Response(gzipSync("compressed body"), {
          headers: { "content-encoding": "gzip", "content-type": "text/plain" },
        });
      }
      return new Response("missing", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${upstream.port}`;
});

afterAll(() => upstream.stop(true));

describe("proxyRequest", () => {
  test("forwards the method, the body and the headers, minus one connection's", async () => {
    const request = new Request("https://app.example.com/api/echo", {
      method: "POST",
      body: "salama",
      headers: {
        cookie: "sid=1",
        "accept-encoding": "zstd, br",
        connection: "keep-alive, x-private",
        "x-private": "hop",
        "x-kept": "yes",
      },
    });
    const response = await proxyRequest(request, `${base}/echo`, {
      headers: { authorization: "Bearer API_TOKEN" },
    });
    const seen = (await response.json()) as EchoedRequest;
    expect(seen.method).toBe("POST");
    expect(seen.body).toBe("salama");
    expect(seen.headers.cookie).toBe("sid=1");
    expect(seen.headers["x-kept"]).toBe("yes");
    expect(seen.headers.authorization).toBe("Bearer API_TOKEN");
    expect(seen.headers["x-private"]).toBeUndefined();
    // The runtime's own, naming what it can decode, rather than the client's.
    expect(seen.headers["accept-encoding"]).not.toBe("zstd, br");
    expect(seen.headers["x-forwarded-host"]).toBe("app.example.com");
    expect(seen.headers["x-forwarded-proto"]).toBe("https");
  });

  test("hands a redirect to the client with its cookies, pointed back through the proxy", async () => {
    const response = await proxyRequest(
      new Request("https://app.example.com/sign-in"),
      `${base}/sign-in`,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/home?from=sign-in");
    expect(response.headers.get("set-cookie")).toBe("sid=1; Path=/");

    const away = await proxyRequest(new Request("https://app.example.com/away"), `${base}/away`);
    expect(away.headers.get("location")).toBe("https://example.com/x");

    const mapped = await proxyRequest(
      new Request("https://app.example.com/sign-in"),
      `${base}/sign-in`,
      {
        location: (url) => `/api${url.pathname}`,
      },
    );
    expect(mapped.headers.get("location")).toBe("/api/home");
  });

  test("answers with a body fetch decoded, without the encoding that no longer describes it", async () => {
    const response = await proxyRequest(
      new Request("https://app.example.com/zipped"),
      `${base}/zipped`,
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe("compressed body");
  });

  test("passes the upstream's status through", async () => {
    const response = await proxyRequest(
      new Request("https://app.example.com/nope"),
      `${base}/nope`,
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("missing");
  });
});
