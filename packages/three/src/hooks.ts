/**
 * What a component in a scene calls: the root's state, the frame loop, and
 * three's loaders over barq's async memos, so a `<Loading>` above a component
 * that reads an asset not yet loaded shows its fallback.
 */

import {
  createMemo,
  getOwner,
  hasContext,
  getContext,
  onCleanup,
  type Accessor,
} from "@barqjs/core";
import type * as THREE from "three";

import type { ConstructorRepresentation } from "./catalogue.ts";
import { ThreeContext, type RenderCallback, type RootState } from "./store.ts";

function state(hook: string): RootState {
  if (getOwner() === null || !hasContext(ThreeContext)) {
    throw new Error(
      `\`${hook}\` reads the state of a canvas, and was called outside one. Call it in a ` +
        "component rendered inside `<Canvas>`, or inside a tree given to `createRoot(...).render`.",
    );
  }
  return getContext(ThreeContext);
}

/** The root's state. Its members are reactive: `useThree().size.width` in a binding follows resizes. */
export function useThree(): RootState;
/** One value of the root's state, as an accessor that follows it. */
export function useThree<T>(selector: (state: RootState) => T): Accessor<T>;
export function useThree<T>(selector?: (state: RootState) => T): RootState | Accessor<T> {
  const root = state("useThree");
  if (selector === undefined) return root;
  return () => selector(root);
}

/**
 * Run `callback` before every frame, with the state, the seconds since the
 * last frame and the XR frame when there is one. A root renders every frame
 * while it has a subscriber. Subscribers run lowest `priority` first; any
 * subscriber with a priority above zero takes rendering over, and must call
 * `gl.render` itself.
 */
export function useFrame(callback: RenderCallback, priority = 0): void {
  const root = state("useFrame");
  const unsubscribe = root.internal.subscribe({ current: callback }, priority, root);
  onCleanup(unsubscribe);
}

export interface ObjectMap {
  nodes: { [name: string]: THREE.Object3D };
  materials: { [name: string]: THREE.Material };
  meshes: { [name: string]: THREE.Mesh };
}

/** The named objects, materials and meshes under `object`. */
export function buildGraph(object: THREE.Object3D): ObjectMap {
  const data: ObjectMap = { nodes: {}, materials: {}, meshes: {} };
  object.traverse((child) => {
    const any = child as THREE.Object3D & { material?: THREE.Material; isMesh?: boolean };
    if (child.name !== "") data.nodes[child.name] = child;
    if (
      any.material !== undefined &&
      !Array.isArray(any.material) &&
      data.materials[any.material.name] === undefined
    ) {
      data.materials[any.material.name] = any.material;
    }
    if (any.isMesh === true && data.meshes[child.name] === undefined)
      data.meshes[child.name] = child as THREE.Mesh;
  });
  return data;
}

