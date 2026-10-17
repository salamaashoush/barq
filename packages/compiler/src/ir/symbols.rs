use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, JSXAttributeValue};
use oxc::semantic::{ScopeId, SymbolId};
use oxc::span::Span;
use oxc_index::IndexVec;

use crate::diag::Code;

use super::{AVec, Const, react::BIT_OVERFLOW};

/// What a resolved binding IS. Assigned per `SymbolId`, so shadowing is free,
/// name collisions are impossible, and `import { signal as sig }` just works.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum SourceKind {
    /// Calling it is a reactive read: what `createSignal()[0]` and
    /// `createMemo()` hand back.
    Accessor,
    /// ANY member read is a reactive read: `useStore()[0]`, `projection`,
    /// `optimisticStore()[0]`.
    ReactiveObject,
    /// A compiled component's props parameter. Member reads are ⊤-reactive
    /// because our own component emit lowers props to getters.
    PropsParam,
    /// Resolves to a `@barqjs/core` primitive; drives the return-shape table.
    Primitive(Prim),
    /// The row VALUE parameter of a keyed `<For>`. A PLAIN VALUE, not an
    /// accessor — `(item: T, index: () => number)`. Getting this wrong is the
    /// classic name-heuristic bug.
    RowValue,
    /// Bound to a never-reassigned literal. The value itself lives in
    /// [`ReactiveEnv::konst`], so there is one place a fold can read it from.
    ConstLit,
    /// Provably reads no reactive state
    Inert,
    /// Bound to a function or arrow expression and never reassigned, so the
    /// binding IS the handler: `const h = () => …; <button onClick={h}/>` can
    /// take the `__bq_click` expando instead of going through `setProp`. Inert in
    /// every other respect — creating a reference to it reads nothing.
    ///
    /// `nullary` is the arity discriminator, and it is the ONLY thing that
    /// separates a Cell from a key function once both are values in the same
    /// slot: `Cell<T> = (...ignored: never[]) => T` declares no parameter, so a
    /// zero-arity binding forwards by identity (C5) and a parameterised one
    /// crosses as `() => f`.
    Fn { nullary: bool },
    /// Unresolvable: cross-module import, reassigned from an unknown RHS, or
    /// bound by a pattern we cannot follow.
    #[default]
    Opaque,
}

