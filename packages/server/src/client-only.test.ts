import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderToStream } from "./server.ts";
import { clientOnly, esc, html } from "./ssr.ts";

afterEach(() => {
  clearHydrationData();
});

const manifest = {
  "/src/Chart.tsx": { js: ["/assets/Chart-a1.js"], css: ["/assets/Chart-c3.css"] },
};

function page(moduleUrl?: string) {
  let imports = 0;
  const Chart = clientOnly(
    () => {
      imports++;
      return Promise.resolve({ default: () => html("<canvas></canvas>") });
    },
    undefined,
    moduleUrl,
  );
  const view = () =>
    html(
      `<html><head></head><body>${esc(Chart({ fallback: () => html("<p>salama's chart</p>") }))}</body></html>`,
    );
  return { view, imports: () => imports };
}

test("the server writes the fallback in the region the client claims, and never imports", async () => {
  const { view, imports } = page();
  const out = await new Response(renderToStream(view, { manifest }).readable).text();

  expect(out).toContain("<body><!--[--><p>salama's chart</p><!--]--></body>");
  expect(out).not.toContain("<canvas>");
  expect(out).not.toContain("modulepreload");
  expect(imports()).toBe(0);
});

test("a module URL puts the module's assets in the head as preload links", async () => {
  const { view, imports } = page("/src/Chart.tsx");
  const out = await new Response(renderToStream(view, { manifest }).readable).text();
  const head = out.slice(0, out.indexOf("</head>"));

  expect(head).toContain('<link rel="stylesheet" href="/assets/Chart-c3.css"');
  expect(head).toContain('<link rel="modulepreload" href="/assets/Chart-a1.js"');
  expect(imports()).toBe(0);
});
