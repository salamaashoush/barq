use oxc::allocator::{Allocator, Vec as ArenaVec};

use crate::ir::{Anchor, Interner, Module, NONE, NodeId, Op, SkelNode, TagFlags, Unit};

/// P5's anchor half — target #9. A hole only pays for a `<!---->` when no node
/// already standing in the template can serve as its insert anchor. P1 leaves
/// every slot provisionally marked; this is where the marker is materialised or
/// elided, and it is the last pass that may change the skeleton's shape.
///
/// `elide` is the optimisation. With it off every hole materialises its own
/// `<!---->` and anchors against it, which is always a legal insert position —
/// the elision is what has to prove something about the parse.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>, elide: bool) {
    let interner = &module.interner;
    for unit in module.units.iter_mut() {
        choose(allocator, interner, unit, elide);
    }
}

/// What the DOM will hold immediately before the slot under consideration. Only
/// `Text` matters: the HTML parser fuses two literal text runs into ONE node, so
/// a hole between them has no addressable boundary to anchor against.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Prev {
    Nothing,
    Text,
    Node,
}

/// The decision, in pre-splice `NodeId`s.
#[derive(Clone, Copy)]
enum Choice {
    End,
    Node(NodeId),
    /// carries the slot's own node, since the marker is spliced directly after it
    Marker(NodeId),
}

fn choose<'a>(
    allocator: &'a Allocator,
    interner: &Interner<'a>,
    unit: &mut Unit<'a>,
    elide: bool,
) {
    // Indexed by `SlotId`, not by how many slots survived: P3 folds a constant
    // child away and deletes its patch, which leaves the remaining ids sparse.
    let Some(slots) = unit.patch.iter().filter_map(|patch| patch.op.slot()).max() else {
        return;
    };
    let mut choice: Vec<Choice> = vec![Choice::End; slots as usize + 1];
    let mut markers: Vec<NodeId> = Vec::new();

    // A group whose parent can hold no marker at all: a `<!---->` inside a
    // raw-text element is TEXT the value would be read as, and inside an element
    // whose content is replaced the write deletes the marker before the insert
    // that anchors against it runs. P1 gives both of them exactly one child
    // position, at the end, so `End` is the only anchor either can need — and
    // that has to hold at `-O0` too, where elision is off.
    let mut groups: Vec<(NodeId, NodeId, bool)> = vec![(unit.skeleton.roots.0, unit.skeleton.roots.1, true)];
    for id in 0..unit.skeleton.len() {
        if let SkelNode::Element(element) = unit.skeleton.nodes[id]
            && element.children.0 < element.children.1
        {
            groups.push((
                element.children.0,
                element.children.1,
                markable(interner, unit, id as NodeId),
            ));
        }
    }

    for (lo, hi, markable) in groups {
        let mut prev = Prev::Nothing;
        for node in lo..hi {
            let SkelNode::Slot(slot) = unit.skeleton.nodes[node as usize] else {
                prev = match unit.skeleton.nodes[node as usize] {
                    SkelNode::Text(_) => Prev::Text,
                    // Writes no bytes, so it neither separates two text runs nor
                    // stands between a hole and its anchor.
                    SkelNode::Empty => prev,
                    _ => Prev::Node,
                };
                continue;
            };
            let decision = match (markable, elide) {
                (false, _) => Choice::End,
                (true, true) => decide(unit, node, hi, prev),
                (true, false) => Choice::Marker(node),
            };
            if matches!(decision, Choice::Marker(_)) {
                markers.push(node);
                prev = Prev::Node;
            }
            choice[slot as usize] = decision;
        }
    }

    let remap = splice(allocator, unit, &markers);
    for patch in unit.patch.iter_mut() {
        let Op::Insert { slot, anchor, .. } = &mut patch.op else { continue };
        *anchor = match choice[*slot as usize] {
            Choice::End => Anchor::End,
            Choice::Node(node) => Anchor::Node(remap[node as usize]),
            // The splice puts the marker directly after its slot.
            Choice::Marker(node) => Anchor::Marker(remap[node as usize] + 1),
        };
    }
    debug_assert_eq!(unit.skeleton.validate(), Ok(()));
}

