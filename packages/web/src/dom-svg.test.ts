/**
 * SVG prop application.
 *
 * happy-dom models SVGElement.className as a writable string, so it hides the
 * real-browser behaviour: on SVGElement.prototype `className` is a get-only
 * SVGAnimatedString, and assigning to it throws in strict mode (all module
 * code) or silently no-ops in sloppy mode. `withReadOnlyClassName` reinstates
 * the browser's property shape so these tests exercise what ships.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { element, setProp, spread } from "./dom.ts";
import { createRoot, flush, createSignal } from "@barqjs/core";

const SVG_NS = "http://www.w3.org/2000/svg";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

/** Give an element the browser's get-only SVGAnimatedString className */
function withReadOnlyClassName<T extends Element>(el: T): T {
  Object.defineProperty(el, "className", {
    configurable: true,
    get() {
      const value = el.getAttribute("class") ?? "";
      return { baseVal: value, animVal: value };
    },
  });
  return el;
}

function svg(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag);
}

/**
 * The same shape, installed on the prototype, for the paths that build their own
 * element and never hand it out before applying props.
 */
function withReadOnlySvgPrototype<T>(fn: () => T): T {
  const proto = SVGElement.prototype as unknown as Element;
  const original = Object.getOwnPropertyDescriptor(proto, "className");
  Object.defineProperty(proto, "className", {
    configurable: true,
    get(this: Element) {
      const value = this.getAttribute("class") ?? "";
      return { baseVal: value, animVal: value };
    },
  });
  try {
    return createRoot(() => fn());
  } finally {
    if (original) {
      Object.defineProperty(proto, "className", original);
    } else {
      delete (proto as unknown as Record<string, unknown>).className;
    }
  }
}

