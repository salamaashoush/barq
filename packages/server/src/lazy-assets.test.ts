import { lazy } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderToStream } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

afterEach(() => {
  clearHydrationData();
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const manifest = {
  "/src/Chart.tsx": {
    js: ["/assets/Chart-a1.js", "/assets/d3-b2.js"],
    css: ["/assets/Chart-c3.css"],
  },
};

const page = (delay: number) => {
  const Chart = lazy(
    async () => {
      await wait(delay);
      return { default: () => html("<figure>salama's chart</figure>") };
    },
    undefined,
    "/src/Chart.tsx",
  ) as unknown as (props: unknown) => unknown;
  return () =>
    html(
      `<html><head></head><body>${esc(
        ssrLoading({
          fallback: () => html("<i>wait</i>"),
          children: () => Chart({}),
        }),
      )}</body></html>`,
    );
};

async function body(delay: number): Promise<string> {
  return new Response(renderToStream(page(delay), { manifest }).readable).text();
}

test("a lazy module that renders before the shell puts its assets in the shell's head", async () => {
  const out = await body(0);
  const head = out.slice(0, out.indexOf("</head>"));

  expect(head).toContain('<link rel="stylesheet" href="/assets/Chart-c3.css"');
  expect(head).toContain('<link rel="modulepreload" href="/assets/Chart-a1.js"');
  expect(head).toContain('<link rel="modulepreload" href="/assets/d3-b2.js"');
});

test("a lazy module still loading when the shell flushes has its assets in the shell's head too", async () => {
  const out = await body(5);
  const head = out.slice(0, out.indexOf("</head>"));

  expect(head).toContain('<link rel="stylesheet" href="/assets/Chart-c3.css"');
  expect(head).toContain('<link rel="modulepreload" href="/assets/Chart-a1.js"');
  expect(out.indexOf("<figure>salama's chart</figure>")).toBeGreaterThan(out.indexOf("</head>"));
  expect(out.match(/href="\/assets\/Chart-a1\.js"/g)).toHaveLength(1);
});
