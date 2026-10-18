/**
 * The renderer's node: a small record around the three object a tag stands
 * for, with the tree the renderer arranges.
 *
 * The object is not built when the node is. Compiled code creates an element
 * and writes its properties before the element joins a scene, so `args` (the
 * constructor's arguments) are known by then: that is when the object is
 * built, its properties applied, and the node attached to its parent's
 * object. A later change of `args` builds a new object and moves the children
 * and the attachment over to it, as React Three Fiber does.
 *
 * Text, sentinels and containers are nodes of the same shape that never hold
 * an object, so they never enter three's graph.
 */

import { getObserver, isDisposed, onCleanup, runWithOwner, type Owner } from "@barqjs/core";
import * as THREE from "three";

import { type ConstructorRepresentation } from "./catalogue.ts";
import type { EventHandlers } from "./events.ts";
import { sortChildren } from "./loop.ts";
import { applyProp, defaultOf, pathOf, resolve } from "./props.ts";
import type { RootState } from "./store.ts";

/** Attach as a function: put `self` on `parent`, and return what takes it off again. */
export type AttachFunction<O = never, P = never> = (parent: P, self: O) => (() => void) | void;
export type AttachType<O = never> = string | AttachFunction<O>;

export const ELEMENT = 0;
export const PRIMITIVE = 1;
export const TEXT = 2;
export const SENTINEL = 3;
export const CONTAINER = 4;
/** The node a tree is rendered into: a scene or a portal's target, built by someone else. */
export const ROOT = 5;

/** `attached` when the object was `add`ed to its parent's object. */
const ADDED = 1;
/** `attached` when it was set on a property of its parent's object. */
const ASSIGNED = 2;
/** `attached` when an attach function put it there. */
const CALLED = 3;

// One integer holds a node's kind, how it is attached and its flags: a scene
// holds a node per object, and every field is paid ten thousand times over.
const KIND_MASK = 0b111;
const ATTACHED_SHIFT = 3;
const ATTACHED_MASK = 0b11 << ATTACHED_SHIFT;
/** `dispose={null}`: the object and those below it are not disposed. */
const KEEP = 1 << 5;
const DESTROYED = 1 << 6;
/** A dashed property was written, so a write to its head writes it again. */
const DASHED_PROP = 1 << 7;
/** Waiting in the root's list of parents whose children are out of order. */
const QUEUED = 1 << 8;
/** In a scene, but not built: its constructor needs `args` a later write brings. */
const WAITING = 1 << 9;
/** Removed while its scope lived, and so ended when that scope goes. */
const WATCHED = 1 << 10;

const POINTER_HOVER = new Set([
  "onPointerMove",
  "onPointerOver",
  "onPointerOut",
  "onPointerEnter",
  "onPointerLeave",
]);

export const HANDLERS: ReadonlySet<string> = new Set([
  "onClick",
  "onContextMenu",
  "onDoubleClick",
  "onWheel",
  "onPointerDown",
  "onPointerUp",
  "onPointerMove",
  "onPointerOver",
  "onPointerOut",
  "onPointerEnter",
  "onPointerLeave",
  "onPointerCancel",
  "onPointerMissed",
  "onLostPointerCapture",
]);

const NO_ARGS: readonly unknown[] = [];

/** The object a node built, marked so an intersection finds its way back. */
export interface Tagged {
  __barq?: Instance;
}

/** What the renderer asks of an object, by the flags three's classes carry. */
interface Kinds {
  isObject3D?: boolean;
  isBufferGeometry?: boolean;
  isMaterial?: boolean;
  isFog?: boolean;
  type?: string;
  dispose?: () => void;
}

/** A node's object: an instance of any class. */
export type Built = object & Tagged & Kinds;

/** What a node with pointer handlers carries; most nodes have none. */
export interface EventState {
  handlers: EventHandlers;
  count: number;
  hovers: number;
  /** Where its object sits in the root's list of objects cast against, or -1. */
  interaction: number;
  /** Where it sits in the list of those with hover handlers, or -1. */
  hover: number;
}

