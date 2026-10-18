use oxc::allocator::Allocator;

use crate::ir::{Interner, Module, NameFlags, NodeId, Op, Patch, SkelNode, TagFlags, Unit};

/// An `<input>` or `<select>` sanitizes a write to `value` or `checked` against
/// its `type`, `min`, `max`, `step` and `multiple` as they stand at that
/// moment: `value = 2500` on a range input whose `max` is not set yet is
/// clamped to the default 100, and setting `max` afterwards does not bring it
/// back. A literal in the template is safe, since the parser sees every
/// attribute at once; a written value is not.
///
/// So a patch that writes one of those constraints on an element that also has
/// its value written by a patch moves to the front of the unit's program. That
/// puts it ahead of the value whatever order the attributes were spelled in,
/// and ahead of the effect group header too: the header stands where the
/// group's first member was, and the group's first run writes every member,
/// the value among them, at that point.
///
/// Every target and every optimisation level run it, before anything is
/// addressed, so the DOM and the string backend still address the same
/// positions and `-O0` addresses them the same way.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    let Module { units, interner, .. } = module;
    for unit in units.iter_mut() {
        order(allocator, interner, unit);
    }
}

/// The name an attribute-writing op writes, if it is one.
fn written(op: Op) -> Option<crate::ir::NameId> {
    match op {
        Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => {
            Some(name)
        }
        Op::Bind { prop, .. } => Some(prop),
        _ => None,
    }
}

fn clamps(interner: &Interner<'_>, unit: &Unit<'_>, target: NodeId) -> bool {
    match unit.skeleton.node(target) {
        SkelNode::Element(element) => {
            interner.tag(element.tag).flags.contains(TagFlags::CLAMPS_VALUE)
        }
        _ => false,
    }
}

fn writes(interner: &Interner<'_>, patch: &Patch, flag: NameFlags) -> bool {
    written(patch.op).is_some_and(|name| interner.name(name).flags.contains(flag))
}

fn order<'a>(allocator: &'a Allocator, interner: &Interner<'a>, unit: &mut Unit<'a>) {
    let valued: Vec<NodeId> = unit
        .patch
        .iter()
        .filter(|patch| writes(interner, patch, NameFlags::FORM_STATE))
        .map(|patch| patch.target)
        .filter(|&target| clamps(interner, unit, target))
        .collect();
    if valued.is_empty() {
        return;
    }
    let hoisted = |patch: &Patch| {
        valued.contains(&patch.target) && writes(interner, patch, NameFlags::CONSTRAINS_VALUE)
    };
    if !unit.patch.iter().any(hoisted) {
        return;
    }
    let old = std::mem::replace(&mut unit.patch, oxc::allocator::Vec::new_in(&allocator));
    unit.patch.reserve(old.len());
    unit.patch.extend(old.iter().copied().filter(|patch| hoisted(patch)));
    unit.patch.extend(old.iter().copied().filter(|patch| !hoisted(patch)));
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::options::{Opt, ResolvedOptions};

    fn emitted(source: &str, opt: Opt, hydratable: bool) -> String {
        let options =
            ResolvedOptions { opt, hydratable, ..ResolvedOptions::with_filename("S.tsx") };
        match compile(source, &options) {
            Ok(output) => output.code,
            Err(diagnostics) => panic!("{diagnostics:?}"),
        }
    }

    /// Every client mode the DOM target compiles in.
    fn modes(source: &str) -> Vec<String> {
        let mut out = Vec::new();
        for opt in [Opt::ALL, Opt::NONE] {
            for hydratable in [false, true] {
                out.push(emitted(source, opt, hydratable));
            }
        }
        out
    }

    fn before(code: &str, first: &str, second: &str) -> bool {
        match (code.find(first), code.find(second)) {
            (Some(a), Some(b)) => a < b,
            _ => panic!("expected both {first:?} and {second:?} in\n{code}"),
        }
    }

    /// The demo's asteroid slider: an imported `max` is a `bindProp` the effect
    /// group does not own, and the group's first run, standing at the label's
    /// `title`, used to write the value before it.
    #[test]
    fn an_opaque_max_is_written_before_the_value_the_group_writes() {
        let source = r#"
import { createSignal } from "@barqjs/core";
import { MAX } from "./limits";

export function Slider() {
  const [count] = createSignal(2500);
  const [hint] = createSignal("rocks");
  return (
    <label title={hint()}>
      <input type="range" value={count()} min="0" max={MAX} step="100" />
    </label>
  );
}
"#;
        for code in modes(source) {
            assert!(before(&code, "\"max\", MAX", "\"value\""), "{code}");
        }
    }

    #[test]
    fn a_reactive_constraint_spelled_after_the_value_is_written_first() {
        let source = r#"
import { createSignal } from "@barqjs/core";

export function Slider() {
  const [count] = createSignal(2500);
  const [limit] = createSignal(6000);
  const [kind] = createSignal("range");
  return <input value={count()} max={limit()} type={kind()} />;
}
"#;
        for code in modes(source) {
            assert!(before(&code, "\"max\"", "\"value\""), "{code}");
            assert!(before(&code, "\"type\"", "\"value\""), "{code}");
        }
    }

    #[test]
    fn checked_and_a_select_value_wait_for_their_constraints() {
        let source = r#"
import { createSignal } from "@barqjs/core";

export function Fields() {
  const [on] = createSignal(true);
  const [kind] = createSignal("checkbox");
  const [picked] = createSignal(["a", "b"]);
  const [many] = createSignal(true);
  return (
    <div>
      <input checked={on()} type={kind()} />
      <select value={picked()} multiple={many()} />
    </div>
  );
}
"#;
        for code in modes(source) {
            assert!(before(&code, "\"type\"", "\"checked\""), "{code}");
            assert!(before(&code, "\"multiple\"", "\"value\""), "{code}");
        }
    }

    #[test]
    fn an_element_that_does_not_sanitize_its_value_keeps_its_order() {
        let source = r#"
import { createSignal } from "@barqjs/core";

export function Meter() {
  const [level] = createSignal(3);
  const [top] = createSignal(10);
  return <meter value={level()} max={top()} />;
}
"#;
        for code in modes(source) {
            assert!(before(&code, "\"value\"", "\"max\""), "{code}");
        }
    }
}
