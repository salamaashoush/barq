# Ossify — Template IR for the barq Rust compiler

A synthesis of three candidate designs. The architecture is **Ossify** (Skeleton + Patch
Program), with the reactivity analysis grafted from **DepSet** and the addressing, dedup, and
interning machinery grafted from **Ribbon**. See "Provenance" at the end for what came from
where and what was rejected.

The Babel plugin that used to live in `packages/compiler` was never a target, a baseline or an
oracle — only a catalogue of JSX shapes that have to be handled. That catalogue is now the
fixture corpus (`fixtures/README.md`), and the plugin was deleted at M6. `packages/compiler` is
the Vite integration and nothing else.

The correctness oracle is `@barqjs/core/jsx-runtime` → `createElement()`. Compiled output must
produce an identical DOM and must never do more reactive work than the un-compiled path. Doing
less is the entire point.

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
`packages/core/src/dom.ts` (see §9). `TAG_TABLE[id]` and `NAME_TABLE[id]` carry the bit flags
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

/// "Do these two expressions share a dependency?" is the only question the
/// effect-grouping cost model asks, so a 64-bit mask over the unit's dense
/// symbol numbering is sufficient. No arena slices, no merging, no allocation.
#[derive(Clone, Copy, Default)]
pub struct DepSet { pub mask: u64, pub overflow: bool }

impl DepSet {
    #[inline] pub fn join(self, o: Self) -> Self {
        Self { mask: self.mask | o.mask, overflow: self.overflow | o.overflow }
    }
    #[inline] pub fn disjoint(self, o: Self) -> bool {
        !self.overflow && !o.overflow && self.mask & o.mask == 0
    }
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

#[derive(Clone, Copy)]
pub enum Cost { Cheap, Expensive }   // loop / .map / .sort / new ⇒ Expensive

pub struct Rx<'a> {
    pub react: React,
    pub deps:  DepSet,
    /// dep-set of the BODY when `shape == Accessor`; otherwise unused
    pub inner: DepSet,
    pub konst: Option<Const<'a>>,   // Some ⇒ foldable into the skeleton
    pub shape: Shape,
    pub free:  FreeVars,
    pub cost:  Cost,
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
    /// createOptimistic / useMemo / useContext results, and control-flow index
    /// accessors. `nonreactive` masks members that are NOT tracked reads.
    Accessor { nonreactive: MemberMask },   // .set .peek .update
    /// ANY member read is a reactive read: `useStore()[0]`, createProjection,
    /// `createOptimisticStore()[0]`.
    ReactiveObject,
    /// Members are accessors: member READ is inert, member CALL is reactive.
    /// `Resource<T>`: `.state()` `.loading()` `.error()` `.latest()`;
    /// `.refetch` and `.mutate` are inert.
    AccessorRecord,
    /// A compiled component's props parameter. Member reads are ⊤-reactive
    /// because our own component emit lowers props to getters.
    PropsParam,
    /// Resolves to a @barqjs/core primitive; drives the return-shape table.
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
    For, Index, Repeat, Show, Switch, Match,
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

Resolves the **local binding** of every `@barqjs/core` import by module specifier + imported
name, so `import { signal as sig }` classifies correctly and a user-defined `const signal = 1`
does not. Then a small worklist runs to fixpoint over:

- **Return-shape table per primitive.** `signal(v)` → a callable `Signal<T>` with
  `.set`/`.update`/`.peek` — *not* a tuple. `useState(v)` → `[Accessor, Inert]`.
  `useStore(o)` → `[ReactiveObject, Inert]`. `createProjection(f)` → `ReactiveObject` directly.
  `useResource(s, f)` → `AccessorRecord`. `computed`/`useMemo`/`createAsync`/`createOptimistic`
  → `Accessor`. `createOptimisticStore(s)` → `[ReactiveObject, Inert]`.
- **Aliasing.** `const c = count` → `Accessor`; `const c = count()` → `Inert`.
- **Reassigned `let`.** Join every write RHS kind; any unresolvable RHS ⇒ `Opaque`.
- **Control-flow parameter attribution, by arity and position, from the real signatures.**
  Keyed `For.children: (item: T, index: () => number)` ⇒ `(RowValue, Accessor)`.
  `Index.children: (item: () => T, index: number)` ⇒ `(Accessor, Inert)`.
  `Repeat.children: (index: number)` ⇒ `(Inert)`.
  `For` with `keyed: false` delegates to `Index` at runtime, so it takes `Index`'s attribution.
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
| `Member(o, m)` where `o: RowValue` | `Static` — the row is recreated by `mapArray` |
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
- Never fold `class` on an SVG element (see open question O5).
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

- `For.each`, `Index.each` accept `T[] | (() => T[])` — the body is
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

**Effect grouping.** Stable-sort patches by `target`; wrap each element's contiguous run of
`SetLive` in one `EffectGroup { len }`. `len == 1` lowers to `setProp(el, k, () => v)` — same
effect count, less code, and the runtime keeps its own `prev`. `len >= 2` lowers to one
`renderEffect` with a threaded accumulator and per-key `!==` guards.

The merge policy refuses to group a prop whose `Cost` is `Expensive` **and** whose `DepSet` is
disjoint from every other live prop on that element — otherwise a change to a hot signal would
recompute an unrelated expensive expression. This is the one place where one-effect-per-element
can do more work than the oracle, and it is a heuristic with a threshold; it will be wrong in
both directions occasionally.

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

**AMENDED IN M4 — the objective, not the alphabet.** This section specified a **two-sweep 1-D
distance transform** per parent, which minimises the route to each needed node *separately*. That
is the wrong objective: a ref that already exists costs nothing to walk from, so what the emitted
code actually pays is the **sum** of the steps. Minimising the sum is a **minimum spanning tree**
over `{parent} ∪ {needed materialised children}`, where the parent–child edges weigh
`min(1 + i, 1 + (n-1-i))` (a `firstChild` or `lastChild` descent) and consecutive-sibling edges
weigh `Δ`. No longer sibling edge can ever be in the tree, because it costs at least the hops it
spans, so the graph is a path plus a hub and one Kruskal pass over `2k - 1` edges settles it. It
is strictly cheaper than the distance transform: on §7's own example below it finds **three**
property reads where the hand-derived plan there spends four. Emission order is the tree walked
outward from the parent, which is what keeps every def walking from a def defined EARLIER.

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

### P7 Intern — amendment (M4): attribute order is SOURCE order

Template identity is the emitted bytes, and those bytes carry attributes in the order the JSX
wrote them. An earlier draft of §2.1 wanted them name-sorted so that
`<div id="a" class="b">` and `<div class="b" id="a">` could share one row.

They do not, deliberately. The only way two elements can share a `template()` call is by having
identical HTML, so a sorted HASH over unsorted BYTES would be a hash that lies; making the share
real means sorting the emitted markup itself, and the emitted markup is read by humans debugging a
production stack trace. Source order is the order the JSX has, and lining the two up is worth more
than a share between two elements that spell the same attributes differently. The cost is bounded
and visible: one extra template row, no behavioural difference — attribute order carries no meaning
to the HTML parser, and `test/normalize.ts` sorts it out of the DOM diff for exactly that reason.

