/**
 * The renderer module: what compiled code imports when a file is compiled
 * with `target: "universal"` and `moduleSource: "@barqjs/three"`, and the
 * roots and portals a scene is mounted through.
 */

import {
  block,
  createOwner,
  getContext,
  getOwner,
  isBlock,
  onCleanup,
  runWithOwner,
  setContext,
  type JSXElement,
} from "@barqjs/core";
import {
  createRenderer,
  type RenderOptions,
  type Renderer as UniversalRenderer,
} from "@barqjs/universal";

type Host = UniversalRenderer<Instance>;
import * as THREE from "three";

import {
  register,
  registerOne,
  resolveConstructor,
  type Catalogue,
  type ConstructorRepresentation,
} from "./catalogue.ts";
import {
  createPointerEvents,
  type ComputeFunction,
  type EventManager,
  type EventPrefix,
} from "./events.ts";
import {
  CONTAINER,
  ELEMENT,
  Instance,
  PRIMITIVE,
  ROOT,
  SENTINEL,
  TEXT,
  attachRef,
  destroy,
  insertNode as insertInstance,
  placed,
  removeNode as removeInstance,
  setProperty,
} from "./instance.ts";
import { addRoot, advance, invalidate, removeRoot } from "./loop.ts";
import { applyProps } from "./props.ts";
import type { ElementProps } from "./three-types.ts";
import {
  ThreeContext,
  calculateDpr,
  createStore,
  updateCamera,
  type Camera,
  type Dpr,
  type Frameloop,
  type Performance,
  type Renderer as ThreeRenderer,
  type RootState,
  type Size,
} from "./store.ts";