export class Instance {
  readonly ctor: ConstructorRepresentation | null;
  bits: number;
  object: Built | null = null;
  /** Every property written, in order, so a rebuilt object gets them all again. */
  props: Record<string, unknown> | null = null;
  args: readonly unknown[] | undefined = undefined;
  parent: Instance | null = null;
  first: Instance | null = null;
  last: Instance | null = null;
  prev: Instance | null = null;
  next: Instance | null = null;
  /** The state of the scene this node is in, or `null` while it is in none. */
  root: RootState | null = null;
  /** The scope that built it, which it ends with. */
  owner: Owner | null = null;
  attach: AttachType | undefined = undefined;
  /** What an assignment replaced, or what an attach function returned. */
  previousAttach: unknown = undefined;
  events: EventState | null = null;
  refs: ((value: unknown) => void)[] | null = null;
  onUpdate: ((self: never) => void) | null = null;

  constructor(kind: number, ctor: ConstructorRepresentation | null) {
    this.bits = kind;
    this.ctor = ctor;
  }

  get kind(): number {
    return this.bits & KIND_MASK;
  }

  /** How the object is attached to the parent's object: `ADDED`, `ASSIGNED`, `CALLED` or 0. */
  get attached(): number {
    return (this.bits & ATTACHED_MASK) >> ATTACHED_SHIFT;
  }

  set attached(how: number) {
    this.bits = (this.bits & ~ATTACHED_MASK) | (how << ATTACHED_SHIFT);
  }

  get dispose(): boolean {
    return (this.bits & KEEP) === 0;
  }

  set dispose(on: boolean) {
    this.flag(KEEP, !on);
  }

  get destroyed(): boolean {
    return (this.bits & DESTROYED) !== 0;
  }

  get queued(): boolean {
    return (this.bits & QUEUED) !== 0;
  }

  set queued(on: boolean) {
    this.flag(QUEUED, on);
  }

  get waiting(): boolean {
    return (this.bits & WAITING) !== 0;
  }

  set waiting(on: boolean) {
    this.flag(WAITING, on);
  }

  get eventCount(): number {
    return this.events === null ? 0 : this.events.count;
  }

  get handlers(): EventHandlers | null {
    return this.events === null ? null : this.events.handlers;
  }

  get interactionIndex(): number {
    return this.events === null ? -1 : this.events.interaction;
  }

  get hoverIndex(): number {
    return this.events === null ? -1 : this.events.hover;
  }

  flag(bit: number, on: boolean): void {
    this.bits = on ? this.bits | bit : this.bits & ~bit;
  }

  /**
   * Put the objects this node `add`ed back in the order of its nodes. An
   * insert before a sibling appends, which keeps a list mounted in reverse
   * linear; the renderer asks for this once the batch is over.
   */
  sortChildren(): void {
    const object = this.object as THREE.Object3D | null;
    if (object === null) return;
    const children = object.children;
    let at = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as THREE.Object3D & Tagged;
      const node = child.__barq;
      if (node === undefined || node.parent !== this || node.attached !== ADDED) {
        children[at++] = child;
      }
    }
    for (let node = this.first; node !== null; node = node.next) {
      if (node.attached === ADDED) children[at++] = node.object as THREE.Object3D;
    }
    children.length = at;
  }
}

export function isObject3D(value: unknown): value is THREE.Object3D {
  return value !== null && typeof value === "object" && (value as THREE.Object3D).isObject3D;
}

// ---------------------------------------------------------------------------
// The tree of nodes
// ---------------------------------------------------------------------------

function link(parent: Instance, node: Instance, anchor: Instance | null): void {
  node.parent = parent;
  if (anchor === null) {
    node.prev = parent.last;
    node.next = null;
    if (parent.last === null) parent.first = node;
    else parent.last.next = node;
    parent.last = node;
    return;
  }
  node.next = anchor;
  node.prev = anchor.prev;
  if (anchor.prev === null) parent.first = node;
  else anchor.prev.next = node;
  anchor.prev = node;
}

function unlink(parent: Instance, node: Instance): void {
  if (node.prev === null) parent.first = node.next;
  else node.prev.next = node.next;
  if (node.next === null) parent.last = node.prev;
  else node.next.prev = node.prev;
  node.parent = null;
  node.prev = null;
  node.next = null;
}

