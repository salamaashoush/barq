import { expect, test } from "bun:test";
import { setStyle, spread } from "./dom.ts";
import { createSignal, flush, rootScope, runWithOwner } from "./signals.ts";

function box(): HTMLDivElement {
  return document.createElement("div");
}

test("a style object replaced by undefined clears what it set", () => {
  const node = box();
  const applied = setStyle(node, "style", { color: "red" }, undefined);
  expect(node.style.color).toBe("red");
  setStyle(node, "style", undefined, applied);
  expect(node.style.color).toBe("");
});

test("a style string replaced by undefined clears the attribute", () => {
  const node = box();
  const applied = setStyle(node, "style", "color: red", undefined);
  setStyle(node, "style", undefined, applied);
  expect(node.getAttribute("style") ?? "").toBe("");
});

test("a style string replaced by an object drops the string's declarations", () => {
  const node = box();
  const applied = setStyle(node, "style", "color: red", undefined);
  setStyle(node, "style", { background: "blue" }, applied);
  expect(node.style.color).toBe("");
  expect(node.style.background).toBe("blue");
});

test("a spread that loses its style key clears the style it applied", () => {
  const node = box();
  const [props, setProps] = createSignal<Record<string, unknown>>({
    title: "total",
    style: { color: "red" },
  });
  runWithOwner(rootScope(), () => spread(node, () => props()));
  flush();
  expect(node.style.color).toBe("red");

  setProps({});
  flush();
  expect(node.getAttribute("title")).toBeNull();
  expect(node.style.color).toBe("");
});

test("a custom property keeps its name and takes a number as written", () => {
  const node = box();
  setStyle(node, "style", { "--gridColumns": 3 }, undefined);
  expect(node.style.getPropertyValue("--gridColumns")).toBe("3");
});

test("a unitless property takes a number as written", () => {
  const node = box();
  setStyle(node, "style", { gridRow: 2, scale: 1.5 }, undefined);
  expect(node.style.getPropertyValue("grid-row")).toBe("2");
  expect(node.style.getPropertyValue("scale")).toBe("1.5");
});
