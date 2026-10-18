/**
 * One `requestAnimationFrame` loop for every root.
 *
 * Under `demand` a root renders only when something asked for a frame, and
 * the renderer asks on every prop write, insert and remove, so a scene that
 * changes through signals is redrawn exactly when it changed and never
 * otherwise. A `useFrame` subscriber keeps its root rendering every frame for
 * as long as it is subscribed. `always` renders every frame; `never` renders
 * only through `advance`.
 */

import { flush } from "@barqjs/core";

import type { RootState } from "./store.ts";

export type GlobalRenderCallback = (timestamp: number) => void;

const roots = new Set<RootState>();
const before = new Set<GlobalRenderCallback>();
const after = new Set<GlobalRenderCallback>();
const tail = new Set<GlobalRenderCallback>();

function subscribe(set: Set<GlobalRenderCallback>, callback: GlobalRenderCallback): () => void {
  set.add(callback);
  return () => {
    set.delete(callback);
  };
}

/** Run `callback` at the start of every frame the loop runs. */
export const addEffect = (callback: GlobalRenderCallback): (() => void) =>
  subscribe(before, callback);

/** Run `callback` after every frame the loop runs. */
export const addAfterEffect = (callback: GlobalRenderCallback): (() => void) =>
  subscribe(after, callback);

/** Run `callback` when the loop stops because nothing asked for another frame. */
export const addTail = (callback: GlobalRenderCallback): (() => void) => subscribe(tail, callback);

function run(effects: Set<GlobalRenderCallback>, timestamp: number): void {
  for (const callback of effects) callback(timestamp);
}

export function addRoot(state: RootState): void {
  roots.add(state);
}

export function removeRoot(state: RootState): void {
  roots.delete(state);
}

/** True while a root's frame is being drawn: a write then is in the frame already. */
let drawing: RootState | null = null;
let running = false;
let scheduled = 0;

/**
 * One frame of one root: advance the clock, put moved children back in
 * order, run the `useFrame` subscribers, apply what their signal writes
 * changed, and render unless a subscriber renders itself.
 */
export function update(state: RootState, timestamp: number, frame?: XRFrame): void {
  const internal = state.internal;
  drawing = state;
  try {
    state.clock.update(timestamp);
    const delta = state.clock.getDelta();
    const subscribers = internal.subscribers;
    for (const subscription of subscribers) {
      subscription.callback.current(subscription.store, delta, frame);
    }
    // A subscriber that writes a signal changes the scene through effects the
    // engine would run after this callback returns, a frame late. They run now.
    flush();
    sortChildren(state);
    if (internal.priority === 0)
      internal.peek("gl").render(internal.peek("scene"), internal.peek("camera"));
  } finally {
    drawing = null;
  }
  if (internal.frames > 0) internal.frames--;
}

/** Restore three's child order for every parent an anchored insert disturbed. */
export function sortChildren(state: RootState): void {
  const unordered = state.internal.unordered;
  if (unordered.length === 0) return;
  for (const parent of unordered) {
    if (!parent.queued) continue;
    parent.queued = false;
    parent.sortChildren();
  }
  unordered.length = 0;
}

function wants(state: RootState): boolean {
  const internal = state.internal;
  const gl = internal.peek("gl") as { xr?: { isPresenting?: boolean } } | null;
  if (!internal.active || gl === null) return false;
  const mode = internal.peek("frameloop");
  if (mode === "never") return false;
  if (gl.xr?.isPresenting === true) return false;
  return mode === "always" || internal.frames > 0 || internal.subscribers.length > 0;
}

function loop(timestamp: number): void {
  scheduled = 0;
  running = true;
  run(before, timestamp);
  for (const state of roots) {
    if (wants(state)) update(state, timestamp);
  }
  run(after, timestamp);
  // Asked again after the frame it ran in, by a later root or an after-effect,
  // a root is still owed one.
  let repeat = false;
  for (const state of roots) {
    if (wants(state)) {
      repeat = true;
      break;
    }
  }
  if (repeat) {
    scheduled = requestAnimationFrame(loop);
    return;
  }
  run(tail, timestamp);
  running = false;
}

/**
 * Ask for a frame of `state`, or of every root. A write made while the root's
 * own frame is being drawn is in that frame and asks for nothing.
 */
export function invalidate(state?: RootState, frames = 1): void {
  if (state === undefined) {
    for (const root of roots) invalidate(root, frames);
    return;
  }
  if (state === drawing && frames === 1) return;
  const internal = state.internal;
  if (!internal.active || internal.peek("frameloop") === "never") return;
  if (frames > 1) internal.frames = Math.min(60, internal.frames + frames);
  else if (internal.frames === 0) internal.frames = 1;
  if (!running && scheduled === 0) {
    running = true;
    scheduled = requestAnimationFrame(loop);
  }
}

/**
 * Run one frame now, of `state` or of every root, at `timestamp`: what a
 * `frameloop: "never"` root renders through.
 */
export function advance(
  timestamp: number,
  runGlobalEffects = true,
  state?: RootState,
  frame?: XRFrame,
): void {
  if (runGlobalEffects) run(before, timestamp);
  if (state === undefined) for (const root of roots) update(root, timestamp, frame);
  else update(state, timestamp, frame);
  if (runGlobalEffects) run(after, timestamp);
}
