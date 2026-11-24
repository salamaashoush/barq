/**
 * The visible set a canvas draws: found through the culling grid in a large
 * scene, the same elements in the same order as testing each one.
 */

import { describe, expect, test } from "bun:test";
import { Scene, getElementBounds, newElement } from "@excalidraw/element";

import { Renderer } from "./renderer.ts";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { NormalizedZoomValue } from "../types.ts";

function grid(count: number) {
  return Array.from({ length: count }, (_, index) =>
    newElement({
      type: index % 3 === 0 ? "ellipse" : "rectangle",
      x: (index % 60) * 160,
      y: Math.floor(index / 60) * 120,
      width: index === 7 ? 40_000 : 100,
      height: 80,
    }),
  );
}

function view(scrollX: number, scrollY: number, zoom = 1) {
  return {
    zoom: { value: zoom as NormalizedZoomValue },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX,
    scrollY,
    width: 1280,
    height: 800,
    editingTextElement: null,
    newElement: null,
    selectedElements: [],
    selectedElementsAreBeingDragged: false,
    frameToHighlight: null,
  };
}

/** Every element whose bounds meet the viewport, tested one by one. */
function bruteForce(
  elements: readonly NonDeletedExcalidrawElement[],
  scrollX: number,
  scrollY: number,
  zoom = 1,
) {
  const map = new Map(elements.map((element) => [element.id, element]));
  const left = -scrollX;
  const top = -scrollY;
  const right = left + 1280 / zoom;
  const bottom = top + 800 / zoom;
  return elements
    .filter((element) => {
      const [x1, y1, x2, y2] = getElementBounds(element, map);
      return left <= x2 && top <= y2 && right >= x1 && bottom >= y1;
    })
    .map((element) => element.id);
}

describe("Renderer", () => {
  test("a large scene's visible set comes from the grid as from a walk, in drawing order", () => {
    const elements = grid(3000);
    const scene = new Scene(elements);
    const renderer = new Renderer(scene);
    for (const [scrollX, scrollY, zoom] of [
      [0, 0, 1],
      [-2000, -1500, 1],
      [-4321, -987, 1],
      [-6000, -3000, 2],
    ] as const) {
      const { visibleElements } = renderer.getRenderableElements(view(scrollX, scrollY, zoom));
      expect(visibleElements.map((element) => element.id)).toEqual(
        bruteForce(scene.getNonDeletedElements(), scrollX, scrollY, zoom),
      );
    }
    // the element wider than the grid's cells is found far from its origin
    const { visibleElements } = renderer.getRenderableElements(view(-20_000, 0));
    expect(visibleElements.some((element) => element.id === elements[7]!.id)).toBe(true);
  });

  test("a moved element is found where it went", () => {
    const elements = grid(3000);
    const scene = new Scene(elements);
    const renderer = new Renderer(scene);
    renderer.getRenderableElements(view(0, 0));
    const moved = elements[0]!;
    scene.mutateElement(moved, { x: 5000, y: 3000 });
    const { visibleElements } = renderer.getRenderableElements(view(-4800, -2900));
    expect(visibleElements.some((element) => element.id === moved.id)).toBe(true);
  });
});