impl SourceKind {
    /// A user component whose props we lower to getters, versus a builtin whose
    /// unwrapping contract we know. η-reduction is legal only for the latter.
    #[inline]
    pub fn flow(self) -> Option<Flow> {
        match self {
            SourceKind::Primitive(Prim::Flow(flow)) => Some(flow),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Prim {
    Signal,
    Computed,
    Store,
    UseContext,
    /// `createContext()`. Its result is the provider component itself.
    CreateContext,
    Optimistic,
    OptimisticStore,
    Projection,
    MapArray,
    Repeat,
    Untrack,
    /// `isPending(fn)` / `latest(fn)` — A5 (f)'s read surface. They INVOKE
    /// their argument, so the read is theirs and not the call site's.
    ReadMode,
    /// `dynamic(source)`, Solid 2.0's factory for a component chosen at run
    /// time. The server backend calls the string half of the same name.
    Dynamic,
    /// `clientOnly(fn)`, Solid 2.0's factory for a component that renders only
    /// in the browser. The server backend calls the string half of the same
    /// name, which never starts the import.
    ClientOnly,
    /// `Dynamic`, which Solid 2.0 deprecates in favour of `dynamic` and barq
    /// does not export. Resolved only so BARQ025 can name the replacement.
    RemovedDynamic,
    Flow(Flow),
}

impl Prim {
    /// Resolved by module specifier + imported name in P0, never by the local
    /// binding's spelling — `import { signal as sig }` classifies, and a
    /// user-defined `const signal = 1` does not.
    pub fn of_export(name: &str) -> Option<Self> {
        Some(match name {
            "createSignal" => Prim::Signal,
            "createMemo" => Prim::Computed,
            "createStore" => Prim::Store,
            // The one `use*` that stays, because it is not an alias of a
            // constructor — reading what the owner tree provides is its own
            // operation, and it answers with the Cell compiled code wants.
            "useContext" => Prim::UseContext,
            "createContext" => Prim::CreateContext,
            "createOptimistic" => Prim::Optimistic,
            "createOptimisticStore" => Prim::OptimisticStore,
            "createProjection" => Prim::Projection,
            "mapArray" => Prim::MapArray,
            "repeat" => Prim::Repeat,
            "untrack" => Prim::Untrack,
            // A5 (f). Both call their argument immediately, which is the fact
            // the classifier cannot get anywhere else: `isPending(user)` only
            // REFERENCES `user`, and `isPending(() => user())` puts the read in
            // a nested arrow, which is deferred everywhere else — that deferral
            // is what makes a handler hoistable.
            "isPending" | "latest" => Prim::ReadMode,
            "For" => Prim::Flow(Flow::For),
            "Repeat" => Prim::Flow(Flow::Repeat),
            "Show" => Prim::Flow(Flow::Show),
            "Switch" => Prim::Flow(Flow::Switch),
            "Match" => Prim::Flow(Flow::Match),
            "Loading" => Prim::Flow(Flow::Loading),
            "Errored" => Prim::Flow(Flow::Errored),
            "Reveal" => Prim::Flow(Flow::Reveal),
            "Portal" => Prim::Flow(Flow::Portal),
            "dynamic" => Prim::Dynamic,
            "clientOnly" => Prim::ClientOnly,
            "Dynamic" => Prim::RemovedDynamic,
            "NoHydration" => Prim::Flow(Flow::NoHydration),
            _ => return None,
        })
    }
}

/// How `<For>` hands a row to `children`, read off `props.keyed`
/// (`components.ts:238-276`, `map.ts:53-57`). Three arms, not two: a key
/// FUNCTION boxes the item in a row signal, so the item is an ACCESSOR there
/// and a plain value only in the by-item arm.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Keyed {
    /// absent or `true` — `(item: T, index: () => number)`
    ByItem,
    /// `keyed={false}` — positional rows: `(item: () => T, index: number)`
    ByIndex,
    /// a key function, or anything that cannot be PROVED not to be one —
    /// `(item: () => T, index: () => number)`
    ByFn,
}

impl Keyed {
    /// Unprovable resolves to [`Keyed::ByFn`], the only arm that is safe when
    /// wrong: it classifies both parameters as accessors, so a plain-value read
    /// falls out `Opaque` (emitted unwrapped, the oracle's own decision) instead
    /// of `Static` (applied once, never updated).
    pub fn of_expression(value: &Expression<'_>) -> Self {
        Keyed::verdict(value).0
    }

    /// The arm, and whether the source PROVED it. The runtime asks `typeof
    /// options.keyed === "function"` (`map.ts:53`), which no static analysis can
    /// answer for `keyed={KEYED}` or `keyed={props.keyed}`; those resolve to the
    /// safe arm with `proved = false`, and a consumer that would tell the author
    /// something about the row — D1 — must stay out of an unproved row.
    pub fn verdict(value: &Expression<'_>) -> (Self, bool) {
        match value {
            Expression::BooleanLiteral(literal) if !literal.value => (Keyed::ByIndex, true),
            Expression::BooleanLiteral(_) | Expression::StringLiteral(_) => (Keyed::ByItem, true),
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                (Keyed::ByFn, true)
            }
            _ => (Keyed::ByFn, false),
        }
    }

    /// The same question asked of the JSX attribute before lowering. A bare
    /// `keyed` is `true`.
    pub fn of_attribute_value(value: Option<&JSXAttributeValue<'_>>) -> Self {
        Keyed::verdict_of_attribute_value(value).0
    }

    pub fn verdict_of_attribute_value(value: Option<&JSXAttributeValue<'_>>) -> (Self, bool) {
        match value {
            None | Some(JSXAttributeValue::StringLiteral(_)) => (Keyed::ByItem, true),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                container.expression.as_expression().map_or((Keyed::ByFn, false), Keyed::verdict)
            }
            Some(_) => (Keyed::ByFn, false),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Flow {
    // string-inlinable on the server
    For,
    Repeat,
    Show,
    Switch,
    Match,
    // NOT string-inlinable — need real server implementations
    Loading,
    Errored,
    Reveal,
    Portal,
    /// NOT control flow, and it sits in this enum only because the lowering
    /// tables are keyed by it. `NoHydration` renders its children once and
    /// unconditionally; what it decides is whether the CLIENT claims the markup.
    /// Solid ships it from `dom-expressions` rather than as one of the nine, and
    /// the count below is unchanged by it.
    NoHydration,
}

// `Suspense`, `Await` and `ErrorBoundary` are not constructs. Solid 2.0's control-flow surface is nine constructs — `For`, `Repeat`,
// `Show`, `Switch`, `Match`, `Errored`, `Loading`, `Reveal` from `solid-js`,
// plus `Portal` from `@solidjs/web` — read out of `solid-js@2.0.0-rc.0` rather
// than out of its documentation. None of the three is in it, and all three
// were already legacy duplicates of `Loading` / `resource` / `Errored`.
// `<Dynamic>` left too: Solid 2.0 deprecates it for the `dynamic` factory,
// which is a function returning a component and not a construct.
//
// `Suspense` was `Loading` under its pre-2.0 name and forwarded to it verbatim.
// `ErrorBoundary` was `Errored` with the error handed over BY VALUE instead of
// as an accessor. `Await` was the one with content of its own, and it was the
// nesting the compiler already lowered it to: a `Loading` around an `Errored`
// whose body reads the resource.

impl Flow {
    /// `Match` returns its own props object and `Switch` reads them, so the DOM
    /// target must emit a real call. Only SSR inlines the construct.
    #[inline]
    pub fn returns_a_fragment(self) -> bool {
        !matches!(self, Flow::Match)
    }

    /// The `@barqjs/core` export this resolved from, for a diagnostic that has
    /// to name the component that sent a module down the fallback path.
    #[inline]
    pub fn name(self) -> &'static str {
        match self {
            Flow::For => "For",
            Flow::Repeat => "Repeat",
            Flow::NoHydration => "NoHydration",
            Flow::Show => "Show",
            Flow::Switch => "Switch",
            Flow::Match => "Match",
            Flow::Loading => "Loading",
            Flow::Errored => "Errored",
            Flow::Reveal => "Reveal",
            Flow::Portal => "Portal",
        }
    }

    /// C5.1 item 1 at a flow slot. Every name here is read through `readValue`
    /// in `components.ts` and lowers to a Cell argument of the primitive the
    /// construct compiles to, so a Block landing in one is the same
    /// compile-time fact an attribute on an intrinsic element is — and the
    /// runtime answers it with the same `ScopeMissingError`.
    ///
    /// Answers the primitive position the diagnostic names. A prop absent here
    /// is a Block slot (`children`, `fallback`) or one nothing resolves.
    #[inline]
    pub fn cell_slot(self, prop: &str) -> Option<&'static str> {
        match (self, prop) {
            (Flow::For, "each") => Some("each source"),
            (Flow::Repeat, "count" | "from") => Some("each source"),
            (Flow::Show | Flow::Match, "when") => Some("branch key"),
            (Flow::Portal, "mount") => Some("portal target"),
            (Flow::Loading, "on") => Some("boundary on"),
            (Flow::Reveal, "order" | "collapsed") => Some("branch key"),
            _ => None,
        }
    }
}

/// A diagnostic a pass produced. The CODE is what a suppression comment and a
/// severity map both key on, so it is carried from the site that raised it
/// rather than reconstructed from the message text.
#[derive(Clone, Copy)]
pub struct Diag<'a> {
    pub code: Code,
    pub span: Span,
    pub message: &'a str,
}