### P3 Fold — amendment (M4): constant CHILDREN are not folded

P3 folds constant ATTRIBUTE values into the template. It does not fold a constant text child:
`<p>Total: {5} clicks</p>` keeps its hole, its `insert` call and — because the text either side
would fuse — its `<!---->`, where `<p>Total: 5 clicks</p>` compiles to one clone and nothing else.

That is a real gap in targets #2, #3, #6 and #9 at once, and it is left open on purpose rather than
by oversight: splicing folded bytes into a neighbouring `Text` node has to merge adjacent runs (the
walk depends on no two `Text` nodes ever being adjacent) and then re-run P5's anchor pass and P6's
addressing over a skeleton whose `mat_ix` has changed. That is a P3 rewrite, not a P3 extension.
Whoever does it owns the anchor and addressing invariants afterwards.

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

`FreeVars::only_globals` handlers become `Hoisted::Handler` at module scope. The union of
delegated event names becomes one `delegateEvents([...])` call, replacing N private
`ensureDelegatedListener` calls.

---

## 4. DOM codegen rules (P8a)

Output is built with `oxc_ast::AstBuilder` in the same arena and printed by `oxc_codegen`.

**Module preamble.** Hoisted `const _tmpl$N = /*#__PURE__*/ _$template("…")` — safe to mark pure
because `template()` closes over a string and does no DOM work until first call. Then hoisted
handlers `const _h$N = …`. Then one `_$delegateEvents([...])`. Module evaluation order
guarantees the document listeners are installed before any event can fire.

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
| `SetLive` in `EffectGroup{len:n}` | one `_$renderEffect((_p$ = {}) => { …; return _p$ })` |
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

**The fused-effect form is verified against the runtime.** `recompute` calls
`node._fn(uninitialised ? undefined : node._value)` (`signals.ts:868`) and stores the return
into `node._value` (`signals.ts:972`), so a compute's previous return value *is* threaded back:

```js
_$renderEffect((_p$ = {}) => {
  const _v$ = a(), _v$2 = b();
  if (_v$  !== _p$.a) _$setProp(el, "x", (_p$.a = _v$));
  if (_v$2 !== _p$.b) _$setProp(el, "y", (_p$.b = _v$2));
  return _p$;
});
```

One caveat that is a hard rule: **a fused effect must never return a function.** `signals.ts:994`
registers a function return value as the effect's cleanup when there is no `apply` argument.
Returning a plain object is safe.

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

**Control flow without a server runtime.** The compiler already knows the semantics of `For`,
`Index`, `Repeat`, `Show`, `Switch`/`Match` — they are `SourceKind::Primitive(Prim::Flow(..))`,
resolved by `SymbolId`, never by name — so P8b **inlines** them as plain JS:

- `<For each={e}>{fn}</For>` → `(e ?? []).map(fn').join("")`
- `<Show when={c} fallback={f}>{k}</Show>` → `c ? k' : f'`
- `<Switch>{<Match when={a}>x</Match>, …}</Switch>` → a ternary chain

When the row callback is an inline arrow — the overwhelmingly common case — its parameters are
substituted directly. The keyed `For` index accessor `i()` collapses to the raw `_i$` loop
variable when every reference to `i` is a zero-arg call; otherwise the emitter binds
`const i = () => _i$;` at the top of the row. No per-row closure survives in the common case,
and no server implementations of the list/branch components are required.

The remaining eight flow components — `Loading`, `Errored`, `Reveal`, `Suspense`, `Await`,
`Portal`, `Dynamic`, `ErrorBoundary` — have real async and boundary semantics and cannot be
inlined. Until `packages/core` grows string-mode implementations, **any module using them falls
back to the existing happy-dom `renderToString` path.** That means two SSR strategies coexisting,
which is exactly the divergence this design otherwise eliminates. It is stated rather than
hidden; see open question O2.

**Required `packages/core` delta.** A new `packages/core/src/ssr.ts`, exported under a
`"./server"` condition in `packages/core/package.json` (which today exports only `.`,
`./jsx-runtime`, `./jsx-dev-runtime`):

```ts
export function esc(v: unknown): string
export function escAttr(v: unknown): string
export function attr(name: string, v: unknown): string
export function spreadAttrs(o: Record<string, unknown>): string
export function renderToString(fn: () => string): string   // just fn()
```

`escAttr` / `attr` must reproduce `classToString`, the `CSS_NUMBER_PROPS` px rule, and
`setElementAttr`'s boolean/nullish handling exactly, so the string path and the DOM path emit
identical markup. This seam is protected only by a dual-render conformance suite (milestone 6).

### Amendment (M6) — what P8b actually emits, and the five things that had to be decided

**The oracle is `renderToString`, so the escaping tables are the SERIALISER's, not the spec's.**
Text escapes `&`, `<`, `>` and U+00A0; a double-quoted attribute escapes `&` and `"` and leaves
U+00A0 raw; raw text (`<script>`, `<style>`) escapes nothing. The spec escapes U+00A0 in both
contexts and the two spellings parse to the same character, so the attribute rule is a
byte-for-byte agreement with the runtime rather than a semantic choice. The compile-time escapers
in `lower::entity` and the runtime ones in `ssr.ts` are the same two tables, and
`packages/core/src/ssr.test.ts` compares every cell against what `createElement` + `innerHTML`
produce for the same value.

**A compiled root returns `SsrHtml`, not a bare string.** §5 above wrote
`renderToString(fn: () => string)`. A bare string cannot answer the only question a hole asks —
"is this markup I produced, or data I have to escape?" — because a component returning
`props.user.bio` and a component returning markup are both strings, and guessing wrong in one
direction is an XSS. The brand is one object per root, `{ __barqSsrHtml, t }`, and `esc` passes it
through, escapes everything else, and serialises a real `Node` (which is how a string module
embeds a component from a module that fell back). `dom.ts` reads the same brand at every
value→node funnel, which is how a FALLBACK module embeds a string-compiled component. Both
directions of DESIGN §5's two-strategy coexistence are therefore closed, and
`renderToString` accepts both shapes.

**`DOM_PROPS` reach the wire only as the attribute they reflect to.** The DOM path writes a
PROPERTY, and markup carries only content attributes: `disabled`, `multiple`, `readOnly`→
`readonly`, `defaultValue`→`value` and `defaultChecked`→`checked` reflect; `checked`, `selected`
and `indeterminate` are dirty values and write nothing. `value` is the one name whose answer
depends on the ELEMENT — nothing on `<input>`/`<textarea>`/`<select>`/`<output>`, the content
attribute everywhere else — so the compiler passes the tag as `attr`'s third argument.

**Three ops have no wire representation, and one construct legitimately differs.** `Delegate`,
`Listen` and `Ref` are dropped, and no chunk is cut for them. A `ref` CALLBACK is therefore a
client-only effect: a fixture whose ref mutates the element it is handed produces markup the
string path structurally cannot, which is declared per fixture rather than papered over. The
control-flow components splice a `<!--Name:n-->` marker PAIR into the live parent for their own
reconciliation, and the string backend emits none — the same reason `SkelNode::Marker` is skipped.

