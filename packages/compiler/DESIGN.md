# The barq compiler's template IR: a skeleton and a patch program

Each template compiles to a static **skeleton**, the markup that never changes, and a **patch
program**, the operations that fill in its dynamic parts. The reactivity analysis (**DepSet**) and
the addressing, dedup and interning machinery (**Ribbon**) are grafted onto that split.

The IR, the passes and the backends are how `src/` is organised: `src/ir` holds the types,
`src/analysis` the binding and diagnostic analysis, `src/lower` the JSX lowering, `src/passes` the
passes over the IR, and `src/codegen` the backends. The reactive engine the emitted code calls is
`@solidjs/signals`, re-exported under Solid's own names (`createSignal`, `createMemo`,
`createEffect`, `createStore`, ...) from `packages/core/src/signals.ts`. Every component is a
function of its props alone and every emitted call takes the arguments shown in this document: no
scope argument is threaded (`SEMANTICS.md` C1).

The fixture corpus (`fixtures/README.md`) is the catalogue of JSX shapes the compiler handles.
Compiled output is checked against per-fixture goldens, effect counts and the `-O0`/`-Ox`/`interp`
differentials. The bar: compiled output must never do more reactive work than it has to.
"Target #N" below is the optimisation target of that number in `fixtures/README.md`'s "The
corpus by target".

---

## 1. Pipeline overview

Two layers, and the compiler's whole job is moving mass from layer 2 into layer 1.

**Layer 1 — Skeleton (bone).** Pure static HTML. Pre-escaped at compile time. Knows nothing
about expressions, symbols, or AST. Two skeletons that serialize identically *are* identical and
share one hoisted `template()`. Both backends serialize this layer; they differ only in what
they do at the cut points.

**Layer 2 — Patch program (sinew).** A flat, `Copy`, document-ordered instruction stream that
addresses into the skeleton by `NodeId`/`SlotId` and holds no AST — only `ExprId`s. Knows
nothing about DOM APIs or string concatenation.

Because neither layer names a codegen target, one IR drives every backend. Target #2 —
"fully-static subtree ⇒ zero patch code" — is not a special case; it is `patch.is_empty()`.

`compile.rs::compile_on_this_stack` is the driver. Two source-to-source rewrites run before the
parse; everything after it works on one `Program` in one arena:

```
  middleware_split, env_fns ──────────→ source text (client/server halves stripped)
                                        │
  oxc_parser (preserve_parens) ───────→ Program<'a>
                                        │
  css::run ───────────────────────────→ `css` templates replaced by class strings
  source_names::run (dev) ────────────→ primitives named from their bindings
  props_sugar::run ───────────────────→ prop reads rewritten to Cell reads
                                        │
  P0 Bind (analysis::bind) ───────────→ ReactiveEnv, renderer ranges, diagnostics
  migration::scan ────────────────────→ Solid 1.x spellings reported with fixes
                                        │
  harvest ────────────────────────────→ JSX roots moved out, `_jsx$N` placeholders left
  P1 Lower ───────────────────────────→ Unit { Skeleton, patch, ExprTable } per root
                                        │
  passes::run
    P2 Classify ──────────────────────→ Rx on every ExprEntry; events resolved; handlers hoisted
    Order ────────────────────────────→ value constraints written ahead of the value
    P3 Fold ──────────────────────────→ constants migrate INTO the skeleton
    P4 Shape (+ Flow) ────────────────→ component calls, prop Cells, control-flow regions
    P5 Anchor ────────────────────────→ insert anchors, marker materialisation or elision
    P5 Group ─────────────────────────→ one EffectGroup per template
    claim_regions ────────────────────→ staged regions become `Op::Region`
    address::locate ──────────────────→ compile-time position addresses (every target)
    P7 Intern (serialize) ────────────→ template bytes, dedup, TemplateId
    P6 Address ───────────────────────→ RefPlan (bidirectional walk)
                                        │
  P8 Emit (codegen::emit) ─────────→ dom | ssr | universal | interp, then prune + install
```

P6 and P7 run only when the module, or a renderer one of its boundaries enters, walks the
document (`Target::walks_the_dom`): a `template()` is a parse and an address is a sibling walk, and
the string and universal backends have neither. P7 runs before P6 because neither reads the
other's output; the numbers name the passes, not their order.

After P1 the tree is gone. Every pass from P2 on is a linear scan over a `Vec<Patch>` of `Copy`
records plus a `Vec<ExprEntry>`. A `Patch` is 40 bytes: oxc's `Span` is 8-aligned and `Op`'s
widest variants carry 20 payload bytes, and `ir/mod.rs`'s `patch_records_stay_pod_sized` pins
the size.

P2 and P3 are two passes. P2 computes `Rx` bottom-up over each expression and resolves the patch
it sits in; P3 reads the verdicts P2 left and migrates what is constant into the skeleton.

---

## 2. The Rust IR

```rust
// src/ir/mod.rs
pub type NodeId     = u32;   // index into Skeleton::nodes, document order
pub type SlotId     = u32;   // skeleton-LOCAL, document order — keeps hashes dedupable
pub type ExprId     = u32;   // index into ExprTable::entries
pub type RefId      = u32;   // index into RefPlan::defs
pub type StrId      = u32;   // interned &'a str
pub type TagId      = u32;   // Interner::tag carries the flag bits
pub type NameId     = u32;   // Interner::name carries the flag bits
pub type TemplateId = u32;
pub type UnitId     = u32;
pub type HoistId    = u32;

pub const NONE: u32 = u32::MAX;

pub(crate) type AVec<'a, T> = oxc::allocator::Vec<'a, T>;
```

### 2.1 Layer 1 — Skeleton

```rust
// src/ir/skeleton.rs
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Ns { #[default] Html, Svg, Math }

/// How many DOM nodes a skeleton node contributes to its parent's child list.
/// `Unknown` exists because raw HTML is bytes, not a node count.
pub enum Materialisation { Zero, One, Unknown }

pub struct Skeleton<'a> {
    pub nodes:  AVec<'a, SkelNode<'a>>,  // index == NodeId, document order
    pub parent: AVec<'a, NodeId>,        // NONE for roots
    /// Position among siblings that actually materialise a DOM node. A `Slot`
    /// materialises nothing, so a leading hole must NOT shift the sibling walk.
    /// P6 walks these indices, never raw NodeIds. NONE when nothing materialises.
    pub mat_ix: AVec<'a, u32>,
    pub roots:  (NodeId, NodeId),        // half-open; len > 1 ⇒ fragment
    pub ns:     Ns,
    /// html byte offset → originating JSX span. Drives sourcemap segments INSIDE
    /// the hoisted template literal. DELIBERATELY EXCLUDED from the hash.
    pub origin: AVec<'a, (u32, Span)>,
    pub hash:   u64,                     // filled by P7
}

#[derive(Clone, Copy)]
pub enum SkelNode<'a> {
    Element(SkelElement<'a>),
    /// Already HTML-escaped at compile time. Both backends emit these bytes
    /// verbatim — one escape function, two consumers, zero divergence.
    Text(&'a str),
    /// A child position owned by the patch program. Materialises as NOTHING in
    /// the DOM template and as a chunk boundary in SSR.
    Slot(SlotId),
    /// A `<!---->` the DOM backend needs as an insert anchor. Created only by P5,
    /// only when no cheaper anchor exists.
    Marker(SlotId),
    /// Raw unescaped bytes.
    RawHtml(&'a str),
    /// A position that writes no bytes and materialises nothing: what P3 leaves
    /// where it folded a constant child into a neighbouring text run, so no
    /// NodeId after it moves.
    Empty,
}

#[derive(Clone, Copy)]
pub struct SkelElement<'a> {
    pub tag:      TagId,                 // Interner::tag carries VOID / RAW_TEXT / PRESERVE_WS
    pub attrs:    &'a [SkelAttr],        // STATIC ONLY, in SOURCE order
    pub children: (NodeId, NodeId),      // half-open range into Skeleton::nodes
    pub ns:       Ns,
    /// how many children materialise a node — P6 uses this to choose
    /// firstChild-forward vs lastChild-backward
    pub mat_kids: u32,
}

#[derive(Clone, Copy)]
pub struct SkelAttr {
    pub name:  NameId,
    /// Position among the element's attributes in source order, so P3 can put a
    /// folded attribute back where the author wrote it.
    pub order: u32,
    pub value: SkelAttrValue,
}

#[derive(Clone, Copy)]
pub enum SkelAttrValue {
    Bare,          // `disabled` with a literal-true value in an ATTRIBUTE channel
    Str(StrId),    // pre-escaped for a double-quoted attribute context
}
```

`Skeleton::validate` states every structural invariant P6 addressing and P7 hashing assume
(column lengths, document order, `mat_ix` agreeing with the node kinds, raw HTML never beside a
sibling), and `passes/mod.rs` runs it over every fixture after the pass stage. Every consumer
handles `RawHtml`; no stage of the current pipeline constructs one, because P3 never folds the
`dangerouslySetInnerHTML` channel.

`TagId`/`NameId` are interned per module by `ir::Interner`, whose rows are `TagRow { text, flags:
TagFlags }` and `NameRow { text, flags: NameFlags }`. `TagFlags` are `VOID`, `RAW_TEXT`,
`ESCAPABLE_RAW_TEXT`, `PRESERVE_WS`, `SVG` and `CLAMPS_VALUE`; `NameFlags` are `IS_EVENT`,
`IS_DELEGATED`, `IS_DOM_PROP`, `IS_CLASS`, `IS_STYLE`, `SVG_KEBAB_EXEMPT`, `FORM_STATE` and
`CONSTRAINS_VALUE`. Every bit that mirrors the runtime comes from `src/tables.rs`, which `build.rs`
generates from the runtime sources (§9); the remainder are HTML tree-construction facts declared in
`ir/intern.rs`. After P1 no pass compares a tag or attribute string: it compares an id or reads a
flag bit.

### 2.2 Layer 2 — Patch program

```rust
// src/ir/patch.rs
#[derive(Clone, Copy)]
pub struct Patch {
    pub target: NodeId,   // the element, or the parent element of a slot
    pub span:   Span,     // original JSX span → sourcemap
    pub op:     Op,
}

#[derive(Clone, Copy)]
pub enum Op {
    // ── attributes / properties ───────────────────────────────────────────
    /// React::Static. Applied once at clone time: no effect, no thunk, no closure.
    SetOnce   { name: NameId, value: ExprId, chan: Chan },
    /// React::Reactive. P5 folds these into the unit's EffectGroup.
    SetLive   { name: NameId, value: ExprId, chan: Chan, diff: Diff },
    /// React::Opaque. The CHANNEL is resolved, the value's LIVENESS is not, so
    /// the value goes to `bindProp` beside the channel the compiler picked.
    SetOpaque { name: NameId, value: ExprId, chan: Chan },

    // ── events ────────────────────────────────────────────────────────────
    /// The event TYPE is resolved (`onClick` → `click`) but the value is not
    /// proved a handler. `capture` is set by `on…Capture` and `capture:x`.
    SetEvent { event: NameId, value: ExprId, capture: bool },
    /// `el.__bq_click = h`, or `el.__bq_click = [h, data]` for the bound-tuple form.
    /// THE TUPLE LIVES IN `__bq_<type>`. There is no `__bq_<type>Data` in this runtime.
    Delegate { event: NameId, handler: HandlerRef, data: Option<ExprId> },
    /// addEventListener, for everything outside the 22-name delegated set and
    /// for every capture binding.
    Listen   { event: NameId, handler: HandlerRef, capture: bool },

    // ── misc element ──────────────────────────────────────────────────────
    /// `ref` is not a prop. `write` is true when the value is a writable
    /// binding, which lowers to an assignment.
    Ref        { value: ExprId, write: bool },
    /// `<form action={…}>`: a URL or a submit handler, decided by the value.
    FormAction { value: ExprId },
    /// `bind:x`, with the property and the reporting event resolved from the
    /// tag and the `type` attribute.
    Bind       { prop: NameId, event: NameId, value: ExprId },
    Spread     { value: ExprId, live: bool },

    // ── children ──────────────────────────────────────────────────────────
    Insert { slot: SlotId, anchor: Anchor, value: ExprId, plan: InsertPlan },
    /// A child hole the flow pass proved is a control-flow REGION. `region`
    /// indexes `Unit::regions`, which carries the primitive's arguments.
    Region { slot: SlotId, anchor: Anchor, region: RegionId },

    // ── structure ─────────────────────────────────────────────────────────
    /// The next `len` patches that fuse (`passes::group::fuses`), wherever they
    /// stand in the unit, share ONE bindEffect. Created only by P5.
    EffectGroup { len: u16 },
}

/// The channel an attribute resolves to, decided ONCE at P1 from NameFlags,
/// the element's namespace and the `prop:` override.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Chan {
    /// setAttribute / removeAttribute
    Attr,
    /// DOM_PROPS, and everything `prop:` forces. NEVER folded into skeleton
    /// HTML: template HTML would only set the default attribute, which
    /// diverges on a dirty form field.
    Prop,
    /// A property the USER also writes: compared against the ELEMENT, and the
    /// caret is preserved. Always paired with Diff::Always.
    Live,
    /// the whole `class` attribute
    Class,
    /// the whole `style` attribute
    Style,
    /// `dangerouslySetInnerHTML={{ __html }}`
    Html,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Diff {
    /// emit `if (v !== prev)` — oracle PARITY with the runtime's own
    /// `value === prev` short-circuit, not an optimisation.
    Identity,
    /// value may be an object mutated in place — always write
    Always,
    /// The channel is handed the previous APPLIED value and returns the new
    /// one, written back into the record. Class, Style and Html.
    Thread,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Anchor {
    /// Nothing materialises after this hole in its parent: insert() appends.
    End,
    /// The next materialising sibling doubles as the anchor. Zero marker nodes.
    Node(NodeId),
    /// A dedicated `<!---->` was materialised by P5.
    Marker(NodeId),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InsertPlan {
    /// React::Static: `insert(p, v, a)` — the non-function path, ZERO effects.
    Once,
    /// React::Reactive: `insert(p, thunk_or_accessor, a)`.
    Live,
    /// React::Opaque: pass the value through; insert() decides, as the oracle does.
    Opaque,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HandlerRef { Inline(ExprId), Hoisted(HoistId) }
```

