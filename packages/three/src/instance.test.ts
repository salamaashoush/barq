import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type JSXElement } from "@barqjs/core";
import * as THREE from "three";

import type { Instance } from "./instance.ts";
import { createElement, extend, insert, insertNode, render, setProp } from "./renderer.ts";
import { manualFrames, mount, unmountAll, type Frames } from "./test-utils.ts";

let frames: Frames;
beforeEach(() => {
  frames = manualFrames();
});
afterEach(() => {
  unmountAll();
  frames.restore();
});

function el(tag: string, props: Record<string, unknown> = {}, ...children: Instance[]): Instance {
  const node = createElement(tag);
  for (const child of children) insertNode(node, child);
  for (const name in props) setProp(node, name, props[name]);
  return node;
}

const node = (value: Instance): JSXElement => value;

function counting(target: unknown): { count: number } {
  const seen = { count: 0 };
  (target as THREE.EventDispatcher<{ dispose: {} }>).addEventListener(
    "dispose",
    () => seen.count++,
  );
  return seen;
}

describe("the catalogue", () => {
  test("a lowercase tag is the three class of that name", () => {
    expect(el("mesh").ctor).toBe(THREE.Mesh);
    expect(el("boxGeometry").ctor).toBe(THREE.BoxGeometry);
    expect(el("meshStandardMaterial").ctor).toBe(THREE.MeshStandardMaterial);
    expect(el("threeLine").ctor).toBe(THREE.Line);
  });

  test("an unknown tag is refused, naming the extend call that would register it", () => {
    expect(() => createElement("sparkle")).toThrow("extend({ Sparkle })");
  });

  test("extend registers a class by name, and one class alone as a component", () => {
    class Sparkle extends THREE.Object3D {
      sparkles = 0;
    }
    extend({ Sparkle });
    const { scene } = mount(() => node(el("sparkle", { sparkles: 3 })));
    const made = scene.children[0] as Sparkle;
    expect(made).toBeInstanceOf(Sparkle);
    expect(made.sparkles).toBe(3);

    class Twinkle extends THREE.Object3D {}
    const TwinkleTag = extend(Twinkle);
    const { scene: other } = mount(() => TwinkleTag({ name: "salama" }));
    expect(other.children[0]).toBeInstanceOf(Twinkle);
    expect(other.children[0].name).toBe("salama");
  });
});