/// Whether a `<!---->` inside this element would be a comment node at all.
///
/// Inside `<script>`/`<style>`/`<textarea>`/`<title>` it is character data, and
/// inside an element whose content a patch REPLACES it is deleted before the
/// insert that would anchor against it. P1 keeps both shapes to one trailing
/// child position, so neither ever needs one.
fn markable<'a>(interner: &Interner<'a>, unit: &Unit<'a>, node: NodeId) -> bool {
    let Some(element) = unit.skeleton.node(node).as_element() else { return true };
    let flags = interner.tag(element.tag).flags;
    if flags.contains(TagFlags::RAW_TEXT) || flags.contains(TagFlags::ESCAPABLE_RAW_TEXT) {
        return false;
    }
    !unit.patch.iter().any(|patch| {
        let name = match patch.op {
            Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => name,
            _ => return false,
        };
        patch.target == node && crate::lower::names::replaces_children(interner.name(name).text)
    })
}

/// DESIGN §3/P5, in order. Every skeleton node but a `Slot` materialises, so the
/// immediate next sibling is always the one that decides. Rule 3 is a theorem
/// about the parse, not a wish: two literal text runs either side of an elided
/// hole become ONE text node, and then nothing addresses the second run.
fn decide(unit: &Unit<'_>, slot: NodeId, hi: NodeId, prev: Prev) -> Choice {
    // A folded child leaves an `Empty` behind, which materialises nothing, so
    // the anchor is whatever stands after it.
    let Some(next) =
        (slot + 1..hi).find(|node| !matches!(unit.skeleton.nodes[*node as usize], SkelNode::Empty))
    else {
        return Choice::End;
    };
    match unit.skeleton.nodes[next as usize] {
        // Two holes must never share an anchor, or their reconciliations
        // interleave.
        SkelNode::Slot(_) => Choice::Marker(slot),
        SkelNode::Text(_) if prev == Prev::Text => Choice::Marker(slot),
        // Raw html is bytes, not a node count, so no walk may cross it.
        SkelNode::RawHtml(_) => Choice::Marker(slot),
        _ => Choice::Node(next),
    }
}

/// Materialises one `<!---->` directly after each named slot node. Every
/// `NodeId` after an insertion point moves, so the whole unit — parent column,
/// child ranges, spans, patch targets and attribute positions — is renumbered
/// in one pass, and `mat_ix` is recomputed rather than patched.
///
/// Returns old `NodeId` → new `NodeId`.
fn splice<'a>(allocator: &'a Allocator, unit: &mut Unit<'a>, at: &[NodeId]) -> Vec<NodeId> {
    let count = unit.skeleton.len();
    let mut shift = Vec::with_capacity(count + 1);
    let mut inserted = 0u32;
    let mut pending = at.iter().copied().peekable();
    for boundary in 0..=count as NodeId {
        while pending.peek().is_some_and(|slot| *slot < boundary) {
            pending.next();
            inserted += 1;
        }
        shift.push(inserted);
    }
    let remap: Vec<NodeId> = (0..count).map(|id| id as NodeId + shift[id]).collect::<Vec<_>>();
    if at.is_empty() {
        return remap;
    }

    let total = count + at.len();
    let mut nodes = ArenaVec::with_capacity_in(total, &allocator);
    let mut parent = ArenaVec::with_capacity_in(total, &allocator);
    let mut spans = ArenaVec::with_capacity_in(total, &allocator);
    let mut pending = at.iter().copied().peekable();

    for id in 0..count {
        let mut node = unit.skeleton.nodes[id];
        if let SkelNode::Element(element) = &mut node {
            element.children = (
                element.children.0 + shift[element.children.0 as usize],
                element.children.1 + shift[element.children.1 as usize],
            );
        }
        let owner = match unit.skeleton.parent[id] {
            NONE => NONE,
            owner => remap[owner as usize],
        };
        nodes.push(node);
        parent.push(owner);
        spans.push(unit.spans[id]);

        if pending.peek() == Some(&(id as NodeId)) {
            pending.next();
            let SkelNode::Slot(slot) = unit.skeleton.nodes[id] else {
                unreachable!("a marker is only ever spliced after a slot")
            };
            nodes.push(SkelNode::Marker(slot));
            parent.push(owner);
            spans.push(unit.spans[id]);
        }
    }

    unit.skeleton.roots = (
        unit.skeleton.roots.0 + shift[unit.skeleton.roots.0 as usize],
        unit.skeleton.roots.1 + shift[unit.skeleton.roots.1 as usize],
    );
    unit.skeleton.nodes = nodes;
    unit.skeleton.parent = parent;
    unit.skeleton.mat_ix = ArenaVec::from_iter_in(std::iter::repeat_n(NONE, total), &allocator);
    unit.spans = spans;
    unit.skeleton.renumber_materialisation();

    for patch in unit.patch.iter_mut() {
        patch.target = remap[patch.target as usize];
    }
    for entry in unit.attr_order.iter_mut() {
        entry.0 = remap[entry.0 as usize];
    }
    remap
}