describe("SVG className is read-only in browsers", () => {
  test("the shim really is get-only (guards the test itself)", () => {
    const el = withReadOnlyClassName(svg("circle"));
    expect(() => {
      (el as unknown as { className: unknown }).className = "boom";
    }).toThrow();
    expect(el.getAttribute("class")).toBe(null);
  });

  test("static class on an SVG element lands on the class attribute", () => {
    const el = withReadOnlyClassName(svg("circle"));
    setProp(el, "class", "ring");
    expect(el.getAttribute("class")).toBe("ring");
  });

  test("className key on an SVG element lands on the class attribute", () => {
    const el = withReadOnlyClassName(svg("circle"));
    setProp(el, "className", "ring");
    expect(el.getAttribute("class")).toBe("ring");
  });

  test("reactive class on an SVG element updates on signal change", () => {
    const el = withReadOnlyClassName(svg("rect"));
    const [active, setActive] = createSignal(false);
    createRoot(() => setProp(el, "class", () => (active() ? "on" : "off")));

    expect(el.getAttribute("class")).toBe("off");
    setActive(true);
    flush();
    expect(el.getAttribute("class")).toBe("on");
  });

  test("object and array class values normalize on SVG", () => {
    const objEl = withReadOnlyClassName(svg("path"));
    setProp(objEl, "class", { a: true, b: false, c: true });
    expect(objEl.getAttribute("class")).toBe("a c");

    const arrEl = withReadOnlyClassName(svg("path"));
    setProp(arrEl, "class", ["x", "", "y"]);
    expect(arrEl.getAttribute("class")).toBe("x y");
  });

  test("nullish class removes the attribute on SVG", () => {
    const el = withReadOnlyClassName(svg("circle"));
    const [cls, setCls] = createSignal<string | null>("ring");
    createRoot(() => setProp(el, "class", () => cls()));
    expect(el.getAttribute("class")).toBe("ring");

    setCls(null);
    flush();
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("spread applies class to an SVG element", () => {
    const el = withReadOnlyClassName(svg("circle"));
    const [props, setProps] = createSignal<Record<string, unknown>>({ class: "one", r: "4" });
    createRoot(() => spread(el, () => props()));

    expect(el.getAttribute("class")).toBe("one");
    expect(el.getAttribute("r")).toBe("4");

    setProps({ class: "two", r: "4" });
    flush();
    expect(el.getAttribute("class")).toBe("two");
  });

  test("createElement applies class to an SVG element", () => {
    const el = withReadOnlySvgPrototype(() => element("circle", { class: "ring" }) as SVGElement);
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute("class")).toBe("ring");
  });

  test("the prototype shim really is get-only (guards the test above)", () => {
    withReadOnlySvgPrototype(() => {
      const el = svg("circle");
      expect(() => {
        (el as unknown as { className: unknown }).className = "boom";
      }).toThrow();
    });
    // and it is restored, so the shim cannot leak into later files
    const after = svg("circle");
    (after as unknown as { className: unknown }).className = "plain";
    expect(typeof (after as unknown as { className: unknown }).className).toBe("string");
  });

  test("HTML elements keep using the className property path", () => {
    const el = document.createElement("div");
    setProp(el, "class", "card");
    expect(el.className).toBe("card");
    expect(el.getAttribute("class")).toBe("card");
  });
});

describe("SVG style", () => {
  test("style object applies to an SVG element", () => {
    const el = svg("circle");
    setProp(el, "style", { fill: "red", strokeWidth: "2px" });
    expect(el.style.getPropertyValue("fill")).toBe("red");
    expect(el.style.getPropertyValue("stroke-width")).toBe("2px");
  });

  test("style string applies to an SVG element", () => {
    const el = svg("rect");
    setProp(el, "style", "fill: blue");
    expect(el.style.getPropertyValue("fill")).toBe("blue");
  });

  test("reactive style object diffs and removes vanished properties on SVG", () => {
    const el = svg("circle");
    const [style, setStyle] = createSignal<Record<string, unknown>>({ fill: "red", opacity: 1 });
    createRoot(() => setProp(el, "style", () => style()));
    expect(el.style.getPropertyValue("fill")).toBe("red");
    expect(el.style.getPropertyValue("opacity")).toBe("1");

    setStyle({ fill: "green" });
    flush();
    expect(el.style.getPropertyValue("fill")).toBe("green");
    expect(el.style.getPropertyValue("opacity")).toBe("");
  });

  test("HTML style object still applies", () => {
    const el = document.createElement("div");
    setProp(el, "style", { color: "red", marginTop: 4 });
    expect(el.style.getPropertyValue("color")).toBe("red");
    expect(el.style.getPropertyValue("margin-top")).toBe("4px");
  });
});

describe("SVG dangerouslySetInnerHTML", () => {
  test("writes markup instead of a stringified attribute", () => {
    const el = svg("g");
    setProp(el, "dangerouslySetInnerHTML", { __html: "<circle r='1'></circle>" });
    expect(el.hasAttribute("dangerously-set-inner-html")).toBe(false);
    expect(el.childNodes.length).toBe(1);
  });
});

describe("SVG class values", () => {
  // `class` on an SVG element has to reach the attribute and never touch
  // `.className`, which on an SVG element is get-only, whatever shape the value
  // takes.

  test("a map writes its truthy keys without touching className", () => {
    const el = withReadOnlyClassName(svg("circle"));
    setProp(el, "class", { ring: true, hidden: false });
    expect(el.getAttribute("class")).toBe("ring");
  });

  test("a reactive list follows its source", () => {
    const el = withReadOnlyClassName(svg("circle"));
    const [state, setState] = createSignal<Record<string, unknown>>({ ring: true, busy: true });
    createRoot(() => setProp(el, "class", () => ["dot", state()]));
    expect(el.getAttribute("class")).toBe("dot ring busy");

    setState({ busy: true, done: true });
    flush();
    expect(el.getAttribute("class")).toBe("dot busy done");
  });

  test("createElement applies a list to an SVG element", () => {
    const el = withReadOnlySvgPrototype(
      () => element("circle", { class: ["dot", { ring: true }] }) as SVGElement,
    );
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute("class")).toBe("dot ring");
  });

  test("spread applies a map to an SVG element", () => {
    const el = withReadOnlyClassName(svg("circle"));
    const [props, setProps] = createSignal<Record<string, unknown>>({ class: { ring: true } });
    createRoot(() => spread(el, () => props()));
    expect(el.getAttribute("class")).toBe("ring");

    setProps({ class: { done: true } });
    flush();
    expect(el.getAttribute("class")).toBe("done");
  });
});
