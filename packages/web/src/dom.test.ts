/**
 * DOM Tests - Edge cases for rendering, reactivity, and prop handling
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { bindProp, element, insert, render, setProp, setStyle, spread, template } from "./dom.ts";
import { boundary } from "./dom-flow.ts";
import {
  ScopeMissingError,
  block,
  createMemo,
  createRoot,
  rootScope,
  runWithOwner,
  flush,
  createSignal,
} from "@barqjs/core";
import { disposeScope } from "@barqjs/core/internal";

// The container is a render root, as every element an application shows is
// under one: a delegated handler outside a root has nothing listening for it.
let container: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  unmount = render(() => null, container);
});

afterEach(() => {
  unmount();
  container.remove();
});

describe("element — one element by tag NAME (§3.13 items 1 and 4)", () => {
  // M9 deleted `createElement`. What replaces it is not a rename: `element`
  // takes its scope FIRST, builds by tag name only, and applies props through
  // `spread` and children through `insert` — the same two entry points a
  // compiled element uses, minus the clone. A component is no longer something
  // this function can invoke; C1 says a component call is a plain call, so the
  // two tests at the bottom of this block call theirs directly.
  test("creates basic HTML element", () => {
    const el = createRoot(() => element("div", {})) as HTMLDivElement;
    expect(el.tagName).toBe("DIV");
  });

  test("creates element with static props", () => {
    const el = createRoot(() =>
      element("div", { id: "test", class: "my-class" }),
    ) as HTMLDivElement;
    expect(el.id).toBe("test");
    expect(el.className).toBe("my-class");
  });

  test("creates element with children", () => {
    const el = createRoot(() =>
      element("div", { children: ["hello", " ", "world"] }),
    ) as HTMLDivElement;
    expect(el.textContent).toBe("hello world");
  });

  test("creates SVG element", () => {
    const el = createRoot(() => element("svg", { viewBox: "0 0 100 100" })) as SVGSVGElement;
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("creates nested SVG elements", () => {
    const el = createRoot(() =>
      element("svg", {
        viewBox: "0 0 100 100",
        children: element("circle", { cx: "50", cy: "50", r: "40" }),
      }),
    ) as SVGSVGElement;

    const circle = el.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("there is no fragment TAG — a fragment is an array (C8)", () => {
    // `createElement("fragment", …)` built a DocumentFragment. Nothing emits
    // that: a fragment is a compile-time multi-root unit, so what a position
    // receives is the ARRAY, and `insert` flattens it like any other child.
    // Asking `element` for a "fragment" tag now builds an element named
    // `fragment`, which is what a tag name means and is the honest answer.
    const host = document.createElement("div");
    insert(host, ["a", "b", "c"]);
    expect(host.textContent).toBe("abc");
  });

  test("handles component functions", () => {
    const MyComponent = (props: { name: string }) => {
      return element("span", { children: `Hello ${props.name}` });
    };

    const el = createRoot(() => MyComponent({ name: "World" })) as HTMLSpanElement;
    expect(el.textContent).toBe("Hello World");
  });

  test("component receives children prop", () => {
    const Wrapper = (props: { children: unknown }) => {
      return element("div", { class: "wrapper", children: props.children });
    };

    const el = createRoot(() => Wrapper({ children: "content" })) as HTMLDivElement;
    expect(el.className).toBe("wrapper");
    expect(el.textContent).toBe("content");
  });
});

describe("Event handling", () => {
  // Common events are delegated to the render root's listener (like Solid),
  // so elements must be inside a root and events must bubble.
  test("attaches onClick handler (delegated)", () => {
    let clicked = false;
    const el = createRoot(() =>
      element("button", {
        onClick: () => {
          clicked = true;
        },
      }),
    ) as HTMLButtonElement;

    container.appendChild(el);
    el.click();
    expect(clicked).toBe(true);
  });

  test("attaches onInput handler (delegated)", () => {
    let value = "";
    const el = createRoot(() =>
      element("input", {
        onInput: (e: Event) => {
          value = (e.target as HTMLInputElement).value;
        },
      }),
    ) as HTMLInputElement;

    container.appendChild(el);
    el.value = "test";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    expect(value).toBe("test");
  });

  test("delegated click bubbles from a nested child", () => {
    let clicks = 0;
    const el = createRoot(() =>
      element("div", {
        onClick: () => clicks++,
        children: element("span", { children: "inner" }),
      }),
    ) as HTMLDivElement;

    container.appendChild(el);
    (el.querySelector("span") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toBe(1);
  });

  test("stopPropagation halts the delegated walk", () => {
    let outerClicks = 0;
    const el = createRoot(() =>
      element("div", {
        onClick: () => outerClicks++,
        children: element("button", { onClick: (e: Event) => e.stopPropagation() }),
      }),
    ) as HTMLDivElement;

    container.appendChild(el);
    (el.querySelector("button") as HTMLButtonElement).click();
    expect(outerClicks).toBe(0);
  });

  test("handles multiple event handlers (delegated + direct)", () => {
    const events: string[] = [];
    const el = createRoot(() =>
      element("button", {
        onClick: () => events.push("click"),
        // mouseenter/mouseleave do not bubble: attached directly
        onMouseEnter: () => events.push("enter"),
        onMouseLeave: () => events.push("leave"),
      }),
    ) as HTMLButtonElement;

    container.appendChild(el);
    el.click();
    el.dispatchEvent(new MouseEvent("mouseenter"));
    el.dispatchEvent(new MouseEvent("mouseleave"));

    expect(events).toEqual(["click", "enter", "leave"]);
  });
});

describe("Ref handling", () => {
  test("ref callback is called with element", () => {
    let refEl: Element | null = null;
    const el = createRoot(() =>
      element("div", {
        ref: (node: Element) => {
          refEl = node;
        },
      }),
    ) as HTMLDivElement;

    expect(refEl as Element | null).toBe(el);
  });

  test("ref object is set", () => {
    // M9 deleted the `useRef()` FACTORY — a ref is a writable binding
    // (B3) or a callback, and the box is one object literal. The `{current}`
    // SHAPE is still a ref the channel writes, which is what this asserts.
    const ref: { current: HTMLDivElement | null } = { current: null };
    const el = createRoot(() => element("div", { ref })) as HTMLDivElement;

    expect(ref.current).toBe(el);
  });
});

describe("Style handling", () => {
  test("applies style object", () => {
    const el = createRoot(() =>
      element("div", {
        style: { color: "red", fontSize: "16px" },
      }),
    ) as HTMLDivElement;

    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  test("applies style string", () => {
    const el = createRoot(() =>
      element("div", { style: "color: blue; font-size: 14px" }),
    ) as HTMLDivElement;

    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("14px");
  });

  test("a string style keeps the author's bytes in the attribute", () => {
    // The compiler folds a literal style into the template HTML, where the
    // parser stores it verbatim. Writing it through style.cssText instead would
    // round-trip it through the CSSOM serializer (which appends ";"), and the
    // compiled and un-compiled paths would then disagree on the attribute.
    const literal = "color: red; font-weight: bold";
    const el = createRoot(() => element("div", { style: literal })) as HTMLDivElement;
    expect(el.getAttribute("style")).toBe(literal);

    const parsed = document.createElement("template");
    parsed.innerHTML = `<div style="${literal}"></div>`;
    expect((parsed.content.firstChild as Element).getAttribute("style")).toBe(
      el.getAttribute("style"),
    );
  });

  test("handles numeric values with px suffix", () => {
    const el = createRoot(() =>
      element("div", { style: { width: 100, height: 50 } }),
    ) as HTMLDivElement;

    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("50px");
  });

  test("handles unitless CSS properties", () => {
    const el = createRoot(() =>
      element("div", {
        style: { zIndex: 10, opacity: 0.5, flexGrow: 1 },
      }),
    ) as HTMLDivElement;

    expect(el.style.zIndex).toBe("10");
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.flexGrow).toBe("1");
  });

  test("handles zero values without px", () => {
    const el = createRoot(() =>
      element("div", { style: { margin: 0, padding: 0 } }),
    ) as HTMLDivElement;

    // Browsers normalize "0" to "0px" for length properties
    expect(el.style.margin).toBe("0px");
    expect(el.style.padding).toBe("0px");
  });

  test("reactive style properties", () => {
    const [color, setColor] = createSignal("red");
    const el = createRoot(() => element("div", { style: { color } })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.color).toBe("red");

    setColor("blue");
    flush();
    expect(el.style.color).toBe("blue");
  });

  test("a live key in an object that ARRIVES through a prop belongs to the binding", () => {
    // The object is static and one key of it is live. It reaches the element
    // through a Cell, so the write half is what first sees the getter, and the
    // write half runs where nothing owns an effect: the key has to be read in
    // the binding's own read half, and has to stop with the binding's scope.
    const [color, setColor] = createSignal("red");
    const [style] = createSignal({ color });
    const el = document.createElement("div");
    const root = rootScope();
    runWithOwner(root, () => bindProp(el, setStyle, "style", style));
    flush();
    expect(el.style.color).toBe("red");

    setColor("blue");
    flush();
    expect(el.style.color).toBe("blue");

    disposeScope(root);
    setColor("green");
    flush();
    expect(el.style.color, "the key outlived the scope that bound it").toBe("blue");
  });

  test("removes style property when null", () => {
    const [width, setWidth] = createSignal<number | null>(100);
    const el = createRoot(() => element("div", { style: { width } })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.width).toBe("100px");

    setWidth(null);
    flush();
    expect(el.style.width).toBe("");
  });
});

describe("Class handling", () => {
  test("applies class string", () => {
    const el = createRoot(() => element("div", { class: "foo bar" })) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies className string", () => {
    const el = createRoot(() => element("div", { className: "foo bar" })) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies class array", () => {
    const el = createRoot(() => element("div", { class: ["foo", "bar", "baz"] })) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("filters falsy values from class array", () => {
    const el = createRoot(() =>
      element("div", {
        class: ["foo", "", null, "bar", false, "baz"],
      }),
    ) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("applies class object", () => {
    const el = createRoot(() =>
      element("div", {
        class: { foo: true, bar: false, baz: true },
      }),
    ) as HTMLDivElement;
    expect(el.className).toBe("foo baz");
  });

  test("removes class when value is null", () => {
    const el = createRoot(() => element("div", { class: null })) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("removes class when value is false", () => {
    const el = createRoot(() => element("div", { class: false })) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });

  // A caller that does not thread `prev` used to leave every token it had ever
  // written on the element, because the diff was against `null` and removed
  // nothing. The channel remembers its own last write instead.
  test("repeated one-shot writes replace rather than accumulate", () => {
    const el = document.createElement("div");
    for (let i = 0; i < 5; i++) setProp(el, "class", `c${i}`);
    flush();
    expect(el.getAttribute("class")).toBe("c4");
    expect(el.classList.length).toBe(1);
  });

  // And it still removes only what it OWNS: a token another channel put there
  // survives, which is the invariant the diff path exists for.
  test("a one-shot write keeps tokens this channel never wrote", () => {
    const el = document.createElement("div");
    el.setAttribute("class", "from-markup");
    setProp(el, "class", "a");
    setProp(el, "class", "b");
    flush();
    expect([...el.classList].toSorted()).toEqual(["b", "from-markup"]);
  });
});

describe("Reactive props", () => {
  test("updates prop when signal changes", () => {
    const [title, setTitle] = createSignal("initial");
    const el = createRoot(() => element("div", { title })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("initial");

    setTitle("updated");
    flush();
    expect(el.title).toBe("updated");
  });

  test("updates attribute when signal changes", () => {
    const [ariaLabel, setAriaLabel] = createSignal("label 1");
    const el = createRoot(() => element("div", { "aria-label": ariaLabel })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.getAttribute("aria-label")).toBe("label 1");

    setAriaLabel("label 2");
    flush();
    expect(el.getAttribute("aria-label")).toBe("label 2");
  });

  test("handles boolean attribute reactively", () => {
    const [disabled, setDisabled] = createSignal(true);
    const el = createRoot(() => element("button", { disabled })) as HTMLButtonElement;

    container.appendChild(el);
    expect(el.hasAttribute("disabled")).toBe(true);

    setDisabled(false);
    flush();
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("handles computed prop values", () => {
    const [count, setCount] = createSignal(0);
    const label = createMemo(() => `Count: ${count()}`);
    const el = createRoot(() => element("div", { title: label })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("Count: 0");

    setCount(5);
    flush();
    expect(el.title).toBe("Count: 5");
  });
});

describe("Reactive children", () => {
  test("updates text content from signal", () => {
    const [text, setText] = createSignal("hello");
    const el = createRoot(() => element("div", { children: text })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("hello");

    setText("world");
    flush();
    expect(el.textContent).toContain("world");
  });

  test("updates text from computed", () => {
    const [count, setCount] = createSignal(0);
    const label = createMemo(() => `Count: ${count()}`);
    const el = createRoot(() => element("div", { children: label })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("Count: 0");

    setCount(10);
    flush();
    expect(el.textContent).toContain("Count: 10");
  });

  test("handles multiple reactive children", () => {
    const [a, setA] = createSignal("A");
    const [b, setB] = createSignal("B");
    // `element` takes its scope EXPLICITLY where `createElement` read the
    // ambient owner, and a reactive child needs an owner to bind under — `null`
    // names none. That is the whole of C1 at this entry point, so the port is a
    // real scope rather than a cast.
    let el!: HTMLDivElement;
    createRoot((_d) => {
      el = element("div", { children: [a, "-", b] }) as HTMLDivElement;
    });

    container.appendChild(el);
    expect(el.textContent).toContain("A-B");

    setA("X");
    setB("Y");
    flush();
    expect(el.textContent).toContain("X-Y");
  });

  test("EDGE CASE: reactive child changes from text to array", () => {
    const [content, setContent] = createSignal<string | string[]>("text");
    const el = createRoot(() =>
      element("div", {
        children: () => {
          const val = content();
          if (Array.isArray(val)) {
            return val.map((v) => element("span", { children: v }));
          }
          return val;
        },
      }),
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("text");

    setContent(["a", "b", "c"]);
    flush();
    expect(el.querySelectorAll("span").length).toBe(3);

    // Switch back to text
    setContent("back to text");
    flush();
    expect(el.textContent).toContain("back to text");
    expect(el.querySelectorAll("span").length).toBe(0);
  });

  test("EDGE CASE: reactive child changes from node to primitive", () => {
    const [showNode, setShowNode] = createSignal(true);
    const el = createRoot(() =>
      element("div", {
        children: () => (showNode() ? element("span", { children: "node" }) : "primitive"),
      }),
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.querySelector("span")).not.toBeNull();

    setShowNode(false);
    flush();
    expect(el.querySelector("span")).toBeNull();
    expect(el.textContent).toContain("primitive");

    setShowNode(true);
    flush();
    expect(el.querySelector("span")).not.toBeNull();
  });

  test("EDGE CASE: rapid reactive child updates", () => {
    const [count, setCount] = createSignal(0);
    const el = createRoot(() => element("div", { children: count })) as HTMLDivElement;

    container.appendChild(el);

    for (let i = 1; i <= 100; i++) {
      setCount(i);
    }
    flush();

    expect(el.textContent).toContain("100");
  });

  test("EDGE CASE: null/undefined reactive child", () => {
    const [content, setContent] = createSignal<string | null>("visible");
    const el = createRoot(() => element("div", { children: () => content() })) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("visible");

    setContent(null);
    flush();
    // Should clear content
    expect(el.textContent).not.toContain("visible");

    setContent("back");
    flush();
    expect(el.textContent).toContain("back");
  });

  test("EDGE CASE: deeply nested reactive children", () => {
    const [inner, setInner] = createSignal("deep");
    const el = createRoot(() =>
      element("div", {
        children: element("div", { children: element("div", { children: inner }) }),
      }),
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("deep");

    setInner("updated");
    flush();
    expect(el.textContent).toContain("updated");
  });
});

describe("DOM properties vs attributes", () => {
  test("sets value property on input", () => {
    const el = createRoot(() => element("input", { value: "test" })) as HTMLInputElement;
    expect(el.value).toBe("test");
  });

  test("sets checked property on checkbox", () => {
    const el = createRoot(() =>
      element("input", { type: "checkbox", checked: true }),
    ) as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  test("sets selected property on option", () => {
    const el = createRoot(() => element("option", { selected: true })) as HTMLOptionElement;
    expect(el.selected).toBe(true);
  });

  test("sets innerHTML", () => {
    const el = createRoot(() =>
      element("div", {
        dangerouslySetInnerHTML: { __html: "<b>bold</b>" },
      }),
    ) as HTMLDivElement;
    expect(el.innerHTML).toBe("<b>bold</b>");
  });

  test("reactive value property", () => {
    const [value, setValue] = createSignal("initial");
    const el = createRoot(() => element("input", { value })) as HTMLInputElement;

    container.appendChild(el);
    expect(el.value).toBe("initial");

    setValue("changed");
    flush();
    expect(el.value).toBe("changed");
  });

  test("reactive checked property", () => {
    const [checked, setChecked] = createSignal(false);
    const el = createRoot(() =>
      element("input", { type: "checkbox", checked }),
    ) as HTMLInputElement;

    container.appendChild(el);
    expect(el.checked).toBe(false);

    setChecked(true);
    flush();
    expect(el.checked).toBe(true);
  });
});

describe("render function", () => {
  test("renders element to container", () => {
    const el = createRoot(() => element("div", { children: "content" })) as HTMLDivElement;
    render(el, container);

    expect(container.textContent).toBe("content");
  });

  test("clears container before rendering", () => {
    container.innerHTML = "<span>old content</span>";
    const el = createRoot(() => element("div", { children: "new content" })) as HTMLDivElement;

    render(el, container);

    expect(container.textContent).toBe("new content");
    expect(container.querySelector("span")).toBeNull();
  });

  test("returns cleanup function", () => {
    const el = createRoot(() => element("div", { children: "content" })) as HTMLDivElement;
    const cleanup = render(el, container);

    expect(container.textContent).toBe("content");

    cleanup();
    expect(container.textContent).toBe("");
  });

  test("renders null/undefined as empty", () => {
    render(null, container);
    expect(container.textContent).toBe("");

    render(undefined, container);
    expect(container.textContent).toBe("");
  });

  test("renders boolean as empty", () => {
    render(true, container);
    expect(container.textContent).toBe("");

    render(false, container);
    expect(container.textContent).toBe("");
  });

  test("renders string directly", () => {
    render("hello", container);
    expect(container.textContent).toBe("hello");
  });

  test("renders number directly", () => {
    render(42, container);
    expect(container.textContent).toBe("42");
  });

  test("a fragment root holding a Cell stays a live hole", () => {
    const [shown, setShown] = createSignal(false);
    // What `render(() => <>{() => cond() ? <span/> : null}</>)` produces: an
    // array whose only member is a Cell. Appending its nodes once left a
    // component whose whole output is a conditional — an overlay — rendered at
    // its first value for good.
    render([() => (shown() ? element("span", { children: "in" }) : null)], container);

    expect(container.textContent).toBe("");

    setShown(true);
    flush();
    expect(container.textContent).toBe("in");

    setShown(false);
    flush();
    expect(container.textContent).toBe("");
  });

  test("a fragment root keeps its static members in order around a Cell", () => {
    const [middle, setMiddle] = createSignal("b");
    render(
      [
        createRoot(() => element("span", { children: "a" })),
        () => middle(),
        createRoot(() => element("span", { children: "c" })),
      ],
      container,
    );

    expect(container.textContent).toBe("abc");

    setMiddle("B");
    flush();
    expect(container.textContent).toBe("aBc");
  });

  test("renders array of elements", () => {
    const elements = [
      createRoot(() => element("span", { children: "a" })),
      createRoot(() => element("span", { children: "b" })),
      createRoot(() => element("span", { children: "c" })),
    ];
    render(elements, container);

    expect(container.textContent).toBe("abc");
    expect(container.querySelectorAll("span").length).toBe(3);
  });
});

describe("the { current } ref shape", () => {
  // `useRef()` returned `{ current: null }` and nothing else, so M9 deleted it
  // and left the SHAPE, which is what the ref channel actually writes.
  test("a fresh box starts null", () => {
    const ref: { current: HTMLDivElement | null } = { current: null };
    expect(ref.current).toBeNull();
  });

  test("current is set when attached to an element", () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    const el = createRoot(() => element("input", { ref })) as HTMLInputElement;

    expect(ref.current).toBe(el);
  });
});

describe("template function", () => {
  test("creates template that can be cloned", () => {
    const t = template("<div><span>hello</span></div>");

    const el1 = t() as HTMLDivElement;
    const el2 = t() as HTMLDivElement;

    expect(el1.outerHTML).toBe("<div><span>hello</span></div>");
    expect(el2.outerHTML).toBe("<div><span>hello</span></div>");
    expect(el1).not.toBe(el2); // Should be different instances
  });

  test("creates SVG template", () => {
    const t = template('<circle cx="50" cy="50" r="40"/>', true);

    const el = t() as SVGCircleElement;
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("cx")).toBe("50");
  });

  test("caches template for reuse", () => {
    const t = template("<div>test</div>");

    // Multiple calls should use cached template
    const el1 = t();
    const el2 = t();
    const el3 = t();

    expect(el1.textContent).toBe("test");
    expect(el2.textContent).toBe("test");
    expect(el3.textContent).toBe("test");
  });
});

describe("Memory and cleanup", () => {
  test("effect for reactive prop disposes with scope", () => {
    const [title, setTitle] = createSignal("initial");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    createRoot((d) => {
      dispose = d;

      // Wrap createElement to track effect runs
      const originalTitle = title;
      const trackedTitle = () => {
        effectRuns++;
        return originalTitle();
      };

      element("div", { title: trackedTitle });
    });

    expect(effectRuns).toBe(1);

    setTitle("changed");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    setTitle("after dispose");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("effect for reactive child disposes with scope", () => {
    const [text, setText] = createSignal("initial");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    createRoot((d) => {
      dispose = d;

      const trackedText = () => {
        effectRuns++;
        return text();
      };

      const el = element("div", { children: trackedText });
      container.appendChild(el);
    });

    expect(effectRuns).toBe(1);

    setText("changed");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    setText("after dispose");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("reactive styles dispose with scope", () => {
    const [color, setColor] = createSignal("red");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    createRoot((d) => {
      dispose = d;

      const trackedColor = () => {
        effectRuns++;
        return color();
      };

      const el = element("div", { style: { color: trackedColor } });
      container.appendChild(el);
    });

    expect(effectRuns).toBe(1);

    setColor("blue");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    setColor("green");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });
});

describe("Edge cases and error handling", () => {
  test("handles empty children array", () => {
    const el = createRoot(() => element("div", {})) as HTMLDivElement;
    expect(el.childNodes.length).toBe(0);
  });

  test("handles mixed static and reactive children", () => {
    const [dynamic, setDynamic] = createSignal("dynamic");
    let el!: HTMLDivElement;
    createRoot((_d) => {
      el = element("div", {
        children: ["static1", dynamic, "static2", () => `computed: ${dynamic()}`],
      }) as HTMLDivElement;
    });

    container.appendChild(el);
    expect(el.textContent).toContain("static1");
    expect(el.textContent).toContain("dynamic");
    expect(el.textContent).toContain("static2");
    expect(el.textContent).toContain("computed: dynamic");

    setDynamic("updated");
    flush();
    expect(el.textContent).toContain("updated");
    expect(el.textContent).toContain("computed: updated");
  });

  test("handles nested arrays in children", () => {
    const el = createRoot(() =>
      element("div", { children: [["a", ["b", "c"]], "d"] }),
    ) as HTMLDivElement;

    expect(el.textContent).toBe("abcd");
  });

  test("handles props with undefined values", () => {
    const el = createRoot(() => element("div", { title: undefined, id: "test" })) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("handles props with null values", () => {
    const el = createRoot(() => element("div", { title: null, id: "test" })) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("kebab-case SVG attributes", () => {
    const el = createRoot(() =>
      element("svg", {
        children: element("rect", { strokeWidth: "2", fillOpacity: "0.5" }),
      }),
    ) as SVGSVGElement;

    const rect = el.querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2");
    expect(rect?.getAttribute("fill-opacity")).toBe("0.5");
  });

  test("preserves viewBox casing", () => {
    const el = createRoot(() => element("svg", { viewBox: "0 0 100 100" })) as SVGSVGElement;
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });
});

describe("BUG: isSignalGetter false positive", () => {
  test("regular callback function should not be treated as signal", () => {
    // This is testing potential bug where any function is treated as a signal
    let callCount = 0;

    const callback = () => {
      callCount++;
      return "value";
    };

    // If callback is incorrectly treated as a signal getter,
    // it will be wrapped in an effect and called
    const el = createRoot(() => element("div", { "data-value": callback })) as HTMLDivElement;

    container.appendChild(el);

    // The callback should be called once (to get the value)
    // If there's a bug, it might be called multiple times or set up an effect
    expect(callCount).toBe(1);
    expect(el.getAttribute("data-value")).toBe("value");
  });
});

describe("BUG: textNode stale reference", () => {
  test("textNode reference should be invalidated after complex content", () => {
    // This tests the potential bug where textNode reference becomes stale
    const [content, setContent] = createSignal<string | Node>("initial");

    const el = createRoot(() => element("div", { children: () => content() })) as HTMLDivElement;
    container.appendChild(el);

    expect(el.textContent).toContain("initial");

    // Change to a node
    setContent(createRoot(() => element("span", { children: "node" })));
    flush();
    expect(el.querySelector("span")).not.toBeNull();

    // Change back to primitive - should work correctly
    setContent("back to text");
    flush();
    expect(el.textContent).toContain("back to text");
    expect(el.querySelector("span")).toBeNull();

    // Rapid changes
    setContent("text1");
    setContent(createRoot(() => element("div", { children: "div" })));
    setContent("text2");
    setContent(createRoot(() => element("span", { children: "span" })));
    setContent("final");
    flush();

    expect(el.textContent).toContain("final");
  });
});

/**
 * A hole whose value is an eager multi-node body — which is what target #8
 * makes the compiler emit for `<Show><a/><b/></Show>` rather than a thunk.
 * `normalizeChildToNodes` dissolves a fragment by moving its children out, so
 * without a memo the second time the guard goes true the fragment is empty and
 * the body is gone for good.
 */
