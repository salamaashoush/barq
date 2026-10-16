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
 * module imports from here and from nowhere else. `dynamic` is the same
 * arrangement for an import the author writes: the server backend calls this
 * one where the source calls `@barqjs/core`'s.
 */

export {
  SsrHtml,
  SlotValue,
  attr,
  attrIntercepts,
  attrLit,
  bindAttr,
  boundary,
  branch,
  clientOnly,
  cls,
  content,
  dynamic,
  resolveDynamic,
  each,
  esc,
  escAttr,
  escapeAttribute,
  escapeText,
  formAttr,
  html,
  isSlotValue,
  isSsrHtml,
  island,
  portal,
  raw,
  reveal,
  rawText,
  setServerComponent,
  spreadAttrs,
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

export { HEAD_SNIPPET, applyHeadPatch } from "#swap";

export { COUNT } from "@barqjs/core";
export { cell, props } from "@barqjs/core";
export { block, readSlot } from "@barqjs/core";

export {
  getRequestEvent,
  getTraceContext,
  httpHeader,
  httpStatus,
  isSafeError,
  markSafeError,
  type RequestEvent,
  type RequestEventLocals,
  type ResponseStub,
  type TraceContext,
} from "@barqjs/core";

export {
  commitEventResponse,
  commitResponseStub,
  createRequestEvent,
  createResponseStub,
  getExpectedRedirectStatus,
} from "@barqjs/core/internal";

export {
  type FetchMiddleware,
  type SSRResponseOptions,
  composeMiddleware,
  createSSRResponse,
} from "./http.ts";

export {
  type AssetManifest,
  type CSPNonce,
  type ModuleAssets,
  type RenderToStreamOptions,
  type RenderToStreamResult,
  type RenderToStringOptions,
  type ServerErrorContext,
  type ServerErrorHook,
  type StreamOptions,
  HydrationScript,
  generateHydrationScript,
  renderPage,
  type RootRender,
  type RenderedFrame,
  renderFrame,
  renderToStream,
  renderToString,
  renderToStringAsync,
  settle,
} from "./server.ts";
