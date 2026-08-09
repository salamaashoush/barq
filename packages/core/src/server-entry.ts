/**
 * `@barqjs/core/server` — everything the server needs, and the module the
 * compiler's SSR backend imports its helpers from.
 *
 * Two strategies live behind one entry point (DESIGN §5): `ssr.ts` is the
 * string backend a compiled module calls into, and `server.ts` is the
 * happy-dom path that renders anything still built as DOM — including a
 * module that fell back for one of the eight non-inlinable flow components.
 * `renderToString` accepts both.
 */

export {
  SsrHtml,
  attr,
  attrIntercepts,
  attrLit,
  cls,
  clsList,
  content,
  esc,
  escAttr,
  escapeAttribute,
  escapeText,
  html,
  isSsrHtml,
  raw,
  rawText,
  spreadAttrs,
  ssrFor,
  ssrIndex,
  ssrMatch,
  ssrRepeat,
  ssrShow,
  ssrSwitch,
} from "./ssr.ts";

export {
  clearRenderData,
  generateHydrationScript,
  getRenderData,
  renderPage,
  renderToString,
  renderToStringAsync,
  settle,
} from "./server.ts";
