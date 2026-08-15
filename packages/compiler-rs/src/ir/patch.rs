use oxc::span::Span;

use super::{ExprId, HoistId, NameId, NodeId, RegionId, SlotId};

/// A flat, `Copy`, document-ordered instruction. Holds no AST — only `ExprId`s —
/// and names no codegen target, which is what lets one IR drive both backends.
#[derive(Clone, Copy)]
pub struct Patch {
    /// the element, or the parent element of a slot
    pub target: NodeId,
    /// original JSX span → sourcemap
    pub span: Span,
    pub op: Op,
}

#[derive(Clone, Copy)]
pub enum Op {
    // ── attributes / properties ───────────────────────────────────────────
    /// `React::Static`. Applied once at clone time: no effect, no thunk, no closure.
    SetOnce {
        name: NameId,
        value: ExprId,
        chan: Chan,
    },
    /// `React::Reactive`. P5 always folds these into an `EffectGroup`.
    SetLive {
        name: NameId,
        value: ExprId,
        chan: Chan,
        diff: Diff,
    },
    /// `React::Opaque`. The CHANNEL is resolved, but the value's LIVENESS is not
    /// — §3.13 keeps that at run time — so the value goes to `bindProp` beside
    /// the channel the compiler picked.
    SetOpaque {
        name: NameId,
        value: ExprId,
        chan: Chan,
    },

    // ── events ────────────────────────────────────────────────────────────
    /// An event whose TYPE the compiler resolved — `onClick` → `click`,
    /// `on:my-event` → `my-event`, verbatim and with no lowercasing (§3.6) —
    /// but whose value it could not prove is a handler. `bindEvent` makes the
    /// delegated/direct choice the compiler already made and applies the
    /// runtime's own `isEventHandlerValue` test to the value.
    SetEvent {
        event: NameId,
        value: ExprId,
    },
    /// `el.$$click = h`, or `el.$$click = [h, data]` for the bound-tuple form.
    /// THE TUPLE LIVES IN `$$<type>`. There is no `$$<type>Data` in this runtime.
    Delegate {
        event: NameId,
        handler: HandlerRef,
        data: Option<ExprId>,
    },
    /// addEventListener, for everything outside the 22-name delegated set.
    Listen {
        event: NameId,
        handler: HandlerRef,
    },

    // ── misc element ──────────────────────────────────────────────────────
    /// §3.5: `ref` is not a prop. `write` is true when the value is a WRITABLE
    /// binding, which lowers to `binding = _n1` — today's `setProp(el, "ref", el)`
    /// reads the variable and never writes it.
    Ref {
        value: ExprId,
        write: bool,
    },
    /// §3.10's channel half. `prop` is the property a user edit lands on and
    /// `event` the one that reports it, both resolved from the tag and the
    /// `type` attribute at compile time. Selection and focus preservation are M7.
    Bind {
        prop: NameId,
        event: NameId,
        value: ExprId,
    },
    Spread {
        value: ExprId,
        live: bool,
    },
    // ── children ──────────────────────────────────────────────────────────
    Insert {
        slot: SlotId,
        anchor: Anchor,
        value: ExprId,
        plan: InsertPlan,
    },

    /// A child hole the flow pass proved is a control-flow REGION: one of
    /// `flow.ts`'s four primitives, handed the `(parent, anchor)` pair the
    /// template walk already computed instead of re-deriving it. `region` indexes
    /// the unit's own region table, which carries the primitive's arguments.
    Region {
        slot: SlotId,
        anchor: Anchor,
        region: RegionId,
    },

    // ── structure ─────────────────────────────────────────────────────────
    /// Prefix marker: the next `len` patches share ONE renderEffect.
    /// Created only by P5. `len == 1` lowers to the cheaper thunk form.
    EffectGroup {
        len: u16,
    },
}

/// The channel an attribute resolves to, decided ONCE at P1 from `NameFlags`
/// plus the element's namespace plus the `prop:` / `attr:` / `bool:` overrides.
///
/// `CODESIGN.md` §3.5: there is no `setProp` dispatcher on the compiled path.
/// Justified on CAPABILITY — custom elements, the `bind:` family, class and
/// style joining the fused record at all — and never on speed: §0.4 measured the
/// dispatch removal at 0-8% against the 10-25% three designs claimed.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Chan {
    /// setAttribute / removeAttribute
    Attr,
    /// `DOM_PROPS` exception, and everything `prop:` forces. These may NEVER be
    /// folded into skeleton HTML: the oracle writes the *property*; template
    /// HTML would only set the default attribute, which diverges on a dirty form
    /// field.
    Prop,
    /// `bool:` — presence, decided by truthiness rather than by the value's type.
    Bool,
    /// the whole `class` attribute
    Class,
    /// the whole `style` attribute
    Style,
    /// one css declaration; the name is the kebab-cased property
    StyleProp,
    ClassList,
    /// `dangerouslySetInnerHTML={{ __html }}`
    Html,
}

