/**
 * The SPA document belongs to the handler that was given it.
 */

import { afterAll, expect, test } from "bun:test";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFetchHandler } from "./serve.ts";

const dir = mkdtempSync(join(tmpdir(), "barq-spa-"));
writeFileSync(join(dir, "shop.html"), "<!doctype html><title>shop</title>\n");
writeFileSync(join(dir, "admin.html"), "<!doctype html><title>admin</title>\n");

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const navigate = (handler: (request: Request) => Promise<Response>): Promise<Response> =>
  handler(new Request("https://example.com/orders/7", { headers: { accept: "text/html" } }));

test("two handlers in one process each answer with their own document", async () => {
  const shop = createFetchHandler({ spa: join(dir, "shop.html") });
  const admin = createFetchHandler({ spa: join(dir, "admin.html") });

  expect(await (await navigate(shop)).text()).toContain("<title>shop</title>");
  expect(await (await navigate(admin)).text()).toContain("<title>admin</title>");
});

test("a document that is not there leaves the 404 the handler produced", async () => {
  const handler = createFetchHandler({ spa: join(dir, "missing.html") });
  expect((await navigate(handler)).status).toBe(404);
});