**P1's refusals are about PARSING, and no parser runs here.** A fragment, a `<table>` the parser
would give an implied `<tbody>`, a `<select multiple>` — all of them serialise directly instead of
falling back to `createElement`. Only a component tag the shape pass could not resolve does, and
`esc` serialises the node it returns. `anchor`, `serialize` and `address` are skipped outright on
this target: a `<!---->` is an insert anchor, a `template()` is a parse, and an address is a
sibling walk.

### Amendment (M6, second pass) — the four positions the escaping tables do not cover

The tables above are complete for a VALUE in a text or attribute position. The review found four
positions that are not that, and each one is a different kind of answer.

**A raw-text element cannot be escaped, so the close sequence is neutralised instead.** There are
no entities inside `<script>`/`<style>`/`<xmp>`/`<iframe>`/`<noembed>`/`<noframes>`/`<noscript>`:
the tokenizer decodes nothing, so `&lt;` would reach the wire as four characters and corrupt the
content. The only sequence that must not survive is the one that ENDS the element, and it becomes
`<\/`. The tokenizer reads `</` followed by anything that is not an ASCII letter as raw text, and
`\/` is an identity escape in a JS string literal and in a CSS string alike, so a value carrying
`</script>` inside a payload survives verbatim where it matters. `<!--` goes with it in SCRIPT
data only: it is the sole route into script-data-escaped state, where a following `<script` stops
`</script>` closing the element, and in CSS it is a legal CDO token. Both halves exist —
`ssr.rs::neutralize_raw_text` for a literal the compiler can see (JSX text cannot hold a bare `<`,
but `&lt;/script&gt;` decodes to one) and `ssr.ts::rawText` for the value it cannot, which is why
the owning tag travels as `rawText`'s second argument. This is a place where the DOM path is NOT a
specification: `renderToString` serialises a text node inside `<script>` verbatim, so its own
bytes reparse into a breakout, and happy-dom additionally escapes `<iframe>`/`<noscript>` content
where a real browser does not. The conformance suite therefore asserts the property (nothing
escaped the element) rather than equality with the oracle.

**An attribute NAME is refused when it is not one.** Only a spread can carry a name that is
runtime data; every compiled `attr(…)` call site passes a name the compiler wrote. `setAttribute`
answers a name outside the XML `Name` production with `InvalidCharacterError` and writes nothing,
so `{...{"x onload=alert(1) y": "1"}}` must not become three attributes on the wire. `ssr.ts::attr`
validates and throws, which makes the two paths agree — and where happy-dom is LAXER than a real
browser (it accepts U+2028 and U+00A0 in a name, and then serialises markup that reparses into
several attributes) the string path is deliberately the stricter one.

**The brand is a registered symbol.** `Symbol.for("barq.ssr.html")`, tested by identity and paired
with `typeof t === "string"`. It was a plain `__barqSsrHtml` property tested with `in`, which any
object `JSON.parse` produced satisfied — and because `dom.ts` reads the same predicate at five
value→node funnels, a deserialised field reaching `<div>{value}</div>` became live elements on the
CLIENT as well as on the wire. `Symbol.for` is unreachable from JSON and still identical across
two copies of the module, which the `.` and `./server` entries really are.

**A literal style object folds, and that is what makes `CSS_NUMBER_PROPS` observable.** Markup has
one `style=` slot and no CSSOM, so an object whose every key and value is a literal is serialised
at compile time by `ssr.rs::fold_style` — `dom.ts::styleToString`'s rule, with the px class read
from `tables::css_number_prop`, which `build.rs` regenerates from `dom.ts`. On the DOM target the
object is handed to the runtime whole and a drifted table is unobservable in the emit; here it is
wrong bytes. Anything the compiler cannot evaluate stays `attr("style", …)`.

### Amendment (M6, second pass) — the opcode dispatch, and the two divergences that are real

**`attribute_slot` is the dispatch and it is total.** `attribute_call` was already a total match
over `Op`, but its only caller filtered through a helper that admitted the three NAMED ops, so the
`SetClass`, `SetStyle` and `Spread` rows were unreachable — a pass constructing one would have
produced missing output with no error, which is the precise silence §4's no-drift guarantee is
supposed to make impossible. The decision now lives in one total match with no wildcard arm, and
`attribute_call` `unreachable!`s on everything that match sends elsewhere. `SetClass`, `SetStyle`
and `Spread` are still constructed by no pass today; the guarantee is that adding one forces a
decision in both places.

**A namespace import resolves to the same `Flow` as a named one.** `import * as core` binds no
symbol for `core.Portal`, so a split resolved by `SymbolId` walked past BOTH halves: `<core.For>`
was not rewritten, and `<core.Portal>` did not trigger the fallback — which shipped a string module
calling a DOM component, dying with `ReferenceError: document is not defined` on exactly the kind of
server target #10 exists for. The bind walk now records the flows a namespace member names, and
`shape.rs::member_chain` carries the object's `ReferenceId` into the emitted identifier so the
backend resolves it by symbol rather than by spelling.

**`<pre>` and the newline, measured rather than assumed.** The parser ignores one U+000A after
`<pre>`/`<textarea>`/`<listing>`, so the only spelling that yields a text node starting with a
newline is a DOUBLED newline — which is what both backends emit. The SERIALISER does not put it
back: Chrome writes `<pre>\na</pre>` for a node whose text is `\na`, so a byte comparison between
an SSR string and a serialised DOM legitimately differs by one newline, and a tree comparison in a
real browser does not differ at all. happy-dom implements neither half, so under the test DOM the
compiled template parses one newline long. Three rows in `test/browser-parse-check.ts` measure all
of it in real Chrome.

The comparison now models both halves, each where it is actually lossy, and
`fixtures/pre-leading-newline.tsx` carries the shape. `normalize.ts` (tree against tree) DETECTS
whether the host parser implements the rule and canonicalises the leading run only where it does
not — so in real Chrome nothing is normalised and a compiler that stopped doubling is still a
divergence. `test/ssr.ts::sameTree` (markup string against a serialised DOM) canonicalises
unconditionally, because there the loss is the SERIALISER's and is present on every engine.
`browser.test.ts` admits exactly this one disagreement between the two parsers, and requires it to
still be reached. The exact byte count is pinned by `compile.rs`'s two O9 tests over the emitted
template, not by the fixture comparison.

**A rewritten flow import comes off.** When P8b rewrote every reference a binding had, the import
specifier has no reader and would drag `@barqjs/core`'s DOM runtime into a server bundle for a
component nothing calls. `install.rs` counts the rewrites against the binding's resolved
references (minus the JSX closing tags, which oxc counts as references of their own) and drops the
specifier only when they match — one reader left is one reader too many.

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
4. **SSR emits ONE template literal per root**, not a `+` chain. This was written the other way
   round before P8b existed, on the assumption that grouping chunks by originating source line
   would read better. It does not: the interpolations already sit at their own source positions
   and a template literal's quasis are addressable the same way a `+` chain's operands are, so the
   chain bought nothing and cost a segment per operator. `Chunks::literal` builds the single
   literal and the backend's own test pins it (`code.matches('`').count() == 2`). The measured
   difference on the §7 example is 18 segments over 9 lines for the DOM target against 8 over 3
   for SSR — fewer segments because there are fewer emitted nodes, not because fidelity dropped.

