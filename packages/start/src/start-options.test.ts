/**
 * What `createStart` configures beside middleware: the serialization adapters
 * both sides encode with, and the `fetch` every call goes out through.
 */

import { afterEach, expect, test } from "bun:test";

import {
  clearSerializationAdapters,
  createSerializationAdapter,
  decodeWire,
  encodeWire,
} from "@barqjs/server/codec";

import {
  DATA_SUFFIX,
  RPC_PREFIX,
  clearStart,
  clientRpc,
  createMiddleware,
  createServerFn,
  createStart,
  startOptions,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";

afterEach(() => {
  unmountAll();
  clearStart();
  clearSerializationAdapters();
});

class Money {
  constructor(readonly cents: number) {}
  format(): string {
    return (this.cents / 100).toFixed(2);
  }
}

const money = createSerializationAdapter<Money, number>({
  key: "money",
  test: (value): value is Money => value instanceof Money,
  toSerializable: (value) => value.cents,
  fromSerializable: (cents) => new Money(cents),
});

test("the adapters it names carry a server function's result across the wire", async () => {
  createStart(() => ({ serializationAdapters: [money] }));
  const total = createServerFn({ strict: { output: false } }).handler(() => new Money(1250));
  mount("cart.ts#total", total);

  const response = await handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent("cart.ts#total")}${DATA_SUFFIX}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ input: encodeWire(undefined) }),
    }),
  );
  const answer = decodeWire<Money>(await response?.json());
  expect(answer).toBeInstanceOf(Money);
  expect(answer.format()).toBe("12.50");
});

test("they are installed when the options are first read, and not before", () => {
  let read = 0;
  createStart(() => {
    read += 1;
    return { serializationAdapters: [money] };
  });
  expect(read).toBe(0);
  expect(() => encodeWire(new Money(1))).toThrow();
  startOptions();
  startOptions();
  expect(read).toBe(1);
  expect(decodeWire<Money>(encodeWire(new Money(7))).cents).toBe(7);
});

test("`serverFns.fetch` carries every call, and a call's own `fetch` wins over it", async () => {
  const through: string[] = [];
  const recorded = (name: string): typeof fetch =>
    (async () => {
      through.push(name);
      return Response.json(encodeWire("salama"));
    }) as unknown as typeof fetch;
  createStart(() => ({ serverFns: { fetch: recorded("start") } }));
  const greet = clientRpc<undefined, string>("greet.ts#greet");

  expect(await greet()).toBe("salama");
  expect(await greet({ fetch: recorded("call") })).toBe("salama");
  const chosen = createMiddleware().client(({ next }) => next({ fetch: recorded("middleware") }));
  expect(await clientRpc<undefined, string>("greet.ts#greet", [chosen])()).toBe("salama");
  expect(through).toEqual(["start", "call", "middleware"]);
});
