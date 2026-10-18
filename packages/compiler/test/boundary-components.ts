/**
 * Two boundary components for `boundary.test.ts`, written the way a renderer
 * package writes them: each returns its own node to the tree around it and
 * mounts its children in a root of the renderer they compiled for, owned by
 * the component, so the children are created where that root reads them.
 */

import { getOwner, onCleanup } from "@barqjs/core";
import { render as renderDocument } from "@barqjs/web";

import type { TestNode } from "../../universal/src/test-host.ts";
import { host, render } from "./universal-renderer.ts";

/** Every scene a `Canvas` mounted, in mount order. */
export const scenes: TestNode[] = [];
/** Every overlay an `Html` mounted, in mount order. */
export const overlays: HTMLElement[] = [];

/** A document element whose children build on the in-memory host. */
export function Canvas(props: { children?: unknown }): HTMLElement {
  const scene = host.root("scene");
  scenes.push(scene);
  onCleanup(render(() => props.children as never, scene, { owner: getOwner() }));
  const element = document.createElement("canvas");
  element.dataset.scene = String(scene.id);
  return element;
}

/** A host node whose children build in the document. */
export function Html(props: { children?: unknown }): TestNode {
  const overlay = document.createElement("div");
  overlays.push(overlay);
  onCleanup(renderDocument(() => props.children as never, overlay, { owner: getOwner() }));
  return host.ops.createElement("html");
}
