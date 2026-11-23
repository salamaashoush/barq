/**
 * The viewer across a server render.
 *
 * The server, a process with no DOM, renders the scene's SVG snapshot (or,
 * without one, a box of the content's proportions) inside the region with
 * its name and description. The browser hydrates that markup without a
 * mismatch, draws the scene on a canvas, and takes the snapshot away once
 * the canvas has it.
 */

import { afterEach, expect, test } from "bun:test";
import { flush, resetChildIds } from "@barqjs/core";
import { hydrate } from "@barqjs/web";

import { type Compiled, ENTRY, SCENE, compile, serve } from "./ssr-harness.ts";

const page = (withSnapshot: boolean) => `
import { readFileSync } from "node:fs"
import { DiagramViewer, exportToSvgString } from ${JSON.stringify(ENTRY)}

const scene = JSON.parse(readFileSync(${JSON.stringify(SCENE)}, "utf8"))
const snapshot = ${withSnapshot ? "await exportToSvgString(scene)" : "undefined"}

export const handle = { api: null }

export const page = () => () => (
  <main>
    <DiagramViewer scene={scene} snapshot={snapshot} label="Release flow" api={(api) => (handle.api = api)} />
    <footer>end</footer>
  </main>
)
`;

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = "";
});

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

async function hydrateInto(container: HTMLElement, compiled: Compiled) {
  const module = (await import(`${compiled.dom}?${Math.random()}`)) as {
    page: () => () => unknown;
    handle: { api: { getSceneElements(): readonly unknown[] } | null };
  };
  resetChildIds();
  cleanup = hydrate(module.page() as never, container);
  flush();
  return module.handle;
}

test("the server sends the snapshot SVG in the named region, and the browser hydrates it into a canvas", async () => {
  const compiled = compile(page(true), "viewer-snapshot");
  const served = serve(compiled.ssr);
  const svg = /<svg[\s\S]*<\/svg>/.exec(served.html)?.[0] ?? "";
  const snapshot = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  expect(snapshot.tagName).toBe("svg");
  expect(snapshot.querySelectorAll("text").length).toBeGreaterThan(3);
  expect(snapshot.querySelector("style")?.textContent).toContain("@font-face");

  // happy-dom's HTML parser drops everything after a `<style>` inside an
  // `<svg>`, which browsers parse as SVG. The island is not hydrated, so the
  // page is the same without it.
  const container = host();
  container.innerHTML = served.html.replace(/<style class="style-fonts">[\s\S]*?<\/style>/, "");

  const region = container.querySelector<HTMLElement>("[aria-roledescription=diagram]");
  expect(region?.getAttribute("role")).toBe("region");
  expect(region?.getAttribute("aria-label")).toBe("Release flow");
  expect(region?.querySelector("[data-diagram-snapshot] svg text")).not.toBeNull();
  const description = container.querySelector(`#${region?.getAttribute("aria-describedby")}`);
  expect(description?.textContent).toContain("Start");
  expect(region?.querySelector("canvas")).toBeNull();

  const handle = await hydrateInto(container, compiled);
  expect(hydrate.report.recovered).toBe(false);
  expect(container.querySelector("[aria-roledescription=diagram]")).toBe(region);
  expect(region?.querySelector("canvas")).not.toBeNull();
  expect(handle.api?.getSceneElements().length).toBeGreaterThan(10);
  // The snapshot stays over the canvas until fonts and images have loaded.
  for (let i = 0; i < 20 && region?.querySelector("[data-diagram-snapshot]"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(region?.querySelector("[data-diagram-snapshot]")).toBeNull();
  expect(container.querySelector("footer")?.textContent).toBe("end");
});

test("without a snapshot the server sends an empty box of the content's proportions", () => {
  const compiled = compile(page(false), "viewer-placeholder");
  const served = serve(compiled.ssr);
  const container = host();
  container.innerHTML = served.html;
  const region = container.querySelector<HTMLElement>("[aria-roledescription=diagram]");
  expect(region?.getAttribute("style")).toMatch(/aspect-ratio:\s*\d+ \/ \d+/);
  expect(region?.querySelector("[data-diagram-snapshot]")?.childNodes.length).toBe(0);
});