function pascal(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function createElement(tag: string): Instance {
  let node: Instance;
  if (tag === "primitive") {
    node = new Instance(tag, PRIMITIVE, null);
  } else {
    const ctor = resolveConstructor(tag);
    if (ctor === null) {
      throw new Error(
        `\`<${tag}>\` is not a class of three or of anything given to \`extend\`. ` +
          `Register it first: \`extend({ ${pascal(tag)} })\`.`,
      );
    }
    node = new Instance(tag, ELEMENT, ctor);
  }
  // The node ends with the scope that built it: its object leaves its parent
  // and is disposed then, not when the renderer moves it.
  if (getOwner() !== null) onCleanup(() => destroy(node));
  return node;
}

const renderer: Host = createRenderer<Instance>({
  createElement,
  createTextNode: () => new Instance("#text", TEXT, null),
  replaceText: () => {},
  isTextNode: (node) => node.kind === TEXT,
  setProperty,
  insertNode: insertInstance,
  removeNode: removeInstance,
  getParentNode: (node) => node.parent,
  getFirstChild: (node) => node.first,
  getNextSibling: (node) => node.next,
  createSentinel: () => new Instance("#sentinel", SENTINEL, null),
  createContainer: () => new Instance("#container", CONTAINER, null),
  attachRef,
  placed,
});

export const createTextNode: Host["createTextNode"] = renderer.createTextNode;
export const insertNode: Host["insertNode"] = renderer.insertNode;
export const setProp: Host["setProp"] = renderer.setProp;
export const insert: Host["insert"] = renderer.insert;
export const spread: Host["spread"] = renderer.spread;
export const branch: Host["branch"] = renderer.branch;
export const each: Host["each"] = renderer.each;
export const boundary: Host["boundary"] = renderer.boundary;
export const island: Host["island"] = renderer.island;
export const reveal: Host["reveal"] = renderer.reveal;
export const portal: Host["portal"] = renderer.portal;
export const dynamic: Host["dynamic"] = renderer.dynamic;
export const Portal: Host["Portal"] = renderer.Portal;

export { createElement };

/**
 * Render `code` into `target`: a root's scene, or any three object, which the
 * tree's top-level objects are added to. Returns the function that disposes
 * the tree and takes what it placed off `target`.
 */
export function render(
  code: (() => JSXElement) | JSXElement,
  target: RootState | THREE.Object3D,
  options?: RenderOptions,
): () => void {
  const state = isRootState(target) ? target : null;
  const object = state === null ? (target as THREE.Object3D) : state.scene;
  const root = new Instance("#root", ROOT, null);
  root.object = object;
  root.root = state ?? standaloneState(object);
  const build = typeof code === "function" && !isBlock(code) ? code : () => code;
  return renderer.render(
    () => {
      setContext(ThreeContext, root.root!);
      return build() as JSXElement;
    },
    root,
    options,
  );
}

function isRootState(value: unknown): value is RootState {
  return value !== null && typeof value === "object" && "internal" in value && "get" in value;
}

/** The state of a tree rendered straight into an object, outside any canvas. */
function standaloneState(object: THREE.Object3D): RootState {
  const state = createStore(
    { invalidate: () => {}, advance: () => {}, resized: () => {} },
    { scene: object as THREE.Scene },
  );
  return state;
}

// ---------------------------------------------------------------------------
// extend
// ---------------------------------------------------------------------------

/**
 * Make classes available as tags: `extend({ OrbitControls })` is
 * `<orbitControls>`. Given one class, returns a component that renders it.
 */
export function extend(
  objects: ConstructorRepresentation,
): (props: Record<string, unknown>) => JSXElement;
export function extend(objects: Catalogue): void;
export function extend(
  objects: Catalogue | ConstructorRepresentation,
): ((props: Record<string, unknown>) => JSXElement) | void {
  if (typeof objects === "function") {
    const tag = registerOne(objects);
    return dynamic(() => tag);
  }
  register(objects);
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

type Properties<T> = { [K in keyof T as T[K] extends Function ? never : K]?: T[K] };

export interface DefaultGLProps extends Omit<THREE.WebGLRendererParameters, "canvas"> {
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * A renderer, a factory that makes one (returning it or a promise of it, as
 * `WebGPURenderer` must be initialized), or properties for the default
 * `WebGLRenderer`.
 */
export type GLProps =
  | ThreeRenderer
  | ((defaults: DefaultGLProps) => ThreeRenderer | Promise<ThreeRenderer>)
  | (Properties<THREE.WebGLRenderer> & Partial<THREE.WebGLRendererParameters>);

/** A camera, or what to write onto the default one: `{ position: [0, 0, 5], fov: 50 }`. */
export type CameraProps = (
  | Camera
  | (ElementProps<typeof THREE.PerspectiveCamera> & ElementProps<typeof THREE.OrthographicCamera>)
) & {
  /** The camera's projection is the application's: it is never fitted to the canvas. */
  manual?: boolean;
};

export interface RootConfig {
  gl?: GLProps;
  /** A size to keep, in place of the one measured from the canvas. */
  size?: Size;
  /** Shadows on, as a type name or `shadowMap` properties. */
  shadows?: boolean | "basic" | "percentage" | "soft" | "variance" | Partial<THREE.WebGLShadowMap>;
  /** `THREE.ColorManagement` off. */
  legacy?: boolean;
  /** Linear output, and color textures left as given. */
  linear?: boolean;
  /** No tone mapping, in place of ACES filmic. */
  flat?: boolean;
  orthographic?: boolean;
  /** `demand` by default: a frame is drawn when the scene changed. */
  frameloop?: Frameloop;
  performance?: Partial<Omit<Performance, "regress">>;
  /** A pixel ratio, or `[min, max]` to clamp the device's. */
  dpr?: Dpr;
  raycaster?: Partial<THREE.Raycaster> & Record<string, unknown>;
  scene?: THREE.Scene | ElementProps<typeof THREE.Scene>;
  camera?: CameraProps;
  /** A custom event manager, in place of the pointer events on `eventSource`. */
  events?: (store: RootState) => EventManager<HTMLElement>;
  /** Which coordinates of a pointer event the default event manager reads. */
  eventPrefix?: EventPrefix;
  onCreated?: (state: RootState) => void;
  onPointerMissed?: (event: MouseEvent) => void;
}

export interface Root {
  readonly store: RootState;
  /** Apply a configuration. Only what changed since the last one is applied again. */
  configure(config?: RootConfig): Root;
  /** Render `code` into the scene. `owner` parents the tree, so it reads the owner's contexts. */
  render(code: (() => JSXElement) | JSXElement, options?: RenderOptions): RootState;
  /** Dispose the tree, the event listeners and a renderer the root created. */
  unmount(): void;
}

const roots = new Map<object, Root>();

function isRenderer(value: unknown): value is ThreeRenderer {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as ThreeRenderer).render === "function"
  );
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    const x = left[key];
    const y = right[key];
    if (x === y) continue;
    if (
      Array.isArray(x) &&
      Array.isArray(y) &&
      x.length === y.length &&
      x.every((v, i) => v === y[i])
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/**
 * A root over a canvas: a renderer, a scene, a camera and the frame loop.
 * The same canvas always answers with the same root.
 */
export function createRoot(canvas: HTMLCanvasElement | OffscreenCanvas): Root {
  const existing = roots.get(canvas);
  if (existing !== undefined) return existing;

  const store = createStore({
    invalidate: (state, frames) => invalidate(state, frames),
    advance: (timestamp, runGlobalEffects, state) => advance(timestamp, runGlobalEffects, state),
    resized(state) {
      const peek = state.internal.peek;
      const gl = peek("gl") as THREE.WebGLRenderer | null;
      const camera = peek("camera");
      const size = peek("size");
      const dpr = peek("viewport").dpr;
      // Writing a canvas's size clears it even when the size is the same, and
      // a scroll moves `top` and `left` alone.
      if (
        size.width === applied.width &&
        size.height === applied.height &&
        dpr === applied.dpr &&
        gl === applied.gl
      ) {
        return;
      }
      if (camera !== null && size.width > 0 && size.height > 0) updateCamera(camera, size);
      if (gl === null) return;
      applied.width = size.width;
      applied.height = size.height;
      applied.dpr = dpr;
      applied.gl = gl;
      if (dpr > 0 && typeof gl.setPixelRatio === "function") gl.setPixelRatio(dpr);
      if (typeof gl.setSize === "function" && size.width > 0 && size.height > 0) {
        const style =
          typeof HTMLCanvasElement !== "undefined" && gl.domElement instanceof HTMLCanvasElement;
        gl.setSize(size.width, size.height, style);
      }
    },
  });

  const peek = store.internal.peek;
  const applied = { width: -1, height: -1, dpr: -1, gl: null as unknown };
  let previous: RootConfig | undefined;
  let configured = false;
  let ownsRenderer = false;
  let pendingGl: Promise<ThreeRenderer> | null = null;
  let disposeTree: (() => void) | null = null;
  let disconnectXr: (() => void) | null = null;
  let createdCalled = false;
  let latest: RootConfig = {};

  const changed = (key: keyof RootConfig, next: RootConfig): boolean =>
    previous === undefined || !shallowEqual(next[key], previous[key]);

  function makeRenderer(config: RootConfig): ThreeRenderer | Promise<ThreeRenderer> {
    const defaults: DefaultGLProps = {
      canvas,
      powerPreference: "high-performance",
      antialias: true,
      alpha: true,
    };
    const gl = config.gl;
    if (typeof gl === "function") {
      ownsRenderer = true;
      return gl(defaults);
    }
    if (isRenderer(gl)) return gl;
    ownsRenderer = true;
    return new THREE.WebGLRenderer({ ...defaults, ...(gl as object) });
  }

  function connectXr(gl: ThreeRenderer): void {
    const xr = (gl as THREE.WebGLRenderer).xr;
    if (xr === undefined || typeof xr.addEventListener !== "function") return;
    const onFrame = (timestamp: number, frame?: XRFrame): void => {
      if (peek("frameloop") === "never") return;
      advance(timestamp, true, store, frame);
    };
    const onSession = (): void => {
      xr.enabled = xr.isPresenting;
      xr.setAnimationLoop(xr.isPresenting ? onFrame : null);
      if (!xr.isPresenting) invalidate(store);
    };
    xr.addEventListener("sessionstart", onSession);
    xr.addEventListener("sessionend", onSession);
    disconnectXr = () => {
      xr.removeEventListener("sessionstart", onSession);
      xr.removeEventListener("sessionend", onSession);
    };
  }

  /** What depends on the renderer, once there is one. */
  function configureGl(config: RootConfig, force: boolean): void {
    const gl = peek("gl") as THREE.WebGLRenderer | null;
    if (gl === null) return;
    const glProps =
      config.gl !== undefined && typeof config.gl !== "function" && !isRenderer(config.gl)
        ? (config.gl as Record<string, unknown>)
        : undefined;
    const shadows = config.shadows ?? false;
    if (gl.shadowMap !== undefined && (force || changed("shadows", config))) {
      const enabled = gl.shadowMap.enabled;
      const type = gl.shadowMap.type;
      gl.shadowMap.enabled = shadows !== false;
      if (typeof shadows === "boolean") gl.shadowMap.type = THREE.PCFSoftShadowMap;
      else if (typeof shadows === "string") {
        gl.shadowMap.type =
          {
            basic: THREE.BasicShadowMap,
            percentage: THREE.PCFShadowMap,
            soft: THREE.PCFSoftShadowMap,
            variance: THREE.VSMShadowMap,
          }[shadows] ?? THREE.PCFSoftShadowMap;
      } else Object.assign(gl.shadowMap, shadows);
      if (enabled !== gl.shadowMap.enabled || type !== gl.shadowMap.type)
        gl.shadowMap.needsUpdate = true;
    }
    if (force || changed("linear", config)) {
      if (glProps?.outputColorSpace === undefined && "outputColorSpace" in gl) {
        gl.outputColorSpace =
          config.linear === true ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      }
    }
    if (force || changed("flat", config)) {
      if (glProps?.toneMapping === undefined && "toneMapping" in gl) {
        gl.toneMapping = config.flat === true ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      }
    }
    if (glProps !== undefined && (force || changed("gl", config))) applyProps(gl, glProps);
    if (force) {
      connectXr(gl);
      store.setDpr(config.dpr ?? [1, 2]);
    }
  }

  function created(): void {
    if (createdCalled || peek("gl") === null) return;
    createdCalled = true;
    store.internal.active = true;
    invalidate(store);
    latest.onCreated?.(store);
  }

  const root: Root = {
    store,
    configure(config = {}) {
      latest = config;
      if (peek("gl") === null && pendingGl === null) {
        const made = makeRenderer(config);
        if (made instanceof Promise) {
          pendingGl = made;
          void made.then((gl) => {
            pendingGl = null;
            if (!roots.has(canvas)) return;
            store.set({ gl: gl as THREE.WebGLRenderer });
            configureGl(latest, true);
            created();
          });
        } else {
          store.set({ gl: made as THREE.WebGLRenderer });
        }
      }

      let raycaster = peek("raycaster");
      if (raycaster === null) store.set({ raycaster: (raycaster = new THREE.Raycaster()) });
      if (config.raycaster !== undefined && changed("raycaster", config)) {
        const { params, ...options } = config.raycaster as Record<string, unknown> & {
          params?: Partial<THREE.RaycasterParameters>;
        };
        applyProps(raycaster, options);
        if (params !== undefined) raycaster.params = { ...raycaster.params, ...params };
      }

      if (peek("camera") === null || changed("camera", config) || changed("orthographic", config)) {
        const options = config.camera as (THREE.Camera & CameraProps) | undefined;
        let camera: Camera;
        if (options !== undefined && (options as THREE.Camera).isCamera) {
          camera = options as Camera;
        } else {
          camera =
            config.orthographic === true
              ? new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000)
              : new THREE.PerspectiveCamera(75, 0, 0.1, 1000);
          camera.position.z = 5;
          if (options !== undefined) {
            applyProps(camera, options as unknown as Record<string, unknown>);
            if (
              camera.manual !== true &&
              ("aspect" in options ||
                "left" in options ||
                "right" in options ||
                "bottom" in options ||
                "top" in options)
            ) {
              camera.manual = true;
              camera.updateProjectionMatrix();
            }
          }
          if (options?.rotation === undefined) camera.lookAt(0, 0, 0);
        }
        store.set({ camera });
        raycaster.camera = camera;
        const size = peek("size");
        if (size.width > 0 && size.height > 0) updateCamera(camera, size);
      }

      if (peek("scene") === null) {
        const given = config.scene as THREE.Scene | undefined;
        let scene: THREE.Scene;
        if (given !== undefined && given.isScene) scene = given;
        else {
          scene = new THREE.Scene();
          if (given !== undefined) applyProps(scene, given as unknown as Record<string, unknown>);
        }
        store.set({ scene });
      }

      if (peek("events").handlers === undefined) {
        store.set({
          events:
            config.events?.(store) ??
            (typeof window === "undefined"
              ? peek("events")
              : createPointerEvents(store, config.eventPrefix)),
        });
      }

      if (config.size !== undefined && changed("size", config)) {
        store.setSize(config.size.width, config.size.height, config.size.top, config.size.left);
      }
      if (configured && changed("dpr", config)) store.setDpr(config.dpr ?? [1, 2]);
      if (!configured || changed("frameloop", config))
        store.setFrameloop(config.frameloop ?? "demand");
      if (changed("onPointerMissed", config))
        store.set({ onPointerMissed: config.onPointerMissed });
      if (config.performance !== undefined && changed("performance", config)) {
        store.set({ performance: { ...peek("performance"), ...config.performance } });
      }
      if (!configured || changed("legacy", config)) {
        THREE.ColorManagement.enabled = config.legacy !== true;
        store.set({ legacy: config.legacy === true });
      }
      if (!configured || changed("linear", config)) store.set({ linear: config.linear === true });
      if (!configured || changed("flat", config)) store.set({ flat: config.flat === true });

      configureGl(config, !configured && peek("gl") !== null);
      previous = config;
      configured = true;
      if (pendingGl === null) created();
      return root;
    },
    render(code, options) {
      if (!configured) root.configure();
      disposeTree?.();
      disposeTree = render(code, store, options);
      return store;
    },
    unmount() {
      disposeTree?.();
      disposeTree = null;
      peek("events").disconnect?.();
      disconnectXr?.();
      store.internal.active = false;
      removeRoot(store);
      const gl = peek("gl") as (THREE.WebGLRenderer & { renderLists?: { dispose(): void } }) | null;
      if (gl !== null) {
        gl.renderLists?.dispose();
        if (ownsRenderer) {
          gl.dispose?.();
          gl.forceContextLoss?.();
        }
      }
      roots.delete(canvas);
    },
  };

  addRoot(store);
  roots.set(canvas, root);
  return root;
}

export { calculateDpr };

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

/** What a portal's state replaces of its parent's. */
export interface InjectState {
  camera?: Camera;
  scene?: THREE.Scene;
  size?: Size;
  events?: { enabled?: boolean; priority?: number; compute?: ComputeFunction; connected?: unknown };
  [key: string]: unknown;
}

/** A state layered over `parent`: its own scene, raycaster and pointer, the rest read through. */
function createLayer(
  parent: RootState,
  container: THREE.Object3D,
  inject: InjectState = {},
): RootState {
  const layer = Object.create(parent) as RootState;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const own: Record<string, unknown> = { ...inject };
  delete own.events;
  delete own.size;
  const overrides: Record<string, unknown> = {
    ...own,
    scene: container,
    raycaster,
    pointer,
    previousRoot: parent,
  };
  for (const key in overrides) {
    Object.defineProperty(layer, key, { value: overrides[key], writable: true, enumerable: true });
  }
  Object.defineProperty(layer, "events", {
    get: () => ({ ...parent.events, ...inject.events }) as EventManager<HTMLElement>,
    enumerable: true,
  });
  Object.defineProperty(layer, "size", {
    get: () => ({ ...parent.size, ...inject.size }),
    enumerable: true,
  });
  Object.defineProperty(layer, "get", { value: () => layer });
  Object.defineProperty(layer, "set", {
    value: (partial: Record<string, unknown> | ((state: RootState) => Record<string, unknown>)) => {
      const next = typeof partial === "function" ? partial(layer) : partial;
      const forward: Record<string, unknown> = {};
      for (const key in next) {
        if (Object.prototype.hasOwnProperty.call(layer, key)) {
          (layer as unknown as Record<string, unknown>)[key] = next[key];
        } else {
          forward[key] = next[key];
        }
      }
      parent.set(forward);
      parent.invalidate();
    },
  });
  if (inject.camera !== undefined && inject.size !== undefined)
    updateCamera(inject.camera, layer.size);
  return layer;
}

/**
 * Render `children` into `container`, a three object anywhere, with a state
 * of its own for what the children read through `useThree`: `scene` is the
 * container, and `state` may give it its own camera, size or event layer.
 * Children given as a function or a Block are built under that state.
 */
export function createPortal(
  children: JSXElement | (() => JSXElement),
  container: THREE.Object3D,
  state?: InjectState,
): JSXElement {
  const parent = getContext(ThreeContext);
  const layer = createLayer(parent, container, state);
  const target = new Instance("#portal", ROOT, null);
  target.object = container;
  target.root = layer;
  const scope = createOwner();
  setContext(ThreeContext, layer, scope);
  const body = isBlock(children)
    ? (children as () => JSXElement)
    : typeof children === "function"
      ? block(children)
      : block(() => children);
  return runWithOwner(scope, () => portal(() => target, body as never));
}
