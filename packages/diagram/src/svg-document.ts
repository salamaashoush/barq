/**
 * Just enough of a DOM to build an SVG in a process that has none, and to
 * serialize it: the calls the SVG renderer and roughjs make, nothing more.
 * `exportScene` takes it as `config.environment.document`, which is how the
 * viewer renders its snapshot on the server.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

abstract class SvgNode {
  public parentNode: SvgElement | null = null;
  public abstract readonly nodeType: number;

  public constructor(public readonly ownerDocument: SvgDocument) {}

  public remove(): void {
    this.parentNode?.removeChild(this);
  }

  public abstract get textContent(): string;

  public abstract serialize(): string;
}

class SvgText extends SvgNode {
  public readonly nodeType = 3;

  public constructor(
    ownerDocument: SvgDocument,
    public data: string,
  ) {
    super(ownerDocument);
  }

  public get textContent(): string {
    return this.data;
  }

  public serialize(): string {
    return escapeText(this.data);
  }
}

class SvgComment extends SvgNode {
  public readonly nodeType = 8;

  public constructor(
    ownerDocument: SvgDocument,
    public data: string,
  ) {
    super(ownerDocument);
  }

  public get textContent(): string {
    return "";
  }

  public serialize(): string {
    return `<!--${this.data}-->`;
  }
}

class StyleDeclaration {
  private readonly values = new Map<string, string>();

  public constructor(private readonly owner: SvgElement) {
    return new Proxy(this, {
      get: (target, key) =>
        typeof key === "string" && !(key in target)
          ? (target.values.get(kebab(key)) ?? "")
          : Reflect.get(target, key),
      set: (target, key, value) => {
        if (typeof key !== "string") return false;
        target.values.set(kebab(key), String(value));
        target.owner.setAttribute("style", target.cssText);
        return true;
      },
    });
  }

  public get cssText(): string {
    return [...this.values].map(([key, value]) => `${key}: ${value};`).join(" ");
  }

  public setProperty(name: string, value: string): void {
    this.values.set(name, value);
    this.owner.setAttribute("style", this.cssText);
  }
}

class SvgElement extends SvgNode {
  public readonly nodeType = 1;
  public readonly childNodes: SvgNode[] = [];
  public readonly style: StyleDeclaration;
  private readonly attributes = new Map<string, string>();

  public constructor(
    ownerDocument: SvgDocument,
    public readonly tagName: string,
    public readonly namespaceURI: string | null,
  ) {
    super(ownerDocument);
    this.style = new StyleDeclaration(this);
  }

  public get id(): string {
    return this.attributes.get("id") ?? "";
  }

  public set id(value: string) {
    this.setAttribute("id", value);
  }

  public get firstChild(): SvgNode | null {
    return this.childNodes[0] ?? null;
  }

  public get children(): SvgElement[] {
    return this.childNodes.filter((node): node is SvgElement => node instanceof SvgElement);
  }

  public get classList(): {
    add: (...names: string[]) => void;
    contains: (name: string) => boolean;
  } {
    const names = (): string[] => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    return {
      add: (...added) => this.setAttribute("class", [...new Set([...names(), ...added])].join(" ")),
      contains: (name) => names().includes(name),
    };
  }

  public get textContent(): string {
    return this.childNodes
      .map((node) => (node instanceof SvgComment ? "" : node.textContent))
      .join("");
  }

  public set textContent(value: string) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes.length = 0;
    if (value !== "") this.appendChild(new SvgText(this.ownerDocument, value));
  }

  public get outerHTML(): string {
    return this.serialize();
  }

  public get innerHTML(): string {
    return this.childNodes.map((node) => node.serialize()).join("");
  }

  public setAttribute(name: string, value: string | number): void {
    this.attributes.set(name, String(value));
  }

  public setAttributeNS(_namespace: string | null, name: string, value: string): void {
    this.setAttribute(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  public appendChild<T extends SvgNode>(node: T): T {
    return this.insertBefore(node, null);
  }

  public append(...nodes: (SvgNode | string)[]): void {
    for (const node of nodes) this.appendChild(this.adopt(node));
  }

  public prepend(...nodes: (SvgNode | string)[]): void {
    const first = this.firstChild;
    for (const node of nodes) this.insertBefore(this.adopt(node), first);
  }

  public insertBefore<T extends SvgNode>(node: T, reference: SvgNode | null): T {
    node.remove();
    const at = reference === null ? -1 : this.childNodes.indexOf(reference);
    if (at === -1) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    node.parentNode = this;
    return node;
  }

  public removeChild<T extends SvgNode>(node: T): T {
    const at = this.childNodes.indexOf(node);
    if (at !== -1) this.childNodes.splice(at, 1);
    node.parentNode = null;
    return node;
  }

  /** `#id`, a tag name, or `.class`: the selectors the renderer asks for. */
  public querySelector(selector: string): SvgElement | null {
    const matches = (element: SvgElement): boolean =>
      selector.startsWith("#")
        ? element.id === selector.slice(1)
        : selector.startsWith(".")
          ? element.classList.contains(selector.slice(1))
          : element.tagName === selector;
    for (const child of this.children) {
      if (matches(child)) return child;
      const found = child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
  }

  public serialize(): string {
    let attributes = "";
    for (const [name, value] of this.attributes)
      attributes += ` ${name}="${escapeAttribute(value)}"`;
    if (this.tagName === "svg" && !this.attributes.has("xmlns") && this.namespaceURI === SVG_NS) {
      attributes = ` xmlns="${SVG_NS}"${attributes}`;
    }
    const inner = this.tagName === "style" ? this.textContent : this.innerHTML;
    // Closed explicitly rather than self-closed: markup inlined into an HTML
    // page is read by HTML parsers too, and not all of them honour `/>` on a
    // foreign element.
    return `<${this.tagName}${attributes}>${inner}</${this.tagName}>`;
  }

  private adopt(node: SvgNode | string): SvgNode {
    return typeof node === "string" ? new SvgText(this.ownerDocument, node) : node;
  }
}

export class SvgDocument {
  public createElementNS(namespace: string | null, tagName: string): SvgElement {
    return new SvgElement(this, tagName, namespace);
  }

  public createElement(tagName: string): SvgElement {
    return new SvgElement(this, tagName, null);
  }

  public createTextNode(data: string): SvgText {
    return new SvgText(this, data);
  }

  public createComment(data: string): SvgComment {
    return new SvgComment(this, data);
  }
}

/**
 * A document to build an SVG export in where there is no DOM, typed as the
 * `Document` the export asks for. Serialize the result with `outerHTML`.
 */
export function createSvgDocument(): Document {
  return new SvgDocument() as unknown as Document;
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
