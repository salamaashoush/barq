/**
 * A server function that answers over time: an async generator, or a
 * `ReadableStream` of values, read in the browser as an async iterable of the
 * same values with their types intact.
 */

import { afterEach, expect, test } from "bun:test";

import {
  RPC_CONTROL,
  RPC_PREFIX,
  type ServerFn,
  ServerFnError,
  clientRpc,
  createMiddleware,
  createServerFn,
  getRequest,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;
const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

const throughHandler = (seen?: Response[]): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response =
      (await handleServerFn(new Request(new URL(String(input), ORIGIN), { ...init, headers }))) ??
      new Response("not found", { status: 404 });
    seen?.push(response);
    return response;
  }) as typeof fetch;
};

const mounted = (id: string, fn: ServerFn<never, unknown>): void => mount(id, fn);

interface Tick {
  readonly n: number;
  readonly at: Date;
}

test("an async generator's values arrive one by one, typed, as they are yielded", async () => {
  const ticks = createServerFn({ method: "POST" }).handler(
    async function* (): AsyncGenerator<Tick> {
      for (let n = 1; n <= 3; n++) {
        await tick(2);
        yield { n, at: new Date(n * 1000) };
      }
    },
  );
  mounted("ticks", ticks);
  const seen: Response[] = [];
  throughHandler(seen);

  const received: Tick[] = [];
  const stream = await clientRpc<undefined, AsyncIterableIterator<Tick>>("ticks")();
  for await (const each of stream) received.push(each);

  expect(received.map((each) => each.n)).toEqual([1, 2, 3]);
  expect(received[0]?.at).toBeInstanceOf(Date);
  expect(seen[0]?.headers.get(RPC_CONTROL)).toBe("stream");
});

test("a ReadableStream of values is read the same way", async () => {
  const words = createServerFn({ method: "POST" }).handler(
    () =>
      new ReadableStream<string>({
        start(controller) {
          for (const word of ["fine", "grained"]) controller.enqueue(word);
          controller.close();
        },
      }),
  );
  mounted("words", words);
  throughHandler();

  const received: string[] = [];
  for await (const word of await clientRpc<undefined, AsyncIterableIterator<string>>("words")()) {
    received.push(word);
  }
  expect(received).toEqual(["fine", "grained"]);
});

test("called in process, the same function hands back an async iterable too", async () => {
  const words = createServerFn({ method: "POST" }).handler(
    () =>
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue("direct");
          controller.close();
        },
      }),
  );
  const received: string[] = [];
  for await (const word of await words()) received.push(word);
  expect(received).toEqual(["direct"]);
});

test("the generator still runs inside its request after the first value has gone", async () => {
  const who = createServerFn({ method: "POST" }).handler(
    async function* (): AsyncGenerator<string> {
      yield "first";
      await tick(2);
      yield getRequest().headers.get("x-visitor") ?? "nobody";
    },
  );
  mounted("who", who);
  throughHandler();

  const received: string[] = [];
  const stream = await clientRpc<undefined, AsyncIterableIterator<string>>("who")({
    headers: { "x-visitor": "salama" },
  });
  for await (const each of stream) received.push(each);
  expect(received).toEqual(["first", "salama"]);
});

test("a reader that stops early stops the generator", async () => {
  let cleaned = false;
  let produced = 0;
  const endless = createServerFn({ method: "POST" }).handler(
    async function* (): AsyncGenerator<number> {
      try {
        for (;;) {
          await tick(1);
          yield ++produced;
        }
      } finally {
        cleaned = true;
      }
    },
  );
  mounted("endless", endless);
  throughHandler();

  for await (const n of await clientRpc<undefined, AsyncIterableIterator<number>>("endless")()) {
    if (n === 2) break;
  }
  await tick(20);
  expect(cleaned).toBe(true);
  expect(produced).toBeLessThan(10);
});

test("a failure part way through reaches the reader as a failure, without the handler's message", async () => {
  const flaky = createServerFn({ method: "POST" }).handler(
    async function* (): AsyncGenerator<number> {
      yield 1;
      throw new Error("column users.secret does not exist");
    },
  );
  mounted("flaky", flaky);
  throughHandler();

  const received: number[] = [];
  let failure: unknown;
  try {
    for await (const n of await clientRpc<undefined, AsyncIterableIterator<number>>("flaky")()) {
      received.push(n);
    }
  } catch (error) {
    failure = error;
  }
  expect(received).toEqual([1]);
  expect(failure).toBeInstanceOf(ServerFnError);
  expect((failure as Error).message).not.toContain("secret");
});

test("a middleware refuses a streaming function before anything is sent", async () => {
  let started = false;
  const guard = createMiddleware({ type: "function" }).server(() => {
    throw new Response("sign in first", { status: 401 });
  });
  const guarded = createServerFn({ method: "POST" })
    .middleware([guard])
    .handler(async function* (): AsyncGenerator<number> {
      started = true;
      yield 1;
    });
  mounted("guarded", guarded);

  const response = await handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}guarded.data`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: "{}",
    }),
  );
  expect(response?.status).toBe(401);
  expect(started).toBe(false);
});
