/**
 * The document's list reorder and this package's are two implementations of
 * one algorithm, and this is what stops them drifting: the same seeded edits
 * go through `@barqjs/web` in happy-dom and through `createRenderer` over the
 * in-memory host, and after every step the two trees must hold the same rows
 * in the same order, with the same rows kept rather than rebuilt.
 */

import { describe, expect, test } from "bun:test";

import { block, createRoot, createSignal, flush, type Accessor } from "@barqjs/core";
import { branch as domBranch, each as domEach, insert as domInsert } from "@barqjs/web";
import { createRenderer } from "./renderer.ts";
import { TEXT, createTestHost, type TestNode } from "./test-host.ts";

const host = createTestHost();
const r = createRenderer(host.ops);

/** A small deterministic generator, so a failure names a seed that reproduces it. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What one side builds with: an element holding text, and the row's own pieces. */
interface Side<N extends object> {
  root: N;
  element(tag: string, text?: string | Accessor<string>): N;
  each(
    parent: N,
    src: Accessor<readonly unknown[]>,
    carrier: ((item: unknown) => unknown) | false | null,
    row: (item: unknown) => unknown,
  ): void;
  branch(parent: N | null, key: Accessor<number>, bodies: unknown[]): unknown;
  /** Element children in order, as `tag:text`, and the nodes themselves. */
  read(): { labels: string[]; nodes: object[] };
}

function domSide(): Side<Node> {
  const root = document.createElement("div");
  const element = (tag: string, text?: string | Accessor<string>): Node => {
    const node = document.createElement(tag);
    if (typeof text === "string") node.textContent = text;
    else if (text !== undefined) domInsert(node, text);
    return node;
  };
  return {
    root,
    element,
    each: (parent, src, carrier, row) => {
      domEach(parent, null, src, carrier, row as never);
    },
    branch: (parent, key, bodies) => domBranch(parent, null, key, bodies as never),
    read: () => {
      const elements = [...root.childNodes].filter((node) => node.nodeType === 1) as Element[];
      return {
        labels: elements.map((node) => `${node.localName}:${node.textContent}`),
        nodes: elements,
      };
    },
  };
}

function textOf(node: TestNode): string {
  return node.tag === TEXT ? node.text : node.children.map(textOf).join("");
}

function hostSide(): Side<TestNode> {
  const root = host.root("div");
  const element = (tag: string, text?: string | Accessor<string>): TestNode => {
    const node = r.createElement(tag);
    if (typeof text === "string") r.insertNode(node, r.createTextNode(text));
    else if (text !== undefined) r.insert(node, text);
    return node;
  };
  return {
    root,
    element,
    each: (parent, src, carrier, row) => {
      r.each(parent, null, src, carrier, row);
    },
    branch: (parent, key, bodies) => r.branch(parent, null, key, bodies as never),
    read: () => {
      const elements = root.children.filter((node) => node.tag !== TEXT);
      return {
        labels: elements.map((node) => `${node.tag}:${textOf(node)}`),
        nodes: elements,
      };
    },
  };
}

type Mode = "identity" | "key" | "index" | "live rows";

interface Item {
  id: number;
}

/** One random edit of a list of distinct items, new ids drawn from `fresh`. */
function edit(list: Item[], next: () => number, fresh: () => Item): Item[] {
  const out = list.slice();
  const at = (): number => Math.floor(next() * (out.length + 1));
  const pick = (): number => Math.floor(next() * out.length);
  switch (Math.floor(next() * 10)) {
    case 0:
      out.splice(at(), 0, fresh());
      return out;
    case 1:
      if (out.length > 0) out.splice(pick(), 1);
      return out;
    case 2: {
      if (out.length < 2) return out;
      const [moved] = out.splice(pick(), 1);
      out.splice(at() % (out.length + 1), 0, moved);
      return out;
    }
    case 3: {
      if (out.length < 2) return out;
      const a = pick();
      const b = pick();
      [out[a], out[b]] = [out[b], out[a]];
      return out;
    }
    case 4:
      return out.toReversed();
    case 5:
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    case 6:
      return next() < 0.3 ? [] : out.slice(Math.floor(next() * out.length));
    case 7:
      return out.map((item) => (next() < 0.3 ? fresh() : item));
    case 8:
      for (let n = Math.floor(next() * 4) + 1; n > 0; n--) out.push(fresh());
      return out;
    default: {
      const kept = out.filter(() => next() < 0.6);
      for (let n = Math.floor(next() * 3); n > 0; n--) {
        kept.splice(Math.floor(next() * (kept.length + 1)), 0, fresh());
      }
      return kept;
    }
  }
}

interface Frame {
  labels: string[];
  /** Per position, whether the node there is the one the same label had a step before. */
  kept: boolean[];
}

