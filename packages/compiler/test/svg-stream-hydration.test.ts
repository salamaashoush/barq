/**
 * A boundary inside `<svg>`, streamed.
 *
 * The stream ships a settled boundary as `<template data-barq="N">…</template>`
 * at the end of the body, and a template's content is parsed in the HTML
 * namespace whatever the boundary's position in the page was. An
 * HTML-namespace `circle` under an `<svg>` paints nothing and the client's
 * claim refuses it, so the payload has to arrive as SVG for the page to be
 * hydrated rather than rebuilt.
 *
 * The buffered page writes the same markup in place, where the parser is
 * already in foreign content. That row is the control.
 */

import { expect, test } from "bun:test";

import { census, compileText, host, reuse } from "./hydration.ts";
import { assemble } from "./stream.ts";

const SVG = "http://www.w3.org/2000/svg";

const SOURCE = `
import { Loading, createMemo } from "@barqjs/core"
export default function Chart() {
  const radius = createMemo(() => new Promise((r) => setTimeout(() => r("5"), 0)))
  return (
    <svg viewBox="0 0 10 10">
      <Loading fallback={<rect class="skel" width="1" height="1" />}>
        <circle class="done" r={() => radius()} />
      </Loading>
    </svg>
  )
}
`;

async function hydrated(mode: "buffered" | "streamed") {
  const compiled = await compileText(SOURCE, `svg-stream-${mode}`, true, false);
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const server = await import("@barqjs/server");
  const container = host("");
  const seeded = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
  let data: Record<string, unknown> | undefined;

  if (mode === "buffered") {
    const page = await server.renderPage((() => compiled.ssr.default()) as never);
    container.innerHTML = page.html;
    data = page.data;
  } else {
    await assemble(compiled.ssr, container);
  }
  const served = container.querySelector(".done");
  const namespace = served?.namespaceURI ?? null;

  const before = census(container);
  core.resetChildIds();
  const dispose = web.hydrate(
    compiled.dom.default as never,
    container,
    data === undefined ? undefined : { data },
  );
  const report = web.hydrate.report;
  const result = {
    namespace,
    recovered: report.recovered,
    mismatches: report.mismatches.map((m) => m.kind),
    reuse: reuse(before, container).percent,
  };
  dispose();
  container.remove();
  seeded.__BARQ_DATA__ = undefined;
  return result;
}

const CLEAN = { namespace: SVG, recovered: false, mismatches: [], reuse: 100 };

test("control: the buffered page delivers an SVG circle and hydrates over it", async () => {
  expect(await hydrated("buffered")).toEqual(CLEAN);
});

test("the streamed page delivers the same SVG circle and hydrates over it", async () => {
  expect(await hydrated("streamed")).toEqual(CLEAN);
});