Fidelity is a tunable: every skeleton node knows its byte range, so per-attribute mapping inside
a template is available. Turning it up multiplies segment count and spends the compile budget, so
the default is the four boundaries above.

### Amendment (M4) — how §6 is actually built, and what a deduped template maps to

Points 1 and 3 are **not** built by hand. oxc's codegen records a segment per emitted AST node,
and every node this compiler emits already carries the span of the JSX that produced it, so the
expression segments and the `_el$N` / patch segments fall out of printing. `Mappings` therefore
holds exactly the segments oxc's builder *cannot* produce — point 2, positions inside a string
literal — and its `gen_off` column is filled after `Codegen::build`, because that is the first
moment a generated byte offset exists. The three columns are then converted once against a
`LineIndex`, turned into tokens and merged into oxc's map.

Two things had to be decided rather than derived:

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
  leftwards that a consumer already assumes segments have rightwards.

  Amended (M4 review): the fill applies only where the line really does start a statement. A
  generated line that CONTINUES a multi-line template literal starts in the middle of a token
  whose own segment is on the previous line, and filling column 0 there replaces a correct
  inherited position with the position of whatever comes next. `Mappings::literals` records the
  generated byte range of every literal §6.2 mapped into, and a line starting inside one is left
  alone.

Where the preamble is spliced is a correctness question, not a formatting one: after the LEADING
run of imports, never after the last one. `import` is legal anywhere at the top level, and a
module whose import sits below JSX-bearing code got `_tmpl$1()` above `const _tmpl$1 = …` — a TDZ
`ReferenceError` at module evaluation, green at compile time and dead in the browser. Every emitted
binding rides that one splice: templates, hoisted handlers, and the `delegateEvents` call.

What stays deliberately unmapped: the helper `import` and the module-scope `delegateEvents([…])`
call. Both are preamble synthesised from the module as a whole, with no single JSX origin, and
`SPAN` (an empty span) is how codegen says so — oxc emits no segment for one.

Cost, typical component file, release build: 0.0262 ms with no map, 0.0336 ms with oxc's, 0.0371 ms
with §6 complete. The map is ~29% of a mapped compile, of which about two thirds is oxc's own
builder and encoder. Maps are off by default and the mapped compile is 26x inside the 1 ms budget.

---

## 7. Worked example, end to end

### Input — `src/card.jsx`

```jsx
import { For, signal } from "@barqjs/core";
import { track } from "./analytics";

const SIZE = "lg";

function remove(item, e) {
  e.stopPropagation();
  console.log("remove", item.id);
}

export function Card(props) {
  const count = signal(0);
  const items = signal([{ id: 1, name: "alpha" }]);
  const theme = "dark";

  return (
    <div class={"card card--" + SIZE + " " + theme}>
      <header class="card__head">
        <svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" /></svg>
        <span>Items</span>
      </header>
      <p title={`count: ${count()}`}>{count()} clicks</p>
      <button
        class="btn"
        disabled={count() > 9}
        aria-label={`bump to ${count() + 1}`}
        onClick={() => count.set(count() + 1)}
        onPointerDown={() => track("bump")}
      >Bump</button>
      <ul>
        <For each={items()}>
          {(item, i) => <li onClick={[remove, item]}>{i()}: {item.name}</li>}
        </For>
      </ul>
    </div>
  );
}
```

Covers: a fully-static SVG subtree, a foldable literal class, a reactive text hole with a
following text sibling, one live prop on one element and two live props on another, a delegated
handler that captures a local, a delegated handler that is hoistable, a bound-handler tuple in a
list row, an η-reducible `each`, a reactive row hole, and a **static** row hole.

### P0 Bind

```
SymbolId  name      SourceKind                            why
────────  ────────  ────────────────────────────────────  ──────────────────────────
s0        For       Primitive(Flow(For))                  import specifier → @barqjs/core
s1        signal    Primitive(Signal)
s2        track     Opaque                                import from ./analytics
s3        SIZE      ConstLit("lg")                        const, literal init, 0 writes
s4        remove    Inert, free={}                        fn decl, no outer captures
s5        Card      Component
s6        props     PropsParam                            (unused in body)
s7        count     Accessor{nonreactive: set|update|peek}  signal() → callable Signal<T>
s8        items     Accessor{…}
s9        theme     ConstLit("dark")
s10       item      RowValue                              keyed For children param 0
s11       i         Accessor                              keyed For children param 1
```

Two facts a name-regex compiler cannot have: `s7` and `s9` are both `const` in the same scope and
only one is reactive; and `count.set` is a member read on an `Accessor` whose member is in the
non-reactive mask (`Static`) while `count()` is `Reactive` — the same identifier, two verdicts.

Free-variable sets, relative to `Card`'s scope:

```
arrow @ onClick        free = {s7}   → NOT hoistable
arrow @ onPointerDown  free = {s2}   → s2 is module scope ⇒ only_globals ⇒ HOISTABLE
```

### P1 Lower

**Skeleton A** (`·` = materialises no node):

```
n0  Element div      attrs=[]                     kids=[n1..n12)
n1  Element header   attrs=[class="card__head"]   kids=[n2..n5)
n2  Element svg      attrs=[viewBox="0 0 16 16"]  kids=[n3..n4)   ns=Svg
n3  Element path     attrs=[d="M0 0h16v16H0z"]    ns=Svg, void-in-foreign
n4  Element span     attrs=[]                     kids=[n5..n6)
n5  Text    "Items"
n6  Element p        attrs=[]                     kids=[n7..n9)
n7  Slot    s0                                                   ·
n8  Text    " clicks"
n9  Element button   attrs=[class="btn"]          kids=[n10..n11)
n10 Text    "Bump"
n11 Element ul       attrs=[]                     kids=[n12..n13)
n12 Slot    s1                                                   ·
```

**Patch A** (naive; every slot provisionally gets a Marker):

```
0  n0   SetLive { "class",      e0, Attr }
1  n6   SetLive { "title",      e1, Attr }
2  n6   Insert  { s0, Marker(n7), e2 }
3  n9   SetLive { "disabled",   e3, Prop }
4  n9   SetLive { "aria-label", e4, Attr }
5  n9   Event?  { "onClick",       e5 }
6  n9   Event?  { "onPointerDown", e6 }
7  n11  Insert  { s1, Marker(n12), e7 }
```

**ExprTable A** (all `Verbatim`, unclassified):

```
e0  "card card--" + SIZE + " " + theme     e1  `count: ${count()}`
e2  count()                                e3  count() > 9
e4  `bump to ${count() + 1}`               e5  () => count.set(count() + 1)
e6  () => track("bump")                    e7  <For each={items()}>{…}</For>
```

**Unit B** (the row) — skeleton `li(m0) > Slot t0, Text ": "(m1), Slot t1`; patches:

```
0  m0  Event? { "onClick", e8 }        // [remove, item]
1  m0  Insert { t0, Marker, e9 }       // i()
2  m0  Insert { t1, Marker, e10 }      // item.name
```

### P2 Classify

```
e0  Static    konst=Str("card card--lg dark")   ← SIZE and theme are ConstLit
e1  Reactive  deps={s7}  Shape=Str   Cost=Cheap  Thunk=Arrow
e2  Reactive  deps={s7}  Shape=Num                Thunk=Eta     // `count()` → `count`
e3  Reactive  deps={s7}  Shape=Bool               Thunk=Arrow
e4  Reactive  deps={s7}  Shape=Str                Thunk=Arrow
e5  Static    Shape=Accessor  free={s7}     → NOT hoistable; delegated ("click" ∈ set)
e6  Static    Shape=Accessor  free={s2} only_globals=TRUE → HOISTABLE
                                             delegated ("pointerdown" ∈ set)
e7  Primitive(Flow(For))                    → handed to P4

e8  Static  Shape=HandlerTuple  fn=remove (module scope) → zero allocation per row
e9  Reactive deps={s11} Shape=Num Thunk=Eta       // `i()` → `i`
e10 Static                                        // s10 is RowValue — a plain value.
                                                  // ⇒ InsertPlan::Once, ZERO effects per row
```

`e10` is the single most important verdict here. `{item.name}` inside a keyed `For` row reads
nothing reactive — when the item changes, `mapArray` recreates the row. It will cost one
`insertBefore` and zero graph nodes, forever.

### P3 Fold

```
e0 → Folded("card card--lg dark")     skeleton n0.attrs = [class="card card--lg dark"]
                                      patch 0 DELETED
```

`e1`/`e3`/`e4` contain calls and do not fold. `<header>`, `<svg>`, `<path>`, `<span>` never
produced a patch at all — target #2 needs no code path. `SIZE` and `theme` become dead bindings;
they are **not** deleted (minimal AST mutation is a throughput decision) — the bundler's DCE
removes them.

### P4 Shape

```
e7 → Built:  For({ each: items,                          // `() => items()` η-reduced
                   children: (item, i) => <Unit B> })
     InsertPlan::Once                                    // For returns a fragment built once
```

η-reduction of `each` is legal because `For`'s body is
`typeof raw === "function" ? raw() : raw` (`components.ts:240`).

### P5 Peephole

Anchors, Unit A:

- `s0` — next materialising sibling is `n8` (`" clicks"`); the previous sibling is nothing, so
  no parse-time fusion hazard → rule 4 → `Anchor::Node(n8)`. **Zero markers.**
- `s1` — last materialising child of `<ul>` → `Anchor::End`.

Anchors, Unit B: `t0` → `Anchor::Node(m1)`; `t1` → `Anchor::End`. Zero markers.

(For contrast, had the JSX been `Total: {count()} clicks`, the hole would sit between two
literal text runs which the parser fuses into one node, rule 3 fires, and a `<!---->` **is**
emitted. The elision is a theorem about the parse.)

Effect grouping: `n9` has two `SetLive` with identical dep-sets `{s7}`, both `Cost::Cheap` →
merge accepted → `EffectGroup{len:2}`. `n6`'s lone `SetLive` stays ungrouped → thunk form.

Final patch A:

```
0  n6   SetLive     { "title", e1, Attr, Identity }        // len-1 ⇒ thunk form
1  n6   Insert      { s0, Node(n8), e2, Live, eta }
2  n9   Delegate    { "click", Inline(e5) }
3  n9   Delegate    { "pointerdown", Hoisted(_h$1) }
4  n9   EffectGroup { len: 2 }
5  n9   SetLive     { "disabled",   e3, Prop, Identity }
6  n9   SetLive     { "aria-label", e4, Attr, Identity }
7  n11  Insert      { s1, End, e7, Once }
```

**Skeleton HTML is now final**, with no `<!---->` anywhere:

```
A: <div class="card card--lg dark"><header class="card__head"><svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg><span>Items</span></header><p> clicks</p><button class="btn">Bump</button><ul></ul></div>
B: <li>: </li>
```

### P6 Address

`mat_ix`: `<div>` has 4 materialised children — header 0, p 1, button 2, ul 3. `<p>` has exactly
**one**, the text `" clicks"` at index 0 (the slot materialises nothing).

Needed: `n6` (title + insert parent), `n8` (anchor), `n9` (delegates + group), `n11` (insert
parent).

```
n6  index 1 : root.firstChild + 1×nextSibling             = 2   [lastChild + 2×prev = 3 rejected]
n8          : n6.firstChild                                = 1
n9  index 2 : n6.nextSibling                               = 1
n11 index 3 : root.lastChild                               = 1   [tie with n9.nextSibling;
                                                                  shallower dependency chain wins]

RefPlan A: _el$1 = Root, _el$2 = n6, _el$3 = n8, _el$4 = n9, _el$5 = n11
RefPlan B: _el$6 = Root(li), _el$7 = m1 via FirstChild
```

Five property reads for the whole component. `<header>`, `<svg>`, `<path>`, `<span>`, and
`Text "Items"` get no `RefId` at all.

### P7 Intern

```
hash(A) → _tmpl$1        hash(B) → _tmpl$2
hoisted:   _h$1 = () => track("bump")
delegated: {"click", "pointerdown"}
```

### Emitted — DOM target

```js
import {
  template as _$template,
  insert as _$insert,
  setProp as _$setProp,
  renderEffect as _$renderEffect,
  delegateEvents as _$delegateEvents,
} from "@barqjs/core";
import { For, signal } from "@barqjs/core";
import { track } from "./analytics";

const _tmpl$1 = /*#__PURE__*/ _$template(`<div class="card card--lg dark"><header class="card__head"><svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg><span>Items</span></header><p> clicks</p><button class="btn">Bump</button><ul></ul></div>`);
const _tmpl$2 = /*#__PURE__*/ _$template(`<li>: </li>`);

const _h$1 = () => track("bump");

_$delegateEvents(["click", "pointerdown"]);

const SIZE = "lg";

function remove(item, e) {
  e.stopPropagation();
  console.log("remove", item.id);
}

export function Card(props) {
  const count = signal(0);
  const items = signal([{ id: 1, name: "alpha" }]);
  const theme = "dark";

  const _el$1 = _tmpl$1();
  const _el$2 = _el$1.firstChild.nextSibling;   // <p>
  const _el$3 = _el$2.firstChild;               // " clicks"
  const _el$4 = _el$2.nextSibling;              // <button>
  const _el$5 = _el$1.lastChild;                // <ul>

  _$setProp(_el$2, "title", () => `count: ${count()}`);
  _$insert(_el$2, count, _el$3);

  _el$4.$$click = () => count.set(count() + 1);
  _el$4.$$pointerdown = _h$1;

  _$renderEffect((_p$ = {}) => {
    const _v$ = count() > 9;
    const _v$2 = `bump to ${count() + 1}`;
    if (_v$ !== _p$.a) _$setProp(_el$4, "disabled", (_p$.a = _v$));
    if (_v$2 !== _p$.b) _$setProp(_el$4, "aria-label", (_p$.b = _v$2));
    return _p$;
  });

  _$insert(
    _el$5,
    For({
      each: items,
      children: (item, i) => {
        const _el$6 = _tmpl$2();
        const _el$7 = _el$6.firstChild;   // ": "
        _el$6.$$click = [remove, item];
        _$insert(_el$6, i, _el$7);
        _$insert(_el$6, item.name);
        return _el$6;
      },
    }),
  );

  return _el$1;
}
```

