/**
 * Where a component called as a function finds the host it renders through:
 * the one its owner provides, else the one a renderer installed, else nowhere,
 * which is an error naming the component.
 */

import { describe, expect, test } from "bun:test";

import { Show } from "./components.ts";
import { HOST, type RangeHost, type SyncRows, setDefaultHost } from "./flow.ts";
import { createRoot, getOwner, provideOn, runWithOwner } from "./signals.ts";
import type { Scope } from "./scope.ts";

interface Item {
  label: string;
  parent: Item | null;
  children: Item[];
}

/** A host over plain objects, labelled so a test can tell two hosts apart. */
function memoryHost(name: string): RangeHost<Item> {
  const make = (label: string): Item => ({ label: `${name}:${label}`, parent: null, children: [] });
  const detach = (node: Item): void => {
    if (node.parent === null) return;
    node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = null;
  };
  const sibling = (node: Item, step: number): Item | null =>
    node.parent?.children[node.parent.children.indexOf(node) + step] ?? null;
  return {
    sentinel: () => make("sentinel"),
    park: () => make("park"),
    isPark: (node) => node.label === `${name}:park`,
    parentOf: (node) => node.parent,
    nextOf: (node) => sibling(node, 1),
    prevOf: (node) => sibling(node, -1),
    firstOf: (parent) => parent.children[0] ?? null,
    lastOf: (parent) => parent.children.at(-1) ?? null,
    row: (nodes) => nodes,
    toNodes: (child) => (child === null || child === undefined ? [] : [make(String(child))]),
    insertRange(parent, nodes, before) {
      for (const node of nodes) {
        detach(node);
        const at = before === null ? parent.children.length : parent.children.indexOf(before);
        parent.children.splice(at, 0, node);
        node.parent = parent;
      }
    },
    removeRange(nodes) {
      for (const node of nodes) detach(node);
    },
  };
}

const unused: SyncRows<Item> = () => {
  throw new Error("Show never reorders a list");
};

function labels(rendered: unknown): string[] {
  const nodes = (Array.isArray(rendered) ? rendered : [rendered]) as Item[];
  return nodes.flatMap((node) => [node.label, ...node.children.map((child) => child.label)]);
}

function shown(provide?: RangeHost<Item>): string[] {
  return runWithOwner(null, () =>
    createRoot((dispose) => {
      try {
        const root = getOwner() as Scope;
        if (provide !== undefined) provideOn(root, HOST, { host: provide, sync: unused });
        return labels(Show({ when: true, children: "yes" }));
      } finally {
        dispose();
      }
    }),
  );
}

describe("a component called as a function", () => {
  test("with no host anywhere, says which component and what to import", () => {
    expect(() => shown()).toThrow('`<Show>` was called as a component with no renderer');
    expect(() => shown()).toThrow('import "@barqjs/web/host"');
  });

  test("renders through the host its owner provides", () => {
    expect(shown(memoryHost("provided"))).toContain("provided:yes");
  });

  test("falls back to the installed host, and an owner's host still wins over it", () => {
    setDefaultHost(memoryHost("installed"), unused);
    expect(shown()).toContain("installed:yes");
    expect(shown(memoryHost("provided"))).toContain("provided:yes");
    expect(shown(memoryHost("provided"))).not.toContain("installed:yes");
  });
});