describe("eager multi-node bodies survive a hide/show cycle", () => {
  function twoNodeFragment(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const i = document.createElement("i");
    i.textContent = "i";
    const u = document.createElement("u");
    u.textContent = "u";
    fragment.appendChild(i);
    fragment.appendChild(u);
    return fragment;
  }

  test("a reactive insert re-inserts the same nodes", () => {
    const [on, setOn] = createSignal(true);
    const body = twoNodeFragment();
    const first = Array.from(body.childNodes);

    createRoot(() => insert(container, () => (on() ? body : null)));
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");

    setOn(false);
    flush();
    expect(container.innerHTML).toBe("");

    setOn(true);
    flush();
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");
    // The same nodes, not rebuilt ones: the fragment was the only copy.
    expect(container.firstChild).toBe(first[0]);
    expect(container.lastChild).toBe(first[1]);

    setOn(false);
    flush();
    setOn(true);
    flush();
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");
  });

  test("a static insert of the same fragment twice yields it twice", () => {
    const body = twoNodeFragment();
    const a = document.createElement("div");
    const b = document.createElement("div");
    container.appendChild(a);
    container.appendChild(b);

    insert(a, [body]);
    expect(a.innerHTML).toBe("<i>i</i><u>u</u>");

    insert(b, [body]);
    // The nodes MOVE — there is one copy of them — but they are not lost.
    expect(b.innerHTML).toBe("<i>i</i><u>u</u>");
    expect(a.innerHTML).toBe("");
  });

  test("render() of a drained fragment still finds its nodes", () => {
    const body = twoNodeFragment();
    const host = document.createElement("div");
    container.appendChild(host);

    render([body], host);
    expect(host.innerHTML).toBe("<i>i</i><u>u</u>");

    const other = document.createElement("div");
    container.appendChild(other);
    render([body], other);
    expect(other.innerHTML).toBe("<i>i</i><u>u</u>");
  });
});

