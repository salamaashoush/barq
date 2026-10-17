/**
 * The browser half of frames: the component a server function's frame answer
 * becomes, and the update that applies a new answer to every place it is
 * mounted without building any of the page again.
 *
 * One component per address. Asking for a frame again hands back the SAME
 * component, so a `dynamic` over it does not remount: the new markup is
 * morphed into the region where it stands. Server nodes are patched in place,
 * and a slot's content, which the browser owns, is kept, its arguments
 * updated, and moved only when the server moved it.
 */

import {
  type HeadTag,
  bindEvent,
  classToString,
  delegate,
  element,
  insert,
  isHydrating,
  onHydrationEnd,
  ref as bindRef,
  setClass,
  setProp,
  setStyle,
  useHead,
} from "@barqjs/web";
import {
  type Owner,
  block,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import { withoutClaim } from "@barqjs/core/internal";
import { type Range, withRange } from "@barqjs/web/internal";
import { type AnySerializationAdapter, decodeWire } from "@barqjs/server/codec";

import { ServerFnError } from "./fn-error.ts";
import { LIVE_CALL, type LiveRequest, type Stub, clientStub } from "./stubs.ts";
import {
  BIND_ATTRIBUTE,
  BIND_EVENT,
  BIND_TEXT_END,
  type BindEntry,
  FRAME,
  FRAME_APPLIED_EVENT,
  FRAME_TAG,
  FLIGHT_TYPE,
  FRAMES_BUDGET,
  FRAME_VERSION,
  type FramePayload,
  type FrameRef,
  PAYLOAD_TYPE,
  REGION_TAG,
  type SlotRecord,
  bindEntries,
  bindTextEntry,
  isFrame,
  slotClose,
  slotEnd,
  slotIndex,
  slotOpen,
} from "./frames.ts";

/** What a frame renders as: a component taking the slots' content as props. */
export type FrameComponent = ((props: Record<string, unknown>) => Node) & {
  readonly [FRAME]: FrameRef;
};

/** One slot's content, owned by the browser. */
interface Occurrence {
  readonly key: string;
  readonly name: string;
  readonly start: Comment;
  readonly end: Comment;
  readonly region: Element | null;
  readonly setArgs: (args: Record<string, unknown>) => void;
  readonly dispose: () => void;
}

/**
 * One binding slot occurrence: the page's fill, run once, and the positions of
 * the server's markup its properties fill, by the node that carries each and
 * the position's spelling.
 */
interface Binding {
  readonly name: string;
  readonly owner: Owner | null;
  readonly values: Record<string, unknown> | null;
  readonly setArgs: (args: Record<string, unknown>) => void;
  readonly dispose: () => void;
  readonly positions: Map<Node, Map<string, () => void>>;
}

/** One place a frame is mounted. */
interface Mount {
  readonly host: Element;
  /** The page is being claimed over this mount's server markup, slots included. */
  claiming: boolean;
  readonly owner: Owner | null;
  readonly props: Record<string, unknown>;
  readonly occurrences: Map<Comment, Occurrence>;
  /** The binding slot occurrences, by key. */
  bindings: Map<string, Binding>;
}

interface FrameState {
  readonly ref: FrameRef;
  payload: FramePayload | null;
  /** The region's markup as the last answer carried it, for a mount that has none on the page. */
  markup: string | null;
  readonly mounts: Set<Mount>;
  readonly head: () => readonly HeadTag[];
  readonly setHead: (head: readonly HeadTag[]) => void;
  readonly component: FrameComponent;
  /** The live connection the page opened for a frame it was served, while one is open. */
  connection: { readonly stop: () => void } | null;
}

const FRAMES = new Map<string, FrameState>();

/**
 * Keep a frame the page was served through `live` current: the connection a
 * `live` call in the browser would have opened, through the same stub and so
 * its client middleware, opened once the page has been claimed and closed
 * when the last place the frame is mounted goes.
 */
function connect(state: FrameState): void {
  if (state.connection !== null || state.payload?.live !== true) return;
  const stub = clientStub(state.ref.id) as Parameters<typeof liveIterable>[0] | undefined;
  if (stub === undefined) return;
  const options = {
    data: state.payload.args === undefined ? undefined : decodeWire(state.payload.args),
  };
  const iterator = liveIterable(stub, options)[Symbol.asyncIterator]();
  const connection = { stop: (): void => void iterator.return?.() };
  state.connection = connection;
  void (async () => {
    try {
      for (;;) if ((await iterator.next()).done === true) return;
    } catch (error) {
      console.error(
        `[barq] The live frame of ${JSON.stringify(state.ref.id)} could not stay connected, so it shows what it last received. The error:`,
        error,
      );
    } finally {
      if (state.connection === connection) state.connection = null;
    }
  })();
}

function stateFor(ref: FrameRef): FrameState {
  const known = FRAMES.get(ref.address);
  if (known !== undefined) return known;
  const [head, setHead] = createSignal<readonly HeadTag[]>([], { ownedWrite: true });
  const state: FrameState = {
    ref,
    payload: null,
    markup: null,
    mounts: new Set(),
    head,
    setHead,
    component: null as never,
    connection: null,
  };
  const component = (props: Record<string, unknown>): Node => mount(state, props);
  (state as { component: FrameComponent }).component = Object.assign(component, { [FRAME]: ref });
  FRAMES.set(ref.address, state);
  return state;
}

/**
 * How a frame named in the page's seed becomes the component for the region
 * the page already carries. The client entry installs it beside the
 * application's own adapters, before the seed is read.
 */
export const frameAdapter: AnySerializationAdapter = {
  key: "barq.frame",
  test: isFrame,
  toSerializable: (frame: FrameComponent): FrameRef => ({
    id: frame[FRAME].id,
    address: frame[FRAME].address,
  }),
  fromSerializable: (ref: FrameRef): FrameComponent => stateFor(ref).component,
};

function payloadOf(host: Element): FramePayload | null {
  const script = host.firstElementChild;
  if (script === null || script.localName !== "script") return null;
  if (script.getAttribute("type") !== PAYLOAD_TYPE) return null;
  const text = script.textContent ?? "";
  return text === "" ? null : (JSON.parse(text) as FramePayload);
}

/** The frame's own script, which the morph leaves to `setPayload`. */
function isPayload(node: Node | null): node is Element {
  return (
    node !== null &&
    node.nodeType === 1 &&
    (node as Element).localName === "script" &&
    (node as Element).getAttribute("type") === PAYLOAD_TYPE
  );
}

function setPayload(host: Element, payload: FramePayload): void {
  const script = host.firstElementChild;
  if (script !== null && isPayload(script)) script.textContent = JSON.stringify(payload);
}

function recordAt(payload: FramePayload, at: number): SlotRecord | undefined {
  return payload.slots.find((record) => record.at === at);
}

/** The comment that closes the slot `start` opens, among its siblings. */
function closeOf(start: Comment): Comment | null {
  const at = slotIndex(start.data);
  for (let node = start.nextSibling; node !== null; node = node.nextSibling) {
    if (node.nodeType === 8 && slotEnd((node as Comment).data) === at) return node as Comment;
  }
  return null;
}

function between(start: Node, end: Node): Node[] {
  const out: Node[] = [];
  for (let node = start.nextSibling; node !== null && node !== end; node = node.nextSibling) {
    out.push(node);
  }
  return out;
}

/** Every slot opening in `root` that no occurrence owns yet, in document order. */
function unfilled(root: Element, owned: Map<Comment, Occurrence>): Comment | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const comment = node as Comment;
    if (slotIndex(comment.data) !== -1 && !owned.has(comment)) return comment;
  }
  return null;
}