**What each target bought, line by line.**

- **#1** `item.name` is `Static` → `_$insert(_el$6, item.name)`: no thunk, no closure, no effect.
  `SIZE` and `theme` never appear at runtime.
- **#2** `<header>` and its SVG cost exactly one `cloneNode` and zero statements.
- **#3** `"card card--" + SIZE + " " + theme` baked into the template HTML.
- **#4** `disabled` + `aria-label` share ONE `renderEffect`, with per-slot `!==` guards so a
  change still writes only the property that actually changed.
- **#5** Five property reads, using `lastChild` for `<ul>`.
- **#6** Two distinct hashes, two templates, numbered in first-use order.
- **#7** `$$click`/`$$pointerdown` written directly; the row handler is the module-scope
  `remove` in a `[fn, data]` tuple, so 1000 rows allocate zero handler closures; one
  `delegateEvents` call replaces N private `ensureDelegatedListener` calls.
- **#8** `each: items` — the accessor passes through, not `() => items()`. `{i()}` → `i`.
- **#9** No `<!---->` anywhere. The literal `" clicks"` text node is the marker, and so is `": "`.
- **#11** No IIFE — the JSX was in return position, so the statements splice into `Card`'s body.

Effects created: 2 in the shell (title, text hole) + 1 fused prop effect, and **one per row**
instead of two.

**Oracle check.** Against the same JSX through `createElement`: the oracle appends the hole's
text node, then `" clicks"` → `<p title="count: 0">0 clicks</p>`. Compiled: the template holds
`" clicks"` and `insert` places the text before it → byte-identical. `disabled` is `false` in
both, and `"disabled" in DOM_PROPS` so both take the property path. Updates go through the same
`applyInsert` text write-through.

### Emitted — SSR target (same IR, opposite cut policy)

```js
import { esc as _$esc, escAttr as _$escAttr } from "@barqjs/core/server";
import { signal } from "@barqjs/core";
import { track } from "./analytics";

const SIZE = "lg";

function remove(item, e) { /* unchanged; never called on the server */ }

export function Card(props) {
  const count = signal(0);
  const items = signal([{ id: 1, name: "alpha" }]);
  const theme = "dark";

  return `<div class="card card--lg dark">`
    + `<header class="card__head"><svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg><span>Items</span></header>`
    + `<p title="${_$escAttr(`count: ${count()}`)}">${_$esc(count())} clicks</p>`
    + `<button class="btn"${count() > 9 ? " disabled" : ""} aria-label="${_$escAttr(`bump to ${count() + 1}`)}">Bump</button>`
    + `<ul>${(items() ?? []).map((item, _i$) => `<li>${_i$}: ${_$esc(item.name)}</li>`).join("")}</ul>`
    + `</div>`;
}
```

Same skeleton bytes, same slot boundaries, `Marker` nodes skipped, `Delegate` patches dropped
(so `<button class="btn"` stays one contiguous quasi — no empty `""` slot), `EffectGroup`
ignored. `Shape::Bool` on `e3` specialised `disabled` into a ternary; `Shape::Num` on the row
index means `_i$` needs no escape at all. `i()` was substituted to `_i$` because every reference
to the index parameter was a zero-arg call. `track` and `remove` survive as dead bindings for
the bundler to remove. Zero DOM calls, zero runtime escaping of literal text.

---

## 8. Verification against the real runtime

Everything in §7's DOM output was checked against `packages/core/src`. Places where the source
designs invented API that does not exist:

| # | Claim | Reality |
|---|---|---|
| V1 | `delegateEvents(types)` | **Does not exist.** `ensureDelegatedListener` and `installedDelegatedEvents` are module-private (`dom.ts:146,191`). A compiler-emitted `el.$$click = h` installs **no** document listener and the handler is silently dead. **Hard blocker**; ~6 lines in `dom.ts` + one re-export in `index.ts`. |
| V2 | `el.$$clickData = data` | **Does not exist.** `delegatedEventHandler` reads `$$${e.type}` and branches on `Array.isArray(handler)`, calling `handler[0].call(node, handler[1], e)` (`dom.ts:169`). The tuple lives in `$$<type>`. Two of the three designs invented `$$clickData`; it compiles cleanly and does nothing. The correct emit is `el.$$click = [remove, item]`, and the call convention is `remove(item, e)`. |
| V3 | `const [count, setCount] = signal(0)` | **Wrong.** `signal()` returns a callable `Signal<T>` with `.set`/`.update`/`.peek` (`signals.ts:1136`), not a tuple. Destructuring it throws. `useState` is the tuple form; `useStore` returns `[proxy, setter]`. Two of the three worked examples had this wrong. |
| V4 | `@barqjs/core/server` with `esc`/`attr`/`ssr`/`each`/`when` | **Does not exist.** `packages/core/package.json` exports only `.`, `./jsx-runtime`, `./jsx-dev-runtime`. SSR today is happy-dom + `container.innerHTML` via `renderToString` (`server.ts:31`). Every SSR emit shape in every design is fictional until `ssr.ts` lands. |
| V5 | `template(html, isSVG?)` | Confirmed 2-arg, returns `() => Node`, caches on first call and clones (`dom.ts:986`). But it returns `content.firstChild` **only**, so multi-root fragments need one template per root. And `isSVG = true` wraps in `<svg xmlns>` and returns `svgEl.firstChild`, so it is for templates rooted at an SVG *child*, not at `<svg>` itself. |
| V6 | `renderEffect((_p$ = {}) => { …; return _p$ })` | **Works.** `recompute` calls `node._fn(uninit ? undefined : node._value)` (`signals.ts:868`) and stores the return (`signals.ts:972`). Hard rule: the compute must **never return a function** — `signals.ts:994` would register it as the cleanup. |
| V7 | reactive detection at runtime | `isSignalGetter` is literally `typeof value === "function"` (`type-utils.ts:30`). There is no signal brand. So `React::Opaque` passed unwrapped is *exactly* oracle-identical — the cheap, sound answer. Corollary: a static function-valued attribute can never be emitted unwrapped expecting a one-shot write. |
| V8 | `For` row params | Confirmed `(item: T, index: () => number)` for keyed (`components.ts:264`); `Index` is `(item: () => T, index: number)`; `For` with `keyed: false` delegates to `Index`. `each` accepts `T[] \| (() => T[])`, so η-reduction is legal. |
| V9 | "Match/Switch become ternaries" | **DOM-target-false.** `Match` returns its own props object (`components.ts:512`) and `Switch` reads them. The DOM target must emit real `Match({…})` calls. Only SSR inlines. |
| V10 | control flow returns a fragment | Confirmed. `For`/`Show`/`Switch`/`Dynamic` build a `DocumentFragment` with an internal marker pair and register their own `renderEffect` at construction (`components.ts:286`). `insert(parent, fragment)` takes the non-function path and creates zero extra effects. But the markers *are* spliced into the live parent — only the *template* is marker-free. |
| V11 | `DOM_PROPS` | Larger than any design listed: `value, checked, selected, disabled, readOnly, multiple, indeterminate, defaultChecked, defaultValue, innerHTML, innerText, textContent` (`dom.ts:103`), and the guard is `!isSvg && propKey in DOM_PROPS`. Must be generated, not transcribed. |
| V12 | `DELEGATED_EVENTS` | **22** names, not 23 (`dom.ts:121`). Excludes `change`, `submit`, `keypress`, `focus`, `blur`, `mouseenter`, `mouseleave`. Assuming otherwise emits dead handlers. |
| V13 | SVG attribute names | `setElementAttr` kebab-cases every SVG attribute **except** `class` and `viewBox` (`dom.ts:462`). Compile-time folding must reproduce that exactly. |
| V14 | `insert` sole-child fast path | `applyInsert` already does `parent.textContent = value` when `marker === null && current.length === 0 && parent.firstChild === null` (`dom.ts:707`). A `TextWrite` opcode (invented by one design) is redundant — reject it. |
| V15 | `spread(el, props)` | Confirmed, accepts an object or a thunk, applies `ref` once, skips `children` (`dom.ts:774`). |