/**
 * `spread` is the one non-delegated listener registration M5 did not migrate to
 * `listen`, and the compiler emits no `_$spread(` — `codegen/dom.rs` refuses to
 * lower an element carrying a spread onto the template path — so the corpus
 * leak oracle has no subject on this path. These are the pins.
 */
describe("spread — B4 and E2.2 on the one channel the corpus cannot reach", () => {
  test("B4: a listener registered by spread is removed when its scope is disposed", () => {
    let fired = 0;
    const host = document.createElement("div");
    container.appendChild(host);

    const dispose = render(() => {
      const el = document.createElement("button");
      spread(el, () => ({ onmouseenter: () => void fired++, class: "x" }));
      return el;
    }, host);

    const el = host.querySelector("button") as HTMLElement;
    el.dispatchEvent(new Event("mouseenter"));
    expect(fired).toBe(1);

    dispose();
    el.dispatchEvent(new Event("mouseenter"));
    expect(fired, "the handler ran after its scope was disposed").toBe(1);
  });

  test("B4: re-applying the same event name does not accumulate cleanups or listeners", () => {
    const [which, setWhich] = createSignal(1);
    let a = 0;
    let b = 0;
    const host = document.createElement("div");
    container.appendChild(host);

    const dispose = render(() => {
      const el = document.createElement("button");
      spread(el, () => ({
        onmouseenter: which() === 1 ? () => void a++ : () => void b++,
      }));
      return el;
    }, host);

    const el = host.querySelector("button") as HTMLElement;
    el.dispatchEvent(new Event("mouseenter"));
    expect([a, b]).toEqual([1, 0]);

    setWhich(2);
    flush();
    el.dispatchEvent(new Event("mouseenter"));
    // The first handler was replaced, not stacked on top of.
    expect([a, b]).toEqual([1, 1]);

    dispose();
    el.dispatchEvent(new Event("mouseenter"));
    expect([a, b], "a replaced listener outlived its scope").toEqual([1, 1]);
  });

  test("C3.8: the style key is a Cell slot like every other, not a hole", () => {
    const [tint, setTint] = createSignal("color: red");
    const host = document.createElement("div");
    container.appendChild(host);

    const dispose = render(() => {
      const el = document.createElement("i");
      spread(el, () => ({ style: () => tint() }));
      return el;
    }, host);

    const el = host.querySelector("i") as HTMLElement;
    expect(el.getAttribute("style"), "a Cell in the style key applied nothing").toBe("color: red");
    setTint("color: blue");
    flush();
    expect(el.getAttribute("style")).toBe("color: blue");
    dispose();

    // And the refusal that goes with it: `style` was the one key on this
    // surface where a Block neither threw nor rendered.
    const leaf = block(() => document.createTextNode("built"));
    const root = rootScope();
    runWithOwner(root, () => {
      // The refusal is raised inside the binding's own computation, so it
      // arrives as the engine's wrapper around it.
      // Nothing above it catches the throw, so the engine halts and says so.
      let thrown: unknown;
      const halt = spyOn(console, "error").mockImplementation(() => {});
      let printed: string[];
      try {
        const target = document.createElement("i");
        spread(target, () => ({ style: leaf }));
      } catch (error) {
        thrown = error;
      } finally {
        printed = halt.mock.calls.map((call) => String(call[0]));
        halt.mockRestore();
      }
      expect((thrown as Error | undefined)?.cause).toBeInstanceOf(ScopeMissingError);
      expect(printed).toHaveLength(1);
      expect(printed[0]).toStartWith("[REACTIVITY_HALTED]");
    });
  });

  test("E2.2: a throw out of a spread-bound handler reaches the enclosing boundary", () => {
    const host = document.createElement("div");
    container.appendChild(host);
    let caught = "";

    const dispose = render(
      () =>
        boundary(
          host,
          null,
          "error",
          ((error: () => Error) => {
            caught = error().message;
            return null;
          }) as never,
          () => {
            const el = document.createElement("button");
            spread(el, () => ({
              onmouseenter: () => {
                throw new Error("boom");
              },
            }));
            host.appendChild(el);
            return el;
          },
        ),
      host,
    );

    const el = host.querySelector("button") as HTMLElement;
    el.dispatchEvent(new Event("mouseenter"));
    flush();
    expect(caught, "the throw escaped the framework").toBe("boom" as string);
    dispose();
  });
});

