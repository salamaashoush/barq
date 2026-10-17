import { describe, expect, test } from "bun:test";

import { compileSource, loadModule, type FixtureModule } from "./harness.ts";
import { census, host, reuse, shape } from "./hydration.ts";

/**
 * Hydration over every shape a small grammar can build.
 *
 * A shape is a LEAF (an element, text, a hole, each flow construct) put inside a
 * CONTAINER (a component that wraps, passes through or fragments its children, a
 * fragment, a condition, a boundary, a row) and placed at a POSITION among
 * static siblings, or as the page's whole value. Every one is rendered by the
 * string module, hydrated by the DOM module, and held to the same four things:
 * no mismatch and no recovery, every server node kept, the DOM a cold render
 * builds in the same state, and the same again after every signal it reads is
 * written to each of its other values.
 *
 * The bugs this class has had were each a combination nobody wrote a fixture
 * for — text in front of a region inside a component's children, a branch
 * whose first arm is empty — so the combinations are enumerated rather than
 * sampled, and the set is ordered and bounded so a failure names the same case
 * on every run.
 */

interface State {
  on: boolean;
  k: number;
  n: number;
  label: string;
  tag: string;
}

/** The states a case is hydrated from: Show true and false, For empty, one and many. */
const STARTS: Record<string, State> = {
  shown: { on: true, k: 0, n: 1, label: "one", tag: "b" },
  hidden: { on: false, k: 1, n: 0, label: "two", tag: "i" },
  many: { on: true, k: 2, n: 3, label: "one", tag: "i" },
};

const VALUES: { [K in keyof State]: State[K][] } = {
  on: [true, false],
  k: [0, 1, 2],
  n: [0, 1, 3],
  label: ["one", "two"],
  tag: ["b", "i"],
};

/**
 * Which signal a fragment of source reads, by the call that reads it, or by the
 * helper whose source reads it.
 */
const READS: [keyof State, string][] = [
  ["on", "on()"],
  ["on", "<DynamicComponent"],
  ["k", "k()"],
  ["n", "list()"],
  ["label", "label()"],
  ["tag", "tag()"],
  ["tag", "<DynamicTag"],
];

const LEAVES: Record<string, string> = {
  element: `<span>el</span>`,
  text: `txt`,
  expression: `{label()}`,
  ternary: `{on() ? <b>yes</b> : "no"}`,
  "logical and": `{on() && <b>yes</b>}`,
  Show: `<Show when={on()}><b>yes</b></Show>`,
  "Show with fallback": `<Show when={on()} fallback={<i>no</i>}><b>yes</b></Show>`,
  "Show of text": `<Show when={on()}>yes</Show>`,
  "Show negated": `<Show when={!on()}><b>no</b></Show>`,
  Switch: `<Switch fallback={<i>none</i>}><Match when={k() === 0}><b>zero</b></Match><Match when={k() === 1}>one</Match></Switch>`,
  For: `<For each={list()}>{(row) => <li>{row.name}</li>}</For>`,
  "For with fallback": `<For each={list()} fallback={<i>empty</i>}>{(row) => <li>{row.name}</li>}</For>`,
  "For of text": `<For each={list()}>{(row) => row.name}</For>`,
  "For unkeyed": `<For each={list()} keyed={false}>{(row) => <li>{row().name}</li>}</For>`,
  Loading: `<Loading fallback={<i>wait</i>}><b>{label()}</b></Loading>`,
  Portal: `<Portal><p class="portal">{label()}</p></Portal>`,
  dynamic: `<DynamicTag>dyn</DynamicTag>`,
  "dynamic component": `<DynamicComponent>dc</DynamicComponent>`,
  Repeat: `<Repeat count={list().length}>{(i) => <u>{i}</u>}</Repeat>`,
  array: `{[<b>a</b>, label(), [<i>c</i>, "d"]]}`,
  "array built where it stands": `{[LEAD, <b>a</b>, () => label()]}`,
  "array of text built where it stands": `{[LEAD, TAIL]}`,
  "nested arrays": `{[[LEAD, [<b>a</b>, () => label()]], [() => (on() ? <i>y</i> : "n"), TAIL]]}`,
};

