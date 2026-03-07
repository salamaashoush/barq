/**
 * Barq - Tiny JSX renderer with fine-grained reactivity via signals
 *
 * Core: signals, JSX/DOM rendering, components, async resources, stores
 * For CSS-in-JS and utility hooks, see @barqjs/extra
 */

// Core reactivity - primitives
export {
  signal,
  computed,
  effect,
  batch,
  untrack,
  createScope,
  onCleanup,
  onMount,
  createContext,
  useContext,
  getContext,
  setContext,
  hasContext,
  flush,
  getOwner,
  runWithOwner,
  // Error classes
  NoOwnerError,
  ContextNotFoundError,
} from "./signals.ts";

// createRoot: detached scope for SolidJS compatibility
import { createScope as _createScope } from "./signals.ts";
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  return _createScope(fn, true);
}

export type { SignalOptions, Owner, ContextRecord } from "./signals.ts";

// Types
export type { Signal, Computed, Context } from "./signals.ts";
export type { Resource, ResourceState, ResourceStatus } from "./async.ts";
export type { Store } from "./store.ts";

// Type configuration - for compiler mode opt-in
export type {
  BarqConfig,
  IsCompilerMode,
  StrictAccessor,
  StrictArrayAccessor,
  StrictChild,
} from "./config.ts";

// Store - fine-grained nested reactivity
export { useStore, produce, reconcile, unwrap } from "./store.ts";

// Core hooks
export { useState, useMemo, useEffect } from "./hooks.ts";

// Async data loading
export { useResource } from "./hooks.ts";

// DOM
export {
  createElement,
  render,
  useRef,
  template,
  type Child,
  type Props,
  type Component,
  type JSXElement,
  type Element,
  type ArrayElement,
} from "./dom.ts";

// Components
export {
  Fragment,
  Show,
  For,
  Index,
  Switch,
  Match,
  Suspense,
  ErrorBoundary,
  Await,
  Portal,
  Dynamic,
  // Props utilities
  splitProps,
  mergeProps,
  children,
  // DOM marker utilities
  createMarkerPair,
  insertNodes,
  clearRange,
  childToNodes,
} from "./components.ts";
export type { MatchProps } from "./components.ts";

// JSX
export type { JSX } from "./jsx-runtime.ts";
export { jsx, jsxs, Fragment as JSXFragment } from "./jsx-runtime.ts";

// Type utilities
export {
  isString,
  isNumber,
  isBoolean,
  isFunction,
  isObject,
  isArray,
  isNullish,
  isNode,
  isElement,
  isHTMLElement,
  toString,
  asHTMLElement,
  asElement,
  asNode,
  getProperty,
  setProperty,
} from "./type-utils.ts";

// Helper types for components (following SolidJS/React patterns)
export type {
  Accessor,
  Setter,
  FunctionMaybe,
  MaybeAccessor,
  PropsWithChildren,
  ParentProps,
  VoidProps,
  FlowProps,
  ComponentProps,
  ValidComponent,
  IntrinsicElementProps,
  Ref,
  RefCallback,
  RefObject,
} from "./jsx-runtime.ts";

// Version
export const VERSION = "0.1.0";
