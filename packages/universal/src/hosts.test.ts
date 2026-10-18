/**
 * Which host a core component renders through when it is called rather than
 * compiled: inside a tree, the one its render root provides; outside any tree,
 * the default, which the document's host takes outright and a custom renderer
 * fills only when nothing else has.
 */

import "@barqjs/web/host";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { Show, block, createRoot, type JSXElement } from "@barqjs/core";
import { createRenderer } from "./renderer.ts";
import { createTestHost, inner } from "./test-host.ts";

const host = createTestHost();
const r = createRenderer(host.ops);

const shown = (make: () => unknown): JSXElement =>
  Show({ when: () => true, children: block(make) } as never);

describe("an app that renders into the document and into a custom host", () => {
  test("a component inside a custom tree renders through the custom host", () => {
    const root = host.root();
    const dispose = r.render(() => shown(() => r.createElement("custom")), root);
    expect(inner(root)).toBe("<custom></custom>");
    dispose();
  });

  test("a component outside any tree renders through the document", () => {
    createRoot((dispose) => {
      const rendered = shown(() => document.createElement("span"));
      expect(rendered).toBeInstanceOf(Node);
      dispose();
    });
  });

  test("a custom tree inside a document tree still uses its own host", () => {
    createRoot((dispose) => {
      const root = host.root();
      const unmount = r.render(() => shown(() => r.createElement("inner")), root);
      expect(root.children[0].tag).toBe("inner");
      unmount();
      dispose();
    });
  });
});

describe("an app with no document host", () => {
  test("a component outside any tree renders through the renderer", () => {
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "test-universal-only.ts")], {
      cwd: import.meta.dir,
    });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString().trim()).toBe("<root><shown></shown></root>");
  });
});
