use oxc::allocator::{Allocator, Vec as ArenaVec};
use oxc::ast::ast::{Expression, IdentifierReference};
use oxc::ast_visit::Visit;
use rustc_hash::FxHashSet;

use crate::ir::{
    Chan, Const, ExprSrc, Interner, Module, NONE, NameId, NodeId, Ns, Op, SkelAttr, SkelAttrValue,
    SkelNode, Unit,
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

/// The child half of P3, and the half DESIGN's M4 amendment parked: a constant
/// text child used to keep its hole, its `insert` call and — because the text
/// either side would fuse — its `<!---->`, where the same markup written
/// literally costs one clone and nothing else.
///
/// What made it look expensive was owning the anchor and addressing invariants
/// afterwards. In the pass order as built it does not: P3 runs BEFORE P5's
/// anchor selection and P6's addressing, so both are computed against the
/// skeleton this leaves behind rather than patched up after the fact. What is
/// left is fusing the runs, and the walk depends on no two `Text` nodes ever
/// being adjacent — so the second one becomes a [`SkelNode::Empty`] instead of
/// being removed, which would renumber every `NodeId` after it.
fn fold_children<'a>(
    allocator: &'a Allocator,
    interner: &Interner<'a>,
    folded_reads: &mut FxHashSet<&'a str>,
    unit: &mut Unit<'a>,
) -> Vec<usize> {
    let mut folded: Vec<usize> = Vec::new();
    for index in 0..unit.patch.len() {
        let Op::Insert { slot, value, .. } = unit.patch[index].op else { continue };
        let Some(konst) = unit.exprs.rx(value).fold() else { continue };
        let Some(node) = (0..unit.skeleton.len() as NodeId)
            .find(|node| matches!(unit.skeleton.node(*node), SkelNode::Slot(id) if *id == slot))
        else {
            continue;
        };
        let Some(text) = child_text(konst, interner, unit, node, allocator) else { continue };
        if let Some(expression) = unit.exprs.entry(value).src.expression() {
            record_reads(expression, folded_reads);
        }
        unit.exprs.entry_mut(value).src = ExprSrc::Folded(NONE);
        unit.skeleton.nodes[node as usize] = match text {
            Some(text) => SkelNode::Text(text),
            // `null`, `undefined` and booleans render nothing at all.
            None => SkelNode::Empty,
        };
        folded.push(index);
    }
    if !folded.is_empty() {
        fuse_text_runs(allocator, unit);
        unit.skeleton.renumber_materialisation();
    }
    folded
}

/// Whether an attribute on `node` writes the element's whole content —
/// `dangerouslySetInnerHTML`, `innerHTML`, `innerText`, `textContent`.
fn content_is_replaced(interner: &Interner<'_>, unit: &Unit<'_>, node: NodeId) -> bool {
    unit.patch.iter().any(|patch| {
        if patch.target != node {
            return false;
        }
        let name = match patch.op {
            Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => {
                name
            }
            _ => return false,
        };
        crate::lower::names::replaces_children(interner.name(name).text)
    })
}

/// `Some(None)` is a child that renders nothing; `None` is a refusal.
fn child_text<'a>(
    konst: Const<'a>,
    interner: &Interner<'a>,
    unit: &Unit<'a>,
    node: NodeId,
    allocator: &'a Allocator,
) -> Option<Option<&'a str>> {
    // `<script>` and `<style>` hold text that resolves no reference, so the
    // escaping this bakes would reach the DOM as its own characters.
    let parent = unit.skeleton.parent_of(node);
    if parent != NONE
        && let SkelNode::Element(element) = unit.skeleton.node(parent)
        && interner.tag(element.tag).flags.contains(crate::ir::TagFlags::RAW_TEXT)
    {
        return None;
    }
    // An element whose content is REPLACED bakes nothing: the write happens
    // before every insert and would delete whatever the parser had put there.
    // P1 already took these children off the template for that reason.
    if parent != NONE && content_is_replaced(interner, unit, parent) {
        return None;
    }
    match konst {
        Const::Null | Const::Undefined | Const::Bool(_) => Some(None),
        // An empty string is a text NODE to `createElement` and no node at all
        // to the parser, and the difference is a sibling position.
        Const::Str("") => None,
        other => {
            let text = as_text(other)?;
            if crate::lower::text::rewritten_by_the_tokenizer(&text) {
                return None;
            }
            let escaped = entity::escape_text(&text);
            Some(Some(allocator.alloc_str(&escaped)))
        }
    }
}