/** The helper components every module declares once. */
const HELPERS = `
function Wrap(props) { return <section>{props.children}</section>; }
function Pass(props) { return props.children; }
function Frag(props) { return <>{props.children}</>; }
function Lead(props) { return <><hr />{props.children}</>; }
function Tail(props) { return <>{props.children}<hr /></>; }
const DynamicTag = dynamic(() => tag());
const DynamicComponent = dynamic(() => (on() ? Wrap : Pass));
`;

interface Container {
  wrap(inner: string, id: string): { jsx: string; decl?: string };
}

const CONTAINERS: Record<string, Container> = {
  "wrapping component": { wrap: (inner) => ({ jsx: `<Wrap>${inner}</Wrap>` }) },
  "pass-through component": { wrap: (inner) => ({ jsx: `<Pass>${inner}</Pass>` }) },
  "fragment component": { wrap: (inner) => ({ jsx: `<Frag>${inner}</Frag>` }) },
  "component leading an element": { wrap: (inner) => ({ jsx: `<Lead>${inner}</Lead>` }) },
  "component trailing an element": { wrap: (inner) => ({ jsx: `<Tail>${inner}</Tail>` }) },
  "component's whole value": {
    wrap: (inner, id) => ({
      jsx: `<Whole${id} />`,
      decl: `function Whole${id}() { return ${rootValue(inner)}; }`,
    }),
  },
  "component's element beside a condition": {
    wrap: (inner, id) => ({
      jsx: `<Frag><Beside${id} /><Show when={on()}><u>u</u></Show></Frag>`,
      decl: `function Beside${id}() { return <span>${inner}<i>i</i></span>; }`,
    }),
  },
  fragment: { wrap: (inner) => ({ jsx: `<>${inner}</>` }) },
  Show: { wrap: (inner) => ({ jsx: `<Show when={on()}>${inner}</Show>` }) },
  Loading: { wrap: (inner) => ({ jsx: `<Loading fallback={<i>wait</i>}>${inner}</Loading>` }) },
  Match: {
    wrap: (inner) => ({
      jsx: `<Switch fallback={<i>none</i>}><Match when={k() !== 1}>${inner}</Match></Switch>`,
    }),
  },
  "For row": {
    wrap: (inner) => ({ jsx: `<For each={list()}>{(row) => <>${inner}</>}</For>` }),
  },
};

/** A child list as a value of its own: one element stands alone, anything else is a fragment. */
function rootValue(children: string): string {
  return /^<[A-Za-z][^]*>$/.test(children) && single(children) ? children : `<>${children}</>`;
}

/** Whether `jsx` is exactly one element, by balancing its outermost tag. */
function single(jsx: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < jsx.length) {
    if (jsx[i] === "{") {
      let braces = 0;
      do {
        if (jsx[i] === "{") braces++;
        else if (jsx[i] === "}") braces--;
        i++;
      } while (braces > 0 && i < jsx.length);
      continue;
    }
    if (jsx[i] === "<") {
      const close = jsx[i + 1] === "/";
      let j = i;
      let braces = 0;
      while (j < jsx.length && !(jsx[j] === ">" && braces === 0)) {
        if (jsx[j] === "{") braces++;
        else if (jsx[j] === "}") braces--;
        j++;
      }
      const selfClosing = jsx[j - 1] === "/";
      if (close) depth--;
      else if (!selfClosing) depth++;
      i = j + 1;
      if (depth === 0 && i < jsx.length) return false;
      continue;
    }
    if (depth === 0) return false;
    i++;
  }
  return true;
}

