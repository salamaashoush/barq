/**
 * The state a canvas's scene reads through `useThree`: the renderer, the
 * scene, the camera, the size, and the controls over the frame loop.
 *
 * The members a component may want to follow (`camera`, `size`, `viewport`,
 * `gl`, `frameloop`, `events` and the rest of the settable ones) are getters
 * over signals, so reading `state.size.width` in a binding tracks it. The
 * frame loop and the event system read the same values untracked.
 */

import { createContext, createSignal, untrack, type Context } from "@barqjs/core";
import * as THREE from "three";

import type { EventManager, PointerCaptureTarget, ThreeEvent } from "./events.ts";
import type { Instance } from "./instance.ts";

export type Camera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean };

export type Dpr = number | [min: number, max: number];

export interface Size {
  width: number;
  height: number;
  top: number;
  left: number;
}

export type Frameloop = "always" | "demand" | "never";

export interface Viewport extends Size {
  /** The pixel ratio the root started with. */
  initialDpr: number;
  /** The pixel ratio now. */
  dpr: number;
  /** `size.width / viewport.width`. */
  factor: number;
  /** The camera's distance to the target the viewport was measured at. */
  distance: number;
  /** `width / height`. */
  aspect: number;
}

/** Anything with `render(scene, camera)`: a `WebGLRenderer`, a `WebGPURenderer`, a test double. */
export interface Renderer {
  render(scene: THREE.Scene, camera: THREE.Camera): unknown;
}

/** What `useFrame` subscribes. `frame` is the XR frame, when there is one. */
export type RenderCallback = (state: RootState, delta: number, frame?: XRFrame) => void;

export interface Subscription {
  callback: { current: RenderCallback };
  priority: number;
  store: RootState;
}

export interface Performance {
  /** Between `min` and `max`. */
  current: number;
  min: number;
  max: number;
  /** Milliseconds until `current` returns to `max` after a `regress()`. */
  debounce: number;
  /** Drop `current` to `min` until nothing has regressed for `debounce` ms. */
  regress: () => void;
}

export interface InternalState {
  /** Objects with at least one pointer handler, the only objects a pointer is cast against. */
  interaction: THREE.Object3D[];
  /** The subset with a move, over, out, enter or leave handler. */
  hoverable: THREE.Object3D[];
  hovered: Map<string, ThreeEvent<PointerEvent>>;
  capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>;
  initialClick: [x: number, y: number];
  initialHits: THREE.Object3D[];
  lastEvent: { current: PointerEvent | MouseEvent | WheelEvent | null };
  subscribers: Subscription[];
  /** How many subscribers render the frame themselves (a priority above zero). */
  priority: number;
  /** Frames still owed under `demand`. */
  frames: number;
  /** False until configured and after unmount: the loop skips the root. */
  active: boolean;
  /** Instances whose three children are out of order after an insert before a sibling. */
  unordered: Instance[];
  /** `linear`, read untracked by every texture write. */
  linear: boolean;
  /** A member's value without subscribing to it, for the loop and the root's own bookkeeping. */
  peek: <K extends keyof SettableState>(key: K) => RootState[K];
  subscribe: (
    callback: { current: RenderCallback },
    priority: number,
    store: RootState,
  ) => () => void;
}

export interface RootState {
  /** Write members, as R3F's `set`. */
  set: (partial: Partial<SettableState> | ((state: RootState) => Partial<SettableState>)) => void;
  /** This state, read without tracking. */
  get: () => RootState;
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: Camera;
  raycaster: THREE.Raycaster;
  /** Advanced once per frame by the loop. */
  clock: THREE.Timer;
  events: EventManager<HTMLElement>;
  /** The pointer in normalized device coordinates. */
  pointer: THREE.Vector2;
  controls: THREE.EventDispatcher | null;
  /** `THREE.ColorManagement` is off. */
  legacy: boolean;
  /** Output is linear, and color textures are not marked sRGB. */
  linear: boolean;
  /** No tone mapping. */
  flat: boolean;
  frameloop: Frameloop;
  performance: Performance;
  size: Size;
  viewport: Viewport & {
    getCurrentViewport: (
      camera?: Camera,
      target?: THREE.Vector3 | [x: number, y: number, z: number],
      size?: Size,
    ) => Omit<Viewport, "dpr" | "initialDpr">;
  };
  /** Ask for a frame. Under `demand` this is what renders; every prop write already does it. */
  invalidate: (frames?: number) => void;
  /** Run one frame now, for `frameloop: "never"`. */
  advance: (timestamp: number, runGlobalEffects?: boolean) => void;
  setEvents: (events: Partial<EventManager<HTMLElement>>) => void;
  setSize: (width: number, height: number, top?: number, left?: number) => void;
  setDpr: (dpr: Dpr) => void;
  setFrameloop: (frameloop: Frameloop) => void;
  onPointerMissed?: (event: MouseEvent) => void;
  /** The state a portal's state layers over. */
  previousRoot?: RootState;
  internal: InternalState;
}