/** {@link buildGraph}, of an object or of an accessor that follows one. */
export function useGraph(object: THREE.Object3D): ObjectMap;
export function useGraph(object: Accessor<THREE.Object3D>): Accessor<ObjectMap>;
export function useGraph(
  object: THREE.Object3D | Accessor<THREE.Object3D>,
): ObjectMap | Accessor<ObjectMap> {
  if (typeof object === "function") return createMemo(() => buildGraph(object()));
  return buildGraph(object);
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

type InputLike = string | readonly string[];

/** A three loader, or its class. */
export type LoaderLike = THREE.Loader<unknown, string | string[] | string[][]>;
type LoaderInstance<L> = L extends ConstructorRepresentation<infer I> ? I : L;

export type LoaderResult<L> =
  Awaited<
    ReturnType<LoaderInstance<L> extends LoaderLike ? LoaderInstance<L>["loadAsync"] : never>
  > extends infer R
    ? R extends { scene: THREE.Object3D }
      ? R & ObjectMap
      : R
    : never;

export type Extensions<L> = (loader: LoaderInstance<L>) => void;

interface Entry {
  promise: Promise<unknown>;
  settled: boolean;
  value: unknown;
  error: unknown;
}

const loaders = new WeakMap<ConstructorRepresentation, LoaderLike>();
const caches = new WeakMap<object, Map<string, Entry>>();

function loaderFor(proto: unknown): LoaderLike {
  if (typeof proto !== "function") return proto as LoaderLike;
  const ctor = proto as unknown as ConstructorRepresentation<LoaderLike>;
  let loader = loaders.get(ctor);
  if (loader === undefined) {
    loader = new ctor();
    loaders.set(ctor, loader);
  }
  return loader;
}

function cacheFor(proto: object): Map<string, Entry> {
  let cache = caches.get(proto);
  if (cache === undefined) {
    cache = new Map();
    caches.set(proto, cache);
  }
  return cache;
}

function load<L>(
  proto: L,
  url: string,
  extensions: Extensions<L> | undefined,
  onProgress: ((event: ProgressEvent) => void) | undefined,
): Entry {
  const cache = cacheFor(proto as object);
  const known = cache.get(url);
  if (known !== undefined) return known;
  const loader = loaderFor(proto);
  extensions?.(loader as LoaderInstance<L>);
  const entry: Entry = { promise: null!, settled: false, value: undefined, error: undefined };
  entry.promise = new Promise((resolvePromise, reject) => {
    loader.load(
      url,
      (data: unknown) => {
        const scene = (data as { scene?: THREE.Object3D } | null)?.scene;
        if (scene !== undefined && scene !== null && scene.isObject3D) {
          Object.assign(data as object, buildGraph(scene));
        }
        entry.settled = true;
        entry.value = data;
        resolvePromise(data);
      },
      onProgress,
      (error: unknown) => {
        entry.settled = true;
        entry.error = new Error(
          `Could not load ${url}: ${(error as { message?: string } | null)?.message ?? String(error)}`,
        );
        // A failed load is not kept, so asking again tries again.
        cache.delete(url);
        reject(entry.error);
      },
    );
  });
  cache.set(url, entry);
  return entry;
}

/**
 * Load `input` (a URL or a list of them) with a three loader, cached per
 * loader and URL. Returns an accessor: read inside `<Loading>`, it suspends
 * until the asset is there; read again once loaded, or for an asset already
 * in the cache, it answers at once. `input` may be an accessor, to load
 * something else when it changes.
 */
function loadAccessor<
  L extends LoaderLike | ConstructorRepresentation<LoaderLike>,
  I extends InputLike,
>(
  loader: L,
  input: I | Accessor<I>,
  extensions?: Extensions<L>,
  onProgress?: (event: ProgressEvent) => void,
): Accessor<I extends readonly string[] ? LoaderResult<L>[] : LoaderResult<L>> {
  const read = createMemo(() => {
    const value = typeof input === "function" ? input() : input;
    const urls = (Array.isArray(value) ? value : [value]) as readonly string[];
    const entries = urls.map((url) => load(loader, url, extensions, onProgress));
    let ready = true;
    for (const entry of entries) {
      if (entry.error !== undefined) throw entry.error;
      if (!entry.settled) ready = false;
    }
    const pick = (values: unknown[]): unknown => (Array.isArray(value) ? values : values[0]);
    if (ready) return pick(entries.map((entry) => entry.value));
    return Promise.all(entries.map((entry) => entry.promise)).then(pick);
  });
  return read as Accessor<I extends readonly string[] ? LoaderResult<L>[] : LoaderResult<L>>;
}

/** Start loading `input` into the cache now, for a component that reads it later. */
function preload<L extends LoaderLike | ConstructorRepresentation<LoaderLike>>(
  loader: L,
  input: InputLike,
  extensions?: Extensions<L>,
): void {
  const urls = (Array.isArray(input) ? input : [input]) as readonly string[];
  for (const url of urls) void load(loader, url, extensions, undefined).promise.catch(() => {});
}

/** Drop `input` from the cache, so the next read loads it again. */
function clear(loader: LoaderLike | ConstructorRepresentation<LoaderLike>, input: InputLike): void {
  const cache = caches.get(loader);
  if (cache === undefined) return;
  const urls = (Array.isArray(input) ? input : [input]) as readonly string[];
  for (const url of urls) cache.delete(url);
}

export interface UseLoader {
  <L extends LoaderLike | ConstructorRepresentation<LoaderLike>, I extends InputLike>(
    loader: L,
    input: I | Accessor<I>,
    extensions?: Extensions<L>,
    onProgress?: (event: ProgressEvent) => void,
  ): Accessor<I extends readonly string[] ? LoaderResult<L>[] : LoaderResult<L>>;
  preload: typeof preload;
  clear: typeof clear;
}

export const useLoader: UseLoader = Object.assign(loadAccessor, { preload, clear });