const POSITIONS: Record<string, (x: string) => string> = {
  alone: (x) => `<div>${x}</div>`,
  first: (x) => `<div>${x}<p class="s">z</p></div>`,
  middle: (x) => `<div><p class="s">a</p>${x}<p class="s">z</p></div>`,
  last: (x) => `<div><p class="s">a</p>${x}</div>`,
  "after text": (x) => `<div>lead ${x}</div>`,
  "before text": (x) => `<div>${x} tail</div>`,
  "page value": (x) => rootValue(x),
  "among the page's siblings": (x) => `<><p class="s">a</p>${x}<p class="s">z</p></>`,
};

/**
 * Effects that write once the page is up.
 *
 * A render effect created outside a flush applies at once, so its write lands
 * before anything built after it: declared before the view, or beside a view
 * that is still an unbuilt hole at the page's root, it makes the browser render
 * another state than the server did, and a mismatch is the right answer there.
 * It is written after a view the page has already built.
 */
const WRITERS: Record<
  string,
  { write: (to: string) => string; before: boolean; positions: string[] }
> = {
  onSettled: {
    write: (to) => `onSettled(() => { setState(${to}); });`,
    before: true,
    positions: ["middle", "page value"],
  },
  createEffect: {
    write: (to) => `createEffect(() => 0, () => { setState(${to}); });`,
    before: true,
    positions: ["middle", "page value"],
  },
  createRenderEffect: {
    write: (to) => `createRenderEffect(() => 0, () => { setState(${to}); });`,
    before: false,
    positions: ["middle"],
  },
};

interface Case {
  name: string;
  /** The page's JSX. */
  jsx: string;
  decls: string[];
  /** A write made from an effect once the page is up: where it is declared, and what it writes. */
  writer?: { code: string; before: boolean; from: string; to: State };
}

function caseOf(name: string, x: { jsx: string; decl?: string }, position: string): Case {
  return {
    name,
    jsx: POSITIONS[position](x.jsx),
    decls: x.decl === undefined ? [] : [x.decl],
  };
}

function cases(): Case[] {
  const out: Case[] = [];
  let id = 0;
  for (const [leaf, jsx] of Object.entries(LEAVES)) {
    for (const position of Object.keys(POSITIONS)) {
      out.push(caseOf(`${leaf}, ${position}`, { jsx }, position));
    }
  }
  for (const [container, c] of Object.entries(CONTAINERS)) {
    for (const [leaf, jsx] of Object.entries(LEAVES)) {
      for (const position of ["alone", "middle", "page value"]) {
        out.push(
          caseOf(`${leaf} in a ${container}, ${position}`, c.wrap(jsx, `${id++}`), position),
        );
      }
      for (const [sequence, inner] of [
        [`text then ${leaf}`, `Plan ${jsx}`],
        [`${leaf} then text`, `${jsx} tier`],
        [`${leaf} then an element`, `${jsx}<em>e</em>`],
        [`an element then ${leaf}`, `<em>e</em>${jsx}`],
      ]) {
        out.push(
          caseOf(`${sequence} in a ${container}, middle`, c.wrap(inner, `${id++}`), "middle"),
        );
      }
    }
  }
  for (const [a, x] of Object.entries(LEAVES)) {
    for (const [b, y] of Object.entries(LEAVES)) {
      out.push(caseOf(`${a} then ${b}, middle`, { jsx: `${x}${y}` }, "middle"));
    }
  }
  const DEEP = ["text", "expression", "Show", "Show negated", "For", "Switch"];
  for (const [outer, o] of Object.entries(CONTAINERS)) {
    for (const [inner, i] of Object.entries(CONTAINERS)) {
      for (const leaf of DEEP) {
        const inside = i.wrap(`Plan ${LEAVES[leaf]}`, `${id++}`);
        const outside = o.wrap(inside.jsx, `${id++}`);
        out.push({
          name: `text then ${leaf} in a ${inner} in a ${outer}, middle`,
          jsx: POSITIONS.middle(outside.jsx),
          decls: [inside.decl, outside.decl].filter((d): d is string => d !== undefined),
        });
      }
    }
  }
  for (const [kind, { write, before, positions }] of Object.entries(WRITERS)) {
    for (const placement of before ? [true, false] : [false]) {
      const where = placement ? "before the view" : "after the view";
      for (const from of Object.keys(STARTS)) {
        const to = from === "shown" ? STARTS.hidden : STARTS.shown;
        const writer = { code: write(JSON.stringify(to)), before: placement, from, to };
        for (const [leaf, jsx] of Object.entries(LEAVES)) {
          for (const position of positions) {
            out.push({
              ...caseOf(`${kind} ${where} writes ${leaf}, ${position}`, { jsx }, position),
              writer,
            });
          }
        }
        for (const [container, c] of Object.entries(CONTAINERS)) {
          const x = c.wrap(`Plan ${LEAVES.Show}`, `${id++}`);
          out.push({
            ...caseOf(`${kind} ${where} writes text then Show in a ${container}`, x, "middle"),
            writer,
          });
        }
      }
    }
  }
  return out;
}

