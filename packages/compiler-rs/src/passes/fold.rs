use oxc::allocator::{Allocator, Vec as ArenaVec};
use oxc::ast::ast::{Expression, IdentifierReference};
use oxc::ast_visit::Visit;
use rustc_hash::FxHashSet;

use crate::ir::{
    Const, ExprSrc, Interner, Module, NONE, NameFlags, NameId, NodeId, Ns, Op, SkelAttr,
    SkelAttrValue, SkelNode, Unit,
};
use crate::lower::entity;

use super::classify::as_text;

/// P3 Fold — target #3. A `SetOnce` whose value the analysis proved constant
/// migrates INTO the skeleton HTML, and the patch that carried it is deleted.
/// A subtree that loses its last patch becomes `is_pure_static()`, which is
/// target #2 falling out as a type-level fact rather than a special case.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    let Module { units, interner, folded_reads, .. } = module;
    for unit in units.iter_mut() {
        fold_unit(allocator, interner, folded_reads, unit);
    }
}

/// Names the folded expression read. The value lives in the template HTML now,
/// so each of these bindings may have lost its last reader — codegen checks and
/// drops the ones that did.
fn record_reads<'a>(expression: &Expression<'a>, into: &mut FxHashSet<&'a str>) {
    struct Reads<'r, 'a>(&'r mut FxHashSet<&'a str>);
    impl<'a> Visit<'a> for Reads<'_, 'a> {
        fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
            self.0.insert(it.name.as_str());
        }
    }
    Reads(into).visit_expression(expression);
}

/// What a constant becomes in a double-quoted attribute context.
enum Baked<'a> {
    /// `setElementAttr` writes `setAttribute(key, "")` for a `true` boolean.
    Bare,
    Value(&'a str),
    /// `false` / `null` / `undefined` REMOVE the attribute, so the template
    /// simply does not carry it and the patch is still deleted.
    Absent,
}

fn fold_unit<'a>(
    allocator: &'a Allocator,
    interner: &mut Interner<'a>,
    folded_reads: &mut FxHashSet<&'a str>,
    unit: &mut Unit<'a>,
) {
    let mut folded: Vec<usize> = Vec::new();
    for index in 0..unit.patch.len() {
        let Op::SetOnce { name, value, .. } = unit.patch[index].op else { continue };
        let Some(konst) = unit.exprs.rx(value).fold() else { continue };
        // Per ELEMENT, not per unit: `setElementAttr` takes the property channel
        // only under `!isSvg`, so `<svg value="x">` folds where `<input>` does
        // not, and a unit can hold both.
        let SkelNode::Element(element) = unit.skeleton.node(unit.patch[index].target) else {
            continue;
        };
        if !bakeable(interner, name, element.ns != Ns::Html, konst) {
            continue;
        }
        let Some(baked) = bake(konst, allocator) else { continue };
        if !place(allocator, interner, unit, unit.patch[index].target, name, baked) {
            continue;
        }
        if let Some(expression) = unit.exprs.entry(value).src.expression() {
            record_reads(expression, folded_reads);
        }
        unit.exprs.entry_mut(value).src = ExprSrc::Folded(NONE);
        folded.push(index);
    }
    if folded.is_empty() {
        return;
    }
    let old = std::mem::replace(&mut unit.patch, ArenaVec::new_in(&allocator));
    unit.patch.reserve(old.len() - folded.len());
    for (index, patch) in old.into_iter().enumerate() {
        if !folded.contains(&index) {
            unit.patch.push(patch);
        }
    }
}

/// P1 already answers "may this literal go into the template HTML" for the
/// source-literal form; a fold is the same question about a value the analysis
/// proved constant, so it asks the same predicate rather than a second one that
/// can disagree.
///
/// `class` and `style` are intercepted by `applyResolvedProp`, and a literal
/// STRING is the one shape that reaches the DOM identically either way:
/// `classToString` returns a string unchanged, and a string style is written
/// with `setAttribute` verbatim. Anything else the runtime normalises — an
/// array class, a style object, `classList`, `dangerouslySetInnerHTML` — is
/// refused, because the attribute the parser would produce is not what the
/// runtime writes.
fn bakeable(interner: &Interner<'_>, name: NameId, is_svg: bool, konst: Const<'_>) -> bool {
    let row = interner.name(name);
    if !crate::lower::names::attribute_channel(row.text, is_svg) {
        return false;
    }
    if row.flags.contains(NameFlags::STATEFUL_DIFF) {
        let string_shaped =
            row.flags.contains(NameFlags::IS_CLASS) || row.flags.contains(NameFlags::IS_STYLE);
        return string_shaped && matches!(konst, Const::Str(_));
    }
    true
}

fn bake<'a>(konst: Const<'a>, allocator: &'a Allocator) -> Option<Baked<'a>> {
    Some(match konst {
        Const::Bool(true) => Baked::Bare,
        Const::Bool(false) | Const::Null | Const::Undefined => Baked::Absent,
        other => {
            let text = as_text(other)?;
            if crate::lower::text::rewritten_by_the_tokenizer(&text) {
                return None;
            }
            let escaped = entity::escape_attribute(&text);
            Baked::Value(allocator.alloc_str(&escaped))
        }
    })
}

/// Inserts the attribute at its SOURCE position among the ones P1 already
/// baked, so the order the DOM reports still matches the order the props object
/// would have applied them in.
fn place<'a>(
    allocator: &'a Allocator,
    interner: &mut Interner<'a>,
    unit: &mut Unit<'a>,
    node: NodeId,
    name: NameId,
    baked: Baked<'a>,
) -> bool {
    let Some(&(_, _, order)) =
        unit.attr_order.iter().find(|(owner, key, _)| *owner == node && *key == name)
    else {
        return false;
    };
    if !matches!(unit.skeleton.node(node), SkelNode::Element(_)) {
        return false;
    }
    let value = match baked {
        Baked::Absent => return true,
        Baked::Bare => SkelAttrValue::Bare,
        Baked::Value(text) => SkelAttrValue::Str(interner.intern_arena_str(text)),
    };

    let SkelNode::Element(element) = unit.skeleton.node(node) else { unreachable!() };
    let mut attrs: Vec<SkelAttr> = element.attrs.to_vec();
    let at = attrs.iter().position(|attr| attr.order > order).unwrap_or(attrs.len());
    attrs.insert(at, SkelAttr { name, order, value });
    let attrs = ArenaVec::from_iter_in(attrs, &allocator).into_arena_slice();

    let SkelNode::Element(element) = &mut unit.skeleton.nodes[node as usize] else {
        unreachable!()
    };
    element.attrs = attrs;
    true
}
