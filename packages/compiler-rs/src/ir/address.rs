use oxc::allocator::Allocator;
use oxc::span::Span;

use super::{AVec, NONE, NodeId, RefId, StrId};

/// DOM backend only. The patch program never contains the word `firstChild`.
pub struct RefPlan<'a> {
    /// emission order == definition order
    pub defs: AVec<'a, RefDef>,
    /// `NodeId` → `RefId` (`NONE` = not needed)
    pub of_node: AVec<'a, RefId>,
}

#[derive(Clone, Copy)]
pub struct RefDef {
    pub node: NodeId,
    pub step: Step,
    pub name: StrId,
    /// the JSX span the walk came from, so a production
    /// `Cannot read properties of null (reading 'firstChild')` lands on the
    /// right line
    pub span: Span,
}

/// One binding's whole walk. A step composes an optional descent with a run of
/// sibling hops, so `_el$1.firstChild.nextSibling` is ONE def — an intermediate
/// binding no patch reads is pure waste, and P6 exists to not emit it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Step {
    Root,
    /// `base.firstChild`, then `hops` × `nextSibling`
    FirstChild(RefId, u32),
    /// `base.lastChild`, then `hops` × `previousSibling`
    LastChild(RefId, u32),
    NextSibling(RefId, u32),
    PrevSibling(RefId, u32),
}

impl Step {
    /// Property reads this step costs. The two-sweep distance transform in P6
    /// minimises the sum of these.
    #[inline]
    pub fn cost(self) -> u32 {
        match self {
            Step::Root => 0,
            Step::FirstChild(_, hops) | Step::LastChild(_, hops) => 1 + hops,
            Step::NextSibling(_, hops) | Step::PrevSibling(_, hops) => hops,
        }
    }

    #[inline]
    pub fn base(self) -> Option<RefId> {
        match self {
            Step::Root => None,
            Step::FirstChild(base, _)
            | Step::LastChild(base, _)
            | Step::NextSibling(base, _)
            | Step::PrevSibling(base, _) => Some(base),
        }
    }

    /// Backward addressing is the win a firstChild-only scheme leaves on the
    /// table: child 8 of 10 is 2 reads from the end, not 9 from the front.
    #[inline]
    pub fn walks_backward(self) -> bool {
        matches!(self, Step::LastChild(_, _) | Step::PrevSibling(_, _))
    }
}

impl<'a> RefPlan<'a> {
    pub fn new_in(allocator: &'a Allocator) -> Self {
        Self { defs: AVec::new_in(&allocator), of_node: AVec::new_in(&allocator) }
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.defs.is_empty()
    }

    #[inline]
    pub fn ref_of(&self, node: NodeId) -> Option<RefId> {
        match self.of_node.get(node as usize).copied() {
            Some(NONE) | None => None,
            Some(id) => Some(id),
        }
    }

    #[inline]
    pub fn def(&self, id: RefId) -> &RefDef {
        &self.defs[id as usize]
    }

    /// Total property reads the emitted walk costs.
    pub fn cost(&self) -> u32 {
        self.defs.iter().map(|def| def.step.cost()).sum()
    }

    /// Every ref must be materialised before any mutation runs, because `insert`
    /// splices nodes and invalidates sibling walks — so a def may only depend on
    /// a ref defined earlier.
    pub fn validate(&self) -> Result<(), String> {
        for (index, def) in self.defs.iter().enumerate() {
            if let Some(base) = def.step.base()
                && base as usize >= index
            {
                return Err(format!("ref {index} walks from ref {base}, which is defined later"));
            }
            match self.of_node.get(def.node as usize).copied() {
                Some(id) if id == index as RefId => {}
                other => {
                    return Err(format!(
                        "ref {index} addresses node {} but of_node says {other:?}",
                        def.node
                    ));
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(allocator: &Allocator) -> RefPlan<'_> {
        // The §7 worked example: root, <p> via firstChild+nextSibling,
        // <button> via nextSibling, <ul> via lastChild.
        let mut plan = RefPlan::new_in(allocator);
        plan.defs.push(RefDef { node: 0, step: Step::Root, name: 0, span: Span::default() });
        plan.defs.push(RefDef {
            node: 6,
            step: Step::FirstChild(0, 1),
            name: 1,
            span: Span::default(),
        });
        plan.defs.push(RefDef {
            node: 9,
            step: Step::NextSibling(1, 1),
            name: 2,
            span: Span::default(),
        });
        plan.defs.push(RefDef {
            node: 11,
            step: Step::LastChild(0, 0),
            name: 3,
            span: Span::default(),
        });
        plan.of_node.extend([0, NONE, NONE, NONE, NONE, NONE, 1, NONE, NONE, 2, NONE, 3]);
        plan
    }

    #[test]
    fn addressing_can_express_a_backward_walk() {
        let allocator = Allocator::new();
        let plan = plan(&allocator);
        plan.validate().unwrap();
        assert!(plan.def(3).step.walks_backward());
        assert!(!plan.def(1).step.walks_backward());
        assert_eq!(plan.def(2).step.base(), Some(1));
        assert_eq!(plan.def(0).step.base(), None);
    }

    #[test]
    fn cost_counts_property_reads_and_collapsed_hops() {
        let allocator = Allocator::new();
        let plan = plan(&allocator);
        // §7: firstChild.nextSibling (2) + nextSibling (1) + lastChild (1).
        assert_eq!(plan.cost(), 4);
        assert_eq!(Step::NextSibling(0, 4).cost(), 4);
        assert_eq!(Step::FirstChild(0, 3).cost(), 4);
        assert_eq!(Step::LastChild(0, 0).cost(), 1);
        assert_eq!(Step::Root.cost(), 0);
    }

    #[test]
    fn ref_lookup_treats_none_as_absent() {
        let allocator = Allocator::new();
        let plan = plan(&allocator);
        assert_eq!(plan.ref_of(0), Some(0));
        assert_eq!(plan.ref_of(6), Some(1));
        assert_eq!(plan.ref_of(1), None);
        assert_eq!(plan.ref_of(999), None);
    }

    #[test]
    fn validate_rejects_a_walk_from_a_ref_defined_later() {
        let allocator = Allocator::new();
        let mut plan = plan(&allocator);
        plan.defs[1].step = Step::FirstChild(3, 0);
        let error = plan.validate().unwrap_err();
        assert!(error.contains("defined later"), "{error}");
    }

    #[test]
    fn a_pure_static_unit_needs_no_refs() {
        let allocator = Allocator::new();
        let plan = RefPlan::new_in(&allocator);
        assert!(plan.is_empty());
        assert_eq!(plan.cost(), 0);
        plan.validate().unwrap();
    }
}