pub struct ReactiveEnv<'a> {
    pub kind: IndexVec<SymbolId, SourceKind>,
    /// The value behind a [`SourceKind::ConstLit`]. Parallel to `kind` so P3 can
    /// fold a symbol read without a second lookup structure.
    pub konst: IndexVec<SymbolId, Option<Const<'a>>>,
    /// dense per-unit renumbering of the reactive symbols, for `DepSet::mask`.
    /// `BIT_OVERFLOW` = does not fit.
    pub bit: IndexVec<SymbolId, u8>,
    /// Pre-order scope ranges. oxc creates scopes in pre-order, so "is scope A
    /// nested in scope B" is two integer comparisons, and the free-variable test
    /// for handler hoisting is O(1) per reference.
    pub scope_lo: AVec<'a, u32>,
    pub scope_hi: AVec<'a, u32>,
    pub diagnostics: AVec<'a, Diag<'a>>,
    /// `import * as core from "@barqjs/core"`. A member of one of these resolves
    /// to no `SymbolId` of its own, so every question asked by `SymbolId` —
    /// which is every question this compiler asks — is blind to `core.For`
    /// unless it goes through here first.
    pub namespaces: Vec<SymbolId>,
    /// Every symbol a JSX CLOSING tag resolves to. oxc records one reference per
    /// tag, so `<Show>…</Show>` reads as two uses of one binding; anything
    /// counting real uses has to subtract these.
    pub jsx_closings: Vec<SymbolId>,
    /// Every never-reassigned binding initialised by `createContext()`, so a
    /// tag naming one is known to be a provider, `<Theme value>`.
    pub contexts: Vec<SymbolId>,
    /// `(body span, name)` for every function this module writes as a tag or
    /// exports and that returns JSX. The only component IDENTITY the IR carries:
    /// `Skeleton::origin` is html-byte-offset → JSX span, which answers "where
    /// did this template come from" and not "whose template is it". Populated
    /// only under `dev`, and read only by the dev-mode label pass.
    pub components: Vec<(Span, &'a str)>,
    /// C5.1 item 1. Every `(component, prop)` pair this module can PROVE is a
    /// Cell slot: the component reads `props.<prop>` in a position the emission
    /// makes a Cell — an attribute on an intrinsic element — or forwards it into
    /// another in-module component's slot that is one.
    ///
    /// Item 1 is the compile-time half of "a Block landing in a Cell slot", and
    /// it is answerable only within a module. The
    /// set is the CALLEE's; the diagnostic is raised at the caller, which is
    /// what "naming both positions" means when a `Diag` carries one span.
    pub cell_slots: Vec<CellSlot<'a>>,
    /// O5. The spans of function literals written as the FIRST argument of the
    /// framework's `render`/`hydrate`, resolved by module specifier and
    /// imported name rather than by spelling.
    ///
    /// `render(block, container)` opens the ROOT scope and calls the block with
    /// it — that is the whole of O5 — so the block is a Block position in
    /// exactly the sense C6 means, and its scope parameter is the only route by
    /// which the root reaches the application. Without this a mount emits
    /// `App(_s$, …)` against the module-level `const _s$ = null` and every
    /// scope-creating primitive below it (`provide`, `branch`, `boundary`,
    /// `portal`) opens a DETACHED root, so `render`'s disposer disposes
    /// nothing it mounted.
    pub root_blocks: Vec<Span>,
    /// O5's other spelling: a bare JSX ARGUMENT in that same first position,
    /// `render(<App/>, host)`.
    ///
    /// JavaScript evaluates an argument before the call, so this form builds the
    /// whole subtree BEFORE `render` opens its root — the effects are the
    /// caller's owner's kids from the instant they exist and the root never held
    /// them. The runtime cannot repair it from the inside: by the time `render`
    /// is entered the tree is built and its ownership is already decided, which
    /// is why `dom.ts` could only warn (`RENDER_SUBTREE_NOT_OWNED`).
    ///
    /// The compiler CAN repair it, and this is the span it repairs: `scope`
    /// wraps the expression into the Block the callee wants, so the two
    /// spellings compile to one program. The runtime keeps accepting a built
    /// subtree, because a hand-written caller can still hand it one — that is
    /// what the fixture's controls drive.
    pub root_jsx_args: Vec<Span>,
    /// Zero-arity functions whose body reads something tracked, sorted.
    ///
    /// `const double = () => count() * 2` is a function and stays one: a
    /// reference to it is a handler like any other. CALLING it is a tracked
    /// read, and knowing that is the difference between one effect per
    /// attribute that calls it and one effect for all of them.
    pub derived: Vec<SymbolId>,
    /// Bindings initialised with an array literal whose every element is an
    /// object, array or primitive literal. Its rows are values the literal
    /// created, never store proxies, so a `<For>` over them reads nothing a
    /// field write could leave stale.
    pub plain_rows: Vec<SymbolId>,
    /// The by-item `<For>` elements whose row callback reads a field of its row
    /// where nothing reads it again: a destructured parameter, a read outside a
    /// JSX hole, or a callback this module does not show, such as an import. A
    /// field read in a hole is emitted live and follows a store write, so a
    /// `<For>` with only those is not here.
    pub rows_read_once: Vec<Span>,
}

