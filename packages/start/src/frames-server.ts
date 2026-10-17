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

import type { HeadTag } from "@barqjs/web";
import { block, childScope, getOwner, runWithOwner, untrack } from "@barqjs/core";
import { SSR_HTML_BRAND, setHeadSink } from "@barqjs/web/internal";
import { setHydratable } from "@barqjs/core/internal";
import { SlotValue, esc, html, renderFrame, setServerComponent } from "@barqjs/server";
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
  bindEntries,
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
  readonly [FRAME]: FrameRef & {
    readonly args: unknown;
    readonly component: ServerComponent;
    readonly markup: (options: { readonly session?: symbol }) => Promise<string>;
    /** Called through `live`: the page keeps it current over a connection. */
    live?: boolean;
  };
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
  // What the call was given, absent when it was given nothing: a function with
  // no validator refuses a `data` it did not declare, `null` included.
  const args = data === undefined ? undefined : encodeWire(data);
  const address = frameAddress(id, encodeWire(data ?? null));
  const state: ServerFrame[typeof FRAME] = {
    id,
    address,
    args,
    component,
    markup: (options) => renderMarkup(state, options),
  };
  const render = (props: Record<string, unknown>): unknown =>
    documentFrame(address, args, component, props, state.live === true);
  return Object.assign(render, { [FRAME]: state });
}

/** A value read from a slot argument: a Cell is called, anything else is the value. */
function valueOf(argument: unknown): unknown {
  return typeof argument === "function" ? untrack(argument as () => unknown) : argument;
}

/** What a slot call returns that is never one of its properties: the markup's own names. */
const NOT_A_PROPERTY = new Set(["t", "then", "toString", "toJSON", "valueOf", "constructor"]);

type Record_ = { -readonly [K in keyof SlotRecord]: SlotRecord[K] };

/** The page's fill for one occurrence, run once, and the scope it ran under. */
interface Filled {
  readonly result: unknown;
  readonly scope: ReturnType<typeof childScope>;
}

/**
 * The props a server component is rendered with: every name is a slot.
 *
 * A slot call is placed as markup, `<props.comment … />`, or read as data,
 * `props.row(args).done`, which makes it a binding slot. Which one is known
 * only once the component uses what the call returned, so the call answers
 * both: its markup when it is placed, a stand-in for each property read.
 *
 * `fills` are the page's own props, when the frame is written into the page:
 * each slot then holds what the browser would put there, for the first paint,
 * and a binding slot's stand-ins hold the fill's first values.
 */
class Slots {
  private readonly records: (Record_ | null)[] = [];
  readonly props: Record<string, unknown>;

  constructor(private readonly fills: Record<string, unknown> | null) {
    this.props = new Proxy(
      {},
      { get: (_, name) => (typeof name === "string" ? this.slot(name) : undefined) },
    );
  }

  private slot(name: string): unknown {
    if (name === "children") {
      const at = this.reserve();
      this.records[at] = { at, name, key: "" };
      return html(this.markup(at, this.fill(name, at, {}, undefined)));
    }
    return (args?: Record<string, unknown>): unknown => this.call(name, args);
  }

  /**
   * Taken before the region renders, so an occurrence inside it numbers after
   * this one, in document order.
   */
  private reserve(): number {
    this.records.push(null);
    return this.records.length - 1;
  }