function regionElement(key: string, markup: string): Element {
  const region = document.createElement(REGION_TAG);
  region.setAttribute("data-region", key);
  region.setAttribute("style", "display:contents");
  region.innerHTML = markup;
  return region;
}

/**
 * Fill one slot: the page's `children` where the server placed them, or the
 * page's function for a named slot called with the occurrence's arguments.
 *
 * While the page is being claimed, the server's content for the slot is
 * CLAIMED: the fill runs over a cursor on the slot's range, as the content of
 * any other hole does, and takes the nodes the server wrote for it. Otherwise
 * the slot is empty and the fill builds into it. A nested region the server
 * wrote is handed to the fill as its children either way.
 */
function fill(site: Mount, start: Comment, record: SlotRecord): Occurrence | null {
  const end = closeOf(start);
  if (end === null) return null;
  const parent = end.parentNode;
  if (parent === null) return null;
  const served = between(start, end);
  const claiming = site.claiming && served.length > 0;
  let region: Element | null = null;
  if (record.hasRegion === true) {
    for (const node of served) {
      const found =
        node.nodeType === 1 && (node as Element).localName === REGION_TAG
          ? (node as Element)
          : node.nodeType === 1
            ? (node as Element).querySelector(REGION_TAG)
            : null;
      if (found !== null) {
        region = found;
        break;
      }
    }
    if (!claiming) region?.remove();
    region ??= regionElement(String(record.at), record.region ?? "");
  }
  if (!claiming) for (const node of served) node.parentNode?.removeChild(node);
  const [args, setArgs] = createSignal<Record<string, unknown>>(
    record.args === undefined ? {} : decodeWire(record.args),
    { ownedWrite: true },
  );
  const given = site.props[record.name];
  const content = (): unknown => {
    if (record.name === "children") return given;
    // A fill that takes nothing reaches the props as the Cell it is, so reading
    // the prop is calling it.
    const fn = typeof given === "function" ? untrack(given as () => unknown) : given;
    if (typeof fn !== "function") return fn ?? null;
    const props: Record<string, unknown> = {};
    for (const key of Object.keys(untrack(args))) props[key] = (): unknown => args()[key];
    if (region !== null) {
      const placed = region;
      props.children = block(() => placed);
    }
    return untrack(() => (fn as (props: Record<string, unknown>) => unknown)(props));
  };
  const range: Range = { open: start, close: end, parent, nodes: served };
  const dispose = claiming
    ? runWithOwner(site.owner, () =>
        createRoot((release) => {
          withRange(range, () => {
            const value = content();
            // A Block is called with the scope it builds under, as `insert` calls one.
            return typeof value === "function"
              ? (value as (scope: unknown) => unknown)(getOwner())
              : value;
          });
          return release;
        }),
      )
    : withoutClaim(() =>
        runWithOwner(site.owner, () =>
          createRoot((release) => {
            insert(parent, content() as never, end);
            return release;
          }),
        ),
      );
  return { key: record.key, name: record.name, start, end, region, setArgs, dispose };
}

