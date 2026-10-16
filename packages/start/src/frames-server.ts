/**
 * The server half of frames: what a server function's component result becomes,
 * rendered two ways.
 *
 * In the document, where a route renders it with the page's own props, the
 * frame is written inline and each slot holds the browser's content rendered
 * here for the first paint. Over the wire, answering a call from the browser,
 * the region is rendered on its own and its slots are left empty for the
 * browser to fill. Both write the markup `frames.ts` describes.
 */

import type { HeadTag } from "@barqjs/core";
import { block, untrack } from "@barqjs/core";
import { setHeadSink } from "@barqjs/core/internal";
import { esc, html, renderFrame } from "@barqjs/server";
import {
  encodeWire,
  registerSerializationAdapters,
  serializationAdapters,
} from "@barqjs/server/codec";

import { collectRequestCss } from "./context.ts";
import {
  FRAME,
  FRAME_CLOSE,
  FLIGHT_TYPE,
  FRAMES_BUDGET,
  FRAME_VERSION,
  type FramePayload,
  RPC_FLIGHT,
  type FrameRef,
  RPC_FRAME,
  type SlotRecord,
  frameAddress,
  frameOpen,
  isFrame,
  regionMarkup,
  slotClose,
  slotOpen,
} from "./frames.ts";

/** A server component: what a frame-answering handler returns. */
type ServerComponent = (props: Record<string, unknown>) => unknown;

/** What a server function returns in place of its handler's component. */
export interface ServerFrame {
  (props: Record<string, unknown>): unknown;
  readonly [FRAME]: FrameRef & { readonly args: unknown; readonly component: ServerComponent };
}

/**
 * How a frame crosses inside the page's own seed: by address, as a reference
 * the browser resolves to the region already on the page. Registered when a
 * frame is made and the registry does not hold it, so an application that has
 * none sends the bytes it always did.
 */
const FRAME_ADAPTER = {
  key: "barq.frame",
  test: isFrame,
  toSerializable: (frame: ServerFrame): FrameRef => ({
    id: frame[FRAME].id,
    address: frame[FRAME].address,
  }),
  fromSerializable: (ref: FrameRef): FrameRef => ref,
};

function registerFrameAdapter(): void {
  if (serializationAdapters().some((adapter) => adapter.key === FRAME_ADAPTER.key)) return;
  registerSerializationAdapters([FRAME_ADAPTER]);
}

/** The server function's component result, as a frame. */
export function serverFrame(id: string, data: unknown, component: ServerComponent): ServerFrame {
  registerFrameAdapter();
  const args = encodeWire(data ?? null);
  const address = frameAddress(id, args);
  const render = (props: Record<string, unknown>): unknown =>
    documentFrame(address, args, component, props);
  return Object.assign(render, { [FRAME]: { id, address, args, component } });
}

/** A value read from a slot argument: a Cell is called, anything else is the value. */
function valueOf(argument: unknown): unknown {
  return typeof argument === "function" ? untrack(argument as () => unknown) : argument;
}

/**
 * The props a server component is rendered with: every name is a slot.
 *
 * `fills` are the page's own props, when the frame is written into the page:
 * each slot then holds what the browser would put there, for the first paint.
 */
class Slots {
  private readonly records: (SlotRecord | null)[] = [];
  readonly props: Record<string, unknown>;

  constructor(private readonly fills: Record<string, unknown> | null) {
    this.props = new Proxy(
      {},
      { get: (_, name) => (typeof name === "string" ? this.slot(name) : undefined) },
    );
  }

  private slot(name: string): unknown {
    if (name === "children") return html(this.occurrence("children", undefined));
    return (args?: Record<string, unknown>): unknown => html(this.occurrence(name, args));
  }

  private occurrence(name: string, args: Record<string, unknown> | undefined): string {
    // Taken before the region renders, so an occurrence inside it numbers
    // after this one, in document order.
    const at = this.records.length;
    this.records.push(null);
    const values: Record<string, unknown> = {};
    let explicit = "";
    for (const [key, argument] of Object.entries(args ?? {})) {
      if (key === "children") continue;
      if (key === "$key") explicit = String(valueOf(argument));
      else values[key] = valueOf(argument);
    }
    const children = args?.children;
    const region = children === undefined ? undefined : esc(children);
    this.records[at] = {
      at,
      name,
      key: explicit,
      ...(args === undefined ? {} : { args: encodeWire(values) }),
      ...(region === undefined ? {} : { region, hasRegion: true }),
    };
    return `<!--${slotOpen(at)}-->${this.filled(name, at, values, region)}<!--${slotClose(at)}-->`;
  }

