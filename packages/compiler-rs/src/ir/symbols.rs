use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, JSXAttributeValue};
use oxc::semantic::{ScopeId, SymbolId};
use oxc::span::Span;
use oxc_index::IndexVec;

use crate::diag::Code;

use super::{AVec, Const, react::BIT_OVERFLOW};

/// Members of an `Accessor` binding that are NOT tracked reads: `.set`, `.peek`,
/// `.update`. `count.set` and `count()` are the same identifier with two
/// verdicts, which is the fact a name heuristic cannot represent.
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub struct MemberMask(u8);

impl MemberMask {
    pub const EMPTY: Self = Self(0);
    pub const SET: Self = Self(1 << 0);
    pub const PEEK: Self = Self(1 << 1);
    pub const UPDATE: Self = Self(1 << 2);
    /// what `signal()` returns
    pub const SIGNAL: Self = Self(0b111);

    #[inline]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    #[inline]
    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    #[inline]
    pub fn of_member(name: &str) -> Self {
        match name {
            "set" => Self::SET,
            "peek" => Self::PEEK,
            "update" => Self::UPDATE,
            _ => Self::EMPTY,
        }
    }

    /// `Member(o, m)` where `o: Accessor` is `Static` exactly when `m` is masked.
    #[inline]
    pub fn is_inert_member(self, name: &str) -> bool {
        self.contains(Self::of_member(name)) && Self::of_member(name) != Self::EMPTY
    }
}

/// What a resolved binding IS. Assigned per `SymbolId`, so shadowing is free,
/// name collisions are impossible, and `import { signal as sig }` just works.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum SourceKind {
    /// Calling it is a reactive read. `nonreactive` masks members that are NOT
    /// tracked reads.
    Accessor { nonreactive: MemberMask },
    /// ANY member read is a reactive read: `useStore()[0]`, `createProjection`,
    /// `createOptimisticStore()[0]`.
    ReactiveObject,
    /// Members are accessors: member READ is inert, member CALL is reactive.
    /// `Resource<T>`: `.state()` `.loading()` `.error()` `.latest()`;
    /// `.refetch` and `.mutate` are inert.
    AccessorRecord,
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
    /// take the `$$click` expando instead of going through `setProp`. Inert in
    /// every other respect — creating a reference to it reads nothing.
    ///
    /// `nullary` is §3.0 rule 1's discriminator, and it is the ONLY thing that
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
    UseState,
    UseMemo,
    UseStore,
    UseResource,
    UseContext,
    CreateAsync,
    CreateOptimistic,
    CreateOptimisticStore,
    CreateProjection,
    MapArray,
    Repeat,
    Untrack,
    Batch,
    Peek,
    Flow(Flow),
}

