/**
 * Frames: a region of server-rendered markup the browser can ask for again and
 * apply in place, Solid 2.0's partial rendering.
 *
 * A frame is what a server function returns when its handler returns a
 * component. The component runs on the server only; what crosses is its
 * markup. The props it is rendered with are SLOTS, positions it marks and the
 * browser fills: `props.children`, and a call such as
 * `props.comment({ cid })`, whose arguments cross as data and whose own
 * children cross as a nested region of server markup.
 *
 * This module is the wire both halves agree on, and nothing else.
 *
 * THE WIRE. A frame is its markup:
 *
 * ```html
 * <barq-frame data-frame="<address>"><script type="application/barq-frame">
 *   { "v": 1, "slots": [...], "head": [...] }
 * </script> ...region... <!--s:0--> ...a slot's content... <!--/s:0--> ...</barq-frame>
 * ```
 *
 * The page carries it inline where a route rendered it, and a server-function
 * response carries the same bytes as its body under `x-barq-rpc: frame`. The
 * payload holds what the browser needs to fill the slots and nothing the
 * markup already says, so no piece of content arrives twice.
 */

import type { Child, HeadTag, Incoming, JSXElement } from "@barqjs/core";

/**
 * A slot on a server component's props: a call the browser answers with its
 * own content. What the call is given crosses as data, and its `children` as a
 * region of server markup. `$key` names the occurrence, so its content follows
 * it across updates rather than its position.
 */
export type Slot<P extends object = {}> = (
  props: Incoming<P & { readonly $key?: string | number; readonly children?: Child }>,
) => JSXElement;

/** The brand on a frame, on either side, carrying where it lives. */
export const FRAME: unique symbol = Symbol.for("barq.frame") as never;

/** How a frame is named across the wire: its server function and its address. */
export interface FrameRef {
  readonly id: string;
  readonly address: string;
}

/** Whether a value is a frame: a server function's component result, on either side. */
export function isFrame(value: unknown): boolean {
  return (
    typeof value === "function" &&
    (value as unknown as Record<symbol, unknown>)[FRAME] !== undefined
  );
}

/**
 * How a server function's component result becomes a frame, installed by
 * `@barqjs/start/server`: on the global, because a server bundle and the host
 * serving it each carry a copy of this module, and the copy that defines a
 * server function is not always the one that imported the server half.
 */
const MAKE = Symbol.for("barq.frames.make");

type MakeFrame = (id: string, data: unknown, component: (props: never) => unknown) => unknown;

export function installFrames(make: MakeFrame): void {
  (globalThis as { [MAKE]?: MakeFrame })[MAKE] = make;
}

/** The handler's result, a frame when it is a component and the server half is here. */
export function asFrame(id: string, data: unknown, result: unknown): unknown {
  const make = (globalThis as { [MAKE]?: MakeFrame })[MAKE];
  if (make === undefined || typeof result !== "function" || isFrame(result)) return result;
  return make(id, data, result as (props: never) => unknown);
}

/** The element a frame's markup stands in. `display: contents`, so it takes no box. */
export const FRAME_TAG = "barq-frame";

/** The element a nested region of server markup stands in, inside a slot's content. */
export const REGION_TAG = "barq-region";

/** The `type` of the script that carries a frame's payload. Not JavaScript, so never run. */
export const PAYLOAD_TYPE = "application/barq-frame";

/** The `x-barq-rpc` value a frame response carries. */
export const RPC_FRAME = "frame";

/** Dispatched on `document` once a frame update has been applied to the page. */
export const FRAME_APPLIED_EVENT = "barq:frame-applied";

/** The wire format's version: a browser reading a newer one fetches the page whole. */
export const FRAME_VERSION = 1;

/**
 * One slot the server component marked: where it stands, by the index in its
 * markers, and what the browser needs to fill it.
 */
export interface SlotRecord {
  /** The index in the slot's markers, `<!--s:N-->` and `<!--/s:N-->`. */
  readonly at: number;
  /** The prop the component read: `children`, or the name it called. */
  readonly name: string;
  /**
   * The occurrence's identity across updates: `$key` when the call named one,
   * and its name and position among the calls of that name otherwise.
   */
  readonly key: string;
  /** The call's arguments, wire-encoded, its `children` aside. */
  readonly args?: unknown;
  /**
   * The call's `children`, as server markup: the nested region. Absent when
   * the page already carries it, inside the slot's content.
   */
  readonly region?: string;
  /** Whether the call passed `children` at all. */
  readonly hasRegion?: boolean;
}

/** What a frame's script carries. */
export interface FramePayload {
  readonly v: number;
  readonly slots: readonly SlotRecord[];
  /** What the region declared for the head, and the assets it needs. */
  readonly head: readonly HeadTag[];
}

export function slotOpen(at: number): string {
  return `s:${at}`;
}

export function slotClose(at: number): string {
  return `/s:${at}`;
}

/** The marker index a comment's data names, or `-1` when it is not a slot's opening marker. */
export function slotIndex(data: string): number {
  return data.startsWith("s:") ? Number(data.slice(2)) : -1;
}

/** The marker index a comment's data names, or `-1` when it is not a slot's closing marker. */
export function slotEnd(data: string): number {
  return data.startsWith("/s:") ? Number(data.slice(3)) : -1;
}

/**
 * A string of 32-bit FNV-1a, in base 36: short enough to be an attribute,
 * stable across processes, which a frame's address has to be.
 */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Where a frame lives: the server function and what it was called with. One
 * address is one region, so asking for it again updates that region rather
 * than mounting a second one, and an answer for other arguments is another.
 */
export function frameAddress(id: string, wireArgs: unknown): string {
  return `${id}#${digest(JSON.stringify(wireArgs ?? null))}`;
}

/** The payload as the text of its script: `<` escaped, so no string in it can end the element. */
export function payloadText(payload: FramePayload): string {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

/** The opening of a frame's markup, the payload's script included. */
export function frameOpen(address: string, payload: FramePayload): string {
  const attribute = address
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return (
    `<${FRAME_TAG} data-frame="${attribute}" style="display:contents">` +
    `<script type="${PAYLOAD_TYPE}">${payloadText(payload)}</script>`
  );
}

export const FRAME_CLOSE = `</${FRAME_TAG}>`;

export function regionMarkup(key: string, html: string): string {
  const attribute = key.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<${REGION_TAG} data-region="${attribute}" style="display:contents">${html}</${REGION_TAG}>`;
}