/** Fill every slot in the mount that has no content yet, outermost first. */
function fillAll(site: Mount, payload: FramePayload): void {
  for (;;) {
    const start = unfilled(site.host, site.occurrences);
    if (start === null) return;
    const record = recordAt(payload, slotIndex(start.data));
    const occurrence = record === undefined ? null : fill(site, start, record);
    // A marker with no record, or no close, is left as it is rather than filled.
    site.occurrences.set(start, occurrence ?? DEAD);
  }
}

const DEAD: Occurrence = {
  key: "",
  name: "",
  start: null as never,
  end: null as never,
  region: null,
  setArgs: () => {},
  dispose: () => {},
};

function mount(state: FrameState, props: Record<string, unknown>): Node {
  const owner = getOwner();
  // The server's element when the page is being claimed: its region stays
  // exactly as it is, and only the slots are filled.
  const host = element(FRAME_TAG, {});
  const adopted = host.getAttribute("data-frame") === state.ref.address && payloadOf(host) !== null;
  if (!adopted) {
    withoutClaim(() => {
      host.setAttribute("data-frame", state.ref.address);
      host.setAttribute("style", "display:contents");
      host.innerHTML = `<script type="${PAYLOAD_TYPE}"></script>${state.markup ?? markupOnPage(state) ?? ""}`;
      if (state.payload !== null) setPayload(host, state.payload);
    });
  }
  state.payload ??= payloadOf(host);
  const payload = state.payload ?? { v: FRAME_VERSION, slots: [], head: [] };
  if (untrack(state.head).length === 0 && payload.head.length > 0) state.setHead(payload.head);
  const placed: Mount = {
    host,
    owner,
    props,
    occurrences: new Map(),
    bindings: new Map(),
    claiming: adopted && isHydrating(),
  };
  fillAll(placed, payload);
  bindAll(placed, payload);
  placed.claiming = false;
  state.mounts.add(placed);
  useHead(() => state.head());
  if (adopted) onHydrationEnd(() => connect(state));
  onCleanup(() => {
    state.mounts.delete(placed);
    for (const occurrence of placed.occurrences.values()) occurrence.dispose();
    for (const binding of placed.bindings.values()) binding.dispose();
    if (state.mounts.size === 0) state.connection?.stop();
  });
  return host;
}

/**
 * A frame the page carries but this mount was not claimed over: one that
 * rendered on the server and is mounted again after the page started, from a
 * seed that named it. Its markup is taken from the page.
 */
function markupOnPage(state: FrameState): string | null {
  for (const candidate of document.querySelectorAll(FRAME_TAG)) {
    if (candidate.getAttribute("data-frame") !== state.ref.address) continue;
    state.payload ??= payloadOf(candidate);
    const copy = candidate.cloneNode(true) as Element;
    copy.firstElementChild?.remove();
    for (const comment of commentsIn(copy)) {
      const at = slotIndex(comment.data);
      if (at === -1) continue;
      const end = closeOf(comment);
      if (end !== null)
        for (const node of between(comment, end)) node.parentNode?.removeChild(node);
    }
    return copy.innerHTML;
  }
  return null;
}

/** Every comment in `root`, collected before the caller changes the tree around them. */
function commentsIn(root: Node): Comment[] {
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const out: Comment[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    out.push(node as Comment);
  }
  return out;
}

// ── binding slots ─────────────────────────────────────────────────────────