There is no `setProp` dispatcher on the compiled DOM path. The channel is a compile-time fact, so
each channel is its own runtime entry point (`setAttr`, `setDomProp`, `setLive`, `setClass`,
`setStyle`, `setHtml` in `packages/web/src/dom.ts`), and the only question left to the runtime
is the one `SetOpaque` defers: whether the value that arrived is a live Cell.

### 2.3 The reactivity lattice (grafted from DepSet)

```rust
// src/ir/react.rs
/// `Static ≡ ∅`, `Reactive ≡ non-empty dep set`, `Opaque ≡ ⊤`.
/// Join is `max`, so the bottom-up fold is branch-light.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Default)]
pub enum React { #[default] Static = 0, Reactive = 1, Opaque = 2 }

/// The tracked reads of an expression, as a 64-bit mask over the unit's dense
/// symbol numbering. No arena slices, no merging, no allocation.
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct DepSet { pub mask: u64, pub overflow: bool }

/// `ReactiveEnv::bit` stores this when a symbol does not fit the mask.
pub const BIT_OVERFLOW: u8 = 255;

impl DepSet {
    pub const EMPTY: Self = Self { mask: 0, overflow: false };
    pub fn single(bit: u8) -> Self { /* BIT_OVERFLOW ⇒ { mask: 0, overflow: true } */ }
    pub fn join(self, o: Self) -> Self {
        Self { mask: self.mask | o.mask, overflow: self.overflow | o.overflow }
    }
    pub fn is_empty(self) -> bool { self.mask == 0 && !self.overflow }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Const<'a> { Str(&'a str), Num(f64), Bool(bool), Null, Undefined }

/// What the expression EVALUATES TO. Decides thunk pass-through vs wrap, and
/// which SSR specialisation applies.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Shape {
    Str, Num, Bool, Nullish, Obj, Arr, Node, #[default] Unknown,
    /// `() => T` the user wrote, or a bare accessor symbol read. The dep-set of
    /// the BODY lives in `Rx::inner` — creating a closure itself reads nothing.
    Accessor,
    Handler,
    /// `[fn, data]` bound-handler tuple
    HandlerTuple,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Thunk {
    #[default] None,   // emit as-is
    Arrow,             // wrap: `() => expr`
    /// expr was exactly `f()` with `f` a zero-arg accessor binding: emit bare `f`.
    /// Saves one closure allocation per hole, per row.
    Eta,
}

#[derive(Clone, Copy, Debug)]
pub struct Rx<'a> {
    pub react: React,
    pub deps:  DepSet,
    /// dep-set of the BODY when `shape == Accessor`; otherwise unused
    pub inner: DepSet,
    pub konst: Option<Const<'a>>,   // Some ⇒ foldable into the skeleton
    pub shape: Shape,
    pub free:  FreeVars,
    pub thunk: Thunk,
}

impl<'a> Rx<'a> {
    /// What P1 records before P2 runs. Opaque is sound for every expression.
    pub const OPAQUE: Self = /* Opaque, empty deps, Unknown shape, Thunk::None */;

    /// QUERY 1 — the only reactivity question codegen ever asks.
    /// `Static` ⇒ emit the value; NO thunk, NO bindEffect, NO closure.
    pub fn live(self) -> bool {
        match self.shape {
            Shape::Accessor => !self.inner.is_empty(),
            _               => self.react != React::Static,
        }
    }
    /// QUERY 2 — the only constant question codegen ever asks.
    pub fn fold(self) -> Option<Const<'a>> {
        if self.react == React::Static { self.konst } else { None }
    }
    /// Target #7's hoisting predicate.
    pub fn hoistable(self) -> bool {
        matches!(self.shape, Shape::Accessor | Shape::Handler) && self.free.only_globals
    }
}

/// Free variables of an arrow/function, relative to the enclosing component
/// scope. `only_globals` is the handler-hoisting predicate (target #7).
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct FreeVars { pub mask: u64, pub only_globals: bool }
```

`React::join` is `max`. P2's own join of two sub-expressions departs from it in one place: a part
PROVED `Reactive` stays `Reactive` beside an `Opaque` part, so `on() ? styles.on : styles.off`
keeps its tracked read instead of dissolving into "unknown" and being evaluated once.

### 2.4 Symbol classification

```rust
// src/ir/symbols.rs
/// What a resolved binding IS. Assigned per SymbolId, so shadowing is free,
/// name collisions are impossible, and `import { createSignal as sig }` just works.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum SourceKind {
    /// Calling it is a reactive read: what `createSignal()[0]` and
    /// `createMemo()` hand back.
    Accessor,
    /// ANY member read is a reactive read: `createStore()[0]`,
    /// `createProjection()`, `createOptimisticStore()[0]`.
    ReactiveObject,
    /// A compiled component's props parameter: a record whose every member is
    /// a Cell. Taking `props.x` reads nothing; calling it is the tracked read.
    PropsParam,
    /// Resolves to a primitive imported from `coreSource` or `moduleSource`;
    /// drives the return-shape table.
    Primitive(Prim),
    /// The row VALUE parameter of a keyed `<For>`. A PLAIN VALUE, not an
    /// accessor — `(item: T, index: () => number)`. Getting this wrong is the
    /// classic name-heuristic bug.
    RowValue,
    /// Bound to a never-reassigned literal. The value lives in ReactiveEnv::konst.
    ConstLit,
    /// Provably reads no reactive state
    Inert,
    /// Bound to a function or arrow and never reassigned, so the binding IS the
    /// handler. `nullary` is the arity rule: a zero-arity binding forwards by
    /// identity as a Cell, a parameterised one crosses as `() => f`.
    Fn { nullary: bool },
    /// Unresolvable: cross-module import, reassigned binding, or bound by a
    /// pattern we cannot follow.
    #[default]
    Opaque,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Prim {
    Signal,          // createSignal
    Computed,        // createMemo
    Store,           // createStore
    UseContext,      // useContext
    CreateContext,   // createContext — its result is the provider component
    Optimistic,      // createOptimistic
    OptimisticStore, // createOptimisticStore
    Projection,      // createProjection
    MapArray, Repeat, Untrack,
    /// `isPending(fn)` / `latest(fn)`: they INVOKE their argument, so the read
    /// is theirs and not the call site's.
    ReadMode,
    Dynamic,         // the `dynamic(source)` factory
    ClientOnly,      // the `clientOnly(fn)` factory
    /// `<Dynamic>`, which barq does not export. Resolved only so BARQ025 can
    /// name the replacement.
    RemovedDynamic,
    Flow(Flow),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Flow {
    // string-inlinable on the server
    For, Repeat, Show, Switch, Match,
    // NOT string-inlinable — need real server implementations
    Loading, Errored, Reveal, Portal,
    /// Not control flow: renders its children once and decides whether the
    /// CLIENT claims the markup. Here because the lowering tables key on Flow.
    NoHydration,
}

/// How `<For>` (and `<Show>`/`<Match>`) hands a value to `children`, read off
/// `keyed`. A key FUNCTION boxes the row in a signal, so it is a third arm.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Keyed {
    ByItem,   // absent or `true` — `(item: T, index: () => number)`
    ByIndex,  // `keyed={false}` — `(item: () => T, index: number)`
    ByFn,     // a key function, or anything not PROVED not to be one
}

pub struct ReactiveEnv<'a> {
    pub kind:  IndexVec<SymbolId, SourceKind>,
    /// the value behind a ConstLit, parallel to `kind`
    pub konst: IndexVec<SymbolId, Option<Const<'a>>>,
    /// dense per-unit renumbering of the reactive symbols, for DepSet::mask.
    /// BIT_OVERFLOW = does not fit.
    pub bit:   IndexVec<SymbolId, u8>,
    /// Pre-order scope ranges. oxc creates scopes in pre-order, so
    /// "is scope A nested in scope B" is two integer comparisons, and the
    /// free-variable test for handler hoisting is O(1) per reference.
    pub scope_lo: AVec<'a, u32>,
    pub scope_hi: AVec<'a, u32>,
    pub diagnostics: AVec<'a, Diag<'a>>,
    pub fixes: Vec<Fix>,
    /// `import * as core from "@barqjs/core"`: a member resolves to no
    /// SymbolId of its own, so `core.For` is looked up through here.
    pub namespaces: Vec<SymbolId>,
    /// zero-arity functions whose body reads something tracked, sorted
    pub derived: Vec<SymbolId>,
    // … jsx_closings, contexts, components, cell_slots, root_blocks,
    //   root_jsx_args, plain_rows, rows_read_once
}

impl<'a> ReactiveEnv<'a> {
    pub fn nested(&self, outer: ScopeId, inner: ScopeId) -> bool {
        let (a, b) = (outer.index(), inner.index() as u32);
        self.scope_lo[a] <= b && b < self.scope_hi[a]
    }
}
```

`Diag { code, span, message }` carries the diagnostic code a pass raised, so suppression and
severity key on it, and `Fix { code, span, edits }` is the machine-applicable edit that repairs
it.

### 2.5 Expression table

```rust
// src/ir/expr.rs
pub struct ExprTable<'a> {
    pub entries: AVec<'a, ExprEntry<'a>>,
}

pub struct ExprEntry<'a> {
    pub src:  ExprSrc<'a>,
    pub span: Span,
    pub rx:   Rx<'a>,
}

/// The expression is OWNED. P1 moves the parsed node straight out of the JSX it
/// is deleting, so nothing is cloned and the original Span survives into the
/// emitted AST, which is what makes the sourcemap byte-exact.
pub enum ExprSrc<'a> {
    /// The node the parser produced, unmodified.
    Verbatim(Expression<'a>),
    /// Built by the compiler in the same arena: thunks, shaped control-flow
    /// calls, merged prop objects, SSR row specialisations.
    Built(Expression<'a>),
    /// Folded away by P3, or moved into the emitted AST by P8. ExprIds stay valid.
    Folded(StrId),
}
```

A `class` or `style` value is one expression on one `Chan::Class` / `Chan::Style` patch, whatever
its form: a string, an array or an object. The compiler folds a constant string into the skeleton;
any other form is handed whole to the runtime channel (`setClass`, `setStyle`), which normalises it
with `classToString` and the style-object rules and threads the applied form back through
`Diff::Thread`.

