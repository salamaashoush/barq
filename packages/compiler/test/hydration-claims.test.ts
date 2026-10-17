import { describe, expect, test } from "bun:test";

import { census, compileText, host, reuse, shape, wire } from "./hydration.ts";

/**
 * Pages whose hydration lost a node the server sent, or built one the cold
 * render does not, each reduced from a shape `hydration-grammar.test.ts`
 * generates. Every one is held to the same terms: no mismatch, no recovery,
 * every server node still in the page, and the DOM a cold render of the same
 * module builds, after each step as well as at first.
 */

type Module = Record<string, (value: never) => void>;

interface Shape {
  source: string;
  /** Exported setters, called on both modules in turn. */
  steps?: [string, unknown][];
  /** Whether an effect writes while the page hydrates, so nodes legitimately go. */
  writes?: boolean;
}

async function check(shapeOf: Shape, tag: string): Promise<void> {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const hot = await compileText(shapeOf.source, `claims-hot-${tag}`);
  const ref = await compileText(shapeOf.source, `claims-cold-${tag}`);
  const page = host(wire(hot.ssr));
  const before = census(page);
  const kept = Array.from(page.querySelectorAll(".s"));
  const stopHot = web.hydrate(hot.dom.default as never, page);
  const report = web.hydrate.report;
  const lost = reuse(before, page).firstLost;
  const cold = host("");
  const stopCold = web.render(ref.dom.default as never, cold);
  core.flush();
  await Promise.resolve();
  core.flush();
  try {
    expect({ mismatches: report.mismatches, recovered: report.recovered }).toEqual({
      mismatches: [],
      recovered: false,
    });
    if (shapeOf.writes !== true) expect(lost).toBeNull();
    for (const node of kept) expect(page.contains(node)).toBe(true);
    expect(shape(page)).toBe(shape(cold));
    for (const [name, value] of shapeOf.steps ?? []) {
      (hot.dom as unknown as Module)[name](value as never);
      (ref.dom as unknown as Module)[name](value as never);
      core.flush();
      expect(`${name}(${JSON.stringify(value)}): ${shape(page)}`).toBe(
        `${name}(${JSON.stringify(value)}): ${shape(cold)}`,
      );
    }
  } finally {
    stopHot();
    stopCold();
    page.remove();
    cold.remove();
  }
}

const ROWS = `[{ id: 1, name: "r1" }, { id: 2, name: "r2" }, { id: 3, name: "r3" }]`;

