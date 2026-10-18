import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Show, block, createSignal, flush, type JSXElement } from "@barqjs/core";
import type * as THREE from "three";

import { Ordered, Reader, Spinner, seen, setSpin } from "./fixtures/loop.scene.tsx";
import type { Instance } from "./instance.ts";
import { advance, invalidate } from "./loop.ts";
import { createElement, setProp } from "./renderer.ts";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
  seen.state = null;
  seen.deltas.length = 0;
  seen.order.length = 0;
});
afterEach(() => {
  unmountAll();
  frames.restore();
  setSpin(0);
  flush();
});

/** Run frames until none is asked for, at most `limit`. Returns how many ran. */
function settle(limit = 20): number {
  let ran = 0;
  while (ran < limit && frames.step()) ran++;
  return ran;
}

describe("frameloop demand", () => {
  test("is the default, draws once on mount, and then only when something changed", () => {
    let mesh!: Instance;
    const { gl, state } = mount(() => {
      mesh = createElement("mesh");
      return mesh;
    });
    expect(state.frameloop).toBe("demand");
    expect(settle()).toBe(1);
    expect(gl.renders).toBe(1);
    expect(settle()).toBe(0);

    setProp(mesh, "position-x", 1);
    setProp(mesh, "position-y", 2);
    setProp(mesh, "visible", false);
    expect(frames.pending).toBe(true);
    expect(settle()).toBe(1);
    expect(gl.renders).toBe(2);
  });

  test("an insert and a remove each ask for a frame", () => {
    const [shown, setShown] = createSignal(false);
    const { gl } = mount(() =>
      Show({ when: shown, children: block(() => createElement("mesh") as unknown as JSXElement) }),
    );
    settle();
    const before = gl.renders;
    setShown(true);
    flush();
    expect(settle()).toBe(1);
    setShown(false);
    flush();
    expect(settle()).toBe(1);
    expect(gl.renders).toBe(before + 2);
  });

  test("invalidate asks for a frame of one root or of every root", () => {
    const one = mount(() => null);
    const two = mount(() => null);
    settle();
    one.state.invalidate();
    settle();
    expect([one.gl.renders, two.gl.renders]).toEqual([2, 1]);
    invalidate();
    settle();
    expect([one.gl.renders, two.gl.renders]).toEqual([3, 2]);
  });
});

describe("useFrame", () => {
  test("keeps the root drawing while subscribed, and a signal it writes is drawn that frame", () => {
    const [shown, setShown] = createSignal(true);
    const rotations: number[] = [];
    const { gl, scene } = mount(() => Show({ when: shown, children: block(() => Spinner()) }));
    gl.render = () => {
      gl.renders++;
      const spinner = scene.getObjectByName("spinner") as THREE.Mesh | undefined;
      if (spinner !== undefined) rotations.push(spinner.rotation.y);
    };
    for (let i = 0; i < 5; i++) expect(frames.step()).toBe(true);
    expect(rotations).toEqual([1, 2, 3, 4, 5]);
    expect(seen.deltas).toHaveLength(5);
    expect(seen.deltas[1]).toBeCloseTo(0.016);
    expect(seen.state).not.toBe(null);

    setShown(false);
    flush();
    expect(settle()).toBeLessThanOrEqual(2);
    expect(frames.pending).toBe(false);
  });

  test("runs subscribers by priority, and a positive priority takes rendering over", () => {
    const { gl } = mount(() => Ordered());
    frames.step();
    expect(seen.order).toEqual(["early", "render", "late"]);
    expect(gl.renders).toBe(1);
    frames.step();
    expect(gl.renders).toBe(2);
  });
});

describe("other frameloops", () => {
  test("never draws only through advance", () => {
    let mesh!: Instance;
    const { gl, state } = mount(
      () => {
        mesh = createElement("mesh");
        return mesh;
      },
      { frameloop: "never" },
    );
    setProp(mesh, "position-x", 3);
    expect(settle()).toBe(0);
    expect(gl.renders).toBe(0);
    advance(1000, true, state);
    expect(gl.renders).toBe(1);
    state.advance(2000);
    expect(gl.renders).toBe(2);
  });

  test("always draws every frame", () => {
    const { gl } = mount(() => null, { frameloop: "always" });
    for (let i = 0; i < 4; i++) frames.step();
    expect(gl.renders).toBe(4);
  });

  test("setFrameloop switches a running root", () => {
    const { gl, state } = mount(() => null, { frameloop: "always" });
    frames.step();
    state.setFrameloop("demand");
    settle();
    const before = gl.renders;
    expect(settle()).toBe(0);
    expect(gl.renders).toBe(before);
  });
});

describe("useThree", () => {
  test("a selector follows the state it reads", () => {
    const { scene, state } = mount(() => Reader());
    const reader = scene.getObjectByName("reader") as THREE.Mesh;
    expect(reader.scale.x).toBe(800);
    state.setSize(400, 300);
    flush();
    expect(reader.scale.x).toBe(400);
  });
});