### 2.6 Addressing, units, module

```rust
// src/ir/address.rs
/// DOM backend only. The patch program never contains the word `firstChild`.
pub struct RefPlan<'a> {
    pub defs:    AVec<'a, RefDef>,   // emission order == definition order
    pub of_node: AVec<'a, RefId>,    // NodeId → RefId (NONE = not needed)
}

#[derive(Clone, Copy)]
pub struct RefDef { pub node: NodeId, pub step: Step, pub name: StrId, pub span: Span }

/// One binding's whole walk: an optional descent composed with a run of
/// sibling hops, so `_el$1.firstChild.nextSibling` is ONE def.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Step {
    Root,
    FirstChild(RefId, u32),    // base.firstChild, then n × nextSibling
    LastChild(RefId, u32),     // base.lastChild, then n × previousSibling
    NextSibling(RefId, u32),
    PrevSibling(RefId, u32),
}

/// The other sense of "address": the name of a POSITION, the same on every
/// target. `(unit, position)`; the module half lives on the artefact.
pub struct Address { pub unit: u32, pub position: u32 }
pub struct Position { pub address: Address, pub kind: PositionKind, pub key: u32, pub span: Span }
pub enum PositionKind { Slot, Prop, Event, Ref, Bind, Spread }
```

```rust
// src/ir/module.rs
pub struct Unit<'a> {
    pub skeleton: Skeleton<'a>,
    pub patch:    AVec<'a, Patch>,
    pub exprs:    ExprTable<'a>,
    /// the region side table `Op::Region` indexes
    pub regions:  AVec<'a, Region<'a>>,
    pub refs:     RefPlan<'a>,       // empty until P6
    /// NodeId → originating JSX span; P7 turns this into Skeleton::origin
    pub spans:    AVec<'a, Span>,
    /// (element, attribute, source position) for every attribute P1 could not bake
    pub attr_order: AVec<'a, (NodeId, NameId, u32)>,
    /// a spread, and the names written after it on its element
    pub spread_later: AVec<'a, (Span, &'a [&'a str])>,
    pub template: TemplateId,        // assigned by P7; NONE until then
    pub site:     Site,
    /// 0 is the module's own renderer; any other indexes Module::renderers (§8)
    pub renderer: u8,
}

impl<'a> Unit<'a> {
    /// Target #2 is this predicate, nothing more.
    pub fn is_pure_static(&self) -> bool { self.patch.is_empty() }
}

/// Where the compiled statements may be spliced. Only `Nested` needs an IIFE;
/// every other site emits flat statements — one fewer closure allocation, one
/// fewer stack frame, and far more readable output.
pub enum Site { Return(Span), Init(Span), ArrowBody(Span), Nested(Span) }

/// One JSX root, in the numbering of the `_jsx$N` placeholders harvest left.
pub enum Root<'a> {
    Pending(Expression<'a>, Site),   // harvested, not lowered yet
    Unit(UnitId),                    // the template path
    Verbatim(Expression<'a>),        // refused by P1: a component, a fragment, or
                                     // markup the HTML parser reshapes
}

pub struct Module<'a> {
    pub source:    &'a str,
    pub units:     AVec<'a, Unit<'a>>,
    pub roots:     AVec<'a, Root<'a>>,
    pub interner:  Interner<'a>,
    pub uids:      Uids<'a>,
    /// Every template's bytes, concatenated. A template is a contiguous range, so
    /// a dedup hit is `html.truncate(range.0)` — a duplicate leaves no residue.
    pub html:      String,
    pub templates: AVec<'a, TemplateRow>,
    /// parallel to `templates`; emission facts kept out of the hash
    pub template_meta: AVec<'a, TemplateMeta>,
    pub dedup:     FxHashMap<u64, TemplateId>,
    pub dedup_overflow: Vec<TemplateId>,
    pub delegated: u32,               // bitset over the 22 DELEGATED_EVENTS
    pub hoisted:   AVec<'a, Hoisted<'a>>,
    /// regions the flow pass staged, indexed by the `_g$N` placeholder
    pub regions:   AVec<'a, Option<Region<'a>>>,
    pub positions: Vec<Position>,     // filled by passes::address::locate
    pub env:       ReactiveEnv<'a>,
    pub scoping:   Scoping,
    pub maps:      Mappings,
    pub helpers:   [&'a str; HELPER_COUNT],   // every helper's local name
    pub target:    Target,                    // what renderer 0 compiles for
    pub renderers: Vec<Renderer<'a>>,
    pub renderer_ranges: Vec<(u32, u32, u8)>,
    // … props_params, tag_reads, locator, folded_reads, flow_rewrites,
    //   used_helpers
}

pub struct TemplateRow  { pub range: (u32, u32), pub ns: Ns, pub hash: u64 }
pub struct TemplateMeta { pub wrapped: bool, pub span: Span, pub renderer: u8 }

pub enum Hoisted<'a> {
    /// module-scope `const _h$1 = (e) => {…}` — capture-free handler
    Handler { id: HoistId, expr: &'a Expression<'a>, span: Span },
    /// module-scope frozen literal for a fully-Const spread / style object
    Frozen  { id: HoistId, expr: &'a Expression<'a>, span: Span },
    /// module-scope `const _k$1 = () => "w"` — a constant prop Cell, deduped
    /// module-wide, so a constant prop costs zero per-instance allocation
    Cell    { id: HoistId, expr: &'a Expression<'a>, span: Span },
}

/// Three parallel u32 columns, appended only at semantic boundaries. Byte
/// offsets throughout; line/column conversion runs once at the end against a
/// precomputed line-start table (LineIndex).
#[derive(Default)]
pub struct Mappings {
    pub gen_off: Vec<u32>,
    pub src_off: Vec<u32>,
    pub name:    Vec<NameId>,
    /// generated byte ranges of the template literals these segments address
    pub literals: Vec<(u32, u32)>,
}
```

```rust
// src/ir/region.rs
/// Which of the runtime's flow primitives owns a range.
pub enum RegionKind { Branch, Each, Error, Loading, Portal, Island }

/// One control-flow instance, lowered: the arguments its primitive takes, named
/// by meaning because the primitives disagree about argument order.
pub struct Region<'a> {
    pub flow:  Flow,
    pub kind:  RegionKind,
    /// STATIC_KEY | NO_SCOPE (proved), HYDRATE | DETECT | WHOLE (asked for by
    /// the build); zero is always safe
    pub flags: u8,
    pub span:  Span,
    pub key:      Option<Expression<'a>>,  // branch key / each source / portal target
    pub body:     Expression<'a>,          // the Block(s)
    pub keyed:    Option<Expression<'a>>,  // each's keyOf
    pub fallback: Option<Expression<'a>>,
    pub on:       Option<Expression<'a>>,  // a loading boundary's `on`
    /// the source list a spread put the props behind, read once around the call
    pub sources:  Option<(&'a str, Expression<'a>)>,
}
```

**Generated names.** `Uids` hands out every identifier the compiler writes: `_el$N` (refs),
`_tmpl$N` (templates), `_jsx$N` (root placeholders), `_h$N` (hoisted handlers), `_k$N` (hoisted
Cells), `_b$N` (hoisted Blocks), `_g$N` (region placeholders), `_o$N` (spread source lists),
`_v$`/`_p$` (a fused effect's value and previous record) and `_ir$N` (the reference backend's
serialised units). `free_names` scans the source once and appends `$` to any base the source
already spells, so no generated name can collide with a user binding. The runtime helpers are
imported under a sigil prefix (`_$insert`) that `codegen::free_sigil` chooses the same way.

**Lifetime discipline.** `Module<'a>` borrows the per-file oxc `Allocator`. Each compile creates
its own `Allocator`, and the module, the IR and the program are dropped with it; nothing is reused
across files. `Module::scoping` is oxc's symbol table detached from the AST, so it holds
`SymbolId`s and owned names and stays valid while codegen rewrites the program.

---

## 3. The passes

### P0 Bind

**In:** the `Program` after the props pass (`src/props_sugar.rs`) has rewritten prop reads.
`analysis::bind` builds the symbol table once with `SemanticBuilder::new()` (no `AstNodes`
store, no control-flow graph, no syntax checker) and detaches it as an owned `Scoping`.

**Out:** `ReactiveEnv` — `IndexVec<SymbolId, SourceKind>`, the constant column, the dense bit
renumbering, `scope_lo`/`scope_hi` — plus the renderer ranges of §8 and the diagnostics below.

**Enables:** target #1, and it is the precondition for #3, #7, and #8.

`analysis/bind.rs` resolves the **local binding** of every `coreSource` and `moduleSource`
import (`@barqjs/core` and `@barqjs/web` by default) by module specifier and imported name
(`Prim::of_export`), so `import { createSignal as sig }` classifies correctly and a user-defined
`const createSignal = 1` does not. A namespace import is recorded in `namespaces`, so
`core.createSignal(0)` and `<core.For>` resolve too. Then a worklist runs to fixpoint over:

- **Return-shape table per primitive** (`Binder::returns`), which is `@solidjs/signals`'.
  `createSignal(v)` and `createOptimistic(v)` → `[Accessor, Fn { nullary: false }]`: the
  setter is a named handler a handler slot can take by reference. `createMemo`, `mapArray` and
  `repeat` → `Accessor`. `createStore(o)` and `createOptimisticStore(o)` →
  `[ReactiveObject, Inert]`. `createProjection(f)` → `ReactiveObject`. `useContext` and
  `createContext` → `Opaque`: a context hands back whatever was provided, and a wrong guess is a
  silently dead UI. `untrack`, `isPending` and `latest` → `Inert`, because the binding holds a
  plain value; the CALL is the tracked read, and that is P2's to say.
- **Aliasing.** `const c = count` → `Accessor`; `const c = count()` → `Inert`.
- **Literals.** A never-reassigned binding initialised with a literal → `ConstLit`, its value in
  `ReactiveEnv::konst`.
- **Functions.** A never-reassigned binding initialised with a function or arrow →
  `Fn { nullary }`. After the fixpoint, `Binder::derive` collects into `derived` every
  zero-arity one whose body calls an accessor or another derived function, or reads a member of a
  store or of props: calling `double()` is then a tracked read.
- **Reassigned bindings.** A symbol oxc marks mutated is skipped and stays `Opaque`.
- **Props.** Every parameter the props pass declared as a component's props record →
  `PropsParam`. `const { text } = props` → `Accessor`: the binding holds the Cell the prop
  crossed as, not a snapshot of its value.
- **Control-flow parameter attribution, by arity and position, from the real signatures**
  (`Binder::row_params`). By-item `For` (the default): `(item: T, index: () => number)` ⇒
  `(RowValue, Accessor)`. `For keyed={false}`: `(item: () => T, index: number)` ⇒
  `(Accessor, Inert)`. A key FUNCTION boxes the row in a signal ⇒ `(Accessor, Accessor)`.
  `Repeat`: `(index: number)` ⇒ `(Inert)`. `Show` and `Match` default to non-keyed and hand a
  narrowed accessor ⇒ `(Accessor)`; keyed, they hand the value ⇒ `(RowValue)`. A callback passed
  by name, `<For>{row}</For>` or `children={row}`, takes the same kinds as the inline one.
  Anything that cannot be proved — `keyed={KEYED}`, `keyed={props.keyed}`, or a **spread**, which
  can carry `keyed` where nothing can read it — takes the key-function arm (`Keyed::verdict`),
  because that is the arm that is safe when wrong: an accessor read that turns out to be a plain
  value falls out `Opaque` and is emitted unwrapped, where a plain value that turns out to be an
  accessor is applied once and never updated. The attribution is then an ASSUMPTION, and the
  accessor diagnostics are told so: they say nothing about a row whose `keyed` they cannot see,
  because `row()` on a plain object throws.
- **Scope ranges.** One linear scan over scopes in creation (pre-order) order fills
  `scope_lo`/`scope_hi`, making the free-variable test for handler hoisting two integer compares
  per reference.

`number_reactive_symbols` then gives a `DepSet` bit to every symbol whose read is a tracked read
(`Accessor`, `ReactiveObject`, `PropsParam`) and every derived function.

