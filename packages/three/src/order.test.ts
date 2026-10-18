import { afterEach, beforeEach, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import type * as THREE from "three";

import { Ordered, seen, setHead, setNames } from "./fixtures/order.tsx";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
  seen.frame.length = 0;
  seen.effect.length = 0;
});
afterEach(() => {
  unmountAll();
  frames.restore();
  setNames([]);
  setHead(false);
  flush();
});

const order = (group: THREE.Object3D): string[] => group.children.map((child) => child.name);

test("children are in order as soon as flush returns: growth, prepend, middle insert, reorder", () => {
  const { scene } = mount(() => Ordered());
  const group = scene.children[0];
  const steps: [() => void, string[]][] = [
    [() => setNames(["a", "b", "c"]), ["a", "b", "c", "tail"]],
    [() => setNames(["z", "a", "b", "c"]), ["z", "a", "b", "c", "tail"]],
    [() => setNames(["z", "a", "m", "b", "c"]), ["z", "a", "m", "b", "c", "tail"]],
    [() => setNames(["c", "m", "a", "z", "b"]), ["c", "m", "a", "z", "b", "tail"]],
    [() => setHead(true), ["head", "c", "m", "a", "z", "b", "tail"]],
    [() => setNames(["b", "a"]), ["head", "b", "a", "tail"]],
  ];
  for (const [change, expected] of steps) {
    change();
    flush();
    expect(order(group)).toEqual(expected);
  }
});

test("an effect and a useFrame subscriber read them in order", () => {
  const { scene } = mount(() => Ordered());
  const group = scene.children[0];
  setNames(["a", "b", "c"]);
  flush();
  setNames(["c", "b", "a"]);
  flush();
  expect(seen.effect.at(-1)).toEqual(["c", "b", "a", "tail"]);
  frames.step();
  expect(seen.frame.at(-1)).toEqual(["c", "b", "a", "tail"]);
  expect(order(group)).toEqual(["c", "b", "a", "tail"]);
});
