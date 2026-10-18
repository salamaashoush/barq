/**
 * Writing one property to a three object, the way React Three Fiber's
 * `applyProps` does: an array or a number is copied into the math object that
 * is already there rather than replacing it, a color takes a string or a
 * number, and a dashed name pierces (`position-x`, `material-color`).
 *
 * Nothing here allocates once a name has been seen: the dashed path is split
 * once per distinct name, and every value is copied into what the object
 * already holds.
 */

import * as THREE from "three";

/** The segments of a dashed name, or `null` for a name with no dash. */
const PATHS = new Map<string, readonly string[] | null>();

export function pathOf(name: string): readonly string[] | null {
  let path = PATHS.get(name);
  if (path === undefined) {
    path = name.includes("-") ? name.split("-") : null;
    PATHS.set(name, path);
  }
  return path;
}

/** Where a name lands on an object: the object that holds it, and the key there. */
export interface Resolved {
  owner: Bag;
  key: string;
}

/** An object written to by name, whatever its class. */
export type Bag = Record<string, unknown>;

/** What a math object (a vector, an Euler, a color, a matrix) offers to be written through. */
interface MathLike {
  set: (...args: unknown[]) => unknown;
  copy?: (value: unknown) => unknown;
  fromArray?: (array: unknown[]) => unknown;
  setScalar?: (value: number) => unknown;
}

const scratch: Resolved = { owner: {}, key: "" };

/**
 * Resolve `name` on `object` into `out`. A dashed name that the object holds
 * whole (`"foo-bar" in object`) is not split. Throws when a segment before the
 * last is not an object, since there is nothing to write into.
 */
export function resolve(object: object, name: string, out: Resolved = scratch): Resolved {
  const path = pathOf(name);
  if (path === null || name in object) {
    out.owner = object as Bag;
    out.key = name;
    return out;
  }
  let owner = object as Bag;
  const last = path.length - 1;
  for (let i = 0; i < last; i++) {
    const next = owner[path[i]];
    if (next === null || (typeof next !== "object" && typeof next !== "function")) {
      throw new Error(
        `Cannot set \`${name}\`: \`${path.slice(0, i + 1).join("-")}\` is ${String(next)}, ` +
          "not an object to write into.",
      );
    }
    owner = next as Bag;
  }
  out.owner = owner;
  out.key = path[last];
  return out;
}

/**
 * Texture slots of the built-in materials whose texture holds color data, so
 * an 8-bit RGBA texture assigned to one is marked sRGB unless the root is
 * linear. https://github.com/mrdoob/three.js/pull/25857
 */
const COLOR_MAPS = new Set(["map", "emissiveMap", "sheenColorMap", "specularColorMap", "envMap"]);

function isColorRepresentation(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    (value !== null &&
      typeof value === "object" &&
      (value as { isColor?: boolean }).isColor === true)
  );
}

/**
 * Write `value` under `name` on `object`. `linear` is the root's flag: false
 * marks a color texture sRGB as it is assigned. `undefined` writes nothing.
 */
export function applyProp(object: object, name: string, value: unknown, linear: boolean): void {
  if (value === undefined) return;
  const { owner, key } = resolve(object, name);
  const target = owner[key];

  if (target !== null && typeof target === "object") {
    if (target instanceof THREE.Layers && value instanceof THREE.Layers) {
      target.mask = value.mask;
      return;
    }
    if ((target as { isColor?: boolean }).isColor === true && isColorRepresentation(value)) {
      (target as THREE.Color).set(value as THREE.ColorRepresentation);
      return;
    }
    const math = target as Partial<MathLike>;
    if (typeof math.set === "function") {
      if (
        typeof math.copy === "function" &&
        value !== null &&
        typeof value === "object" &&
        value.constructor === target.constructor
      ) {
        math.copy(value);
        return;
      }
      if (Array.isArray(value)) {
        if (typeof math.fromArray === "function") math.fromArray(value);
        else math.set(...(value as unknown[]));
        return;
      }
      if (typeof value === "number") {
        if (typeof math.setScalar === "function") math.setScalar(value);
        else math.set(value);
        return;
      }
    }
    if (
      key === "uniforms" &&
      owner instanceof THREE.ShaderMaterial &&
      value !== null &&
      typeof value === "object"
    ) {
      // A uniform object is held by reference by the compiled program, so a
      // new uniforms object is merged into the one the material already has.
      const uniforms = target as Record<string, THREE.IUniform>;
      const next = value as Record<string, THREE.IUniform>;
      for (const uniform in next) {
        if (uniforms[uniform] === undefined) uniforms[uniform] = { ...next[uniform] };
        else Object.assign(uniforms[uniform], next[uniform]);
      }
      return;
    }
  }

  owner[key] = value;
  if (
    !linear &&
    COLOR_MAPS.has(key) &&
    value !== null &&
    typeof value === "object" &&
    (value as { isTexture?: boolean }).isTexture === true &&
    (value as THREE.Texture).format === THREE.RGBAFormat &&
    (value as THREE.Texture).type === THREE.UnsignedByteType
  ) {
    (value as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  }
}

const DEFAULTS = new Map<Function, object | null>();

/**
 * What `name` holds on a freshly built object of the same class, for a
 * property that was set and is now unset: three has no notion of removing a
 * property, so it goes back to the class's default. A class that cannot be
 * built without arguments has no such object, and the property is left as it is.
 */
export function defaultOf(object: object, name: string): { found: boolean; value: unknown } {
  const { owner, key } = resolve(object, name);
  const ctor = owner.constructor as (new () => object) | undefined;
  if (ctor === undefined) return { found: false, value: undefined };
  let blank = DEFAULTS.get(ctor);
  if (blank === undefined) {
    try {
      blank = new ctor();
    } catch {
      blank = null;
    }
    DEFAULTS.set(ctor, blank);
  }
  if (blank === null) return { found: false, value: undefined };
  return { found: true, value: (blank as Record<string, unknown>)[key] };
}

/**
 * Write every own property of `props` onto `object` with the same rules, for
 * a configuration object (`camera={{ position: [0, 0, 5] }}`) or a one-off.
 */
export function applyProps<T extends object>(
  object: T,
  props: Record<string, unknown>,
  linear = false,
): T {
  for (const name in props) applyProp(object, name, props[name], linear);
  return object;
}
