/**
 * The static scene on a canvas, read back through a recording 2D context:
 * the background, the viewport transform, the elements drawn, text in its
 * direction, the dark theme, and the image cache feeding image elements.
 */

import { describe, expect, test } from "bun:test";
import { MIME_TYPES, THEME } from "@excalidraw/common";

import { type AppState, SceneCanvas, getDefaultAppState, loadFromBlob } from "./index.ts";
import type { NormalizedZoomValue } from "./types.ts";
import { contextOf } from "./test-canvas.ts";

async function releaseFlow() {
  const file = Bun.file(`${import.meta.dir}/fixtures/release-flow.excalidraw`);
  return loadFromBlob(
    new Blob([await file.arrayBuffer()], { type: MIME_TYPES.excalidraw }),
    null,
    null,
  );
}

function viewport(overrides: Partial<AppState> = {}): AppState {
  return {
    ...getDefaultAppState(),
    width: 800,
    height: 600,
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 100,
    scrollY: 120,
    ...overrides,
  };
}

describe("SceneCanvas", () => {
  test("draws the background, then every element in view through the viewport transform", async () => {
    const scene = await releaseFlow();
    const canvas = document.createElement("canvas");
    const view = new SceneCanvas(canvas, scene.elements);
    view.render(viewport({ viewBackgroundColor: "#fafafa" }), 2);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe("800px");
    const context = contextOf(canvas);
    const [background] = context.named("fillRect");
    expect(background?.fillStyle).toBe("#fafafa");
    expect(background?.args).toEqual([0, 0, 800, 600]);
    expect(context.named("scale")[0]?.args).toEqual([2, 2]);
    // Elements are cached bitmaps blitted into place, or drawn directly.
    const drawn = context.named("drawImage").length + context.named("stroke").length;
    expect(drawn).toBeGreaterThan(5);
    view.destroy();
  });

  test("text is laid out in its own direction", async () => {
    const scene = await releaseFlow();
    const canvas = document.createElement("canvas");
    const view = new SceneCanvas(canvas, scene.elements);
    view.render(viewport({ shouldCacheIgnoreZoom: false }), 1);
    // Text is rasterized into per-element canvases first; the recording
    // contexts of those are where fillText lands.
    function writes(text: string) {
      return allContexts().find((context) =>
        context.named("fillText").some((call) => call.args[0] === text),
      );
    }
    const arabic = writes("مرحبا بالعالم");
    expect(arabic?.canvas.getAttribute("dir")).toBe("rtl");
    const texts = allContexts().flatMap((context) => context.named("fillText"));
    expect(texts.some((call) => call.args[0] === "Release flow")).toBe(true);
    view.destroy();
  });

  test("the dark theme fills a dark background", async () => {
    const scene = await releaseFlow();
    const canvas = document.createElement("canvas");
    const view = new SceneCanvas(canvas, scene.elements);
    view.render(viewport({ theme: THEME.DARK, viewBackgroundColor: "#ffffff" }), 1);
    const [background] = contextOf(canvas).named("fillRect");
    expect(background?.fillStyle).not.toBe("#ffffff");
    expect(String(background?.fillStyle)).toMatch(/^#[0-9a-f]{6}$/i);
    view.destroy();
  });

  test("elements outside the viewport are not drawn", async () => {
    const scene = await releaseFlow();
    const canvas = document.createElement("canvas");
    const view = new SceneCanvas(canvas, scene.elements);
    view.render(
      viewport({ scrollX: -50_000, scrollY: -50_000, zoom: { value: 1 as NormalizedZoomValue } }),
      1,
    );
    const context = contextOf(canvas);
    expect(context.named("drawImage")).toHaveLength(0);
    expect(context.named("fillText")).toHaveLength(0);
    view.destroy();
  });

  test("an image element drawn before its file decoded is redrawn with the image", async () => {
    const scene = await releaseFlow();
    const canvas = document.createElement("canvas");
    const view = new SceneCanvas(canvas, scene.elements);
    view.render(viewport({ scrollX: -500, scrollY: 100 }), 1);
    const dataURL = Object.values(scene.files)[0]?.dataURL;
    function drawsImage() {
      return allContexts()
        .flatMap((context) => context.named("drawImage"))
        .some((call) => call.args[0] instanceof HTMLImageElement && call.args[0].src === dataURL);
    }
    expect(drawsImage()).toBe(false);
    await view.setFiles(scene.files);
    expect(view.imageCache.size).toBe(1);
    expect(drawsImage()).toBe(true);
    view.destroy();
  });
});

const created: HTMLCanvasElement[] = [];
const createElement = document.createElement.bind(document);
document.createElement = (tag: string, options?: ElementCreationOptions) => {
  const element = createElement(tag, options);
  if (element instanceof HTMLCanvasElement) created.push(element);
  return element;
};

function allContexts() {
  return created.map((canvas) => contextOf(canvas));
}
