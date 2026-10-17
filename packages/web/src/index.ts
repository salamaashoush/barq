/**
 * `@barqjs/web`: barq's renderer for a document. `render` and `hydrate`, the
 * runtime compiled JSX calls, the components that need a document, the head,
 * the request API and the JSX types. Reactivity, components and control flow
 * are `@barqjs/core`'s.
 */

export { isClient, isServer } from "#env";

export {
  getRequestEvent,
  getTraceContext,
  httpHeader,
  httpStatus,
  type RequestEvent,
  type RequestEventLocals,
  type ResponseStub,
} from "./request-event.ts";

export type { TraceContext } from "./trace-context.ts";

export { useHead, type HeadInput, type HeadTag, type HeadTagName } from "./head.ts";

// Claim-based hydration. The two walk helpers are emitted ONLY by a
// `hydratable` compile — the index must cost nothing on the client-render path,
// which is the diff between the two emissions — and with the flag off neither
// name appears in a module.
export { child, sib, hole, shellReady } from "./hydration.ts";
export {
  hydrating as isHydrating,
  onHydrationEnd,
  type HydrationReport,
  type Mismatch,
  type MismatchKind,
} from "@barqjs/core/internal";

export {
  element,
  render,
  hydrate,
  type HydrateOptions,
  type MountOptions,
  type MountTarget,
  template,
  insert,
  setProp,
  // The resolved channels. The compiler picks one at compile time from
  // `NameFlags` plus the namespace, so no name is classified at run time.
  setAttr,
  setDomProp,
  setLive,
  setClass,
  setStyle,
  setHtml,
  setRef,
  bindProp,
  readOpaque,
  readKeys,
  bindValue,
  bindEvent,
  bindChannelOf,
  ref,
  formAction,
  listen,
  delegate,
  spread,
  delegateEvents,
  classToString,
  type Channel,
  // The SSR string backend's brand. It is read on the CLIENT too: a module that
  // fell back to this backend renders a string-compiled component's markup
  // through it.
  isSsrHtml,
} from "./dom.ts";

// The two halves of a form write, exported because they are a CHANNEL and not
// an internal: `setLive` and every author-written directive that touches a
// user-mutable property need the same compare and the same caret restore, and a
// second implementation of either is how the two would drift.
export { writeLive, coerceLive, holdsLive, captureCaret, restoreCaret } from "./forms.ts";

// `@barqjs/core`'s control flow over the document, in the shape compiled code
// calls it.
export { branch, each, boundary, island, portal, reveal } from "./dom-flow.ts";

export { Portal } from "./dom-components.ts";
// Solid 2.0's `clientOnly`, from `@solidjs/web`. The server backend calls the
// string half in `@barqjs/server` instead, which never starts the import.
export { clientOnly } from "./dom-components.ts";
// Solid 2.0's factory for a component chosen at run time, from `@solidjs/web`.
export { dynamic } from "./dom-components.ts";
export type {
  PortalProps,
  DynamicComponent,
  DynamicProps,
  DynamicTag,
  ClientOnlyComponent,
} from "./dom-components.ts";

// JSX — the TYPES stay whole; `jsx`/`jsxs`/`jsxDEV` are gone. Bun's JSX
// transform cannot produce scope-taking Blocks, so an un-compiled authoring
// path could not have the same semantics and there is no point shipping one.
export type { JSX, ComponentProps, ValidComponent, IntrinsicElementProps } from "./jsx-runtime.ts";
