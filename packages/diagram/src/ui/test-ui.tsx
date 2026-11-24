/** Mounting `<DiagramEditor>` with its UI in a 1000 by 640 region, and driving it. */

import { afterEach, beforeEach } from "bun:test";
import { flush } from "@barqjs/core";
import { cleanup, render, tick } from "@barqjs/testing";

import { DiagramEditor, type DiagramEditorApi, type DiagramEditorProps } from "../index.ts";

const SIZE = { width: 1000, height: 640 };
const originalRect = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
/**
 * The region's size and the cleanup, for the file that calls it: hooks a
 * shared module registers reach only the first test file that loads it.
 */
export function setupUITests(): void {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: SIZE.width,
        bottom: SIZE.height,
        ...SIZE,
      } as DOMRect;
    };
  });
  afterEach(() => {
    if (originalRect)
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalRect);
  });
  afterEach(cleanup);
}

export async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) {
    flush();
    await tick();
  }
  flush();
}

export async function mountEditor(
  props: Partial<DiagramEditorProps> = {},
): Promise<{ api: DiagramEditorApi; region: HTMLElement }> {
  let api: DiagramEditorApi | undefined;
  render(() => <DiagramEditor height={SIZE.height} {...props} api={(given) => (api = given)} />);
  await settle();
  const region = document.querySelector<HTMLElement>("[role=application]");
  if (!api || !region) throw new Error("the editor did not mount");
  return { api, region };
}

export const pointer = (target: Element, type: string, x: number, y: number, button = 0) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      button: type === "pointermove" ? -1 : button,
      buttons: type === "pointerup" ? 0 : button === 2 ? 2 : 1,
      bubbles: true,
      cancelable: true,
    }),
  );

export const canvas = (region: HTMLElement): HTMLCanvasElement =>
  region.querySelectorAll("canvas")[2]!;

export const rectangle = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ({
    ...extra,
    type: "rectangle",
    id,
    x,
    y,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
    fillStyle: "solid",
  }) as never;

export const select = async (api: DiagramEditorApi, ...ids: string[]) => {
  api.updateScene({
    appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
  });
  await settle();
};