describe("enumerated attributes", () => {
  test("aria-pressed={false} is written, not removed", () => {
    const el = createRoot(() => element("button", { "aria-pressed": false })) as HTMLButtonElement;
    expect(el.getAttribute("aria-pressed")).toBe("false");
  });

  test("aria-pressed={true} is the string, not the empty boolean attribute", () => {
    const el = createRoot(() => element("button", { "aria-pressed": true })) as HTMLButtonElement;
    expect(el.getAttribute("aria-pressed")).toBe("true");
  });

  test("a boolean HTML attribute is still its own presence", () => {
    const on = createRoot(() => element("button", { disabled: true })) as HTMLButtonElement;
    const off = createRoot(() => element("button", { hidden: false })) as HTMLButtonElement;
    expect(on.disabled).toBe(true);
    expect(off.hasAttribute("hidden")).toBe(false);
  });

  test("the value follows a signal both ways", () => {
    const [pressed, setPressed] = createSignal(false);
    const el = createRoot(() =>
      element("button", { "aria-pressed": () => pressed() }),
    ) as HTMLButtonElement;
    container.appendChild(el);

    expect(el.getAttribute("aria-pressed")).toBe("false");
    setPressed(true);
    flush();
    expect(el.getAttribute("aria-pressed")).toBe("true");
    setPressed(false);
    flush();
    expect(el.getAttribute("aria-pressed")).toBe("false");
  });

  test("contentEditable spells its value out", () => {
    const el = createRoot(() => element("div", { contentEditable: false })) as HTMLDivElement;
    expect(el.getAttribute("contentEditable")).toBe("false");
  });
});