  /** The page's content for a slot, rendered for the first paint, or nothing over the wire. */
  private filled(
    name: string,
    at: number,
    values: Record<string, unknown>,
    region: string | undefined,
  ): string {
    if (this.fills === null) return "";
    const given = this.fills[name];
    if (name === "children") return esc(given);
    const fill = valueOf(given);
    if (typeof fill !== "function") return "";
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) props[key] = (): unknown => value;
    if (region !== undefined) props.children = block(() => html(regionMarkup(String(at), region)));
    return esc((fill as ServerComponent)(props));
  }

  /**
   * The records the markup still carries, keyed: a boundary resumed during the
   * render built its slots again, so only the occurrences in the final markup
   * count, and a positional key is taken in that markup's order. `inline`
   * drops each region, which the page already carries inside the slot.
   */
  final(markup: string, inline: boolean): SlotRecord[] {
    const present = new Set<number>();
    for (const found of markup.matchAll(/<!--s:(\d+)-->/g)) present.add(Number(found[1]));
    const ordinal = new Map<string, number>();
    const out: SlotRecord[] = [];
    for (const record of this.records) {
      if (record === null || !present.has(record.at)) continue;
      const count = ordinal.get(record.name) ?? 0;
      ordinal.set(record.name, count + 1);
      out.push({
        at: record.at,
        name: record.name,
        key: record.key === "" ? `${record.name}:${count}` : `$${record.key}`,
        ...(record.args === undefined ? {} : { args: record.args }),
        ...(record.hasRegion === true ? { hasRegion: true } : {}),
        ...(inline || record.region === undefined ? {} : { region: record.region }),
      });
    }
    return out;
  }
}

/**
 * The frame written into the page, where a route renders it.
 *
 * What the component declares for the head goes to the page's head as any
 * component's does, and is recorded too, so the browser takes those tags over
 * with the frame and drops them with it.
 */
function documentFrame(
  address: string,
  args: unknown,
  component: ServerComponent,
  fills: Record<string, unknown>,
): unknown {
  const slots = new Slots(fills);
  const head: HeadTag[] = [];
  let outer: ReturnType<typeof setHeadSink> = null;
  outer = setHeadSink({
    add: (tags) => {
      head.push(...tags);
      outer?.add(tags);
    },
    module: (url) => outer?.module?.(url),
  });
  let region: string;
  try {
    region = esc(component(slots.props));
  } finally {
    setHeadSink(outer);
  }
  const payload: FramePayload = { v: FRAME_VERSION, args, slots: slots.final(region, true), head };
  return html(frameOpen(address, payload) + region + FRAME_CLOSE);
}

/**
 * The answer to a call from the browser: the region rendered on its own, its
 * slots empty. Its head carries what the region declared, the stylesheets and
 * chunks its `lazy()` modules need, and the rules `@barqjs/css` registered
 * while it rendered.
 */
export async function frameResponse(frame: ServerFrame): Promise<Response> {
  const answer = new Response(await frameMarkup(frame));
  answer.headers.set("content-type", "text/html; charset=utf-8");
  answer.headers.set("cache-control", "no-store");
  answer.headers.set("x-barq-rpc", RPC_FRAME);
  return answer;
}

/** A frame's markup over the wire: the region rendered on its own, its slots empty. */
export async function frameMarkup(frame: ServerFrame): Promise<string> {
  const { address, args, component } = frame[FRAME];
  const slots = new Slots(null);
  const rendered = await renderFrame(() => component(slots.props) as never, {
    renderId: `f${address.slice(address.lastIndexOf("#") + 1)}-`,
  });
  const head = [...rendered.head];
  const css = collectRequestCss();
  if (css !== "") head.push({ tag: "style", props: { "data-frame-css": address }, children: css });
  const payload: FramePayload = {
    v: FRAME_VERSION,
    args,
    slots: slots.final(rendered.html, false),
    head,
  };
  return frameOpen(address, payload) + rendered.html + FRAME_CLOSE;
}

/** A frame the page says it has mounted, from the request's `x-barq-frames`. */
export interface MountedFrame {
  readonly id: string;
  readonly args: unknown;
}

/**
 * The frames a request says its page has mounted. Untrusted input like any
 * other: each one is asked for through its own function, validator and
 * middleware included, and a malformed list is no list.
 */
export function mountedFrames(header: string | null): MountedFrame[] {
  if (header === null || header === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: MountedFrame[] = [];
  for (const entry of parsed.slice(0, FRAMES_BUDGET)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, args } = entry as { id?: unknown; args?: unknown };
    if (typeof id === "string") out.push({ id, args });
  }
  return out;
}

/**
 * A mutation's answer with the regions it changed: its value in a script, then
 * each changed frame's markup, as the page applies them. `ask` calls a mounted
 * frame's server function again with the arguments the page sent.
 */
export async function flightResponse(
  value: unknown,
  mounted: readonly MountedFrame[],
  invalidated: ReadonlySet<string>,
  ask: (frame: MountedFrame) => Promise<unknown>,
): Promise<Response> {
  const seen = new Set<string>();
  let regions = "";
  for (const frame of mounted) {
    if (!invalidated.has(frame.id)) continue;
    const answered = await ask(frame);
    if (!isFrame(answered)) continue;
    const { address } = (answered as ServerFrame)[FRAME];
    if (seen.has(address)) continue;
    seen.add(address);
    regions += await frameMarkup(answered as ServerFrame);
  }
  const script = `<script type="${FLIGHT_TYPE}">${JSON.stringify(encodeWire(value)).replaceAll("<", "\\u003c")}</script>`;
  const answer = new Response(script + regions);
  answer.headers.set("content-type", "text/html; charset=utf-8");
  answer.headers.set("cache-control", "no-store");
  answer.headers.set("x-barq-rpc", RPC_FLIGHT);
  return answer;
}