/// The HTML parser fuses adjacent literal text into ONE node, so two `Text`
/// nodes with nothing but `Empty` between them are indistinguishable after the
/// parse and a sibling walk addressing the second would be addressing the first.
fn fuse_text_runs<'a>(allocator: &'a Allocator, unit: &mut Unit<'a>) {
    let mut groups: Vec<(NodeId, NodeId)> = vec![unit.skeleton.roots];
    for id in 0..unit.skeleton.len() {
        if let SkelNode::Element(element) = unit.skeleton.nodes[id] {
            groups.push(element.children);
        }
    }
    for (lo, hi) in groups {
        let mut run: Option<NodeId> = None;
        for node in lo..hi {
            match unit.skeleton.nodes[node as usize] {
                SkelNode::Empty => {}
                SkelNode::Text(text) => match run {
                    Some(first) => {
                        let SkelNode::Text(head) = unit.skeleton.nodes[first as usize] else {
                            unreachable!("only a Text run is carried")
                        };
                        let mut joined = String::with_capacity(head.len() + text.len());
                        joined.push_str(head);
                        joined.push_str(text);
                        unit.skeleton.nodes[first as usize] =
                            SkelNode::Text(allocator.alloc_str(&joined));
                        unit.skeleton.nodes[node as usize] = SkelNode::Empty;
                    }
                    None => run = Some(node),
                },
                _ => run = None,
            }
        }
    }
}

fn fold_unit<'a>(
    allocator: &'a Allocator,
    interner: &mut Interner<'a>,
    folded_reads: &mut FxHashSet<&'a str>,
    unit: &mut Unit<'a>,
) {
    let mut folded = fold_children(allocator, interner, folded_reads, unit);
    for index in 0..unit.patch.len() {
        let Op::SetOnce { name, value, chan } = unit.patch[index].op else { continue };
        let Some(konst) = unit.exprs.rx(value).fold() else { continue };
        // Per ELEMENT, not per unit: `setElementAttr` takes the property channel
        // only under `!isSvg`, so `<svg value="x">` folds where `<input>` does
        // not, and a unit can hold both.
        let SkelNode::Element(element) = unit.skeleton.node(unit.patch[index].target) else {
            continue;
        };
        let tag = interner.tag(element.tag).text;
        if !bakeable(interner, name, element.ns != Ns::Html, tag, chan, konst) {
            continue;
        }
        // P1 keeps a spread-carrying element out of the template for an
        // ordering reason (`ordered_attributes`), and folding a constant back
        // into it would undo exactly that.
        let target = unit.patch[index].target;
        if unit
            .patch
            .iter()
            .any(|patch| patch.target == target && matches!(patch.op, Op::Spread { .. }))
        {
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
    folded.sort_unstable();
    let old = std::mem::replace(&mut unit.patch, ArenaVec::new_in(&allocator));
    unit.patch.reserve(old.len() - folded.len());
    for (index, patch) in old.into_iter().enumerate() {
        if folded.binary_search(&index).is_err() {
            unit.patch.push(patch);
        }
    }
}

/// P1 already answers "may this literal go into the template HTML" for the
/// source-literal form; a fold is the same question about a value the analysis
/// proved constant, so it asks the same predicate rather than a second one that
/// can disagree.
///
/// The question is the CHANNEL's, and P1 already resolved it: the parser writes
/// an attribute, so only a channel that would itself have written that attribute
/// with those bytes may be folded away.
///
/// `class` and `style` normalise their value, and a literal STRING is the one
/// shape that survives the round trip: `classToString` returns a string
/// unchanged, and a string style is written with `setAttribute` verbatim.
/// Anything else those two normalise — an array class, a style object — and
/// every value on `classList` or `dangerouslySetInnerHTML` is refused, because
/// the attribute the parser would produce is not what the channel writes.
fn bakeable(
    interner: &Interner<'_>,
    name: NameId,
    is_svg: bool,
    tag: &str,
    chan: Chan,
    konst: Const<'_>,
) -> bool {
    if !crate::lower::names::attribute_channel(interner.name(name).text, is_svg, tag) {
        return false;
    }
    match chan {
        Chan::Attr => true,
        Chan::Class | Chan::Style => matches!(konst, Const::Str(_)),
        Chan::Prop | Chan::Live | Chan::Bool | Chan::StyleProp | Chan::ClassList | Chan::Html => {
            false
        }
    }
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