impl Prim {
    /// Resolved by module specifier + imported name in P0, never by the local
    /// binding's spelling — `import { signal as sig }` classifies, and a
    /// user-defined `const signal = 1` does not.
    pub fn of_export(name: &str) -> Option<Self> {
        Some(match name {
            "signal" => Prim::Signal,
            "computed" => Prim::Computed,
            "useState" => Prim::UseState,
            "useMemo" => Prim::UseMemo,
            "useStore" => Prim::UseStore,
            "useResource" => Prim::UseResource,
            "useContext" => Prim::UseContext,
            "createAsync" => Prim::CreateAsync,
            "createOptimistic" => Prim::CreateOptimistic,
            "createOptimisticStore" => Prim::CreateOptimisticStore,
            "createProjection" => Prim::CreateProjection,
            "mapArray" => Prim::MapArray,
            "repeat" => Prim::Repeat,
            "untrack" => Prim::Untrack,
            "batch" => Prim::Batch,
            "For" => Prim::Flow(Flow::For),
            "Index" => Prim::Flow(Flow::Index),
            "Repeat" => Prim::Flow(Flow::Repeat),
            "Show" => Prim::Flow(Flow::Show),
            "Switch" => Prim::Flow(Flow::Switch),
            "Match" => Prim::Flow(Flow::Match),
            "Loading" => Prim::Flow(Flow::Loading),
            "Errored" => Prim::Flow(Flow::Errored),
            "Reveal" => Prim::Flow(Flow::Reveal),
            "Suspense" => Prim::Flow(Flow::Suspense),
            "Await" => Prim::Flow(Flow::Await),
            "Portal" => Prim::Flow(Flow::Portal),
            "Dynamic" => Prim::Flow(Flow::Dynamic),
            "ErrorBoundary" => Prim::Flow(Flow::ErrorBoundary),
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
    /// `keyed={false}` delegates to `Index` — `(item: () => T, index: number)`
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
    Index,
    Repeat,
    Show,
    Switch,
    Match,
    // NOT string-inlinable — need real server implementations
    Loading,
    Errored,
    Reveal,
    Suspense,
    Await,
    Portal,
    Dynamic,
    ErrorBoundary,
}

impl Flow {
    /// The line target #10 draws: six components P8b can emit as plain JS, and
    /// eight whose async/boundary semantics send the whole module back to the
    /// happy-dom `renderToString` path.
    #[inline]
    pub fn inlinable_on_server(self) -> bool {
        matches!(
            self,
            Flow::For | Flow::Index | Flow::Repeat | Flow::Show | Flow::Switch | Flow::Match
        )
    }

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
            Flow::Index => "Index",
            Flow::Repeat => "Repeat",
            Flow::Show => "Show",
            Flow::Switch => "Switch",
            Flow::Match => "Match",
            Flow::Loading => "Loading",
            Flow::Errored => "Errored",
            Flow::Reveal => "Reveal",
            Flow::Suspense => "Suspense",
            Flow::Await => "Await",
            Flow::Portal => "Portal",
            Flow::Dynamic => "Dynamic",
            Flow::ErrorBoundary => "ErrorBoundary",
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
    /// The flow components this module reaches through such a namespace.
    /// Collected during the bind walk, because that is the last stage that can
    /// still see the JSX: harvest moves it out of the program.
    pub namespace_flows: Vec<Flow>,
    /// Every symbol a JSX CLOSING tag resolves to. oxc records one reference per
    /// tag, so `<Show>…</Show>` reads as two uses of one binding; anything
    /// counting real uses has to subtract these.
    pub jsx_closings: Vec<SymbolId>,
    /// `(body span, name)` for every function this module writes as a tag or
    /// exports and that returns JSX. The only component IDENTITY the IR carries:
    /// `Skeleton::origin` is html-byte-offset → JSX span, which answers "where
    /// did this template come from" and not "whose template is it". Populated
    /// only under `dev`, and read only by the dev-mode label pass.
    pub components: Vec<(Span, &'a str)>,
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
            namespace_flows: Vec::new(),
            jsx_closings: Vec::new(),
            components: Vec::new(),
        }
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
        matches!(
            kind,
            SourceKind::Accessor { .. }
                | SourceKind::ReactiveObject
                | SourceKind::AccessorRecord
                | SourceKind::PropsParam
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_signal_member_mask_separates_a_write_from_a_read() {
        let mask = MemberMask::SIGNAL;
        assert!(mask.is_inert_member("set"));
        assert!(mask.is_inert_member("peek"));
        assert!(mask.is_inert_member("update"));
        // `count.value` is not in the mask, so it stays a reactive read.
        assert!(!mask.is_inert_member("value"));
        assert!(!MemberMask::EMPTY.is_inert_member("set"));
        assert_eq!(MemberMask::SET.union(MemberMask::PEEK).union(MemberMask::UPDATE), mask);
    }

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
    fn the_server_inlinable_flow_set_is_six_of_fourteen() {
        let all = [
            Flow::For,
            Flow::Index,
            Flow::Repeat,
            Flow::Show,
            Flow::Switch,
            Flow::Match,
            Flow::Loading,
            Flow::Errored,
            Flow::Reveal,
            Flow::Suspense,
            Flow::Await,
            Flow::Portal,
            Flow::Dynamic,
            Flow::ErrorBoundary,
        ];
        assert_eq!(all.iter().filter(|f| f.inlinable_on_server()).count(), 6);
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
