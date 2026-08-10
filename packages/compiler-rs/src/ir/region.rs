use oxc::ast::ast::Expression;
use oxc::span::Span;

use super::Flow;

/// Index into [`super::Unit::regions`], or into [`super::Module::regions`] while
/// a region is still waiting for a patch to claim it.
pub type RegionId = u32;

/// `flow.ts`'s `STATIC_KEY`: the key expression reads nothing reactive, so the
/// region opens no `renderEffect` and keeps no previous-key record.
pub const STATIC_KEY: u8 = 1 << 0;
/// `flow.ts`'s `NO_SCOPE`: no body registers anything disposable, so an
/// activation allocates no `Scope` and no `ownRange` closure.
pub const NO_SCOPE: u8 = 1 << 1;

/// Which of `flow.ts`'s four primitives owns this range. Fourteen constructs
/// collapse onto these; the row that carries a region names both, because the
/// primitive decides the emission and the [`Flow`] decides the diagnostic.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RegionKind {
    /// `branch(s, parent, anchor, key, bodies, flags)`
    Branch,
    /// `each(s, parent, anchor, src, keyOf, row, flags, fallback)`
    Each,
    /// `boundary(s, parent, anchor, "error", fallback, body, flags)`
    Error,
    /// `boundary(s, parent, anchor, "loading", fallback, body, flags, on)`
    Loading,
    /// `portal(s, target, block, flags)`
    Portal,
}

impl RegionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RegionKind::Branch => "branch",
            RegionKind::Each => "each",
            RegionKind::Error => "error",
            RegionKind::Loading => "loading",
            RegionKind::Portal => "portal",
        }
    }

    /// Whether a flags integer means anything to this primitive.
    ///
    /// `branch` is the only one. The other four are not omissions:
    ///
    /// - `each` declares the parameter and never reads it — row lifecycle is
    ///   `mapArray`'s, and a row IS a scope.
    /// - `loadingBoundary` declares it and never reads it either.
    /// - an error boundary must never be handed `NO_SCOPE`: its catcher is
    ///   installed on the INSTANCE scope, so removing the scope would install it
    ///   on the scope above and every sibling of the boundary would start
    ///   catching.
    /// - `portal` reads it, and must not be given `NO_SCOPE` anyway. Its
    ///   activation is deferred to a microtask, and the instance scope is what
    ///   restores the ambient owner there; without it the subtree is built with
    ///   no owner current, which the L2b trace sees as a clone under no scope.
    ///   The flag's own claim — nothing disposable is registered — stays true;
    ///   what is false is that the scope was doing nothing else.
    #[inline]
    pub fn reads_flags(self) -> bool {
        matches!(self, RegionKind::Branch)
    }
}

/// One control-flow instance, lowered. Holds the arguments its primitive takes,
/// as expressions built in the same arena — the same thing [`super::Root`] and
/// [`super::Hoisted`] hold, and for the same reason: a `Patch` stays `Copy` and
/// POD by naming this row and nothing else.
///
/// The slots are named after what they mean rather than after their position,
/// because the four primitives disagree about the order and a positional row
/// would make a wrong emission look right.
pub struct Region<'a> {
    pub flow: Flow,
    pub kind: RegionKind,
    /// `STATIC_KEY | NO_SCOPE`, and zero whenever the compiler could not prove
    /// the property. Zero is always safe — the runtime then does the work.
    pub flags: u8,
    pub span: Span,
    /// `branch`'s key `Cell`, `each`'s source `Cell`, `portal`'s target `Cell`.
    /// `None` on a boundary, whose key is the collector's own state.
    pub key: Option<Expression<'a>>,
    /// `branch`'s bodies — one `Block` used for every key, or a table indexed by
    /// an integer key — `each`'s row `Block`, a boundary's content `Block`,
    /// `portal`'s `Block`.
    pub body: Expression<'a>,
    /// `each`'s `keyOf`: `null` (by item), `false` (by index), a key function,
    /// or the `COUNT` symbol.
    pub keyed: Option<Expression<'a>>,
    /// `each`'s and a boundary's fallback `Block`.
    pub fallback: Option<Expression<'a>>,
    /// A loading boundary's `on` `Cell`.
    pub on: Option<Expression<'a>>,
}

impl Region<'_> {
    /// The flags that survive into the emitted call. A property the runtime does
    /// not read is dropped here rather than at the emission site, so the two
    /// backends cannot disagree about which integer was shipped.
    #[inline]
    pub fn emitted_flags(&self) -> u8 {
        RegionKind::shipped(self.kind, self.flags)
    }
}

impl RegionKind {
    #[inline]
    pub fn shipped(kind: Self, flags: u8) -> u8 {
        if kind.reads_flags() { flags } else { 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The asymmetry worth pinning: an error boundary installs its catcher on
    /// the instance scope and a portal restores its ambient owner from one, so
    /// `NO_SCOPE` is not merely useless for either but wrong. The flags are
    /// dropped however they were set.
    #[test]
    fn only_the_primitive_that_reads_flags_ever_ships_them() {
        assert!(RegionKind::Branch.reads_flags());
        assert!(!RegionKind::Portal.reads_flags());
        assert!(!RegionKind::Each.reads_flags());
        assert!(!RegionKind::Error.reads_flags());
        assert!(!RegionKind::Loading.reads_flags());

        let both = STATIC_KEY | NO_SCOPE;
        assert_eq!(RegionKind::shipped(RegionKind::Branch, both), both);
        assert_eq!(RegionKind::shipped(RegionKind::Portal, both), 0);
        assert_eq!(RegionKind::shipped(RegionKind::Error, both), 0);
        assert_eq!(RegionKind::shipped(RegionKind::Loading, both), 0);
        assert_eq!(RegionKind::shipped(RegionKind::Each, both), 0);
    }
}
