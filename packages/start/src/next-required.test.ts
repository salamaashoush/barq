/**
 * A middleware ends in `return next(...)`, answers with a result of its own, or
 * throws. Returning `undefined` is neither, and the call fails naming the step
 * rather than resolving to nothing.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import {
  type Middleware,
  NOT_FOUND,
  REDIRECT,
  clientRpc,
  createMiddleware,
  runRequestMiddleware,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";
import { besides, printedBy } from "../../server/src/test-console.ts";

afterEach(unmountAll);

const ORIGIN = "https://example.com";

const answering = (answer: unknown) => (id: string, chain: readonly Middleware[]) =>
  serverRpc<undefined, unknown>(
    { id },
    { validator: null, middleware: chain, handler: () => answer },
  );

const fnWith = answering("salama");

describe("a server middleware", () => {
  test("that never calls next() fails the call, naming itself and the function", async () => {
    const passes = createMiddleware().server(({ next }) => next());
    const forgets = createMiddleware().server(async function requireSession() {
      // A check that decided to let the call through and said nothing.
    });
    await expect(fnWith("notes.ts#list", [passes, forgets])()).rejects.toThrow(
      'The server middleware `requireSession` (2 of 2) around the server function "notes.ts#list" returned without calling `next()`',
    );
  });

  test("a bare closure is named by the binding it was declared as", async () => {
    const audit: Middleware = async () => undefined;
    await expect(fnWith("notes.ts#list", [audit])()).rejects.toThrow(
      "The server middleware `audit` (1 of 1)",
    );
  });

  test("an anonymous one is named by its place in the chain", async () => {
    await expect(
      fnWith("notes.ts#list", [createMiddleware().server(async () => undefined)])(),
    ).rejects.toThrow('The server middleware 1 of 1 around the server function "notes.ts#list"');
  });

  test("that calls next() and drops its result fails, rather than losing the result", async () => {
    const drops = createMiddleware().server(async function timing({ next }) {
      await next();
    });
    await expect(fnWith("notes.ts#list", [drops])()).rejects.toThrow(
      '`timing` (1 of 1) around the server function "notes.ts#list" called `next()` and returned `undefined` in place of its result',
    );
  });

  test("that returns next()'s undefined passes it on", async () => {
    let ran = false;
    const awaits = createMiddleware().server(async ({ next }) => {
      await next();
      ran = true;
    });
    expect(await answering(undefined)("notes.ts#ping", [awaits])()).toBeUndefined();
    expect(ran).toBe(true);
  });

  test("may answer with a result of its own, or a Response, without next()", async () => {
    const cached = createMiddleware().server(async () => "from the cache");
    expect(await fnWith("notes.ts#list", [cached])()).toBe("from the cache");

    const raw = createMiddleware().server(async () => new Response("raw", { status: 202 }));
    const answer = await fnWith("notes.ts#list", [raw])();
    expect(answer instanceof Response ? answer.status : answer).toBe(202);
  });

  test("that returns a redirect or a notFound() throws it as the answer", async () => {
    const away = { [REDIRECT]: true, to: "/sign-in", status: 302 };
    const gone = { [NOT_FOUND]: true, message: "not found" };
    await expect(
      fnWith("notes.ts#list", [createMiddleware().server(async () => away)])(),
    ).rejects.toBe(away);
    await expect(
      fnWith("notes.ts#list", [createMiddleware().server(async () => gone)])(),
    ).rejects.toBe(gone);
  });

  test("over the wire, the refusal is a 500 that does not reach the handler", async () => {
    let ran = false;
    mount(
      "notes.ts#guarded",
      serverRpc<undefined, string>(
        { id: "notes.ts#guarded" },
        {
          validator: null,
          middleware: [createMiddleware().server(async () => undefined)],
          handler: () => {
            ran = true;
            return "salama";
          },
        },
      ),
    );
    let response: Response | null | undefined;
    const printed = await printedBy(async () => {
      response = await handleServerFn(
        new Request(`${ORIGIN}/_barq/fn/${encodeURIComponent("notes.ts#guarded")}.data`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN },
          body: JSON.stringify({ input: encodeWire(undefined) }),
        }),
      );
    });
    expect(response?.status).toBe(500);
    expect(ran).toBe(false);
    const logged = besides(printed, "SERVER_FUNCTION_FAILED");
    expect(logged.map(([line]) => line)).toEqual([
      '[barq] The server function "notes.ts#guarded" threw, so the call answered 500 without the error\'s text. The error:',
    ]);
    expect(String((logged[0]?.[1] as Error | undefined)?.message)).toStartWith(
      '[barq] The server middleware 1 of 1 around the server function "notes.ts#guarded" returned without calling `next()`',
    );
  });
});

describe("a client middleware", () => {
  test("that never calls next() fails the call before anything is sent", async () => {
    let sent = false;
    const send = (async () => {
      sent = true;
      return Response.json(encodeWire("salama"));
    }) as unknown as typeof fetch;
    const silent = createMiddleware().client(async function traceCall() {});
    const call = clientRpc<undefined, string>("notes.ts#list", [silent]);
    await expect(call({ fetch: send })).rejects.toThrow(
      'The client middleware `traceCall` (1 of 1) around the server function "notes.ts#list" returned without calling `next()`',
    );
    expect(sent).toBe(false);
  });

  test("that returns next() reads the server's answer", async () => {
    const send = (async () => Response.json(encodeWire("salama"))) as unknown as typeof fetch;
    const passes = createMiddleware().client(({ next }) => next());
    const call = clientRpc<undefined, string>("notes.ts#list", [passes]);
    expect(await call({ fetch: send })).toBe("salama");
  });
});

describe("a request middleware", () => {
  const start = {
    request: new Request(`${ORIGIN}/api/notes`),
    pathname: "/api/notes",
    handlerType: "router" as const,
    context: {},
  };

  test("that never calls next() fails the request, naming itself and the request", async () => {
    const logging = createMiddleware({ type: "request" }).server(async function logging() {
      return undefined;
    });
    await expect(
      runRequestMiddleware([logging], { ...start, context: {} }, async () => new Response("ok")),
    ).rejects.toThrow(
      "The request middleware `logging` (1 of 1) on GET /api/notes returned without calling `next()`",
    );
  });

  test("may answer with a Response of its own, or pass on a handler that declined", async () => {
    const refuses = createMiddleware({ type: "request" }).server(
      async () => new Response("no", { status: 403 }),
    );
    const refused = await runRequestMiddleware([refuses], { ...start, context: {} }, async () =>
      Response.json("ok"),
    );
    expect(refused?.status).toBe(403);

    const passes = createMiddleware({ type: "request" }).server(({ next }) => next());
    expect(
      await runRequestMiddleware([passes], { ...start, context: {} }, async () => undefined),
    ).toBeUndefined();
  });
});