/** The page's fill for a binding slot, run once: the object whose properties fill its positions. */
function bindOccurrence(site: Mount, record: SlotRecord): Binding {
  const [args, setArgs] = createSignal<Record<string, unknown>>(
    record.args === undefined ? {} : decodeWire(record.args),
    { ownedWrite: true },
  );
  const given = site.props[record.name];
  return runWithOwner(site.owner, () =>
    createRoot((dispose): Binding => {
      const props: Record<string, unknown> = {};
      for (const key of Object.keys(untrack(args))) props[key] = (): unknown => args()[key];
      // A fill that takes nothing reaches the props as the Cell it is, so
      // reading the prop is calling it.
      const result = withoutClaim(() =>
        untrack(() => {
          const fn = typeof given === "function" ? (given as () => unknown)() : given;
          return typeof fn === "function"
            ? (fn as (props: Record<string, unknown>) => unknown)(props)
            : fn;
        }),
      );
      let values: Record<string, unknown> | null = null;
      if (
        typeof result === "object" &&
        result !== null &&
        !Array.isArray(result) &&
        !(result instanceof Node)
      ) {
        values = result as Record<string, unknown>;
      } else if (given !== undefined) {
        console.error(
          `[barq] The page's \`${record.name}\` fill returned ${result === null ? "null" : Array.isArray(result) ? "an array" : typeof result} where the server component reads it as data. ` +
            "A binding slot's fill returns a plain object whose properties fill the positions the server marked, so the server's values stay in place.",
        );
      }
      const binding: Binding = {
        name: record.name,
        owner: getOwner(),
        values,
        setArgs,
        positions: new Map(),
        dispose: () => {
          for (const at of binding.positions.values()) for (const release of at.values()) release();
          binding.positions.clear();
          dispose();
        },
      };
      return binding;
    }),
  );
}

interface Found {
  readonly node: Node;
  readonly position: string;
  readonly entry: BindEntry;
}

/** Every position marked in `root`, a nested frame's aside, in document order. */
function positionsIn(root: Element): Found[] {
  const out: Found[] = [];
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
    {
      acceptNode: (node) =>
        node !== root && node.nodeType === 1 && (node as Element).localName === FRAME_TAG
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    },
  );
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === 8) {
      const entry = bindTextEntry((node as Comment).data);
      if (entry !== null) out.push({ node, position: "", entry });
      continue;
    }
    const element = node as Element;
    for (const name of element.getAttributeNames()) {
      if (!name.startsWith(BIND_ATTRIBUTE)) continue;
      const position = name.slice(BIND_ATTRIBUTE.length);
      for (const entry of bindEntries(element.getAttribute(name) ?? "")) {
        out.push({ node, position, entry });
      }
    }
  }
  return out;
}

/**
 * Bring the binding slot occurrences up to date with a payload: a new one's
 * fill runs, a kept one's arguments move and its fill is not run again, and
 * each position in the markup is bound once, a position the morph replaced or
 * dropped released.
 */
function bindAll(site: Mount, payload: FramePayload): void {
  const byAt = new Map<number, Binding>();
  const next = new Map<string, Binding>();
  for (const record of payload.slots) {
    if (record.bind !== true) continue;
    let binding = site.bindings.get(record.key);
    if (binding !== undefined && binding.name === record.name) {
      if (record.args !== undefined) binding.setArgs(decodeWire(record.args));
    } else {
      binding = bindOccurrence(site, record);
    }
    next.set(record.key, binding);
    byAt.set(record.at, binding);
  }
  for (const [key, binding] of site.bindings) if (next.get(key) !== binding) binding.dispose();
  site.bindings = next;
  if (next.size === 0) return;

  const seen = new Map<Binding, Map<Node, Set<string>>>();
  for (const found of positionsIn(site.host)) {
    const binding = byAt.get(found.entry.at);
    if (binding === undefined || binding.values === null) continue;
    const id = `${found.position}|${found.entry.key}|${found.entry.member ?? ""}`;
    let nodes = seen.get(binding);
    if (nodes === undefined) seen.set(binding, (nodes = new Map<Node, Set<string>>()));
    let ids = nodes.get(found.node);
    if (ids === undefined) nodes.set(found.node, (ids = new Set()));
    ids.add(id);
    let at = binding.positions.get(found.node);
    if (at === undefined) binding.positions.set(found.node, (at = new Map<string, () => void>()));
    if (at.has(id)) continue;
    const claiming = site.claiming;
    const values = binding.values;
    at.set(
      id,
      runWithOwner(binding.owner, () =>
        createRoot((release) => {
          bindPosition(found, values, claiming);
          return release;
        }),
      ),
    );
  }
  for (const binding of next.values()) {
    const nodes = seen.get(binding);
    for (const [node, at] of binding.positions) {
      const ids = nodes?.get(node);
      for (const [id, release] of at) {
        if (ids?.has(id) === true) continue;
        release();
        at.delete(id);
      }
      if (at.size === 0) binding.positions.delete(node);
    }
  }
}

function textOf(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "bigint"
      ? String(value)
      : "";
}

/**
 * A detached element for the style a claimed position already shows: what
 * `setStyle` would have applied, without writing to the page's element.
 */
let scratch: HTMLElement | null = null;

/**
 * Fill one position from the fill's object. A value position follows the
 * property, a handler and a ref are read once, as the page's own JSX reads
 * them. While the page is claimed the server already wrote each value, so the
 * first run writes nothing.
 */
