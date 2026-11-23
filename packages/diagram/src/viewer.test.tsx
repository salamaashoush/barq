/**
 * The viewer in a page: what it tells assistive technology, how it fits the
 * content, and how the wheel, a pinch, a drag and the keyboard move it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { colorScheme } from "@barqjs/primitives/color-scheme";
import { render } from "@barqjs/web";
import { MIME_TYPES } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import { type DiagramScene, type DiagramViewerApi, DiagramViewer, loadFromBlob } from "./index.ts";
import { contextOf } from "./test-canvas.ts";

let size = { width: 800, height: 400 };
const observers: ResizeObserverCallback[] = [];

class TestResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(callback);
  }
  public observe(): void {}
  public disconnect(): void {
    observers.splice(observers.indexOf(this.callback), 1);
  }
}

const originalRect = HTMLElement.prototype.getBoundingClientRect;
const originalObserver = window.ResizeObserver;
beforeEach(() => {
  size = { width: 800, height: 400 };
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      ...size,
    } as DOMRect;
  };
  (window as { ResizeObserver: unknown }).ResizeObserver = TestResizeObserver;
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  (window as { ResizeObserver: unknown }).ResizeObserver = originalObserver;
});

async function releaseFlow(): Promise<DiagramScene> {
  const file = Bun.file(`${import.meta.dir}/fixtures/release-flow.excalidraw`);
  return loadFromBlob(
    new Blob([await file.arrayBuffer()], { type: MIME_TYPES.excalidraw }),
    null,
    null,
  );
}

async function mount(
  view: (grab: (api: DiagramViewerApi) => void) => unknown,
): Promise<{ api: DiagramViewerApi; region: HTMLElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  let api: DiagramViewerApi | undefined;
  cleanups.push(render(() => view((given) => (api = given)) as never, container));
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const region = container.querySelector<HTMLElement>("[aria-roledescription=diagram]");
  if (api === undefined || region === null) throw new Error("the viewer did not mount");
  return { api, region };
}

/** happy-dom's WheelEvent drops the MouseEvent part of its init: the keys and the pointer. */
function wheel(init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { ...init, bubbles: true, cancelable: true });
  for (const key of ["ctrlKey", "metaKey", "shiftKey", "clientX", "clientY", "buttons"] as const) {
    Object.defineProperty(event, key, {
      value: init[key] ?? (typeof event[key] === "boolean" ? false : 0),
    });
  }
  return event;
}

function zoomOf(api: DiagramViewerApi): number {
  return api.getAppState().zoom.value;
}

/** Where a scene point lands in the viewport. */
function onScreen(api: DiagramViewerApi, x: number, y: number) {
  const { scrollX, scrollY, zoom } = api.getAppState();
  return { x: (x + scrollX) * zoom.value, y: (y + scrollY) * zoom.value };
}