#[cfg(test)]
mod tests {
    use crate::compile::source_type_for;
    use crate::ir::{Module, Op};
    use crate::options::ResolvedOptions;
    use crate::{analysis, harvest, lower, passes};
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;

    fn anchors(source: &str) -> (String, Vec<crate::ir::Anchor>) {
        let allocator = Allocator::new();
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        analysis::bind(&allocator, &program, &mut module, &ResolvedOptions::default());
        harvest::run(&allocator, &mut program, &mut module);
        lower::lower(&allocator, source, &ResolvedOptions::default(), &mut module);
        passes::run(
            &allocator,
            &mut module,
            &ResolvedOptions::default(),
            crate::codegen::Target::Dom,
        );
        let anchors = module.units[0]
            .patch
            .iter()
            .filter_map(|patch| match patch.op {
                Op::Insert { anchor, .. } => Some(anchor),
                _ => None,
            })
            .collect();
        (module.template_html(module.units[0].template).to_string(), anchors)
    }

    #[test]
    fn a_hole_with_nothing_after_it_costs_no_comment_node() {
        let (html, anchors) = anchors("const V = () => <div class=\"c\">{x}</div>;\n");
        assert_eq!(html, "<div class=\"c\"></div>");
        assert!(!anchors[0].costs_a_comment_node());
        assert_eq!(anchors[0].node(), None);
    }

    #[test]
    fn a_hole_followed_by_one_text_run_anchors_against_it() {
        // DESIGN §7: `<p>{hole} clicks</p>` has exactly one materialised child.
        let (html, anchors) = anchors("const V = () => <p>{x} clicks</p>;\n");
        assert_eq!(html, "<p> clicks</p>");
        assert!(!anchors[0].costs_a_comment_node());
        assert!(anchors[0].node().is_some());
    }

    #[test]
    fn a_hole_between_two_text_runs_still_pays_for_a_marker() {
        // The parser fuses them into one node, so the trailing run is not
        // addressable without something standing between.
        let (html, anchors) = anchors("const V = () => <p>Total: {x} clicks</p>;\n");
        assert_eq!(html, "<p>Total: <!----> clicks</p>");
        assert!(anchors[0].costs_a_comment_node());
    }

    #[test]
    fn two_adjacent_holes_never_share_an_anchor() {
        let (html, anchors) = anchors("const V = () => <div>{a}{b}</div>;\n");
        assert_eq!(html, "<div><!----></div>");
        assert!(anchors[0].costs_a_comment_node());
        assert!(!anchors[1].costs_a_comment_node());
        assert_eq!(anchors[1].node(), None);
    }

    #[test]
    fn a_hole_followed_by_an_element_anchors_against_the_element() {
        let (html, anchors) = anchors("const V = () => <div>{a}<b>x</b></div>;\n");
        assert_eq!(html, "<div><b>x</b></div>");
        assert!(!anchors[0].costs_a_comment_node());
        assert!(anchors[0].node().is_some());
    }

    /// The splice renumbers every column, so a marker in an EARLIER sibling
    /// group must not leave a later group's patches addressing the wrong node.
    #[test]
    fn a_marker_renumbers_the_nodes_after_it() {
        let (html, anchors) =
            anchors("const V = () => <div><p>a {x} b</p><span>{y}</span></div>;\n");
        assert_eq!(html, "<div><p>a <!----> b</p><span></span></div>");
        assert!(anchors[0].costs_a_comment_node());
        assert!(!anchors[1].costs_a_comment_node());
    }
}
