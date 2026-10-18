/**
 * Pointer events on three objects, with React Three Fiber's semantics:
 * a pointer is cast only against objects that have a handler, hits are
 * sorted nearest first and bubble up through their ancestors, a handler may
 * stop propagation or capture the pointer, and a click that hits nothing is
 * reported as missed.
 *
 * The objects with handlers are kept in an index as handlers come and go, so
 * a pointer never walks the scene. The event an intersection is handed reads
 * the native event's properties through getters on its prototype rather
 * than copying them, so dispatching to a handler costs one small object.
 */

import * as THREE from "three";

import type { Instance, Tagged } from "./instance.ts";
import { sortChildren } from "./loop.ts";
import type { RootState } from "./store.ts";

export interface Intersection extends THREE.Intersection {
  /** The object whose handler is being called: the hit object or an ancestor of it. */
  eventObject: THREE.Object3D;
}

export type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

/** The methods a handler finds on `event.target`, standing in for the element's. */
export interface PointerCaptureApi {
  hasPointerCapture: (pointerId: number) => boolean;
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
}

export interface IntersectionEvent<TSourceEvent> extends Intersection {
  /** Every intersection this event found, nearest first, one per handler that may see it. */
  intersections: Intersection[];
  /** The pointer on the near plane, in world space. */
  unprojectedPoint: THREE.Vector3;
  /** The pointer in normalized device coordinates. */
  pointer: THREE.Vector2;
  /** How far the pointer moved, in pixels, since the press that began a click. */
  delta: number;
  ray: THREE.Ray;
  camera: Camera;
  /** Stop handlers further from the camera, and the ancestors after this one, from seeing it. */
  stopPropagation: () => void;
  nativeEvent: TSourceEvent;
  stopped: boolean;
  target: PointerCaptureApi;
  currentTarget: PointerCaptureApi;
}

type NonFunctionKeys<T> = { [K in keyof T]-?: T[K] extends Function ? never : K }[keyof T];
type Properties<T> = Pick<T, NonFunctionKeys<T>>;

export type ThreeEvent<TEvent> = IntersectionEvent<TEvent> &
  Omit<Properties<TEvent>, keyof IntersectionEvent<TEvent>>;

export type DomEvent = PointerEvent | MouseEvent | WheelEvent;

export interface EventHandlers {
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMissed?: (event: MouseEvent) => void;
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void;
  onWheel?: (event: ThreeEvent<WheelEvent>) => void;
  onLostPointerCapture?: (event: ThreeEvent<PointerEvent>) => void;
}

/** The listeners an event manager attaches to its element, one per DOM event. */
export interface Events {
  onClick: EventListener;
  onContextMenu: EventListener;
  onDoubleClick: EventListener;
  onWheel: EventListener;
  onPointerDown: EventListener;
  onPointerUp: EventListener;
  onPointerLeave: EventListener;
  onPointerMove: EventListener;
  onPointerCancel: EventListener;
  onLostPointerCapture: EventListener;
}

export type FilterFunction = (
  items: THREE.Intersection[],
  state: RootState,
) => THREE.Intersection[];
export type ComputeFunction = (event: DomEvent, root: RootState, previous?: RootState) => void;

export interface EventManager<TTarget> {
  enabled: boolean;
  /** A layer with a higher priority sorts its hits first. */
  priority: number;
  /** Set the pointer and the raycaster from a native event. */
  compute?: ComputeFunction;
  /** Reorder or drop hits before they are dispatched. */
  filter?: FilterFunction;
  connected?: TTarget;
  handlers?: Events;
  connect?: (target: TTarget) => void;
  disconnect?: () => void;
  /** Dispatch the last pointer move again, for a camera that moved under a still pointer. */
  update?: () => void;
}

export interface PointerCaptureTarget {
  intersection: Intersection;
  target: Element;
}

function tagOf(object: THREE.Object3D): Instance | undefined {
  return (object as THREE.Object3D & Tagged).__barq;
}

function makeId(event: Intersection): string {
  return `${(event.eventObject || event.object).uuid}/${event.index}${event.instanceId}`;
}

/** Native event properties already turned into getters on `ThreeEventImpl`'s prototype. */
const forwarded = new Set<string>();

