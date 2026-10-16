/**
 * The response-head lifecycle a handler on `@barqjs/server` runs: the event it
 * builds, the two exits a response leaves through, and the middleware it
 * composes around them.
 */

import {
  DEV,
  createMemo,
  createRoot,
  getRequestEvent,
  httpHeader,
  httpStatus,
  onCleanup,
} from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";

import {
  commitEventResponse,
  composeMiddleware,
  createRequestEvent,
  createResponseStub,
  createSSRResponse,
  getExpectedRedirectStatus,
} from "./index.ts";
import { renderToStream, renderToString } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";
import { provideRequestEvent } from "./storage.ts";

const request = (path = "/account"): Request => new Request(`https://example.com${path}`);

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  clearHydrationData();
});

describe("createRequestEvent", () => {
  test("is the request, an empty locals bag and an open head, with init over them", () => {
    const given = request();
    const event = createRequestEvent(given, { nonce: "n0nce" });

    expect(event.request).toBe(given);
    expect(event.locals).toEqual({});
    expect(event.response.committed).toBe(false);
    expect([...event.response.headers]).toEqual([]);
    expect(event.nonce).toBe("n0nce");
    expect(createRequestEvent(given).response).not.toBe(event.response);
  });

  test("keeps a head handed to it", () => {
    const response = createResponseStub();
    expect(createRequestEvent(request(), { response }).response).toBe(response);
  });
});