function bindPosition(found: Found, values: Record<string, unknown>, claiming: boolean): void {
  const { node, position, entry } = found;
  const read = (): unknown => values[entry.key];
  if (position === "") {
    const start = node as Comment;
    let text: Text;
    if (start.nextSibling !== null && start.nextSibling.nodeType === 3) {
      text = start.nextSibling as Text;
    } else {
      text = document.createTextNode("");
      start.parentNode?.insertBefore(text, start.nextSibling);
    }
    createRenderEffect(
      () => textOf(read()),
      (value) => {
        if (text.data !== value) text.data = value;
      },
    );
    return;
  }
  const element = node as Element;
  if (position === "ref") {
    bindRef(element, untrack(read));
    return;
  }
  if (position.startsWith(BIND_EVENT)) {
    const type = position.slice(BIND_EVENT.length);
    const capture = entry.member === "capture";
    bindEvent(element, type, untrack(read), capture);
    // A delegated handler is the element's own expando, which nothing else
    // takes back when the position is released.
    if (!capture) onCleanup(() => delegate(element, type, undefined));
    return;
  }
  if (position === "class" && entry.member !== undefined) {
    const name = entry.member;
    createRenderEffect(
      () => Boolean(read()),
      (on) => {
        if (element.classList.contains(name) !== on) element.classList.toggle(name, on);
      },
    );
    return;
  }
  // What the channel last applied, which `setStyle` and `setClass` diff against.
  let applied: unknown;
  let first = claiming;
  if (position === "style") {
    const member = entry.member;
    createRenderEffect(
      () => (member === undefined ? read() : { [member]: read() }),
      (value) => {
        if (first) {
          first = false;
          scratch ??= document.createElement("div");
          scratch.removeAttribute("style");
          applied = setStyle(scratch, "style", value);
          return;
        }
        applied = setStyle(element, "style", value, applied);
      },
    );
    return;
  }
  if (position === "class") {
    createRenderEffect(read, (value) => {
      if (first) {
        first = false;
        applied = classToString(value);
        return;
      }
      applied = setClass(element, "class", value, applied);
    });
    return;
  }
  createRenderEffect(read, (value) => {
    if (first) {
      first = false;
      return;
    }
    setProp(element, position, value);
  });
}

// ── the morph ─────────────────────────────────────────────────────────────

interface MorphContext {
  readonly mount: Mount;
  readonly payload: FramePayload;
  /** The occurrences still to place, by key. */
  readonly keep: Map<string, Occurrence>;
  readonly used: Set<Occurrence>;
}

function sameNode(current: Node, next: Node): boolean {
  if (current.nodeType !== next.nodeType) return false;
  if (current.nodeType !== 1) return true;
  const a = current as Element;
  const b = next as Element;
  return a.localName === b.localName && a.getAttribute("id") === b.getAttribute("id");
}

/**
 * The positions of an element a binding slot fills, by its markers: whole
 * attributes, and the class names and style properties it fills in object form.
 */
function ownedBy(element: Element): {
  whole: Set<string>;
  classes: Set<string>;
  styles: Set<string>;
} {
  const owned = { whole: new Set<string>(), classes: new Set<string>(), styles: new Set<string>() };
  for (const name of element.getAttributeNames()) {
    if (!name.startsWith(BIND_ATTRIBUTE)) continue;
    const position = name.slice(BIND_ATTRIBUTE.length);
    if (position === "ref" || position.startsWith(BIND_EVENT)) continue;
    for (const entry of bindEntries(element.getAttribute(name) ?? "")) {
      if (entry.member === undefined) owned.whole.add(position);
      else if (position === "class") owned.classes.add(entry.member);
      else if (position === "style") owned.styles.add(entry.member);
    }
  }
  return owned;
}

/**
 * The server's attributes, written over the element's, except where the page
 * fills a position: a whole attribute it fills is left as it stands, and the
 * class names and style properties it fills keep their current state inside
 * the server's new class and style.
 */
