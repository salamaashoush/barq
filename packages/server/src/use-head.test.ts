import { createMemo, createRoot, useHead } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";

import { renderToStream, renderToString } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";
import { applyHeadPatch } from "./swap.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearHydrationData();
  document.head.innerHTML = "";
  document.title = "";
});

const shellPage = () => () => {
  useHead([
    { tag: "title", children: "salama's account" },
    { tag: "meta", props: { name: "description", content: "first" } },
    { tag: "meta", props: { name: "description", content: "an account at example.com" } },
  ]);
  return html('<html><head><meta charset="utf-8"></head><body><main>a</main></body></html>');
};

describe("useHead on the server", () => {
  test("puts what the shell declared inside its head, the last of each identity winning", () => {
    const out = renderToString(shellPage());

    expect(out).toContain(
      `<meta charset="utf-8"><title data-bh="title">salama's account</title>` +
        '<meta name="description" content="an account at example.com" data-bh="meta:description"></head>',
    );
    expect(out).not.toContain('content="first"');
  });

  test("hands the markup to onHead when the render has no head of its own", () => {
    let head = "";
    const out = renderToString(
      () => {
        useHead({ tag: "title", children: "salama" });
        return html("<main>a</main>");
      },
      { onHead: (markup) => (head = markup) },
    );

    expect(out).toBe("<main>a</main>");
    expect(head).toBe('<title data-bh="title">salama</title>');
  });

  test("streams what a boundary declared after the shell as a patch with its swap", async () => {
    const body = await new Response(
      renderToStream(() => {
        useHead({ tag: "title", children: "loading" });
        const who = createMemo(async () => {
          await tick();
          return "salama";
        });
        return html(
          `<html><head></head><body>${esc(
            ssrLoading({
              fallback: () => html("<i>wait</i>"),
              children: () => {
                const name = who();
                useHead({ tag: "title", children: `${name}'s account` });
                return html(`<b>${esc(name)}</b>`);
              },
            }),
          )}</body></html>`,
        );
      }).readable,
    ).text();

    expect(body).toContain('<head><title data-bh="title">loading</title></head>');
    const patch = /window\.__BARQ_HEAD__\((\[.*?\])\)/.exec(body);
    expect(patch).not.toBeNull();
    applyHeadPatch(JSON.parse(patch?.[1] ?? "[]") as Parameters<typeof applyHeadPatch>[0]);
    expect(document.title).toBe("salama's account");
  });
});

describe("useHead in the browser", () => {
  test("applies a tag and takes it back with its scope, restoring the title", () => {
    document.title = "before";
    let dispose!: () => void;
    createRoot((release) => {
      dispose = release;
      useHead([
        { tag: "title", children: "salama" },
        { tag: "meta", props: { name: "robots", content: "noindex" } },
      ]);
    });

    expect(document.title).toBe("salama");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex",
    );
    dispose();
    expect(document.title).toBe("before");
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  test("adopts the tag the server wrote for the same identity rather than adding one", () => {
    document.head.innerHTML =
      '<meta name="description" content="server" data-bh="meta:description">';
    const served = document.head.firstElementChild;
    createRoot(() => {
      useHead({ tag: "meta", props: { name: "description", content: "client" } });
    });

    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.firstElementChild).toBe(served);
    expect(served?.getAttribute("content")).toBe("client");
  });
});
