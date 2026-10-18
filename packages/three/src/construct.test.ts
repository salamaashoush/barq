import { afterEach, beforeEach, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import type * as THREE from "three";

import {
  Bare,
  Constant,
  CountedGeometry,
  Later,
  Reactive,
  setRows,
  setShown,
  setWidth,
} from "./fixtures/construct.tsx";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
  setWidth(2);
  flush();
  CountedGeometry.built = 0;
});
afterEach(() => {
  unmountAll();
  frames.restore();
  setShown(false);
  setRows([]);
  flush();
});

const geometryOf = (scene: THREE.Scene, at = 0): THREE.BoxGeometry =>
  (scene.children[at] as THREE.Mesh).geometry as THREE.BoxGeometry;

test("an object whose args read a signal is built once on mount, with them", () => {
  const { scene } = mount(() => Reactive());
  expect(CountedGeometry.built).toBe(1);
  expect(geometryOf(scene).parameters.width).toBe(2);
});

test("constant args and no args build once too", () => {
  const constant = mount(() => Constant());
  expect(CountedGeometry.built).toBe(1);
  expect(geometryOf(constant.scene).parameters.width).toBe(3);
  mount(() => Bare());
  expect(CountedGeometry.built).toBe(2);
});

test("a later change of args rebuilds exactly once", () => {
  const { scene } = mount(() => Reactive());
  setWidth(5);
  flush();
  expect(CountedGeometry.built).toBe(2);
  expect(geometryOf(scene).parameters.width).toBe(5);
});

test("objects mounted later by control flow are built once each, with their args", () => {
  const { scene } = mount(() => Later());
  expect(CountedGeometry.built).toBe(0);
  setShown(true);
  flush();
  expect(CountedGeometry.built).toBe(1);
  setRows([1, 2, 3]);
  flush();
  expect(CountedGeometry.built).toBe(4);
  const group = scene.children[0];
  const widths = group.children.map(
    (mesh) => ((mesh as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width,
  );
  expect(widths).toEqual([2, 3, 4, 5]);
});
