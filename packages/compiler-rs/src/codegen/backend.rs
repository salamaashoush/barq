//! The lowering surface every backend implements, over the same analysed IR.
//!
//! `CODESIGN.md` §5.1 and §6 L2: one lowering `JSX → IR`, one `Backend` trait,
//! N implementations, and **a new `Op` variant is a Rust compile error in every
//! one of them**. That guarantee is what lets a reference backend exist at all —
//! a reference that reads the same analysed IR cannot know less than codegen, so
//! there is no divergence to buy back with per-fixture slack.
//!
//! ## How the error is forced
//!
//! [`backend!`] takes ONE list of `Op` variants and expands it twice: into the
//! trait's method set and into [`lower`]'s match. Adding a variant to
//! `ir::Op` therefore fails in a chain with no step that can be skipped:
//!
//! 1. `lower`'s match names every listed variant and has **no wildcard arm**, so
//!    the new variant makes it non-exhaustive — E0004, in this file.
//! 2. The only way to answer E0004 is to add the variant to the macro list,
//!    because the arms are generated from it and nowhere else.
//! 3. Doing so generates a new trait method. **No method has a default body**,
//!    so every `impl Backend` is now incomplete — E0046, once per backend.
//!
//! Each method takes the variant's own payload, spelled with the variant's own
//! field types, so a new variant cannot be quietly routed into an existing
//! method either: the arity and the types would have to line up by accident.
//!
//! What the trait deliberately does NOT cover is the driver. The DOM backend
//! walks the patch program in order; the string backend walks the skeleton and
//! reaches a patch from the position that owns it. They agree on the instruction
//! set, which is the thing that drifts, and disagree about traversal, which is
//! the thing that makes them two backends.

use crate::ir::{
    Anchor, Chan, Diff, ExprId, HandlerRef, InsertPlan, NameId, NodeId, Op, Patch, RegionId, SlotId,
};
use oxc::span::Span;

/// One instruction, with the context the flat patch program keeps beside it
/// rather than inside the record.
#[derive(Clone, Copy)]
pub struct At<'p> {
    pub patch: Patch,
    /// The patches an [`Op::EffectGroup`] header covers, in program order. Empty
    /// for every other op — a group header is a prefix marker, so its members
    /// are the records that follow it and no `Op` payload can carry them.
    pub members: &'p [Patch],
}

impl At<'_> {
    /// An instruction that governs nothing but itself.
    pub fn one(patch: Patch) -> Self {
        Self { patch, members: &[] }
    }

    /// The element, or the parent element of a slot.
    pub fn target(&self) -> NodeId {
        self.patch.target
    }

    /// The original JSX span, which is what a sourcemap segment is built from.
    pub fn span(&self) -> Span {
        self.patch.span
    }
}