/// One proven Cell slot. `read` is where the callee consumes it, so the
/// diagnostic can name the position the value ends up in as well as the one it
/// was written at, and `channel` is the attribute it lands on there — which is
/// not always an ordinary attribute: `ref` and `on*` are Cell slots too, and at
/// those two the value is invoked with the ELEMENT or the EVENT rather than
/// with no scope, so a message that says "invoked with no scope" is false
/// exactly where it matters most.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CellSlot<'a> {
    pub component: SymbolId,
    pub prop: &'a str,
    pub read: Span,
    pub channel: &'a str,
}

impl<'a> ReactiveEnv<'a> {
    pub fn new_in(allocator: &'a Allocator) -> Self {
        Self {
            kind: IndexVec::new(),
            konst: IndexVec::new(),
            bit: IndexVec::new(),
            scope_lo: AVec::new_in(&allocator),
            scope_hi: AVec::new_in(&allocator),
            diagnostics: AVec::new_in(&allocator),
            namespaces: Vec::new(),
            jsx_closings: Vec::new(),
            contexts: Vec::new(),
            components: Vec::new(),
            cell_slots: Vec::new(),
            root_blocks: Vec::new(),
            root_jsx_args: Vec::new(),
            derived: Vec::new(),
            plain_rows: Vec::new(),
            rows_read_once: Vec::new(),
        }
    }

