/**
 * `@barqjs/web/internal` — the parts of the document renderer `@barqjs/server`
 * and `@barqjs/start` share with it and no application calls.
 *
 * Every name here is imported by one of those two. Adding one that neither
 * imports makes this a second public surface by accident.
 */

export { SSR_HTML_BRAND, styleToString } from "./dom.ts";

export { headKey, setHeadSink } from "./head.ts";

export { type Range, withRange } from "./hydration.ts";

export {
  COMPOSED_BODY_FRAMING,
  commitEventResponse,
  commitResponseStub,
  createRequestEvent,
  createResponseStub,
  foldResponseStub,
  freezeDeclarations,
  getExpectedRedirectStatus,
  isNavigable,
} from "./request-event.ts";

export { mergeServerTiming, traceForEvent, traceMetaMarkup } from "./trace-context.ts";
