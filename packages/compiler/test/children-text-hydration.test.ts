import { describe, expect, test } from "bun:test";

import { compileText, host, shape, wire } from "./hydration.ts";

/**
 * Children handed to a component are a range of their own, whatever their
 * first node is. Text ahead of a condition is part of that range, not a node
 * the component's root is expected to start with.
 */
const SHAPES: Record<string, string> = {
  "text then a condition": `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Wrap(props) { return <label>{props.children}</label>; }
export default function Page() { return <Wrap>Plan <Show when={on()}><span>Pro</span></Show></Wrap>; }`,
  "text then a condition, among siblings": `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Wrap(props) { return <label>{props.children}</label>; }
export default function Page() {
  return <main><h1>Plans</h1><Wrap>Plan <Show when={on()}><span>Pro</span></Show> tier</Wrap><p>after</p></main>;
}`,
  "a condition then text": `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Wrap(props) { return <label>{props.children}</label>; }
export default function Page() { return <Wrap><Show when={on()}><span>Pro</span></Show> plan</Wrap>; }`,
  "a component as the whole page value": `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Wrap(props) { return <>{props.children}</>; }
export default function Page() { return <Wrap>Plan <Show when={on()}><span>Pro</span></Show></Wrap>; }`,
};

describe("text among a component's children", () => {
  let index = 0;
  for (const [name, source] of Object.entries(SHAPES)) {
    const tag = `children-text-${index++}`;

    test(`${name}: hydrates without a mismatch and stays live`, async () => {
      const core = await import("@barqjs/core");
      const web = await import("@barqjs/web");
      const compiled = await compileText(source, tag);
      const page = host(wire(compiled.ssr));
      const before = shape(page);
      const stop = web.hydrate(compiled.dom.default as never, page);
      core.flush();
      try {
        expect(web.hydrate.report.mismatches).toEqual([]);
        expect(web.hydrate.report.recovered).toBe(false);
        expect(shape(page)).toBe(before);
        const setOn = (compiled.dom as unknown as { setOn: (value: boolean) => void }).setOn;
        setOn(false);
        core.flush();
        expect(page.querySelector("span")).toBeNull();
        setOn(true);
        core.flush();
        expect(page.querySelector("span")?.textContent).toBe("Pro");
      } finally {
        stop();
        page.remove();
      }
    });
  }
});

const ROWS: Record<string, string> = {
  "text, then an element, then text": `[{ t: "a ", c: false }, { t: "b", c: true }, { t: " c", c: false }]`,
  "an element, then text, then an element": `[{ t: "b", c: true }, { t: " a ", c: false }, { t: "d", c: true }]`,
  "text rows the parser joins into one node": `[{ t: "a", c: false }, { t: "b", c: false }]`,
};

describe("list rows that are text beside rows that are elements", () => {
  let index = 0;
  for (const [name, rows] of Object.entries(ROWS)) {
    const tag = `children-text-rows-${index++}`;

    test(`${name}: hydrates without a mismatch and keeps the server's nodes`, async () => {
      const core = await import("@barqjs/core");
      const web = await import("@barqjs/web");
      const compiled = await compileText(
        `
import { For } from "@barqjs/core";
function Prose() {
  const parts = () => ${rows};
  return <For each={parts}>{(part) => (part.c ? <code>{part.t}</code> : part.t)}</For>;
}
export default function Page() { return <p><Prose /></p>; }`,
        tag,
      );
      const page = host(wire(compiled.ssr));
      const served = [...(page.querySelector("p") as Element).childNodes];
      const text = page.textContent;
      const stop = web.hydrate(compiled.dom.default as never, page);
      core.flush();
      try {
        expect(web.hydrate.report.mismatches).toEqual([]);
        expect(web.hydrate.report.recovered).toBe(false);
        const kept = [...(page.querySelector("p") as Element).childNodes];
        expect(served.every((node) => kept.includes(node))).toBe(true);
        expect(page.textContent).toBe(text);
      } finally {
        stop();
        page.remove();
      }
    });
  }
});
