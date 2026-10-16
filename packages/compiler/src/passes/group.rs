use oxc::allocator::Allocator;

use crate::ir::{ExprTable, Module, Op, Patch, Thunk, Unit};

/// P5's grouping half. Every dynamic attribute, property, class and style
/// binding of one template shares ONE `bindEffect`, whichever element it is
/// on: the compute builds one record and the apply compares each field with
/// the one before it, so a change to any read re-runs the record and writes
/// only what moved. That is Solid 2.0's shape, and it is the cheaper one
/// because a row's cost is dominated by how many effects it creates, not by
/// how many fields one effect compares.
///
/// The header goes where the first member was and the members stay where they
/// are. Moving a patch would move its address, which both backends compute
/// from program order, and no member's write is delayed past anything it used
/// to precede: the effect only runs earlier for members that came later.
///
/// A unit whose only candidate is a single opaque binding is left alone,
/// because `bindProp` already gives it the one effect a group would.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    for unit in module.units.iter_mut() {
        regroup(allocator, unit);
    }
}

/// Whether a patch joins its template's effect. A proven-reactive prop always
/// does. An opaque one does when the compiler wraps its value in a thunk,
/// because then `bindProp` sees a function every time and subscribes every
/// time, so fusing it creates no effect the runtime would not have.
pub fn fuses(patch: &Patch, exprs: &ExprTable<'_>) -> bool {
    match patch.op {
        Op::SetLive { .. } => true,
        Op::SetOpaque { value, .. } => exprs.rx(value).thunk == Thunk::Arrow,
        _ => false,
    }
}

/// The patches a group header at `header` governs: the next `len` patches that
/// fuse, wherever they stand.
pub fn members(unit: &Unit<'_>, header: usize, len: u16) -> Vec<usize> {
    unit.patch[header + 1..]
        .iter()
        .enumerate()
        .filter(|(_, patch)| fuses(patch, &unit.exprs))
        .map(|(offset, _)| header + 1 + offset)
        .take(len as usize)
        .collect()
}

fn regroup<'a>(allocator: &'a Allocator, unit: &mut Unit<'a>) {
    let mut first = None;
    let mut count = 0usize;
    let mut live = false;
    for (index, patch) in unit.patch.iter().enumerate() {
        if fuses(patch, &unit.exprs) {
            first.get_or_insert(index);
            count += 1;
            live |= matches!(patch.op, Op::SetLive { .. });
        }
    }
    let Some(first) = first else { return };
    if count < 2 && !live {
        return;
    }
    let len = u16::try_from(count).expect("a template with more than u16::MAX bindings");
    let old = std::mem::replace(&mut unit.patch, oxc::allocator::Vec::new_in(&allocator));
    unit.patch.reserve(old.len() + 1);
    for (index, patch) in old.iter().enumerate() {
        if index == first {
            unit.patch.push(Patch {
                target: patch.target,
                span: patch.span,
                op: Op::EffectGroup { len },
            });
        }
        unit.patch.push(*patch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{Chan, DepSet, Diff, ExprSrc, Ns, Rx, Site, Unit};
    use oxc::span::Span;

    fn live(target: u32, value: u32) -> Patch {
        Patch {
            target,
            span: Span::default(),
            op: Op::SetLive { name: 0, value, chan: Chan::Attr, diff: Diff::Identity },
        }
    }

    fn opaque(target: u32, value: u32) -> Patch {
        Patch {
            target,
            span: Span::default(),
            op: Op::SetOpaque { name: 0, value, chan: Chan::Attr },
        }
    }

    fn once(target: u32, value: u32) -> Patch {
        Patch {
            target,
            span: Span::default(),
            op: Op::SetOnce { name: 0, value, chan: Chan::Attr },
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

    fn headers(unit: &Unit<'_>) -> Vec<(usize, u16)> {
        unit.patch
            .iter()
            .enumerate()
            .filter_map(|(index, patch)| match patch.op {
                Op::EffectGroup { len } => Some((index, len)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn every_live_prop_in_one_template_shares_a_single_effect() {
        let allocator = Allocator::new();
        let cheap = Rx { deps: DepSet::single(0), ..Rx::OPAQUE };
        let mut unit = unit_with(
            &allocator,
            &[live(1, 0), once(2, 1), live(1, 2), live(2, 3)],
            &[cheap, Rx::OPAQUE, cheap, cheap],
        );
        regroup(&allocator, &mut unit);

        assert_eq!(headers(&unit), vec![(0, 3)], "one header, before the first member");
        assert_eq!(unit.patch.len(), 5);
        assert_eq!(members(&unit, 0, 3), vec![1, 3, 4], "the static write is not a member");
    }

    #[test]
    fn an_opaque_call_joins_and_an_opaque_value_does_not() {
        let allocator = Allocator::new();
        let cheap = Rx { deps: DepSet::single(0), ..Rx::OPAQUE };
        let call = Rx { thunk: Thunk::Arrow, ..Rx::OPAQUE };
        let mut unit = unit_with(
            &allocator,
            &[opaque(1, 0), live(1, 1), opaque(2, 2)],
            &[Rx::OPAQUE, cheap, call],
        );
        regroup(&allocator, &mut unit);
        assert_eq!(headers(&unit), vec![(1, 2)]);
        assert_eq!(members(&unit, 1, 2), vec![2, 3]);
    }

    /// `bindProp` already makes the one effect, in fewer bytes.
    #[test]
    fn a_lone_opaque_call_keeps_bind_prop() {
        let allocator = Allocator::new();
        let call = Rx { thunk: Thunk::Arrow, ..Rx::OPAQUE };
        let mut unit = unit_with(&allocator, &[opaque(1, 0)], &[call]);
        regroup(&allocator, &mut unit);
        assert!(headers(&unit).is_empty());

        let mut unit = unit_with(&allocator, &[opaque(1, 0), opaque(2, 1)], &[call, call]);
        regroup(&allocator, &mut unit);
        assert_eq!(headers(&unit), vec![(0, 2)]);
    }

    #[test]
    fn a_patch_that_is_not_live_is_left_exactly_where_it_was() {
        let allocator = Allocator::new();
        let opaque = Rx::OPAQUE;
        let mut unit = unit_with(&allocator, &[], &[opaque]);
        unit.patch.push(Patch {
            target: 1,
            span: Span::default(),
            op: Op::SetOpaque { name: 0, value: 0, chan: Chan::Attr },
        });
        regroup(&allocator, &mut unit);
        assert_eq!(unit.patch.len(), 1);
        assert!(matches!(unit.patch[0].op, Op::SetOpaque { .. }));
    }
}
