/**
 * The classes a lowercase tag names: `mesh` is `THREE.Mesh`, `boxGeometry` is
 * `THREE.BoxGeometry`. Every export of `three` is in it from the start, and
 * `extend` adds a library's own classes, or replaces one.
 */

import * as THREE from "three";

export type ConstructorRepresentation<T = unknown> = new (...args: never[]) => T;

export interface Catalogue {
  [name: string]: ConstructorRepresentation;
}

const catalogue: Catalogue = {};
const resolved = new Map<string, ConstructorRepresentation | null>();
let extended = 0;

/** Register classes under their export names: `{ OrbitControls }` is `<orbitControls>`. */
export function register(objects: Catalogue): void {
  resolved.clear();
  Object.assign(catalogue, objects);
}

/** Register one class under a generated name, and return the tag that names it. */
export function registerOne(ctor: ConstructorRepresentation): string {
  const name = `Extended${extended++}`;
  register({ [name]: ctor });
  return `extended${extended - 1}`;
}

function pascal(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function isConstructor(value: unknown): value is ConstructorRepresentation {
  return typeof value === "function" && (value as { prototype?: unknown }).prototype !== undefined;
}

const THREE_EXPORTS = THREE as unknown as Record<string, unknown>;

/**
 * The class a tag names, or `null`. A `three` prefix is dropped when nothing is
 * registered under the full name, so `<threeLine>` reaches `THREE.Line` the way
 * it does in React Three Fiber.
 */
export function resolveConstructor(tag: string): ConstructorRepresentation | null {
  const known = resolved.get(tag);
  if (known !== undefined) return known;
  let name = pascal(tag);
  let found: unknown = catalogue[name] ?? THREE_EXPORTS[name];
  if (!isConstructor(found) && tag.startsWith("three") && tag.length > 5) {
    name = tag.slice(5);
    found = catalogue[name] ?? THREE_EXPORTS[name];
  }
  const ctor = isConstructor(found) ? found : null;
  resolved.set(tag, ctor);
  return ctor;
}
