/**
 * The reference backend's runtime — `CODESIGN.md` §6 L2. DEV and test only.
 *
 * The compiler has three backends over one analysed IR: `Dom` prints the walk
 * and the patch program as JavaScript, `Ssr` concatenates bytes, and `Interp`
 * serialises the IR and leaves the walking to this file. What makes the third
 * one an oracle rather than a fourth implementation is that it is handed the
 * *same analysed IR* the first one is handed — the anchors P5 chose, the
 * template bytes P7 wrote, the ref plan P6 addressed, the patch program in
 * program order. It cannot know less than codegen and it cannot know more, so
 * there is nothing here that a per-fixture exemption could ever be needed for.
 *
 * It carries no legacy decision because it did not exist before: no
 * `createElement`, no child normalisation of its own, no prop dispatch of its
 * own. Where it writes to the DOM it goes through the same ABI primitives
 * (§3.0) the emitted module goes through — `template`, `insert`, the resolved
 * channels, `bindEffect` — because those are the contract both backends are
 * written against, not the thing under test. The CHANNEL travels in the record:
 * the compiler resolved it, and a reference backend that re-derived it from the
 * name would be answering a question the thing under test no longer asks. A rule of `SEMANTICS.md` that the runtime
 * violates is therefore violated identically on this path, by construction:
 * this file is a reference for the COMPILER, and M1 changes no semantics.
 *
 * ## The serialised form
 *
 * ```js
 * const _ir$1 = [_tmpl$1, [["root", null, 0], ["firstChild", 0, 1]], [
 *   ["insert", 1, 0, "live", null],
 * ]];
 * _$interp(_ir$1, [() => count()]);
 * ```
 *
 * A unit is `[clone, refs, ops]`. `refs` is P6's plan, index by index, so a
 * `base` is an index into a binding already built. `ops` is the patch program,
 * each record naming the `Backend` method it came from.
 *
 * The second argument is the only thing that cannot be data: an `ExprId` names
 * a parsed expression that reads the user's bindings, so its serialisation is a
 * closure over the site it was written at. Every slot is nullary and returns
 * the value its use site resolves to, which is what makes the reading rule one
 * line — a live binding hands the function on and the runtime owns the effect
 * (exactly as it does for the DOM backend's thunk), everything else calls it at
 * the point the patch runs, so both backends read every expression the same
 * number of times in the same order.
 */

import {
  bindEffect,
  bindEvent,
  bindProp,
  bindValue,
  insert,
  listen,
  ref,
  setAttr,
  setBool,
  setClass,
  setClassList,
  setDomProp,
  setLive,
  setHtml,
  setStyle,
  setStyleProp,
  type Channel,
} from "./dom.ts";
import { boundary, branch, each, portal } from "./flow.ts";
import type { Block, Cell, Scope } from "./scope.ts";

export type Slot = () => unknown;

type RefKind = "root" | "firstChild" | "lastChild" | "nextSibling" | "prevSibling";

/** `[step, base, hops]`; `base` is null only for the root. */
export type Ref = readonly [RefKind, number | null, number];

type Diff = "identity" | "always" | "thread";
type Plan = "once" | "live" | "opaque";

/** §3.5's channel set, spelled the same way the compiler spells it. */
type Chan =
  | "attr"
  | "prop"
  | "live"
  | "bool"
  | "class"
  | "style"
  | "styleProp"
  | "classList"
  | "html";

const CHANNEL: Record<Chan, Channel> = {
  attr: setAttr,
  prop: setDomProp,
  live: setLive,
  bool: setBool,
  class: setClass,
  style: setStyle,
  styleProp: setStyleProp,
  classList: setClassList,
  html: setHtml,
};

type SetLive = readonly ["setLive", number, string, number, Diff, Chan];

export type Op =
  | readonly ["setOnce", number, string, number, Chan]
  | readonly ["setOpaque", number, string, number, Chan]
  | SetLive
  | readonly ["setEvent", number, string, number]
  | readonly ["delegate", number, string, number]
  | readonly ["listen", number, string, number]
  | readonly ["ref", number, number, "assign" | "apply"]
  | readonly ["bind", number, string, string, number]
  | readonly ["insert", number, number, Plan, number | null]
  | Region
  | readonly ["effectGroup", readonly SetLive[]];