export type SettableState = Omit<
  RootState,
  | "set"
  | "get"
  | "internal"
  | "invalidate"
  | "advance"
  | "setEvents"
  | "setSize"
  | "setDpr"
  | "setFrameloop"
>;

export const ThreeContext: Context<RootState> = createContext<RootState>(undefined, "ThreeContext");

export function calculateDpr(dpr: Dpr): number {
  const target = typeof window !== "undefined" ? (window.devicePixelRatio ?? 2) : 1;
  return Array.isArray(dpr) ? Math.min(Math.max(dpr[0], target), dpr[1]) : dpr;
}

export function isOrthographicCamera(camera: THREE.Camera): camera is THREE.OrthographicCamera {
  return (camera as THREE.OrthographicCamera).isOrthographicCamera;
}

/** Fit a camera nobody marked `manual` to the canvas. */
export function updateCamera(camera: Camera, size: Size): void {
  if (camera.manual === true) return;
  if (isOrthographicCamera(camera)) {
    camera.left = size.width / -2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = size.height / -2;
  } else {
    camera.aspect = size.width / size.height;
  }
  camera.updateProjectionMatrix();
}

/** The members `set` writes through a signal, so reading them tracks. */
const REACTIVE = [
  "gl",
  "scene",
  "camera",
  "raycaster",
  "events",
  "controls",
  "legacy",
  "linear",
  "flat",
  "frameloop",
  "performance",
  "size",
  "viewport",
  "onPointerMissed",
  "previousRoot",
] as const;

type Reactive = (typeof REACTIVE)[number];

export interface StoreHooks {
  invalidate: (state: RootState, frames?: number) => void;
  advance: (timestamp: number, runGlobalEffects: boolean, state: RootState) => void;
  /** Called after `size` or the pixel ratio changed, to resize the renderer. */
  resized: (state: RootState) => void;
}

/**
 * A root's state. Every reactive member starts as given in `initial` (or
 * empty) and is replaced through `set`; a write that changes something asks
 * for a frame.
 */
