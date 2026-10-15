/**
 * What `.validator()` / `.inputValidator()` accept, and that each form's
 * output is what the handler is handed.
 */

import { afterEach, expect, test } from "bun:test";

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { RPC_PREFIX, type ServerFn, createMiddleware, createServerFn } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";

afterEach(unmountAll);

const send = (id: string, input: unknown): Promise<Response | null> =>
  handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}${id}.data`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ input: encodeWire(input) }),
    }),
  );

const mounted = (id: string, fn: ServerFn<never, unknown>): void => mount(id, fn);

/** What a call answered with, off the wire. */
const answerOf = async (response: Response | null): Promise<unknown> =>
  decodeWire(await response?.json());

const positive = (input: unknown): number => {
  if (typeof input !== "number" || input <= 0) throw new Error("must be a positive number");
  return input;
};

test("a function validator's return is the handler's data, and its throw is a 400", async () => {
  const double = createServerFn({ method: "POST" })
    .inputValidator(positive)
    .handler(({ data }) => {
      const typed: number = data;
      return typed * 2;
    });
  mounted("double", double);

  expect(await answerOf(await send("double", 21))).toBe(42);
  const refused = await send("double", -1);
  expect(refused?.status).toBe(400);
  // The validator's message is about the caller's own input, so it is the issue.
  const body = (await refused?.json()) as { issues: unknown } | undefined;
  expect(body?.issues).toEqual([{ message: "must be a positive number" }]);
});

test("an object with parse is accepted, synchronous or not", async () => {
  const schema = {
    parse: async (input: unknown): Promise<{ name: string }> => {
      const name = (input as { name?: unknown } | null)?.name;
      if (typeof name !== "string") throw new TypeError("name is required");
      return { name: name.trim() };
    },
  };
  const greet = createServerFn({ method: "POST" })
    .validator(schema)
    .handler(({ data }) => `hello ${data.name}`);
  mounted("greet", greet);

  expect(await answerOf(await send("greet", { name: " salama " }))).toBe("hello salama");
  expect((await send("greet", {}))?.status).toBe(400);
});

test("a Standard Schema is used as it stands", async () => {
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: (value: unknown): { value: number } | { issues: readonly unknown[] } =>
        typeof value === "string" ? { value: value.length } : { issues: [{ message: "no" }] },
    },
  };
  const measure = createServerFn({ method: "POST" })
    .inputValidator(schema)
    .handler(({ data }) => data + 1);
  mounted("measure", measure);

  expect(await answerOf(await send("measure", "four"))).toBe(5);
  expect((await send("measure", 4))?.status).toBe(400);
});

test("a validator that throws a Response refuses with that response", async () => {
  const gate = createServerFn({ method: "POST" })
    .inputValidator((): never => {
      throw new Response("locked", { status: 423 });
    })
    .handler(() => null);
  mounted("gate", gate);
  expect((await send("gate", 1))?.status).toBe(423);
});

test("a middleware's inputValidator takes the same three forms", async () => {
  const normalise = createMiddleware({ type: "function" })
    .inputValidator((input: unknown) => String(input).toUpperCase())
    .server(({ next }) => next());
  const shout = createServerFn({ method: "POST" })
    .middleware([normalise])
    .handler(({ data }) => data);
  mounted("shout", shout);
  expect(await answerOf(await send("shout", "quiet"))).toBe("QUIET");
});

test("FormData reaches a validated function as FormData", async () => {
  const fromForm = (input: unknown): { title: string } => {
    if (!(input instanceof FormData)) throw new TypeError("a form is required");
    return { title: String(input.get("title")) };
  };
  const save = createServerFn({ method: "POST" })
    .inputValidator(fromForm)
    .handler(({ data }) => data.title);
  mounted("save", save);

  const form = new FormData();
  form.set("title", "first post");
  const response = await handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}save.data`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: form,
    }),
  );
  expect(await answerOf(response)).toBe("first post");
  expect((await send("save", { title: "not a form" }))?.status).toBe(400);
});

test("a function's url is where a form posts to reach it, once it is mounted", () => {
  const save = createServerFn({ method: "POST" }).handler(() => null);
  expect(save.url).toBe("");
  mounted("src/posts.ts#save", save);
  expect(save.url).toBe(`${RPC_PREFIX}src%2Fposts.ts%23save`);
});

test("a schema that is also callable is read as a schema", async () => {
  // arktype's shape: the type is a function that RETURNS its errors rather than
  // throwing them, and a Standard Schema besides. Called as a function, a
  // failure would reach the handler as data.
  const errors = { summary: "must be a number" };
  const schema = Object.assign((input: unknown) => (typeof input === "number" ? input : errors), {
    "~standard": {
      version: 1 as const,
      vendor: "callable",
      validate: (value: unknown): { value: number } | { issues: readonly unknown[] } =>
        typeof value === "number" ? { value } : { issues: [{ message: "not a number" }] },
    },
  });
  let handled: unknown = "never ran";
  const square = createServerFn({ method: "POST" })
    .validator(schema)
    .handler(({ data }) => {
      handled = data;
      const typed: number = data;
      return typed * typed;
    });
  mounted("square", square);

  expect(await answerOf(await send("square", 3))).toBe(9);
  expect((await send("square", "three"))?.status).toBe(400);
  expect(handled).toBe(3);
});
