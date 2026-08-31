/**
 * `@barqjs/server` — everything the server needs, and the module the
 * compiler's SSR backend imports its helpers from.
 *
 * Two strategies live behind one entry point: `ssr.ts` is the
 * string backend a compiled module calls into, and `server.ts` is the
 * happy-dom path that renders anything still built as DOM — a hand-written
 * `createElement` tree, or a component from a module this compiler never saw.
 * `renderToString` accepts both.
 *
 * `branch`, `each`, `boundary`, `portal` and `COUNT` — and `props`, `cell` and
 * `block` with them — are exported here under the names `@barqjs/core` exports
 * them under, with the same argument order: one ABI, two implementations. The
 * compiler emits the same call for both backends and
 * chooses between them by choosing this source, which is why a string-compiled
 * module imports from here and from nowhere else.
 */

export {
  SsrHtml,
  attr,
  attrIntercepts,
  attrLit,
  boundary,
  branch,
  cls,
  clsList,
  content,
  dynamic,
  each,
  esc,
  escAttr,
  escapeAttribute,
  escapeText,
  formAttr,
  html,
  isSsrHtml,
  island,
  portal,
  raw,
  reveal,
  rawText,
  spreadAttrs,
  ssrDynamic,
  ssrErrored,
  ssrFor,
  ssrLoading,
  ssrMatch,
  ssrIsland,
  ssrPortal,
  ssrRepeat,
  ssrReveal,
  ssrShow,
  ssrSwitch,
} from "./ssr.ts";

export { COUNT } from "@barqjs/core";
export { cell, props } from "@barqjs/core";
export { block, readSlot } from "@barqjs/core";

export {
  clearRenderData,
  generateHydrationScript,
  getRenderData,
  renderPage,
  type RootRender,
  renderToStream,
  renderToString,
  renderToStringAsync,
  settle,
} from "./server.ts";
