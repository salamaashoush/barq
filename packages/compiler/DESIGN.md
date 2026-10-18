# The barq compiler's template IR: a skeleton and a patch program

Each template compiles to a static **skeleton**, the markup that never changes, and a **patch
program**, the operations that fill in its dynamic parts. The reactivity analysis (**DepSet**) and
the addressing, dedup and interning machinery (**Ribbon**) are grafted onto that split.

**Status.** The IR, the passes and the addressing are how `src/` is organised (`src/ir`,
`src/passes`, `src/codegen`). Primitive names such as `signal()` and the `signals.ts` line numbers
in P0 and P4 refer to barq's former reactive engine, which `@solidjs/signals` replaced; the SSR
runtime lives in `@barqjs/server`; and the emitted calling convention threads no scope argument
(`SEMANTICS.md` C1).

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

Because neither layer names a codegen target, one IR drives both backends. Target #2 —
"fully-static subtree ⇒ zero patch code" — is not a special case; it is `patch.is_empty()`.

```
                       oxc_parser ─→ Program<'a>
                                        │
                                  oxc_semantic
                                        │
  P0 Bind ────────────────────────────→ ReactiveEnv   (SymbolId → SourceKind, ScopeRanges)
                                        │
  P1 Lower  (the only JSX traversal) ─→ Unit { Skeleton, Vec<Patch>, ExprTable }
                                        │
  P2 Classify ──────────────────────→ Rx on every ExprEntry; events resolved
                                        │
  P3 Fold ──────────────────────────→ patches migrate INTO the skeleton
                                        │
  P4 Shape ─────────────────────────→ control-flow / component calls built; nested Units
                                        │
  P5 Peephole ──────────────────────→ anchors, marker elision, effect groups, η-reduction
                                        │
  P6 Address (DOM only) ────────────→ RefPlan (bidirectional walk elision)
                                        │
  P7 Intern ────────────────────────→ template dedup, handler hoisting, delegated union
                                   ┌────┴────┐
                            P8a Emit DOM   P8b Emit SSR
```

After P1 the tree is gone. Every pass from P2 on is a linear scan over a `Vec<Patch>` of 32-byte
POD records plus a `Vec<ExprEntry>`. That is the sub-millisecond story.

Passes P2 and P3 are two *judgements* but one *scan* in the implementation: `Rx` is computed
bottom-up over each expression and folding is the post-order return of the same walk. They are
listed separately because they answer different questions.

---

## 2. The Rust IR

```rust
use oxc_allocator::{Allocator, Vec as AVec};
use oxc_ast::ast::Expression;
use oxc_index::IndexVec;
use oxc_semantic::{ScopeId, SymbolId};
use oxc_span::Span;
use rustc_hash::FxHashMap;

pub type NodeId     = u32;   // index into Skeleton::nodes, document order
pub type SlotId     = u32;   // skeleton-LOCAL, document order — keeps hashes dedupable
pub type ExprId     = u32;   // index into ExprTable::entries
pub type RefId      = u32;   // index into RefPlan::defs
pub type StrId      = u32;   // interned &'a str
pub type TemplateId = u32;
pub type UnitId     = u32;
pub type HoistId    = u32;

pub const NONE: u32 = u32::MAX;
```

### 2.1 Layer 1 — Skeleton

```rust
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum Ns { Html, Svg, MathMl }

pub struct Skeleton<'a> {
    pub nodes:  AVec<'a, SkelNode<'a>>,  // index == NodeId, document order
    pub parent: AVec<'a, NodeId>,        // NONE for roots
    /// Position among siblings that actually materialise a DOM node. A `Slot`
    /// materialises nothing, so a leading hole must NOT shift the sibling walk.
    /// P6 walks these indices, never raw NodeIds.
    pub mat_ix: AVec<'a, u32>,
    pub roots:  (NodeId, NodeId),        // half-open; len > 1 ⇒ fragment
    pub ns:     Ns,
    /// html byte offset → originating JSX span. Drives sourcemap segments INSIDE
    /// the hoisted template literal. DELIBERATELY EXCLUDED from `hash`.
    pub origin: AVec<'a, (u32, Span)>,
    pub hash:   u64,                     // filled by P7
}

pub enum SkelNode<'a> {
    Element(SkelElement<'a>),
    /// Already HTML-escaped at compile time. Both backends emit these bytes
    /// verbatim — one escape function, two consumers, zero divergence.
    Text(&'a str),
    /// A child position owned by the patch program. Materialises as NOTHING in
    /// the DOM template and as a chunk boundary in SSR.
    Slot(SlotId),
    /// A `<!---->` the DOM backend needs as an insert anchor. Created only by P5,
    /// only when no cheaper anchor exists. Skipped by the SSR serialiser.
    Marker(SlotId),
    /// Raw unescaped bytes from a literal dangerouslySetInnerHTML.
    RawHtml(&'a str),
}

pub struct SkelElement<'a> {
    pub tag:      TagId,                 // interned; TAG_TABLE carries VOID/SVG/RAW_TEXT
    pub attrs:    &'a [SkelAttr],        // STATIC ONLY; name-sorted for stable hashing
    pub children: (NodeId, NodeId),
    pub ns:       Ns,
    /// how many children materialise a node — P6 uses this to choose
    /// firstChild-forward vs lastChild-backward
    pub mat_kids: u32,
}

pub struct SkelAttr { pub name: NameId, pub value: SkelAttrValue }

#[derive(Clone, Copy)]
pub enum SkelAttrValue {
    Bare,          // `disabled` with a literal-true value in an ATTRIBUTE channel
    Str(StrId),    // pre-escaped for a double-quoted attribute context
}
```

`TagId`/`NameId` are interned against a static PHF built at compile time from
`packages/web/src/dom.ts` (see §9). `TAG_TABLE[id]` and `NAME_TABLE[id]` carry the bit flags
`SVG`, `VOID`, `RAW_TEXT`, `PRESERVE_WS` / `IS_EVENT`, `IS_DELEGATED`, `IS_DOM_PROP`, `IS_CLASS`,
`IS_STYLE`, `SVG_KEBAB_EXEMPT`. After P1 no pass ever compares a tag or attribute string.

### 2.2 Layer 2 — Patch program

