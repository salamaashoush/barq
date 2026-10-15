/**
 * `staticFunctionMiddleware`: answered at prerender time, read from a file
 * afterwards, one file per function and input.
 */

import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { clientRpc, createServerFn } from "./index.ts";
import { type ServerEntryModule, prerender } from "./prerender.ts";
import { mount, unmountAll } from "./server.ts";
import {
  type StaticAnswer,
  STATIC_PREFIX,
  canonicalInput,
  installStaticWriter,
  staticFunctionMiddleware,
  staticKey,
  staticUrl,
} from "./static-fn.ts";

const realFetch = globalThis.fetch;
const sandbox = mkdtempSync(join(tmpdir(), "barq-static-fn-"));

afterEach(() => {
  globalThis.fetch = realFetch;
  installStaticWriter(null);
  unmountAll();
});

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const greet = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .validator((input: { readonly name: string; readonly loud?: boolean }) => input)
  .handler(({ data }) => {
    return {
      greeting: data.loud === true ? `HELLO ${data.name}` : `hello ${data.name}`,
      at: new Date(0),
    };
  });

/** What a writer was handed, by file name. */
const recording = (): Map<string, { identity: string; answer: StaticAnswer }> => {
  const written = new Map<string, { identity: string; answer: StaticAnswer }>();
  installStaticWriter(async (key, identity, answer) => {
    written.set(key, { identity, answer: decodeWire<StaticAnswer>(JSON.parse(answer)) });
  });
  return written;
};

describe("at prerender time", () => {
  test("each call is written under a name derived from its function and its input", async () => {
    mount("greet", greet);
    const written = recording();

    await greet({ data: { name: "salama" } });
    await greet({ data: { name: "salama", loud: true } });

    const quiet = staticKey("greet", canonicalInput({ name: "salama" }));
    const loud = staticKey("greet", canonicalInput({ name: "salama", loud: true }));
    expect(quiet).not.toBe(loud);
    expect([...written.keys()].toSorted()).toEqual([quiet, loud].toSorted());
    expect(written.get(quiet)?.answer.result).toEqual({
      greeting: "hello salama",
      at: new Date(0),
    });
    // The value codec on the way to disk, so a Date reads back as one.
    expect(written.get(loud)?.answer.result).toMatchObject({ at: new Date(0) });
  });

  test("the name does not depend on the order the caller wrote its keys in", () => {
    expect(canonicalInput({ name: "salama", loud: true })).toBe(
      canonicalInput({ loud: true, name: "salama" }),
    );
    expect(staticKey("greet", canonicalInput({ a: { y: 1, x: 2 } }))).toBe(
      staticKey("greet", canonicalInput({ a: { x: 2, y: 1 } })),
    );
    // The function is part of the name: the same input to another function is
    // another file.
    expect(staticKey("greet", canonicalInput(1))).not.toBe(staticKey("other", canonicalInput(1)));
  });

  test("a Response or a stream is never written", async () => {
    const written = recording();
    const raw = createServerFn()
      .middleware([staticFunctionMiddleware])
      .handler(() => new Response("raw"));
    const ticks = createServerFn()
      .middleware([staticFunctionMiddleware])
      .handler(async function* () {
        yield 1;
      });
    mount("raw", raw);
    mount("ticks", ticks);

    await raw();
    await ticks();

    expect(written.size).toBe(0);
  });

  test("the prerenderer writes each answer beside the pages and reports where", async () => {
    mount("greet", greet);
    const outDir = join(sandbox, "site");
    const site: ServerEntryModule = {
      default: {
        createFetch: () => async () => {
          const answer = await greet({ data: { name: "salama" } });
          return new Response(`<!doctype html><p>${answer.greeting}</p>`, {
            headers: { "content-type": "text/html" },
          });
        },
      },
    };

    const result = await prerender({
      entry: site,
      outDir,
      routes: ["/"],
      crawl: false,
      concurrency: 1,
      subfolderIndex: true,
      base: "/",
    });

    const file = join(outDir, staticUrl("greet", { name: "salama" }).slice(1));
    expect(result.staticAnswers).toEqual([file]);
    expect(existsSync(file)).toBe(true);
    expect(decodeWire<StaticAnswer>(JSON.parse(readFileSync(file, "utf8"))).result).toMatchObject({
      greeting: "hello salama",
    });
  });

  test("two calls that would share a name stop the build", async () => {
    const outDir = join(sandbox, "collide");
    const site: ServerEntryModule = {
      default: {
        createFetch: () => async () => {
          // What a collision looks like from the writer's side: one name, two
          // different calls.
          const writer = (globalThis as Record<symbol, { writer: unknown }>)[
            Symbol.for("barq.start.static-writer")
          ]?.writer as (key: string, identity: string, answer: string) => Promise<void>;
          await writer("same", "greet\n1", "{}");
          await writer("same", "greet\n2", "{}");
          return new Response("<p>never</p>", { headers: { "content-type": "text/html" } });
        },
      },
    };

    const failure = await prerender({
      entry: site,
      outDir,
      routes: ["/"],
      crawl: false,
      concurrency: 1,
      subfolderIndex: true,
      base: "/",
    }).then(
      () => "",
      (error: Error) => error.message,
    );

    expect(failure).toContain("share the cache name same");
  });
});

describe("in the browser", () => {
  /** A host with the file for one input, and a server for everything else. */
  const host = (): { asked: string[] } => {
    const asked: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url.split("?")[0] ?? url);
      if (url === staticUrl("greet", { name: "salama" })) {
        return Response.json(encodeWire({ result: { greeting: "from the file" } }));
      }
      if (url.startsWith(STATIC_PREFIX)) return new Response("not found", { status: 404 });
      return Response.json(encodeWire({ greeting: "from the server" }));
    }) as typeof fetch;
    return { asked };
  };

  const stub = () =>
    clientRpc<{ readonly name: string }, { greeting: string }, "GET">(
      "greet",
      [staticFunctionMiddleware],
      { method: "GET" },
    );

  test("an input the build answered is read from its file, and the server is not asked", async () => {
    const { asked } = host();
    expect((await stub()({ data: { name: "salama" } })).greeting).toBe("from the file");
    expect(asked).toEqual([staticUrl("greet", { name: "salama" })]);
  });

  test("an input it did not answer goes to the server", async () => {
    const { asked } = host();
    expect((await stub()({ data: { name: "someone else" } })).greeting).toBe("from the server");
    expect(asked).toEqual([staticUrl("greet", { name: "someone else" }), "/_barq/fn/greet.data"]);
  });

  test("a page where the file should be, as a dev server answers, is not read as one", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).startsWith(STATIC_PREFIX)
        ? new Response("<!doctype html>", { headers: { "content-type": "text/html" } })
        : Response.json(encodeWire({ greeting: "from the server" }))) as typeof fetch;
    expect((await stub()({ data: { name: "salama" } })).greeting).toBe("from the server");
  });
});