---

## 9. Table generation, not transcription

`classToString`, `diffStyleObjects`' kebab + px rules, `CSS_NUMBER_PROPS`, `DOM_PROPS`,
`SVG_TAGS`, and `DELEGATED_EVENTS` all have to exist byte-for-byte in Rust. Nothing in a normal
build enforces that, and drift produces *wrong HTML*, not a crash.

`build.rs` therefore parses `packages/core/src/dom.ts` and emits `tables.rs` (the PHFs behind
`TagId`/`NameId` and their flag bits). CI fails on drift. This is a requirement, not a nicety —
it is the only mechanism that keeps the compiler and the runtime honest.

---

## 10. Implementation order

Milestone 1 is the existing scaffold (`options.rs`, the napi surface, the empty module tree).

The types currently in `src/ir`, `src/analysis` and `src/codegen` are **placeholders, not the
model described above**. Nothing in `compile()` references them. `Skeleton`, `Patch`, `ExprTable`
and the arena lifetime `'a` land in M2 and replace those types wholesale — do not extend
`TemplateIr`/`Hole`/`NodePath` or the four-pass `Pipeline`, and do not read them as a commitment.

**M2 — Bone and sinew.** `Skeleton`, `Patch`, `ExprTable`, P1 Lower, and a DOM backend that
handles intrinsic elements, static attributes, literal text, and dynamic children/attributes
with no analysis at all (everything `Opaque`, everything gets a marker, walks are pure
`firstChild`/`nextSibling`). No components, no control flow, no SSR. Deliverable: the
**differential harness** — every fixture rendered twice, once via `jsxImportSource=@barqjs/core`
through Bun's own JSX transform into `createElement`, once through our compiler, with the two
DOM trees diffed. This harness is the project's spine and must exist before any optimisation
does.

**M3 — Reactivity.** P0 Bind, P2 Classify, P3 Fold, and the event resolution. `build.rs` table
generation lands here because P2 needs `DELEGATED_EVENTS` and `DOM_PROPS`. Effect grouping (P5's
grouping half). **Requires core delta V1 (`delegateEvents`)** — until it merges, emit
`_$setProp(el, "onClick", h)` instead of the expando so the harness stays green. Deliverable:
targets #1, #3, #4, #7, and #2 falling out for free.

**M4 — Make it fast and debuggable.** P5's anchor half (marker elision), P6 Address
(bidirectional distance transform), P7 Intern (dedup + hoisting), statement splicing, and the
full `Mappings` plumbing. Deliverable: targets #5, #6, #9, and the sourcemap strategy. Add a
compile-throughput benchmark to CI here, since this is the milestone that could regress it.

**M5 — Components and control flow.** P4 Shape, nested `Unit`s, η-reduction, props getters,
`Match`/`Switch` handled as real calls, `Dynamic`/`Portal`/`ErrorBoundary` as ordinary component
calls, spread and `ref`. Deliverable: target #8 and the full JSX shape catalogue from
`packages/compiler`'s test suite passing through the differential harness.

**M6 — SSR.** `packages/core/src/ssr.ts` + the `"./server"` export condition, P8b, the opcode
lowering table, string inlining of the six inlinable flow components, and the **dual-render
conformance suite** that renders every fixture through both `renderToString` (happy-dom, the
existing path) and the compiled SSR path and diffs the HTML. Deliverable: target #10, with an
explicit and tested fallback for the eight non-inlinable flow components.

Then **the Babel plugin goes**. `packages/compiler` keeps `barqVitePlugin` and nothing else: the
transforms, the Babel entry point, `types.ts` and the four Babel test files were deleted once
every JSX shape their 55 cases pinned had a fixture in `fixtures/`. There is no `native` option
any more, because there is no alternative pipeline for it to select — a checkout whose native
binary is unbuilt gets an error naming the build command, not a quieter compile.

---

## 11. Provenance

**Base: Ossify.** The Skeleton/Patch split is the only architecture in which target #2 is a
type-level fact (`patch.is_empty()`) rather than an analysis result, and the opcode lowering
table is the strongest available guarantee that the DOM and SSR backends cannot drift — a new
opcode must be given a row in both. It was also the design most anchored to the real runtime:
the only one that got `$$<type>` tuples right, the only one that identified `mat_ix` (a leading
hole must not shift the sibling walk), and the only one that noticed `template()` returns
`firstChild` only.

**Grafted from DepSet** (the reactivity design):

- The entire `SourceKind` taxonomy — `Accessor { nonreactive }`, `ReactiveObject`,
  `AccessorRecord` (for `Resource<T>`), `PropsParam`, `RowValue`, `Primitive(Prim)` — and the
  per-primitive return-shape table. This is a materially better answer to target #1 than the
  base design's `Accessor | Store | RowValue` trichotomy, especially the `.set`/`.peek`/`.update`
  member mask and the `untrack` rule.
- `Shape::Accessor(inner_deps)`: looking *inside* a user-written `() => …` so a static thunk is
  not treated as reactive, and a reactive one can be inlined into the element's coalesced effect,
  deleting the user's closure.
- The four-case marker rule — in particular **case 3, adjacent literal text runs**. This is the
  only design that noticed the HTML parser fuses adjacent text into one node, which makes the
  other designs' marker elision quietly wrong for `Total: {x} clicks`.
- The η-reduction rules and their legality boundary: legal for builtin flow props whose
  unwrapping contract we know, illegal for user component props.
- `PropInit::Getter` vs `Value` for component props.
- The disjoint-deps split in the effect-grouping cost model.

