/**
 * DOM Tests - Edge cases for rendering, reactivity, and prop handling
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createElement, render, useRef, template } from "./dom.ts";
import { signal, computed, createScope } from "./signals.ts";

// Simple DOM setup for testing
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe("createElement", () => {
  test("creates basic HTML element", () => {
    const el = createElement("div", null) as HTMLDivElement;
    expect(el.tagName).toBe("DIV");
  });

  test("creates element with static props", () => {
    const el = createElement("div", { id: "test", class: "my-class" }) as HTMLDivElement;
    expect(el.id).toBe("test");
    expect(el.className).toBe("my-class");
  });

  test("creates element with children", () => {
    const el = createElement("div", null, "hello", " ", "world") as HTMLDivElement;
    expect(el.textContent).toBe("hello world");
  });

  test("creates SVG element", () => {
    const el = createElement("svg", { viewBox: "0 0 100 100" }) as SVGSVGElement;
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  test("creates nested SVG elements", () => {
    const el = createElement(
      "svg",
      { viewBox: "0 0 100 100" },
      createElement("circle", { cx: "50", cy: "50", r: "40" }),
    ) as SVGSVGElement;

    const circle = el.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  test("handles fragment tag", () => {
    const frag = createElement("fragment", null, "a", "b", "c") as DocumentFragment;
    expect(frag).toBeInstanceOf(DocumentFragment);
    expect(frag.textContent).toBe("abc");
  });

  test("handles component functions", () => {
    const MyComponent = (props: { name: string }) => {
      return createElement("span", null, `Hello ${props.name}`);
    };

    const el = createElement(MyComponent, { name: "World" }) as HTMLSpanElement;
    expect(el.textContent).toBe("Hello World");
  });

  test("component receives children prop", () => {
    const Wrapper = (props: { children: unknown }) => {
      return createElement("div", { class: "wrapper" }, props.children as string);
    };

    const el = createElement(Wrapper, null, "content") as HTMLDivElement;
    expect(el.className).toBe("wrapper");
    expect(el.textContent).toBe("content");
  });
});

describe("Event handling", () => {
  test("attaches onClick handler", () => {
    let clicked = false;
    const el = createElement("button", {
      onClick: () => {
        clicked = true;
      },
    }) as HTMLButtonElement;

    el.click();
    expect(clicked).toBe(true);
  });

  test("attaches onInput handler", () => {
    let value = "";
    const el = createElement("input", {
      onInput: (e: Event) => {
        value = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    container.appendChild(el);
    el.value = "test";
    el.dispatchEvent(new Event("input"));
    expect(value).toBe("test");
  });

  test("handles multiple event handlers", () => {
    const events: string[] = [];
    const el = createElement("button", {
      onClick: () => events.push("click"),
      onMouseEnter: () => events.push("enter"),
      onMouseLeave: () => events.push("leave"),
    }) as HTMLButtonElement;

    el.click();
    el.dispatchEvent(new MouseEvent("mouseenter"));
    el.dispatchEvent(new MouseEvent("mouseleave"));

    expect(events).toEqual(["click", "enter", "leave"]);
  });
});

describe("Ref handling", () => {
  test("ref callback is called with element", () => {
    let refEl: Element | null = null;
    const el = createElement("div", {
      ref: (el: Element) => {
        refEl = el;
      },
    }) as HTMLDivElement;

    expect(refEl).toBe(el);
  });

  test("ref object is set", () => {
    const ref = useRef<HTMLDivElement>();
    const el = createElement("div", { ref }) as HTMLDivElement;

    expect(ref.current).toBe(el);
  });
});

describe("Style handling", () => {
  test("applies style object", () => {
    const el = createElement("div", {
      style: { color: "red", fontSize: "16px" },
    }) as HTMLDivElement;

    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  test("applies style string", () => {
    const el = createElement("div", {
      style: "color: blue; font-size: 14px",
    }) as HTMLDivElement;

    expect(el.style.color).toBe("blue");
    expect(el.style.fontSize).toBe("14px");
  });

  test("handles numeric values with px suffix", () => {
    const el = createElement("div", {
      style: { width: 100, height: 50 },
    }) as HTMLDivElement;

    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("50px");
  });

  test("handles unitless CSS properties", () => {
    const el = createElement("div", {
      style: { zIndex: 10, opacity: 0.5, flexGrow: 1 },
    }) as HTMLDivElement;

    expect(el.style.zIndex).toBe("10");
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.flexGrow).toBe("1");
  });

  test("handles zero values without px", () => {
    const el = createElement("div", {
      style: { margin: 0, padding: 0 },
    }) as HTMLDivElement;

    // Browsers normalize "0" to "0px" for length properties
    expect(el.style.margin).toBe("0px");
    expect(el.style.padding).toBe("0px");
  });

  test("reactive style properties", () => {
    const color = signal("red");
    const el = createElement("div", {
      style: { color },
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.color).toBe("red");

    color.set("blue");
    expect(el.style.color).toBe("blue");
  });

  test("removes style property when null", () => {
    const width = signal<number | null>(100);
    const el = createElement("div", {
      style: { width },
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.style.width).toBe("100px");

    width.set(null);
    expect(el.style.width).toBe("");
  });
});

describe("Class handling", () => {
  test("applies class string", () => {
    const el = createElement("div", { class: "foo bar" }) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies className string", () => {
    const el = createElement("div", { className: "foo bar" }) as HTMLDivElement;
    expect(el.className).toBe("foo bar");
  });

  test("applies class array", () => {
    const el = createElement("div", { class: ["foo", "bar", "baz"] }) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("filters falsy values from class array", () => {
    const el = createElement("div", { class: ["foo", "", null, "bar", false, "baz"] }) as HTMLDivElement;
    expect(el.className).toBe("foo bar baz");
  });

  test("applies class object", () => {
    const el = createElement("div", {
      class: { foo: true, bar: false, baz: true },
    }) as HTMLDivElement;
    expect(el.className).toBe("foo baz");
  });

  test("removes class when value is null", () => {
    const el = createElement("div", { class: null }) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });

  test("removes class when value is false", () => {
    const el = createElement("div", { class: false }) as HTMLDivElement;
    expect(el.hasAttribute("class")).toBe(false);
  });
});

describe("Reactive props", () => {
  test("updates prop when signal changes", () => {
    const title = signal("initial");
    const el = createElement("div", { title }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("initial");

    title.set("updated");
    expect(el.title).toBe("updated");
  });

  test("updates attribute when signal changes", () => {
    const ariaLabel = signal("label 1");
    const el = createElement("div", { "aria-label": ariaLabel }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.getAttribute("aria-label")).toBe("label 1");

    ariaLabel.set("label 2");
    expect(el.getAttribute("aria-label")).toBe("label 2");
  });

  test("handles boolean attribute reactively", () => {
    const disabled = signal(true);
    const el = createElement("button", { disabled }) as HTMLButtonElement;

    container.appendChild(el);
    expect(el.hasAttribute("disabled")).toBe(true);

    disabled.set(false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("handles computed prop values", () => {
    const count = signal(0);
    const label = computed(() => `Count: ${count()}`);
    const el = createElement("div", { title: label }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.title).toBe("Count: 0");

    count.set(5);
    expect(el.title).toBe("Count: 5");
  });
});

describe("Reactive children", () => {
  test("updates text content from signal", () => {
    const text = signal("hello");
    const el = createElement("div", null, text) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("hello");

    text.set("world");
    expect(el.textContent).toContain("world");
  });

  test("updates text from computed", () => {
    const count = signal(0);
    const label = computed(() => `Count: ${count()}`);
    const el = createElement("div", null, label) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("Count: 0");

    count.set(10);
    expect(el.textContent).toContain("Count: 10");
  });

  test("handles multiple reactive children", () => {
    const a = signal("A");
    const b = signal("B");
    const el = createElement("div", null, a, "-", b) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("A-B");

    a.set("X");
    b.set("Y");
    expect(el.textContent).toContain("X-Y");
  });

  test("EDGE CASE: reactive child changes from text to array", () => {
    const content = signal<string | string[]>("text");
    const el = createElement("div", null, () => {
      const val = content();
      if (Array.isArray(val)) {
        return val.map((v) => createElement("span", null, v));
      }
      return val;
    }) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("text");

    content.set(["a", "b", "c"]);
    expect(el.querySelectorAll("span").length).toBe(3);

    // Switch back to text
    content.set("back to text");
    expect(el.textContent).toContain("back to text");
    expect(el.querySelectorAll("span").length).toBe(0);
  });

  test("EDGE CASE: reactive child changes from node to primitive", () => {
    const showNode = signal(true);
    const el = createElement("div", null, () =>
      showNode() ? createElement("span", null, "node") : "primitive",
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.querySelector("span")).not.toBeNull();

    showNode.set(false);
    expect(el.querySelector("span")).toBeNull();
    expect(el.textContent).toContain("primitive");

    showNode.set(true);
    expect(el.querySelector("span")).not.toBeNull();
  });

  test("EDGE CASE: rapid reactive child updates", () => {
    const count = signal(0);
    const el = createElement("div", null, count) as HTMLDivElement;

    container.appendChild(el);

    for (let i = 1; i <= 100; i++) {
      count.set(i);
    }

    expect(el.textContent).toContain("100");
  });

  test("EDGE CASE: null/undefined reactive child", () => {
    const content = signal<string | null>("visible");
    const el = createElement("div", null, () => content()) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("visible");

    content.set(null);
    // Should clear content
    expect(el.textContent).not.toContain("visible");

    content.set("back");
    expect(el.textContent).toContain("back");
  });

  test("EDGE CASE: deeply nested reactive children", () => {
    const inner = signal("deep");
    const el = createElement(
      "div",
      null,
      createElement(
        "div",
        null,
        createElement("div", null, inner),
      ),
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("deep");

    inner.set("updated");
    expect(el.textContent).toContain("updated");
  });
});

describe("DOM properties vs attributes", () => {
  test("sets value property on input", () => {
    const el = createElement("input", { value: "test" }) as HTMLInputElement;
    expect(el.value).toBe("test");
  });

  test("sets checked property on checkbox", () => {
    const el = createElement("input", { type: "checkbox", checked: true }) as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  test("sets selected property on option", () => {
    const el = createElement("option", { selected: true }) as HTMLOptionElement;
    expect(el.selected).toBe(true);
  });

  test("sets innerHTML", () => {
    const el = createElement("div", {
      dangerouslySetInnerHTML: { __html: "<b>bold</b>" },
    }) as HTMLDivElement;
    expect(el.innerHTML).toBe("<b>bold</b>");
  });

  test("reactive value property", () => {
    const value = signal("initial");
    const el = createElement("input", { value }) as HTMLInputElement;

    container.appendChild(el);
    expect(el.value).toBe("initial");

    value.set("changed");
    expect(el.value).toBe("changed");
  });

  test("reactive checked property", () => {
    const checked = signal(false);
    const el = createElement("input", { type: "checkbox", checked }) as HTMLInputElement;

    container.appendChild(el);
    expect(el.checked).toBe(false);

    checked.set(true);
    expect(el.checked).toBe(true);
  });
});

describe("render function", () => {
  test("renders element to container", () => {
    const el = createElement("div", null, "content") as HTMLDivElement;
    render(el, container);

    expect(container.textContent).toBe("content");
  });

  test("clears container before rendering", () => {
    container.innerHTML = "<span>old content</span>";
    const el = createElement("div", null, "new content") as HTMLDivElement;

    render(el, container);

    expect(container.textContent).toBe("new content");
    expect(container.querySelector("span")).toBeNull();
  });

  test("returns cleanup function", () => {
    const el = createElement("div", null, "content") as HTMLDivElement;
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
    render("hello" as unknown as Node, container);
    expect(container.textContent).toBe("hello");
  });

  test("renders number directly", () => {
    render(42 as unknown as Node, container);
    expect(container.textContent).toBe("42");
  });

  test("renders array of elements", () => {
    const elements = [
      createElement("span", null, "a"),
      createElement("span", null, "b"),
      createElement("span", null, "c"),
    ];
    render(elements, container);

    expect(container.textContent).toBe("abc");
    expect(container.querySelectorAll("span").length).toBe(3);
  });
});

describe("useRef", () => {
  test("creates ref object with null current", () => {
    const ref = useRef<HTMLDivElement>();
    expect(ref.current).toBeNull();
  });

  test("ref.current is set when attached to element", () => {
    const ref = useRef<HTMLInputElement>();
    const el = createElement("input", { ref }) as HTMLInputElement;

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

    createScope((d) => {
      dispose = d;

      // Wrap createElement to track effect runs
      const originalTitle = title;
      const trackedTitle = () => {
        effectRuns++;
        return originalTitle();
      };

      createElement("div", { title: trackedTitle });
    });

    expect(effectRuns).toBe(1);

    title.set("changed");
    expect(effectRuns).toBe(2);

    dispose!();

    title.set("after dispose");
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("effect for reactive child disposes with scope", () => {
    const text = signal("initial");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;

      const trackedText = () => {
        effectRuns++;
        return text();
      };

      const el = createElement("div", null, trackedText);
      container.appendChild(el as Node);
    });

    expect(effectRuns).toBe(1);

    text.set("changed");
    expect(effectRuns).toBe(2);

    dispose!();

    text.set("after dispose");
    expect(effectRuns).toBe(2); // Should not increase
  });

  test("reactive styles dispose with scope", () => {
    const color = signal("red");
    let effectRuns = 0;

    let dispose: (() => void) | undefined;

    createScope((d) => {
      dispose = d;

      const trackedColor = () => {
        effectRuns++;
        return color();
      };

      const el = createElement("div", { style: { color: trackedColor } });
      container.appendChild(el as Node);
    });

    expect(effectRuns).toBe(1);

    color.set("blue");
    expect(effectRuns).toBe(2);

    dispose!();

    color.set("green");
    expect(effectRuns).toBe(2); // Should not increase
  });
});

describe("Edge cases and error handling", () => {
  test("handles empty children array", () => {
    const el = createElement("div", null) as HTMLDivElement;
    expect(el.childNodes.length).toBe(0);
  });

  test("handles mixed static and reactive children", () => {
    const dynamic = signal("dynamic");
    const el = createElement(
      "div",
      null,
      "static1",
      dynamic,
      "static2",
      () => `computed: ${dynamic()}`,
    ) as HTMLDivElement;

    container.appendChild(el);
    expect(el.textContent).toContain("static1");
    expect(el.textContent).toContain("dynamic");
    expect(el.textContent).toContain("static2");
    expect(el.textContent).toContain("computed: dynamic");

    dynamic.set("updated");
    expect(el.textContent).toContain("updated");
    expect(el.textContent).toContain("computed: updated");
  });

  test("handles nested arrays in children", () => {
    const el = createElement(
      "div",
      null,
      ["a", ["b", "c"]],
      "d",
    ) as HTMLDivElement;

    expect(el.textContent).toBe("abcd");
  });

  test("handles props with undefined values", () => {
    const el = createElement("div", {
      title: undefined,
      id: "test",
    }) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("handles props with null values", () => {
    const el = createElement("div", {
      title: null,
      id: "test",
    }) as HTMLDivElement;

    expect(el.hasAttribute("title")).toBe(false);
    expect(el.id).toBe("test");
  });

  test("kebab-case SVG attributes", () => {
    const el = createElement("svg", null, createElement("rect", {
      strokeWidth: "2",
      fillOpacity: "0.5",
    })) as SVGSVGElement;

    const rect = el.querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2");
    expect(rect?.getAttribute("fill-opacity")).toBe("0.5");
  });

  test("preserves viewBox casing", () => {
    const el = createElement("svg", { viewBox: "0 0 100 100" }) as SVGSVGElement;
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
    const el = createElement("div", {
      "data-value": callback,
    }) as HTMLDivElement;

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

    const el = createElement("div", null, () => content()) as HTMLDivElement;
    container.appendChild(el);

    expect(el.textContent).toContain("initial");

    // Change to a node
    content.set(createElement("span", null, "node") as Node);
    expect(el.querySelector("span")).not.toBeNull();

    // Change back to primitive - should work correctly
    content.set("back to text");
    expect(el.textContent).toContain("back to text");
    expect(el.querySelector("span")).toBeNull();

    // Rapid changes
    content.set("text1");
    content.set(createElement("div", null, "div") as Node);
    content.set("text2");
    content.set(createElement("span", null, "span") as Node);
    content.set("final");

    expect(el.textContent).toContain("final");
  });
});