    #[inline]
    pub fn is_derived(&self, symbol: SymbolId) -> bool {
        self.derived.binary_search(&symbol).is_ok()
    }

    /// The flow component `object.property` names, when `object` is a namespace
    /// import of the runtime. `Prim::of_export` is the same table the named
    /// import goes through, so the two spellings cannot disagree.
    pub fn namespace_flow(&self, object: SymbolId, property: &str) -> Option<Flow> {
        if !self.namespaces.contains(&object) {
            return None;
        }
        match Prim::of_export(property) {
            Some(Prim::Flow(flow)) => Some(flow),
            _ => None,
        }
    }

    #[inline]
    pub fn nested(&self, outer: ScopeId, inner: ScopeId) -> bool {
        let (a, b) = (outer.index(), inner.index() as u32);
        self.scope_lo[a] <= b && b < self.scope_hi[a]
    }

    /// Unknown symbols answer `Opaque`, which is always sound.
    #[inline]
    pub fn kind_of(&self, symbol: SymbolId) -> SourceKind {
        self.kind.get(symbol).copied().unwrap_or(SourceKind::Opaque)
    }

    #[inline]
    pub fn bit_of(&self, symbol: SymbolId) -> u8 {
        self.bit.get(symbol).copied().unwrap_or(BIT_OVERFLOW)
    }

