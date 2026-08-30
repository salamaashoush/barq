/**
 * @barqjs/primitives — reactive primitives for barq.
 *
 * Every module is its own entry point as well as being re-exported here, so
 * `@barqjs/primitives/media` and a tree-shaken import from the root cost the
 * same. The package declares `sideEffects: false`, and nothing in it runs at
 * import time: the shared sources — one `resize` listener, one
 * `MediaQueryList` per query — are built on the first call and torn down when
 * the last owner that asked for them disposes.
 */

export {
  type Animatable,
  type Easing,
  type SpringOptions,
  type TweenOptions,
  cubicBezier,
  easing,
  spring,
  tween,
} from "./animation.ts";

export {
  type IdleOptions,
  type PermissionStatus,
  devicePixelRatio,
  documentTitle,
  languages,
  online,
  pageVisible,
  permission,
  userIdle,
} from "./browser.ts";

export { type Bus, type Emitter, bus, emitter, trigger } from "./bus.ts";

export {
  type ClipboardHandle,
  type ClipboardOptions,
  clipboard,
  readClipboard,
  writeClipboard,
} from "./clipboard.ts";

export { ReactiveMap, ReactiveSet } from "./collections.ts";

export {
  debounced,
  deferred,
  every,
  not,
  previous,
  selector,
  some,
  throttled,
  whenever,
} from "./derived.ts";

export {
  type Bounds,
  type BoundsOptions,
  type Size,
  type VisibleOptions,
  bounds,
  elementSize,
  visible,
  windowSize,
} from "./element.ts";

export {
  type EventHandler,
  type EventMapOf,
  type EventOf,
  type EventTypeOf,
  eventSignal,
  on,
  onMap,
  once,
} from "./event.ts";

export {
  type ClickOutsideOptions,
  activeElement,
  clickOutside,
  focusWithin,
  focused,
} from "./focus.ts";

export { type Fullscreen, fullscreen, fullscreenElement } from "./fullscreen.ts";

export { type Geolocation, type Position, geolocation } from "./geolocation.ts";

export { type HistoryHandle, type HistoryOptions, history } from "./history.ts";

export { type ShortcutOptions, isKeyDown, keysDown, parseCombo, shortcut } from "./keyboard.ts";

export {
  type Machine,
  type MachineConfig,
  type StateNode,
  type Transition,
  machine,
} from "./machine.ts";

export {
  type BreakpointState,
  type Breakpoints,
  breakpoints,
  coarsePointer,
  mediaQuery,
  prefersDark,
  prefersReducedMotion,
} from "./media.ts";

export {
  type ElementMousePosition,
  type MousePosition,
  mouseInElement,
  mousePosition,
} from "./mouse.ts";

export { intersectionObserver, mutationObserver, resizeObserver } from "./observers.ts";

export { TimeoutError, abortOnCleanup, raceTimeout, sleep, until } from "./promise.ts";

export { type Loop, fps, raf } from "./raf.ts";

export { type Ref, type RefTarget, mergeRefs, onElement, ref } from "./refs.ts";

export {
  type Schedule,
  type Scheduled,
  debounce,
  leading,
  leadingAndTrailing,
  scheduleIdle,
  scheduled,
  throttle,
} from "./scheduled.ts";

export { type ScrollPosition, scrollPosition, windowScroll } from "./scroll.ts";

export {
  type PersistOptions,
  clearPersisted,
  peekPersisted,
  persisted,
  persistedSession,
} from "./storage.ts";

export { type Delay, elapsed, interval, now, timeout } from "./timer.ts";

export {
  type AnyFunction,
  type Clear,
  type MaybeAccessor,
  type MaybeAccessorValue,
  access,
  arrayEquals,
  asAccessor,
  asArray,
  chain,
  clamp,
  falseFn,
  microtask,
  noop,
  owned,
  shared,
  sharedKeyed,
  trueFn,
  tryCleanup,
} from "./utils.ts";

export { type Virtual, type VirtualItem, type VirtualOptions, virtual } from "./virtual.ts";

export {
  type Sendable,
  type Socket,
  type SocketOptions,
  type SocketState,
  websocket,
} from "./websocket.ts";