impl Chan {
    /// Whether the channel's APPLIED representation differs from the value it
    /// was handed — the normalised class string, the css map, the toggled key
    /// set — so the record slot must hold what the channel RETURNED rather than
    /// what the compute produced. B2: the compiler owns that slot, which is what
    /// lets these join the fused record instead of being excluded from it.
    #[inline]
    pub fn threads_prev(self) -> bool {
        matches!(self, Chan::Class | Chan::Style | Chan::ClassList | Chan::Html)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Diff {
    /// emit `if (v !== prev)`. Mirrors `applyResolvedProp`'s `value === prev`
    /// short-circuit — this is oracle PARITY, not an optimisation.
    Identity,
    /// value may be an object mutated in place — always write
    Always,
    /// The channel is handed the previous APPLIED value and returns the new one,
    /// which is written back into the record: `v.a = setClass(el, "class", v.a,
    /// p.a)`. The guard lives inside the channel because only the channel knows
    /// what "unchanged" means for a class map or a css object.
    Thread,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Anchor {
    /// Nothing materialises after this hole in its parent: `insert()` appends.
    End,
    /// The next materialising sibling doubles as the anchor. Zero marker nodes.
    Node(NodeId),
    /// A dedicated `<!---->` was materialised by P5.
    Marker(NodeId),
}

impl Anchor {
    /// The `NodeId` the DOM backend must have addressed before this patch runs.
    #[inline]
    pub fn node(self) -> Option<NodeId> {
        match self {
            Anchor::End => None,
            Anchor::Node(node) | Anchor::Marker(node) => Some(node),
        }
    }

    /// Target #9 is this predicate over the finished patch program.
    #[inline]
    pub fn costs_a_comment_node(self) -> bool {
        matches!(self, Anchor::Marker(_))
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InsertPlan {
    /// `React::Static`: `insert(p, v, a)` — the non-function path, ZERO effects.
    Once,
    /// `React::Reactive`: `insert(p, thunk_or_accessor, a)`.
    Live,
    /// `React::Opaque`: pass the value through; `insert()` decides, as the oracle does.
    Opaque,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HandlerRef {
    Inline(ExprId),
    Hoisted(HoistId),
}

impl Op {
    /// Every op that reads the skeleton's child list, so P5 anchor selection and
    /// P6 addressing can filter without matching every variant.
    #[inline]
    pub fn slot(self) -> Option<SlotId> {
        match self {
            Op::Insert { slot, .. } | Op::Region { slot, .. } => Some(slot),
            _ => None,
        }
    }

    #[inline]
    pub fn anchor(self) -> Option<Anchor> {
        match self {
            Op::Insert { anchor, .. } | Op::Region { anchor, .. } => Some(anchor),
            _ => None,
        }
    }

    /// The region row this op reads, which is the only place an op names
    /// something outside the `ExprTable`.
    #[inline]
    pub fn region(self) -> Option<RegionId> {
        match self {
            Op::Region { region, .. } => Some(region),
            _ => None,
        }
    }

    /// The expression this op reads, for the ops that read exactly one.
    #[inline]
    pub fn value(self) -> Option<ExprId> {
        match self {
            Op::SetOnce { value, .. }
            | Op::SetLive { value, .. }
            | Op::SetOpaque { value, .. }
            | Op::Ref { value, .. }
            | Op::Bind { value, .. }
            | Op::Spread { value, .. }
            | Op::Insert { value, .. } => Some(value),
            Op::SetEvent { value, .. } => Some(value),
            Op::Delegate { handler: HandlerRef::Inline(value), .. }
            | Op::Listen { handler: HandlerRef::Inline(value), .. } => Some(value),
            _ => None,
        }
    }

    /// `EffectGroup` is a prefix marker, not an instruction with a target — the
    /// patches it covers are the `len` records that follow it.
    #[inline]
    pub fn is_group_header(self) -> bool {
        matches!(self, Op::EffectGroup { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_anchor_can_be_expressed_without_a_comment_node() {
        assert!(!Anchor::End.costs_a_comment_node());
        assert!(!Anchor::Node(7).costs_a_comment_node());
        assert!(Anchor::Marker(7).costs_a_comment_node());
        assert_eq!(Anchor::End.node(), None);
        assert_eq!(Anchor::Node(7).node(), Some(7));
        assert_eq!(Anchor::Marker(7).node(), Some(7));
    }

    #[test]
    fn a_bound_handler_tuple_carries_its_data_in_one_op() {
        let op = Op::Delegate { event: 0, handler: HandlerRef::Hoisted(1), data: Some(4) };
        let Op::Delegate { data, handler, .. } = op else { unreachable!() };
        assert_eq!(data, Some(4));
        assert_eq!(handler, HandlerRef::Hoisted(1));
    }

    /// A region occupies a child slot exactly as an insert does, which is what
    /// lets P5 anchor it and P6 address its parent without either pass knowing
    /// what a control-flow primitive is.
    #[test]
    fn a_region_is_a_child_hole_like_any_other() {
        let op = Op::Region { slot: 2, anchor: Anchor::Node(5), region: 1 };
        assert_eq!(op.slot(), Some(2));
        assert_eq!(op.anchor(), Some(Anchor::Node(5)));
        assert_eq!(op.region(), Some(1));
        assert_eq!(op.value(), None);
        assert!(!op.is_group_header());
        assert_eq!(
            Op::Insert { slot: 0, anchor: Anchor::End, value: 0, plan: InsertPlan::Once }.region(),
            None
        );
    }

    #[test]
    fn a_group_header_carries_no_slot_and_no_anchor() {
        let header = Op::EffectGroup { len: 2 };
        assert!(header.is_group_header());
        assert_eq!(header.slot(), None);
        assert_eq!(header.anchor(), None);

        let insert =
            Op::Insert { slot: 3, anchor: Anchor::End, value: 9, plan: InsertPlan::Opaque };
        assert!(!insert.is_group_header());
        assert_eq!(insert.slot(), Some(3));
        assert_eq!(insert.anchor(), Some(Anchor::End));
    }

    #[test]
    fn patches_stay_copy_so_a_pass_is_a_linear_scan() {
        let patch = Patch {
            target: 0,
            span: Span::default(),
            op: Op::SetOpaque { name: 1, value: 2, chan: Chan::Attr },
        };
        let copied = patch;
        assert_eq!(copied.target, patch.target);
    }
}