export function createStore(hooks: StoreHooks, initial: Partial<SettableState> = {}): RootState {
  const signals = {} as Record<Reactive, [read: () => unknown, write: (value: unknown) => void]>;
  const position = new THREE.Vector3();
  const defaultTarget = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();
  let performanceTimeout: ReturnType<typeof setTimeout> | undefined;

  const state = {} as RootState;

  function getCurrentViewport(
    camera: Camera = values.camera as Camera,
    target: THREE.Vector3 | [number, number, number] = defaultTarget,
    size: Size = values.size as Size,
  ): Omit<Viewport, "dpr" | "initialDpr"> {
    const { width, height, top, left } = size;
    const aspect = width / height;
    if (Array.isArray(target)) tempTarget.set(target[0], target[1], target[2]);
    else tempTarget.copy(target);
    const distance = camera.getWorldPosition(position).distanceTo(tempTarget);
    if (isOrthographicCamera(camera)) {
      return {
        width: width / camera.zoom,
        height: height / camera.zoom,
        top,
        left,
        factor: 1,
        distance,
        aspect,
      };
    }
    const fov = (camera.fov * Math.PI) / 180;
    const h = 2 * Math.tan(fov / 2) * distance;
    const w = h * (width / height);
    return { width: w, height: h, top, left, factor: width / w, distance, aspect };
  }

  const values: Record<Reactive, unknown> = {
    gl: null,
    scene: null,
    camera: null,
    raycaster: null,
    events: { priority: 1, enabled: true, connected: undefined },
    controls: null,
    legacy: false,
    linear: false,
    flat: false,
    frameloop: "demand",
    performance: {
      current: 1,
      min: 0.5,
      max: 1,
      debounce: 200,
      regress: () => {
        const performance = state.performance;
        if (performanceTimeout !== undefined) clearTimeout(performanceTimeout);
        if (performance.current !== performance.min) {
          state.set({ performance: { ...performance, current: performance.min } });
        }
        performanceTimeout = setTimeout(() => {
          state.set({ performance: { ...state.performance, current: state.performance.max } });
        }, performance.debounce);
      },
    },
    size: { width: 0, height: 0, top: 0, left: 0 },
    viewport: {
      initialDpr: 0,
      dpr: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      aspect: 0,
      distance: 0,
      factor: 0,
      getCurrentViewport,
    },
    onPointerMissed: undefined,
    previousRoot: undefined,
  };
  for (const key in initial) {
    if (key in values) values[key as Reactive] = initial[key as keyof SettableState];
  }

  for (const key of REACTIVE) {
    // The signal is what a binding subscribes to; the value is read from
    // `values`, which a write updates at once, where the signal's own value
    // would show the write only after the engine's next flush.
    // A root is configured from inside the component that mounts it, which is
    // an owned scope, so the write there is intended.
    const [read, notify] = createSignal(0, { equals: false, ownedWrite: true });
    signals[key] = [
      () => {
        read();
        return values[key];
      },
      () => void notify(0),
    ];
    Object.defineProperty(state, key, {
      get: signals[key][0],
      enumerable: true,
      configurable: true,
    });
  }

  const subscribers: Subscription[] = [];
  const internal: InternalState = {
    interaction: [],
    hoverable: [],
    hovered: new Map(),
    capturedMap: new Map(),
    initialClick: [0, 0],
    initialHits: [],
    lastEvent: { current: null },
    subscribers,
    priority: 0,
    frames: 0,
    active: false,
    unordered: [],
    linear: values.linear === true,
    peek: <K extends keyof SettableState>(key: K): RootState[K] =>
      (key in values
        ? values[key as Reactive]
        : (state as unknown as Record<string, unknown>)[key]) as RootState[K],
    subscribe(callback, priority, store) {
      if (priority > 0) internal.priority++;
      const subscription: Subscription = { callback, priority, store };
      let at = internal.subscribers.length;
      while (at > 0 && internal.subscribers[at - 1]!.priority > priority) at--;
      internal.subscribers.splice(at, 0, subscription);
      hooks.invalidate(state);
      return () => {
        const index = internal.subscribers.indexOf(subscription);
        if (index === -1) return;
        internal.subscribers.splice(index, 1);
        if (priority > 0) internal.priority--;
      };
    },
  };

  function write(partial: Partial<SettableState>): void {
    let resized = false;
    let camera = false;
    for (const key in partial) {
      const value = partial[key as keyof SettableState];
      if (key in signals) {
        values[key as Reactive] = value;
        signals[key as Reactive][1](value);
        if (key === "size") resized = true;
        if (key === "linear") internal.linear = value === true;
        if (key === "camera") camera = true;
      } else {
        (state as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (camera && !resized) {
      values.viewport = { ...(values.viewport as object), ...getCurrentViewport() };
      signals.viewport[1](values.viewport);
    }
    if (resized) hooks.resized(state);
    hooks.invalidate(state);
  }

  Object.assign(state, {
    set: (partial: Partial<SettableState> | ((state: RootState) => Partial<SettableState>)) =>
      write(typeof partial === "function" ? untrack(() => partial(state)) : partial),
    get: () => state,
    clock: new THREE.Timer(),
    pointer: new THREE.Vector2(),
    invalidate: (frames = 1) => hooks.invalidate(state, frames),
    advance: (timestamp: number, runGlobalEffects = true) =>
      hooks.advance(timestamp, runGlobalEffects, state),
    setEvents: (events: Partial<EventManager<HTMLElement>>) =>
      write({ events: { ...(values.events as EventManager<HTMLElement>), ...events } }),
    setSize: (width: number, height: number, top = 0, left = 0) => {
      const size = { width, height, top, left };
      const camera = values.camera as Camera | null;
      write({
        size,
        viewport: {
          ...(values.viewport as RootState["viewport"]),
          ...(camera === null ? {} : getCurrentViewport(camera, defaultTarget, size)),
        },
      });
    },
    setDpr: (dpr: Dpr) => {
      const resolved = calculateDpr(dpr);
      const viewport = values.viewport as RootState["viewport"];
      write({
        viewport: {
          ...viewport,
          dpr: resolved,
          initialDpr: viewport.initialDpr === 0 ? resolved : viewport.initialDpr,
        },
      });
      hooks.resized(state);
    },
    setFrameloop: (frameloop: Frameloop) => {
      state.clock.reset();
      write({ frameloop });
    },
    internal,
  });

  return state;
}
