/**
 * `selectedIndex` has no content attribute: written as one it is an unknown
 * attribute and the select keeps showing what it showed.
 */

import { expect, test } from "bun:test";
import { spread } from "./dom.ts";
import { createSignal, flush, rootScope, runWithOwner } from "@barqjs/core";

function select(): HTMLSelectElement {
  const element = document.createElement("select");
  for (const value of ["ada", "grace", "edsger"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    element.appendChild(option);
  }
  return element;
}

test("selectedIndex is written as the property and tracks the signal", () => {
  const element = select();
  const [props, setProps] = createSignal<Record<string, unknown>>({ selectedIndex: 1 });
  runWithOwner(rootScope(), () => spread(element, props));
  flush();
  expect(element.value).toBe("grace");
  expect(element.hasAttribute("selectedIndex")).toBe(false);
  setProps({ selectedIndex: 2 });
  flush();
  expect(element.value).toBe("edsger");
});

test("selectedIndex is re-asserted after the user picks another option", () => {
  const element = select();
  const [props, setProps] = createSignal<Record<string, unknown>>({ selectedIndex: 1 });
  runWithOwner(rootScope(), () => spread(element, props));
  flush();
  element.selectedIndex = 0;
  setProps({ selectedIndex: 1 });
  flush();
  expect(element.value).toBe("grace");
});