class ThreeEventImpl {
  // Every member an intersection can carry, so they are one shape.
  distance = 0;
  distanceToRay: number | undefined = undefined;
  point: THREE.Vector3 = null!;
  index: number | undefined = undefined;
  face: THREE.Face | null | undefined = undefined;
  faceIndex: number | undefined = undefined;
  uv: THREE.Vector2 | undefined = undefined;
  uv1: THREE.Vector2 | undefined = undefined;
  normal: THREE.Vector3 | undefined = undefined;
  instanceId: number | undefined = undefined;
  pointOnLine: THREE.Vector3 | undefined = undefined;
  batchId: number | undefined = undefined;
  object: THREE.Object3D = null!;
  eventObject: THREE.Object3D = null!;
  intersections: Intersection[] = null!;
  pointer: THREE.Vector2 = null!;
  delta = 0;
  ray: THREE.Ray = null!;
  camera: Camera = null!;
  nativeEvent: DomEvent = null!;
  stopped = false;
  target: PointerCaptureApi = null!;
  currentTarget: PointerCaptureApi = null!;
  stopPropagation: () => void = null!;
  private projected: THREE.Vector3 | null = null;

  get unprojectedPoint(): THREE.Vector3 {
    if (this.projected === null) {
      this.projected = new THREE.Vector3(this.pointer.x, this.pointer.y, 0).unproject(this.camera);
    }
    return this.projected;
  }
}

/**
 * Forward every non-function property of `event`'s classes (`clientX`,
 * `pointerId`, `deltaY`, ...) through a getter on the event prototype, once
 * per property name, so an event reads `event.clientX` as R3F's does.
 */
function forward(event: object): void {
  const own = ThreeEventImpl.prototype as unknown as Record<string, unknown>;
  const instance = new ThreeEventImpl() as unknown as Record<string, unknown>;
  for (
    let proto = Object.getPrototypeOf(event);
    proto !== null && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (forwarded.has(name) || name === "constructor" || name in instance || name in own)
        continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (descriptor === undefined || typeof descriptor.value === "function") continue;
      forwarded.add(name);
      Object.defineProperty(own, name, {
        get(this: ThreeEventImpl) {
          return (this.nativeEvent as unknown as Record<string, unknown>)[name];
        },
        configurable: true,
      });
    }
  }
  // Own properties of the event itself: a synthetic or polyfilled event.
  for (const name of Object.keys(event)) {
    if (forwarded.has(name) || name in instance || name in own) continue;
    if (typeof (event as Record<string, unknown>)[name] === "function") continue;
    forwarded.add(name);
    Object.defineProperty(own, name, {
      get(this: ThreeEventImpl) {
        return (this.nativeEvent as unknown as Record<string, unknown>)[name];
      },
      configurable: true,
    });
  }
}

const forwardedClasses = new WeakSet<object>();

function ensureForwarded(event: object): void {
  const proto = Object.getPrototypeOf(event) as object | null;
  // A plain object (a polyfilled or synthetic event) carries its properties
  // itself, and the next one may carry others.
  if (proto === null || proto === Object.prototype) {
    forward(event);
    return;
  }
  if (forwardedClasses.has(proto)) return;
  forward(event);
  forwardedClasses.add(proto);
}

/** Cast against `object` and below it, skipping a child that is cast on its own. */
function cast(
  object: THREE.Object3D,
  raycaster: THREE.Raycaster,
  hits: THREE.Intersection[],
  hoverOnly: boolean,
): void {
  let propagate = true;
  if (object.layers.test(raycaster.layers)) {
    // three stops descending below an object whose raycast answers false.
    const result: unknown = object.raycast(raycaster, hits);
    if (result === false) propagate = false;
  }
  if (!propagate) return;
  const children = object.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const node = tagOf(child);
    if (node !== undefined && (hoverOnly ? node.hoverIndex !== -1 : node.interactionIndex !== -1)) {
      continue;
    }
    cast(child, raycaster, hits, hoverOnly);
  }
}

function byDistance(a: THREE.Intersection, b: THREE.Intersection): number {
  return a.distance - b.distance;
}

