/**
 * Version skew: a page from one build calling the server of another. An id the
 * answering deployment does not know, and a call stamped with another build,
 * are both answered with the `x-barq-fn-unknown` label, and the call rejects
 * with `unknownFunction` set so the page can reload onto the current build.
 */

import { afterEach, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import {
  BUILD_HEADER,
  DATA_SUFFIX,
  RPC_PREFIX,
  ServerFnError,
  UNKNOWN_HEADER,
  clientRpc,
  createServerFn,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";

afterEach(() => unmountAll());

let ran = 0;
const save = createServerFn({ method: "POST" }).handler(() => {
  ran++;
  return "saved";
});

const call = (id: string, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: JSON.stringify({ input: encodeWire(undefined) }),
  });

test("an id the deployment does not know is a labelled 404", async () => {
  const answer = (await handleServerFn(call("gone#save")))!;
  expect(answer.status).toBe(404);
  expect(answer.headers.get(UNKNOWN_HEADER)).toBe("true");
});

test("a call stamped with another build is refused with 409 and the server's build, unrun", async () => {
  mount("skew#save", save);
  ran = 0;
  const answer = (await handleServerFn(call("skew#save", { [BUILD_HEADER]: "old" }), {
    buildId: "new",
  }))!;
  expect(answer.status).toBe(409);
  expect(answer.headers.get(UNKNOWN_HEADER)).toBe("true");
  expect(answer.headers.get(BUILD_HEADER)).toBe("new");
  expect(answer.headers.get("cache-control")).toBe("no-store");
  expect(ran).toBe(0);
});

test("a call from the same build, or with no build named, runs", async () => {
  mount("skew#save", save);
  ran = 0;
  const same = (await handleServerFn(call("skew#save", { [BUILD_HEADER]: "new" }), {
    buildId: "new",
  }))!;
  const unnamed = (await handleServerFn(call("skew#save"), { buildId: "new" }))!;
  expect([same.status, unnamed.status]).toEqual([200, 200]);
  expect(ran).toBe(2);
});

test("the caller's call rejects with unknownFunction set", async () => {
  const stub = clientRpc<undefined, string>("gone#save");
  const answered = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("sec-fetch-site", "same-origin");
    return (await handleServerFn(
      new Request(new URL(String(input), ORIGIN), { ...init, headers }),
    ))!;
  }) as typeof fetch;
  const error = await stub({ fetch: answered }).catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(ServerFnError);
  expect((error as ServerFnError).unknownFunction).toBe(true);
  expect((error as ServerFnError).status).toBe(404);
});
