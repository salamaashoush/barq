/**
 * `class` takes a string, a map of name to whether it applies, or a list of
 * either, nested as deep as the author composes it. Every shape reaches the
 * one `class` attribute, on the compiled path and through `setProp`, `element`
 * and `spread` alike.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { classToString, element, setProp, spread } from "./dom.ts";
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

function classes(el: Element): string[] {
  return [...el.classList].toSorted();
}

describe("a class value", () => {
  test("a map applies its truthy keys", () => {
    expect(classToString({ active: true, muted: false, big: 1 })).toBe("active big");
  });

  test("a list joins strings and maps in order and drops falsy members", () => {
    expect(classToString(["card", false, null, { active: true, muted: false }, ""])).toBe(
      "card active",
    );
  });

  test("a list nested in a list is flattened", () => {
    expect(classToString(["card", ["row", { wide: true }], [[{ dense: 1 }]]])).toBe(
      "card row wide dense",
    );
  });

  test("an empty list or map is a present, empty class", () => {
    expect(classToString([])).toBe("");
    expect(classToString({})).toBe("");
    expect(classToString(false)).toBeNull();
    expect(classToString(undefined)).toBeNull();
  });
});

describe("class on an element", () => {
  test("a list with a map lands on the class attribute", () => {
    const el = document.createElement("div");
    setProp(el, "class", ["card", { active: true, disabled: false }]);
    expect(el.getAttribute("class")).toBe("card active");
  });

  test("a reactive list follows its source", () => {
    const el = document.createElement("div");
    const [on, setOn] = createSignal(false);
    createRoot(() => setProp(el, "class", () => ["card", { active: on() }]));
    expect(classes(el)).toEqual(["card"]);

    setOn(true);
    flush();
    expect(classes(el)).toEqual(["active", "card"]);
  });

  test("createElement applies it", () => {
    const el = createRoot(() =>
      element("div", { class: ["card", { active: true }] }),
    ) as HTMLElement;
    expect(classes(el)).toEqual(["active", "card"]);
  });

  test("spread applies it and replaces it", () => {
    const el = document.createElement("div");
    const [props, setProps] = createSignal<Record<string, unknown>>({
      class: ["card", { active: true }],
    });
    createRoot(() => spread(el, () => props()));
    expect(classes(el)).toEqual(["active", "card"]);

    setProps({ class: { done: true } });
    flush();
    expect(classes(el)).toEqual(["done"]);
  });

  test("it lands on the class attribute of an SVG element", () => {
    const el = document.createElementNS(SVG_NS, "circle");
    setProp(el, "class", ["dot", { ring: true, hidden: false }]);
    expect(el.getAttribute("class")).toBe("dot ring");
  });

  test("classList is an attribute like any other name", () => {
    const el = document.createElement("div");
    setProp(el, "classList", "card");
    expect(el.getAttribute("classlist")).toBe("card");
    expect(classes(el)).toEqual([]);
  });
});