/**
 * `insertNode` as the document does it: a node with a parent is moved, and a
 * node put before itself stays where it is.
 */
export function insertNode(parent: Instance, node: Instance, anchor: Instance | null): void {
  if (node === anchor) return;
  const from = node.parent;
  if (from !== null) {
    if (from === parent && node.next === anchor) return;
    unlink(from, node);
  }
  link(parent, node, anchor);
  if (node.kind === TEXT || node.kind === SENTINEL) return;

  const root = parent.root;
  if (from !== null && node.root !== null) {
    if (from === parent) {
      if (node.attached === ADDED) unordered(parent);
      return;
    }
    if (node.attached !== 0) detachObject(from, node);
    if (root === null || root !== node.root) {
      disconnect(node);
      if (root !== null) connect(parent, node);
      return;
    }
    attachObject(parent, node);
    root.invalidate();
    return;
  }
  if (root !== null) {
    connect(parent, node);
    root.invalidate();
  }
}

export function removeNode(parent: Instance, node: Instance): void {
  if (node.parent !== parent) return;
  unlink(parent, node);
  const root = node.root;
  if (node.attached !== 0) detachObject(parent, node);
  if (root !== null) {
    disconnect(node);
    root.invalidate();
  }
  const owner = node.owner;
  if (owner === null) return;
  if (isDisposed(owner)) {
    destroy(node);
    return;
  }
  // Moved out by a scope that lives on, it may come back. It ends with that
  // scope if it is still out then.
  if (node.object !== null && (node.bits & WATCHED) === 0) {
    node.flag(WATCHED, true);
    runWithOwner(owner, () => {
      onCleanup(() => {
        if (node.parent === null) destroy(node);
      });
    });
  }
}

/**
 * A node built by `createElement`. It ends when the renderer removes it after
 * its scope has gone, which is how a list row, a branch and a root end, so no
 * node costs a cleanup of its own. One built inside a computation (JSX in a
 * reactive child function) is replaced each time it runs, and ends then.
 */
export function element(
  kind: number,
  ctor: ConstructorRepresentation | null,
  owner: Owner | null,
): Instance {
  const node = new Instance(kind, ctor);
  node.owner = owner;
  if (owner !== null && getObserver() !== null) onCleanup(() => destroy(node));
  return node;
}

function unordered(parent: Instance): void {
  const root = parent.root;
  if (root === null) {
    parent.sortChildren();
    return;
  }
  if (parent.queued) return;
  parent.queued = true;
  const list = root.internal.unordered;
  list.push(parent);
  // The renderer reports the end of every batch it places through `placed`.
  // An insert made by hand, outside one, is put in order once the task that
  // made it is over, and before the next frame or raycast in any case.
  if (list.length === 1) queueMicrotask(() => sortChildren(root));
}

/**
 * A batch of inserts under `parent` is done: put its objects back in the
 * order of its nodes, once for the whole batch, so a list mounted in reverse
 * costs one pass and nothing ever reads it out of order.
 */
export function placed(parent: Instance): void {
  if (!parent.queued) return;
  parent.queued = false;
  parent.sortChildren();
}

// ---------------------------------------------------------------------------
// Joining and leaving a scene
// ---------------------------------------------------------------------------

/** Join `node` (and everything below it) to the scene `parent` is in. */
function connect(parent: Instance, node: Instance): void {
  const root = parent.root!;
  node.root = root;
  if (node.kind === TEXT || node.kind === SENTINEL || node.kind === CONTAINER) return;
  const built = node.object === null;
  if (built && !materializeOrWait(node)) return;
  join(parent, node, built);
}

function join(parent: Instance, node: Instance, built: boolean): void {
  if (node.attached === 0) attachObject(parent, node);
  if (node.events !== null && node.events.count > 0) addInteraction(node);
  for (let child = node.first; child !== null; child = child.next) connect(node, child);
  if (built) deliverRefs(node);
}

/**
 * Build the object of a node joining a scene, or leave it waiting. Compiled
 * code writes a property that reads a signal after the node is placed, so a
 * class whose constructor cannot run without its `args`, or a primitive whose
 * `object` is such a property, is built when that write arrives. One still
 * waiting once the current work is done reports why it could not be built.
 */
