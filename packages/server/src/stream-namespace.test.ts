/**
 * A streamed boundary arrives in the namespace it stands in.
 *
 * The stream ships a settled boundary as `<template data-barq="N">…</template>`
 * at the end of the body, and a template's content is parsed as HTML whatever
 * the boundary's position on the page was. A payload bound for `<svg>` or
 * `<math>` is therefore shipped inside an element of that namespace, and the
 * swap takes it back out.
 */

import { createMemo } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderToStream, swapDeferredRange } from "./server.ts";
import { attr, esc, html, ssrLoading } from "./ssr.ts";

const SVG = "http://www.w3.org/2000/svg";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

afterEach(() => {
  clearHydrationData();
});

/** A page whose one late value is read inside a boundary placed by `around`. */
function streamed(around: (boundary: string) => string, content = '<circle r="5"/>') {
  return collect(
    renderToStream(() => {
      const late = createMemo(async () => {
        await tick();
        return content;
      });
      const boundary = esc(
        ssrLoading({
          fallback: () => html("<!--skeleton-->"),
          children: () => html(late()),
        }),
      );
      return html(around(boundary));
    }).readable,
  );
}

test("a boundary inside <svg> is shipped inside an <svg>", async () => {
  const out = await streamed((boundary) => `<svg viewBox="0 0 10 10"><g>${boundary}</g></svg>`);

  expect(out).toContain('<template data-barq="0"><svg><circle r="5"/></svg></template>');
  expect(out).toContain("__BARQ_SWAP__(0,true)");
});

test("a boundary inside <math> is shipped inside a <math>", async () => {
  const out = await streamed((boundary) => `<math><mrow>${boundary}</mrow></math>`, "<mspace/>");

  expect(out).toContain('<template data-barq="0"><math><mspace/></math></template>');
  expect(out).toContain("__BARQ_SWAP__(0,true)");
});

test("HTML resumes where the foreign content hands back to it", async () => {
  const pages = [
    (boundary: string) => `<svg><foreignObject>${boundary}</foreignObject></svg>`,
    (boundary: string) => `<svg><title>${boundary}</title></svg>`,
    (boundary: string) => `<math><mtext>${boundary}</mtext></math>`,
    (boundary: string) =>
      `<math><annotation-xml encoding="text/html">${boundary}</annotation-xml></math>`,
    (boundary: string) => `<svg><circle r="1"/></svg>${boundary}`,
    (boundary: string) => `<svg/><p>${boundary}</p>`,
  ];

  for (const page of pages) {
    const out = await streamed(page, "<b>late</b>");

    expect(out, page("")).toContain('<template data-barq="0"><b>late</b></template>');
    expect(out, page("")).toContain("__BARQ_SWAP__(0)");
  }
});

test("markup inside a value or a text element places nothing", async () => {
  const pages = [
    (boundary: string) => `<p${attr("title", "<svg><!--[b:0-->")}>${boundary}</p>`,
    (boundary: string) => `<style>a::after { content: "<svg>" }</style><p>${boundary}</p>`,
    (boundary: string) => `<textarea><svg></textarea>${boundary}`,
    (boundary: string) => `<p>1 &lt; 2 <svg x="</svg>"></svg></p>${boundary}`,
  ];

  for (const page of pages) {
    const out = await streamed(page, "<b>late</b>");

    expect(out, page("")).toContain('<template data-barq="0"><b>late</b></template>');
  }
});

test("a boundary parked by a resumed boundary stands where that one does", async () => {
  const out = await collect(
    renderToStream(() => {
      const first = createMemo(async () => {
        await tick();
        return "1";
      });
      const second = createMemo(async () => {
        await tick();
        await tick();
        return "2";
      });
      const inner = (): unknown =>
        ssrLoading({
          fallback: () => html(""),
          children: () => html(`<circle r="${esc(second())}"/>`),
        });
      return html(
        `<svg>${esc(
          ssrLoading({
            fallback: () => html(""),
            children: () => html(`<g data-r="${esc(first())}">${esc(inner())}</g>`),
          }),
        )}</svg>`,
      );
    }).readable,
  );

  expect(out).toContain(
    '<template data-barq="0"><svg><g data-r="1"><!--[b:1--><!--]--></g></svg></template>',
  );
  expect(out).toContain('<template data-barq="1"><svg><circle r="2"/></svg></template>');
});

test("the swap moves the payload in and leaves its wrapper behind", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  try {
    host.innerHTML =
      '<svg><!--[b:0--><rect/><!--]--></svg><template data-barq="0"><svg><circle r="5"/><circle r="6"/></svg></template>';

    swapDeferredRange(0, true);

    const svg = host.querySelector("svg")!;
    expect(host.querySelectorAll("svg")).toHaveLength(1);
    expect(host.querySelector("template")).toBeNull();
    expect([...svg.children].map((child) => [child.localName, child.namespaceURI])).toEqual([
      ["circle", SVG],
      ["circle", SVG],
    ]);
  } finally {
    host.remove();
  }
});
