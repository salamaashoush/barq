/**
 * `@barqjs/three/renderer`: the module the compiler imports from in a file,
 * or the part of a file, compiled for this renderer. It is what
 * `createRenderer` returns over three's node operations, and nothing else, so
 * a scene's compiled code pulls in neither `<Canvas>` nor the document.
 */

export {
  Portal,
  boundary,
  branch,
  createElement,
  createTextNode,
  dynamic,
  each,
  insert,
  insertNode,
  island,
  portal,
  reveal,
  setProp,
  spread,
} from "./renderer.ts";
