/**
 * What a caller learns when a server function fails.
 *
 * Refused input is the caller's own, so every build says what was wrong with
 * it, field by field. A handler's own failure is the server's: production
 * answers with the status and nothing of the error, and only the development
 * server, by passing `revealError`, tells the caller what was thrown.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { DEV } from "@barqjs/core";

import { DATA_SUFFIX, RPC_PREFIX, ServerFnError, clientRpc, serverRpc } from "./index.ts";
import { type HandlerOptions, handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;
const realError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  unmountAll();
});

const through = (options?: HandlerOptions): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response = await handleServerFn(
      new Request(new URL(String(input), ORIGIN), { ...init, headers }),
      options,
    );
    return response ?? new Response("not found", { status: 404 });
  }) as typeof fetch;

const failing = (id: string): void =>
  mount(
    id,
    serverRpc<undefined, null>(
      { id },
      {
        validator: null,
        middleware: [],
        handler: () => {
          throw new TypeError("salama's order has no lines");
        },
      },
    ),
  );

const caught = async (call: () => Promise<unknown>): Promise<ServerFnError> =>
  (await call().catch((error: unknown) => error)) as ServerFnError;

describe("refused input", () => {
  test("names each issue and the path to its field, in every build", async () => {
    mount(
      "signup",
      serverRpc<unknown, null>(
        { id: "signup" },
        {
          validator: {
            "~standard": {
              version: 1,
              vendor: "test",
              validate: () => ({
                issues: [
                  { message: "must be an email address", path: ["contact", { key: "email" }] },
                  { message: "must be at least 8 characters", path: ["password"] },
                  { message: "is not accepted" },
                ],
              }),
            },
          },
          middleware: [],
          handler: () => null,
        },
      ),
    );
    globalThis.fetch = through();

    const error = await caught(() =>
      clientRpc<{ contact: { email: string } }, null>("signup")({
        data: { contact: { email: "salama" } },
      }),
    );
    expect(error).toBeInstanceOf(ServerFnError);
    expect(error.status).toBe(400);
    expect(error.issues).toEqual([
      { message: "must be an email address", path: ["contact", "email"] },
      { message: "must be at least 8 characters", path: ["password"] },
      { message: "is not accepted" },
    ]);
    expect(error.message).toBe(
      "The server function `signup` refused its input (400): `contact.email`: must be an email " +
        "address; `password`: must be at least 8 characters; is not accepted. `error.issues` " +
        "holds each issue with the path to its field.",
    );
    // A copy was read, so the answer itself is still the caller's to read.
    expect(error.response?.bodyUsed).toBe(false);
  });
});

describe("a handler that throws", () => {
  test("in production, answers with the status and nothing of the error", async () => {
    failing("order");
    console.error = () => {};
    globalThis.fetch = through();

    const error = await caught(() => clientRpc<undefined, null>("order")());
    expect(error.status).toBe(500);
    expect(error.thrown).toBeUndefined();
    expect(error.message).not.toContain("salama");
    expect(await error.response?.text()).toBe("internal server error");
  });

  test("on the development server, tells the caller what was thrown and where", async () => {
    failing("order");
    console.error = () => {};
    const revealed: unknown[] = [];
    globalThis.fetch = through({
      revealError: (error) => {
        revealed.push(error);
        const thrown = error as Error;
        return {
          name: thrown.name,
          message: thrown.message,
          stack: "TypeError: at /src/order.ts:4:11",
        };
      },
    });

    const error = await caught(() => clientRpc<undefined, null>("order")());
    expect(revealed).toHaveLength(1);
    expect(error.status).toBe(500);
    expect(error.thrown).toEqual({
      name: "TypeError",
      message: "salama's order has no lines",
      stack: "TypeError: at /src/order.ts:4:11",
    });
    expect(error.message).toStartWith(
      "The server function `order` threw `TypeError: salama's order has no lines` and answered 500. ",
    );
  });

  test("is reported on the diagnostics channel with the function's id", async () => {
    failing("order");
    console.error = () => {};
    const capture = DEV.diagnostics.capture();
    const response = await through()(`${RPC_PREFIX}order${DATA_SUFFIX}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const events = capture.stop().filter((event) => event.code === "SERVER_FUNCTION_FAILED");
    expect(response.status).toBe(500);
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toStartWith(
      'The server function "order" threw: `TypeError: salama\'s order has no lines`. The caller received a 500.',
    );
    expect(events[0]?.data?.id).toBe("order");
  });

  test("while streaming, the last line carries what was thrown only when revealed", async () => {
    mount(
      "feed",
      serverRpc<undefined, AsyncIterable<number>>(
        { id: "feed" },
        {
          validator: null,
          middleware: [],
          handler: async function* () {
            yield 1;
            throw new RangeError("salama's feed ran dry");
          },
        },
      ),
    );
    console.error = () => {};
    globalThis.fetch = through({
      revealError: (error) => ({ name: (error as Error).name, message: (error as Error).message }),
    });

    const values: number[] = [];
    const error = await caught(async () => {
      for await (const value of await clientRpc<undefined, AsyncIterable<number>>("feed")()) {
        values.push(value);
      }
    });
    expect(values).toEqual([1]);
    expect(error.thrown).toEqual({ name: "RangeError", message: "salama's feed ran dry" });
  });
});