const CASES = cases();
const BATCH = 64;

function moduleSource(batch: Case[], offset: number): string {
  const pages = batch.map((c, i) => {
    const w = c.writer;
    const body =
      w === undefined
        ? `return ${c.jsx};`
        : w.before
          ? `${w.code}\n  return ${c.jsx};`
          : `const view = ${c.jsx};\n  ${w.code}\n  return view;`;
    return `${c.decls.join("\n")}
export function Case${offset + i}() {
  ${body}
}`;
  });
  return `
import { Show, For, Repeat, Switch, Match, Loading, createSignal, onSettled, createEffect, createRenderEffect } from "@barqjs/core";
import { Portal, dynamic } from "@barqjs/web";
const ROWS = [{ id: 1, name: "r1" }, { id: 2, name: "r2" }, { id: 3, name: "r3" }];
const LEAD = "lead ";
const TAIL = "tail";
// A render effect applies where it is created, inside the page's own scope,
// and the strict build refuses a write there unless the signal says it expects
// one.
const OWNED = { ownedWrite: true };
export const [on, setOn] = createSignal(true, OWNED);
export const [k, setK] = createSignal(0, OWNED);
export const [list, setList] = createSignal(ROWS.slice(0, 1), OWNED);
export const [label, setLabel] = createSignal("one", OWNED);
export const [tag, setTag] = createSignal("b", OWNED);
export function setState(s) {
  setOn(s.on);
  setK(s.k);
  if (list().length !== s.n) setList(ROWS.slice(0, s.n));
  setLabel(s.label);
  setTag(s.tag);
}
${HELPERS}
${pages.join("\n")}
`;
}

interface Pair {
  dom: FixtureModule & Record<string, unknown>;
  ssr: FixtureModule & Record<string, unknown>;
}

const batches = new Map<string, Promise<Pair>>();

function modulesFor(index: number, dev: boolean): Promise<Pair> {
  const b = Math.floor(index / BATCH);
  const key = `${b}-${dev}`;
  let pair = batches.get(key);
  if (pair === undefined) {
    pair = (async () => {
      const source = moduleSource(CASES.slice(b * BATCH, (b + 1) * BATCH), b * BATCH);
      const tag = `grammar-${key}`;
      const dom = compileSource(source, `${tag}.tsx`, { hydratable: true, dev });
      const ssr = compileSource(source, `${tag}.tsx`, { ssr: true, hydratable: true, dev });
      return {
        dom: (await loadModule(dom, `${tag}-dom`)) as Pair["dom"],
        ssr: (await loadModule(ssr, `${tag}-ssr`)) as Pair["ssr"],
      };
    })();
    batches.set(key, pair);
  }
  return pair;
}

type Core = typeof import("@barqjs/core");