describe("building objects", () => {
  test("nothing is built until the node joins a scene, then with the args it has", () => {
    let geometry!: Instance;
    const { scene } = mount(() => {
      const mesh = el("mesh");
      geometry = el("boxGeometry");
      insertNode(mesh, geometry);
      setProp(geometry, "args", [2, 3, 4]);
      expect(geometry.object).toBe(null);
      return node(mesh);
    });
    const built = (scene.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry;
    expect(built as unknown).toBe(geometry.object);
    expect(built.parameters).toMatchObject({ width: 2, height: 3, depth: 4 });
  });

  test("a class that cannot be built without args waits for them", () => {
    class Needy extends THREE.Object3D {
      constructor(readonly size: { value: number }) {
        super();
        if (size === undefined) throw new Error("Needy needs a size");
      }
    }
    extend({ Needy });
    const [size, setSize] = createSignal(2);
    let needy!: Instance;
    const { scene } = mount(() => {
      needy = el("needy");
      return node(needy);
    });
    expect(needy.waiting).toBe(true);
    expect(scene.children).toHaveLength(0);
    setProp(needy, "args", [{ value: size() }]);
    expect(needy.waiting).toBe(false);
    expect((scene.children[0] as Needy).size.value).toBe(2);
    setSize(3);
  });

  test("a primitive stands for the object it is given, and is never disposed", () => {
    const geometry = new THREE.BoxGeometry();
    const disposed = counting(geometry);
    const shared = new THREE.Mesh(geometry);
    const { scene, unmount } = mount(() =>
      node(el("primitive", { object: shared, "position-x": 3 })),
    );
    expect(scene.children[0]).toBe(shared);
    expect(shared.position.x).toBe(3);
    unmount();
    expect(shared.parent).toBe(null);
    expect(disposed.count).toBe(0);
  });

  test("a primitive whose object arrives after it is placed is built then", () => {
    const object = new THREE.Group();
    let primitive!: Instance;
    const { scene } = mount(() => {
      primitive = el("primitive");
      return node(primitive);
    });
    expect(primitive.waiting).toBe(true);
    setProp(primitive, "object", object);
    expect(scene.children[0]).toBe(object);
  });

  test("new args rebuild the object, keeping its children, attachments and handlers", () => {
    let mesh!: Instance;
    let geometry!: Instance;
    const { scene, state } = mount(() => {
      geometry = el("sphereGeometry", { args: [1, 8, 8] });
      const child = el("group", { name: "child" });
      mesh = el("mesh", { name: "parent", onClick: () => {} }, geometry, child);
      return node(mesh);
    });
    const parent = scene.children[0] as THREE.Mesh;
    const first = parent.geometry;
    const disposed = counting(first);
    setProp(geometry, "args", [5, 8, 8]);
    expect(parent.geometry).not.toBe(first);
    expect((parent.geometry as THREE.SphereGeometry).parameters.radius).toBe(5);
    expect(disposed.count).toBe(1);

    const before = mesh.object as THREE.Mesh;
    setProp(mesh, "args", [new THREE.BoxGeometry()]);
    const after = scene.children[0] as THREE.Mesh;
    expect(after).not.toBe(before);
    expect(after.name).toBe("parent");
    expect(after.children.map((child) => child.name)).toEqual(["child"]);
    // The `args` geometry is replaced by the attached one, as the child is moved over too.
    expect((after.geometry as THREE.SphereGeometry).parameters.radius).toBe(5);
    expect(state.internal.interaction).toEqual([after]);
  });

  test("a ref is handed the object once built and again when it is rebuilt", () => {
    const seen: unknown[] = [];
    let geometry!: Instance;
    mount(() => {
      geometry = el("boxGeometry");
      setProp(geometry, "ref", (object: unknown) => void seen.push(object));
      setProp(geometry, "args", [1, 1, 1]);
      expect(seen).toEqual([]);
      return node(el("mesh", {}, geometry));
    });
    expect(seen).toEqual([geometry.object]);
    setProp(geometry, "args", [2, 2, 2]);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(geometry.object);
  });
});

describe("attach", () => {
  test("geometries, materials and fog attach by type, and leave by restoring what was there", () => {
    let material!: Instance;
    const { scene } = mount(() => {
      material = el("meshBasicMaterial", { color: "red" });
      const fog = el("fog", { args: ["white", 1, 10] });
      const group = el("group", {}, fog);
      return node(el("group", {}, el("mesh", {}, el("boxGeometry"), material), group));
    });
    const mesh = scene.children[0].children[0] as THREE.Mesh;
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(mesh.material as unknown).toBe(material.object);
    expect((scene.children[0].children[1] as THREE.Scene).fog).toBeInstanceOf(THREE.Fog);
    expect(mesh.children).toHaveLength(0);
  });

  test("attach names a path, and `-<index>` an array slot", () => {
    const { scene } = mount(() =>
      node(
        el(
          "mesh",
          {},
          el("meshBasicMaterial", { attach: "material-0", color: "red" }),
          el("meshBasicMaterial", { attach: "material-1", color: "blue" }),
          el("color", { attach: "userData-tint", args: ["green"] }),
        ),
      ),
    );
    const mesh = scene.children[0] as THREE.Mesh;
    const materials = mesh.material as THREE.MeshBasicMaterial[];
    expect(Array.isArray(materials)).toBe(true);
    expect(materials.map((material) => material.color.getHexString())).toEqual([
      "ff0000",
      "0000ff",
    ]);
    expect((mesh.userData.tint as THREE.Color).getHexString()).toBe("008000");
  });

  test("an attach function puts the object on its parent and its return takes it off", () => {
    const calls: string[] = [];
    const attach = (parent: THREE.Object3D, self: THREE.Object3D) => {
      calls.push(`on ${parent.name} ${self.name}`);
      parent.userData.helper = self;
      return () => {
        calls.push("off");
        delete parent.userData.helper;
      };
    };
    const parent = new THREE.Group();
    parent.name = "parent";
    const dispose = render(
      () => node(el("primitive", { object: parent }, el("object3D", { name: "helper", attach }))),
      new THREE.Scene(),
    );
    expect(calls).toEqual(["on parent helper"]);
    expect(parent.userData.helper).toBeDefined();
    expect(parent.children).toHaveLength(0);
    dispose();
    expect(calls).toEqual(["on parent helper", "off"]);
    expect(parent.userData.helper).toBeUndefined();
  });

  test("a material swapped in before the old one leaves keeps the slot", () => {
    let mesh!: Instance;
    let red!: Instance;
    mount(() => {
      red = el("meshBasicMaterial", { color: "red" });
      mesh = el("mesh", {}, red);
      return node(mesh);
    });
    const object = mesh.object as THREE.Mesh;
    const blue = el("meshBasicMaterial", { color: "blue" });
    insertNode(mesh, blue, red);
    expect(object.material as unknown).toBe(blue.object);
    // Removing red must not put red's predecessor back over blue.
    const { removeNode } = require("./instance.ts") as typeof import("./instance.ts");
    removeNode(mesh, red);
    expect(object.material as unknown).toBe(blue.object);
    removeNode(mesh, blue);
    expect(object.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(object.material as unknown).not.toBe(red.object);
    expect(object.material as unknown).not.toBe(blue.object);
  });
});

describe("disposal", () => {
  test("unmounting disposes what the tree built, below a dispose={null} nothing", () => {
    let kept!: Instance;
    let keptChild!: Instance;
    let dropped!: Instance;
    const { unmount } = mount(() => {
      dropped = el("boxGeometry");
      keptChild = el("meshBasicMaterial");
      kept = el("mesh", { dispose: null }, el("planeGeometry"), keptChild);
      return node(el("group", {}, el("mesh", {}, dropped), kept));
    });
    const droppedCount = counting(dropped.object);
    const keptCount = counting(keptChild.object);
    unmount();
    expect(droppedCount.count).toBe(1);
    expect(keptCount.count).toBe(0);
  });

  test("a removed node is not disposed until the scope that built it ends", () => {
    const [shown, setShown] = createSignal(true);
    let geometry!: Instance;
    const { scene, unmount } = mount(() => {
      geometry = el("boxGeometry");
      const mesh = el("mesh", {}, geometry);
      const host = el("group");
      // One node, moved out of the tree and back by a live hole.
      insert(host, () => (shown() ? mesh : null));
      return node(host);
    });
    const disposed = counting(geometry.object);
    const group = scene.children[0];
    expect(group.children).toHaveLength(1);
    setShown(false);
    flush();
    expect(group.children).toHaveLength(0);
    expect(disposed.count).toBe(0);
    setShown(true);
    flush();
    expect(group.children).toHaveLength(1);
    unmount();
    expect(disposed.count).toBe(1);
  });
});