/** A control-flow region: `flow.ts`'s four primitives, as data.
 *
 * `[op, parent, anchor, kind, key, body, keyed, fallback, on, flags]`. Every
 * slot index here holds its expression VERBATIM rather than wrapped in a
 * reader, because all of them are already functions or arrays and the
 * primitives take them as they are — a `Cell<K>`, a `Block`, a table of them.
 */
type RegionKind = "branch" | "each" | "error" | "loading" | "portal";
type Region = readonly [
  "region",
  number,
  number | null,
  RegionKind,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  number,
];

/** `[clone, refs, ops]` — one compiled unit of the analysed IR. */
export type Unit = readonly [() => Node, readonly Ref[], readonly Op[]];

/**
 * Opcodes that reach this file. Checked against the compiler's own instruction
 * set in both directions by `interp.test.ts`, which is what keeps a new `Op`
 * from being a silent no-op here after the `Backend` trait has already made it
 * a compile error in Rust.
 */
export const HANDLED: readonly string[] = [
  "setOnce",
  "setLive",
  "setOpaque",
  "setEvent",
  "delegate",
  "listen",
  "ref",
  "bind",
  "insert",
  "region",
  "effectGroup",
];

/**
 * The one opcode that never reaches this file, and why: P1 refuses to put an
 * element carrying a spread on the template path, so the whole subtree is
 * emitted through `createElement` — on this backend for the same reason and by
 * the same route as on the DOM backend, which answers `None` for exactly it.
 *
 * `setClass`, `setStyle` and `setHtml` were here at M4b and are DELETED, not
 * moved: `class`, `style` and `dangerouslySetInnerHTML` are CHANNELS now
 * (§3.5), reached through `setOnce` / `setLive` / `setOpaque` like every other
 * name, and the three `Op` variants that used to carry them were never
 * constructed by any pass.
 */
export const OFF_TEMPLATE: readonly string[] = ["spread"];

/**
 * Build one unit and return its root node.
 *
 * Order is the whole contract: every binding is materialised before any patch
 * runs, because `insert` splices nodes into the parent and invalidates a
 * sibling walk taken after it — the same invariant `RefPlan::validate` enforces
 * on the compiler side. Then the patch program, in program order.
 */
export function interp(s: Scope | null, unit: Unit, slots: readonly Slot[]): Node {
  const [clone, refs, ops] = unit;

  const nodes: Node[] = [clone()];
  for (let i = 1; i < refs.length; i++) {
    nodes[i] = walk(nodes, refs[i]);
  }

  for (const op of ops) apply(s, op, nodes, slots);
  return nodes[0];
}

function walk(nodes: readonly Node[], ref: Ref): Node {
  const [kind, base, hops] = ref;
  if (kind === "root" || base === null) {
    throw new Error(`barq interp: ref ${kind} has no base to walk from`);
  }
  let node: Node | null = nodes[base];
  if (kind === "firstChild") node = node.firstChild;
  else if (kind === "lastChild") node = node.lastChild;
  const backward = kind === "lastChild" || kind === "prevSibling";
  for (let hop = 0; hop < hops; hop++) {
    if (node === null) break;
    node = backward ? node.previousSibling : node.nextSibling;
  }
  if (node === null) {
    throw new Error(`barq interp: the walk ${kind}+${hops} left the template`);
  }
  return node;
}