export function createEvents(store: RootState): {
  handlePointer: (name: string) => (event: DomEvent) => void;
} {
  const hits: THREE.Intersection[] = [];
  let stamp = 0;
  const computed = new WeakMap<RootState, number>();

  function layerOf(object: THREE.Object3D): RootState | null {
    const node = tagOf(object);
    if (node !== undefined && node.root !== null) return node.root;
    let found: RootState | null = null;
    object.traverseAncestors((ancestor) => {
      const tagged = tagOf(ancestor);
      if (found === null && tagged !== undefined && tagged.root !== null) found = tagged.root;
    });
    return found;
  }

  /** The raycaster of `layer`, computed for this event the first time it is asked for. */
  function raycasterOf(layer: RootState, event: DomEvent): THREE.Raycaster | null {
    if (!layer.events.enabled) return null;
    if (computed.get(layer) !== stamp) {
      computed.set(layer, stamp);
      if (layer !== store) {
        if (layer.events.compute !== undefined)
          layer.events.compute(event, layer, layer.previousRoot);
        else {
          layer.pointer.copy(store.pointer);
          layer.raycaster.setFromCamera(layer.pointer, layer.camera);
        }
      }
    }
    return layer.raycaster.camera === null ? null : layer.raycaster;
  }

  function calculateDistance(event: DomEvent): number {
    const internal = store.internal;
    const dx = event.offsetX - internal.initialClick[0];
    const dy = event.offsetY - internal.initialClick[1];
    return Math.round(Math.sqrt(dx * dx + dy * dy));
  }

  function intersect(event: DomEvent, hoverOnly: boolean): Intersection[] {
    const internal = store.internal;
    const objects = hoverOnly ? internal.hoverable : internal.interaction;
    stamp++;
    const intersections: Intersection[] = [];
    if (objects.length > 0 && store.events.enabled) {
      sortChildren(store);
      store.events.compute?.(event, store);
      computed.set(store, stamp);
      hits.length = 0;
      let layered = false;
      for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        const layer = tagOf(object)?.root ?? store;
        if (layer !== store) layered = true;
        const raycaster = raycasterOf(layer, event);
        if (raycaster !== null) cast(object, raycaster, hits, hoverOnly);
      }
      if (layered) {
        hits.sort((a, b) => {
          const pa = layerOf(a.object)?.events.priority ?? 0;
          const pb = layerOf(b.object)?.events.priority ?? 0;
          return pb - pa || a.distance - b.distance;
        });
      } else {
        hits.sort(byDistance);
      }
      const found = store.events.filter === undefined ? hits : store.events.filter(hits, store);
      let accepted = 0;
      for (let i = 0; i < found.length; i++) {
        const hit = found[i];
        // A ray through an edge hits both faces that share it, and R3F reports
        // one intersection per object, index and instance.
        let duplicate = false;
        for (let j = 0; j < accepted; j++) {
          const seen = found[j];
          if (
            seen.object === hit.object &&
            seen.index === hit.index &&
            seen.instanceId === hit.instanceId
          ) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) continue;
        found[accepted++] = hit;
        for (let at: THREE.Object3D | null = hit.object; at !== null; at = at.parent) {
          const node = tagOf(at);
          if (node !== undefined && node.eventCount > 0) {
            const intersection = hit as Intersection;
            intersections.push({ ...intersection, eventObject: at });
          }
        }
      }
      hits.length = 0;
    }
    if ("pointerId" in event) {
      const captures = internal.capturedMap.get(event.pointerId);
      if (captures !== undefined) {
        for (const capture of captures.values()) {
          let present = false;
          for (let i = 0; i < intersections.length; i++) {
            if (intersections[i].eventObject === capture.intersection.eventObject) {
              present = true;
              break;
            }
          }
          if (!present) intersections.push(capture.intersection);
        }
      }
    }
    return intersections;
  }

  function releaseCapture(
    captures: Map<THREE.Object3D, PointerCaptureTarget>,
    object: THREE.Object3D,
    pointerId: number,
  ): void {
    const capture = captures.get(object);
    if (capture === undefined) return;
    captures.delete(object);
    if (captures.size === 0) {
      store.internal.capturedMap.delete(pointerId);
      capture.target.releasePointerCapture?.(pointerId);
    }
  }

  function dispatch(
    intersections: Intersection[],
    event: DomEvent,
    delta: number,
    callback: (event: ThreeEventImpl) => void,
  ): void {
    if (intersections.length === 0) return;
    ensureForwarded(event);
    const internal = store.internal;
    const local = { stopped: false };
    for (let i = 0; i < intersections.length; i++) {
      const hit = intersections[i];
      const state = layerOf(hit.object) ?? store;
      const pointerId = "pointerId" in event ? event.pointerId : -1;
      const capture: PointerCaptureApi = {
        hasPointerCapture: (id) => internal.capturedMap.get(id)?.has(hit.eventObject) ?? false,
        setPointerCapture: (id) => {
          const data = { intersection: hit, target: event.target as Element };
          const captures = internal.capturedMap.get(id);
          if (captures === undefined)
            internal.capturedMap.set(id, new Map([[hit.eventObject, data]]));
          else captures.set(hit.eventObject, data);
          (event.target as Element | null)?.setPointerCapture?.(id);
        },
        releasePointerCapture: (id) => {
          const captures = internal.capturedMap.get(id);
          if (captures !== undefined) releaseCapture(captures, hit.eventObject, id);
        },
      };
      const three = new ThreeEventImpl();
      Object.assign(three, hit);
      three.intersections = intersections;
      three.pointer = state.pointer;
      three.delta = delta;
      three.ray = state.raycaster.ray;
      three.camera = state.camera;
      three.nativeEvent = event;
      three.stopped = local.stopped;
      three.target = capture;
      three.currentTarget = capture;
      three.stopPropagation = () => {
        // A captured pointer may only be stopped by an object holding the capture.
        const captures = pointerId === -1 ? undefined : internal.capturedMap.get(pointerId);
        if (captures !== undefined && !captures.has(hit.eventObject)) return;
        three.stopped = local.stopped = true;
        if (internal.hovered.size > 0) {
          let hovered = false;
          for (const value of internal.hovered.values()) {
            if (value.eventObject === hit.eventObject) {
              hovered = true;
              break;
            }
          }
          // Only a hovered object may unhover those behind it.
          if (hovered) cancelPointer(intersections.slice(0, i + 1));
        }
      };
      callback(three);
      if (local.stopped) break;
    }
  }

  function cancelPointer(intersections: Intersection[]): void {
    const internal = store.internal;
    for (const [id, hovered] of internal.hovered) {
      let still = false;
      for (let i = 0; i < intersections.length; i++) {
        const hit = intersections[i];
        if (
          hit.object === hovered.object &&
          hit.index === hovered.index &&
          hit.instanceId === hovered.instanceId
        ) {
          still = true;
          break;
        }
      }
      if (still) continue;
      internal.hovered.delete(id);
      const node = tagOf(hovered.eventObject);
      if (node === undefined || node.eventCount === 0 || node.handlers === null) continue;
      const data = Object.assign(Object.create(Object.getPrototypeOf(hovered) as object), hovered, {
        intersections,
      }) as ThreeEvent<PointerEvent>;
      node.handlers.onPointerOut?.(data);
      node.handlers.onPointerLeave?.(data);
    }
  }

  function pointerMissed(event: MouseEvent, objects: readonly THREE.Object3D[]): void {
    for (let i = 0; i < objects.length; i++) {
      tagOf(objects[i])?.handlers?.onPointerMissed?.(event);
    }
  }

  function missedExcept(event: MouseEvent): void {
    const internal = store.internal;
    const initial = internal.initialHits;
    const objects = internal.interaction;
    for (let i = 0; i < objects.length; i++) {
      if (!initial.includes(objects[i])) tagOf(objects[i])?.handlers?.onPointerMissed?.(event);
    }
  }

  function handlePointer(name: string): (event: DomEvent) => void {
    switch (name) {
      case "onPointerLeave":
      case "onPointerCancel":
        return () => cancelPointer([]);
      case "onLostPointerCapture":
        return (event: DomEvent) => {
          const internal = store.internal;
          if (!("pointerId" in event) || !internal.capturedMap.has(event.pointerId)) return;
          // Lost capture fires before pointerup; releasing on the next frame
          // lets pointerup reach the object that held the capture first.
          requestAnimationFrame(() => {
            if (internal.capturedMap.has(event.pointerId)) {
              internal.capturedMap.delete(event.pointerId);
              cancelPointer([]);
            }
          });
        };
    }

    const isPointerMove = name === "onPointerMove";
    const isClick = name === "onClick" || name === "onContextMenu" || name === "onDoubleClick";

    return function handleEvent(event: DomEvent): void {
      const internal = store.internal;
      internal.lastEvent.current = event;
      const intersections = intersect(event, isPointerMove);
      const delta = isClick ? calculateDistance(event) : 0;

      if (name === "onPointerDown") {
        internal.initialClick = [event.offsetX, event.offsetY];
        internal.initialHits = intersections.map((hit) => hit.eventObject);
      }

      if (isClick && intersections.length === 0 && delta <= 2) {
        pointerMissed(event, internal.interaction);
        store.onPointerMissed?.(event);
      }

      if (isPointerMove) cancelPointer(intersections);

      dispatch(intersections, event, delta, (data) => {
        const eventObject = data.eventObject;
        const node = tagOf(eventObject);
        if (node === undefined || node.eventCount === 0 || node.handlers === null) return;
        const handlers = node.handlers;
        const three = data as unknown as ThreeEvent<PointerEvent>;
        if (isPointerMove) {
          if (
            handlers.onPointerOver !== undefined ||
            handlers.onPointerEnter !== undefined ||
            handlers.onPointerOut !== undefined ||
            handlers.onPointerLeave !== undefined
          ) {
            const id = makeId(data);
            const hovered = internal.hovered.get(id);
            if (hovered === undefined) {
              internal.hovered.set(id, three);
              handlers.onPointerOver?.(three);
              handlers.onPointerEnter?.(three);
            } else if (hovered.stopped) {
              data.stopPropagation();
            }
          }
          handlers.onPointerMove?.(three);
          return;
        }
        const handler = (handlers as Record<string, ((event: unknown) => void) | undefined>)[name];
        if (handler !== undefined) {
          if (!isClick || internal.initialHits.includes(eventObject)) {
            missedExcept(event);
            handler(three);
          }
        } else if (isClick && internal.initialHits.includes(eventObject)) {
          missedExcept(event);
        }
      });
    };
  }

  return { handlePointer };
}

