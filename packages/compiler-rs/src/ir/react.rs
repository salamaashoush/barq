/// `Static ≡ ∅`, `Reactive ≡ non-empty dep set`, `Opaque ≡ ⊤`.
/// Join is `max`, so the bottom-up fold is branch-light.
///
/// `Opaque` is the load-bearing middle value: an expression the compiler cannot
/// prove either way is emitted UNWRAPPED, so `setProp`/`insert` make exactly the
/// decision the un-compiled oracle makes. A bool forces every unknown to be
/// either wrong DOM or more work than the oracle.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Default)]
pub enum React {
    #[default]
    Static = 0,
    Reactive = 1,
    Opaque = 2,
}

impl React {
    #[inline]
    pub fn join(self, other: Self) -> Self {
        if self > other { self } else { other }
    }
}

/// "Do these two expressions share a dependency?" is the only question the
/// effect-grouping cost model asks, so a 64-bit mask over the unit's dense
/// symbol numbering is sufficient. No arena slices, no merging, no allocation.
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct DepSet {
    pub mask: u64,
    pub overflow: bool,
}

/// `ReactiveEnv::bit` stores this when a symbol does not fit the 64-bit mask.
pub const BIT_OVERFLOW: u8 = 255;

impl DepSet {
    pub const EMPTY: Self = Self { mask: 0, overflow: false };

    /// `bit == BIT_OVERFLOW` means the unit had more than 64 reactive symbols;
    /// the set degrades to "may depend on anything", which only ever refuses a
    /// merge, never permits a wrong one.
    #[inline]
    pub fn single(bit: u8) -> Self {
        if bit >= 64 {
            Self { mask: 0, overflow: true }
        } else {
            Self { mask: 1 << bit, overflow: false }
        }
    }

    #[inline]
    pub fn join(self, other: Self) -> Self {
        Self { mask: self.mask | other.mask, overflow: self.overflow | other.overflow }
    }

    #[inline]
    pub fn disjoint(self, other: Self) -> bool {
        !self.overflow && !other.overflow && self.mask & other.mask == 0
    }