macro_rules! backend {
    ($(
        $(#[$meta:meta])*
        $variant:ident { $($field:ident : $ty:ty),* $(,)? } => $method:ident;
    )*) => {
        /// One method per `Op`. No default bodies and no catch-all, by
        /// construction: see the module docs for the chain that makes a new
        /// opcode a compile error here and in every implementation.
        pub trait Backend<'a> {
            /// What one instruction lowers to. The DOM backend returns a
            /// statement to splice; the string backend writes into its chunk
            /// stream and returns nothing.
            type Out;

            $(
                $(#[$meta])*
                fn $method(&mut self, at: At<'_>, $($field: $ty),*) -> Self::Out;
            )*
        }

        /// The single dispatch point. Total over `Op`, with no wildcard arm.
        pub fn lower<'a, B: Backend<'a> + ?Sized>(backend: &mut B, at: At<'_>) -> B::Out {
            match at.patch.op {
                $( Op::$variant { $($field),* } => backend.$method(at, $($field),*), )*
            }
        }

        /// The instruction set, by name. Generated from the same list, so a
        /// test can count what the trait covers instead of trusting a second
        /// hand-kept list to stay in step with it.
        pub const OPS: &[&str] = &[$(stringify!($variant)),*];
    };
}

backend! {
    /// `React::Static`. One write at construction: no effect, no thunk, no
    /// closure.
    SetOnce { name: NameId, value: ExprId, chan: Chan } => set_once;
    /// `React::Reactive`. A live binding. Arrives inside an [`Op::EffectGroup`]
    /// when effect fusion is on and on its own when it is not.
    SetLive { name: NameId, value: ExprId, chan: Chan, diff: Diff } => set_live;
    /// `React::Opaque`. The value goes to the runtime unwrapped, so the runtime
    /// makes the decision the compiler could not.
    SetOpaque { name: NameId, value: ExprId, chan: Chan } => set_opaque;
    /// An event whose TYPE is resolved but whose value is not provably a
    /// handler: the delegated/direct choice is still the compiler's.
    SetEvent { event: NameId, value: ExprId } => set_event;
    /// `el.$$click = h` plus a module-level delegation of the names used.
    Delegate { event: NameId, handler: HandlerRef, data: Option<ExprId> } => delegate;
    /// `addEventListener`, for everything outside the delegated set.
    Listen { event: NameId, handler: HandlerRef } => listen;
    /// §3.5: not a prop. `write` lowers to `binding = _n1`.
    Ref { value: ExprId, write: bool } => set_ref;
    /// §3.10's channel half, with the property and the reporting event already
    /// resolved from the tag and the `type` attribute.
    Bind { prop: NameId, event: NameId, value: ExprId } => bind;
    Spread { value: ExprId, live: bool } => spread;
    /// A child hole. `plan` is what the analysis proved about its value.
    Insert { slot: SlotId, anchor: Anchor, value: ExprId, plan: InsertPlan } => insert;
    /// A child hole the flow pass lowered onto one of `flow.ts`'s four
    /// primitives. `region` indexes the unit's own region table; the
    /// `(parent, anchor)` pair comes from `at.target()` and `anchor`, which is
    /// the whole point — the runtime used to re-derive it.
    Region { slot: SlotId, anchor: Anchor, region: RegionId } => region;
    /// A prefix marker: `at.members` are the patches that share one effect.
    EffectGroup { len: u16 } => effect_group;
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc::span::Span;

    /// A third implementation, in forty lines — which is the point twice over.
    ///
    /// It shows the trait is the WHOLE lowering surface and that nothing about
    /// it is DOM-shaped or string-shaped, which is the precondition for the
    /// reference backend `CODESIGN.md` §6 L2 asks for. And it is where the
    /// no-drift guarantee is demonstrated rather than described: adding an `Op`
    /// variant stops this crate compiling three times over — at `lower`'s match,
    /// at `impl Backend for Dom`, at `impl Backend for Ssr` — and a fourth time
    /// here, which is exactly what a new backend would experience.
    #[derive(Default)]
    struct Trace(Vec<&'static str>);

    impl<'a> Backend<'a> for Trace {
        type Out = ();

        fn set_once(&mut self, _at: At<'_>, _name: NameId, _value: ExprId, _chan: Chan) {
            self.0.push("SetOnce");
        }
        fn set_live(
            &mut self,
            _at: At<'_>,
            _name: NameId,
            _value: ExprId,
            _chan: Chan,
            _diff: Diff,
        ) {
            self.0.push("SetLive");
        }
        fn set_opaque(&mut self, _at: At<'_>, _name: NameId, _value: ExprId, _chan: Chan) {
            self.0.push("SetOpaque");
        }
        fn set_event(&mut self, _at: At<'_>, _event: NameId, _value: ExprId) {
            self.0.push("SetEvent");
        }
        fn delegate(
            &mut self,
            _at: At<'_>,
            _event: NameId,
            _handler: HandlerRef,
            _data: Option<ExprId>,
        ) {
            self.0.push("Delegate");
        }
        fn listen(&mut self, _at: At<'_>, _event: NameId, _handler: HandlerRef) {
            self.0.push("Listen");
        }
        fn set_ref(&mut self, _at: At<'_>, _value: ExprId, _write: bool) {
            self.0.push("Ref");
        }
        fn bind(&mut self, _at: At<'_>, _prop: NameId, _event: NameId, _value: ExprId) {
            self.0.push("Bind");
        }
        fn spread(&mut self, _at: At<'_>, _value: ExprId, _live: bool) {
            self.0.push("Spread");
        }
        fn insert(
            &mut self,
            _at: At<'_>,
            _slot: SlotId,
            _anchor: Anchor,
            _value: ExprId,
            _plan: InsertPlan,
        ) {
            self.0.push("Insert");
        }
        fn region(&mut self, _at: At<'_>, _slot: SlotId, _anchor: Anchor, _region: RegionId) {
            self.0.push("Region");
        }
        fn effect_group(&mut self, _at: At<'_>, _len: u16) {
            self.0.push("EffectGroup");
        }
    }

    fn at(op: Op) -> Patch {
        Patch { target: 0, span: Span::default(), op }
    }

    /// Two properties in one pass: the dispatch is TOTAL (every opcode reaches
    /// a method) and it is INJECTIVE (no two opcodes share one). Injectivity is
    /// the half that matters — routing a new variant into an existing method
    /// would satisfy `lower`'s exhaustiveness and drop the new instruction on
    /// every backend at once, silently.
    #[test]
    fn every_op_reaches_a_method_of_its_own() {
        let ops = [
            Op::SetOnce { name: 0, value: 0, chan: Chan::Attr },
            Op::SetLive { name: 0, value: 0, chan: Chan::Attr, diff: Diff::Identity },
            Op::SetOpaque { name: 0, value: 0, chan: Chan::Attr },
            Op::SetEvent { event: 0, value: 0 },
            Op::Delegate { event: 0, handler: HandlerRef::Inline(0), data: None },
            Op::Listen { event: 0, handler: HandlerRef::Inline(0) },
            Op::Ref { value: 0, write: false },
            Op::Bind { prop: 0, event: 0, value: 0 },
            Op::Spread { value: 0, live: false },
            Op::Insert { slot: 0, anchor: Anchor::End, value: 0, plan: InsertPlan::Once },
            Op::Region { slot: 0, anchor: Anchor::End, region: 0 },
            Op::EffectGroup { len: 0 },
        ];
        // The instruction set is generated from one list; a variant missing from
        // the array above fails here rather than going untested.
        assert_eq!(ops.len(), OPS.len(), "the probe is missing an opcode");

        let mut trace = Trace::default();
        for op in ops {
            lower(&mut trace, At::one(at(op)));
        }
        assert_eq!(trace.0, OPS, "an opcode reached the wrong method, or another's");
    }
}