describe("a component's construction is not a dependency of the hole that placed it", () => {
  test("changing a signal the body READ does not rebuild the subtree", () => {
    const [label, setLabel] = createSignal("a");
    let builds = 0;

    // What the compiler emits for `<Parent><Child/></Parent>`: the child is a
    // Block, and the parent places it with `insert`.
    const child = block(() => {
      builds++;
      const el = document.createElement("span");
      insert(el, () => label());
      return el;
    });

    const parent = document.createElement("div");
    const dispose = createRoot((disposeRoot) => {
      insert(parent, child);
      return disposeRoot;
    });
    {
      flush();

      const first = parent.firstChild;
      expect(builds).toBe(1);
      expect(parent.textContent).toBe("a");

      setLabel("b");
      flush();

      expect(builds, "the body ran again").toBe(1);
      expect(parent.firstChild, "the element was replaced").toBe(first);
      expect(parent.textContent, "the update did not land").toBe("b");
      dispose();
    }
  });

  test("DOM state the user owns survives a change the body read", () => {
    const [checked, setChecked] = createSignal(false);

    const child = block(() => {
      const input = document.createElement("input");
      input.type = "checkbox";
      // The read that used to make this hole depend on `checked`.
      input.setAttribute("data-checked", String(checked()));
      return input;
    });

    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const dispose = createRoot((disposeRoot) => {
      insert(parent, child);
      return disposeRoot;
    });
    {
      flush();

      const input = parent.firstChild as HTMLInputElement;
      // The USER checks it. Nothing in the framework knows.
      input.checked = true;

      setChecked(true);
      flush();

      expect((parent.firstChild as HTMLInputElement).checked).toBe(true);
      dispose();
    }
    parent.remove();
  });

  test("an expression hole is still tracked", () => {
    const [count, setCount] = createSignal(0);
    const parent = document.createElement("div");

    const dispose = createRoot((disposeRoot) => {
      // `<Foo>{count()}</Foo>` compiles to a plain arrow, not a Block.
      insert(parent, () => String(count()));
      return disposeRoot;
    });
    flush();
    expect(parent.textContent).toBe("0");

    setCount(1);
    flush();
    expect(parent.textContent).toBe("1");
    dispose();
  });
});

