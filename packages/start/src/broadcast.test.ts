/**
 * `createServerFn({ broadcast: true })`: a live answer that is the same for
 * every caller with the same arguments, rendered once and read by every
 * connection asking for it. The handler still runs per call, as a gate.
 */

import { afterEach, expect, test } from "bun:test";

import { getRequestEvent } from "@barqjs/web";
import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { LIVE_SUFFIX, PAYLOAD_PARAM, RPC_CALLER, RPC_PREFIX, createServerFn } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

interface Quote {
  symbol: string;
}

const ORIGIN = "https://example.com";

afterEach(() => unmountAll());

function tick(ms = 0) {
  return new Promise((done) => setTimeout(done, ms));
}

/** A connection to the live address, read event by event. */
async function connect(id: string, input: unknown) {
  const controller = new AbortController();
  const payload = JSON.stringify({ input: encodeWire(input) });
  const response = (await handleServerFn(
    new Request(
      `${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${LIVE_SUFFIX}?${PAYLOAD_PARAM}=${encodeURIComponent(payload)}`,
      {
        headers: { "sec-fetch-site": "same-origin", [RPC_CALLER]: "1" },
        signal: controller.signal,
      },
    ),
  ))!;
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const data: unknown[] = [];
  let buffered = "";
  let done = false;
  void (async () => {
    for (;;) {
      const step = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (step.done) break;
      buffered += decoder.decode(step.value);
      let cut: number;
      while ((cut = buffered.indexOf("\n\n")) !== -1) {
        const block = buffered.slice(0, cut);
        buffered = buffered.slice(cut + 2);
        const line = block.split("\n").find((each) => each.startsWith("data: "));
        if (line !== undefined && !block.startsWith("event: complete")) {
          data.push(decodeWire(JSON.parse(line.slice(6))));
        }
      }
    }
    done = true;
  })();
  return {
    status: response.status,
    data,
    get done() {
      return done;
    },
    close: () => controller.abort(),
  };
}

/** A source the test moves by hand, counting how many times it was started and stopped. */
function ticker() {
  const state = { started: 0, stopped: 0, push: (_value: number) => {} };
  function source(): AsyncIterable<number> {
    return {
      [Symbol.asyncIterator]() {
        state.started++;
        const queue: number[] = [];
        let wake: (() => void) | null = null;
        state.push = (value) => {
          queue.push(value);
          wake?.();
        };
        return {
          next: async () => {
            while (queue.length === 0) await new Promise<void>((done) => (wake = done));
            return { done: false, value: queue.shift()! };
          },
          return: async () => {
            state.stopped++;
            return { done: true, value: undefined };
          },
        };
      },
    };
  }
  return { state, source };
}

test("callers with the same arguments share one source, and each passes the gate", async () => {
  const { state, source } = ticker();
  let gated = 0;
  const quotes = createServerFn({ method: "GET", broadcast: true })
    .validator((input: Quote) => input)
    .handler(() => {
      gated++;
      return source();
    });
  mount("broadcast-quotes", quotes);

  const first = await connect("broadcast-quotes", { symbol: "ACME" });
  await tick();
  state.push(1);
  await tick();
  const second = await connect("broadcast-quotes", { symbol: "ACME" });
  await tick();
  state.push(2);
  await tick();

  expect(gated).toBe(2);
  expect(state.started).toBe(1);
  expect(first.data).toEqual([1, 2]);
  // The joiner is handed the latest value at once, then what follows.
  expect(second.data).toEqual([1, 2]);
  first.close();
  second.close();
});

test("other arguments are another source, and the last connection to go stops it", async () => {
  const sources = new Map<string, ReturnType<typeof ticker>>();
  const quotes = createServerFn({ method: "GET", broadcast: true })
    .validator((input: Quote) => input)
    .handler(({ data }) => {
      const made = sources.get(data.symbol) ?? ticker();
      sources.set(data.symbol, made);
      return made.source();
    });
  mount("broadcast-symbols", quotes);

  const acme = [
    await connect("broadcast-symbols", { symbol: "ACME" }),
    await connect("broadcast-symbols", { symbol: "ACME" }),
  ];
  const initech = await connect("broadcast-symbols", { symbol: "INITECH" });
  await tick();
  sources.get("ACME")!.state.push(10);
  sources.get("INITECH")!.state.push(20);
  await tick();
  expect(acme.map((each) => each.data)).toEqual([[10], [10]]);
  expect(initech.data).toEqual([20]);

  acme[0].close();
  await tick();
  expect(sources.get("ACME")!.state.stopped).toBe(0);
  acme[1].close();
  await tick();
  expect(sources.get("ACME")!.state.stopped).toBe(1);
  expect(sources.get("INITECH")!.state.stopped).toBe(0);
  initech.close();
});

test("the shared source runs outside every caller's request", async () => {
  let seen: unknown = "unread";
  const shared = createServerFn({ method: "GET", broadcast: true }).handler(async function* () {
    seen = getRequestEvent();
    yield "once";
  });
  mount("broadcast-request", shared);

  const reader = await connect("broadcast-request", undefined);
  await tick(5);
  expect(reader.data).toEqual(["once"]);
  expect(seen).toBeUndefined();
  reader.close();
});

test("without broadcast, every connection is its own source", async () => {
  const { state, source } = ticker();
  const quotes = createServerFn({ method: "GET" }).handler(() => source());
  mount("live-unshared", quotes);

  const first = await connect("live-unshared", undefined);
  const second = await connect("live-unshared", undefined);
  await tick();
  expect(state.started).toBe(2);
  first.close();
  second.close();
});
