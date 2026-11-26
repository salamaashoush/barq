/**
 * `innerHTML` written as a prop keeps the nodes a server sent for it. A
 * server writes a newline straight after `<pre>`, so content of its own that
 * starts with one keeps it; a browser's parser drops that newline and
 * happy-dom's keeps it, and the content is the same either way.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { transform } from "@barqjs/compiler";

import * as core from "@barqjs/core";
import * as web from "./index.ts";
import { linkRuntime } from "./test-compile.ts";

const SOURCE = `export function Page() {
  return <pre innerHTML={"<span>a</span><span>b</span>"} />;
}
`;

interface PageModule {
  Page: () => core.JSXElement;
}

async function load(): Promise<PageModule> {
  const out = transform(SOURCE, { filename: "/page.tsx", hydratable: true });
  const directory = mkdtempSync(join(tmpdir(), "barq-inner-html-"));
  const file = join(directory, "page.js");
  writeFileSync(file, linkRuntime(out.code));
  try {
    return (await import(file)) as PageModule;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

afterEach(() => {
  document.body.textContent = "";
});

describe("innerHTML hydrated", () => {
  test("a <pre>'s content after the server's leading newline is kept, node for node", async () => {
    const { Page } = await load();
    const container = document.createElement("div");
    container.innerHTML = "<pre>\n<span>a</span><span>b</span></pre>";
    document.body.append(container);
    const spans = [...container.querySelectorAll("span")];
    const dispose = web.hydrate(() => core.createComponent(Page, {}), container);
    expect(web.hydrate.report.recovered).toBe(false);
    expect([...container.querySelectorAll("span")]).toEqual(spans);
    expect(spans.every((one) => container.contains(one))).toBe(true);
    dispose();
  });
});
