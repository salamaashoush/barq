import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import * as THREE from "three";

import Scene, {
  Box,
  geometries,
  mesh,
  setColor,
  setIds,
  setShown,
  setWidth,
  setX,
} from "./fixtures/basic.scene.tsx";
import type { RootConfig } from "./renderer.ts";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
});
afterEach(() => {
  unmountAll();
  frames.restore();
});

function names(object: THREE.Object3D): string[] {
  return object.children.map((child) => child.name);
}

describe("a compiled scene", () => {
  test("builds three objects, attaches geometry and material, and keeps sentinels out of the graph", () => {
    const { scene, unmount } = mount(() => Scene());
    const group = scene.children[0];
    expect(scene.children).toHaveLength(1);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(names(group)).toEqual(["box", "item-1", "item-2", "item-3"]);
    const box = group.children[0] as THREE.Mesh;
    expect(box.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect((box.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect(box.position.toArray()).toEqual([0, 1, 2]);
    expect(box.rotation.y).toBeCloseTo(Math.PI);
    expect(mesh.current).toBe(box);
    unmount();
  });

  test("a signal write updates the object in place and asks for one frame", () => {
    const { scene, gl, unmount } = mount(() => Scene());
    frames.step();
    const before = gl.renders;
    const box = scene.children[0].children[0] as THREE.Mesh;
    const position = box.position;
    setX(4);
    setColor("#00ff00");
    flush();
    expect(box.position).toBe(position);
    expect(box.position.x).toBe(4);
    expect((box.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("00ff00");
    expect(frames.step()).toBe(true);
    expect(gl.renders).toBe(before + 1);
    expect(frames.step()).toBe(false);
    setX(0);
    setColor("red");
    flush();
    unmount();
  });

  test("new args build a new object, move the attachment, dispose the old one and hand refs the new one", () => {
    const { scene, unmount } = mount(() => Scene());
    const box = scene.children[0].children[0] as THREE.Mesh;
    const first = box.geometry;
    let disposed = 0;
    first.addEventListener("dispose", () => disposed++);
    geometries.length = 0;
    setWidth(3);
    flush();
    expect(box.geometry).not.toBe(first);
    expect((box.geometry as THREE.BoxGeometry).parameters.width).toBe(3);
    expect(disposed).toBe(1);
    expect(geometries).toHaveLength(1);
    expect(geometries[0]).toBe(box.geometry);
    setWidth(1);
    flush();
    unmount();
  });

  test("Show and For add and remove objects, and an unmounted object is disposed", () => {
    const { scene, unmount } = mount(() => Scene());
    const group = scene.children[0];
    const box = group.children[0] as THREE.Mesh;
    let disposed = 0;
    box.geometry.addEventListener("dispose", () => disposed++);
    (box.material as THREE.Material).addEventListener("dispose", () => disposed++);
    setShown(false);
    flush();
    expect(names(group)).toEqual(["item-1", "item-2", "item-3"]);
    expect(disposed).toBe(2);
    setIds([3, 1, 4]);
    flush();
    expect(names(group)).toEqual(["item-3", "item-1", "item-4"]);
    setShown(true);
    setIds([1, 2, 3]);
    flush();
    expect(names(group)).toEqual(["box", "item-1", "item-2", "item-3"]);
    unmount();
  });

  test("objects leaving a list fire three's removal events and the rest keep their order", () => {
    const { scene, unmount } = mount(() => Scene());
    const group = scene.children[0];
    const removed: string[] = [];
    const left: string[] = [];
    group.addEventListener("childremoved", (event) => {
      removed.push(event.child.name);
      expect(event.child.parent).toBe(null);
    });
    for (const child of group.children) {
      child.addEventListener("removed", () => left.push(child.name));
    }
    setIds([1]);
    flush();
    expect(names(group)).toEqual(["box", "item-1"]);
    expect(removed.toSorted()).toEqual(["item-2", "item-3"]);
    expect(left.toSorted()).toEqual(["item-2", "item-3"]);
    setIds([1, 2, 3]);
    flush();
    expect(names(group)).toEqual(["box", "item-1", "item-2", "item-3"]);
    unmount();
  });

  test("unmounting the root empties the scene", () => {
    const { scene, unmount } = mount(() => Box());
    expect(scene.children).toHaveLength(1);
    unmount();
    expect(scene.children).toHaveLength(0);
  });
});

describe("root configuration", () => {
  test("shadows choose a shadow map three still has", () => {
    const types: [RootConfig["shadows"], THREE.ShadowMapType][] = [
      [true, THREE.PCFShadowMap],
      ["soft", THREE.PCFShadowMap],
      ["percentage", THREE.PCFShadowMap],
      ["basic", THREE.BasicShadowMap],
      ["variance", THREE.VSMShadowMap],
    ];
    for (const [shadows, type] of types) {
      const { gl, unmount } = mount(() => Box(), { shadows });
      expect(gl.shadowMap.enabled).toBe(true);
      expect(gl.shadowMap.type).toBe(type);
      unmount();
    }
  });
});