Inside the same entry point, `analysis::boundary::scan` resolves renderer boundaries and claimed
intrinsics (§8), `analysis::nesting::check` reports markup the HTML parser reshapes (BARQ026), and,
when diagnostics are on, `analysis::render::check` reports the render-scope rules (BARQ018 to
BARQ021).

### Diagnostics

The compiler reports codes BARQ001 to BARQ034 (BARQ005 to BARQ007 are not in use), declared with
their default severity in `src/diag.rs` and documented one page each in `docs/`. Each is raised
by the stage that can see it: the accessor misuse codes BARQ001 to BARQ003 and BARQ011 by P0
(`analysis/bind.rs`), BARQ004 by the shape and flow passes, BARQ010 by the shape pass, the CSS
codes BARQ014 to BARQ017, BARQ032 and BARQ033 by `src/css.rs`, BARQ018 to BARQ021 by
`analysis/render.rs`, the Solid 1.x spellings BARQ022 to BARQ025 by `analysis/migration.rs`,
BARQ026 by `analysis/nesting.rs`, BARQ029 by `analysis/boundary.rs`, the props refusals BARQ030,
BARQ031 and BARQ034 by the props pass, and BARQ012, BARQ013 and BARQ028 by the driver;
BARQ027 comes from `compile.rs`'s `document_only` after the passes. BARQ001 to BARQ003 and BARQ022 to BARQ024 carry
machine-applicable fix edits (`Fix`, and `migration::Removed::fix`); `src/fixes.rs` applies every
offered fix, compiles the result again, and requires the finding to be gone. A
`barq-ignore-next-line` comment suppresses a code on the next line, and one that suppresses
nothing or is malformed is itself reported (BARQ008, BARQ009).

### P1 Lower

**In:** the JSX roots `harvest` moved out of the program (`Root::Pending`), and `ReactiveEnv`.
**Out:** one `Unit { Skeleton, patch, ExprTable }` per root it accepts, `Root::Verbatim` for one
it refuses — the **only** traversal of the JSX tree.
**Enables:** target #11.

Deliberately dumb and fast. Literal attributes and text go straight into the skeleton,
pre-escaped by `lower::entity`. Every dynamic attribute becomes a `SetOpaque` with its channel
already resolved (`lower::names::channel_of`); an `on*` attribute becomes `SetEvent`, `ref`
becomes `Ref`, `bind:x` becomes `Bind`, a spread becomes `Spread`, `<form action>` becomes
`FormAction`. Every child hole becomes an `Insert` with `InsertPlan::Opaque` and a provisional
`Anchor::Marker`, and every value starts as `Rx::OPAQUE`, so "no analysis at all" is already a
correct compiler. Expressions are moved in as `ExprSrc::Verbatim` — **no AST is ever cloned**.
`Unit::spans` records each node's JSX span as it is written, and a delegated event name sets its
bit in `Module::delegated`.

Attribute name normalisation happens here, as `dom.ts`'s `attrNameOf` does it: `className` →
`class`, `htmlFor` → `for`, SVG names kebab-cased *except* the generated
`SVG_KEBAB_EXEMPT_NAMES` (`class` and `viewBox`). Event keys are lowercased exactly as
`key.slice(2).toLowerCase()` does (`ir::event_name_of`).

An intrinsic element is refused off the template path (`Lower::inlinable`) when the browser's
tree builder would not produce it as written: markup the parser reshapes (`lower::parse`), a tag
that leaves foreign content, an SVG element that is not a template root, an HTML element inside
`<math>`, a `<template>` with anything dynamic inside, or an element with a `children=`
attribute. A refused root stays JSX (`Root::Verbatim`): P4 turns the components in it into calls,
a fragment becomes an array, and codegen builds each refused intrinsic with
`_$element(tag, props)` (`codegen/fallback.rs`), whose DOM insertion never foster-parents. Units
nested inside it are lowered as roots of their own.

### P2 Classify

**In:** `Unit` + `ReactiveEnv`.
**Out:** every `ExprEntry.rx` filled; every `SetOpaque`, `SetEvent`, `Insert` and `Spread`
resolved; capture-free handlers hoisted.
**Enables:** targets #1, #7, #8.

The lifting rule (`passes/classify.rs`, `Lift::rx`), bottom-up over each expression:

| form | verdict |
|---|---|
| `Ident(s)` where `s: ReactiveObject \| PropsParam` | `Reactive`, deps = `{s}` |
| `Ident(s)` where `s: Accessor` | `Static`, `Shape::Accessor`, inner = `{s}` |
| `Ident(s)` where `s: Fn { .. }` | `Static`, `Shape::Handler` |
| `Ident(s)` where `s: ConstLit` | `Static`, the constant |
| `Call(f, [])` where `f: Accessor`, or `f` a derived `Fn { nullary: true }` | `Reactive`, deps = `{f}`, `Thunk::Eta` |
| `Call(props.x, [])` or `_$readProp(props.x)` where `props: PropsParam` | `Reactive`, deps = `{props}` |
| `Member(o, m)` where `o: PropsParam` | `Static`, `Shape::Accessor`, inner = `{o}` — the member is the Cell, calling it is the read |
| `Member(o, m)` where `o: ReactiveObject` | `Reactive`, deps = `{o}` |
| `Member(o, m)` where `o: Accessor` | `Opaque` — a member of a function carries nothing |
| `Member(o, m)` where `o: RowValue` | `Opaque`, `Thunk::Arrow` — a store writes the row's field in place, so the hole reads it |
| `Member` on an `Opaque` object | `Opaque`, `Thunk::Arrow` |
| `Call(untrack, [fn])` | `Static`, regardless of the body |
| `Call(isPending \| latest, [x])` | `Reactive`, deps = the reads of `x` — they invoke their argument |
| zero-arg `Arrow` | `Static`, `Shape::Accessor`, inner = deps of the body — creating a closure reads nothing |
| `Arrow` with parameters, `Function` | `Static`, `Shape::Handler` |
| `Call(String \| Number \| Boolean, [x])` (unshadowed) | `x`'s verdict, folded when `x` is constant |
| `Call` / `New` with a proved-reactive callee or argument | `Reactive`, deps = those reads |
| any other `Call` | `Opaque`, `Thunk::Arrow` — evaluating a call spends its reads, so it crosses as the function that makes it |
| Binary / Logical / Conditional / Template | join of the parts; a `Const` condition SELECTS a branch instead of joining |
| `Parenthesized(e)`, TS wrappers, `a?.b` | transparent: the verdict of `e` or of `a.b` |

`React::Opaque` is the load-bearing middle value. It is emitted **unwrapped**, so the runtime's
`bindProp` / `insert` make exactly the decision the un-compiled oracle makes. "I don't know" is
therefore a sound, oracle-identical, zero-cost answer — which is why the analysis never needs to
guess from a name.

Then each patch is resolved (`Classify::resolve`). A `SetOpaque` whose value is proved `Static`
and is a value rather than something callable becomes `SetOnce`; one proved live becomes
`SetLive` with its `Diff` (`Thread` for `Class`/`Style`/`Html`, `Always` for `Chan::Live` or an
object, `Identity` otherwise); everything else stays `SetOpaque`. An `Insert` takes
`InsertPlan::Once` when static, `Live` when reactive or an opaque CALL, `Opaque` otherwise. A
`Spread` is `live` unless its source is proved static.

`FreeVars` for each closure is computed by walking its references and testing
`env.nested(own_scope, binding_scope)`: a binding declared outside the closure and below module
scope clears `only_globals`, and so does `this`, `arguments` or `eval`. `Rx::hoistable` is the
hoisting predicate, and a hoisted closure moves into `Module::hoisted` as `Hoisted::Handler`.

Event delivery: a `SetEvent` whose value is a `Handler`, an `Accessor` or a bound tuple becomes
`Delegate` when the lowercased name is in the **22-name** `DELEGATED_EVENTS` set (see §9 — the set
does *not* contain `change`, `submit`, `keypress`, `focus`, `blur`, `mouseenter`, `mouseleave`;
assuming otherwise produces silently dead handlers) and the binding is not a capture, and `Listen`
otherwise. A value not proved a handler, and a bound tuple outside the delegated set, stays
`SetEvent`, and the runtime's own `isEventHandlerValue` decides.

### Order (`passes/order.rs`)

An `<input>` or `<select>` sanitizes a write to `value` or `checked` against its `type`, `min`,
`max`, `step` and `multiple` as they stand at that moment, so a range input's `value = 2500`
written before its `max` is clamped to 100 for good. When an element's value is written by a
patch, the patches writing those constraints on it move to the front of the unit's program:
ahead of the value however the attributes were spelled, and ahead of the effect group header,
whose first run writes every member where the first member stood. It runs after P2 on every
target and level, so the address table stays the same for the DOM and string backends and
under `-O0`.

### P3 Fold

**In:** `Unit`.
**Out:** `Unit` with patches migrated **into** the skeleton.
**Enables:** targets #3 and #2 (as a free consequence), and #8.

The constant itself is computed by P2: literal `+` chains, arithmetic over numbers, template
literals with all-`Const` holes, `ConstLit` symbol reads, `cond ? a : b` and `cond && x` with a
`Const` cond, and `String`/`Boolean` over constants. P3 (`passes/fold.rs`) then bakes two things:

- **A `SetOnce` attribute** whose value `Rx::fold` answers moves into `SkelElement::attrs` at its
  source position: `true` becomes a bare attribute, `false`/`null`/`undefined` drop it, anything
  else becomes its escaped text.
- **A constant child** replaces its `Slot` with `SkelNode::Text`, or with `SkelNode::Empty` for
  `null`, `undefined` and booleans, which render nothing. Adjacent text runs are fused, and the
  second becomes `Empty` rather than being removed, so no `NodeId` after it moves.

Every fold deletes a patch and records the names the folded expression read in
`Module::folded_reads`, so `codegen/prune.rs` can delete a literal `const` that has no reader left.

**Refusals, each for a specific reason:**

- Never fold a `Chan::Prop` or `Chan::Live` name. `DOM_PROPS` values are written as
  *properties*; baking `value="x"` into HTML sets only the default attribute and diverges on a
  dirty field. `multiple` on `<select>` is the exception, because the parser has to see it before
  the options arrive.
- `Chan::Class` and `Chan::Style` fold only a constant STRING, the one form their channel writes
  verbatim; an array class or a style object is normalised by the runtime. `Chan::Html` never
  folds.
- Never fold onto an element that carries a spread: P1 keeps its attribute order for the spread.
- A number becomes text only when it is an integer in the safe range, `NaN` or an infinity;
  anything else is refused rather than reimplementing JS number formatting.
- Never fold a child into a raw-text element or into an element whose content a patch replaces,
  and never fold a string the tokenizer would rewrite or an empty string, which is a text node to
  `element()` and no node at all to the parser.

A fully-static subtree emerges here for free: it produced no patch in P1 and no patch survives
P3, so it will get no `RefId` in P6 and contribute exactly zero statements.

P3 is skipped for a unit whose renderer is universal (§7): a host is owed the value itself.

### P4 Shape

**In:** every expression still holding a component or control-flow element, in units and in
refused roots.
**Out:** those elements replaced by `ExprSrc::Built` call expressions with per-prop Cells, and the
control-flow constructs the flow pass accepts staged as `Region` rows.
**Enables:** target #8.

**Component calls.** `Shaper::component_call` turns `<Comp a={x}>{k}</Comp>` into

```js
_$createComponent(Comp, { a: () => x, children: _$block(() => k) })
```

