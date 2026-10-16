import { createMemo } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";
// The web one: happy-dom puts Node's `stream` classes on the global.
import { WritableStream as WebWritableStream } from "node:stream/web";

import { type ServerErrorContext, renderToStream, renderToString } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearHydrationData();
});

const page = () => () => {
  const who = createMemo(
    async () => {
      await tick();
      return "salama";
    },
    { key: "who" },
  );
  return html(
    `<html><body><main>${esc(
      ssrLoading({
        fallback: () => html("<i>wait</i>"),
        children: () => html(`<b>${esc(who())}</b>`),
      }),
    )}</main></body></html>`,
  );
};

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("renderToStream's result", () => {
  test("awaited, it is the settled document: content in place, the seed before </body>", async () => {
    const settled = await renderToStream(page());

    expect(settled).toContain("<main><b>salama</b></main>");
    expect(settled).not.toContain("<template");
    expect(settled).not.toContain("__BARQ_SWAP__");
    expect(settled).not.toContain("wait");
    const seed = settled.indexOf('who:"salama"');
    expect(seed).toBeGreaterThan(-1);
    expect(seed).toBeLessThan(settled.indexOf("</body>"));
  });

  test("readable is one stream however often it is read, and the shell comes first", async () => {
    const result = renderToStream(page());
    const stream = result.readable;
    expect(result.readable).toBe(stream);

    const body = await text(stream);
    expect(body.startsWith("<html><body><main><!--[b:0--><i>wait</i><!--]--></main>")).toBe(true);
    expect(body).toContain('<template data-barq="0"><b>salama</b></template>');
  });

  test("pipeTo writes the same bytes into a web WritableStream", async () => {
    const decoder = new TextDecoder();
    let body = "";
    let closed = false;
    const writable = new WebWritableStream<Uint8Array>({
      write: (chunk) => {
        body += decoder.decode(chunk, { stream: true });
      },
      close: () => {
        closed = true;
      },
    });
    await renderToStream(page()).pipeTo(writable);

    expect(closed).toBe(true);
    expect(body).toContain('<template data-barq="0"><b>salama</b></template>');
  });

  test("pipe writes strings into a Node-style writable and ends it once", async () => {
    let out = "";
    let ends = 0;
    await new Promise<void>((resolve) => {
      renderToStream(page()).pipe({
        write: (chunk) => {
          out += chunk;
        },
        end: () => {
          ends++;
          resolve();
        },
      });
    });

    expect(ends).toBe(1);
    expect(out).toContain('<template data-barq="0"><b>salama</b></template>');
  });

  test("a second kind of consumer is refused, naming both", async () => {
    const result = renderToStream(page());
    const stream = result.readable;

    expect(() => result.pipe({ write: () => {}, end: () => {} })).toThrow(
      "already consumed through `readable` and cannot also be consumed through `pipe`",
    );
    await text(stream);
  });

  test("a render no stream claimed in its first tick is settled for the promise", async () => {
    const result = renderToStream(page());
    await Promise.resolve();

    expect(() => result.readable).toThrow("already consumed through `the promise`");
    expect(await result).toContain("<main><b>salama</b></main>");
  });

  test("a shell that throws is heard as failed and thrown out of the call", () => {
    const heard: [unknown, ServerErrorContext][] = [];
    const boom = new Error("salama's shell broke");

    expect(() =>
      renderToStream(
        () => {
          throw boom;
        },
        { onError: (error, context) => heard.push([error, context]) },
      ),
    ).toThrow(boom);
    expect(heard).toEqual([[boom, { kind: "render", handling: "failed" }]]);
  });

  test("a nonce given per directive lands on every script", async () => {
    const body = await text(
      renderToStream(page(), { nonce: { script: "s-1", style: "t-1" } }).readable,
    );
    const scripts = body.match(/<script[^>]*>/g) ?? [];

    expect(scripts.length).toBeGreaterThan(1);
    expect(scripts.every((tag) => tag === '<script nonce="s-1">')).toBe(true);
  });

  test("renderId namespaces the boundary, its template and its swap", async () => {
    const body = await text(renderToStream(page(), { renderId: "r1-" }).readable);

    expect(body).toContain("<!--[b:r1-0-->");
    expect(body).toContain('<template data-barq="r1-0">');
    expect(body).toContain('window.__BARQ_SWAP__("r1-0")');
  });

  test("noScripts sends no seed and no input capture", async () => {
    const body = await text(renderToStream(page(), { noScripts: true }).readable);

    expect(body).not.toContain("__BARQ_DATA__");
    expect(body).not.toContain("__BARQ_EVTS__");
    expect(body).toContain('<template data-barq="0"><b>salama</b></template>');
  });
});

describe("renderToString's options", () => {
  test("a render that throws is heard as failed before it is rethrown", () => {
    const heard: ServerErrorContext[] = [];
    expect(() =>
      renderToString(
        () => {
          throw new Error("salama");
        },
        { onError: (_, context) => heard.push(context) },
      ),
    ).toThrow("salama");
    expect(heard).toEqual([{ kind: "render", handling: "failed" }]);
  });
});
