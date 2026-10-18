/**
 * `@barqjs/three`: three.js scenes written as barq JSX.
 *
 * This module is two things. It is the renderer module the compiler imports
 * from for files compiled with `target: "universal"` and
 * `moduleSource: "@barqjs/three"` (`createElement`, `setProp`, `insert` and
 * the rest), and it is the API a page and a scene use: `<Canvas>`,
 * `useThree`, `useFrame`, `useLoader`, `extend`, `createPortal`.
 */

export {
  Portal,
  boundary,
  branch,
  createElement,
  createPortal,
  createRoot,
  createTextNode,
  dynamic,
  each,
  extend,
  insert,
  insertNode,
  island,
  portal,
  render,
  reveal,
  setProp,
  spread,
  type CameraProps,
  type DefaultGLProps,
  type GLProps,
  type InjectState,
  type Root,
  type RootConfig,
} from "./renderer.ts";
export { Canvas, type CanvasProps } from "./canvas.tsx";
export { Html, defaultCalculatePosition, type CalculatePosition, type HtmlProps } from "./html.ts";
export type { DocumentTagClashes, ThreeIntrinsicElements } from "./web-jsx.ts";
export {
  buildGraph,
  useFrame,
  useGraph,
  useLoader,
  useThree,
  type Extensions,
  type LoaderLike,
  type LoaderResult,
  type ObjectMap,
} from "./hooks.ts";
export {
  addAfterEffect,
  addEffect,
  addTail,
  advance,
  invalidate,
  type GlobalRenderCallback,
} from "./loop.ts";
export { applyProps } from "./props.ts";
export {
  createEvents,
  createPointerEvents,
  type Camera as EventCamera,
  type ComputeFunction,
  type DomEvent,
  type EventHandlers,
  type EventManager,
  type EventPrefix,
  type Events,
  type FilterFunction,
  type Intersection,
  type IntersectionEvent,
  type PointerCaptureTarget,
  type ThreeEvent,
} from "./events.ts";
export { type AttachFunction, type AttachType, type Instance } from "./instance.ts";
export type { Catalogue, ConstructorRepresentation } from "./catalogue.ts";
export {
  ThreeContext,
  calculateDpr,
  type Camera,
  type Dpr,
  type Frameloop,
  type Performance,
  type RenderCallback,
  type Renderer,
  type RootState,
  type Size,
  type Viewport,
} from "./store.ts";
export type {
  Args,
  Color,
  ElementProps,
  Euler,
  EventProps,
  InstanceProps,
  Layers,
  MathProps,
  MathType,
  Matrix3,
  Matrix4,
  Quaternion,
  ThreeElement,
  ThreeElements,
  ThreeRef,
  ThreeToJSXElements,
  Vector2,
  Vector3,
  Vector4,
} from "./three-types.ts";