    #[inline]
    pub fn konst_of(&self, symbol: SymbolId) -> Option<Const<'a>> {
        self.konst.get(symbol).copied().flatten()
    }

    /// Whether a read of this binding is a tracked read, which is what earns a
    /// `DepSet` bit.
    #[inline]
    pub fn is_reactive(kind: SourceKind) -> bool {
        matches!(kind, SourceKind::Accessor | SourceKind::ReactiveObject | SourceKind::PropsParam)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unbound_symbol_answers_opaque() {
        let allocator = Allocator::new();
        let env = ReactiveEnv::new_in(&allocator);
        let symbol = SymbolId::from_usize(0);
        assert_eq!(env.kind_of(symbol), SourceKind::Opaque);
        assert_eq!(env.bit_of(symbol), BIT_OVERFLOW);
    }

    #[test]
    fn scope_nesting_is_two_integer_comparisons() {
        let allocator = Allocator::new();
        let mut env = ReactiveEnv::new_in(&allocator);
        // scope 0 spans [0,3): the module. scope 1 spans [1,3): a component.
        // scope 2 spans [2,3): an arrow inside it.
        env.scope_lo.extend([0, 1, 2]);
        env.scope_hi.extend([3, 3, 3]);
        let module = ScopeId::from_usize(0);
        let component = ScopeId::from_usize(1);
        let arrow = ScopeId::from_usize(2);
        assert!(env.nested(module, arrow));
        assert!(env.nested(component, arrow));
        assert!(!env.nested(arrow, component));
        assert!(env.nested(component, component));
    }

    #[test]
    fn every_construct_has_a_string_lowering() {
        let all = [
            Flow::For,
            Flow::Repeat,
            Flow::Show,
            Flow::Switch,
            Flow::Match,
            Flow::Loading,
            Flow::Errored,
            Flow::Reveal,
            Flow::Portal,
        ];
        // The map from a construct to a string implementation is TOTAL, with
        // no whole-module downgrade behind it, so the property worth
        // asserting is that the map has no hole: every construct resolves to a
        // helper, and a helper resolves to a name in `IMPORTED`.
        //
        // NINE. Solid 2.0's surface is `For`, `Repeat`, `Show`, `Switch`,
        // `Match`, `Errored`, `Loading` and `Reveal` from `solid-js`, plus
        // `Portal` from `@solidjs/web` — read out of `solid-js@2.0.0-rc.0`.
        // `Suspense`, `Await` and `ErrorBoundary` were the three barq carried
        // beyond it, and `Dynamic` is deprecated there for the `dynamic`
        // factory; all four are gone.
        assert_eq!(all.len(), 9);
        for flow in all {
            let helper = crate::codegen::ssr::server_flow(flow);
            assert!(
                crate::codegen::imported_name(helper).starts_with("ssr"),
                "{} does not lower to a string component",
                flow.name()
            );
        }
        assert!(!Flow::Match.returns_a_fragment());
        assert!(Flow::Switch.returns_a_fragment());
    }

    #[test]
    fn a_flow_component_is_reachable_through_source_kind() {
        let kind = SourceKind::Primitive(Prim::Flow(Flow::For));
        assert_eq!(kind.flow(), Some(Flow::For));
        assert_eq!(SourceKind::Primitive(Prim::Signal).flow(), None);
        assert_eq!(SourceKind::Opaque.flow(), None);
    }
}