const DOM_EVENTS = {
  onClick: ["click", false],
  onContextMenu: ["contextmenu", false],
  onDoubleClick: ["dblclick", false],
  onWheel: ["wheel", true],
  onPointerDown: ["pointerdown", true],
  onPointerUp: ["pointerup", true],
  onPointerLeave: ["pointerleave", true],
  onPointerMove: ["pointermove", true],
  onPointerCancel: ["pointercancel", true],
  onLostPointerCapture: ["lostpointercapture", true],
} as const;

/** Which coordinates of a pointer event the default manager reads. */
export type EventPrefix = "offset" | "client" | "page" | "layer" | "screen";

/**
 * The default event manager for the web: listens on an element and casts
 * from its pointer, read as `<prefix>X`/`<prefix>Y` relative to the canvas size.
 */
export function createPointerEvents(
  store: RootState,
  prefix: EventPrefix = "offset",
): EventManager<HTMLElement> {
  const { handlePointer } = createEvents(store);
  const handlers = {} as Record<keyof Events, EventListener>;
  for (const name in DOM_EVENTS) {
    handlers[name as keyof Events] = handlePointer(name) as EventListener;
  }
  const x = `${prefix}X` as const;
  const y = `${prefix}Y` as const;
  return {
    priority: 1,
    enabled: true,
    compute(event: DomEvent, state: RootState) {
      const size = state.size;
      const source = event as unknown as Record<string, number>;
      state.pointer.set((source[x] / size.width) * 2 - 1, -(source[y] / size.height) * 2 + 1);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
    connected: undefined,
    handlers: handlers,
    update() {
      const last = store.internal.lastEvent.current;
      const events = store.events;
      if (last !== null && events.handlers !== undefined) events.handlers.onPointerMove(last);
    },
    connect(target: HTMLElement) {
      store.events.disconnect?.();
      store.setEvents({ connected: target });
      const events = store.events;
      if (events.handlers === undefined) return;
      for (const name in events.handlers) {
        const [type, passive] = DOM_EVENTS[name as keyof typeof DOM_EVENTS];
        target.addEventListener(type, events.handlers[name as keyof Events], { passive });
      }
    },
    disconnect() {
      const events = store.events;
      const target = events.connected;
      if (target === undefined) return;
      if (events.handlers !== undefined) {
        for (const name in events.handlers) {
          const [type] = DOM_EVENTS[name as keyof typeof DOM_EVENTS];
          target.removeEventListener(type, events.handlers[name as keyof Events]);
        }
      }
      store.setEvents({ connected: undefined });
    },
  };
}
