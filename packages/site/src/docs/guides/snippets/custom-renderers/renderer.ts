import { createRenderer } from "@barqjs/universal";

export class SceneNode {
  parent: SceneNode | null = null;
  readonly children: SceneNode[] = [];
  readonly props: Record<string, unknown> = {};

  constructor(
    readonly tag: string,
    public text = "",
  ) {}

  insertBefore(node: SceneNode, anchor: SceneNode | null): void {
    node.parent?.removeChild(node);
    const at = anchor === null ? this.children.length : this.children.indexOf(anchor);
    this.children.splice(at, 0, node);
    node.parent = this;
  }

  removeChild(node: SceneNode): void {
    this.children.splice(this.children.indexOf(node), 1);
    node.parent = null;
  }

  get nextSibling(): SceneNode | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  toString(): string {
    if (this.tag === "#text") return this.text;
    const props = Object.entries(this.props)
      .filter(([, value]) => typeof value !== "function")
      .map(([name, value]) => ` ${name}="${String(value)}"`)
      .join("");
    return `<${this.tag}${props}>${this.children.join("")}</${this.tag}>`;
  }
}

const renderer = createRenderer<SceneNode>({
  createElement: (tag) => new SceneNode(tag),
  createTextNode: (value) => new SceneNode("#text", value),
  replaceText: (node, value) => {
    node.text = value;
  },
  isTextNode: (node) => node.tag === "#text",
  setProperty: (node, name, value) => {
    node.props[name] = value;
  },
  insertNode: (parent, node, anchor) => parent.insertBefore(node, anchor),
  removeNode: (parent, node) => parent.removeChild(node),
  getParentNode: (node) => node.parent,
  getFirstChild: (node) => node.children[0] ?? null,
  getNextSibling: (node) => node.nextSibling,
});

export default renderer;

export const {
  render,
  createElement,
  createTextNode,
  insertNode,
  setProp,
  insert,
  spread,
  branch,
  each,
  boundary,
  island,
  reveal,
  portal,
  dynamic,
  Portal,
} = renderer;