function apply(s: Scope | null, op: Op, nodes: readonly Node[], slots: readonly Slot[]): void {
  switch (op[0]) {
    // Two rows rather than one, mirroring the DOM backend. `SetOnce` is what P3
    // folds on, and keeping them apart is what stops a change to one silently
    // moving the other: a proven-static value is written once, and an opaque one
    // still has its liveness decided at run time.
    case "setOnce":
      CHANNEL[op[4]](nodes[op[1]] as Element, op[2], slots[op[3]](), undefined);
      return;
    case "setOpaque":
      bindProp(s, nodes[op[1]] as Element, CHANNEL[op[4]], op[2], slots[op[3]]());
      return;

    // Ungrouped: one effect for one live prop, which is what a `SetLive` outside
    // a group lowers to — either because fusion is off (`-O0`), or because
    // fusion put it in a group of one.
    case "setLive":
      fuse(s, [op], nodes, slots);
      return;

    case "setEvent":
      bindEvent(s, nodes[op[1]] as Element, op[2], slots[op[3]]());
      return;

    // The expando the delegated dispatcher reads, plus the scope beside it that
    // routes a throw to the boundary. The bound-tuple form lives inside the
    // handler value, so there is no second property to write.
    case "delegate":
      (nodes[op[1]] as unknown as Record<string, unknown>)[op[2]] = slots[op[3]]();
      (nodes[op[1]] as unknown as Record<string, unknown>).$$s = s;
      return;
    case "listen":
      listen(s, nodes[op[1]], op[2], slots[op[3]]() as EventListener);
      return;

    // B3. A writable binding is an ASSIGNMENT, and an assignment cannot be
    // serialised as a value — so the slot IS the assignment and is called with
    // the element.
    case "ref":
      if (op[3] === "assign") {
        (slots[op[2]] as (el: Node) => void)(nodes[op[1]]);
      } else {
        ref(s, nodes[op[1]] as Element, slots[op[2]]());
      }
      return;

    case "bind":
      bindValue(s, nodes[op[1]] as Element, op[2], op[3], slots[op[4]]);
      return;

    case "insert": {
      const anchor = op[4] === null ? undefined : nodes[op[4]];
      // `live` is the hole the compiler PROVED reactive: the runtime is handed
      // the function and creates the effect. `once` and `opaque` pass the value
      // through and let `insert` decide, which is the same decision the
      // un-compiled path makes.
      const value = op[3] === "live" ? slots[op[2]] : slots[op[2]]();
      insert(s, nodes[op[1]], value as never, anchor);
      return;
    }

    // K5 and K7. The construct ceased to exist at compile time; what the
    // descriptor carries is the primitive, and the `(parent, anchor)` pair is
    // the one the template walk produced — the same pair `dom.rs` prints, read
    // out of the same ref plan.
    case "region": {
      const parent = nodes[op[1]];
      const anchor = op[2] === null ? null : nodes[op[2]];
      // `undefined`, not `null`: `boundary` asks `on !== undefined` before it
      // opens the effect that reads it, and every other absent slot reads the
      // two the same way.
      const at = (index: number | null): never =>
        (index === null ? undefined : slots[index]) as never;
      const flags = op[9];
      switch (op[3]) {
        case "branch":
          branch(s, parent, anchor, at(op[4]) as Cell<unknown>, at(op[5]), flags);
          return;
        case "each":
          each(s, parent, anchor, at(op[4]), at(op[6]), at(op[5]), flags, at(op[7]));
          return;
        case "error":
        case "loading":
          boundary(s, parent, anchor, op[3], at(op[7]), at(op[5]), flags, at(op[8]));
          return;
        default:
          insert(
            s,
            parent,
            portal(s, at(op[4]), at(op[5]) as Block<unknown>, flags) as never,
            anchor ?? undefined,
          );
          return;
      }
    }

    case "effectGroup":
      fuse(s, op[1], nodes, slots);
      return;
  }
}

/**
 * B2's fused compute/apply record, as the reference backend spells it. The DOM
 * backend emits the same two functions with the record's fields flattened into
 * an object literal; here the record is an array, because the members are data.
 *
 * The COMPUTE is the only tracked half. `recompute` runs the apply with tracking
 * off and hands it the array the previous run returned, so a channel that reads
 * the DOM cannot acquire a dependency (R2) and the previous-value store is the
 * compute's own return — no runtime-allocated accumulator, no element expando.
 *
 * Every read happens before any write, which is not a detail: a write can change
 * what a later prop on the same element would have read.
 */
function fuse(
  s: Scope | null,
  members: readonly SetLive[],
  nodes: readonly Node[],
  slots: readonly Slot[],
): void {
  bindEffect(
    s,
    () => members.map((member) => slots[member[3]]()),
    (values: unknown[], prev: unknown[] | undefined) => {
      for (let i = 0; i < members.length; i++) {
        const [, node, key, , diff, chan] = members[i];
        const element = nodes[node] as Element;
        if (diff === "thread") {
          values[i] = CHANNEL[chan](element, key, values[i], prev?.[i]);
          continue;
        }
        // `prev?.[i]` and not a `prev === undefined` branch: the DOM backend's
        // apply defaults its record to `{}`, so a first run whose value is
        // itself `undefined` writes nothing there and must write nothing here.
        if (diff === "always" || values[i] !== prev?.[i]) {
          CHANNEL[chan](element, key, values[i], undefined);
        }
      }
    },
  );
}