describe("DiagramViewer", () => {
  test("is a named, described, focusable region over a canvas", async () => {
    const scene = await releaseFlow();
    const named = { ...scene, appState: { ...scene.appState, name: "Release flow" } };
    const { region } = await mount((grab) => <DiagramViewer scene={named} api={grab} />);
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Release flow");
    expect(region.tabIndex).toBe(0);
    expect(region.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    const description = document.getElementById(region.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Start");
    expect(description?.textContent).toContain("مرحبا بالعالم");
  });

  test("fits the content inside the viewport, padding kept", async () => {
    const scene = await releaseFlow();
    const { api } = await mount((grab) => <DiagramViewer scene={scene} api={grab} padding={20} />);
    const [x1, y1, x2, y2] = getCommonBounds(api.getSceneElements());
    const topLeft = onScreen(api, x1, y1);
    const bottomRight = onScreen(api, x2, y2);
    expect(topLeft.x).toBeGreaterThanOrEqual(19.5);
    expect(topLeft.y).toBeGreaterThanOrEqual(19.5);
    expect(bottomRight.x).toBeLessThanOrEqual(780.5);
    expect(bottomRight.y).toBeLessThanOrEqual(380.5);
    // It fills one axis: contain.
    const filled = Math.max(topLeft.x + (800 - bottomRight.x), topLeft.y + (400 - bottomRight.y));
    expect(Math.min(Math.abs(topLeft.x - 20), Math.abs(topLeft.y - 20))).toBeLessThan(1);
    expect(filled).toBeGreaterThan(0);
  });

  test("ctrl+wheel zooms around the pointer and keeps the point under it", async () => {
    const scene = await releaseFlow();
    const { api, region } = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    const before = zoomOf(api);
    const { scrollX, scrollY, zoom } = api.getAppState();
    const pointer = { x: 300, y: 200 };
    const scenePoint = { x: pointer.x / zoom.value - scrollX, y: pointer.y / zoom.value - scrollY };
    const event = wheel({ deltaY: -100, ctrlKey: true, clientX: pointer.x, clientY: pointer.y });
    region.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(zoomOf(api)).toBeGreaterThan(before);
    const after = onScreen(api, scenePoint.x, scenePoint.y);
    expect(after.x).toBeCloseTo(pointer.x, 3);
    expect(after.y).toBeCloseTo(pointer.y, 3);
  });

  test("a plain wheel pans, and shift pans across", async () => {
    const scene = await releaseFlow();
    const { api, region } = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    const { scrollX, scrollY, zoom } = api.getAppState();
    region.dispatchEvent(wheel({ deltaY: 50 }));
    expect(api.getAppState().scrollY).toBeCloseTo(scrollY - 50 / zoom.value, 6);
    region.dispatchEvent(wheel({ deltaY: 40, shiftKey: true }));
    expect(api.getAppState().scrollX).toBeCloseTo(scrollX - 40 / zoom.value, 6);
  });

  test("the keyboard zooms, pans and fits again", async () => {
    const scene = await releaseFlow();
    const { api, region } = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    const fitted = api.getAppState();
    const key = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      region.dispatchEvent(event);
      return event;
    };
    expect(key({ key: "+", code: "Equal", shiftKey: true }).defaultPrevented).toBe(true);
    expect(zoomOf(api)).toBeCloseTo(fitted.zoom.value + 0.1, 6);
    key({ key: "-", code: "Minus" });
    expect(zoomOf(api)).toBeCloseTo(fitted.zoom.value, 6);
    key({ key: "ArrowRight", code: "ArrowRight" });
    expect(api.getAppState().scrollX).toBeCloseTo(fitted.scrollX - 80 / fitted.zoom.value, 6);
    key({ key: "0", code: "Digit0", ctrlKey: true });
    expect(zoomOf(api)).toBe(1);
    key({ key: "!", code: "Digit1", shiftKey: true });
    expect(api.getAppState().zoom.value).toBeCloseTo(Math.min(1, fitted.zoom.value), 6);
    expect(key({ key: "a", code: "KeyA" }).defaultPrevented).toBe(false);
  });

  test("a drag pans and a pinch zooms", async () => {
    const scene = await releaseFlow();
    const { api, region } = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    const pointer = (type: string, pointerId: number, x: number, y: number) =>
      region.dispatchEvent(
        new PointerEvent(type, { pointerId, clientX: x, clientY: y, button: 0, bubbles: true }),
      );
    const start = api.getAppState();
    pointer("pointerdown", 1, 100, 100);
    pointer("pointermove", 1, 160, 130);
    pointer("pointerup", 1, 160, 130);
    expect(api.getAppState().scrollX).toBeCloseTo(start.scrollX + 60 / start.zoom.value, 6);
    expect(api.getAppState().scrollY).toBeCloseTo(start.scrollY + 30 / start.zoom.value, 6);

    const before = zoomOf(api);
    pointer("pointerdown", 2, 300, 200);
    pointer("pointerdown", 3, 400, 200);
    pointer("pointermove", 3, 500, 200);
    expect(zoomOf(api)).toBeCloseTo(before * 2, 3);
    pointer("pointerup", 2, 300, 200);
    pointer("pointerup", 3, 500, 200);
  });

  test("refits on resize until it is navigated, then keeps the view", async () => {
    const scene = await releaseFlow();
    const { api, region } = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    const small = zoomOf(api);
    size = { width: 1600, height: 800 };
    for (const observe of observers) observe([], {} as ResizeObserver);
    expect(api.getAppState().width).toBe(1600);
    expect(zoomOf(api)).toBeGreaterThan(small);

    region.dispatchEvent(
      new KeyboardEvent("keydown", { key: "+", code: "Equal", shiftKey: true, bubbles: true }),
    );
    const navigated = zoomOf(api);
    size = { width: 400, height: 200 };
    for (const observe of observers) observe([], {} as ResizeObserver);
    expect(api.getAppState().width).toBe(400);
    expect(zoomOf(api)).toBe(navigated);
    api.scrollToContent();
    expect(zoomOf(api)).toBeLessThan(navigated);
  });

  test("follows the color scheme above it, and a theme prop wins", async () => {
    const scene = await releaseFlow();
    let set!: (choice: "light" | "dark") => void;
    function Page(props: { grab: (api: DiagramViewerApi) => void }) {
      const scheme = colorScheme({
        themes: ["light", "dark"],
        system: false,
        defaultChoice: "dark",
        key: "diagram-test",
      });
      set = scheme.set;
      return <DiagramViewer scene={scene} api={props.grab} />;
    }
    const { api, region } = await mount((grab) => <Page grab={grab} />);
    expect(region.dataset.theme).toBe("dark");
    expect(api.getAppState().theme).toBe("dark");
    const canvas = region.querySelector("canvas")!;
    expect(contextOf(canvas).named("fillRect").at(-1)?.fillStyle).not.toBe("#ffffff");
    set("light");
    flush();
    expect(api.getAppState().theme).toBe("light");
    expect(contextOf(canvas).named("fillRect").at(-1)?.fillStyle).toBe("#ffffff");

    const forced = await mount((grab) => <DiagramViewer scene={scene} theme="dark" api={grab} />);
    expect(forced.api.getAppState().theme).toBe("dark");
    const plain = await mount((grab) => <DiagramViewer scene={scene} api={grab} />);
    expect(plain.api.getAppState().theme).toBe("light");
  });

  test("exposes the scene, and loads a new one when the prop changes", async () => {
    const scene = await releaseFlow();
    const [current, setCurrent] = createSignal<DiagramScene | null>(scene);
    const { api, region } = await mount((grab) => <DiagramViewer scene={current()} api={grab} />);
    const elements = scene.elements ?? [];
    expect(api.getSceneElements()).toHaveLength(elements.filter((each) => !each.isDeleted).length);
    expect(Object.keys(api.getFiles())).toHaveLength(1);
    setCurrent({ elements: [elements[1]!], appState: { name: "One box" } });
    flush();
    expect(api.getSceneElements()).toHaveLength(1);
    expect(region.getAttribute("aria-label")).toBe("One box");
    setCurrent(null);
    flush();
    expect(api.getSceneElements()).toHaveLength(0);
  });
});