```rust
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
    /// React::Reactive. P5 always folds these into an EffectGroup.
    SetLive   { name: NameId, value: ExprId, chan: Chan, diff: Diff },
    /// React::Opaque. Emit the value UNWRAPPED into setProp so the runtime makes
    /// exactly the decision the un-compiled oracle makes.
    SetOpaque { name: NameId, value: ExprId },

    SetClass  { base: Option<StrId>, parts: (u32, u32), live: bool },
    SetStyle  { prop: NameId, value: ExprId, live: bool },

    // ── events ────────────────────────────────────────────────────────────
    /// `el.$$click = h`, or `el.$$click = [h, data]` for the bound-tuple form.
    /// THE TUPLE LIVES IN `$$<type>`. There is no `$$<type>Data` in this runtime.
    Delegate { event: NameId, handler: HandlerRef, data: Option<ExprId> },
    /// addEventListener, for everything outside the 22-name delegated set.
    Listen   { event: NameId, handler: HandlerRef },

    // ── misc element ──────────────────────────────────────────────────────
    Ref     { value: ExprId },
    Spread  { value: ExprId, live: bool },
    SetHtml { value: ExprId, live: bool },

    // ── children ──────────────────────────────────────────────────────────
    Insert  { slot: SlotId, anchor: Anchor, value: ExprId, plan: InsertPlan },

    // ── structure ─────────────────────────────────────────────────────────
    /// Prefix marker: the next `len` patches share ONE renderEffect.
    /// Created only by P5. `len == 1` lowers to the cheaper thunk form.
    EffectGroup { len: u16 },
}

#[derive(Clone, Copy)]
pub enum Chan {
    /// setAttribute / removeAttribute
    Attr,
    /// DOM_PROPS exception. These may NEVER be folded into skeleton HTML: the
    /// oracle writes the *property*; template HTML would only set the default
    /// attribute, which diverges on a dirty form field.
    Prop,
}

#[derive(Clone, Copy)]
pub enum Diff {
    /// emit `if (v !== prev)`. Mirrors applyResolvedProp's `value === prev`
    /// short-circuit — this is oracle PARITY, not an optimisation.
    Identity,
    /// value may be an object mutated in place — always write
    Always,
}

#[derive(Clone, Copy)]
pub enum Anchor {
    /// Nothing materialises after this hole in its parent: insert() appends.
    End,
    /// The next materialising sibling doubles as the anchor. Zero marker nodes.
    Node(NodeId),
    /// A dedicated `<!---->` was materialised by P5.
    Marker(NodeId),
}

#[derive(Clone, Copy)]
pub enum InsertPlan {
    /// React::Static: `insert(p, v, a)` — the non-function path, ZERO effects.
    Once,
    /// React::Reactive: `insert(p, thunk_or_accessor, a)`.
    Live,
    /// React::Opaque: pass the value through; insert() decides, as the oracle does.
    Opaque,
}

#[derive(Clone, Copy)]
pub enum HandlerRef { Inline(ExprId), Hoisted(HoistId) }
```

### 2.3 The reactivity lattice (grafted from DepSet)

```rust
/// `Static ≡ ∅`, `Reactive ≡ non-empty dep set`, `Opaque ≡ ⊤`.
/// Join is `max`, so the bottom-up fold is branch-light.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum React { Static = 0, Reactive = 1, Opaque = 2 }

/// The tracked reads of an expression. "Does it read anything tracked?" is the
/// question codegen asks, so a 64-bit mask over the unit's dense symbol
/// numbering is sufficient. No arena slices, no merging, no allocation.
#[derive(Clone, Copy, Default)]
pub struct DepSet { pub mask: u64, pub overflow: bool }

impl DepSet {
    #[inline] pub fn join(self, o: Self) -> Self {
        Self { mask: self.mask | o.mask, overflow: self.overflow | o.overflow }
    }
    #[inline] pub fn is_empty(self) -> bool { self.mask == 0 && !self.overflow }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Const<'a> { Str(&'a str), Num(f64), Bool(bool), Null, Undefined }

/// What the expression EVALUATES TO. Decides thunk pass-through vs wrap, and
/// which SSR specialisation applies.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    Str, Num, Bool, Nullish, Obj, Arr, Node, Unknown,
    /// `() => T` the user wrote, or a bare accessor symbol read. The payload is
    /// the dep-set of the BODY — creating a closure itself reads nothing.
    Accessor,
    Handler,
    /// `[fn, data]` bound-handler tuple
    HandlerTuple,
}

#[derive(Clone, Copy)]
pub enum Thunk {
    None,   // emit as-is
    Arrow,  // wrap: `() => expr`
    /// expr was exactly `f()` with `f` a zero-arg accessor binding: emit bare `f`.
    /// Saves one closure allocation per hole, per row.
    Eta,
}

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
    /// QUERY 1 — the only reactivity question codegen ever asks.
    /// `Static` ⇒ emit the value; NO thunk, NO renderEffect, NO closure.
    #[inline] pub fn live(self) -> bool {
        match self.shape {
            Shape::Accessor => self.inner.mask != 0 || self.inner.overflow,
            _               => self.react != React::Static,
        }
    }
    /// QUERY 2 — the only constant question codegen ever asks.
    #[inline] pub fn fold(self) -> Option<Const<'a>> {
        if self.react == React::Static { self.konst } else { None }
    }
}

/// Free variables of an arrow/function, relative to the enclosing component
/// scope. `only_globals` is the handler-hoisting predicate (target #7).
#[derive(Clone, Copy, Default)]
pub struct FreeVars { pub mask: u64, pub only_globals: bool }
```

### 2.4 Symbol classification

