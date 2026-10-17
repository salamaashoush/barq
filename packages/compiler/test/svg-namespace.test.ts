import { expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

const SVG = "http://www.w3.org/2000/svg";

const SOURCE = `
import { For, Show, createSignal } from "@barqjs/core";
export const [links] = createSignal(["#one"]);
export const [shown] = createSignal(true);
export function LinkRows() {
  return <svg><For each={links()}>{(href) => <a href={href}><circle r="4" /></a>}</For></svg>;
}
export function NestedLink() {
  return <svg><Show when={shown()}><g><a href="#one"><circle r="4" /></a></g></Show></svg>;
}
export function Tooltip() {
  return <svg><Show when={shown()}><title>four pending</title></Show></svg>;
}
export function Shadow() {
  return <svg><filter id="soft"><Show when={shown()}><feDropShadow dx="1" dy="1" /></Show></filter></svg>;
}
`;

async function namespaces(name: string): Promise<Record<string, string | null>> {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "svg-namespace.tsx"),
    `svg-namespace-${name}`,
  )) as unknown as Record<string, () => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
  try {
    const found: Record<string, string | null> = {};
    for (const node of host.querySelectorAll("svg *"))
      found[node.localName.toLowerCase()] = node.namespaceURI;
    return found;
  } finally {
    dispose();
    host.remove();
  }
}

test("<a> as a <For> row inside <svg> is an SVG element", async () => {
  expect(await namespaces("LinkRows")).toEqual({ a: SVG, circle: SVG });
});

test("<a> nested in a <g> inside <svg> is an SVG element", async () => {
  expect(await namespaces("NestedLink")).toEqual({ g: SVG, a: SVG, circle: SVG });
});

test("<title> under <Show> inside <svg> is an SVG element", async () => {
  expect(await namespaces("Tooltip")).toEqual({ title: SVG });
});

test("<feDropShadow> under <Show> inside <filter> is an SVG element", async () => {
  expect(await namespaces("Shadow")).toEqual({ filter: SVG, fedropshadow: SVG });
});
