/**
 * The shape switch, Excalidraw's Tab and Shift+Tab on a selection, here on
 * Alt+Shift+. and Alt+Shift+, so that Tab keeps moving through the elements
 * and out of the editor.
 */

import { afterEach, expect, test } from "bun:test";
import { KEYS } from "@excalidraw/common";
import { getLinearElementSubType, isLinearElement } from "@excalidraw/element";

import { API, Keyboard, h, renderEditor, unmountEditors } from "./test-editor.ts";

afterEach(unmountEditors);

function live() {
  return h().scene.getNonDeletedElements();
}

function next() {
  return Keyboard.withModifierKeys({ alt: true, shift: true }, () => Keyboard.keyPress("."));
}
function previous() {
  return Keyboard.withModifierKeys({ alt: true, shift: true }, () => Keyboard.keyPress(","));
}

test("Alt+Shift+. and , switch a shape through rectangle, diamond and ellipse", () => {
  renderEditor();
  API.loadElements([API.createElement({ id: "a", x: 0, y: 0, width: 100, height: 60 })]);
  API.setSelectedElements([live()[0]!]);
  next();
  expect(live()[0]?.type).toBe("diamond");
  next();
  expect(live()[0]?.type).toBe("ellipse");
  previous();
  expect(live()[0]?.type).toBe("diamond");
  // the same element, still selected
  expect(live()[0]?.id).toBe("a");
  expect(h().state.selectedElementIds).toEqual({ a: true });
  Keyboard.undo();
  expect(live()[0]?.type).toBe("ellipse");
});

test("a line switches through the arrow kinds", () => {
  renderEditor();
  API.loadElements([
    API.createElement({ type: "line", id: "l", x: 0, y: 0, width: 100, height: 0 }),
  ]);
  API.setSelectedElements([live()[0]!]);
  next();
  const [element] = live();
  expect(element && isLinearElement(element) ? getLinearElementSubType(element) : null).toBe(
    "sharpArrow",
  );
});

test("Tab still moves the selection to the next element", () => {
  renderEditor();
  API.loadElements([
    API.createElement({ id: "a", x: 0, y: 0 }),
    API.createElement({ id: "b", x: 200, y: 0 }),
  ]);
  API.setSelectedElements([live()[0]!]);
  Keyboard.keyPress(KEYS.TAB);
  expect(h().state.selectedElementIds).toEqual({ b: true });
  expect(live().map((element) => element.type)).toEqual(["rectangle", "rectangle"]);
});