```rust
/// What a resolved binding IS. Assigned per SymbolId, so shadowing is free,
/// name collisions are impossible, and `import { signal as sig }` just works.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SourceKind {
    /// Calling it is a reactive read. Signal<T> / Computed<T> / createAsync /
    /// optimistic / useMemo / useContext results, and control-flow index
    /// accessors. `nonreactive` masks members that are NOT tracked reads.
    Accessor { nonreactive: MemberMask },   // .set .peek .update
    /// ANY member read is a reactive read: `useStore()[0]`, projection,
    /// `optimisticStore()[0]`.
    ReactiveObject,
    /// Members are accessors: member READ is inert, member CALL is reactive.
    /// `Resource<T>`: `.state()` `.loading()` `.error()` `.latest()`;
    /// `.refetch` and `.mutate` are inert.
    AccessorRecord,
    /// A compiled component's props parameter. Member reads are ⊤-reactive
    /// because our own component emit lowers props to getters.
    PropsParam,
    /// Resolves to a primitive imported from `coreSource` or `moduleSource`; drives the return-shape table.
    Primitive(Prim),
    /// The row VALUE parameter of a keyed `<For>`. A PLAIN VALUE, not an
    /// accessor. `components.ts:264` — `(item: T, index: () => number)`.
    /// Getting this wrong is the classic name-heuristic bug.
    RowValue,
    /// const bound to a never-reassigned literal — foldable into the skeleton
    ConstLit(StrId),
    /// Provably reads no reactive state
    Inert,
    /// Unresolvable: cross-module import, reassigned from an unknown RHS, or
    /// bound by a pattern we cannot follow.
    Opaque,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Prim {
    Signal, Computed, UseState, UseMemo, UseStore, UseResource, UseContext,
    CreateAsync, CreateOptimistic, CreateOptimisticStore, CreateProjection,
    MapArray, Repeat, Untrack, Batch, Peek,
    Flow(Flow),
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    // string-inlinable on the server
    For, Repeat, Show, Switch, Match,
    // NOT string-inlinable — need real server implementations
    Loading, Errored, Reveal, Suspense, Await, Portal, Dynamic, ErrorBoundary,
}

pub struct ReactiveEnv<'a> {
    pub kind: IndexVec<SymbolId, SourceKind>,
    /// dense per-unit renumbering of the reactive symbols, for DepSet::mask
    pub bit:  IndexVec<SymbolId, u8>,          // 255 = does not fit
    /// Pre-order scope ranges. oxc creates scopes in pre-order, so
    /// "is scope A nested in scope B" is two integer comparisons, and the
    /// free-variable test for handler hoisting is O(1) per reference.
    pub scope_lo: AVec<'a, u32>,
    pub scope_hi: AVec<'a, u32>,
    pub diagnostics: AVec<'a, Diag>,
}

impl<'a> ReactiveEnv<'a> {
    #[inline] pub fn nested(&self, outer: ScopeId, inner: ScopeId) -> bool {
        let (a, b) = (outer.index(), inner.index() as u32);
        self.scope_lo[a] <= b && b < self.scope_hi[a]
    }
}
```

### 2.5 Expression table

```rust
pub struct ExprTable<'a> {
    pub entries: AVec<'a, ExprEntry<'a>>,
    pub parts:   AVec<'a, ClassPart>,   // backing store for SetClass ranges
}

pub struct ExprEntry<'a> {
    pub src:  ExprSrc<'a>,
    pub span: Span,
    pub rx:   Rx<'a>,
}

pub enum ExprSrc<'a> {
    /// Printed as a VERBATIM source slice. No output AST built, no second walk,
    /// and the sourcemap segment is byte-exact by construction.
    Verbatim(&'a Expression<'a>),
    /// Built by the compiler in the same arena: thunks, shaped control-flow
    /// calls, merged prop objects, SSR row specialisations.
    Built(&'a Expression<'a>),
    /// Folded away by P3 — the bytes now live in the skeleton.
    Folded(StrId),
}

#[derive(Clone, Copy)]
pub struct ClassPart { pub value: ExprId, pub gate: Option<ExprId>, pub name: Option<StrId> }
```

### 2.6 Addressing, units, module

```rust
/// DOM backend only. The patch program never contains the word `firstChild`.
pub struct RefPlan<'a> {
    pub defs:    AVec<'a, RefDef>,   // emission order == definition order
    pub of_node: AVec<'a, RefId>,    // NodeId → RefId (NONE = not needed)
}

#[derive(Clone, Copy)]
pub struct RefDef { pub node: NodeId, pub step: Step, pub name: StrId }

/// cost = 1 property read each
#[derive(Clone, Copy)]
pub enum Step {
    Root,
    FirstChild(RefId),
    LastChild(RefId),
    NextSibling(RefId, u8),   // n collapsed hops
    PrevSibling(RefId, u8),
}

pub struct Unit<'a> {
    pub skeleton: Skeleton<'a>,
    pub patch:    AVec<'a, Patch>,
    pub exprs:    ExprTable<'a>,
    pub refs:     RefPlan<'a>,       // empty until P6
    pub template: TemplateId,        // assigned by P7
    pub site:     Site,
}

impl<'a> Unit<'a> {
    /// Target #2 is this predicate, nothing more.
    pub fn is_pure_static(&self) -> bool { self.patch.is_empty() }
}

/// Where the compiled statements may be spliced. Only `Nested` needs an IIFE;
/// every other site emits flat statements — one fewer closure allocation, one
/// fewer stack frame, and far more readable output.
pub enum Site { Return(Span), Init(Span), ArrowBody(Span), Nested(Span) }

pub struct Module<'a> {
    pub units:     AVec<'a, Unit<'a>>,
    /// Every template's bytes, concatenated. A template is a contiguous range, so
    /// hashing is one pass over bytes still in L1, and a dedup hit is
    /// `html.truncate(range.start)` — a duplicate leaves no residue.
    pub html:      String,
    pub templates: AVec<'a, TemplateRow>,
    pub dedup:     FxHashMap<u64, TemplateId>,
    pub delegated: u32,               // bitset over the 22 DELEGATED_EVENTS
    pub hoisted:   AVec<'a, Hoisted<'a>>,
    pub env:       ReactiveEnv<'a>,
    pub maps:      Mappings,
}

pub struct TemplateRow { pub range: (u32, u32), pub ns: Ns, pub hash: u64 }

pub enum Hoisted<'a> {
    /// module-scope `const _h$1 = (e) => {…}` — capture-free handler
    Handler { id: HoistId, expr: &'a Expression<'a>, span: Span },
    /// module-scope frozen literal for a fully-Const spread / style object
    Frozen  { id: HoistId, expr: &'a Expression<'a>, span: Span },
}

/// Three parallel u32 columns, appended only at semantic boundaries. Byte
/// offsets throughout; line/column conversion runs once at the end against a
/// precomputed line-start table, so the emit loop never does line arithmetic.
#[derive(Default)]
pub struct Mappings { pub gen_off: Vec<u32>, pub src_off: Vec<u32>, pub name: Vec<NameId> }
```