and a development compile appends the tag's name, then its location when source names are on
(§4): `_$createComponent(Comp, {…}, "Comp", "src/App.tsx:7:3")`. `createComponent`
(`packages/core/src/signals.ts`) runs the component under an owner of its own, so a binding its
body installs stays the component's (`SEMANTICS.md` C1). A context provider written as a tag is
called directly in a production compile, because it opens a scope of its own. On the client, a
component call that is not built exactly once (a unit root, a construct's body) may run inside a
compute — a hole's condition, a `map` — so it is wrapped in `_$untrack(() => …)` and its setup's
reads do not become the compute's.

**Props are Cells.** Every own property of the props object is a Cell or a Block
(`SEMANTICS.md` C3). `Shaper::cell_at` decides each slot of a construct, in order:

1. JSX, or a value that builds DOM, becomes a Block, `_$block(() => …)`.
2. `x={() => s()}` η-reduces to `x: s`, because a signal getter is a Cell.
3. A value already carrying the calling convention — an accessor, a props member, a zero-arity
   function — is forwarded by name, so forwarding depth never becomes closure depth (C5).
4. A literal crosses as a module-hoisted, deduped `const _k$N = () => …` (`Hoisted::Cell`).
5. A value whose identity is observable — a parameterised function, an array, an object — is
   evaluated once into `_$cell(v)`, unless its contents move.
6. Everything else is `() => expr`: not memoised, and the CONSUMER's effect subscribes.

A user component's named prop goes through `Shaper::prop_cell`, which keeps 1 and 4 to 6 and
forwards only a props member. A function written there is the prop's value, a callback, and taken
for its Cell the component's first read called it.

JSX children are a Block (C6). A spread is not a JavaScript spread: the props are an ordered
source list, `_$props([a, { b: () => x() }, c])`, read last-wins, and a single plain record is
passed as itself (C9).

**Props are written as values.** In the component's source, a prop is written as the value its
type says it is. The props pass (`src/props_sugar.rs`) runs before P0 and rewrites each read:
`props.title` in value position becomes `_$readProp(props.title)`; a prop handed straight on as an
attribute or child stays the Cell itself, so forwarding is identity; `{...props}`, `omit(props,
…)` and `cells(props)` take the record; any other use takes `values(props)`, a view that reads
each Cell on access. A destructured parameter becomes one named record (`_props$1`) and each bound
name the read it stood for, so destructured props stay reactive; a default becomes
`_$withDefault(…)`. Assigning to a prop is BARQ030, and a pattern it cannot keep reactive is
BARQ031. Inside the component every read is therefore `_$readProp(props.x)` or a forward of
`props.x`, which P2 classifies as a tracked read and a Cell respectively.

**Control flow** (`passes/flow.rs`). A recognised construct stops being a component and becomes
a `Region` row in `Module::regions`, with a `_g$N` placeholder left where the call stood. It
lowers onto the runtime's primitives:

| construct | primitive | key |
|---|---|---|
| `Show` | `branch` | the value, or truthiness under `keyed={false}` |
| `Switch` / `Match` | `branch` | the winning arm's INDEX, an integer |
| `For` | `each` | `keyOf`, whose default is IDENTITY |
| `Repeat` | `each` (`COUNT`) | the index |
| `Loading` | `boundary("loading")` | the collector's |
| `Errored` | `boundary("error")` | the collector's |
| `Portal` | `portal` | the mount |
| `NoHydration` | `island` | none |

`Reveal` lowers to a `reveal` call, because it creates a provide scope and not a range. A key the
compiler proves static sets `STATIC_KEY`, and a body that registers nothing disposable sets
`NO_SCOPE`; zero flags are always safe. The pass refuses a `Switch` whose arms are not literal
`<Match>` elements and an unreadable `keyed` written as a static attribute; a refused construct
stays a component call (`For`, `Show`, `Match`, ... in `packages/core/src/components.ts`), which
reaches the same primitive through an adapter. `Match` returns its own props object and `Switch`
reads them, so a `Match` that is not folded into its `Switch` stays a real call. With `-O0` the
flow pass is off and every construct is a component call, which is the reference the `-O0`/`-Ox`
differential grades the pass against.

### P5 Peephole

**In:** `Unit`.
**Out:** anchors chosen, markers materialised or elided, `EffectGroup` prefixes inserted; may
mutate the skeleton.
**Enables:** targets #4, #8, #9.

**Anchor selection** (`passes/anchor.rs`), in order — this is the generalisation of "no marker
when nothing follows":

1. Nothing materialises after the slot in its parent (an `Empty` is looked past) →
   `Anchor::End`.
2. The next materialising node is another slot → `Anchor::Marker`. (Two holes must never share
   an anchor, or their reconciliations interleave.)
3. The next materialising node is a `Text` run **and** the previous sibling is also a `Text`
   run → `Anchor::Marker`. The HTML parser fuses adjacent literal text into one node, so
   without a marker the two runs are indistinguishable and `firstChild` addresses the wrong
   thing. This case is a theorem about the parse, not a wish.
4. The next node is `RawHtml`, which is bytes and not a node count → `Anchor::Marker`.
5. Otherwise → `Anchor::Node(next)` and emit **nothing**. A hole followed by a static element or
   by a single text run costs zero comment nodes.

Inside a raw-text element, and inside an element whose content a patch replaces, a `<!---->`
would be text or would be deleted, so every hole there takes `Anchor::End`. With the `anchor`
optimisation off, every other hole gets its own marker. The pass splices the markers in and
renumbers the unit in one pass; it is the last pass that may change the skeleton's shape. It runs
for the DOM and universal targets, and for the string backend under `hydratable`, where the
client's walk indexes the server's child list and the marker is a node in it.

**Effect grouping** (`passes/group.rs`). Every live binding of one template, on whichever element,
shares one `EffectGroup { len }`, as Solid 2.0's compiler fuses a template's dynamic bindings. An
opaque value joins too when the compiler wraps it in a thunk (an opaque call), read through
`readOpaque` as `bindProp` would read it: the runtime would have opened an effect for it anyway.
The header goes where the first member stands and no member moves, because addresses are numbered
in program order on both targets. `len == 1` lowers to a thunk compute with a scalar `prev`.
`len >= 2` lowers to one `bindEffect` (a render effect) whose compute returns a flat record and
whose apply compares each field with the previous record before writing.

There is no cost-based split. A change to any read re-runs every compute in the record, an
expensive one included, and only the fields that moved are written. Rows are where effects are
created by the thousand: on js-framework-benchmark one effect per row instead of one per bound
element took creating 1,000 rows from 1.83 to 1.65 ms and their memory from 2.09 to 1.88 MB,
while selecting a row, which re-runs every row's whole record, stayed at 1.00 ms.

After P5, `claim_regions` moves each staged region whose placeholder is exactly a hole's value
into that unit's `regions` table and turns the `Insert` into `Op::Region`, so the primitive is
handed the `(parent, anchor)` pair the template walk computes. A region that stands free of any
template stays on the module and is called with `(null, null)`. `address::locate` then records the
compile-time `Address` of every position, on every target; nothing downstream reads it, so
compiling the corpus both ways and diffing the address sets is evidence about the IR.

### P6 Address (DOM only)

**In:** `Skeleton` + the set of `NodeId`s the patch program references, plus their ancestors.
**Out:** `RefPlan`.
**Enables:** target #5.

Costs are in property reads. Candidate anchors for a needed node are `{Root}` ∪ `{already
materialised siblings}`, with the step alphabet `{firstChild, lastChild, nextSibling,
previousSibling}`.

Minimising the route to each needed node *separately* is the wrong objective: a ref that already
exists costs nothing to walk from, so what the emitted code pays is the **sum** of the steps.
Minimising the sum is a **minimum spanning tree** over `{parent} ∪ {needed materialised children}`,
where the parent–child edges weigh `min(1 + i, 1 + (n-1-i))` (a `firstChild` or `lastChild`
descent) and consecutive-sibling edges weigh `Δ`. A longer sibling edge can never be in the tree,
because it costs at least the hops it spans, so the graph is a path plus a hub and one Kruskal pass
over `2k - 1` edges settles it. Emission order is the tree walked outward from each descent, which
keeps every def walking from a def defined EARLIER.

A `Step` also carries a hop count on its descent, so `_el$1.firstChild.nextSibling` is ONE def:
an intermediate binding that exists only to be walked THROUGH is pure waste.

Bidirectional addressing is the win a firstChild-only scheme leaves on the table: reaching child
8 of 10 is 2 reads via `lastChild.previousSibling`, not 9. Ties break toward the **shallower**
expression — a shorter dependency chain of loads has better ILP than a deep one of the same
length — which the edge ordering gets by offering the descents first. With the `walk`
optimisation off, every node descends from its own parent with `firstChild` and a run of
`nextSibling`.

`mat_ix` is what makes this correct: a `Slot` materialises no node, so a leading hole must not
shift the walk. `<p>{hole} clicks</p>` has exactly **one** materialised child, at index 0.

Nothing is emitted for a node reachable as the root itself, and nothing at all when
`Unit::is_pure_static()`. `RefPlan::validate` enforces the invariant that every ref is
materialised **before** any mutation runs, because `insert` splices nodes and invalidates
sibling walks.

### P7 Intern

**In:** `Module` (all units whose renderer walks the document).
**Out:** template bytes in `Module::html`, a `TemplateId` per unit.
**Enables:** target #6.

`passes/serialize.rs` serialises each skeleton once, appending to `Module::html`, and hashes the
contiguous range it wrote together with `ns` and the wrapper flag (everything that changes what
`template()` returns). It probes `Module::dedup` and compares the bytes, the namespace, the wrapper
flag and the renderer before sharing, because a merged collision would be a silent wrong-DOM bug;
a genuine 64-bit collision lands in `dedup_overflow` and costs a duplicate row, never a merge. On
a hit, `html.truncate(start)` so the duplicate leaves no residue, and the unit reuses the
existing `TemplateId`. On a miss, the bytes stay.

Because `SlotId` is skeleton-**local** and every expression lives in layer 2,
`<div class="row">{a()}</div>` and `<div class="row">{b()}</div>` hash identically and share one
`_tmpl$`. Dedup is module-wide and cross-component by construction. `Skeleton::origin` is
excluded from the hash so sourcemap data never defeats a share.

**Attribute order is SOURCE order.** Template identity is the emitted bytes, and those bytes carry
attributes in the order the JSX wrote them, so `<div id="a" class="b">` and `<div class="b" id="a">`
do not share one row. The only way two elements can share a `template()` call is by having
identical HTML, so a sorted HASH over unsorted BYTES would be a hash that lies, and sorting the
emitted markup itself costs the line-up with the JSX that a human debugging a production stack
trace reads. The cost is one extra template row and no behavioural difference: attribute order
carries no meaning to the HTML parser, and `test/normalize.ts` sorts it out of the DOM diff.

The other two module-wide collections are built earlier: P1 collects the union of delegated event
names into `Module::delegated`, and P2 hoists capture-free handlers into `Module::hoisted`. Codegen
emits the union as one `delegateEvents([...])` call per module.

---

## 4. DOM codegen rules (P8a)

Output is built with `oxc_ast::AstBuilder` in the same arena and printed by `oxc_codegen`.
`codegen::emit` visits the program, replaces each placeholder with its unit's code, then runs
`prune` (literal constants P3 left without a reader) and `install` (imports and preamble).

**Module preamble.** After the leading run of imports: one helper import per source, then
`` const _tmpl$N = /* @__PURE__ */ _$template(`…`) `` per template row — safe to mark pure
because `template()` closes over a string and does no DOM work until first call — then the
hoisted handlers and Cells (`const _h$N = …`, `const _k$N = …`), then one
`_$delegateEvents([...])`. Module evaluation order guarantees every render root listens for the
module's types before any event can fire.

**Foreign templates.** `template(html, foreign)` in `packages/web/src/dom.ts` parses a template
whose root is foreign content only by position inside the parent that makes it so: `true` wraps
the markup in `<svg>…</svg>` and `2` in `<math>…</math>`, and the inner first child is returned.
So the flag is for a template rooted at an SVG or MathML *child* (`<path>`, `<g>`, `<mi>`); a
template rooted at `<svg>` or `<math>` itself takes no flag, because HTML template parsing
handles an inline `<svg>` correctly.

**Multi-root fragments.** `template()` returns `content.firstChild` only. A fragment therefore
emits one template per root and returns an array — `insert`, `render`, and `childToNodes` all
accept arrays.

**Per unit** (`codegen/dom.rs::emit_unit_parts`): emit the whole `RefPlan` first, then the patch
program in document order through the `Backend` trait.

| Op | emitted |
|---|---|
| `SetOnce{chan}` | `_$setAttr(el, "k", v)` — or `_$setDomProp`, `_$setLive`, `_$setClass`, `_$setStyle`, `_$setHtml` per channel |
| `SetLive` in `EffectGroup{len:1}` | `_$bindEffect(() => v, (_v$, _p$) => { _$setAttr(el, "k", _v$, _p$); })` |
| `SetLive` in `EffectGroup{len:n}` | one `_$bindEffect(compute, apply)` over a record |
| `SetOpaque{chan}` | `_$bindProp(el, _$setAttr, "k", v)` — unwrapped; the runtime decides liveness |
| `SetEvent` | `_$bindEvent(el, "click", v)` (`, true` for capture) |
| `Delegate` | `el.__bq_click = h, el.__bqs = _$getOwner()` / `el.__bq_click = [h, data]` |
| `Listen` | `_$listen(el, "k", h)` (`, true` for capture) |
| `Ref` | `_$ref(el, r)`, or `binding = el` when `write` |
| `FormAction` | `_$formAction(el, v)` |
| `Bind` | `_$bindValue(el, "value", "input", v)` |
| `Spread` | `_$spread(el, o)`; a live spread passes `() => o`, and the names written after it on the element follow as an array; on a `<select>` a fourth `true` holds its `value` and `selectedIndex` |
| `SpreadSelection` | `_$spreadSelection(el)`, after the `<select>`'s children: writes what its spread held |
| `Insert{Once}` / `Insert{Opaque}` | `_$insert(p, v, a)` |
| `Insert{Live, eta}` | `_$insert(p, accessor, a)` |
| `Insert{Live}` | `_$insert(p, () => v, a)` |
| `Region` | `_$branch(p, a, key, bodies, flags)`, `_$each(p, a, src, keyOf, row, flags, fallback)`, `_$boundary(p, a, kind, fallback, body, flags, on)`, `_$island(p, a, block, flags)`, `_$portal(target, block, flags)` |

A component call reaches a hole as its value: `_$insert(p, _$createComponent(Comp, {…}), a)`. The
flow primitives are `@barqjs/web`'s (`packages/web/src/dom-flow.ts`), thin bindings of core's
`branchIn`, `eachIn`, `boundaryIn`, `islandIn` and `revealIn` (`packages/core/src/flow.ts`) to the
document host. The `__bqs` expando is written once per element and carries the owner the
delegated dispatcher routes a throw to.

**The fused-effect form.** The engine's effects take two functions, so the record is the
compute's return and the previous record is the apply's second argument:

```js
_$bindEffect(() => ({ a: a(), b: b() }), (_v$, _p$ = {}) => {
  if (_v$.a !== _p$.a) _$setAttr(el, "x", _v$.a);
  if (_v$.b !== _p$.b) _$setAttr(el, "y", _v$.b);
});
```

A user-written `() => expr` member is inlined into the compute, which deletes the user's closure;
a `Diff::Thread` member writes the channel's return back into the record; an opaque member is read
through `_$readOpaque(v, "k")`; and a lone `class` binding computes `_$classToString(v)` so the
effect's own equality skips an unchanged class.

**η-reduction.** With the `eta` optimisation on, an expression whose `Rx::thunk` is `Thunk::Eta`
(`count()`) is emitted as the bare callee (`count`) wherever a thunk is wanted, saving one closure
per hole; a signal getter IS a Cell, and a Cell ignores its arguments.

**Statement splicing.** `Site::Return` / `Init` / `ArrowBody` emit flat statements into the
enclosing function body. Only `Site::Nested` wraps in an IIFE. One fewer closure allocation and
one fewer stack frame per component instance.

**Ref naming.** `_el$N` comes from `Uids`, whose base the source never spells, so it cannot
collide with a user binding.

**Hydration.** Under `hydratable` the walk calls `_$child(base, k)` and `_$sib(base, k)` instead
of `.firstChild`/`.nextSibling`, because the server's child list holds a `<!--[-->` … `<!--]-->`
range at every hole and a logical step counts a range as nothing; a third argument `1` walks
backward. A non-live hole value is wrapped as `_$hole(p, a, () => v)`, so a component claims from
its own hole rather than from wherever the walk left the cursor. A hole or region that owns its
parent's whole child list passes `WHOLE` and the server writes it no boundary comments. None of
these appear when `hydratable` is off.

**Source names.** A development compile turns on `source_names` (option `sourceNames`, default
`dev`). The source-names pass (`src/source_names.rs`) runs before P0 and adds a `name` and `loc`
to every engine primitive call, `createSignal(0, { name: "count", loc: "src/App.tsx:3:29" })`, as
Solid's own `sourceNames` pass does. In codegen, `Emit::labelled` wraps each effect-making binding
in `_$labelled("li.class", "src/App.tsx:7:9", () => …, el)`, so the owner it creates is named for
the element and attribute it writes (`packages/core/src/signals.ts`, `labelled`).

---

## 5. SSR codegen rules (P8b)

P6 is skipped entirely — no addressing is needed to concatenate strings. Two mechanical
differences from the DOM backend, and nothing else.

**A different skeleton serialiser.** `codegen/ssr.rs::node_into` walks the same `nodes` array as
P7's writer (`passes/serialize.rs`) and emits the same pre-escaped bytes, with two rules changed:
`SkelNode::Marker` is skipped (a `<!---->` is a DOM insert anchor, meaningless on the wire) unless
the build is `hydratable`, where the client's walk counts it, and `SkelNode::Slot` terminates the
current chunk instead of producing nothing. Escaping happened once, at compile time, in P1 — the
`template()` string and the SSR chunk need identical escaping because both are parsed as HTML.

**A different opcode lowering table.** This table is the whole "the two backends cannot drift"
claim. Every backend implements `codegen::backend::Backend`, whose methods are generated from one
list of `Op` variants with no default bodies, and `backend::lower` dispatches with no wildcard arm:
a new opcode is a compile error in `lower` and in every backend until it is given a row. A
skeleton change lands in both serialisers by construction.

| Op | SSR |
|---|---|
| skeleton text / attrs | literal bytes in the template literal |
| `SetOnce` / `SetLive` / `SetOpaque` | one row: reactivity is irrelevant, the value is read once. `${_$attrLit("k", v)}` when the name is decided at compile time, `${_$attr("k", v, "tag")}` otherwise, ` k="${_$escAttr(v)}"` for a value proved a string, literal bytes for an all-literal style object |
| `Chan::Html`, `textContent`, `innerHTML` | `${_$content("k", v)}` in the child position |
| `Spread` | `${_$spreadAttrs(o, "tag")}`, and the element's whole attribute list goes through it in source order |
| `Bind` | `${_$attr("value", v[0], "tag")}` — the bound value's initial read |
| `FormAction` | `${_$formAttr(v)}` — a URL is written, a handler is not |
| `Delegate` / `Listen` / `SetEvent` / `Ref` | **dropped** — no cut is made, so `<button class="btn">Bump` stays one contiguous quasi with no empty `""` slot. A value that reads a member writes `${_$bindAttr("on:click", () => row.toggle)}`, a marker the runtime fills only when the value is a binding slot's |
| `Insert` | `${_$esc(v)}`; `${_$rawText(v, "script")}` inside a raw-text element; a nested unit's bytes inline; a value known to be markup as `${v.t}` |
| `Region` | `${_$branch(null, null, …).t}` — the same `region_call` as the DOM backend, with `(null, null)` |
| `EffectGroup` | **ignored**; its members flatten into the chunk stream |

**One template literal per unit.** A unit becomes `` _$html(`…${hole}…`) ``: one template literal
whose quasis are the static bytes and whose expressions are the holes (`Chunks::literal`), wrapped
by `html` into the branded `SsrHtml`. A hole whose value is already `SsrHtml` — a region, a flow
component the pass refused, a nested unit — interpolates its `.t`, the string it wraps, with no
`esc` around it; interpolating the object would have the engine look up and call `toString`. A
root that is exactly one such hole returns it without a wrap. A component call is user data until
proven otherwise and goes through `_$esc(…)`, which passes the `SsrHtml` a compiled component
returns straight through.

**Control flow on the server.** The flow pass lowers every recognised construct onto the
primitives before either backend runs. `@barqjs/server`'s `ssr.ts` implements `branch`, `each`,
`boundary`, `portal`, `island` and `reveal` as string builders under the same names and the same
argument order as `@barqjs/web`'s (`packages/web/src/dom-flow.ts`), so the compiler emits the
same call for both targets and picks the implementation by picking the import source
(`codegen::home`). A construct the flow pass refuses, or every construct at `-O0`, reaches a string
COMPONENT (`ssrShow`, `ssrFor`, `ssrSwitch`, ... in `ssr.ts`) that is an adapter over the same
primitives, so every construct has a string lowering and no module falls back to a DOM render on
the server.

**The server runtime.** `@barqjs/server`'s `ssr.ts` exports the helpers the string backend calls:

```ts
export function html(t: string): SsrHtml
export function esc(value: unknown): string
export function escAttr(value: unknown): string
export function rawText(value: unknown, tag?: string): string
export function attr(name: string, value: unknown, tag?: string): string
export function attrLit(name: string, value: unknown): string
export function spreadAttrs(props: unknown, tag?: string, svg?: boolean): string
export function content(name: string, value: unknown): string
export function formAttr(value: unknown): string
export function bindAttr(position: string, read: () => unknown): string
```

`escAttr` / `attr` reproduce `classToString`, the `CSS_NUMBER_PROPS` px rule, and `setAttr`'s
boolean, enumerated and nullish handling, so the string path and the DOM path emit identical
markup. The dual-render conformance suite (`test/ssr.test.ts`) protects that seam.

### What P8b emits

**The escaping tables are the SERIALISER's, not the spec's.** Text escapes `&`, `<`, `>` and
U+00A0; a double-quoted attribute escapes `&` and `"` and leaves U+00A0 raw; raw text (`<script>`,
`<style>`) escapes nothing. The spec escapes U+00A0 in both contexts and the two spellings parse to
the same character, so the attribute rule is a byte-for-byte agreement with the runtime rather than
a semantic choice. The compile-time escapers in `lower::entity` and the runtime ones in `ssr.ts`
are the same two tables, and `packages/server/src/ssr.test.ts` compares every cell against what
`createElement` + `innerHTML` produce for the same value.

**A compiled root returns branded HTML, not a bare string.** A bare string cannot answer the only
question a hole asks, "is this markup I produced, or data I have to escape?", because a component
returning `props.user.bio` and a component returning markup are both strings, and guessing wrong in
one direction is an XSS. The brand is `SSR_HTML_BRAND`, `Symbol.for("barq.ssr.html")`
(`packages/web/src/dom.ts`), on the `SsrHtml` object that carries the markup as `t`, tested with
`isSsrHtml`. `esc` passes it through, escapes everything else, and serialises a real `Node`.
`dom.ts` reads the same predicate at every value-to-node funnel. A registered symbol is unreachable
from `JSON.parse`, so a deserialised field can never pass as markup on the wire or on the client,
and it is identical across every copy of the module a bundle loads.

**`DOM_PROPS` reach the wire only as the attribute they reflect to.** The DOM path writes a
PROPERTY, and markup carries only content attributes: `disabled`, `multiple`, `readOnly`→
`readonly`, `defaultValue`→`value` and `defaultChecked`→`checked` reflect; `checked`, `selected`
and `indeterminate` are dirty values and write nothing. `value` is the one name whose answer
depends on the ELEMENT (nothing on `<input>`/`<textarea>`/`<select>`/`<output>`, the content
attribute everywhere else), so the compiler passes the tag as `attr`'s third argument.

**Four ops have no wire representation, and one construct legitimately differs.** `Delegate`,
`Listen`, `SetEvent` and `Ref` are dropped, and no chunk is cut for them. A `ref` CALLBACK is
therefore a client-only effect: a fixture whose ref mutates the element it is handed produces
markup the string path structurally cannot, which is declared per fixture (`ssrDiffers`). A region
on the client is placed at the `(parent, anchor)` pair its walk computed; on the wire a
`hydratable` build writes a `<!--[-->` … `<!--]-->` range around it (none when it owns its
parent's child list), and a build that is not hydratable writes nothing.

**P1's refusals are about PARSING, and no parser runs here.** A fragment, a `<table>` the parser
would give an implied `<tbody>`, a `<select multiple>`: all of them serialise directly
(`emit_verbatim_root`). `serialize` and `address` are skipped outright on this target, and `anchor`
runs only under `hydratable`: a `<!---->` is an insert anchor, a `template()` is a parse, and an
address is a sibling walk.

### Positions the escaping tables do not cover

The tables above are complete for a VALUE in a text or attribute position. Four positions are not
that, and each one is a different kind of answer.

**A raw-text element cannot be escaped, so the close sequence is neutralised instead.** There are
no entities inside `<script>`/`<style>`/`<xmp>`/`<iframe>`/`<noembed>`/`<noframes>`/`<noscript>`:
the tokenizer decodes nothing, so `&lt;` would reach the wire as four characters and corrupt the
content. The only sequence that must not survive is the one that ENDS the element, and it becomes
`<\/`. The tokenizer reads `</` followed by anything that is not an ASCII letter as raw text, and
`\/` is an identity escape in a JS string literal and in a CSS string alike, so a value carrying
`</script>` inside a payload survives verbatim where it matters. `<!--` goes with it in SCRIPT
data only: it is the sole route into script-data-escaped state, where a following `<script` stops
`</script>` closing the element, and in CSS it is a legal CDO token. Both halves exist:
`ssr.rs::neutralize_raw_text` for a literal the compiler can see (JSX text cannot hold a bare `<`,
but `&lt;/script&gt;` decodes to one) and `ssr.ts::rawText` for the value it cannot, which is why
the owning tag travels as `rawText`'s second argument. Here the DOM path is NOT a specification:
`renderToString` serialises a text node inside `<script>` verbatim, so its own bytes reparse into a
breakout, and happy-dom additionally escapes `<iframe>`/`<noscript>` content where a real browser
does not. The conformance suite therefore asserts the property (nothing escaped the element) rather
than equality with the oracle.

**An attribute NAME is refused when it is not one.** Only a spread can carry a name that is
runtime data; every compiled `attr(…)` call site passes a name the compiler wrote, and `attrLit`
is used only for a name the compiler checked against the XML `Name` production. `setAttribute`
answers a name outside that production with `InvalidCharacterError` and writes nothing, so
`{...{"x onload=alert(1) y": "1"}}` must not become three attributes on the wire. `ssr.ts::attr`
validates and throws, which makes the two paths agree, and where happy-dom is LAXER than a real
browser (it accepts U+2028 and U+00A0 in a name, and then serialises markup that reparses into
several attributes) the string path is deliberately the stricter one.

**A literal style object folds, and that is what makes `CSS_NUMBER_PROPS` observable.** Markup has
one `style=` slot and no CSSOM, so an object whose every key and value is a literal is serialised
at compile time by `ssr.rs::fold_style`, with `dom.ts::styleToString`'s rule and the px class read
from `tables::css_number_prop`, which `build.rs` regenerates from `dom.ts`. On the DOM target the
object is handed to the runtime whole and a drifted table is unobservable in the emit; here it is
wrong bytes. Anything the compiler cannot evaluate stays `attr("style", …)`.

### The opcode dispatch, and the two divergences that are real

**`attribute_slot` is the dispatch and it is total.** It is one match over `Op` with no wildcard
arm that decides where each op sits on the wire — a named attribute, an unnamed one, or elsewhere
— so a new opcode has to answer that question or the crate does not compile. A filter that quietly
dropped an opcode would produce missing output with no error, which is the precise silence the
`Backend` trait's no-drift guarantee exists to make impossible.

**A namespace import resolves to the same `Flow` as a named one.** `import * as core` (or `* as web`) binds no
symbol for `core.For`, so a split resolved by `SymbolId` alone would walk past `<core.For>` and
`<web.Portal>`. The bind walk records the namespaces, `ReactiveEnv::namespace_flow` answers a
member through the same `Prim::of_export` table, and `shape.rs::member_chain` carries the object's
`ReferenceId` into the emitted identifier so the backend resolves it by symbol rather than by
spelling.

**`<pre>` and the newline (O9).** The parser ignores one U+000A after `<pre>`/`<textarea>`/
`<listing>`, so the only spelling that yields a text node starting with a newline is a DOUBLED
newline, which is what both backends emit. A newline character reference does not help: the
tokenizer emits the same character token for it and the rule eats it too. The rule is about the
BYTE that follows the open tag, not about the first skeleton child: a `Slot` materialises nothing,
so the doubling looks past leading `Slot` nodes. The SERIALISER does not put the newline back:
Chrome writes `<pre>\na</pre>` for a node whose text is `\na`, so a byte comparison between an SSR
string and a serialised DOM legitimately differs by one newline, and a tree comparison in a real
browser does not differ at all. happy-dom implements neither half, so under the test DOM the
compiled template parses one newline long. Three rows in `test/browser-parse-check.ts` measure all
of it in real Chrome.

The comparison models both halves, each where it is actually lossy, and
`fixtures/pre-leading-newline.tsx` carries the shape. `test/normalize.ts` (tree against tree)
DETECTS whether the host parser implements the rule and canonicalises the leading run only where it
does not, so in real Chrome nothing is normalised and a compiler that stopped doubling is still a
divergence. `test/ssr.ts::sameTree` (markup string against a serialised DOM) canonicalises
unconditionally, because there the loss is the SERIALISER's and is present on every engine.
`test/browser.test.ts` admits exactly this one disagreement between the two parsers, and requires
it to still be reached. The exact byte count is pinned by `compile.rs`'s two tests over the emitted
template (`a_newline_eating_tag_keeps_its_leading_newline` and
`a_hole_in_front_of_the_newline_does_not_hide_it_from_the_doubling`), not by the fixture
comparison.

**The string half of the same rule, which is NOT the DOM half.** A template's hole materialises
nothing, so the parser's U+000A lands on the text BEHIND it and the doubling looks past leading
`Slot` nodes. A string's hole writes the value's own bytes against the open tag, and the compiler
cannot see their first one. So the string backend emits a newline of ITS own in front of the hole,
one the parser eats instead of the value, and does not double the literal behind it. The rule: for
`<pre>`/`<textarea>`/`<listing>`, guard when the first thing the element writes is a hole, a
content prop (`textContent`/`innerHTML`), or a literal that already begins with a newline. A hole
that renders empty is why the first case is unconditional: the literal behind it would otherwise
become the first byte. `<textarea>{value}</textarea>` is the shape it matters most for: P1 refuses
it, so the DOM path is `element()`, whose text node no parser ever reads.

`sameTree` cannot see any of this: it canonicalises the leading run on both sides, so a backend
that dropped the newline would compare equal to the oracle for ever. The bytes are pinned instead
by `compile.rs::the_string_backend_guards_a_hole_against_the_same_rule` and by the `O9:` rows of
`test/ssr.test.ts`, over `browser-parse-check.ts`'s measurement that one newline is exactly what
Chrome eats. `fixtures/pre-dynamic-leading-newline.tsx` carries the shape through the corpus.

**A rewritten flow import comes off.** When the compile rewrote every reference a flow binding had
(the shape pass to a region, the string backend to an `ssr*` component), the import specifier has
no reader and would keep the client's flow component in a server bundle for a call nothing makes.
`install.rs::drop_rewritten_flow_imports` counts the rewrites (`Module::flow_rewrites`) against the
binding's resolved references, minus the JSX closing tags, which oxc counts as references of their
own (`ReactiveEnv::jsx_closings`), and drops the specifier only when they match: one reader left is
one reader too many.

---

## 6. Sourcemap strategy

Three parallel `u32` columns, appended at semantic boundaries. Byte offsets throughout; the
line/column conversion runs once at the end against a precomputed line-start table (`LineIndex`),
so the emit loop never does line arithmetic.

Four sources of fidelity:

1. **Expressions keep their original spans by construction.** `ExprSrc::Verbatim` holds the node
   the parser produced and moves it into the emitted AST; the expression is never rebuilt, so it
   cannot drift. This matters most, because user expressions are the only executable code a
   template ever contains.
2. **Template interiors are mapped.** `Skeleton::origin` maps html byte offsets to JSX spans and
   is shared by both serialisers. `codegen/mappings.rs::collect` emits one segment per origin entry
   into the *interior* of the hoisted `` _$template(`…`) `` template literal — generated
   line/column inside a long literal are perfectly addressable, so a debugger stepping into
   `_tmpl$1` lands on the originating JSX element. `origin` is excluded from the content hash so it
   never defeats dedup.
3. **Every `Patch` and every `RefDef` carries a `Span`,** so `_el$4` maps to the `<p>` it walks
   to, and a production `Cannot read properties of null (reading 'firstChild')` lands on the
   right JSX line.
4. **SSR emits ONE template literal per unit**, not a `+` chain. The interpolations already sit
   at their own source positions and a template literal's quasis are addressable the same way a
   `+` chain's operands are, so a chain would buy nothing and cost a segment per operator.
   `Chunks::literal` builds the single literal and the backend's own test pins it
   (`code.matches('`').count() == 2`).

Fidelity is a tunable: every skeleton node knows its byte range, so per-attribute mapping inside
a template is available. Turning it up multiplies segment count and spends the compile budget, so
the default is the four boundaries above.

### How the map is built, and what a deduped template maps to

Points 1 and 3 are **not** built by hand. oxc's codegen records a segment per emitted AST node,
and every node this compiler emits already carries the span of the JSX that produced it, so the
expression segments and the `_el$N` / patch segments fall out of printing. `Mappings` therefore
holds exactly the segments oxc's builder *cannot* produce — point 2, positions inside a string
literal — and its `gen_off` column is filled after `Codegen::build`, because that is the first
moment a generated byte offset exists. The three columns are then converted once against a
`LineIndex`, turned into tokens and merged into oxc's map.

Two things are decided rather than derived:

- **A deduped template maps to its claimant.** After P7, one `_$template(…)` call serves N source
  sites. A source map is a *function* from a generated position to a source position, so N sites
  cannot all own one byte and the real choice is one site or none. It is the unit that first
  serialised those bytes (`mappings::claimants`): `Module::html` literally holds its
  serialisation, and every other site keeps a segment of its own on its `_tmpl$N()` clone call,
  which carries that site's span on the ordinary AST path. Mapping to nobody would leave the
  markup unattributed for every site including the one that wrote it. (A `Slot` materialises no
  bytes and so shares its html offset with the node that follows; the bytes belong to whichever
  node wrote them, and the hole is already mapped at the `insert` call that fills it.)
- **The first segment on a generated line reaches back to that line's first token.** oxc skips a
  node whose span it *just* recorded, and two emitted nodes legitimately share a span — a hole's
  anchor ref and the `insert` call that uses it are both the hole — so the second one prints
  unmapped, and when it starts a line the whole statement becomes unreachable. Extending the
  line's first segment leftwards invents no source position; it only gives a segment the reach
  leftwards that a consumer already assumes segments have rightwards. The fill applies only
  where the line really does start a statement. A generated line that CONTINUES a multi-line
  template literal starts in the middle of a token whose own segment is on the previous line, and
  filling column 0 there replaces a correct inherited position with the position of whatever comes
  next. `Mappings::literals` records the generated byte range of every literal point 2 mapped
  into, and a line starting inside one is left alone.

Where the preamble is spliced is a correctness question, not a formatting one: after the LEADING
run of imports, never after the last one. `import` is legal anywhere at the top level, and a
module whose import sits below JSX-bearing code would get `_tmpl$1()` above `const _tmpl$1 = …`, a
TDZ `ReferenceError` at module evaluation, green at compile time and dead in the browser. Every emitted
binding rides that one splice: templates, hoisted handlers and Cells, and the `delegateEvents` call.

What stays deliberately unmapped: the helper `import` and the module-scope `delegateEvents([…])`
call. Both are preamble synthesised from the module as a whole, with no single JSX origin, and
`SPAN` (an empty span) is how codegen says so — oxc emits no segment for one.

Cost, typical component file, release build: 0.0262 ms with no map, 0.0336 ms with oxc's, 0.0371 ms
with §6 complete. The map is ~29% of a mapped compile, of which about two thirds is oxc's own
builder and encoder. Maps are off by default and the mapped compile is 26x inside the 1 ms budget.

---

## 7. Universal codegen rules

`target: "universal"` compiles for a renderer made with `@barqjs/universal`'s `createRenderer`,
whose members the module named by `moduleSource` exports. `options.rs` resolves the target per
file: a file matching an entry of `renderers` takes that entry's `target` (`"universal"` when
absent) and `moduleSource`, the first match winning; otherwise the top-level `target` applies. A
file an entry gives to the universal target is compiled with `ssr`, `hydratable` and `interp`
off, because the build's document options describe its document files. A top-level universal
target asked for any of the three turns it off and reports [BARQ028](docs/BARQ028.md).

The analysis and the IR are the target's as they are the DOM's. What differs:

- **Lowering** applies no HTML parser rules (BARQ026 is about the document's parser), and an
  `on*` attribute is an event under the name the author wrote: never delegated, never
  lowercased, and spelled the same in the props object a spread reads.
- **P3 Fold is skipped.** Folding writes a constant into the template as text, and a host is owed
  the value itself: `width={3}` is the number 3.
- **The anchor pass runs**, because a hole on a custom host still needs a node standing after it.
  Serialisation and the sibling walk (`walks_the_dom`) do not: there is no `template()` to parse
  and nothing to walk.
- **Construction replaces the template.** `codegen/universal.rs` emits one `createElement` per
  element, one `createTextNode` per text run and one `insertNode` per static child, in document
  order, naming only the nodes something reads again (an insert's anchor, a unit's roots). The
  patch program then runs over those names exactly as the DOM backend runs it over the nodes its
  walk found.
- **Every channel is one `setProp`.** An attribute, a property, a class, a style, a ref and an
  event handler all arrive as `setProp(node, name, value)`, so `onClick={h}` is
  `setProp(el, "onClick", h)` and the host decides what a name means. A fused `EffectGroup`
  keeps one `bindEffect`, passing each channel's previous value as `setProp`'s fourth argument;
  an opaque value whose name is bare goes through `bindSlot`, and bindings that read only literals
  and the fields of one object through `bindPlain`.
- **Control flow is the DOM backend's call.** `insert`, `spread`, `branch`, `each`,
  `boundary`, `island`, `reveal` and `portal` take the same arguments and come from
  `moduleSource`, so `region_call` is shared.
- **Document-only syntax is an error.** A `bind:` or a form `action` is reported as
  [BARQ027](docs/BARQ027.md) by `compile.rs`'s `document_only`, after the passes.

`codegen::home(helper, target)` is the one table of where a helper is imported from: the
reactive half (`props`, `cell`, `block`, `readSlot`, `COUNT`, `getOwner`, `untrack`,
`createComponent`, `labelled`, `bindSlot`, `bindPlain`, `bindEffect`) from `coreSource` on every
target, the flow primitives from `moduleSource` on the DOM and universal targets and from
`serverSource` on the string backend, the renderer's other helpers from `moduleSource`, the string
backend's from `serverSource`, and the reference backend from `<moduleSource>/interp`. The props
pass imports its own helpers (`readProp`, `values`, `omit`, `withDefault`, `readTag`, `carry`) from
`coreSource`.

`test/universal.test.ts` compiles every fixture for this target, runs it through its steps on
`@barqjs/universal`'s in-memory host, and requires the tree the DOM backend builds in happy-dom.

---

## 8. Renderer boundaries and claimed intrinsics

A `boundaries` entry `{ source, name, target, moduleSource }` names a component whose children
build through another renderer than the JSX around it. The element itself is an ordinary component
call for the enclosing renderer; its JSX children and its `children` prop are compiled for the
entry's. An `intrinsics` entry `{ tags, claimUnknown, target, moduleSource }` gives a renderer
the trees of intrinsic elements its tags root, wherever they are written.

**Resolution.** `analysis/boundary.rs` runs inside P0, after the symbol table exists. A tag is a
boundary when it resolves by `SymbolId` to a value import of `name` from `source`, under any local
name, or when it is `ns.name` with `ns` a namespace import of `source`. A local binding of the same
name, a parameter that shadows the import, and an import of the same name from another module are
ordinary components. The scan records, per boundary, the source the children occupy (from the end
of the opening tag to the start of the closing one, and the value of a `children` attribute) as
`(start, end, renderer)` in `Module::renderer_ranges`. `Module::renderer_at(offset)` is the
innermost range holding an offset, or `0`.

**Claimed intrinsics.** The same walk assigns what no boundary covers, outermost first. Inside a
boundary's children everything is the boundary's, and inside a tree that already has a renderer
everything written in it, a hole's JSX included, follows the tree. At the top level, a tree of
intrinsic elements (its root and the intrinsic elements under it, through fragments, and not
through a hole) takes the renderer `intrinsic_owner` picks from its tags:

1. A root tag with a hyphen is a custom element and the document's.
2. A root tag the document does not have (`tables::is_document_tag`: the HTML Standard's element
   names with the obsolete ones its parser still knows, SVG's, and MathML Core's) goes to the one
   entry naming it, else to the one entry with `claimUnknown`, else to the document.
3. A root tag the document also has goes to the one entry naming it only when the tree holds a tag
   that entry alone names and the document does not have, and no `svg`: `<line>` is SVG,
   `<line>` around a `<bufferGeometry>` is a scene object.
4. Two entries naming the root tag, or two claiming unknown tags, is
   [BARQ029](docs/BARQ029.md), and the tree is the document's.

A claimed tree's whole span becomes a range. A component at the top level whose trees all went to
one renderer other than the module's own becomes a range too, after its children are walked, which
is what makes `<Show when={on()}><mesh /></Show>` call the scene renderer's `branch` rather than
the document's. Each tree is decided by its root alone, so `<><mesh /><div /></>` builds the two
through two renderers.

**Control flow that names no element.** `function Scene() { return <For each={xs()}>{(x) => <Box
x={x} />}</For> }` holds no intrinsic tag, so nothing at compile time says which renderer it is
for: it compiles for the module's own, and the emission is the same with or without the options.
Core's region entry points settle it at run time. A universal `render` provides its renderer
under `HOST` with `provideHost`, which the first time also installs a module-level redirect.
`branchIn`, `eachIn`, `boundaryIn`, `islandIn` and `revealIn` read that redirect first: until
a root has provided a renderer it is `null`, a document app pays that one read per region and
nothing else, and a bundle with no custom renderer does not carry the redirect's body. Once
installed, it looks `HOST` up on the current owner, and when that renderer is not the one the
region was compiled for, the region builds through the found host (and, for `eachIn`, its list
reorder) with the same arguments. The compiled call is unchanged, so the emission stays
byte-identical. A host has no server markup, so a universal `render` builds under `withoutClaim`
as `@barqjs/web`'s does, and a region's `HYDRATE` and `WHOLE` flags are inert there.
`@barqjs/web`'s `render` and `hydrate` bind the default back on their own roots with
`provideDefaultHost`, so a document overlay mounted inside a scene is the document's again. A body
that still builds one of the compiled-for host's nodes there (`RangeHost::owns`, which the document
host answers with `instanceof Node`) is refused at that node with an error naming the construct,
rather than handed to the other host's node operations.

**Renderers.** Renderer `0` is the module's own. Every other is a `(target, moduleSource)` pair,
numbered from `1` in `Module::renderers` in the order the scan first meets it, so two boundaries
into the same renderer share one. A document boundary whose `moduleSource` is the module's own maps
to `0`, which is what lets `<Canvas><Html>…</Html></Canvas>` return to the module's document
renderer. A module that writes no boundary and no claimed tag has an empty table, and its emission
is byte-identical to a compile without the options; `boundary.rs`'s corpus test
(`every_fixture_compiles_the_same_with_the_options_as_without`) compiles every fixture both ways,
with a scene renderer's tags and `claimUnknown`, under the client, hydratable and server settings,
and compares them.

**Lowering and the passes.** A unit's elements are all intrinsic and a boundary is a component, so
a whole unit sits on one side of every boundary: P1 stamps `Unit::renderer` from the unit's root
span and applies the universal lowering rules (§7) to the units whose renderer is universal. P3
Fold skips those units, P7 and P6 run only for units whose renderer walks the document, and P7's
dedup keys a template by its renderer as well as its bytes, because the clone comes from that
renderer's `template`. BARQ027 is raised for a universal unit wherever it sits, and BARQ026 is not
raised inside a universal boundary's children, which no HTML parser reads.

**Helpers.** `home(helper, target)` decides the home. A helper whose home is the renderer, emitted
for renderer `n > 0`, is imported from that renderer's `moduleSource` under the module's local name
with `$n` after it (`_$insert$1`), so the document's `insert` and a custom host's `insert` coexist
in one module. `free_sigil` already guarantees the source spells no `<sigil><helper>` prefix, which
covers the suffixed names. P4 asks the same question by span for the helpers it emits (`reveal`).
Core's helpers are shared. `install` emits one import per source: the core, renderer, server and
interp groups, then each renderer's group, merged with a group of the same source and attached to
an import of that source the module already writes.

**Codegen.** `Emit::enter(renderer)` switches `target`, `hydratable` and `detect` to the
renderer's and `Emit::leave` restores them. Every place a unit, a free region or refused JSX is
expanded enters the renderer that owns it: `unit` and `parts` by `Unit::renderer`, `region` and
`jsx` by `renderer_at` on the span. A universal renderer is entered with `hydratable` and
`detect` off, because a custom host claims nothing: no `HYDRATE` flag, no `child`/`sib` walk and
no `hole` inside it. A document renderer entered inside one is emitted as the module's other
document code is. Splicing asks the unit's own renderer. Templates are declared through their
renderer's `template`, and the module's `delegateEvents` call goes through the module's renderer
when it walks the document, else through the first document renderer a boundary entered.

**Host imports.** A module that still calls one of core's host components (`calls_a_component`)
loads the host of every renderer it holds: `<moduleSource>/host` for a document renderer and the
module itself for a universal one, skipping a module a helper import already loads and a source
the module already imports.

**The server.** The string backend enters no renderer. Before harvest,
`boundary::drop_server_children` removes a universal boundary's children and its `children`
attribute from the program, so the server module calls the boundary with the props it was written
with and none of the subtree (it never runs on the server, and the string backend has no lowering
for a host it does not have). A document boundary's children render to the string like any other
component's. A claimed tree outside every boundary compiles to the string as markup: a component
built from one is called on the server only if the page renders it outside a boundary. On the hydrating client the boundary is a component call at a hole like any other,
`_$hole(parent, anchor, () => _$createComponent(Canvas, { … }))`, so the node it returns claims the
server's markup in place, and its universal children are created only when it reads
`props.children`. A document boundary inside them mounts with `@barqjs/web`'s `render` into a
container of its own, often while the page is still hydrating; `render` builds under
`withoutClaim`, so that subtree takes nothing from the page's cursor.

---

## 9. Table generation, not transcription

`SVG_TAGS`, `DOM_PROPS`, `USER_MUTABLE_PROPS`, `CSS_NUMBER_PROPS`, `DELEGATED_EVENTS`,
`NON_BUBBLING_EVENTS`, the names `channelOf` intercepts and the SVG names `attrNameOf` exempts from
kebab-casing all live in `packages/web/src/dom.ts`, and the names `attr` answers about itself in
`packages/server/src/ssr.ts`. The compiler has to agree with every one of them byte for byte.
Nothing in a normal build enforces that, and drift produces *wrong HTML*, not a crash.

`build.rs` therefore reads both runtime files through `src/dom_ts.rs`, extracts the nine tables,
and writes them as sorted string arrays to `dom_tables.rs` in `OUT_DIR`, which `src/tables.rs`
includes and searches by binary search. `cargo:rerun-if-changed` on both files re-derives the
tables whenever the runtime moves, and an extraction that cannot find a table fails the build. The
tests in `src/tables.rs` run the same generator over the real files. This is a requirement, not a
nicety — it is the only mechanism that keeps the compiler and the runtime honest.

What is not a table is not generated. The px rule of `styleToString` is reproduced in
`ssr.rs::fold_style` over the generated `CSS_NUMBER_PROPS`, and class and style normalisation on
the DOM path is the runtime's own (`setClass`, `setStyle`, `classToString`), called rather than
reimplemented.
