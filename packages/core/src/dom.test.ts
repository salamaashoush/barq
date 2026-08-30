/**
 * DOM Tests - Edge cases for rendering, reactivity, and prop handling
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { element, insert, render, setProp, spread, template } from "./dom.ts";
import { boundary } from "./flow.ts";
import {
  ScopeMissingError,
  block,
  computed,
  scope,
  enterRoot,
  exit,
  flush,
  signal,
  type Scope,
} from "./signals.ts";

// Simple DOM setup for testing
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
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
    const el = element(null, "div", {}) as HTMLDivElement;
    expect(el.tagName).toBe("DIV");
  });

  test("creates element with static props", () => {
    const el = element(null, "div", { id: "test", class: "my-class" }) as HTMLDivElement;
    expect(el.id).toBe("test");
    expect(el.className).toBe("my-class");
  });

  test("creates element with children", () => {
    const el = element(null, "div", { children: ["hello", " ", "world"] }) as HTMLDivElement;
    expect(el.textContent).toBe("hello world");
  });

  test("creates SVG element", () => {
    const el = element(null, "svg", { viewBox: "0 0 100 100" }) as SVGSVGElement;
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("creates nested SVG elements", () => {
    const el = element(null, "svg", {
      viewBox: "0 0 100 100",
      children: element(null, "circle", { cx: "50", cy: "50", r: "40" }),
    }) as SVGSVGElement;

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
    insert(null, host, ["a", "b", "c"]);
    expect(host.textContent).toBe("abc");
  });

  test("handles component functions", () => {
    const MyComponent = (_s: unknown, props: { name: string }) => {
      return element(null, "span", { children: `Hello ${props.name}` });
    };

    const el = MyComponent(null, { name: "World" }) as HTMLSpanElement;
    expect(el.textContent).toBe("Hello World");
  });

  test("component receives children prop", () => {
    const Wrapper = (_s: unknown, props: { children: unknown }) => {
      return element(null, "div", { class: "wrapper", children: props.children });
    };

    const el = Wrapper(null, { children: "content" }) as HTMLDivElement;
    expect(el.className).toBe("wrapper");
    expect(el.textContent).toBe("content");
  });
});

describe("Event handling", () => {
  // Common events are delegated to a document-level listener (like Solid),
  // so elements must be connected and events must bubble.
  test("attaches onClick handler (delegated)", () => {
    let clicked = false;
    const el = element(null, "button", {
      onClick: () => {
        clicked = true;
      },
    }) as HTMLButtonElement;

    container.appendChild(el);
    el.click();
    expect(clicked).toBe(true);
  });

  test("attaches onInput handler (delegated)", () => {
    let value = "";
    const el = element(null, "input", {
      onInput: (e: Event) => {
        value = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    container.appendChild(el);
    el.value = "test";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    expect(value).toBe("test");
  });

  test("delegated click bubbles from a nested child", () => {
    let clicks = 0;
    const el = element(null, "div", {
      onClick: () => clicks++,
      children: element(null, "span", { children: "inner" }),
    }) as HTMLDivElement;

    container.appendChild(el);
    (el.querySelector("span") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(clicks).toBe(1);
  });

  test("stopPropagation halts the delegated walk", () => {
    let outerClicks = 0;
    const el = element(null, "div", {
      onClick: () => outerClicks++,
      children: element(null, "button", { onClick: (e: Event) => e.stopPropagation() }),
    }) as HTMLDivElement;

    container.appendChild(el);
    (el.querySelector("button") as HTMLButtonElement).click();
    expect(outerClicks).toBe(0);
  });

  test("handles multiple event handlers (delegated + direct)", () => {
    const events: string[] = [];
    const el = element(null, "button", {
      onClick: () => events.push("click"),
      // mouseenter/mouseleave do not bubble: attached directly
      onMouseEnter: () => events.push("enter"),
      onMouseLeave: () => events.push("leave"),
    }) as HTMLButtonElement;

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
    const el = element(null, "div", {
      ref: (node: Element) => {
        refEl = node;
      },
    }) as HTMLDivElement;

    expect(refEl as Element | null).toBe(el);
  });

  test("ref object is set", () => {
    // M9 deleted the `useRef()` FACTORY — a ref is a writable binding
    // (B3) or a callback, and the box is one object literal. The `{current}`
    // SHAPE is still a ref the channel writes, which is what this asserts.
    const ref: { current: HTMLDivElement | null } = { current: null };
    const el = element(null, "div", { ref }) as HTMLDivElement;

    expect(ref.current).toBe(el);
  });
});

describe("Style handling", () => {
  test("applies style object", () => {
    const el = element(null, "div", {
      style: { color: "red", fontSize: "16px" },
    }) as HTMLDivElement;

    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  test("applies style string", () => {
    const el = element(null, "div", { style: "color: blue; font-size: 14px" }) as HTMLDivElement;

    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("14px");
  });

  test("a string style keeps the author's bytes in the attribute", () => {
    // The compiler folds a literal style into the template HTML, where the
    // parser stores it verbatim. Writing it through style.cssText instead would
    // round-trip it through the CSSOM serializer (which appends ";"), and the
    // compiled and un-compiled paths would then disagree on the attribute.
    const literal = "color: red; font-weight: bold";
    const el = element(null, "div", { style: literal }) as HTMLDivElement;
    expect(el.getAttribute("style")).toBe(literal);

    const parsed = document.createElement("template");
    parsed.innerHTML = `<div style="${literal}"></div>`;
    expect((parsed.content.firstChild as Element).getAttribute("style")).toBe(
      el.getAttribute("style"),
    );
  });

  test("handles numeric values with px suffix", () => {
    const el = element(null, "div", { style: { width: 100, height: 50 } }) as HTMLDivElement;

    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("50px");
  });

  test("handles unitless CSS properties", () => {
    const el = element(null, "div", {
      style: { zIndex: 10, opacity: 0.5, flexGrow: 1 },
    }) as HTMLDivElement;

    expect(el.style.zIndex).toBe("10");
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.flexGrow).toBe("1");
  });

  test("handles zero values without px", () => {
    const el = element(null, "div", { style: { margin: 0, padding: 0 } }) as HTMLDivElement;

    // Browsers normalize "0" to "0px" for length properties
    expect(el.style.margin).toBe("0px");
    expect(el.style.padding).toBe("0px");
  });

  test("reactive style properties", () => {
    const color = signal("red");
    const el = element(null, "div", { style: { color } }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.color).toBe("red");

    color.set("blue");
    flush();
    expect(el.style.color).toBe("blue");
  });

  test("removes style property when null", () => {
    const width = signal<number | null>(100);
    const el = element(null, "div", { style: { width } }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.width).toBe("100px");

    width.set(null);
    flush();
    expect(el.style.width).toBe("");
  });
});

describe("Class handling", () => {
  test("applies class string", () => {
    const el = element(null, "div", { class: "foo bar" }) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies className string", () => {
    const el = element(null, "div", { className: "foo bar" }) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies class array", () => {
    const el = element(null, "div", { class: ["foo", "bar", "baz"] }) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("filters falsy values from class array", () => {
    const el = element(null, "div", {
      class: ["foo", "", null, "bar", false, "baz"],
    }) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("applies class object", () => {
    const el = element(null, "div", {
      class: { foo: true, bar: false, baz: true },
    }) as HTMLDivElement;
    expect(el.className).toBe("foo baz");
  });

  test("removes class when value is null", () => {
    const el = element(null, "div", { class: null }) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("removes class when value is false", () => {
    const el = element(null, "div", { class: false }) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });

  // A caller that does not thread `prev` used to leave every token it had ever
  // written on the element, because the diff was against `null` and removed
  // nothing. The channel remembers its own last write instead.
  test("repeated one-shot writes replace rather than accumulate", () => {
    const el = document.createElement("div");
    for (let i = 0; i < 5; i++) setProp(null, el, "class", `c${i}`);
    expect(el.getAttribute("class")).toBe("c4");
    expect(el.classList.length).toBe(1);
  });

  // And it still removes only what it OWNS: a token another channel put there
  // survives, which is the invariant the diff path exists for.
  test("a one-shot write keeps tokens this channel never wrote", () => {
    const el = document.createElement("div");
    el.setAttribute("class", "from-markup");
    setProp(null, el, "class", "a");
    setProp(null, el, "class", "b");
    expect([...el.classList].toSorted()).toEqual(["b", "from-markup"]);
  });
});

describe("Reactive props", () => {
  test("updates prop when signal changes", () => {
    const title = signal("initial");
    const el = element(null, "div", { title }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("initial");

    title.set("updated");
    flush();
    expect(el.title).toBe("updated");
  });

  test("updates attribute when signal changes", () => {
    const ariaLabel = signal("label 1");
    const el = element(null, "div", { "aria-label": ariaLabel }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.getAttribute("aria-label")).toBe("label 1");

    ariaLabel.set("label 2");
    flush();
    expect(el.getAttribute("aria-label")).toBe("label 2");
  });

  test("handles boolean attribute reactively", () => {
    const disabled = signal(true);
    const el = element(null, "button", { disabled }) as HTMLButtonElement;

    container.appendChild(el);
    expect(el.hasAttribute("disabled")).toBe(true);

    disabled.set(false);
    flush();
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("handles computed prop values", () => {
    const count = signal(0);
    const label = computed(() => `Count: ${count()}`);
    const el = element(null, "div", { title: label }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("Count: 0");

    count.set(5);
    flush();
    expect(el.title).toBe("Count: 5");
  });
});

describe("Reactive children", () => {
  test("updates text content from signal", () => {
    const text = signal("hello");
    const el = element(null, "div", { children: text }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("hello");

    text.set("world");
    flush();
    expect(el.textContent).toContain("world");
  });

  test("updates text from computed", () => {
    const count = signal(0);
    const label = computed(() => `Count: ${count()}`);
    const el = element(null, "div", { children: label }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("Count: 0");

    count.set(10);
    flush();
    expect(el.textContent).toContain("Count: 10");
  });

  test("handles multiple reactive children", () => {
    const a = signal("A");
    const b = signal("B");
    // `element` takes its scope EXPLICITLY where `createElement` read the
    // ambient owner, and a reactive child needs an owner to bind under — `null`
    // names none. That is the whole of C1 at this entry point, so the port is a
    // real scope rather than a cast.
    let el!: HTMLDivElement;
    scope((_d, s) => {
      el = element(s, "div", { children: [a, "-", b] }) as HTMLDivElement;
    });

    container.appendChild(el);
    expect(el.textContent).toContain("A-B");

    a.set("X");
    b.set("Y");
    flush();
    expect(el.textContent).toContain("X-Y");
  });

  test("EDGE CASE: reactive child changes from text to array", () => {
    const content = signal<string | string[]>("text");
    const el = element(null, "div", {
      children: () => {
        const val = content();
        if (Array.isArray(val)) {
          return val.map((v) => element(null, "span", { children: v }));
        }
        return val;
      },
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("text");

    content.set(["a", "b", "c"]);
    flush();
    expect(el.querySelectorAll("span").length).toBe(3);

    // Switch back to text
    content.set("back to text");
    flush();
    expect(el.textContent).toContain("back to text");
    expect(el.querySelectorAll("span").length).toBe(0);
  });

  test("EDGE CASE: reactive child changes from node to primitive", () => {
    const showNode = signal(true);
    const el = element(null, "div", {
      children: () => (showNode() ? element(null, "span", { children: "node" }) : "primitive"),
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.querySelector("span")).not.toBeNull();

    showNode.set(false);
    flush();
    expect(el.querySelector("span")).toBeNull();
    expect(el.textContent).toContain("primitive");

    showNode.set(true);
    flush();
    expect(el.querySelector("span")).not.toBeNull();
  });

  test("EDGE CASE: rapid reactive child updates", () => {
    const count = signal(0);
    const el = element(null, "div", { children: count }) as HTMLDivElement;

    container.appendChild(el);

    for (let i = 1; i <= 100; i++) {
      count.set(i);
    }
    flush();

    expect(el.textContent).toContain("100");
  });

  test("EDGE CASE: null/undefined reactive child", () => {
    const content = signal<string | null>("visible");
    const el = element(null, "div", { children: () => content() }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("visible");

    content.set(null);
    flush();
    // Should clear content
    expect(el.textContent).not.toContain("visible");

    content.set("back");
    flush();
    expect(el.textContent).toContain("back");
  });

  test("EDGE CASE: deeply nested reactive children", () => {
    const inner = signal("deep");
    const el = element(null, "div", {
      children: element(null, "div", { children: element(null, "div", { children: inner }) }),
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("deep");

    inner.set("updated");
    flush();
    expect(el.textContent).toContain("updated");
  });
});

describe("DOM properties vs attributes", () => {
  test("sets value property on input", () => {
    const el = element(null, "input", { value: "test" }) as HTMLInputElement;
    expect(el.value).toBe("test");
  });

  test("sets checked property on checkbox", () => {
    const el = element(null, "input", { type: "checkbox", checked: true }) as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  test("sets selected property on option", () => {
    const el = element(null, "option", { selected: true }) as HTMLOptionElement;
    expect(el.selected).toBe(true);
  });

  test("sets innerHTML", () => {
    const el = element(null, "div", {
      dangerouslySetInnerHTML: { __html: "<b>bold</b>" },
    }) as HTMLDivElement;
    expect(el.innerHTML).toBe("<b>bold</b>");
  });

  test("reactive value property", () => {
    const value = signal("initial");
    const el = element(null, "input", { value }) as HTMLInputElement;

    container.appendChild(el);
    expect(el.value).toBe("initial");

    value.set("changed");
    flush();
    expect(el.value).toBe("changed");
  });

  test("reactive checked property", () => {
    const checked = signal(false);
    const el = element(null, "input", { type: "checkbox", checked }) as HTMLInputElement;

    container.appendChild(el);
    expect(el.checked).toBe(false);

    checked.set(true);
    flush();
    expect(el.checked).toBe(true);
  });
});

describe("render function", () => {
  test("renders element to container", () => {
    const el = element(null, "div", { children: "content" }) as HTMLDivElement;
    render(el, container);

    expect(container.textContent).toBe("content");
  });

  test("clears container before rendering", () => {
    container.innerHTML = "<span>old content</span>";
    const el = element(null, "div", { children: "new content" }) as HTMLDivElement;

    render(el, container);

    expect(container.textContent).toBe("new content");
    expect(container.querySelector("span")).toBeNull();
  });

  test("returns cleanup function", () => {
    const el = element(null, "div", { children: "content" }) as HTMLDivElement;
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

  test("renders array of elements", () => {
    const elements = [
      element(null, "span", { children: "a" }),
      element(null, "span", { children: "b" }),
      element(null, "span", { children: "c" }),
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
    const el = element(null, "input", { ref }) as HTMLInputElement;

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
    const title = signal("initial");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    scope((d) => {
      dispose = d;

      // Wrap createElement to track effect runs
      const originalTitle = title;
      const trackedTitle = () => {
        effectRuns++;
        return originalTitle();
      };

      element(null, "div", { title: trackedTitle });
    });

    expect(effectRuns).toBe(1);

    title.set("changed");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    title.set("after dispose");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("effect for reactive child disposes with scope", () => {
    const text = signal("initial");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    scope((d) => {
      dispose = d;

      const trackedText = () => {
        effectRuns++;
        return text();
      };

      const el = element(null, "div", { children: trackedText });
      container.appendChild(el);
    });

    expect(effectRuns).toBe(1);

    text.set("changed");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    text.set("after dispose");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("reactive styles dispose with scope", () => {
    const color = signal("red");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    scope((d) => {
      dispose = d;

      const trackedColor = () => {
        effectRuns++;
        return color();
      };

      const el = element(null, "div", { style: { color: trackedColor } });
      container.appendChild(el);
    });

    expect(effectRuns).toBe(1);

    color.set("blue");
    flush();
    expect(effectRuns).toBe(2);

    dispose!();

    color.set("green");
    flush();
    expect(effectRuns).toBe(2); // Should not increase
  });
});

describe("Edge cases and error handling", () => {
  test("handles empty children array", () => {
    const el = element(null, "div", {}) as HTMLDivElement;
    expect(el.childNodes.length).toBe(0);
  });

  test("handles mixed static and reactive children", () => {
    const dynamic = signal("dynamic");
    let el!: HTMLDivElement;
    scope((_d, s) => {
      el = element(s, "div", {
        children: ["static1", dynamic, "static2", () => `computed: ${dynamic()}`],
      }) as HTMLDivElement;
    });

    container.appendChild(el);
    expect(el.textContent).toContain("static1");
    expect(el.textContent).toContain("dynamic");
    expect(el.textContent).toContain("static2");
    expect(el.textContent).toContain("computed: dynamic");

    dynamic.set("updated");
    flush();
    expect(el.textContent).toContain("updated");
    expect(el.textContent).toContain("computed: updated");
  });

  test("handles nested arrays in children", () => {
    const el = element(null, "div", { children: [["a", ["b", "c"]], "d"] }) as HTMLDivElement;

    expect(el.textContent).toBe("abcd");
  });

  test("handles props with undefined values", () => {
    const el = element(null, "div", { title: undefined, id: "test" }) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("handles props with null values", () => {
    const el = element(null, "div", { title: null, id: "test" }) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("kebab-case SVG attributes", () => {
    const el = element(null, "svg", {
      children: element(null, "rect", { strokeWidth: "2", fillOpacity: "0.5" }),
    }) as SVGSVGElement;

    const rect = el.querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2");
    expect(rect?.getAttribute("fill-opacity")).toBe("0.5");
  });

  test("preserves viewBox casing", () => {
    const el = element(null, "svg", { viewBox: "0 0 100 100" }) as SVGSVGElement;
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
    const el = element(null, "div", { "data-value": callback }) as HTMLDivElement;

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
    const content = signal<string | Node>("initial");

    const el = element(null, "div", { children: () => content() }) as HTMLDivElement;
    container.appendChild(el);

    expect(el.textContent).toContain("initial");

    // Change to a node
    content.set(element(null, "span", { children: "node" }));
    flush();
    expect(el.querySelector("span")).not.toBeNull();

    // Change back to primitive - should work correctly
    content.set("back to text");
    flush();
    expect(el.textContent).toContain("back to text");
    expect(el.querySelector("span")).toBeNull();

    // Rapid changes
    content.set("text1");
    content.set(element(null, "div", { children: "div" }));
    content.set("text2");
    content.set(element(null, "span", { children: "span" }));
    content.set("final");
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
    const on = signal(true);
    const body = twoNodeFragment();
    const first = Array.from(body.childNodes);

    insert(null, container, () => (on() ? body : null));
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");

    on.set(false);
    flush();
    expect(container.innerHTML).toBe("");

    on.set(true);
    flush();
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");
    // The same nodes, not rebuilt ones: the fragment was the only copy.
    expect(container.firstChild).toBe(first[0]);
    expect(container.lastChild).toBe(first[1]);

    on.set(false);
    flush();
    on.set(true);
    flush();
    expect(container.innerHTML).toBe("<i>i</i><u>u</u>");
  });

  test("a static insert of the same fragment twice yields it twice", () => {
    const body = twoNodeFragment();
    const a = document.createElement("div");
    const b = document.createElement("div");
    container.appendChild(a);
    container.appendChild(b);

    insert(null, a, [body]);
    expect(a.innerHTML).toBe("<i>i</i><u>u</u>");

    insert(null, b, [body]);
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

    const dispose = render((s) => {
      const el = document.createElement("button");
      spread(s, el, () => ({ onmouseenter: () => void fired++, class: "x" }));
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
    const which = signal(1);
    let a = 0;
    let b = 0;
    const host = document.createElement("div");
    container.appendChild(host);

    const dispose = render((s) => {
      const el = document.createElement("button");
      spread(s, el, () => ({
        onmouseenter: which() === 1 ? () => void a++ : () => void b++,
      }));
      return el;
    }, host);

    const el = host.querySelector("button") as HTMLElement;
    el.dispatchEvent(new Event("mouseenter"));
    expect([a, b]).toEqual([1, 0]);

    which.set(2);
    flush();
    el.dispatchEvent(new Event("mouseenter"));
    // The first handler was replaced, not stacked on top of.
    expect([a, b]).toEqual([1, 1]);

    dispose();
    el.dispatchEvent(new Event("mouseenter"));
    expect([a, b], "a replaced listener outlived its scope").toEqual([1, 1]);
  });

  test("C3.8: the style key is a Cell slot like every other, not a hole", () => {
    const tint = signal("color: red");
    const host = document.createElement("div");
    container.appendChild(host);

    const dispose = render((s) => {
      const el = document.createElement("i");
      spread(s, el, () => ({ style: () => tint() }));
      return el;
    }, host);

    const el = host.querySelector("i") as HTMLElement;
    expect(el.getAttribute("style"), "a Cell in the style key applied nothing").toBe("color: red");
    tint.set("color: blue");
    flush();
    expect(el.getAttribute("style")).toBe("color: blue");
    dispose();

    // And the refusal that goes with it: `style` was the one key on this
    // surface where a Block neither threw nor rendered.
    const leaf = block(() => document.createTextNode("built"));
    // `exit`ed in a `finally`: `enterRoot` sets `CURRENT` and the throw below
    // walks past the restore, so without this the root stays current for every
    // test file that runs after this one — which is how `context.test.ts`'s two
    // "outside owner" cases came to pass only by file order.
    const root = enterRoot();
    try {
      expect(() => {
        const target = document.createElement("i");
        spread(root, target, () => ({ style: leaf }));
      }).toThrow(ScopeMissingError);
    } finally {
      exit(root);
    }
  });

  test("E2.2: a throw out of a spread-bound handler reaches the enclosing boundary", () => {
    const host = document.createElement("div");
    container.appendChild(host);
    let caught = "";

    const dispose = render(
      (s) =>
        boundary(
          s,
          host,
          null,
          "error",
          ((_scope: Scope | null, error: () => Error) => {
            caught = error().message;
            return null;
          }) as never,
          (scope: Scope | null) => {
            const el = document.createElement("button");
            spread(scope, el, () => ({
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
