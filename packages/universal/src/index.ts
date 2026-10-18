/**
 * `@barqjs/universal`: barq on a host other than the document. A renderer
 * module calls `createRenderer` with the host's node operations once and
 * exports what it returns; the compiler, given that module as `moduleSource`
 * and `target: "universal"`, builds every element through it.
 *
 * ```ts
 * export const {
 *   render, createElement, createTextNode, insertNode, setProp, insert, spread,
 *   branch, each, boundary, island, reveal, portal, dynamic, Portal,
 * } = createRenderer(ops);
 * ```
 */

export {
  createRenderer,
  type DynamicTag,
  type HostOps,
  type PortalProps,
  type RenderOptions,
  type Renderer,
  type Spreadable,
} from "./renderer.ts";