function runList<N extends object>(
  make: () => Side<N>,
  mode: Mode,
  seed: number,
  steps: number,
): Frame[] {
  const side = make();
  const next = random(seed);
  let counter = 0;
  const fresh = (): Item => ({ id: counter++ });
  let list: Item[] = Array.from({ length: 5 }, fresh);
  const [items, setItems] = createSignal<Item[]>(list);
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set());
  const frames: Frame[] = [];
  let previous = new Map<string, object>();

  const snapshot = (): void => {
    const { labels, nodes } = side.read();
    frames.push({ labels, kept: labels.map((label, i) => previous.get(label) === nodes[i]) });
    previous = new Map(labels.map((label, i) => [label, nodes[i]]));
  };

  const row = (item: unknown): unknown => {
    if (mode === "index") {
      const read = item as Accessor<Item>;
      return side.element("li", () => `#${read().id}`);
    }
    const id = (mode === "key" ? (item as Accessor<Item>)() : (item as Item)).id;
    const li = side.element("li", `#${id}`);
    if (mode !== "live rows") return li;
    return [
      li,
      side.branch(null, () => (open().has(id) ? 1 : 0), [
        null,
        block(() => [side.element("em", `open ${id}`), side.element("b", `${id}`)]),
      ]),
    ];
  };

  const dispose = createRoot((done) => {
    const carrier =
      mode === "key" ? (item: unknown) => (item as Item).id : mode === "index" ? false : null;
    side.each(side.root, items, carrier, row);
    return done;
  });
  flush();
  snapshot();
  for (let step = 0; step < steps; step++) {
    list = edit(list, next, fresh);
    setItems(list);
    if (mode === "live rows") {
      const toggled = new Set(open());
      for (const item of list) {
        if (next() < 0.25) {
          if (toggled.has(item.id)) toggled.delete(item.id);
          else toggled.add(item.id);
        }
      }
      setOpen(toggled);
    }
    flush();
    snapshot();
  }
  dispose();
  return frames;
}

function runBranch<N extends object>(make: () => Side<N>, seed: number, steps: number): Frame[] {
  const side = make();
  const next = random(seed);
  const [key, setKey] = createSignal(0);
  const frames: Frame[] = [];
  let previous = new Map<string, object>();
  const snapshot = (): void => {
    const { labels, nodes } = side.read();
    frames.push({ labels, kept: labels.map((label, i) => previous.get(label) === nodes[i]) });
    previous = new Map(labels.map((label, i) => [label, nodes[i]]));
  };
  const dispose = createRoot((done) => {
    side.branch(side.root, key, [
      block(() => side.element("a", "zero")),
      null,
      block(() => [side.element("b", "two"), side.element("c", "two")]),
      block(() => [
        side.element("d", "three"),
        side.branch(null, () => key() % 2, [block(() => side.element("e", "inner"))]),
      ]),
    ]);
    return done;
  });
  flush();
  snapshot();
  for (let step = 0; step < steps; step++) {
    setKey(Math.floor(next() * 4));
    flush();
    snapshot();
  }
  dispose();
  return frames;
}

const SEEDS = Array.from({ length: 40 }, (_, index) => 1 + index * 7919);

describe("the document's list reorder and the universal one agree", () => {
  for (const mode of ["identity", "key", "index", "live rows"] as const) {
    test(`${mode}: same rows, same order, same nodes kept, over ${SEEDS.length} seeds`, () => {
      for (const seed of SEEDS) {
        const dom = runList(domSide, mode, seed, 30);
        const universal = runList(hostSide, mode, seed, 30);
        expect({ seed, frames: universal }).toEqual({ seed, frames: dom });
      }
    });
  }

  test(`branch swaps keep and rebuild the same arms, over ${SEEDS.length} seeds`, () => {
    for (const seed of SEEDS) {
      const dom = runBranch(domSide, seed, 30);
      const universal = runBranch(hostSide, seed, 30);
      expect({ seed, frames: universal }).toEqual({ seed, frames: dom });
    }
  });

  test("the suite is not vacuous: rows move, rows are kept and rows are rebuilt", () => {
    let kept = 0;
    let rebuilt = 0;
    let reordered = 0;
    for (const seed of SEEDS) {
      const frames = runList(hostSide, "identity", seed, 30);
      for (let i = 1; i < frames.length; i++) {
        const before = frames[i - 1].labels;
        const survivors = frames[i].labels.filter((_, at) => frames[i].kept[at]);
        kept += survivors.length;
        rebuilt += frames[i].kept.filter((value) => !value).length;
        const order = before.filter((label) => survivors.includes(label));
        if (order.join(",") !== survivors.join(",")) reordered++;
      }
    }
    expect(kept).toBeGreaterThan(1000);
    expect(rebuilt).toBeGreaterThan(100);
    expect(reordered).toBeGreaterThan(200);
  });
});
