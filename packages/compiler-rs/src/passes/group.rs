use oxc::allocator::Allocator;

use crate::ir::{Cost, DepSet, Module, Op, Patch, Unit};

/// P5's grouping half — target #4. Each element's contiguous run of `SetLive`
/// gets one `EffectGroup` header, so N dynamic props on an element cost ONE
/// `renderEffect` instead of N.
///
/// The run is left in place rather than stable-sorted by target: P1 already
/// emits an element's attributes contiguously and in source order, and reordering
/// them would change the order they reach the DOM.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    for unit in module.units.iter_mut() {
        if !unit.patch.iter().any(|patch| matches!(patch.op, Op::SetLive { .. })) {
            continue;
        }
        regroup(allocator, unit);
    }
}

fn regroup<'a>(allocator: &'a Allocator, unit: &mut Unit<'a>) {
    let old = std::mem::replace(&mut unit.patch, oxc::allocator::Vec::new_in(&allocator));
    unit.patch.reserve(old.len() + 2);

    let mut index = 0;
    while index < old.len() {
        if !matches!(old[index].op, Op::SetLive { .. }) {
            unit.patch.push(old[index]);
            index += 1;
            continue;
        }
        let target = old[index].target;
        let mut end = index;
        while end < old.len()
            && matches!(old[end].op, Op::SetLive { .. })
            && old[end].target == target
        {
            end += 1;
        }
        emit_runs(&mut unit.patch, &old[index..end], &unit.exprs);
        index = end;
    }
}

/// Splits one element's live props into the groups that will each become a
/// `renderEffect`. Everything merges except a prop that is both expensive and
/// dep-disjoint from every other prop on the element — merging that one would
/// let a change to a hot signal recompute an unrelated expensive expression.
fn emit_runs<'a>(
    out: &mut oxc::allocator::Vec<'a, Patch>,
    run: &[Patch],
    exprs: &crate::ir::ExprTable<'a>,
) {
    let solo: Vec<bool> = run
        .iter()
        .enumerate()
        .map(|(index, patch)| {
            let Some(value) = patch.op.value() else { return false };
            let rx = exprs.rx(value);
            if rx.cost != Cost::Expensive {
                return false;
            }
            let mine = deps(rx);
            run.iter().enumerate().all(|(other, patch)| {
                other == index
                    || patch.op.value().is_none_or(|id| mine.disjoint(deps(exprs.rx(id))))
            })
        })
        .collect();

    let mut index = 0;
    while index < run.len() {
        let mut end = index + 1;
        if !solo[index] {
            while end < run.len() && !solo[end] {
                end += 1;
            }
        }
        let len = (end - index) as u16;
        out.push(Patch {
            target: run[index].target,
            span: run[index].span,
            op: Op::EffectGroup { len },
        });
        out.extend(run[index..end].iter().copied());
        index = end;
    }
}

/// A user-written thunk carries its reads in `inner`; a direct tracked read
/// carries them in `deps`.
fn deps(rx: crate::ir::Rx<'_>) -> DepSet {
    rx.deps.join(rx.inner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{Chan, Diff, ExprSrc, Ns, Rx, Site, Unit};
    use oxc::span::Span;

    fn live(target: u32, value: u32) -> Patch {
        Patch {
            target,
            span: Span::default(),
            op: Op::SetLive { name: 0, value, chan: Chan::Attr, diff: Diff::Identity },
        }
    }

    fn unit_with<'a>(allocator: &'a Allocator, patches: &[Patch], rx: &[Rx<'a>]) -> Unit<'a> {
        let mut unit = Unit::new_in(allocator, Ns::Html, Site::Nested(Span::default()));
        for rx in rx {
            unit.exprs.push(ExprSrc::Folded(0), Span::default(), *rx);
        }
        unit.patch.extend(patches.iter().copied());
        unit
    }

    #[test]
    fn every_live_prop_on_one_element_shares_a_single_effect() {
        let allocator = Allocator::new();
        let cheap = Rx { deps: DepSet::single(0), ..Rx::OPAQUE };
        let mut unit =
            unit_with(&allocator, &[live(1, 0), live(1, 1), live(2, 2)], &[cheap, cheap, cheap]);
        regroup(&allocator, &mut unit);

        let headers: Vec<u16> = unit
            .patch
            .iter()
            .filter_map(|patch| match patch.op {
                Op::EffectGroup { len } => Some(len),
                _ => None,
            })
            .collect();
        assert_eq!(headers, vec![2, 1], "two props on el 1, one on el 2");
        assert_eq!(unit.patch.len(), 5);
    }

    /// The one place one-effect-per-element can do MORE work than the oracle,
    /// so the cost model refuses it.
    #[test]
    fn an_expensive_prop_with_no_shared_dependency_keeps_its_own_effect() {
        let allocator = Allocator::new();
        let cheap = Rx { deps: DepSet::single(0), ..Rx::OPAQUE };
        let expensive = Rx { deps: DepSet::single(1), cost: Cost::Expensive, ..Rx::OPAQUE };
        let mut unit = unit_with(&allocator, &[live(1, 0), live(1, 1)], &[cheap, expensive]);
        regroup(&allocator, &mut unit);

        let headers: Vec<u16> = unit
            .patch
            .iter()
            .filter_map(|patch| match patch.op {
                Op::EffectGroup { len } => Some(len),
                _ => None,
            })
            .collect();
        assert_eq!(headers, vec![1, 1]);

        // Sharing a dependency makes the merge free again: the hot signal was
        // going to recompute both anyway.
        let shared = Rx { deps: DepSet::single(0), cost: Cost::Expensive, ..Rx::OPAQUE };
        let mut unit = unit_with(&allocator, &[live(1, 0), live(1, 1)], &[cheap, shared]);
        regroup(&allocator, &mut unit);
        let headers: Vec<u16> = unit
            .patch
            .iter()
            .filter_map(|patch| match patch.op {
                Op::EffectGroup { len } => Some(len),
                _ => None,
            })
            .collect();
        assert_eq!(headers, vec![2]);
    }

    #[test]
    fn a_patch_that_is_not_live_is_left_exactly_where_it_was() {
        let allocator = Allocator::new();
        let opaque = Rx::OPAQUE;
        let mut unit = unit_with(&allocator, &[], &[opaque]);
        unit.patch.push(Patch {
            target: 1,
            span: Span::default(),
            op: Op::SetOpaque { name: 0, value: 0 },
        });
        regroup(&allocator, &mut unit);
        assert_eq!(unit.patch.len(), 1);
        assert!(matches!(unit.patch[0].op, Op::SetOpaque { .. }));
    }
}
