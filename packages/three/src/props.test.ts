import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyProp, applyProps, defaultOf } from "./props.ts";

describe("applyProp", () => {
  test("an array is copied into the vector already there", () => {
    const mesh = new THREE.Mesh();
    const position = mesh.position;
    applyProp(mesh, "position", [1, 2, 3], false);
    expect(mesh.position).toBe(position);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });

  test("a scalar sets every component, and a same-class object is copied", () => {
    const mesh = new THREE.Mesh();
    applyProp(mesh, "scale", 2, false);
    expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
    const scale = mesh.scale;
    applyProp(mesh, "scale", new THREE.Vector3(4, 5, 6), false);
    expect(mesh.scale).toBe(scale);
    expect(mesh.scale.toArray()).toEqual([4, 5, 6]);
  });

  test("rotation takes an array into its Euler, and a quaternion takes four numbers", () => {
    const mesh = new THREE.Mesh();
    applyProp(mesh, "rotation", [0.1, 0.2, 0.3], false);
    expect(mesh.rotation.x).toBeCloseTo(0.1);
    expect(mesh.rotation.z).toBeCloseTo(0.3);
    applyProp(mesh, "quaternion", [0, 0, 0, 1], false);
    expect(mesh.quaternion.w).toBe(1);
  });

  test("a color takes a string, a number, an array and a Color", () => {
    const material = new THREE.MeshBasicMaterial();
    const color = material.color;
    applyProp(material, "color", "red", false);
    expect(material.color.getHexString()).toBe("ff0000");
    applyProp(material, "color", 0x00ff00, false);
    expect(material.color.getHexString()).toBe("00ff00");
    applyProp(material, "color", [0, 0, 1], false);
    expect(material.color.getHexString()).toBe("0000ff");
    applyProp(material, "color", new THREE.Color("white"), false);
    expect(material.color.getHexString()).toBe("ffffff");
    expect(material.color).toBe(color);
  });

  test("a dashed name pierces into the object it names", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    applyProp(mesh, "position-x", 5, false);
    applyProp(mesh, "material-color", "blue", false);
    applyProp(mesh, "material-opacity", 0.5, false);
    expect(mesh.position.x).toBe(5);
    expect(mesh.material.color.getHexString()).toBe("0000ff");
    expect(mesh.material.opacity).toBe(0.5);
  });

  test("a dashed name the object holds whole is written whole", () => {
    const object = { "foo-bar": 1, foo: { bar: 2 } };
    applyProp(object, "foo-bar", 3, false);
    expect(object["foo-bar"]).toBe(3);
    expect(object.foo.bar).toBe(2);
  });

  test("piercing through something that is not an object is refused by name", () => {
    const mesh = new THREE.Mesh();
    expect(() => applyProp(mesh, "nothing-here-x", 1, false)).toThrow(/`nothing` is undefined/);
  });

  test("layers take a channel number, and another Layers' mask", () => {
    const mesh = new THREE.Mesh();
    applyProp(mesh, "layers", 3, false);
    expect(mesh.layers.isEnabled(3)).toBe(true);
    expect(mesh.layers.isEnabled(0)).toBe(false);
    const other = new THREE.Layers();
    other.set(5);
    applyProp(mesh, "layers", other, false);
    expect(mesh.layers.mask).toBe(other.mask);
  });

  test("a shader material's uniforms are merged into the objects the program holds", () => {
    const uniforms = { time: { value: 0 } };
    const material = new THREE.ShaderMaterial({ uniforms });
    const held = material.uniforms.time;
    applyProp(material, "uniforms", { time: { value: 2 }, size: { value: 4 } }, false);
    expect(material.uniforms.time).toBe(held);
    expect(material.uniforms.time.value).toBe(2);
    expect(material.uniforms.size.value).toBe(4);
  });

  test("a color texture is marked sRGB unless the root is linear", () => {
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();
    applyProp(material, "map", texture, false);
    expect(material.map).toBe(texture);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);

    const linear = new THREE.Texture();
    applyProp(material, "map", linear, true);
    expect(linear.colorSpace).toBe(THREE.NoColorSpace);

    const data = new THREE.Texture();
    applyProp(material, "normalMap", data, false);
    expect(data.colorSpace).toBe(THREE.NoColorSpace);
  });

  test("undefined writes nothing, and a primitive value is assigned", () => {
    const mesh = new THREE.Mesh();
    applyProp(mesh, "visible", false, false);
    applyProp(mesh, "visible", undefined, false);
    expect(mesh.visible).toBe(false);
    applyProp(mesh, "name", "salama", false);
    expect(mesh.name).toBe("salama");
  });
});

describe("applyProps and defaults", () => {
  test("applyProps writes every property with the same rules", () => {
    const camera = new THREE.PerspectiveCamera();
    applyProps(camera, { position: [0, 0, 10], fov: 50, "position-y": 2 });
    expect(camera.position.toArray()).toEqual([0, 2, 10]);
    expect(camera.fov).toBe(50);
  });

  test("defaultOf answers with what a fresh object of the class holds", () => {
    const mesh = new THREE.Mesh();
    mesh.visible = false;
    expect(defaultOf(mesh, "visible")).toEqual({ found: true, value: true });
    const material = new THREE.MeshBasicMaterial();
    expect(defaultOf({ material }, "material-opacity")).toEqual({ found: true, value: 1 });
  });
});
