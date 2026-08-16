use oxc::ast::ast::Expression;
use oxc::span::Span;

use super::Flow;

/// Index into [`super::Unit::regions`], or into [`super::Module::regions`] while
/// a region is still waiting for a patch to claim it.
pub type RegionId = u32;

/// `flow.ts`'s `STATIC_KEY`: the key expression reads nothing reactive, so the
/// region opens no `bindEffect` and keeps no previous-key record.
pub const STATIC_KEY: u8 = 1 << 0;
/// `flow.ts`'s `NO_SCOPE`: no body registers anything disposable, so an
/// activation allocates no `Scope` and no `ownRange` closure.
pub const NO_SCOPE: u8 = 1 << 1;
/// `flow.ts`'s and `ssr.ts`'s `HYDRATE`: this module was compiled `hydratable`,
/// so the string backend writes `<!--[k-->` … `<!--]-->` around the range and
/// the DOM backend claims what it finds there instead of building.
///
/// It is the one flag that is not a PROOF about the source: it is the build
/// asking for a wire format. That is why [`RegionKind::shipped`] keeps it for
/// every primitive while it drops the other two for four of the five — the key
/// a branch chose is knowable only at the instant it chooses it, so no compiler
/// can write the open comment and the primitive has to.
pub const HYDRATE: u8 = 1 << 2;
/// `flow.ts`'s and `ssr.ts`'s `DETECT`: this module was compiled `hydratable`
/// AND `dev`, so a range spells the key its primitive CHOSE into its open
/// comment — `<!--[b-->` rather than `<!--[-->` — and the client compares.
///
/// `CODESIGN.md` §12 reversed Q4: the wire carries what RECOVERY needs and
/// detection is an emission axis. The key is the one fact about a range that
/// detection cannot re-derive and recovery does not need, so it is the one byte
/// that moved onto this flag. A production build writes `<!--[-->` and the
/// client's comparison is unreachable, exactly as `getFirstChild(el, "span")`
/// becomes `el.firstChild`.
///
/// Kept for every primitive for the same reason as [`HYDRATE`]: it is the build
/// asking for a wire format, not a proof about the source.
pub const DETECT: u8 = 1 << 3;
/// `flow.ts`'s and `ssr.ts`'s `WHOLE`: this range is the only thing in its
/// parent element's child list, so the string backend wrote it no boundary
/// comments and the client's claim is every child of the parent.
///
/// The same predicate a hole is measured by, and the same saving. It is set only
/// in a build that is not detecting, because a range's open comment is where the
/// key goes — see [`DETECT`].
pub const WHOLE: u8 = 1 << 4;

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

    /// Whether this primitive's STRING half can write a range the compiler did
    /// not ask for.
    ///
    /// A loading boundary can: with a stream sink installed it flushes
    /// `<!--[b:N-->` … `<!--]-->` around its fallback and parks the continuation,
    /// and no compile-time predicate can see that coming — whether a promise is
    /// ready is exactly §3.13 item 6. So [`WHOLE`] is refused for it: the client
    /// would read "no comments here" and claim a child list that has two.
    #[inline]
    pub fn may_write_its_own_range(self) -> bool {
        matches!(self, RegionKind::Loading)
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
        let whole = if kind.may_write_its_own_range() { 0 } else { flags & WHOLE };
        (if kind.reads_flags() { flags } else { 0 }) | (flags & (HYDRATE | DETECT)) | whole
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

    /// The exception, and the reason it is one: `HYDRATE` is not a proof the
    /// runtime may ignore, it is the wire format the build asked for. A
    /// primitive that dropped it would emit a range with no boundary comments
    /// into a document whose every other range has them, and the client's claim
    /// would run off the end of the one range that did not announce itself.
    #[test]
    fn every_primitive_ships_the_wire_format_flags_and_only_those() {
        let wire = HYDRATE | DETECT | WHOLE;
        for kind in [
            RegionKind::Branch,
            RegionKind::Each,
            RegionKind::Error,
            RegionKind::Loading,
            RegionKind::Portal,
        ] {
            let want = if kind.may_write_its_own_range() { HYDRATE | DETECT } else { wire };
            let shipped = RegionKind::shipped(kind, STATIC_KEY | NO_SCOPE | wire);
            assert_eq!(shipped & wire, want, "{} shipped the wrong wire flags", kind.as_str());
            assert_eq!(RegionKind::shipped(kind, STATIC_KEY | NO_SCOPE) & wire, 0);
        }
    }

    /// A loading boundary can flush `<!--[b:N-->` at run time when a stream sink
    /// is installed, and no compile-time predicate can see that coming. So it
    /// never takes `WHOLE`: the client would read "no comments here" and claim a
    /// child list that has two.
    #[test]
    fn a_streaming_boundary_never_takes_the_undelimited_form() {
        assert!(RegionKind::Loading.may_write_its_own_range());
        assert_eq!(RegionKind::shipped(RegionKind::Loading, HYDRATE | WHOLE) & WHOLE, 0);
        for kind in [RegionKind::Branch, RegionKind::Each, RegionKind::Error, RegionKind::Portal] {
            assert!(!kind.may_write_its_own_range());
            assert_eq!(RegionKind::shipped(kind, HYDRATE | WHOLE) & WHOLE, WHOLE);
        }
    }

    /// §12's split, at the one place both halves are visible at once. A
    /// production hydratable build ships `HYDRATE` and NOT `DETECT`: the range
    /// is written, claimed and recoverable, and no key is spelled into it.
    /// Detection is the extra bit and never the other way round.
    #[test]
    fn detection_is_a_bit_of_its_own_beside_the_recovery_format() {
        assert_eq!(HYDRATE & DETECT, 0);
        let production = RegionKind::shipped(RegionKind::Branch, HYDRATE);
        assert_eq!(production & HYDRATE, HYDRATE);
        assert_eq!(production & DETECT, 0);
        let development = RegionKind::shipped(RegionKind::Branch, HYDRATE | DETECT);
        assert_eq!(development & DETECT, DETECT);
    }
}