const SHAPES: Record<string, Shape> = {
  "an effect's write while the page hydrates builds outside the claim": {
    source: `
import { createSignal, onSettled } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
export default function Page() {
  onSettled(() => { setLabel("two"); });
  return <div><p class="s">a</p>{[<b>a</b>, label()]}<p class="s">z</p></div>;
}`,
    writes: true,
  },
  "a row an effect adds once the list has hydrated is a new row, not a missing one": {
    source: `
import { For, createSignal, onSettled } from "@barqjs/core";
export const [list, setList] = createSignal([]);
export default function Page() {
  onSettled(() => { setList(${ROWS}); });
  return <ul><For each={list()}>{(row) => <li>{row.name}</li>}</For></ul>;
}`,
    writes: true,
  },
  "a row that is text takes the text the server wrote for it": {
    source: `
import { For, createSignal } from "@barqjs/core";
export const [list, setList] = createSignal(${ROWS}.slice(0, 1));
export default function Page() {
  return <div><For each={list()}>{(row) => row.name}</For></div>;
}`,
    steps: [["setList", []]],
  },
  "rows of text the parser joined into one node each take their own part": {
    source: `
import { For, createSignal } from "@barqjs/core";
export const [list, setList] = createSignal(${ROWS});
export default function Page() {
  return <div><For each={list()}>{(row) => row.name}</For></div>;
}`,
    steps: [["setList", [{ id: 4, name: "r4" }]]],
  },
  "joined rows of text through a pass-through component stay in order": {
    source: `
import { For, createSignal } from "@barqjs/core";
export const [list, setList] = createSignal(${ROWS});
function Pass(props) { return props.children; }
export default function Page() {
  return <div><Pass><For each={list()}>{(row) => row.name}</For></Pass></div>;
}`,
  },
  "text beside an expression in a component's children": {
    source: `
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
function Wrap(props) { return <section>{props.children}</section>; }
export default function Page() {
  return <div><p class="s">a</p><Wrap>Plan {label()}</Wrap><p class="s">z</p></div>;
}`,
    steps: [["setLabel", "two"]],
  },
  "text a hole's value steps over is placed by the insert, not built again": {
    source: `
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
const lead = "lead ";
export default function Page() {
  return <div><p class="s">a</p>{[lead, <b>b</b>, () => label()]}<p class="s">z</p></div>;
}`,
    steps: [["setLabel", "two"]],
  },
  "the page's value is a fragment with a hole between its elements": {
    source: `
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
export default function Page() {
  return <><p class="s">a</p>{label()}<p class="s">z</p></>;
}`,
    steps: [["setLabel", "two"]],
  },
  "the page's value is text a component passes through": {
    source: `
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
function Pass(props) { return props.children; }
export default function Page() {
  return <Pass>{label()}</Pass>;
}`,
    steps: [["setLabel", "two"]],
  },
  "the page's value is a component that leads with an element": {
    source: `
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Lead(props) { return <><hr class="s" />{props.children}</>; }
export default function Page() {
  return <Lead><Show when={on()}><b>yes</b></Show></Lead>;
}`,
    steps: [
      ["setOn", false],
      ["setOn", true],
    ],
  },
  "an array holding an element as a component's children": {
    source: `
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
const lead = "lead ";
function Wrap(props) { return <section class="s">{props.children}</section>; }
export default function Page() {
  return <div><Wrap>{[lead, <b>a</b>, () => label()]}</Wrap></div>;
}`,
    steps: [["setLabel", "two"]],
  },
  "a list row whose hole moves from an element to text": {
    source: `
import { For, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
export const [list, setList] = createSignal(${ROWS}.slice(0, 2));
export default function Page() {
  return <div><For each={list()}>{(row) => <>{on() ? <b>yes</b> : "no"}</>}</For></div>;
}`,
    steps: [
      ["setOn", false],
      ["setOn", true],
    ],
  },
  "a branch arm whose hole wrote a new element is removed whole": {
    source: `
import { Switch, Match, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
export const [k, setK] = createSignal(0);
export default function Page() {
  return <div><Switch fallback={<i>none</i>}><Match when={k() !== 1}>{on() ? <b>yes</b> : "no"}</Match></Switch></div>;
}`,
    steps: [
      ["setOn", false],
      ["setOn", true],
      ["setK", 1],
    ],
  },
  "a portal that is its element's only child": {
    source: `
import { Portal } from "@barqjs/web";
import { createSignal } from "@barqjs/core";
export const [label, setLabel] = createSignal("one");
export default function Page() {
  return <div class="s"><Portal><p class="portal">{label()}</p></Portal></div>;
}`,
  },
  "a portal in a component's element leaves the next region's range alone": {
    source: `
import { Portal } from "@barqjs/web";
import { Show, createSignal } from "@barqjs/core";
export const [on, setOn] = createSignal(true);
function Dialog() { return <div class="s"><Portal><p class="portal">x</p></Portal><i>i</i></div>; }
function Frag(props) { return <>{props.children}</>; }
export default function Page() {
  return <main><Frag><Dialog /><Show when={on()}><b class="s">yes</b></Show></Frag></main>;
}`,
    steps: [
      ["setOn", false],
      ["setOn", true],
    ],
  },
};

describe("what a hydration claim leaves standing", () => {
  let index = 0;
  for (const [name, shapeOf] of Object.entries(SHAPES)) {
    const tag = `${index++}`;
    test(name, () => check(shapeOf, tag));
  }
});

describe("a branch arm whose hole wrote a new element, rendered cold", () => {
  test("is removed whole when the branch moves on", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const compiled = await compileText(
      SHAPES["a branch arm whose hole wrote a new element is removed whole"].source,
      "claims-arm-cold",
      false,
    );
    const page = host("");
    const dom = compiled.dom as unknown as Module;
    const stop = web.render(compiled.dom.default as never, page);
    try {
      dom.setOn(false as never);
      core.flush();
      dom.setOn(true as never);
      core.flush();
      dom.setK(1 as never);
      core.flush();
      expect(shape(page)).toBe("<div><i>none</i></div>");
    } finally {
      stop();
      page.remove();
    }
  });
});
