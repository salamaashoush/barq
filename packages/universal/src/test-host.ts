/**
 * An in-memory host: plain objects for nodes, every operation checked.
 *
 * A host is trusted to be asked only sensible things, so this one refuses
 * anything a real tree would not allow: an anchor that is not a child of the
 * parent, a removal from a parent the node is not in. A renderer bug then
 * fails at the operation that made it instead of as a wrong tree later.
 */

import type { HostOps } from "./renderer.ts";

export interface TestNode {
  readonly id: number;
  readonly tag: string;
  text: string;
  readonly props: Record<string, unknown>;
  parent: TestNode | null;
  readonly children: TestNode[];
}

export const TEXT = "#text";

export interface TestHost {
  ops: HostOps<TestNode>;
  /** A detached element to render into. */
  root(tag?: string): TestNode;
  /** Every structural operation since the last `reset`, as `insert`/`remove` lines. */
  readonly log: string[];
  reset(): void;
}

export function createTestHost(): TestHost {
  let next = 0;
  const log: string[] = [];

  const make = (tag: string, text = ""): TestNode => ({
    id: next++,
    tag,
    text,
    props: {},
    parent: null,
    children: [],
  });

  const detach = (node: TestNode): void => {
    const parent = node.parent;
    if (parent === null) return;
    parent.children.splice(parent.children.indexOf(node), 1);
    node.parent = null;
  };

  const ops: HostOps<TestNode> = {
    createElement: (tag) => make(tag),
    createTextNode: (value) => make(TEXT, value),
    replaceText(node, value) {
      if (node.tag !== TEXT) throw new Error(`replaceText on <${node.tag}>`);
      node.text = value;
    },
    isTextNode: (node) => node.tag === TEXT,
    setProperty(node, name, value) {
      if (value === undefined) delete node.props[name];
      else node.props[name] = value;
    },
    insertNode(parent, node, anchor) {
      if (parent.tag === TEXT) throw new Error("insertNode into a text node");
      if (anchor !== null && anchor.parent !== parent) {
        throw new Error(`insertNode before #${anchor.id}, which is not a child of #${parent.id}`);
      }
      // The document's own rule: a node put before itself stays where it is.
      if (node === anchor) anchor = parent.children[parent.children.indexOf(node) + 1] ?? null;
      for (let at: TestNode | null = parent; at !== null; at = at.parent) {
        if (at === node) throw new Error(`insertNode of #${node.id} into its own subtree`);
      }
      detach(node);
      const index = anchor === null ? parent.children.length : parent.children.indexOf(anchor);
      parent.children.splice(index, 0, node);
      node.parent = parent;
      log.push(`insert #${node.id}`);
    },
    removeNode(parent, node) {
      if (node.parent !== parent) {
        throw new Error(`removeNode of #${node.id} from #${parent.id}, which is not its parent`);
      }
      detach(node);
      log.push(`remove #${node.id}`);
    },
    getParentNode: (node) => node.parent,
    getFirstChild: (node) => node.children[0] ?? null,
    getNextSibling(node) {
      const parent = node.parent;
      if (parent === null) return null;
      return parent.children[parent.children.indexOf(node) + 1] ?? null;
    },
  };

  return {
    ops,
    root: (tag = "root") => make(tag),
    log,
    reset: () => {
      log.length = 0;
    },
  };
}

/**
 * The tree as markup: text and elements only, properties sorted, an empty
 * text node left out because it renders nothing.
 */
export function serialize(node: TestNode): string {
  if (node.tag === TEXT) return node.text;
  const props = Object.keys(node.props)
    .toSorted()
    .map((name) => {
      const value = node.props[name];
      return typeof value === "function" ? ` ${name}=fn` : ` ${name}=${JSON.stringify(value)}`;
    })
    .join("");
  return `<${node.tag}${props}>${node.children.map(serialize).join("")}</${node.tag}>`;
}

export function inner(node: TestNode): string {
  return node.children.map(serialize).join("");
}