describe("capture-phase events", () => {
  test("an onXCapture prop fires before a descendant's bubble handler", () => {
    const seen: string[] = [];
    const parent = createRoot(() =>
      element("div", {
        onKeyDownCapture: () => seen.push("parent-capture"),
        onKeyDown: () => seen.push("parent-bubble"),
      }),
    ) as HTMLDivElement;
    const child = createRoot(() =>
      element("input", {
        onKeyDown: () => seen.push("child"),
      }),
    ) as HTMLInputElement;
    parent.appendChild(child);
    container.appendChild(parent);

    child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(seen).toEqual(["parent-capture", "child", "parent-bubble"]);
  });

  test("a capture handler can stop the event reaching the child", () => {
    const seen: string[] = [];
    const parent = createRoot(() =>
      element("div", {
        onKeyDownCapture: (e: Event) => {
          seen.push("capture");
          e.stopPropagation();
        },
      }),
    ) as HTMLDivElement;
    const child = createRoot(() =>
      element("input", {
        onKeyDown: () => seen.push("child"),
      }),
    ) as HTMLInputElement;
    parent.appendChild(child);
    container.appendChild(parent);

    child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(seen).toEqual(["capture"]);
  });

  test("a `capture:` or `on:` prefix is part of an attribute's name", () => {
    const seen: string[] = [];
    const parent = document.createElement("div");
    setProp(parent, "capture:keydown", "first");
    setProp(parent, "on:keydown", "second");
    const child = document.createElement("input");
    parent.appendChild(child);
    container.appendChild(parent);

    child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    flush();
    expect(seen).toEqual([]);
    expect(parent.getAttribute("capture:keydown")).toBe("first");
    expect(parent.getAttribute("on:keydown")).toBe("second");
  });

  test("a spread binds both phases of one event type", () => {
    const seen: string[] = [];
    const parent = document.createElement("div");
    createRoot(() =>
      spread(parent, {
        onKeyDownCapture: () => seen.push("capture"),
        onKeyDown: () => seen.push("bubble"),
      }),
    );
    const child = document.createElement("input");
    parent.appendChild(child);
    container.appendChild(parent);

    child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(seen).toEqual(["capture", "bubble"]);
  });

  test("a capture listener is removed when its scope is disposed", () => {
    const seen: string[] = [];
    const parent = document.createElement("div");
    const child = document.createElement("input");
    parent.appendChild(child);
    container.appendChild(parent);

    createRoot((dispose) => {
      setProp(parent, "onKeyDownCapture", () => seen.push("capture"));
      child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      flush();
      expect(seen).toEqual(["capture"]);
      dispose();
    });

    child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(seen).toEqual(["capture"]);
  });
});