function patchAttributes(current: Element, next: Element): void {
  const owned = ownedBy(next);
  const classes = owned.classes.size > 0;
  const styles = owned.styles.size > 0;
  for (const name of current.getAttributeNames()) {
    if (owned.whole.has(name) || (name === "class" && classes) || (name === "style" && styles)) {
      continue;
    }
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const name of next.getAttributeNames()) {
    if (owned.whole.has(name) || (name === "class" && classes) || (name === "style" && styles)) {
      continue;
    }
    const value = next.getAttribute(name) ?? "";
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
  if (classes) {
    const tokens = new Set((next.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
    for (const name of owned.classes) {
      if (current.classList.contains(name)) tokens.add(name);
      else tokens.delete(name);
    }
    const value = [...tokens].join(" ");
    if ((current.getAttribute("class") ?? "") !== value) current.setAttribute("class", value);
  }
  if (styles) {
    const style = (current as HTMLElement).style;
    const kept = new Map<string, string>();
    for (const property of owned.styles) {
      const css = cssProperty(property);
      kept.set(css, style.getPropertyValue(css));
    }
    const value = next.getAttribute("style");
    if (current.getAttribute("style") !== value) {
      if (value === null) current.removeAttribute("style");
      else current.setAttribute("style", value);
      for (const [css, text] of kept) {
        if (text === "") style.removeProperty(css);
        else style.setProperty(css, text);
      }
    }
  }
}

/** A style object's key as the declaration's name, as `setStyle` writes it. */
function cssProperty(property: string): string {
  return property.startsWith("--")
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function isTextEnd(node: Node | null): boolean {
  return node !== null && node.nodeType === 8 && (node as Comment).data === BIND_TEXT_END;
}

function occurrenceAt(context: MorphContext, node: Node | null): Occurrence | null {
  if (node === null || node.nodeType !== 8) return null;
  const found = context.mount.occurrences.get(node as Comment);
  return found === undefined || found === DEAD ? null : found;
}

/** Move an occurrence's whole range, markers and content, to stand before `before`. */
function place(occurrence: Occurrence, parent: Node, before: Node | null): void {
  const nodes = [occurrence.start, ...between(occurrence.start, occurrence.end), occurrence.end];
  for (const node of nodes) parent.insertBefore(node, before);
}

function morphChildren(current: Node, next: Node, context: MorphContext): void {
  let cursor: Node | null = current.firstChild;
  if (isPayload(cursor)) cursor = cursor.nextSibling;
  const incoming = [...next.childNodes];
  for (let at = 0; at < incoming.length; at++) {
    const node = incoming[at];
    // An occurrence standing here that the server no longer puts here is
    // stepped over: it is moved to where it now belongs, or removed after.
    for (let standing = occurrenceAt(context, cursor); standing !== null;) {
      cursor = standing.end.nextSibling;
      standing = occurrenceAt(context, cursor);
    }
    const opening = node.nodeType === 8 ? slotIndex((node as Comment).data) : -1;
    if (opening !== -1) {
      let close = at + 1;
      while (close < incoming.length) {
        const candidate = incoming[close];
        if (candidate.nodeType === 8 && slotEnd((candidate as Comment).data) === opening) break;
        close++;
      }
      at = close;
      const record = recordAt(context.payload, opening);
      const kept = record === undefined ? undefined : context.keep.get(record.key);
      if (kept !== undefined && kept.name === record!.name) {
        context.keep.delete(kept.key);
        context.used.add(kept);
        if (kept.start.nextSibling !== cursor || kept.start.parentNode !== current) {
          place(kept, current, cursor);
        }
        kept.start.data = slotOpen(opening);
        kept.end.data = slotClose(opening);
        continue;
      }
      current.insertBefore(document.createComment(slotOpen(opening)), cursor);
      current.insertBefore(document.createComment(slotClose(opening)), cursor);
      continue;
    }
    // A text position the page fills keeps the page's text: the server's
    // pair has nothing between, and the morph steps over both.
    if (
      node.nodeType === 8 &&
      bindTextEntry((node as Comment).data) !== null &&
      cursor !== null &&
      cursor.nodeType === 8 &&
      (cursor as Comment).data === (node as Comment).data
    ) {
      while (at + 1 < incoming.length && !isTextEnd(incoming[at])) at++;
      let end: Node | null = cursor.nextSibling;
      while (end !== null && !isTextEnd(end)) end = end.nextSibling;
      cursor = end === null ? null : end.nextSibling;
      continue;
    }
    if (cursor !== null && sameNode(cursor, node)) {
      if (cursor.nodeType === 1) {
        patchAttributes(cursor as Element, node as Element);
        morphChildren(cursor, node, context);
      } else if (cursor.nodeValue !== node.nodeValue) {
        cursor.nodeValue = node.nodeValue;
      }
      cursor = cursor.nextSibling;
      continue;
    }
    current.insertBefore(document.importNode(node, true), cursor);
  }
  // What is left is what the server no longer sends. An occurrence among it is
  // kept in the tree for now: it may still be placed elsewhere.
  while (cursor !== null) {
    const standing = occurrenceAt(context, cursor);
    if (standing !== null) {
      cursor = standing.end.nextSibling;
      continue;
    }
    const gone = cursor;
    cursor = cursor.nextSibling;
    current.removeChild(gone);
  }
}

/** Apply a new answer to one mount: morph the region, then bring the occurrences up to date. */
function update(site: Mount, payload: FramePayload, markup: string): void {
  const next = document.createElement("template");
  next.innerHTML = markup;
  const keep = new Map<string, Occurrence>();
  for (const occurrence of site.occurrences.values()) {
    if (occurrence !== DEAD) keep.set(occurrence.key, occurrence);
  }
  const context: MorphContext = { mount: site, payload, keep, used: new Set() };
  withoutClaim(() => {
    morphChildren(site.host, next.content, context);
    setPayload(site.host, payload);
  });
  const occurrences = new Map<Comment, Occurrence>();
  for (const occurrence of context.used) {
    occurrences.set(occurrence.start, occurrence);
    const record = recordAt(payload, slotIndex(occurrence.start.data));
    if (record === undefined) continue;
    if (record.args !== undefined) occurrence.setArgs(decodeWire(record.args));
    if (occurrence.region !== null && record.region !== undefined) {
      const region = document.createElement("template");
      region.innerHTML = record.region;
      withoutClaim(() => morphChildren(occurrence.region!, region.content, context));
      for (const nested of context.used) occurrences.set(nested.start, nested);
    }
  }
  for (const occurrence of site.occurrences.values()) {
    if (occurrence === DEAD || context.used.has(occurrence)) continue;
    occurrence.dispose();
    for (const node of [
      occurrence.start,
      ...between(occurrence.start, occurrence.end),
      occurrence.end,
    ]) {
      node.parentNode?.removeChild(node);
    }
  }
  site.occurrences.clear();
  for (const [start, occurrence] of occurrences) site.occurrences.set(start, occurrence);
  fillAll(site, payload);
  bindAll(site, payload);
}

// ── assets ────────────────────────────────────────────────────────────────

/**
 * The region's stylesheets, loaded before it is shown: a region revealed
 * before its styles is the flash a server render exists to prevent. Each is
 * the element `useHead` takes over when the frame mounts.
 */
async function loadStylesheets(head: readonly HeadTag[]): Promise<void> {
  const loading: Promise<void>[] = [];
  for (const tag of head) {
    const props = tag.props ?? {};
    if (tag.tag !== "link" || props.rel !== "stylesheet" || typeof props.href !== "string")
      continue;
    const key = `link:stylesheet:${props.href}`;
    let present = false;
    for (const candidate of document.head.querySelectorAll("[data-bh]")) {
      if (candidate.getAttribute("data-bh") === key) present = true;
    }
    if (present) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = props.href;
    link.setAttribute("data-bh", key);
    loading.push(
      new Promise<void>((resolve) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => resolve(), { once: true });
      }),
    );
    document.head.appendChild(link);
  }
  await Promise.all(loading);
}

// ── the wire ──────────────────────────────────────────────────────────────

/**
 * Read a frame answer and apply it: the component for its address, the same
 * one every time, with every place it is mounted morphed to the new markup
 * once the region's stylesheets have loaded.
 */
export async function applyFrameResponse(response: Response): Promise<FrameComponent> {
  const template = document.createElement("template");
  template.innerHTML = await response.text();
  return applyFrameMarkup(template.content.firstElementChild);
}

/** A frame's markup as text, a live event's, applied as a frame answer is. */
export function applyFrameText(markup: string): Promise<FrameComponent> {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return applyFrameMarkup(template.content.firstElementChild);
}

/** One frame's markup, applied to every place its address is mounted. */
async function applyFrameMarkup(host: Element | null): Promise<FrameComponent> {
  const address = host?.getAttribute("data-frame") ?? null;
  const payload = host === null ? null : payloadOf(host);
  if (host === null || address === null || payload === null) {
    throw new Error(
      "[barq] A server function answered with a frame whose markup has no `barq-frame` element and payload, so there is nothing to apply. " +
        "The server and this page were built from different versions: reload the page.",
    );
  }
  if (payload.v !== FRAME_VERSION) {
    throw new Error(
      `[barq] A server function answered with frame version ${payload.v}, and this page reads version ${FRAME_VERSION}. ` +
        "The server was deployed after this page loaded: reload the page.",
    );
  }
  host.firstElementChild?.remove();
  const markup = host.innerHTML;
  const id = address.slice(0, address.lastIndexOf("#"));
  const state = stateFor({ id, address });
  await loadStylesheets(payload.head);
  state.payload = payload;
  state.markup = markup;
  state.setHead(payload.head);
  for (const placed of state.mounts) update(placed, payload, markup);
  document.dispatchEvent(new CustomEvent(FRAME_APPLIED_EVENT, { detail: { address } }));
  return state.component;
}

/**
 * What a mutation sends so its answer can carry the regions it changed: every
 * mounted frame's function and arguments, up to the budget, or `null` with
 * none mounted.
 */
export function mountedFramesHeader(): string | null {
  const out: { id: string; args: unknown }[] = [];
  for (const state of FRAMES.values()) {
    if (state.mounts.size === 0 || state.payload === null) continue;
    out.push({ id: state.ref.id, args: state.payload.args });
    if (out.length === FRAMES_BUDGET) break;
  }
  return out.length === 0 ? null : JSON.stringify(out);
}

/**
 * A mutation's single-flight answer: each region it carries applied where it
 * is mounted, then the value, which is what the caller is handed.
 */
export async function applyFlight(response: Response): Promise<unknown> {
  const template = document.createElement("template");
  template.innerHTML = await response.text();
  const script = template.content.firstElementChild;
  if (
    script === null ||
    script.localName !== "script" ||
    script.getAttribute("type") !== FLIGHT_TYPE
  ) {
    throw new Error(
      "[barq] A server function answered with a single flight whose value script is missing, so there is no value to hand the caller. " +
        "The server and this page were built from different versions: reload the page.",
    );
  }
  const value = decodeWire(JSON.parse(script.textContent ?? "null"));
  for (const host of template.content.children) {
    if (host.localName === FRAME_TAG) await applyFrameMarkup(host);
  }
  return value;
}

/** Forget every frame, for a test that renders more than one page. */
export function resetFrames(): void {
  FRAMES.clear();
}

// ── live ──────────────────────────────────────────────────────────────────
//
// `live`'s loop, here because a frame the page was served through `live`
// connects through it as well as a `live` call does.

/** What the loop says about its connection. */
export type LiveStatus = "connected" | "reconnecting" | "closed";

export interface LiveIterable<T> extends AsyncIterable<T> {
  /** Told `"connected"` per connection, `"reconnecting"` with the error per death, `"closed"` at the end. */
  onstatus?: (status: LiveStatus, error?: unknown) => void;
}

interface ServerEvent {
  readonly event: string;
  readonly id: string | null;
  readonly data: string;
}

/** The events of a `text/event-stream` body, as the spec frames them. */
async function* eventsOf(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let event = "message";
  let id: string | null = null;
  let data: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end = pending.search(/\r\n|\r|\n/);
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + (pending.startsWith("\r\n", end) ? 2 : 1));
        if (line === "") {
          if (data.length > 0 || event !== "message") yield { event, id, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const text = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "data") data.push(text);
          else if (field === "event") event = text;
          else if (field === "id") id = text;
        }
        end = pending.search(/\r\n|\r|\n/);
      }
      if (done) return;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/** Statuses that say "ask again" even though they refuse this time. */
const RETRY = new Set([408, 425, 429]);

/** How long to wait before the next connection, the nth failure in a row. */
function pause(failures: number, signal: AbortSignal): Promise<void> {
  const ms = Math.min(30_000, 250 * 2 ** failures);
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      globalThis.removeEventListener?.("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    }
    globalThis.addEventListener?.("online", done, { once: true });
    signal.addEventListener("abort", done, { once: true });
  });
}

