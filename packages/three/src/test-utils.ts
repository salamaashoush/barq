/**
 * A root with no WebGL: a renderer double that counts its renders, and a
 * frame clock the test advances by hand instead of `requestAnimationFrame`.
 */

import { flush, type JSXElement } from "@barqjs/core";
import * as THREE from "three";

import { createRoot, type Root, type RootConfig } from "./renderer.ts";
import type { RootState } from "./store.ts";

export interface FakeRenderer {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number, style?: boolean): void;
  setPixelRatio(ratio: number): void;
  renders: number;
  sizes: [number, number][];
  ratio: number;
  domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType; needsUpdate: boolean };
  outputColorSpace: string;
  toneMapping: THREE.ToneMapping;
  disposed: boolean;
  dispose(): void;
}

export function fakeRenderer(
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): FakeRenderer {
  const gl: FakeRenderer = {
    renders: 0,
    sizes: [],
    ratio: 1,
    domElement: canvas,
    shadowMap: { enabled: false, type: THREE.PCFShadowMap, needsUpdate: false },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    disposed: false,
    render() {
      gl.renders++;
    },
    setSize(width, height) {
      gl.sizes.push([width, height]);
    },
    setPixelRatio(ratio) {
      gl.ratio = ratio;
    },
    dispose() {
      gl.disposed = true;
    },
  };
  return gl;
}

/** Frames that run only when `step` is called. */
export interface Frames {
  /** Run the frame that was asked for, if any, at `time`. Returns whether one ran. */
  step(time?: number): boolean;
  /** Whether a frame is asked for. */
  readonly pending: boolean;
  restore(): void;
}

export function manualFrames(): Frames {
  const original = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let queue: FrameRequestCallback[] = [];
  let clock = 0;
  let id = 0;
  globalThis.requestAnimationFrame = (callback) => {
    queue.push(callback);
    return ++id;
  };
  globalThis.cancelAnimationFrame = () => {
    queue = [];
  };
  return {
    step(time) {
      clock = time ?? clock + 16;
      const run = queue;
      queue = [];
      for (const callback of run) callback(clock);
      return run.length > 0;
    },
    get pending() {
      return queue.length > 0;
    },
    restore() {
      // The loop waits on the frame it asked for; one that never ran would
      // leave it waiting into the next test.
      for (let i = 0; i < 100 && queue.length > 0; i++) {
        const run = queue;
        queue = [];
        for (const callback of run) callback((clock += 16));
      }
      globalThis.requestAnimationFrame = original;
      globalThis.cancelAnimationFrame = originalCancel;
    },
  };
}

export interface Mounted {
  root: Root;
  state: RootState;
  gl: FakeRenderer;
  scene: THREE.Scene;
  unmount(): void;
}

const mounted = new Set<Root>();

/** Unmount every root `mount` made and the test left mounted. */
export function unmountAll(): void {
  for (const root of mounted) root.unmount();
  mounted.clear();
}

/** Render `code` into a fresh root over a detached canvas, sized 800 by 600. */
export function mount(code: () => JSXElement, config: RootConfig = {}): Mounted {
  const gl = fakeRenderer();
  const canvas = document.createElement("canvas");
  const root = createRoot(canvas);
  root.configure({ gl, size: { width: 800, height: 600, top: 0, left: 0 }, ...config });
  root.render(code);
  flush();
  mounted.add(root);
  return {
    root,
    state: root.store,
    gl,
    scene: root.store.scene,
    unmount: () => {
      mounted.delete(root);
      root.unmount();
    },
  };
}
