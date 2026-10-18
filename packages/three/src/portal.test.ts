import { afterEach, beforeEach, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";

import { WithPortal, target } from "./fixtures/portal.tsx";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
});
afterEach(() => {
  unmountAll();
  frames.restore();
});

test("createPortal renders into another object, under a state whose scene is that object", async () => {
  const [shown, setShown] = createSignal(true);
  const { scene, gl } = mount(() => WithPortal({ shown }));
  await Promise.resolve();
  flush();
  expect(target.children.map((child) => child.name)).toEqual(["in-layer"]);
  // The portal's marker never enters three's graph.
  expect(scene.children[0].children.map((child) => child.name)).toEqual(["sibling"]);

  frames.step();
  const before = gl.renders;
  setShown(false);
  flush();
  expect(target.children).toHaveLength(0);
  // A change inside a portal asks the root that owns it for a frame.
  expect(frames.step()).toBe(true);
  expect(gl.renders).toBe(before + 1);
});