  private call(name: string, args: Record<string, unknown> | undefined): unknown {
    const at = this.reserve();
    const values: Record<string, unknown> = {};
    let explicit = "";
    for (const [key, argument] of Object.entries(args ?? {})) {
      if (key === "children") continue;
      if (key === "$key") explicit = String(valueOf(argument));
      else values[key] = valueOf(argument);
    }
    const children = args?.children;
    const region = children === undefined ? undefined : esc(children);
    const record: Record_ = {
      at,
      name,
      key: explicit,
      ...(args === undefined ? {} : { args: encodeWire(values) }),
      ...(region === undefined ? {} : { region, hasRegion: true }),
    };
    this.records[at] = record;
    const filled = this.fill(name, at, values, region);
    let markup: string | null = null;
    const placed = (): string => {
      if (record.bind === true) throw readTwice(name);
      markup ??= this.markup(at, filled);
      return markup;
    };
    const standIns = new Map<string, SlotValue>();
    const read = (key: string): SlotValue => {
      if (markup !== null) throw readTwice(name);
      record.bind = true;
      let standIn = standIns.get(key);
      if (standIn === undefined) {
        const result = filled?.result;
        const known = typeof result === "object" && result !== null;
        const value = known
          ? runWithOwner(filled!.scope, () =>
              untrack(() => (result as Record<string, unknown>)[key]),
            )
          : undefined;
        standIn = new SlotValue(at, key, this.fills !== null && known, value);
        standIns.set(key, standIn);
      }
      return standIn;
    };
    return new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === SSR_HTML_BRAND) return record.bind !== true;
          if (key === "t") return placed();
          if (key === "toString") return placed;
          if (typeof key === "symbol" || NOT_A_PROPERTY.has(key)) return undefined;
          return read(key);
        },
        ownKeys: () => {
          throw new Error(
            `[barq] A server component spread what \`props.${name}()\` returned. A binding slot's properties are placed one position at a time, ` +
              "so the markup shows what the browser fills: name each one, as in `<li hidden={row.hidden}>`.",
          );
        },
      },
    );
  }

  private markup(at: number, filled: Filled | null): string {
    const content = filled === null ? "" : runWithOwner(filled.scope, () => esc(filled.result));
    return `<!--${slotOpen(at)}-->${content}<!--${slotClose(at)}-->`;
  }

  /**
   * The page's fill for a slot, run once for the first paint: its content for
   * a slot that is placed, its values for one read as data. Nothing over the
   * wire, where the browser fills every slot itself.
   */
  private fill(
    name: string,
    at: number,
    values: Record<string, unknown>,
    region: string | undefined,
  ): Filled | null {
    if (this.fills === null) return null;
    const given = this.fills[name];
    // The page's own content, which the browser claims, under a scope that
    // hydrates again inside the server component's.
    const scope = childScope(getOwner(), "branch");
    setHydratable(scope, true);
    setServerComponent(scope, false);
    if (name === "children") return { result: given, scope };
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) props[key] = (): unknown => value;
    if (region !== undefined) props.children = block(() => html(regionMarkup(String(at), region)));
    // A fill that takes nothing reaches the props as the Cell it is, so reading
    // the prop is calling it.
    const result = runWithOwner(scope, () => {
      const fill = valueOf(given);
      return typeof fill === "function" ? (fill as ServerComponent)(props) : fill;
    });
    return result === undefined ? null : { result, scope };
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
    for (const found of markup.matchAll(/ _b-[^\s=>]+="([^"]*)"/g)) {
      for (const entry of bindEntries(found[1])) present.add(entry.at);
    }
    for (const found of markup.matchAll(/<!--_b:(\d+):/g)) present.add(Number(found[1]));
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
        ...(record.bind === true
          ? { bind: true }
          : {
              ...(record.hasRegion === true ? { hasRegion: true } : {}),
              ...(inline || record.region === undefined ? {} : { region: record.region }),
            }),
      });
    }
    return out;
  }
}

function readTwice(name: string): Error {
  return new Error(
    `[barq] A server component both placed \`props.${name}()\` as markup and read it as data. ` +
      "A slot call is one or the other: place it, `<props." +
      name +
      " />`, for the browser's content, or read its properties, for a binding slot.",
  );
}

/** Render a server component: what renders under it may read binding slots. */
function asServerComponent<T>(render: () => T): T {
  const scope = childScope(getOwner(), "branch");
  setServerComponent(scope, true);
  return runWithOwner(scope, render);
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
  live: boolean,
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
  // Nothing the server component itself reads reaches the page's seed: the
  // browser never runs it, so a value seeded for it is one nothing claims.
  const scope = childScope(getOwner(), "branch");
  setHydratable(scope, false);
  setServerComponent(scope, true);
  let region: string;
  try {
    region = runWithOwner(scope, () => esc(component(slots.props)));
  } finally {
    setHeadSink(outer);
  }
  const payload: FramePayload = {
    v: FRAME_VERSION,
    args,
    ...(live ? { live: true } : {}),
    slots: slots.final(region, true),
    head,
  };
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

/**
 * A frame's markup over the wire: the region rendered on its own, its slots
 * empty. Rendered by the frame itself, so by the copy of this module that made
 * it: a host serving a built server through its own `serveBarq` answers the
 * call from another copy, whose renderer is not the one the component was
 * compiled against.
 */
export function frameMarkup(
  frame: ServerFrame,
  options: { readonly session?: symbol } = {},
): Promise<string> {
  return frame[FRAME].markup(options);
}

async function renderMarkup(
  frame: ServerFrame[typeof FRAME],
  options: { readonly session?: symbol },
): Promise<string> {
  const { address, args, component } = frame;
  const slots = new Slots(null);
  const rendered = await renderFrame(
    () => asServerComponent(() => component(slots.props)) as never,
    {
      renderId: `f${address.slice(address.lastIndexOf("#") + 1)}-`,
      session: options.session,
    },
  );
  const head = [...rendered.head];
  const css = collectRequestCss();
  if (css !== "") head.push({ tag: "style", props: { "data-frame-css": address }, children: css });
  const payload: FramePayload = {
    v: FRAME_VERSION,
    args,
    ...(frame.live === true ? { live: true } : {}),
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