**Lifetime discipline.** `Module<'a>` borrows the per-file oxc `Allocator`. It is created and
dropped per file. There is no cross-file `clear()` and reuse — that is unsound with an arena
lifetime and buys less than it costs. What *is* reused across HMR compiles is the `Allocator`
itself (`Allocator::reset()`), the `String` in `Module::html`, and the interner backing store,
all handed in from a `CompilerSession`.

---

## 3. The passes

### P0 Bind

**In:** `oxc_semantic::Semantic` (symbol table already built by the semantic builder — no extra
AST walk; iterate `Scoping::symbol_ids()` and look at each symbol's *declaration node only*),
plus the `Program` for declaration initialisers.

**Out:** `ReactiveEnv` — `IndexVec<SymbolId, SourceKind>`, the dense bit renumbering, and
`scope_lo`/`scope_hi`.

**Enables:** target #1, and it is the precondition for #3, #7, and #8.

Resolves the **local binding** of every `coreSource` and `moduleSource` import (`@barqjs/core`
and `@barqjs/web` by default) by module specifier + imported
name, so `import { signal as sig }` classifies correctly and a user-defined `const signal = 1`
does not. Then a small worklist runs to fixpoint over:

- **Return-shape table per primitive.** `signal(v)` → a callable `Signal<T>` with
  `.set`/`.update`/`.peek` — *not* a tuple. `useState(v)` → `[Accessor, Inert]`.
  `useStore(o)` → `[ReactiveObject, Inert]`. `projection(f)` → `ReactiveObject` directly.
  `resource(s, f)` / `useResource(s, f)` → `AccessorRecord`. `computed`/`useMemo`/`createAsync`/`optimistic`
  → `Accessor`. `optimisticStore(s)` → `[ReactiveObject, Inert]`.
- **Aliasing.** `const c = count` → `Accessor`; `const c = count()` → `Inert`.
- **Reassigned `let`.** Join every write RHS kind; any unresolvable RHS ⇒ `Opaque`.
- **Control-flow parameter attribution, by arity and position, from the real signatures.**
  Keyed `For.children: (item: T, index: () => number)` ⇒ `(RowValue, Accessor)`. A callback
  passed by name, `<For>{row}</For>` or `children={row}`, takes the same kinds as the inline one.
  `For keyed={false}`'s children: `(item: () => T, index: number)` ⇒ `(Accessor, Inert)`.
  `Repeat.children: (index: number)` ⇒ `(Inert)`.
  `keyed: false` is the positional mode; `keyed={fn}` boxes the row in a signal, so BOTH
  parameters are accessors there.
  A key FUNCTION boxes the row in a signal ⇒ `(Accessor, Accessor)`. Anything that cannot be
  proved — `keyed={KEYED}`, `keyed={props.keyed}`, or a **spread**, which can carry `keyed` where
  nothing can read it — takes the key-function arm, because that is the arm that is safe when
  wrong: an accessor read that turns out to be a plain value falls out `Opaque` and is emitted
  unwrapped, where a plain value that turns out to be an accessor is applied once and never
  updated. The attribution is then an ASSUMPTION, and D1 is told so: it says nothing about a row
  it cannot see the `keyed` of, because `row()` on a plain object throws.
- **Scope ranges.** One linear scan over scopes in creation (pre-order) order fills
  `scope_lo`/`scope_hi`, making the free-variable test for handler hoisting two integer compares
  per reference.

### P1 Lower

**In:** JSX roots + `ReactiveEnv`.
**Out:** `Unit { Skeleton, Vec<Patch>, ExprTable }` — the **only** traversal of the JSX tree.
**Enables:** target #11.

Deliberately dumb and fast. Literal attributes and text go straight into the skeleton,
pre-escaped. Every non-literal becomes a `SetLive`/`Insert` patch. Every slot provisionally gets
`Anchor::Marker`. Expressions are stored as `ExprSrc::Verbatim` borrows — **no AST is ever
cloned**. `Skeleton::origin` records html-byte-offset → JSX span as the bytes are written.

Attribute name normalisation happens here: `className` → `class`, `htmlFor` → `for`, SVG names
kebab-cased *except* `class` and `viewBox` (`dom.ts:462`). Event keys are lowercased exactly as
`key.slice(2).toLowerCase()` does.

### P2 Classify

**In:** `Unit` + `ReactiveEnv`.
**Out:** every `ExprEntry.rx` filled; every event patch resolved to `Delegate` or `Listen`.
**Enables:** targets #1, #7, #8.

The lifting rule, bottom-up over each expression:

| form | verdict |
|---|---|
| `Ident(s)` where `s: ReactiveObject \| PropsParam` | `Reactive`, deps = `{s}` |
| `Ident(s)` where `s: Accessor` | `Static`, `Shape::Accessor`, inner = `{s}` |
| `Call(f, [])` where `f: Accessor` | `Reactive`, deps = `{f}`, `Thunk::Eta` |
| `Member(o, m)` where `o: Accessor` and `m ∈ nonreactive` (`.set`/`.peek`/`.update`) | `Static` |
| `Member(o, m)` where `o: ReactiveObject` | `Reactive`, deps = `{o}` |
| `Member(o, m)` where `o: AccessorRecord` | `Static` (the *call* is the read) |
| `Member(o, m)` where `o: RowValue` | `Opaque`, `Thunk::Arrow` — a store writes the row's field in place, so the hole reads it |
| `Call(untrack, [fn])` | `Static`, regardless of the body |
| `Arrow` / `Function` | `Static`, `Shape::Accessor(deps-of-body)` — creating a closure reads nothing |
| `Call(unknown callee)` | `Opaque`, unless the callee is a whitelisted pure global or a local fn proven `Static` |
| `Member` on an `Opaque` object *in a JSX slot* | `Opaque` |
| Binary / Logical / Conditional / Template | join of the parts; a `Const` condition SELECTS a branch instead of joining |
| `Parenthesized(e)` | transparent: the verdict of `e` (the parser keeps these nodes so a source-slice reprint keeps the author's grouping) |

`React::Opaque` is the load-bearing middle value. It is emitted **unwrapped**, so `setProp` /
`insert` make exactly the decision the un-compiled oracle makes. "I don't know" is therefore a
sound, oracle-identical, zero-cost answer — which is why the analysis never needs to guess from
a name.

`FreeVars` for each arrow is computed by walking its scope's references and testing
`env.nested(component_scope, ref_scope)`. `only_globals == true` is the hoisting predicate.

Event delivery: membership of the lowercased name in the **22-name** `DELEGATED_EVENTS` set (see
§9 — the set does *not* contain `change`, `submit`, `keypress`, `focus`, `blur`, `mouseenter`,
`mouseleave`; assuming otherwise produces silently dead handlers).

### P3 Fold

**In:** `Unit`.
**Out:** `Unit` with patches migrated **into** the skeleton.
**Enables:** targets #3 and #2 (as a free consequence), and #8.

Folds: literal `+` chains, template literals with all-`Const` holes, `ConstLit` symbol reads,
`cond ? a : b` with a `Const` cond, `{cond && x}` with a `Const` cond, static class strings /
arrays / objects (reproducing `classToString`), all-static style objects into a single
`style="…"` attribute (reproducing `toKebabCase` + `CSS_NUMBER_PROPS` + the
`number && !== 0 ⇒ px` rule), literal `dangerouslySetInnerHTML` into `SkelNode::RawHtml`, and
`{"text"}` / `{42}` into `SkelNode::Text`. Literal `null`/`undefined`/booleans as children are
dropped. Every fold deletes a patch.

**Refusals, each for a specific reason:**

- Never fold a `Chan::Prop` name. `DOM_PROPS` values are written as *properties* by the oracle;
  baking `value="x"` into HTML sets only the default attribute and diverges on a dirty field.
- Never fold `class` on an SVG element: `className` on an `SVGElement` is a read-only
  `SVGAnimatedString`, so the runtime writes the attribute instead.
- Numeric `+` folds only for `Str + Str` and `Str + integer-in-safe-range`; anything else is
  refused rather than reimplementing JS coercion.

A fully-static subtree emerges here for free: it produced no patch in P1 and no patch survives
P3, so it will get no `RefId` in P6 and contribute exactly zero statements.

`<Show when={Const true}>` collapses: its children are emitted inline and the component, its
marker pair, its `computed`, and its `renderEffect` all vanish.

### P4 Shape

**In:** `Unit` slots holding component or control-flow JSX.
**Out:** those slots hold `ExprSrc::Built` call expressions with per-prop thunk plans; nested
JSX becomes its own `Unit` and recurses through P1..P8.
**Enables:** target #8.

Per-component prop contracts, verified against `components.ts`:

- `For.each` accepts `T[] | (() => T[])` — the body is
  `typeof raw === "function" ? raw() : raw`. So passing the bare accessor is legal.
  `Repeat.count`, `Show.when`, `Match.when`, `Dynamic.component`, `Loading.on` are the same.
- `fallback` is a `JSXElement`, evaluated eagerly by `fallbackNodes(props)`. Pass a
  once-built node when the fallback subtree is `Static`; pass a thunk only when it is reactive.
- `children` arrows pass through `Verbatim`.
- **`Match` is not a ternary.** `Match` returns its own props object
  (`components.ts:512`) and `Switch` reads them. The DOM target must emit a real
  `Match({ when, children })` call inside `Switch({ children: [...] })`. Only the SSR target
  inlines the construct.

User component props are lowered to an object literal where each prop is `Value` when `Static`
(a snapshot — exactly what the oracle does) or a `get k() { return expr }` getter when
`Reactive` (keeping fine-grained flow across the boundary). η-reduction is legal for builtin
flow props, whose unwrapping contract we know, and **illegal** for user component props.

The resulting call site is `InsertPlan::Once`: `For`/`Show`/`Switch`/`Dynamic` return a
`DocumentFragment` built once (with their own internal marker pair and their own
`renderEffect`), so the insert site creates **zero** effects of its own.

### P5 Peephole

**In:** `Unit`.
**Out:** anchors chosen, markers materialised or elided, `EffectGroup` prefixes inserted; may
mutate the skeleton.
**Enables:** targets #4, #8, #9.

**Anchor selection**, in order — this is the generalisation of "no marker when nothing follows":

1. Nothing materialises after the slot in its parent → `Anchor::End`.
2. The next materialising node is another slot → `Anchor::Marker`. (Two holes must never share
   an anchor, or their reconciliations interleave.)
3. The next materialising node is a `Text` run **and** the previous sibling is also a `Text`
   run → `Anchor::Marker`. The HTML parser fuses adjacent literal text into one node, so
   without a marker the two runs are indistinguishable and `firstChild` addresses the wrong
   thing. This case is a theorem about the parse, not a wish.
4. Otherwise → `Anchor::Node(next)` and emit **nothing**. A hole followed by a static element or
   by a single text run costs zero comment nodes.

**Effect grouping.** Every live binding of one template, on whichever element, shares one
`EffectGroup { len }`, as Solid 2.0's compiler fuses a template's dynamic bindings. An opaque call
joins too, read through `readOpaque` as `bindProp` would read it: the compiler wraps it in a
thunk, so the runtime would have opened an effect for it anyway. The header goes where the first
member stands and no member moves, because addresses are numbered in program order on both
targets. `len == 1` lowers to a thunk compute with a scalar `prev`. `len >= 2` lowers to one
`bindEffect` (a render effect) whose compute returns a flat record and whose apply compares each field with the
previous record before writing.

There is no cost-based split. A change to any read re-runs every compute in the record, an
expensive one included, and only the fields that moved are written. Rows are where effects are
created by the thousand: on js-framework-benchmark one effect per row instead of one per bound
element took creating 1,000 rows from 1.83 to 1.65 ms and their memory from 2.09 to 1.88 MB,
while selecting a row, which re-runs every row's whole record, stayed at 1.00 ms.

Also here: η-reduction (`() => f()` → `f`), inlining of user-written thunks with non-empty inner
deps into the element's coalesced effect (deleting the user's closure), dead-patch elision, and
`Diff` selection (`Identity` unless `Shape` is `Obj`/`Arr` or the channel is class/style/spread).

### P6 Address (DOM only)

**In:** `Skeleton` + the set of `NodeId`s the patch program references.
**Out:** `RefPlan`.
**Enables:** target #5.

Costs are in property reads. Candidate anchors for a needed node are `{Root}` ∪ `{already
materialised siblings}`, with the step alphabet `{firstChild, lastChild, nextSibling,
previousSibling}`.

Minimising the route to each needed node *separately* is the wrong objective: a ref that already
exists costs nothing to walk from, so what the emitted code pays is the **sum** of the steps.
Minimising the sum is a **minimum spanning tree** over `{parent} ∪ {needed materialised children}`,
where the parent–child edges weigh `min(1 + i, 1 + (n-1-i))` (a `firstChild` or `lastChild`
descent) and consecutive-sibling edges weigh `Δ`. No longer sibling edge can ever be in the tree,
because it costs at least the hops it spans, so the graph is a path plus a hub and one Kruskal pass
over `2k - 1` edges settles it. It is strictly cheaper than a per-node distance transform. Emission
order is the tree walked outward from the parent, which keeps every def walking from a def defined
EARLIER.

A `Step` also carries a hop count on its descent, so `_el$1.firstChild.nextSibling` is ONE def:
an intermediate binding that exists only to be walked THROUGH is pure waste, and removing it was
half of what this pass is for.

Bidirectional addressing is the win a firstChild-only scheme leaves on the table: reaching child
8 of 10 is 2 reads via `lastChild.previousSibling`, not 9. Ties break toward the **shallower**
expression — a shorter dependency chain of loads has better ILP than a deep one of the same
length — which the edge ordering gets by offering the descents first.

`mat_ix` is what makes this correct: a `Slot` materialises no node, so a leading hole must not
shift the walk. `<p>{hole} clicks</p>` has exactly **one** materialised child, at index 0.

Nothing is emitted for a node reachable as the root itself, and nothing at all when
`Unit::is_pure_static()`. The plan enforces the invariant that every ref is materialised
**before** any mutation runs, because `insert` splices nodes and invalidates sibling walks.

### P7 Intern

**In:** `Module` (all units).
**Out:** templates deduped, handlers hoisted, the delegated union collected.
**Enables:** targets #6 and #7.

Serialise each skeleton once, appending to `Module::html`, and hash the resulting contiguous
range (rapidhash / xxh3) with `ns` as the seed. Probe `Module::dedup`; on a hit,
`html.truncate(range.start)` so the duplicate leaves no residue, and reuse the existing
`TemplateId`. On a miss, keep the bytes.

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

`FreeVars::only_globals` handlers become `Hoisted::Handler` at module scope. The union of
delegated event names becomes one `delegateEvents([...])` call, replacing N private
`ensureDelegatedListener` calls.

---

## 4. DOM codegen rules (P8a)

Output is built with `oxc_ast::AstBuilder` in the same arena and printed by `oxc_codegen`.

**Module preamble.** Hoisted `const _tmpl$N = /*#__PURE__*/ _$template("…")` — safe to mark pure
because `template()` closes over a string and does no DOM work until first call. Then hoisted
handlers `const _h$N = …`. Then one `_$delegateEvents([...])`. Module evaluation order
guarantees every render root listens for the module's types before any event can fire.

**SVG templates.** `template(html, isSVG)` with `isSVG = true` wraps the html in
`<svg xmlns="…">…</svg>` and returns `svgEl.firstChild` (`dom.ts:991`). So `isSVG = true` is for
a template rooted at an SVG *child* (`<path>`, `<g>`); a template rooted at `<svg>` itself uses
`isSVG = false`, because HTML template parsing handles inline `<svg>` correctly.

**Multi-root fragments.** `template()` returns `content.firstChild` only. A fragment therefore
emits one template per root and returns an array — `insert`, `render`, and `childToNodes` all
accept arrays.

**Per unit:** emit the whole `RefPlan` first, then the patch program in document order.

| Op | emitted |
|---|---|
| `SetOnce{Attr}` | `_$setProp(el, "k", v)` |
| `SetOnce{Prop}` | `_$setProp(el, "k", v)` — `setElementAttr` routes `DOM_PROPS` to a property write |
| `SetLive` in `EffectGroup{len:1}` | `_$setProp(el, "k", () => v)` |
| `SetLive` in `EffectGroup{len:n}` | one `_$bindEffect(compute, apply)` over a record |
| `SetOpaque` | `_$setProp(el, "k", v)` — unwrapped; runtime decides |
| `SetClass` | `_$setProp(el, "class", c)` (base prefix already folded into the skeleton) |
| `Delegate` | `el.$$click = h` / `el.$$click = [h, data]` |
| `Listen` | `el.addEventListener("k", h)` |
| `Ref` | `_$setProp(el, "ref", r)` |
| `Spread` | `_$spread(el, o)` |
| `SetHtml` | `_$setProp(el, "innerHTML", h)` |
| `Insert{Once}` | `_$insert(p, v, a)` |
| `Insert{Live, eta}` | `_$insert(p, accessor, a)` |
| `Insert{Live}` | `_$insert(p, () => v, a)` |
| `Insert{Opaque}` | `_$insert(p, v, a)` |

**The fused-effect form.** The engine's effects take two functions, so the record is the
compute's return and the previous record is the apply's second argument:

```js
_$bindEffect(() => ({ a: a(), b: b() }), (_v$, _p$ = {}) => {
  if (_v$.a !== _p$.a) _$setAttr(el, "x", _v$.a);
  if (_v$.b !== _p$.b) _$setAttr(el, "y", _v$.b);
});
```

**Statement splicing.** `Site::Return` / `Init` / `ArrowBody` emit flat statements into the
enclosing function body. Only `Site::Nested` wraps in an IIFE. One fewer closure allocation and
one fewer stack frame per component instance.

**Ref naming.** `scoping.generate_uid` so `_el$N` cannot collide with a user binding. In dev
builds the name carries the tag (`_button$4`) for readable traces.

---

## 5. SSR codegen rules (P8b)

P6 is skipped entirely — no addressing is needed to concatenate strings. Two mechanical
differences from the DOM backend, and nothing else.

**A different skeleton serialiser.** `serialize_ssr` walks the same `nodes` array as
`serialize_dom` and emits the same pre-escaped bytes, with two rules changed: `SkelNode::Marker`
is skipped entirely (a `<!---->` is a DOM insert anchor, meaningless on the wire), and
`SkelNode::Slot` terminates the current chunk instead of producing nothing. Escaping happened
once, at compile time, in P1 — the `template()` string and the SSR chunk need identical escaping
because both are parsed as HTML.

**A different opcode lowering table.** This table is the whole "the two backends cannot drift"
claim: a new opcode has to be given a row, and a skeleton change lands in both serialisers by
construction.

| Op | SSR |
|---|---|
| skeleton text / attrs | literal chunk in the concatenation |
| `SetOnce` / `SetLive` | interpolated into the open-tag chunk; reactivity is irrelevant, the value is read once |
| `SetOpaque` | `_$attr("k", typeof v === "function" ? v() : v)` |
| `SetClass` | ` class="${_$escAttr(c)}"` |
| `SetStyle` | folded into the `style="…"` chunk |
| `Delegate` / `Listen` / `Ref` | **dropped** — no cut is made, so `<button class="btn">Bump` stays one contiguous quasi with no empty `""` slot |
| `Spread` | `${_$spreadAttrs(o)}` |
| `SetHtml` | raw chunk, unescaped |
| `Insert` | `${_$esc(v)}` — or nothing at all when `Shape` is `Num` (`String(n)` needs no escaping) |
| `EffectGroup` | **ignored**; its members flatten into the chunk stream |

Boolean-shaped attributes specialise to a ternary (`${cond ? " disabled" : ""}`) rather than a
helper call, matching `setElementAttr`'s add/remove semantics.

**Control flow on the server.** The flow pass lowers every control-flow construct onto four
primitives, `branch`, `each`, `boundary` and `portal`, before either backend runs.
`@barqjs/server`'s `ssr.ts` implements those four as string builders under the same names and the
same argument order as `@barqjs/web`'s (`packages/web/src/dom-flow.ts`), so the compiler emits the same call for both
targets and picks the implementation by picking the import source. A construct the flow pass
refuses (a spread source, an unreadable `keyed`) reaches a string COMPONENT that is an
adapter over the same four primitives, so every construct has a string lowering and no module falls
back to a DOM render on the server.

**The server runtime.** `@barqjs/server`'s `ssr.ts` exports the helpers the string backend calls:

```ts
export function esc(value: unknown): string
export function escAttr(value: unknown): string
export function rawText(value: unknown, tag?: string): string
export function attr(name: string, value: unknown, tag?: string): string
export function spreadAttrs(props: unknown, tag?: string): string
```

`escAttr` / `attr` reproduce `classToString`, the `CSS_NUMBER_PROPS` px rule, and
`setElementAttr`'s boolean/nullish handling exactly, so the string path and the DOM path emit
identical markup. The dual-render conformance suite (`test/ssr.test.ts`) protects that seam.

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
one direction is an XSS. The brand is `Symbol.for("barq.ssr.html")` on an object carrying the markup
as `t`, tested by identity and paired with `typeof t === "string"`. `esc` passes it through,
escapes everything else, and serialises a real `Node`. `dom.ts` reads the same predicate at every
value-to-node funnel. A registered symbol is unreachable from `JSON.parse`, so a deserialised field
can never pass as markup on the wire or on the client, and it is still identical across the two
copies of the module that the `.` and `./server` entries are.

**`DOM_PROPS` reach the wire only as the attribute they reflect to.** The DOM path writes a
PROPERTY, and markup carries only content attributes: `disabled`, `multiple`, `readOnly`→
`readonly`, `defaultValue`→`value` and `defaultChecked`→`checked` reflect; `checked`, `selected`
and `indeterminate` are dirty values and write nothing. `value` is the one name whose answer
depends on the ELEMENT (nothing on `<input>`/`<textarea>`/`<select>`/`<output>`, the content
attribute everywhere else), so the compiler passes the tag as `attr`'s third argument.

**Three ops have no wire representation, and one construct legitimately differs.** `Delegate`,
`Listen` and `Ref` are dropped, and no chunk is cut for them. A `ref` CALLBACK is therefore a
client-only effect: a fixture whose ref mutates the element it is handed produces markup the
string path structurally cannot, which is declared per fixture (`ssrDiffers`). The control-flow
components splice a marker PAIR into the live parent for their own reconciliation, and the string
backend emits none, for the same reason `SkelNode::Marker` is skipped.

**P1's refusals are about PARSING, and no parser runs here.** A fragment, a `<table>` the parser
would give an implied `<tbody>`, a `<select multiple>`: all of them serialise directly. Only a
component tag the shape pass could not resolve is rendered at runtime, and `esc` serialises the
node it returns. `anchor`, `serialize` and `address` are skipped outright on this target: a
`<!---->` is an insert anchor, a `template()` is a parse, and an address is a sibling walk.

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
runtime data; every compiled `attr(…)` call site passes a name the compiler wrote. `setAttribute`
answers a name outside the XML `Name` production with `InvalidCharacterError` and writes nothing,
so `{...{"x onload=alert(1) y": "1"}}` must not become three attributes on the wire. `ssr.ts::attr`
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
arm, so a new opcode has to answer where it sits on the wire or the crate does not compile. A
filter that quietly dropped an opcode would produce missing output with no error, which is the
precise silence §4's no-drift guarantee exists to make impossible.

**A namespace import resolves to the same `Flow` as a named one.** `import * as core` binds no
symbol for `core.Portal`, so a split resolved by `SymbolId` alone would walk past `<core.For>` and
`<core.Portal>`. The bind walk records the flows a namespace member names, and
`shape.rs::member_chain` carries the object's `ReferenceId` into the emitted identifier so the
backend resolves it by symbol rather than by spelling.

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
`fixtures/pre-leading-newline.tsx` carries the shape. `normalize.ts` (tree against tree) DETECTS
whether the host parser implements the rule and canonicalises the leading run only where it does
not, so in real Chrome nothing is normalised and a compiler that stopped doubling is still a
divergence. `test/ssr.ts::sameTree` (markup string against a serialised DOM) canonicalises
unconditionally, because there the loss is the SERIALISER's and is present on every engine.
`browser.test.ts` admits exactly this one disagreement between the two parsers, and requires it to
still be reached. The exact byte count is pinned by `compile.rs`'s two O9 tests over the emitted
template, not by the fixture comparison.

**The string half of the same rule, which is NOT the DOM half.** A template's hole materialises
nothing, so the parser's U+000A lands on the text BEHIND it and the doubling looks past leading
`Slot` nodes. A string's hole writes the value's own bytes against the open tag, and the compiler
cannot see their first one. So the string backend emits a newline of ITS own in front of the hole,
one the parser eats instead of the value, and does not double the literal behind it. The rule: for
`<pre>`/`<textarea>`/`<listing>`, guard when the first thing the element writes is a hole, a
content prop (`textContent`/`innerHTML`), or a literal that already begins with a newline. A hole
that renders empty is why the first case is unconditional: the literal behind it would otherwise
become the first byte. `<textarea>{value}</textarea>` is the shape it matters most for: P1 refuses
it, so the DOM path is `createElement`, whose text node no parser ever reads.

`sameTree` cannot see any of this: it canonicalises the leading run on both sides, so a backend
that dropped the newline would compare equal to the oracle for ever. The bytes are pinned instead
by `compile.rs::the_string_backend_guards_a_hole_against_the_same_rule` and by `ssr.test.ts`'s O9
row, over `browser-parse-check.ts`'s measurement that one newline is exactly what Chrome eats.
`fixtures/pre-dynamic-leading-newline.tsx` carries the shape through the corpus.

**A rewritten flow import comes off.** When P8b rewrote every reference a binding had, the import
specifier has no reader and would keep the client's flow component in a server bundle for a call
nothing makes. `install.rs` counts the rewrites against the binding's resolved
references (minus the JSX closing tags, which oxc counts as references of their own) and drops the
specifier only when they match: one reader left is one reader too many.

---

## 6. Sourcemap strategy

Three parallel `u32` columns, appended at semantic boundaries. Byte offsets throughout; the
line/column conversion runs once at the end against a precomputed line-start table, so the emit
loop never does line arithmetic.

Four sources of fidelity:

1. **Expressions keep their original spans by construction.** `ExprSrc::Verbatim` prints the
   source slice; the expression is never rebuilt, so it cannot drift. This matters most, because
   user expressions are the only executable code a template ever contains.
2. **Template interiors are mapped.** `Skeleton::origin` maps html byte offsets to JSX spans and
   is shared by both serialisers. P8a emits one segment per origin entry into the *interior* of
   the hoisted `_$template("…")` string literal — generated line/column inside a long string
   literal are perfectly addressable, so a debugger stepping into `_tmpl$1` lands on the
   originating JSX element. `origin` is excluded from the content hash so it never defeats dedup.
3. **Every `Patch` and every `RefDef` carries a `Span`,** so `_el$4` maps to the `<p>` it walks
   to, and a production `Cannot read properties of null (reading 'firstChild')` lands on the
   right JSX line.
4. **SSR emits ONE template literal per root**, not a `+` chain. The interpolations already sit
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
  serialised those bytes: `Module::html` literally holds its serialisation, and every other site
  keeps a segment of its own on its `_tmpl$N()` clone call, which carries that site's span on the
  ordinary AST path. Mapping to nobody would leave the markup unattributed for every site
  including the one that wrote it. (A `Slot` materialises no bytes and so shares its html offset
  with the node that follows; the bytes belong to whichever node wrote them, and the hole is
  already mapped at the `insert` call that fills it.)
- **The first segment on a generated line reaches back to that line's first token.** oxc skips a
  node whose span it *just* recorded, and two emitted nodes legitimately share a span — a hole's
  anchor ref and the `insert` call that uses it are both the hole — so the second one prints
  unmapped, and when it starts a line the whole statement becomes unreachable. Extending the
  line's first segment leftwards invents no source position; it only gives a segment the reach
  leftwards that a consumer already assumes segments have rightwards. The fill applies only
  where the line really does start a statement. A generated line that CONTINUES a multi-line
  template literal starts in the middle of a token whose own segment is on the previous line, and filling column 0 there replaces a correct
  inherited position with the position of whatever comes next. `Mappings::literals` records the
  generated byte range of every literal §6.2 mapped into, and a line starting inside one is left
  alone.

Where the preamble is spliced is a correctness question, not a formatting one: after the LEADING
run of imports, never after the last one. `import` is legal anywhere at the top level, and a
module whose import sits below JSX-bearing code would get `_tmpl$1()` above `const _tmpl$1 = …`, a
TDZ `ReferenceError` at module evaluation, green at compile time and dead in the browser. Every emitted
binding rides that one splice: templates, hoisted handlers, and the `delegateEvents` call.

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
  keeps one `bindEffect`, passing each channel's previous value as `setProp`'s fourth argument.
- **Control flow is the DOM backend's call.** `insert`, `spread`, `branch`, `each`,
  `boundary`, `island`, `reveal` and `portal` take the same arguments and come from
  `moduleSource`, so `region_call` is shared.
- **Document-only syntax is an error.** A `bind:` or a form `action` is reported as
  [BARQ027](docs/BARQ027.md) by `compile.rs`'s `document_only`, after the passes.

`codegen::home(helper, target)` is the one table of where a helper is imported from: the
reactive half (`props`, `cell`, `block`, `readSlot`, `COUNT`, `getOwner`, `untrack`,
`createComponent`, `bindEffect`) from `coreSource` on every target, the renderer's helpers from
`moduleSource` on the DOM and universal targets, the string backend's from `serverSource`, and
the reference backend from `<moduleSource>/interp`.

`test/universal.test.ts` compiles every fixture for this target, runs it through its steps on
`@barqjs/universal`'s in-memory host, and requires the tree the DOM backend builds in happy-dom.

---

## 9. Table generation, not transcription

`classToString`, `diffStyleObjects`' kebab + px rules, `CSS_NUMBER_PROPS`, `DOM_PROPS`,
`SVG_TAGS`, and `DELEGATED_EVENTS` all have to exist byte-for-byte in Rust. Nothing in a normal
build enforces that, and drift produces *wrong HTML*, not a crash.

`build.rs` therefore parses `packages/web/src/dom.ts` and emits `tables.rs` (the PHFs behind
`TagId`/`NameId` and their flag bits). CI fails on drift. This is a requirement, not a nicety —
it is the only mechanism that keeps the compiler and the runtime honest.