function materializeOrWait(node: Instance): boolean {
  if (node.kind === PRIMITIVE && !isObjectLike(node.props?.object)) {
    wait(node, new Error("A `<primitive>` needs an `object` to stand for, and was given none."));
    return false;
  }
  if (node.kind === ELEMENT && node.args === undefined) {
    try {
      materialize(node);
    } catch (error) {
      wait(node, error);
      return false;
    }
    return true;
  }
  materialize(node);
  return true;
}

function isObjectLike(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function wait(node: Instance, error: unknown): void {
  node.waiting = true;
  queueMicrotask(() => {
    if (node.waiting && node.root !== null && !node.destroyed) throw error;
  });
}

/** A waiting node got what it waited for: build it and join it as `connect` would have. */
function resume(node: Instance): void {
  node.waiting = false;
  const parent = node.parent;
  if (parent === null || node.root === null) return;
  if (!materializeOrWait(node)) return;
  join(parent, node, true);
  node.root.invalidate();
}

function deliverRefs(node: Instance): void {
  const refs = node.refs;
  if (refs !== null) for (const deliver of refs) deliver(node.object);
}

/** Leave the scene: no longer cast against or hovered. The objects stay attached below. */
function disconnect(node: Instance): void {
  for (let child = node.first; child !== null; child = child.next) {
    if (child.root !== null) disconnect(child);
  }
  if (node.events !== null && node.events.interaction !== -1) removeInteraction(node);
  node.root = null;
  node.waiting = false;
}

function construct(node: Instance): Built {
  if (node.kind === PRIMITIVE) return node.props!.object as Built;
  const args = node.args ?? NO_ARGS;
  return new (node.ctor as unknown as new (...args: readonly unknown[]) => Built)(...args);
}

function materialize(node: Instance): void {
  const object = construct(node);
  node.object = object;
  if (Object.isExtensible(object)) object.__barq = node;
  const props = node.props;
  if (props !== null) {
    const linear = node.root?.internal.linear ?? false;
    for (const name in props) {
      if (name === "object" && node.kind === PRIMITIVE) continue;
      applyProp(object, name, props[name], linear);
    }
  }
  if (node.onUpdate !== null) node.onUpdate(object as never);
}

/** An `attach` ending in `-<index>` names an array slot, and the array is made when missing. */
const INDEXED = new Map<string, string | null>();

function indexedBase(attach: string): string | null {
  let base = INDEXED.get(attach);
  if (base === undefined) {
    base = /-\d+$/.test(attach) ? attach.replace(/-\d+$/, "") : null;
    INDEXED.set(attach, base);
  }
  return base;
}

function autoAttach(object: Built): string | undefined {
  if (object.isBufferGeometry === true) return "geometry";
  if (object.isMaterial === true) return "material";
  if (object.isFog === true) return "fog";
  return undefined;
}

function attachObject(parent: Instance, node: Instance): void {
  const parentObject = parent.object;
  const object = node.object;
  if (parentObject === null || object === null) return;
  const attach = node.attach ?? autoAttach(object);
  if (typeof attach === "string") {
    const base = indexedBase(attach);
    if (base !== null) {
      const slot = resolve(parentObject, base);
      if (!Array.isArray(slot.owner[slot.key])) slot.owner[slot.key] = [];
    }
    const { owner, key } = resolve(parentObject, attach);
    node.previousAttach = owner[key];
    owner[key] = object;
    node.attached = ASSIGNED;
    return;
  }
  if (typeof attach === "function") {
    node.previousAttach = attach(parentObject as never, object as never);
    node.attached = CALLED;
    return;
  }
  if (object.isObject3D === true && parentObject.isObject3D === true) {
    (parentObject as THREE.Object3D).add(object as THREE.Object3D);
    node.attached = ADDED;
    for (let after = node.next; after !== null; after = after.next) {
      if (after.attached === ADDED) {
        unordered(parent);
        break;
      }
    }
  }
}

function detachObject(parent: Instance, node: Instance): void {
  const parentObject = parent.object!;
  const object = node.object;
  const attached = node.attached;
  node.attached = 0;
  if (attached === ADDED) {
    (parentObject as THREE.Object3D).remove(object as THREE.Object3D);
  } else if (attached === ASSIGNED) {
    // The path it was attached with: `attach` cannot change while attached,
    // and the object, whose type picks the path otherwise, is the same one.
    const path = (node.attach ?? autoAttach(object!)) as string;
    const { owner, key } = resolve(parentObject, path);
    const previous = node.previousAttach;
    const holder = owner[key];
    if (holder === object) {
      if (previous === undefined) delete owner[key];
      else owner[key] = previous;
    } else if (holder !== null && typeof holder === "object") {
      // Something attached over this object since, and would restore it when
      // it leaves: it restores what this one replaced instead.
      const over = (holder as Tagged).__barq;
      if (over !== undefined && over.previousAttach === object) over.previousAttach = previous;
    }
  } else if (attached === CALLED) {
    const undo = node.previousAttach;
    if (typeof undo === "function") undo();
  }
  node.previousAttach = undefined;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

function sameArgs(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** What a prop name is to the renderer, decided once per distinct name. */
const ARGS = 1;
const ATTACH = 2;
const DISPOSE = 3;
const ON_UPDATE = 4;
const IGNORED = 5;
const HANDLER = 6;
const OBJECT = 7;
/** A property of the object: `visible`, `material`. */
const PLAIN = 8;
/** A dashed path into it: `position-x`, `material-color`. */
const DASHED = 9;

const RESERVED = new Map<string, number>([
  ["args", ARGS],
  ["attach", ATTACH],
  ["dispose", DISPOSE],
  ["onUpdate", ON_UPDATE],
  ["children", IGNORED],
  ["key", IGNORED],
  ["object", OBJECT],
]);

/** A prop name as the renderer reads it: what it is, and its dashed path. */
interface Name {
  kind: number;
  path: readonly string[] | null;
  /**
   * The last class this dashed name was found to pierce on, which holds no
   * property of the whole name: a write on another object of it skips that
   * question.
   */
  pierces: unknown;
}

const NAMES = new Map<string, Name>();

function nameOf(name: string): Name {
  let known = NAMES.get(name);
  if (known === undefined) {
    const path = pathOf(name);
    const kind =
      RESERVED.get(name) ?? (HANDLERS.has(name) ? HANDLER : path === null ? PLAIN : DASHED);
    known = { kind, path, pierces: undefined };
    NAMES.set(name, known);
  }
  return known;
}

export function setProperty(node: Instance, name: string, value: unknown, prev: unknown): void {
  const known = nameOf(name);
  const kind = known.kind;
  if (kind < PLAIN) {
    setReserved(node, kind, name, value);
    return;
  }
  let props = node.props;
  if (props === null) props = node.props = {};
  props[name] = value;
  if (kind === DASHED) node.flag(DASHED_PROP, true);
  const object = node.object;
  if (object === null) return;
  const root = node.root;
  const linear = root !== null && root.internal.linear;
  if (value === undefined) {
    if (prev !== undefined) {
      const fallback = defaultOf(object, name);
      if (fallback.found) applyProp(object, name, fallback.value, true);
    }
  } else if (
    kind !== DASHED ||
    typeof value !== "number" ||
    !writeScalar(object, name, value, known)
  ) {
    applyProp(object, name, value, linear, known.path);
  }
  // Writing `material` replaces what `material-color` was written into.
  if (kind === PLAIN && (node.bits & DASHED_PROP) !== 0) {
    for (const other in props) {
      if (
        other.length > name.length &&
        other.startsWith(name) &&
        other.charAt(name.length) === "-"
      ) {
        applyProp(object, other, props[other], linear);
      }
    }
  }
  if (node.onUpdate !== null) node.onUpdate(object as never);
  // A write while the root's frame is drawn is in that frame, and one while a
  // frame is already owed is in the next: only the first write asks.
  if (root !== null) {
    const internal = root.internal;
    if (!internal.drawing && internal.frames === 0) root.invalidate();
  }
}

/**
 * A number into a number field one level down (`position-x`, `scale-y`,
 * `material-opacity`), the write a signal driving an animation makes every
 * frame: one read and one store, without the general path's questions.
 * Answers false when the field is anything else.
 */
function writeScalar(object: Built, name: string, value: number, known: Name): boolean {
  const path = known.path!;
  if (path.length !== 2) return false;
  const kind = (object as { constructor: unknown }).constructor;
  if (known.pierces !== kind) {
    if (name in object) return false;
    known.pierces = kind;
  }
  const owner = (object as Record<string, unknown>)[path[0]!];
  if (owner === null || typeof owner !== "object") return false;
  const key = path[1]!;
  if (typeof (owner as Record<string, unknown>)[key] !== "number") return false;
  (owner as Record<string, unknown>)[key] = value;
  return true;
}

function setReserved(node: Instance, kind: number, name: string, value: unknown): void {
  switch (kind) {
    case ARGS: {
      if (value !== undefined && !Array.isArray(value)) {
        throw new TypeError(
          `\`args\` on <${node.ctor?.name ?? "primitive"}> must be an array of constructor arguments.`,
        );
      }
      const args = value as readonly unknown[] | undefined;
      if (sameArgs(node.args, args)) return;
      node.args = args;
      if (node.waiting) resume(node);
      else if (node.object !== null && node.kind === ELEMENT) rebuild(node);
      return;
    }
    case ATTACH: {
      const attach = value as AttachType | undefined;
      if (attach === node.attach) return;
      const parent = node.parent;
      const reattach = parent !== null && node.attached !== 0;
      if (reattach) detachObject(parent, node);
      node.attach = attach;
      if (reattach) {
        attachObject(parent, node);
        node.root?.invalidate();
      }
      return;
    }
    case DISPOSE:
      node.dispose = value !== null;
      return;
    case ON_UPDATE:
      node.onUpdate = typeof value === "function" ? (value as (self: unknown) => void) : null;
      return;
    case HANDLER:
      setHandler(node, name, value);
      return;
    case OBJECT: {
      // Only a primitive stands for a given object; on any other tag
      // `object` is a property like the rest.
      let props = node.props;
      if (props === null) props = node.props = {};
      props.object = value;
      if (node.kind !== PRIMITIVE) {
        if (node.object !== null) applyProp(node.object, name, value, false);
        return;
      }
      if (node.waiting) resume(node);
      else if (node.object !== null && node.object !== value) rebuild(node);
      return;
    }
  }
}

function setHandler(node: Instance, name: string, value: unknown): void {
  let events = node.events;
  if (events === null) {
    if (typeof value !== "function") return;
    events = node.events = { handlers: {}, count: 0, hovers: 0, interaction: -1, hover: -1 };
  }
  const table = events.handlers as Record<string, unknown>;
  const had = table[name] !== undefined;
  const has = typeof value === "function";
  if (has) table[name] = value;
  else if (had) delete table[name];
  if (had === has) return;
  const step = has ? 1 : -1;
  const wasInteractive = events.count > 0;
  events.count += step;
  if (POINTER_HOVER.has(name)) events.hovers += step;
  if (node.root === null) return;
  if (wasInteractive) removeInteraction(node);
  if (events.count > 0) addInteraction(node);
}

// ---------------------------------------------------------------------------
// What a pointer is cast against
// ---------------------------------------------------------------------------

function addInteraction(node: Instance): void {
  const object = node.object as THREE.Object3D | null;
  const root = node.root;
  if (root === null || object === null || !object.isObject3D) return;
  if ((object as { raycast?: unknown }).raycast === null) return;
  const internal = root.internal;
  const events = node.events!;
  if (events.interaction === -1) {
    events.interaction = internal.interaction.length;
    internal.interaction.push(object);
  }
  if (events.hovers > 0 && events.hover === -1) {
    events.hover = internal.hoverable.length;
    internal.hoverable.push(object);
  }
}

function swapRemove(list: THREE.Object3D[], index: number, field: "interaction" | "hover"): void {
  const last = list.length - 1;
  if (index !== last) {
    const moved = list[last] as THREE.Object3D & Tagged;
    list[index] = moved;
    const events = moved.__barq?.events;
    if (events !== undefined && events !== null) events[field] = index;
  }
  list.length = last;
}

function removeInteraction(node: Instance): void {
  const root = node.root;
  if (root === null) return;
  const internal = root.internal;
  const events = node.events;
  if (events === null) return;
  if (events.interaction !== -1) {
    swapRemove(internal.interaction, events.interaction, "interaction");
    events.interaction = -1;
  }
  if (events.hover !== -1) {
    swapRemove(internal.hoverable, events.hover, "hover");
    events.hover = -1;
  }
  const object = node.object as THREE.Object3D | null;
  if (object !== null) releaseInteractivity(internal, object);
}

/** Forget every hover and pointer capture that names `object`. */
export function releaseInteractivity(
  internal: RootState["internal"],
  object: THREE.Object3D,
): void {
  if (internal.hovered.size > 0) {
    for (const [id, hovered] of internal.hovered) {
      if (hovered.eventObject === object || hovered.object === object) internal.hovered.delete(id);
    }
  }
  for (const [pointerId, captures] of internal.capturedMap) {
    const capture = captures.get(object);
    if (capture === undefined) continue;
    captures.delete(object);
    if (captures.size === 0) {
      internal.capturedMap.delete(pointerId);
      capture.target.releasePointerCapture?.(pointerId);
    }
  }
  const initial = internal.initialHits.indexOf(object);
  if (initial !== -1) internal.initialHits.splice(initial, 1);
}

// ---------------------------------------------------------------------------
// Rebuilding and ending
// ---------------------------------------------------------------------------

/**
 * A new object for new `args` (or a primitive's new `object`): the old one
 * leaves its parent and children, is disposed unless it was a primitive's,
 * and the new one takes its place with every property written again.
 */
function rebuild(node: Instance): void {
  const old = node.object;
  if (old === null) return;
  const parent = node.parent;
  const wasAttached = parent !== null && node.attached !== 0;
  if (wasAttached) detachObject(parent, node);
  const children: Instance[] = [];
  for (let child = node.first; child !== null; child = child.next) {
    if (child.attached === 0) continue;
    detachObject(node, child);
    children.push(child);
  }
  const interactive = node.events !== null && node.events.interaction !== -1;
  if (interactive) removeInteraction(node);
  if (old.__barq === node) delete old.__barq;
  if (node.kind === ELEMENT && node.dispose) disposeObject(old);
  node.object = null;
  materialize(node);
  if (wasAttached) attachObject(parent, node);
  for (const child of children) attachObject(node, child);
  if (interactive) addInteraction(node);
  deliverRefs(node);
  node.root?.invalidate();
}

function disposeObject(object: Built): void {
  if (object.type === "Scene" || typeof object.dispose !== "function") return;
  object.dispose();
}

function underDisposeNull(node: Instance): boolean {
  for (let at: Instance | null = node; at !== null; at = at.parent) {
    if (!at.dispose) return true;
  }
  return false;
}

/**
 * The end of a node, when the scope that created it goes: it leaves its
 * parent's object, every node below it ends too, and its object is disposed
 * unless it is a primitive's or sits under `dispose={null}`.
 */
export function destroy(node: Instance, disposing: boolean = !underDisposeNull(node)): void {
  if (node.destroyed) return;
  node.flag(DESTROYED, true);
  const parent = node.parent;
  if (parent !== null && node.attached !== 0) detachObject(parent, node);
  const root = node.root;
  if (root !== null) {
    disconnect(node);
    root.invalidate();
  }
  for (let child = node.first; child !== null; child = child.next) {
    destroy(child, disposing && child.dispose);
  }
  const object = node.object;
  if (object !== null) {
    if (object.__barq === node) delete object.__barq;
    if (disposing && node.dispose && node.kind === ELEMENT) disposeObject(object);
  }
  node.refs = null;
}

export function attachRef(node: Instance, deliver: (value: unknown) => void): () => void {
  const refs = node.refs ?? (node.refs = []);
  refs.push(deliver);
  if (node.object !== null) deliver(node.object);
  return () => {
    const list = node.refs;
    if (list === null) return;
    const index = list.indexOf(deliver);
    if (index !== -1) list.splice(index, 1);
  };
}