**Rejected from DepSet:** the `Vol` axis (the author's own weakness note is right — two thirds of
it is dead weight; replaced with `Option<Const>`); `FxHashMap<Span, &[SymbolId]>` for free
variables (spans as keys is fragile and hashes in the hot path — replaced with Ribbon's
`ScopeRanges` + a `u64` mask); `Deps::Set(&'a [SymbolId])` with arena merging (a `u64` mask
answers the only question actually asked, with no allocation); the inter-procedural
`specialized` prop map (soundness conditions — never exported, never aliased, all call sites
agree — are too fragile to build on in M2..M6; parked as future work); and `$$clickData`.

**Grafted from Ribbon** (the throughput design):

- The two-sweep bidirectional 1-D distance transform for P6. Concrete and optimal per sibling
  chain, versus the runner-up's hand-waved "minimum-cost solver".
- The contiguous-byte-range template arena: one `String` for all templates, hash a contiguous
  range that is still in L1, and `truncate()` on a dedup hit so duplicates leave no residue.
- The `renderEffect((_p$ = {}) => { …; return _p$ })` fused form — verified against `recompute`
  (V6), and better than a pile of `let _p$1, _p$2` declarations leaking into the component body.
- `ScopeRanges` (pre-order `lo`/`hi` over oxc's scope tree) making the free-variable test for
  handler hoisting two integer comparisons.
- Interning tags and attribute names to `TagId`/`NameId` with bit-flag tables, so no pass after
  P1 ever compares a string.
- The `Mappings` design: three parallel `u32` columns of byte offsets, converted to line/column
  once at the end.
- Promoting "generate the Rust tables from `dom.ts`" from a weakness-section aspiration to a
  build requirement (§9).

**Rejected from Ribbon:** the pre-order `subtree_len` columnar node ribbon. It is append-only by
construction, and the author is right that the first optimisation genuinely needing tree
rewriting — hoisting a loop-invariant subtree out of a `For` row, reordering children to shorten
walks, inlining a component's JSX into its caller — costs a full rebuild. The base design gets
most of the same cache behaviour from a flat `Vec<Patch>` of POD *after* P1, without freezing the
tree. Also rejected: the `Payload` union with `transmute` accessors; `Module<'a>::clear()` reused
across files (not sound with an arena lifetime — reuse the `Allocator` instead); the `TextWrite`
opcode (V14 — the runtime already has that fast path); and `$$clickData`.

---

## 12. Open questions

These could not be resolved from the runtime source. Each is phrased so it can be answered in a
sentence.

**O1 — `delegateEvents`.** Will you export
`export function delegateEvents(types: string[]) { for (const t of types) ensureDelegatedListener(t) }`
from `dom.ts` and re-export it from `index.ts`? Without it, every compiler-emitted `$$click`
write is a silently dead handler. If the answer is no, the compiler must emit
`setProp(el, "onClick", h)` instead and target #7 is off the table.

**O2 — SSR scope.** Is a real string-mode `packages/core/src/ssr.ts` (+ a `"./server"` export
condition) in scope, or should the SSR target be deferred past M6? And if it is in scope: are
you willing to write string implementations of `Loading`, `Errored`, `Reveal`, `Suspense`,
`Await`, `Portal`, `Dynamic`, and `ErrorBoundary`, or should modules using those permanently
fall back to the happy-dom `renderToString` path?

**O3 — the `{item.name}` verdict.** Under the lifting rule, a member read on a keyed `For` row
item performs no tracked read, so it is applied once with no thunk and no effect. That matches
the un-compiled oracle and is a large win on list-heavy pages, but it diverges from Solid and
silently produces a non-updating cell if the row item is a store proxy the analysis missed (an
array of proxies from another module, a `mapArray` result crossing a function boundary). Do you
want this on by default, on with a compile-time note when `each`'s origin is unresolvable, or
behind a flag?

**O4 — compiler-mode auto-thunking.** `<div>{count()}</div>` is a one-shot text node under
`createElement` but the compiler makes it live. `config.ts` has `IsCompilerMode` /
`StrictAccessor`, so this looks like the documented opt-in contract — please confirm, because it
means the invariant "never do more reactive work than the oracle" is deliberately false for
exactly the `Reactive` class, and the differential harness must special-case it rather than
diffing effect counts blindly.

**O5 — `class` on SVG elements looks broken today.** `applyResolvedProp` writes
`element.className = className` (`dom.ts:358`), but on an `SVGElement` `className` is a read-only
`SVGAnimatedString`, so the write silently fails. Is that a known bug? The compiler can dodge it
by folding static SVG classes into the template, but dynamic `class` on an SVG element has no
correct lowering until `dom.ts` uses `setAttribute("class", …)` for the SVG case.

**O6 — the name-based option surface.** `options.rs` currently carries
`control_flow_components`, `list_components`, and `provider_components` as `Vec<String>` matched
by name (including a `.Provider` suffix rule). The new design resolves everything by `SymbolId`.
Should those options be deleted, or kept as a fallback for components that are re-exported
through a barrel file the compiler cannot see through?

**O7 — `Dynamic` and getter-lowered props.** `Dynamic` does
`const { component: _, ...rest } = props` (`components.ts:1150`), which flattens getters once and
kills fine-grained flow into the rendered component. Should the compiler special-case `Dynamic`
by passing plain values, warn, or leave it?

**O8 — hydration.** `hydrate()` is replace-based today and the doc comment says node-reuse
hydration "requires compiler-emitted hydration keys". Is claim-based hydration a goal for this
compiler? The IR already carries what it would need (`Skeleton::origin`, per-`Unit` spans,
`SkelNode::Marker`), but it would require the SSR backend to emit the DOM backend's markers plus
a hydration key per unit — which is a third serialisation mode and directly contradicts the
"drop the markers to keep the payload small" choice made in §5.

**O9 — `<pre>` / `<textarea>` and raw-text elements.** The HTML parser eats one newline
immediately after `<pre>` and `<textarea>`, so the skeleton must emit `&#10;` or diverge from the
oracle's `createTextNode`. Are there existing fixtures covering this, or should M2 add them?

*Answered, and twice corrected.* `&#10;` does NOT work — the tokenizer emits the same character
token for a reference, so the rule eats it too; the skeleton doubles the newline instead. And the
rule is about the BYTE that follows the open tag, not about the first skeleton child: a `Slot`
materialises nothing, so once P5 began eliding markers a hole in front of the newline put it back
against `<pre>` and the parser ate it again. The doubling therefore looks past leading `Slot`
nodes. Neither half is visible to happy-dom, which implements no part of the rule; both are pinned
in real Chrome, by `test/browser-parse-check.ts`'s hazard rows and by
`fixtures/browser-only/pre-hole-newline.tsx`.

**Text escaping, related.** `>` is escaped as `&gt;` in template text although no conforming
tokenizer requires it. It is what the HTML serialization spec writes, and it is a byte that moves
real parsers apart: happy-dom splits a text run on a bare `>` where Chrome keeps one node, which
puts a different node under `firstChild.nextSibling` in the two engines and would let a wrong walk
pass the fake-DOM half of the harness.

**O10 — compile-throughput target.** "Sub-millisecond for a typical component file" — is there
an agreed definition of typical (LOC, JSX node count) and a machine to measure it on, so M4 can
add a CI gate rather than a vibe?