export type LiveStub = Stub & {
  readonly [LIVE_CALL]: (options: unknown, live: LiveRequest) => Promise<Response>;
};

/** The reconnecting iteration of one live call. */
export function liveIterable(stub: LiveStub, options: unknown): LiveIterable<unknown> {
  const iterable: LiveIterable<unknown> = {
    [Symbol.asyncIterator]: (): AsyncIterator<unknown> => {
      const controller = new AbortController();
      const running = loop(stub, options, iterable, controller);
      return {
        next: () => running.next(),
        // The connection is ended here, not when the generator gets round to
        // it: one waiting on a body that sends nothing would never get there.
        return: (value?: unknown) => {
          controller.abort();
          return running.return(value);
        },
      };
    },
  };
  return iterable;
}

async function* loop(
  stub: LiveStub,
  options: unknown,
  told: LiveIterable<unknown>,
  controller: AbortController,
): AsyncGenerator {
  let lastEventId: string | null = null;
  let failures = 0;
  let connected = false;
  try {
    for (;;) {
      let response: Response;
      try {
        response = await stub[LIVE_CALL](options, { lastEventId, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!connected) throw error;
        told.onstatus?.("reconnecting", error);
        await pause(failures++, controller.signal);
        continue;
      }
      if (!response.ok || response.body === null) {
        const retries = RETRY.has(response.status) || response.headers.has("retry-after");
        const error = new ServerFnError(stub.meta.id, response.status, response);
        if (!connected || (!retries && response.status >= 400 && response.status < 500))
          throw error;
        told.onstatus?.("reconnecting", error);
        await pause(failures++, controller.signal);
        continue;
      }
      connected = true;
      failures = 0;
      told.onstatus?.("connected");
      let yielded: unknown = undefined;
      let complete = false;
      let died: unknown = new Error(
        `[barq] The live connection of ${JSON.stringify(stub.meta.id)} ended before it was complete.`,
      );
      try {
        for await (const event of eventsOf(response.body)) {
          if (event.event === "complete") {
            complete = true;
            break;
          }
          if (event.id !== null) lastEventId = event.id;
          const data = JSON.parse(event.data) as unknown;
          if (event.event === "frame") {
            const component = await applyFrameText(data as string);
            if (component !== yielded) {
              yielded = component;
              yield component;
            }
            continue;
          }
          yield decodeWire(data);
        }
      } catch (error) {
        died = error;
      }
      if (complete || controller.signal.aborted) return;
      told.onstatus?.("reconnecting", died);
      await pause(failures++, controller.signal);
    }
  } finally {
    controller.abort();
    told.onstatus?.("closed");
  }
}