function setState(mod: Pair["dom"], state: State): void {
  (mod.setState as (s: State) => void)(state);
}

/** Everything a render shows: the host, and what its portals mounted elsewhere. */
function seen(page: HTMLElement, portals: Element[]): string {
  return `${shape(page)} | ${portals.map((p) => p.textContent).join(",")}`;
}

function portalsIn(exclude: Set<Element>): Element[] {
  return Array.from(document.querySelectorAll(".portal")).filter((p) => !exclude.has(p));
}

async function settle(core: Core): Promise<void> {
  core.flush();
  await Promise.resolve();
  core.flush();
  await Promise.resolve();
  core.flush();
}

async function cold(core: Core, mod: Pair["dom"], fn: string): Promise<string> {
  const others = new Set(document.querySelectorAll(".portal"));
  const page = host("");
  const { render } = await import("@barqjs/web");
  const stop = render(() => (mod[fn] as () => never)(), page);
  await settle(core);
  const out = seen(page, portalsIn(others));
  stop();
  page.remove();
  return out;
}

function withValue<K extends keyof State>(state: State, key: K, value: State[K]): State {
  return { ...state, [key]: value };
}

function used(c: Case): (keyof State)[] {
  const source = c.jsx + c.decls.join("");
  const out = [...new Set(READS.filter(([, read]) => source.includes(read)).map(([key]) => key))];
  if (/<For |For row/.test(source) && !out.includes("n")) out.push("n");
  return out;
}

async function run(index: number, start: State, dev: boolean): Promise<void> {
  const c = CASES[index];
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const server = await import("@barqjs/server");
  const pair = await modulesFor(index, dev);
  const fn = `Case${index}`;
  setState(pair.ssr, start);
  setState(pair.dom, start);
  core.flush();
  const markup = server.renderToString(() => (pair.ssr[fn] as () => never)());

  const others = new Set(document.querySelectorAll(".portal"));
  const page = host(markup);
  const before = census(page);
  const statics = Array.from(page.querySelectorAll(".s"));
  core.resetChildIds();
  const stop = web.hydrate(() => (pair.dom[fn] as () => never)(), page);
  const report = web.hydrate.report;
  try {
    expect({ mismatches: report.mismatches, recovered: report.recovered }).toEqual({
      mismatches: [],
      recovered: false,
    });
    if (c.writer === undefined) {
      const kept = reuse(before, page);
      expect(kept.firstLost).toBeNull();
    }
    await settle(core);
    for (const element of statics) expect(page.contains(element)).toBe(true);
    const mine = () => seen(page, portalsIn(others));
    expect(mine()).toBe(await cold(core, pair.dom, fn));

    // The cold render of a page with a writer writes too, so the state a toggle
    // set would not be the state the cold page was built in.
    if (c.writer !== undefined) return;
    let at: State = { ...start };
    for (const key of used(c)) {
      const original = at[key];
      for (const value of VALUES[key]) {
        if (value === original) continue;
        at = withValue(at, key, value);
        setState(pair.dom, at);
        await settle(core);
        expect(`${key}=${String(value)}: ${mine()}`).toBe(
          `${key}=${String(value)}: ${await cold(core, pair.dom, fn)}`,
        );
      }
      at = withValue(at, key, original);
      setState(pair.dom, at);
      await settle(core);
      expect(`${key} back: ${mine()}`).toBe(`${key} back: ${await cold(core, pair.dom, fn)}`);
    }
  } finally {
    stop();
    page.remove();
  }
}

for (const dev of [false, true]) {
  describe(`hydration grammar (${dev ? "development" : "production"} build)`, () => {
    CASES.forEach((c, index) => {
      const starts =
        c.writer === undefined
          ? Object.entries(STARTS)
          : [[c.writer.from, STARTS[c.writer.from]] as const];
      for (const [label, start] of starts) {
        test(`${c.name} [${label}]`, () => run(index, start, dev));
      }
    });
  });
}
