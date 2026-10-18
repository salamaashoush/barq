/**
 * `<Html>`: document content pinned to a point of the scene, the way drei's
 * `Html` is. It is a scene component: it places a group, and after every
 * frame the canvas draws it moves a `<div>` over the canvas to where that
 * group projects. Its children are content of the document, rendered into the
 * `<div>` by `@barqjs/web` under the scene's owner.
 */

import {
  createRenderEffect,
  getOwner,
  onCleanup,
  untrack,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { render as renderDocument } from "@barqjs/web";
import * as THREE from "three";

import type { CanvasStyle } from "./canvas.tsx";
import { useThree } from "./hooks.ts";
import { addAfterEffect } from "./loop.ts";
import { createElement, setProp } from "./renderer.ts";
import type { Camera, RootState, Size } from "./store.ts";
import type { Euler, Vector3 } from "./three-types.ts";

export type CalculatePosition = (
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: Size,
) => [x: number, y: number];

export interface HtmlProps {
  children?: JSXElement;
  position?: Vector3;
  rotation?: Euler;
  scale?: Vector3;
  visible?: boolean;
  name?: string;
  /** Center the content on the point, rather than putting its top-left corner there. */
  center?: boolean;
  /** Scale the content with distance, as an object of the scene would be: larger is bigger. */
  distanceFactor?: number;
  /** The z-index range the content is spread over by distance, nearest highest. */
  zIndexRange?: [max: number, min: number];
  /** The element the content's `<div>` is added to. Defaults to the canvas's parent. */
  portal?: HTMLElement | { current: HTMLElement | null };
  /** Put the `<div>` before the canvas rather than after it. */
  prepend?: boolean;
  /** Where on screen the point is, in pixels from the canvas's top-left corner. */
  calculatePosition?: CalculatePosition;
  /** `pointer-events` of the content, as drei's `pointerEvents`. */
  pointerEvents?: string;
  /** A class for the element that is moved to the point, around the content. */
  wrapperClass?: string;
  style?: CanvasStyle;
  class?: string;
}

const world = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

export const defaultCalculatePosition: CalculatePosition = (object, camera, size) => {
  world.setFromMatrixPosition(object.matrixWorld).project(camera);
  return [(world.x * 0.5 + 0.5) * size.width, (-world.y * 0.5 + 0.5) * size.height];
};

function isBehind(object: THREE.Object3D, camera: THREE.Camera): boolean {
  world.setFromMatrixPosition(object.matrixWorld);
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  const toObject = world.sub(cameraPosition);
  const facing = camera.getWorldDirection(cameraPosition);
  return toObject.angleTo(facing) > Math.PI / 2;
}

function scaleFor(object: THREE.Object3D, camera: Camera): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) return camera.zoom;
  world.setFromMatrixPosition(object.matrixWorld);
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  const vFov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
  const distance = world.distanceTo(cameraPosition);
  return 1 / (2 * Math.tan(vFov / 2) * distance);
}

function zIndexFor(object: THREE.Object3D, camera: THREE.Camera, range: [number, number]): number {
  if (
    !(camera as THREE.PerspectiveCamera).isPerspectiveCamera &&
    !(camera as THREE.OrthographicCamera).isOrthographicCamera
  ) {
    return range[0];
  }
  world.setFromMatrixPosition(object.matrixWorld);
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  const distance = world.distanceTo(cameraPosition);
  const near = (camera as THREE.PerspectiveCamera).near;
  const far = (camera as THREE.PerspectiveCamera).far;
  const t = Math.min(1, Math.max(0, (distance - near) / (far - near)));
  return Math.round(range[0] + (range[1] - range[0]) * t);
}

function elementOf(portal: HtmlProps["portal"]): HTMLElement | null {
  if (portal === undefined) return null;
  if ("current" in portal && !(portal instanceof HTMLElement)) return portal.current;
  return portal;
}

export function Html(props: Incoming<HtmlProps>): JSXElement {
  const state: RootState = useThree();
  const owner = getOwner();
  const group = createElement("group");
  for (const key of ["position", "rotation", "scale", "visible", "name"] as const) {
    const cell = props[key];
    if (cell === undefined) continue;
    createRenderEffect(
      () => cell(),
      (value) => {
        setProp(group, key, value);
      },
    );
  }

  const element = document.createElement("div");
  const content = document.createElement("div");
  element.appendChild(content);

  // The content is out of flow, so the element moved to the point has no box
  // of its own: only the content's box takes pointer events, and the canvas
  // keeps everything around it.
  element.style.cssText = "position:absolute;top:0;left:0;transform-origin:0 0;";
  createRenderEffect(
    () => props.wrapperClass?.(),
    (wrapperClass) => {
      if (wrapperClass === undefined) element.removeAttribute("class");
      else element.className = wrapperClass;
    },
  );
  createRenderEffect(
    () => ({
      style: props.style?.(),
      className: props.class?.(),
      center: props.center?.() === true,
      pointerEvents: props.pointerEvents?.(),
    }),
    ({ style, className, center, pointerEvents }) => {
      content.style.cssText =
        "position:absolute;" +
        (center ? "transform:translate3d(-50%,-50%,0);" : "") +
        (pointerEvents === undefined ? "" : `pointer-events:${pointerEvents};`);
      if (typeof style === "string") {
        content.style.cssText += style;
      } else if (style !== undefined) {
        for (const key in style) {
          const value = (style as Record<string, unknown>)[key];
          const name = key.includes("-")
            ? key
            : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
          content.style.setProperty(name, typeof value === "number" ? `${value}px` : String(value));
        }
      }
      if (className === undefined) content.removeAttribute("class");
      else content.className = className;
    },
  );

  const disposeContent = renderDocument(() => props.children as unknown as JSXElement, content, {
    owner,
  });

  let placedIn: Node | null = null;
  let last = "";
  const place = (): void => {
    const object = group.object as THREE.Object3D | null;
    const gl = state.gl as { domElement?: HTMLElement } | null;
    if (object === null || gl === null) return;
    if (placedIn === null) {
      const target =
        elementOf(untrack(() => props.portal?.())) ?? gl.domElement?.parentNode ?? null;
      if (target === null) return;
      placedIn = target;
      if (untrack(() => props.prepend?.()) === true)
        target.insertBefore(element, target.firstChild);
      else target.appendChild(element);
    }
    const camera = state.camera;
    object.updateWorldMatrix(true, false);
    const visible = object.visible && !isBehind(object, camera);
    const calculate = untrack(() => props.calculatePosition?.()) ?? defaultCalculatePosition;
    const [x, y] = calculate(object, camera, state.size);
    const factor = untrack(() => props.distanceFactor?.());
    const scale = factor === undefined ? 1 : scaleFor(object, camera) * factor;
    const range = untrack(() => props.zIndexRange?.()) ?? [16777271, 0];
    const next = `${visible}|${x}|${y}|${scale}`;
    if (next === last) return;
    last = next;
    element.style.display = visible ? "block" : "none";
    element.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    element.style.zIndex = String(zIndexFor(object, camera, range));
  };
  const stop = addAfterEffect(place);
  queueMicrotask(place);

  onCleanup(() => {
    stop();
    disposeContent();
    element.remove();
  });

  return group;
}
