/**
 * `classList` is a typed prop on both HTMLAttributes and SVGAttributes, so it
 * needs a runtime branch: without one it falls through to setElementAttr and
 * writes classlist="[object Object]".
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement, setProp, spread } from "./dom.ts";
import { flush, signal } from "./signals.ts";

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

describe("classList", () => {
  test("truthy keys become classes, falsy ones do not", () => {
    const el = document.createElement("div");
    setProp(el, "classList", { active: true, muted: false, big: 1 });
    expect(classes(el)).toEqual(["active", "big"]);
    expect(el.hasAttribute("classlist")).toBe(false);
  });

  test("it is additive: an existing class survives", () => {
    const el = document.createElement("div");
    el.className = "card";
    setProp(el, "classList", { active: true });
    expect(classes(el)).toEqual(["active", "card"]);
  });

  test("a reactive object removes the keys that vanished, and nothing else", () => {
    const el = document.createElement("div");
    el.className = "card";
    const state = signal<Record<string, unknown>>({ active: true, busy: true });
    setProp(el, "classList", () => state());
    expect(classes(el)).toEqual(["active", "busy", "card"]);

    state.set({ busy: true, done: true });
    flush();
    expect(classes(el)).toEqual(["busy", "card", "done"]);
  });

  test("a per-key accessor toggles on its own", () => {
    const el = document.createElement("div");
    const on = signal(false);
    setProp(el, "classList", { active: () => on() });
    expect(classes(el)).toEqual([]);

    on.set(true);
    flush();
    expect(classes(el)).toEqual(["active"]);
  });

  test("a key naming several classes toggles all of them", () => {
    const el = document.createElement("div");
    const on = signal(true);
    setProp(el, "classList", () => ({ "a b": on() }));
    expect(classes(el)).toEqual(["a", "b"]);

    on.set(false);
    flush();
    expect(classes(el)).toEqual([]);
  });

  test("createElement applies it", () => {
    const el = createElement("div", { classList: { active: true } }) as HTMLElement;
    expect(classes(el)).toEqual(["active"]);
    expect(el.hasAttribute("classlist")).toBe(false);
  });

  test("spread applies it", () => {
    const el = document.createElement("div");
    const props = signal<Record<string, unknown>>({ classList: { active: true } });
    spread(el, () => props());
    expect(classes(el)).toEqual(["active"]);

    props.set({ classList: { done: true } });
    flush();
    expect(classes(el)).toEqual(["done"]);
  });

  test("it lands on the class attribute of an SVG element, not on class-list", () => {
    const el = document.createElementNS(SVG_NS, "circle");
    setProp(el, "classList", { ring: true });
    expect(el.getAttribute("class")).toBe("ring");
    expect(el.hasAttribute("class-list")).toBe(false);
  });

  test("a nullish value clears everything it applied", () => {
    const el = document.createElement("div");
    el.className = "card";
    const state = signal<Record<string, unknown> | null>({ active: true });
    setProp(el, "classList", () => state());
    expect(classes(el)).toEqual(["active", "card"]);

    state.set(null);
    flush();
    expect(classes(el)).toEqual(["card"]);
  });
});
