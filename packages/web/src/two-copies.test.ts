/**
 * Two copies of the renderer over one core, which a duplicated install gives a
 * page: the hydration session is core's and shared, and what claims the
 * server's nodes belongs to the copy whose `hydrate` was called. The other copy
 * has to build what it is asked for, as a page that only renders does.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { hydrate } from "./index.ts";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const built = existsSync(DIST);

describe.if(built)("a second copy of the renderer while the first hydrates", () => {
  test("its template and insert build without claiming, and nothing throws", async () => {
    const other = (await import(DIST)) as typeof import("./index.ts");
    const view = other.template("<b></b>");
    let made: Node | null = null;

    const container = document.createElement("div");
    container.innerHTML = "<p>claimed</p>";
    const dispose = hydrate(() => {
      const node = view();
      other.insert(node, () => "salama");
      made = node;
      return container.firstChild;
    }, container);

    expect((made as Element | null)?.outerHTML).toBe("<b>salama</b>");
    dispose();
  });
});
