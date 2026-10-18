import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import * as THREE from "three";

import { FakeLoader, Graphed, Model, Suspended } from "./fixtures/loader.scene.tsx";
import { buildGraph, useLoader, useThree } from "./hooks.ts";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
  FakeLoader.calls = [];
});
afterEach(() => {
  unmountAll();
  frames.restore();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
  }
}

function names(scene: THREE.Object3D): string[] {
  const out: string[] = [];
  scene.traverse((object) => {
    if (object.name !== "") out.push(object.name);
  });
  return out;
}

describe("useLoader", () => {
  test("suspends to the nearest Loading until the asset is loaded, then shows it", async () => {
    const { scene } = mount(() => Suspended({ url: () => "a.png" }));
    expect(names(scene)).toEqual(["fallback"]);
    expect(FakeLoader.calls).toEqual(["a.png"]);
    const texture = new THREE.Texture();
    FakeLoader.finish("a.png", texture);
    await settle();
    expect(names(scene)).toEqual(["textured-a.png"]);
    const mesh = scene.getObjectByName("textured-a.png") as THREE.Mesh;
    expect((mesh.material as THREE.MeshBasicMaterial).map).toBe(texture);
  });

  test("a cached asset is answered at once, without a second load or a fallback", () => {
    const { scene } = mount(() => Suspended({ url: () => "a.png" }));
    expect(names(scene)).toEqual(["textured-a.png"]);
    expect(FakeLoader.calls).toEqual([]);
  });

  test("preload starts a load before anything reads it, and clear drops it", async () => {
    useLoader.preload(FakeLoader, "b.png");
    expect(FakeLoader.calls).toEqual(["b.png"]);
    FakeLoader.finish("b.png", new THREE.Texture());
    await settle();
    const { scene } = mount(() => Suspended({ url: () => "b.png" }));
    expect(names(scene)).toEqual(["textured-b.png"]);
    expect(FakeLoader.calls).toEqual(["b.png"]);

    useLoader.clear(FakeLoader, "b.png");
    const again = mount(() => Suspended({ url: () => "b.png" }));
    expect(names(again.scene)).toEqual(["fallback"]);
    expect(FakeLoader.calls).toEqual(["b.png", "b.png"]);
  });

  test("a URL from a signal loads the next asset when it changes", async () => {
    const [url, setUrl] = createSignal("c.png");
    const { scene } = mount(() => Suspended({ url }));
    FakeLoader.finish("c.png", new THREE.Texture());
    await settle();
    expect(names(scene)).toEqual(["textured-c.png"]);
    setUrl("d.png");
    flush();
    expect(FakeLoader.calls).toEqual(["c.png", "d.png"]);
    FakeLoader.finish("d.png", new THREE.Texture());
    await settle();
    expect(names(scene)).toEqual(["textured-d.png"]);
  });

  test("a failed load reaches the nearest Errored and is not cached", async () => {
    const { scene } = mount(() => Suspended({ url: () => "missing.png" }));
    FakeLoader.fail("missing.png", "404");
    await settle();
    expect(names(scene)).toEqual(["failed: Could not load missing.png: 404"]);
    mount(() => Suspended({ url: () => "missing.png" }));
    expect(FakeLoader.calls).toEqual(["missing.png", "missing.png"]);
    FakeLoader.fail("missing.png", "404");
    await settle();
  });

  test("a loaded scene carries its graph of named nodes", async () => {
    const { scene } = mount(() => Model());
    const model = new THREE.Group();
    const body = new THREE.Mesh();
    body.name = "body";
    model.add(body);
    FakeLoader.finish("model.glb", { scene: model });
    await settle();
    expect(model.parent).toBe(scene);
    expect(names(scene)).toContain("has-body");
  });
});

describe("useGraph and useThree", () => {
  test("buildGraph collects named nodes, materials and meshes", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = "box";
    (mesh.material as THREE.Material).name = "paint";
    root.add(mesh);
    const graph = buildGraph(root);
    expect(graph.nodes.box).toBe(mesh);
    expect(graph.meshes.box).toBe(mesh);
    expect(graph.materials.paint).toBe(mesh.material as THREE.Material);
  });

  test("useGraph follows the object an accessor gives it", () => {
    const first = new THREE.Group();
    const mesh = new THREE.Mesh();
    mesh.name = "one";
    first.add(mesh);
    const [object, setObject] = createSignal<THREE.Object3D>(first);
    const { scene } = mount(() => Graphed({ object }));
    expect(scene.children[0].name).toBe("one");
    const second = new THREE.Group();
    const other = new THREE.Mesh();
    other.name = "two";
    second.add(other);
    setObject(second);
    flush();
    expect(scene.children[0].name).toBe("two");
  });

  test("useThree outside a canvas says where it must be called", () => {
    expect(() => useThree()).toThrow("inside `<Canvas>`");
  });

  test("useThree hands the root's state to a component in the scene", () => {
    let state: unknown;
    const mounted = mount(() => {
      state = useThree();
      return null;
    });
    expect(state).toBe(mounted.state);
  });
});
