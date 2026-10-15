/**
 * A server function's body is read under a cap.
 *
 * The body is parsed before the chain runs, so it is read for a caller no
 * middleware has looked at yet, and the id it is posted to is in the client
 * bundle. Read without a cap, one request makes the server hold whatever it is
 * sent.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { decodeWire, encodeWire } from "@barqjs/server/codec";
import { limitRequestBody } from "srvx/body-limit";

import { DATA_SUFFIX, RPC_PREFIX, serverRpc } from "./index.ts";
import { type HandlerOptions, handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://example.com";
const MIB = 1024 * 1024;

const urlOf = (id: string, channel = DATA_SUFFIX): string =>
  `${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${channel}`;

const json = (id: string, input: unknown): Request =>
  new Request(urlOf(id), {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ input: encodeWire(input) }),
  });

const upload = (id: string, bytes: number, channel = DATA_SUFFIX): Request => {
  const form = new FormData();
  form.set("owner", "salama");
  form.set("file", new File([new Uint8Array(bytes)], "report.bin"));
  return new Request(urlOf(id, channel), {
    method: "POST",
    headers: { origin: ORIGIN },
    body: form,
  });
};

/** Mounts a function that reports how much it was handed, and counts its runs. */
const measuring = (id: string): { runs: number } => {
  const seen = { runs: 0 };
  mount(
    id,
    serverRpc<unknown, number>(
      { id },
      {
        validator: "unchecked",
        middleware: [],
        handler: ({ data }) => {
          seen.runs += 1;
          if (data instanceof FormData) return (data.get("file") as File).size;
          return typeof data === "string" ? data.length : 0;
        },
      },
    ),
  );
  return seen;
};

/** A body that keeps producing until `total`, and says how much was taken from it. */
const endless = (total: number): { body: ReadableStream<Uint8Array>; pulled: number } => {
  const source = {
    pulled: 0,
    body: new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (source.pulled >= total) {
            controller.close();
            return;
          }
          source.pulled += 64 * 1024;
          controller.enqueue(new Uint8Array(64 * 1024).fill(0x20));
        },
      },
      // No read-ahead, so `pulled` is what a reader asked for and nothing else.
      { highWaterMark: 0 },
    ),
  };
  return source;
};

const streamed = (
  id: string,
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
): Request =>
  new Request(urlOf(id), {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body,
  });

const answer = async (request: Request, options?: HandlerOptions): Promise<Response> => {
  const response = await handleServerFn(request, options);
  if (response === null) throw new Error("not a server-function URL");
  return response;
};

describe("the value channel", () => {
  test("a body over 1 MiB is a 413, and the handler never runs", async () => {
    const seen = measuring("echo");
    const response = await answer(json("echo", "x".repeat(MIB + 1)));
    expect(response.status).toBe(413);
    expect(seen.runs).toBe(0);
  });

  test("a body under the cap is answered as it always was", async () => {
    measuring("echo");
    const response = await answer(json("echo", "x".repeat(MIB / 2)));
    expect(response.status).toBe(200);
    expect(decodeWire<number>(await response.json())).toBe(MIB / 2);
  });

  test("the cap counts the bytes read, whatever Content-Length claims", async () => {
    measuring("echo");
    const source = endless(8 * MIB);
    const response = await answer(streamed("echo", source.body, { "content-length": "16" }));
    expect(response.status).toBe(413);
    // Reading stops at the cap rather than at the end of the body.
    expect(source.pulled).toBeLessThan(2 * MIB);
  });

  test("a declared length over the cap is refused before a byte is read", async () => {
    measuring("echo");
    const source = endless(8 * MIB);
    const response = await answer(
      streamed("echo", source.body, { "content-length": String(8 * MIB) }),
    );
    expect(response.status).toBe(413);
    expect(source.pulled).toBe(0);
  });

  test("`maxBodySize` moves the cap in both directions", async () => {
    measuring("echo");
    const large = (): Request => json("echo", "x".repeat(2 * MIB));
    expect((await answer(large(), { maxBodySize: 4 * MIB })).status).toBe(200);
    expect((await answer(json("echo", "salama"), { maxBodySize: 16 })).status).toBe(413);
  });

  test("a limit the server in front already enforced is a 413 too, not a 400", async () => {
    measuring("echo");
    const limited = limitRequestBody(json("echo", "x".repeat(4096)), 64);
    expect((await answer(limited, { maxBodySize: 4 * MIB })).status).toBe(413);
  });
});

describe("forms", () => {
  test("an upload over the cap is a 413 on both channels", async () => {
    const seen = measuring("upload");
    expect((await answer(upload("upload", 2 * MIB))).status).toBe(413);
    expect((await answer(upload("upload", 2 * MIB, ""))).status).toBe(413);
    expect(seen.runs).toBe(0);
  });

  test("`maxFormSize` admits an upload without widening the value channel", async () => {
    measuring("upload");
    const options = { maxFormSize: 4 * MIB };
    const response = await answer(upload("upload", 2 * MIB), options);
    expect(response.status).toBe(200);
    expect(decodeWire<number>(await response.json())).toBe(2 * MIB);
    expect((await answer(json("upload", "x".repeat(2 * MIB)), options)).status).toBe(413);
  });

  test("a form follows `maxBodySize` until it is given a cap of its own", async () => {
    measuring("upload");
    expect((await answer(upload("upload", 2 * MIB), { maxBodySize: 4 * MIB })).status).toBe(200);
    expect(
      (await answer(upload("upload", 2 * MIB), { maxBodySize: 4 * MIB, maxFormSize: MIB })).status,
    ).toBe(413);
  });
});