    #[inline]
    pub fn is_empty(self) -> bool {
        self.mask == 0 && !self.overflow
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Const<'a> {
    Str(&'a str),
    Num(f64),
    Bool(bool),
    Null,
    Undefined,
}

/// What the expression EVALUATES TO. Decides thunk pass-through vs wrap, and
/// which SSR specialisation applies.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Shape {
    Str,
    Num,
    Bool,
    Nullish,
    Obj,
    Arr,
    Node,
    #[default]
    Unknown,
    /// `() => T` the user wrote, or a bare accessor symbol read. The dep-set of
    /// the BODY lives in `Rx::inner` — creating a closure itself reads nothing.
    Accessor,
    Handler,
    /// `[fn, data]` bound-handler tuple
    HandlerTuple,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Thunk {
    /// emit as-is
    #[default]
    None,
    /// wrap: `() => expr`
    Arrow,
    /// expr was exactly `f()` with `f` a zero-arg accessor binding: emit bare `f`.
    /// Saves one closure allocation per hole, per row.
    Eta,
}

/// loop / `.map` / `.sort` / `new` ⇒ `Expensive`
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Cost {
    #[default]
    Cheap,
    Expensive,
}

/// Free variables of an arrow/function, relative to the enclosing component
/// scope. `only_globals` is the handler-hoisting predicate (target #7).
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct FreeVars {
    pub mask: u64,
    pub only_globals: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Rx<'a> {
    pub react: React,
    pub deps: DepSet,
    /// dep-set of the BODY when `shape == Accessor`; otherwise unused
    pub inner: DepSet,
    /// `Some` ⇒ foldable into the skeleton
    pub konst: Option<Const<'a>>,
    pub shape: Shape,
    pub free: FreeVars,
    pub cost: Cost,
    pub thunk: Thunk,
}

impl<'a> Rx<'a> {
    /// What P1 records before P2 exists. `Opaque` is sound for every expression,
    /// so M2's "no analysis at all" is a correct compiler, just not a fast one.
    pub const OPAQUE: Self = Self {
        react: React::Opaque,
        deps: DepSet::EMPTY,
        inner: DepSet::EMPTY,
        konst: None,
        shape: Shape::Unknown,
        free: FreeVars { mask: 0, only_globals: false },
        cost: Cost::Cheap,
        thunk: Thunk::None,
    };

    /// QUERY 1 — the only reactivity question codegen ever asks.
    /// `Static` ⇒ emit the value; NO thunk, NO renderEffect, NO closure.
    #[inline]
    pub fn live(self) -> bool {
        match self.shape {
            Shape::Accessor => !self.inner.is_empty(),
            _ => self.react != React::Static,
        }
    }

    /// QUERY 2 — the only constant question codegen ever asks.
    #[inline]
    pub fn fold(self) -> Option<Const<'a>> {
        if self.react == React::Static { self.konst } else { None }
    }

    /// Target #7's hoisting predicate, stated once so no pass re-derives it.
    #[inline]
    pub fn hoistable(self) -> bool {
        matches!(self.shape, Shape::Accessor | Shape::Handler) && self.free.only_globals
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lattice_joins_by_max() {
        assert_eq!(React::Static.join(React::Reactive), React::Reactive);
        assert_eq!(React::Reactive.join(React::Static), React::Reactive);
        assert_eq!(React::Reactive.join(React::Opaque), React::Opaque);
        assert_eq!(React::Opaque.join(React::Static), React::Opaque);
        assert!(React::Static < React::Reactive && React::Reactive < React::Opaque);
    }

    #[test]
    fn overflow_makes_a_dep_set_share_with_everything() {
        let a = DepSet::single(3);
        let b = DepSet::single(4);
        assert!(a.disjoint(b));
        assert!(!a.disjoint(a));

        let over = DepSet::single(BIT_OVERFLOW);
        assert!(over.overflow);
        assert!(!over.disjoint(a));
        assert!(!a.disjoint(over));
        assert!(!over.is_empty());
    }

    #[test]
    fn joining_carries_overflow() {
        let joined = DepSet::single(1).join(DepSet::single(BIT_OVERFLOW));
        assert!(joined.overflow);
        assert_eq!(joined.mask, 1 << 1);
        assert!(!joined.disjoint(DepSet::single(9)));
    }

    /// A user-written `() => 1` reads nothing. Treating it as reactive because it
    /// is a function is exactly the mistake `inner` exists to avoid.
    #[test]
    fn a_static_thunk_is_not_live_and_a_reactive_one_is() {
        let static_thunk = Rx { shape: Shape::Accessor, react: React::Static, ..Rx::OPAQUE };
        assert!(!static_thunk.live());

        let live_thunk = Rx {
            shape: Shape::Accessor,
            react: React::Static,
            inner: DepSet::single(7),
            ..Rx::OPAQUE
        };
        assert!(live_thunk.live());
    }

    #[test]
    fn opaque_is_live_so_the_runtime_decides() {
        assert!(Rx::OPAQUE.live());
        assert_eq!(Rx::OPAQUE.react, React::Opaque);
        assert_eq!(Rx::OPAQUE.fold(), None);
    }

    #[test]
    fn only_a_static_expression_folds() {
        let foldable = Rx { react: React::Static, konst: Some(Const::Str("lg")), ..Rx::OPAQUE };
        assert_eq!(foldable.fold(), Some(Const::Str("lg")));

        // A reactive expression may still carry a konst from a folded branch;
        // folding it into the skeleton would freeze the value.
        let not_foldable =
            Rx { react: React::Reactive, konst: Some(Const::Num(1.0)), ..Rx::OPAQUE };
        assert_eq!(not_foldable.fold(), None);
    }

    #[test]
    fn hoisting_needs_a_closure_that_captures_only_module_scope() {
        let captures_local = Rx {
            shape: Shape::Accessor,
            free: FreeVars { mask: 1, only_globals: false },
            ..Rx::OPAQUE
        };
        assert!(!captures_local.hoistable());

        let captures_import = Rx {
            shape: Shape::Accessor,
            free: FreeVars { mask: 0, only_globals: true },
            ..Rx::OPAQUE
        };
        assert!(captures_import.hoistable());

        let not_a_closure =
            Rx { shape: Shape::Str, free: FreeVars { mask: 0, only_globals: true }, ..Rx::OPAQUE };
        assert!(!not_a_closure.hoistable());
    }
}
