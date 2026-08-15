mod address;
mod expr;
mod intern;
mod module;
mod patch;
mod react;
mod region;
mod skeleton;
mod symbols;

pub use address::{RefDef, RefPlan, Step};
pub use expr::{ExprEntry, ExprSrc, ExprTable};
pub use intern::{Interner, NameFlags, NameRow, TagFlags, TagRow, event_name_of, tag_flags};
pub use module::{
    Hoisted, LineIndex, Mappings, Module, Root, Site, TemplateMeta, TemplateRow, Uids, Unit,
};
pub use patch::{Anchor, Chan, Diff, HandlerRef, InsertPlan, Op, Patch};
pub use react::{BIT_OVERFLOW, Const, Cost, DepSet, FreeVars, React, Rx, Shape, Thunk};
pub use region::{NO_SCOPE, Region, RegionId, RegionKind, STATIC_KEY};
pub use skeleton::{Materialisation, Ns, SkelAttr, SkelAttrValue, SkelElement, SkelNode, Skeleton};
pub use symbols::{CellSlot, Diag, Flow, Keyed, MemberMask, Prim, ReactiveEnv, SourceKind};

/// Index into [`Skeleton::nodes`], document order.
pub type NodeId = u32;
/// Skeleton-LOCAL, document order. Two skeletons that differ only in which
/// expressions fill their holes therefore hash identically, which is what makes
/// module-wide dedup work.
pub type SlotId = u32;
/// Index into [`ExprTable::entries`].
pub type ExprId = u32;
/// Index into [`RefPlan::defs`].
pub type RefId = u32;
pub type StrId = u32;
/// [`Interner::tag`] carries the flag bits.
pub type TagId = u32;
/// [`Interner::name`] carries the flag bits.
pub type NameId = u32;
pub type TemplateId = u32;
pub type UnitId = u32;
pub type HoistId = u32;

pub const NONE: u32 = u32::MAX;

pub(crate) type AVec<'a, T> = oxc::allocator::Vec<'a, T>;

#[cfg(test)]
mod tests {
    use super::*;

    /// The patch program is scanned linearly by every pass from P2 on, so its
    /// record size is a throughput fact. DESIGN §1 claims 32 bytes; §2.2's field
    /// list costs 40, for two reasons that are pinned here rather than
    /// rediscovered: oxc 0.143's `Span` carries a `PointerAlign` ZST and is
    /// therefore 8-ALIGNED, and `Op`'s widest variants (`Insert`, `Delegate`,
    /// `SetClass`) cost 20 payload bytes plus a tag.
    ///
    /// Reaching 32 means flattening `Anchor`, `HandlerRef` and the two
    /// `Option<u32>`s into sentinel fields so `Op` fits in 20; that is a
    /// mechanical change, and it is not worth the readability now.
    #[test]
    fn patch_records_stay_pod_sized() {
        // `Op::Region` costs a slot, an `Anchor` and a `RegionId` — 16 payload
        // bytes against `Insert`'s 20, so the widest variant did not move.
        assert_eq!(size_of::<Op>(), 24);
        assert_eq!(size_of::<Patch>(), 40);
        assert_eq!(align_of::<Patch>(), 8);
        assert_eq!(size_of::<Anchor>(), 8);
        assert_eq!(size_of::<SkelAttr>(), 16);
    }
}
