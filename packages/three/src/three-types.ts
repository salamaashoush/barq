/**
 * The tags of a scene, typed from three's own declarations: every class
 * `three` exports is a tag named for it with its first letter lowered, whose
 * props are the instance's properties, `args` its constructor's parameters,
 * and whose math properties also take what `applyProps` copies into them (an
 * array, a scalar, a color string).
 */

import type * as THREE from "three";
import type { CallSite } from "@barqjs/core";
import type { AsDeclared } from "@barqjs/core/internal";

import type { ConstructorRepresentation } from "./catalogue.ts";
import type { EventHandlers } from "./events.ts";
import type { AttachType } from "./instance.ts";

type NonFunctionKeys<P> = { [K in keyof P]-?: P[K] extends Function ? never : K }[keyof P];
type Overwrite<P, O> = Omit<P, NonFunctionKeys<O>> & O;
// A readonly array or tuple is accepted wherever one is. A function is left as
// it is: `Readonly` of a function type is an object type without its call
// signature, which any function is assignable to.
type Mutable<P> = {
  [K in keyof P]: NonNullable<P[K]> extends (...args: never[]) => unknown
    ? P[K]
    : P[K] | Readonly<P[K]>;
};

type IsOptional<T> = undefined extends T ? true : false;
type IsAllOptional<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? IsOptional<First> extends true
    ? IsAllOptional<Rest>
    : false
  : true;

type MutableOrReadonlyParameters<T extends (...args: never[]) => unknown> =
  | Parameters<T>
  | Readonly<Parameters<T>>;

export interface MathRepresentation {
  set(...args: number[]): unknown;
}
export interface VectorRepresentation extends MathRepresentation {
  setScalar(value: number): unknown;
}
export type MathTypes = MathRepresentation | THREE.Euler | THREE.Color;

export type MathType<T extends MathTypes> = T extends THREE.Color
  ? Args<typeof THREE.Color> | THREE.ColorRepresentation
  : T extends VectorRepresentation | THREE.Layers | THREE.Euler
    ? T | MutableOrReadonlyParameters<T["set"]> | number
    : T | MutableOrReadonlyParameters<T["set"]>;

export type MathProps<P> = {
  [K in keyof P as P[K] extends MathTypes ? K : never]: P[K] extends MathTypes
    ? MathType<P[K]>
    : never;
};

export type Vector2 = MathType<THREE.Vector2>;
export type Vector3 = MathType<THREE.Vector3>;
export type Vector4 = MathType<THREE.Vector4>;
export type Color = MathType<THREE.Color>;
export type Layers = MathType<THREE.Layers>;
export type Quaternion = MathType<THREE.Quaternion>;
export type Euler = MathType<THREE.Euler>;
export type Matrix3 = MathType<THREE.Matrix3>;
export type Matrix4 = MathType<THREE.Matrix4>;

/** A class's constructor parameters, as `args` takes them. */
export type Args<T> = T extends ConstructorRepresentation
  ? T extends typeof THREE.Color
    ? [r: number, g: number, b: number] | [color: THREE.ColorRepresentation]
    : ConstructorParameters<T>
  : unknown[];

type ArgsProp<P> = P extends ConstructorRepresentation
  ? IsAllOptional<ConstructorParameters<P>> extends true
    ? { args?: Args<P> }
    : { args: Args<P> }
  : { args: unknown[] };

export interface RaycastableRepresentation {
  raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
}
export type EventProps<P> = P extends RaycastableRepresentation ? Partial<EventHandlers> : {};

/** What a ref on a tag is handed: the three object, once it is built. */
export type ThreeRef<T> = ((object: T) => void | (() => void)) | { current: T | null } | T;

export interface InstanceProps<T = unknown> {
  /** Where the object goes on its parent: a property path (`"material-0"`), or a function. */
  attach?: AttachType<T>;
  /** `null` keeps the object, and every object below it, from being disposed on unmount. */
  dispose?: null;
  /** Called with the object after any of its properties is written. */
  onUpdate?: (self: T) => void;
  children?: unknown;
  ref?: ThreeRef<T>;
  key?: unknown;
}

export type ElementProps<T extends ConstructorRepresentation, P = InstanceType<T>> = Partial<
  Overwrite<P, MathProps<P> & EventProps<P>>
>;

/** The props of the tag for `T`. */
export type ThreeElement<T extends ConstructorRepresentation> = Mutable<
  Overwrite<ElementProps<T>, ArgsProp<T> & InstanceProps<InstanceType<T>>>
> &
  CallSite<AsDeclared>;

export type ThreeToJSXElements<T extends object> = {
  [
    K in keyof T & string as T[K] extends ConstructorRepresentation ? Uncapitalize<K> : never
  ]: ThreeElement<Extract<T[K], ConstructorRepresentation>>;
};

type ThreeElementsImpl = ThreeToJSXElements<typeof THREE>;

export interface ThreeElements extends ThreeElementsImpl {
  /** An object made elsewhere, placed in the scene as it is and never disposed. */
  primitive: Omit<ThreeElement<ConstructorRepresentation<object>>, "args"> & {
    object: object;
    [property: string]: unknown;
  };
  /** `THREE.Line`, under React Three Fiber's name for it. */
  threeLine: ThreeElementsImpl["line"];
  threeAudio: ThreeElementsImpl["audio"];
  threeSource: ThreeElementsImpl["source"];
  threePath: ThreeElementsImpl["path"];
}
