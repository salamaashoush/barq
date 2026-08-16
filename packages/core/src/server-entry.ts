/**
 * `@barqjs/core/server` — everything the server needs, and the module the
 * compiler's SSR backend imports its helpers from.
 *
 * Two strategies live behind one entry point (DESIGN §5): `ssr.ts` is the
 * string backend a compiled module calls into, and `server.ts` is the
 * happy-dom path that renders anything still built as DOM — a hand-written
 * `createElement` tree, or a component from a module this compiler never saw.
 * `renderToString` accepts both.
 *
 * `branch`, `each`, `boundary`, `portal` and `COUNT` — and `props`, `cell` and
 * `block` with them — are exported here under the names `@barqjs/core` exports
 * them under, with the same argument order: `CODESIGN.md` §3.11's one ABI, two
 * implementations. The compiler emits the same call for both backends and
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
  each,
  esc,
  escAttr,
  escapeAttribute,
  escapeText,
  html,
  isSsrHtml,
  portal,
  raw,
  rawText,
  spreadAttrs,
  ssrAwait,
  ssrDynamic,
  ssrErrorBoundary,
  ssrErrored,
  ssrFor,
  ssrLoading,
  ssrMatch,
  ssrPortal,
  ssrRepeat,
  ssrReveal,
  ssrShow,
  ssrSwitch,
} from "./ssr.ts";

export { COUNT } from "./flow.ts";
export { cell, props } from "./props.ts";
export { block } from "./signals.ts";

export {
  clearRenderData,
  generateHydrationScript,
  getRenderData,
  renderPage,
  renderToStream,
  renderToString,
  renderToStringAsync,
  settle,
} from "./server.ts";