describe("createSSRResponse over a string", () => {
  test("derives the head from what the render declared, and commits it", () => {
    const event = createRequestEvent(request());
    const markup = provideRequestEvent(event, () =>
      renderToString(() => {
        httpStatus(404);
        httpHeader("cache-control", "no-store");
        httpHeader("set-cookie", "a=1; Path=/", { append: true });
        httpHeader("set-cookie", "b=2; Path=/", { append: true });
        return html("<h1>gone</h1>");
      }),
    );
    const response = createSSRResponse(markup, event, {
      responseInit: { headers: { "x-from-init": "1", "content-length": "3" } },
      transformChunk: (chunk) => `<!DOCTYPE html>${chunk}`,
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(response.headers.get("x-from-init")).toBe("1");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(event.response.committed).toBe(true);
    return response.text().then((body) => expect(body).toBe("<!DOCTYPE html><h1>gone</h1>"));
  });

  test("answers a Location on the head with a bodiless redirect at the head's redirect status", async () => {
    const event = createRequestEvent(request());
    event.response.status = 301;
    event.response.headers.set("location", "/signin");
    event.response.headers.append("set-cookie", "session=; Max-Age=0");
    const response = createSSRResponse("<p>page</p>", event);

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/signin");
    expect(response.headers.getSetCookie()).toEqual(["session=; Max-Age=0"]);
    expect(await response.text()).toBe("");
  });

  test("a page status is not a redirect status", () => {
    const stub = createResponseStub();
    stub.status = 404;
    expect(getExpectedRedirectStatus(stub)).toBe(302);
    stub.status = 307;
    expect(getExpectedRedirectStatus(stub)).toBe(307);
  });
});

function slowPage(release: Promise<void>, late?: () => void): () => unknown {
  return () => {
    httpStatus(201);
    return html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html("<i>wait</i>"),
          children: () => {
            const value = createMemo(async () => {
              await release;
              late?.();
              return "salama";
            });
            return html(`<b>${esc(value())}</b>`);
          },
        }),
      )}</main>`,
    );
  };
}

describe("createSSRResponse over a stream", () => {
  test("answers when the shell flushes, with the head committed there", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const event = createRequestEvent(request());
    const capture = DEV.diagnostics.capture();
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream(slowPage(released, () => httpHeader("x-late", "1")) as never),
        event,
      ),
    );

    expect(response.status).toBe(201);
    expect(event.response.committed).toBe(true);
    release();
    const body = await response.text();
    const late = capture.stop().filter((found) => found.code === "LATE_HEADER_WRITE");

    expect(body).toContain("<i>wait</i>");
    expect(body).toContain("salama");
    expect(response.headers.get("x-late")).toBeNull();
    expect(late.map((found) => found.data?.call)).toEqual(['httpHeader("x-late")']);
  });

  test("a Location before the flush is a real redirect, and the render is torn down", async () => {
    let cleaned = false;
    const event = createRequestEvent(request());
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream((() => {
          event.response.headers.set("location", "/elsewhere");
          onCleanup(() => {
            cleaned = true;
          });
          return slowPage(new Promise<void>(() => {}))();
        }) as never),
        event,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
    expect(response.body).toBeNull();
    await tick();
    expect(cleaned).toBe(true);
  });

  test("a Location after the flush ends the stream with a script carrying the nonce", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const event = createRequestEvent(request());
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream(
          slowPage(released, () =>
            event.response.headers.set("location", "/next?a=1&b=</x>"),
          ) as never,
        ),
        event,
        { nonce: "abc" },
      ),
    );
    expect(response.status).toBe(201);
    release();
    const body = await response.text();

    expect(body).toEndWith(`<script nonce="abc">window.location="/next?a=1&b=\\u003c/x>"</script>`);
  });

  test("a body the consumer cancels stops the render", async () => {
    let cleaned = false;
    const event = createRequestEvent(request());
    const response = await provideRequestEvent(event, () =>
      createSSRResponse(
        renderToStream((() => {
          onCleanup(() => {
            cleaned = true;
          });
          return slowPage(new Promise<void>(() => {}))();
        }) as never),
        event,
      ),
    );
    await response.body?.cancel();
    await tick();

    expect(cleaned).toBe(true);
  });
});

describe("commitEventResponse", () => {
  test("folds the head onto a response that did not derive its own, and commits it", () => {
    const event = createRequestEvent(request());
    event.response.status = 500;
    event.response.headers.append("set-cookie", "session=salama; Path=/");
    event.response.headers.set("x-request-id", "r1");
    event.response.headers.set("cache-control", "no-store");
    event.response.headers.set("location", "/stray");
    const answered = new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "max-age=60" },
    });
    const response = commitEventResponse(answered, event);

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(["session=salama; Path=/"]);
    expect(response.headers.get("x-request-id")).toBe("r1");
    expect(response.headers.get("cache-control")).toBe("max-age=60");
    expect(response.headers.get("location")).toBeNull();
    expect(event.response.committed).toBe(true);
    expect(commitEventResponse(answered, event)).toBe(answered);
  });

  test("never writes into a response the application holds, so one visitor's cookie is not the next one's", () => {
    const shared = new Response(null, { status: 204 });
    const first = createRequestEvent(request());
    first.response.headers.append("set-cookie", "session=first; Path=/");
    const second = createRequestEvent(request());
    second.response.headers.append("set-cookie", "session=second; Path=/");

    const toFirst = commitEventResponse(shared, first);
    const toSecond = commitEventResponse(shared, second);

    expect(shared.headers.getSetCookie()).toEqual([]);
    expect(toFirst.headers.getSetCookie()).toEqual(["session=first; Path=/"]);
    expect(toSecond.headers.getSetCookie()).toEqual(["session=second; Path=/"]);
  });

  test("a write to the head after it was committed reaches nothing and is reported", () => {
    const event = createRequestEvent(request());
    commitEventResponse(new Response("ok"), event);
    const capture = DEV.diagnostics.capture();
    event.response.headers.set("x-late", "1");
    const found = capture.stop().filter((one) => one.code === "LATE_HEADER_WRITE");

    expect(event.response.headers.has("x-late")).toBe(false);
    expect(found.map((one) => one.data?.call)).toEqual(['headers.set("x-late")']);
  });

  test("defaults to the event of the request it runs in", () => {
    const event = createRequestEvent(request());
    event.response.headers.set("x-ambient", "1");
    const response = provideRequestEvent(event, () => commitEventResponse(new Response("ok")));

    expect(response.headers.get("x-ambient")).toBe("1");
  });
});

describe("composeMiddleware", () => {
  test("runs each middleware in order around the handler, inside the request", async () => {
    const order: string[] = [];
    const run = composeMiddleware([
      async (incoming, next) => {
        order.push(`a ${new URL(incoming.url).pathname}`);
        getRequestEvent()!.locals.user = "salama";
        const response = await next();
        response.headers.set("x-served-by", "barq");
        return response;
      },
      (incoming, next) => {
        order.push(`b ${new URL(incoming.url).pathname}`);
        return next(new Request("https://example.com/rewritten"));
      },
    ]);
    const event = createRequestEvent(request("/start"));
    const response = await provideRequestEvent(event, () =>
      run(event.request, (incoming) => {
        order.push(
          `handler ${new URL(incoming.url).pathname} ${String(getRequestEvent()?.locals.user)}`,
        );
        return new Response("done");
      }),
    );

    expect(order).toEqual(["a /start", "b /start", "handler /rewritten salama"]);
    expect(response.headers.get("x-served-by")).toBe("barq");
    expect(await response.text()).toBe("done");
  });

  test("refuses a middleware that calls next twice", async () => {
    const run = composeMiddleware([
      async (_, next) => {
        await next();
        return next();
      },
    ]);

    expect(run(request(), () => new Response("x"))).rejects.toThrow("`next()` was called twice");
  });

  test("a middleware that answers itself never reaches the handler", async () => {
    let reached = false;
    const run = composeMiddleware([() => new Response("refused", { status: 401 })]);
    const response = await run(request(), () => {
      reached = true;
      return new Response("x");
    });

    expect(response.status).toBe(401);
    expect(reached).toBe(false);
  });
});

describe("a completed render's declarations", () => {
  test("survive the render's disposal, from renderToString", () => {
    const event = createRequestEvent(request());
    provideRequestEvent(event, () =>
      renderToString(() => {
        httpStatus(404);
        httpHeader("x-page", "missing");
        return html("<p>not here</p>");
      }),
    );

    expect(event.response.status).toBe(404);
    expect(event.response.headers.get("x-page")).toBe("missing");
  });

  test("survive the render's disposal, from an awaited renderToStream", async () => {
    const event = createRequestEvent(request());
    const markup = await provideRequestEvent(event, () =>
      renderToStream(slowPage(Promise.resolve()) as never),
    );

    expect(markup).toContain("salama");
    expect(event.response.status).toBe(201);
  });

  test("go with a render that threw", () => {
    const event = createRequestEvent(request());
    expect(() =>
      provideRequestEvent(event, () =>
        renderToString(() => {
          httpStatus(418);
          throw new Error("broken shell");
        }),
      ),
    ).toThrow("broken shell");

    expect(event.response.status).toBeUndefined();
  });
});

describe("httpStatus and httpHeader retraction", () => {
  test("is per declaration, whatever order sibling scopes dispose in", () => {
    const event = createRequestEvent(request());
    event.response.headers.append("set-cookie", "base=1");
    provideRequestEvent(event, () => {
      const earlier = createRoot((dispose) => {
        httpStatus(500);
        httpHeader("set-cookie", "csrf=1", { append: true });
        return dispose;
      });
      const later = createRoot((dispose) => {
        httpStatus(404);
        httpHeader("set-cookie", "session=salama", { append: true });
        return dispose;
      });
      earlier();
      expect(event.response.status).toBe(404);
      expect(event.response.headers.getSetCookie()).toEqual(["base=1", "session=salama"]);
      later();
    });

    expect(event.response.status).toBeUndefined();
    expect(event.response.headers.getSetCookie()).toEqual(["base=1"]);
  });
});
