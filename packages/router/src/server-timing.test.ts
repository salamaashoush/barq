/**
 * `Server-Timing` on a page in development: how long `beforeLoad`, the head
 * with the loaders it waits for, and the render took. A production build
 * (`isDev` false) sends none.
 */

import { isDev } from "@barqjs/core";
import { html as ssrHtml } from "@barqjs/server";
import { describe, expect, test } from "bun:test";

import type { AnyRouteDefinition } from "./route.ts";
import { createPageHandler } from "./server.ts";

const document = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><head><title>salama</title></head><body>${body}${seed}</body></html>`;

const table: AnyRouteDefinition[] = [{ path: "/", component: (() => null) as never }] as never;

describe("a page's Server-Timing", () => {
  for (const stream of [true, false]) {
    test(`names each phase in development, ${stream ? "streamed" : "buffered"}`, async () => {
      const handler = createPageHandler({
        routeTree: table,
        app: () => ssrHtml("<main>ok</main>"),
        document,
        stream,
      });
      const response = await handler(new Request("https://example.com/"));
      await response.text();
      const header = response.headers.get("server-timing");
      if (!isDev) {
        expect(header).toBeNull();
        return;
      }
      const names = (header ?? "").split(", ").map((entry) => entry.split(";")[0]);
      expect(names).toEqual(["barq-before-load", "barq-head", "barq-render"]);
      expect(header).toMatch(/barq-render;dur=\d+\.\d;desc="/);
    });
  }
});
