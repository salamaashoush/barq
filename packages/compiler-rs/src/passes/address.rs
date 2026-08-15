use oxc::allocator::Allocator;

use crate::ir::{
    Anchor, Interner, Module, NONE, NodeId, RefDef, RefId, SkelNode, Step, Uids, Unit,
};

/// P6 Address — target #5. Costs are property reads, and the alphabet is
/// `{firstChild, lastChild, nextSibling, previousSibling}`. Bidirectional is the
/// win a firstChild-only scheme leaves on the table: child 8 of 10 is two reads
/// from the end and nine from the front.
///
/// Nothing is emitted for a node no patch reads, and no binding exists only to
/// be walked THROUGH — a step composes its descent with its sibling run, so one
/// def is one binding.
///
/// DESIGN §3 specifies a two-sweep distance transform, which minimises the route
/// to each node SEPARATELY. That is the wrong objective: an existing ref costs
/// nothing to walk from, so what the emitted code pays is the SUM of the steps.
/// Minimising the sum is a spanning tree, and it is strictly cheaper — on §7's
/// own example it finds three property reads where the hand-derived plan there
/// spends four.
///
/// `nearest` is the optimisation: the spanning tree, and with it `lastChild`,
/// `previousSibling` and walking from a sibling that already has a binding. Off,
/// every node descends from its own parent with `firstChild` and a run of
/// `nextSibling` — the same alphabet, the longest route, and no claim about
/// anything but the node's own materialised index.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>, nearest: bool) {
    let Module { units, interner, uids, .. } = module;
    for unit in units.iter_mut() {
        if unit.patch.is_empty() {
            continue;
        }
        plan(allocator, unit, uids, interner, nearest);
        debug_assert_eq!(unit.refs.validate(), Ok(()));
    }
}

fn plan<'a>(
    allocator: &'a Allocator,
    unit: &mut Unit<'a>,
    uids: &mut Uids<'a>,
    interner: &mut Interner<'a>,
    nearest: bool,
) {
    let count = unit.skeleton.len();
    debug_assert!(!unit.skeleton.is_fragment(), "a multi-root skeleton has no single Step::Root");
    unit.refs.of_node.extend(std::iter::repeat_n(NONE, count));

    // The root is what the unit evaluates to, so it is always addressed. Every
    // other node is needed only because a patch names it — plus its ancestors,
    // since the first def in a sibling group can only come from the parent.
    let mut needed = vec![false; count];
    needed[unit.skeleton.roots.0 as usize] = true;
    for patch in &unit.patch {
        needed[patch.target as usize] = true;
        if let Some(anchor) = patch.op.anchor().and_then(Anchor::node) {
            needed[anchor as usize] = true;
        }
    }
    for id in (0..count).rev() {
        if !needed[id] {
            continue;
        }
        let parent = unit.skeleton.parent[id];
        if parent != NONE {
            needed[parent as usize] = true;
        }
    }

    define(unit, unit.skeleton.roots.0, Step::Root, uids, interner, allocator);
    // Increasing `NodeId` is document order, so a group's parent is always
    // already defined when the group is reached.
    for id in 0..count {
        if !needed[id] {
            continue;
        }
        let SkelNode::Element(element) = unit.skeleton.nodes[id] else { continue };
        group(
            unit,
            id as NodeId,
            element.children,
            element.mat_kids,
            &needed,
            uids,
            interner,
            allocator,
            nearest,
        );
    }
}

/// One sibling group. `mat_ix` is what makes this correct: a `Slot`
/// materialises nothing, so a leading hole must not shift the walk.
///
/// What is minimised is the number of property reads the emitted walk performs,
/// summed over the group — and a ref that already exists is free to walk from,
/// which is what makes this a minimum spanning tree over
/// `{parent} ∪ {needed children}` rather than a shortest path to each. The graph
/// is a path plus a hub: only `parent→child` (a `firstChild`/`lastChild`
/// descent) and CONSECUTIVE sibling edges can appear, since any longer sibling
/// edge costs at least the hops it spans.
#[expect(clippy::too_many_arguments)]
fn group<'a>(
    unit: &mut Unit<'a>,
    parent: NodeId,
    children: (NodeId, NodeId),
    mat_kids: u32,
    needed: &[bool],
    uids: &mut Uids<'a>,
    interner: &mut Interner<'a>,
    allocator: &'a Allocator,
    nearest: bool,
) {
    let (lo, hi) = children;
    let wanted: Vec<(u32, NodeId)> = (lo..hi)
        .filter(|node| needed[*node as usize])
        .map(|node| (unit.skeleton.mat_ix_of(node), node))
        .filter(|(index, _)| *index != NONE)
        .collect();
    if wanted.is_empty() {
        return;
    }
    debug_assert!(wanted.windows(2).all(|pair| pair[0].0 < pair[1].0));

    let base = unit.refs.ref_of(parent).expect("a group's parent is addressed first");
    let last = mat_kids - 1;
    let count = wanted.len();

    if !nearest {
        for (index, node) in wanted {
            define(unit, node, Step::FirstChild(base, index), uids, interner, allocator);
        }
        return;
    }

    // Node 0 is the parent; node `1 + t` is `wanted[t]`. Descents are offered
    // first so an equal-cost tie resolves toward the shallower expression — a
    // shorter dependency chain of loads has better ILP than a deep one.
    let mut edges: Vec<(u32, usize, usize)> = Vec::with_capacity(count * 2);
    for (at, (index, _)) in wanted.iter().enumerate() {
        edges.push(((1 + index).min(1 + (last - index)), 0, 1 + at));
    }
    for at in 1..count {
        edges.push((wanted[at].0 - wanted[at - 1].0, at, 1 + at));
    }
    edges.sort_by_key(|(weight, _, _)| *weight);

    // The tree is a path plus a hub, so it needs no adjacency lists: `descent`
    // says a node hangs off the parent, `linked` says the edge to its left
    // neighbour was kept.
    let mut owner: Vec<usize> = (0..=count).collect();
    let mut descent = vec![false; count];
    let mut linked = vec![false; count];
    for (_, from, to) in edges {
        let (a, b) = (find(&mut owner, from), find(&mut owner, to));
        if a == b {
            continue;
        }
        owner[a] = b;
        if from == 0 {
            descent[to - 1] = true;
        } else {
            linked[to - 1] = true;
        }
    }

    // Outward from each descent, so every def walks from one already emitted —
    // the invariant `RefPlan::validate` enforces, and the reason `insert` cannot
    // invalidate a walk taken after it.
    let mut refs: Vec<RefId> = vec![NONE; count];
    for seed in 0..count {
        if !descent[seed] {
            continue;
        }
        let (index, node) = wanted[seed];
        let step = if index <= last - index {
            Step::FirstChild(base, index)
        } else {
            Step::LastChild(base, last - index)
        };
        refs[seed] = define(unit, node, step, uids, interner, allocator);

        let mut at = seed;
        while at + 1 < count && linked[at + 1] {
            let hops = wanted[at + 1].0 - wanted[at].0;
            let step = Step::NextSibling(refs[at], hops);
            refs[at + 1] = define(unit, wanted[at + 1].1, step, uids, interner, allocator);
            at += 1;
        }
        let mut at = seed;
        while at > 0 && linked[at] {
            let hops = wanted[at].0 - wanted[at - 1].0;
            let step = Step::PrevSibling(refs[at], hops);
            refs[at - 1] = define(unit, wanted[at - 1].1, step, uids, interner, allocator);
            at -= 1;
        }
    }
    debug_assert!(refs.iter().all(|id| *id != NONE), "the spanning tree reaches every needed node");
}

fn find(owner: &mut [usize], at: usize) -> usize {
    let mut root = at;
    while owner[root] != root {
        root = owner[root];
    }
    let mut walk = at;
    while owner[walk] != root {
        walk = std::mem::replace(&mut owner[walk], root);
    }
    root
}

fn define<'a>(
    unit: &mut Unit<'a>,
    node: NodeId,
    step: Step,
    uids: &mut Uids<'a>,
    interner: &mut Interner<'a>,
    allocator: &'a Allocator,
) -> RefId {
    let name = interner.intern_arena_str(uids.element(allocator));
    let span = unit.spans[node as usize];
    let id = unit.refs.defs.len() as RefId;
    unit.refs.defs.push(RefDef { node, step, name, span });
    unit.refs.of_node[node as usize] = id;
    id
}

// ============================================================================
// P6, the other sense: compile-time addresses (CODESIGN.md §3.11, §5.2)
// ============================================================================
//
// One file, two senses of "address", and the distinction is worth stating
// because they are not the same artefact. Above: the DOM backend's WALK — a
// route of `firstChild`/`nextSibling` reads to a node, which exists only on a
// target that has nodes. Below: the shared NAME of a position — a triple
// `(module, unit, position)` that both backends compute from the same analysed
// IR and that neither can compute differently.
//
// §3.11 adopts Marko's discipline for the reason Marko has it: it is the only
// thing that lets two emitters make checkable claims about each other. The claim
// M6 lands is the one §5.2 asks for and calls unassertable today — compile the
// corpus both ways and diff the address sets — and the consumers §5.2 lists
// (hydration claiming, HMR granularity, branch instructions, async seeding keys,
// error labels) are milestones that come after this one and read the table.

use crate::ir::{Address, Op, Position, PositionKind};

/// Number every position in the module, in a target-independent order.
///
/// The ORDER is the whole design problem: it has to be derivable from what both
/// targets share. The patch program is that: `classify`, `fold`, `shape` and
/// `group` all run for both targets and in the same order, so unit `u`'s patch
/// `i` is the same instruction about the same JSX on both. What is NOT shared is
/// the skeleton — `anchor` inserts marker nodes for the DOM backend and not for
/// the string one — so a `NodeId` may never reach an address, and does not.
///
/// A `Region` is addressed as a `Slot`, deliberately: the flow pass turns one
/// into the other and back is the same JSX position either way. A hydration
/// claim that changed identity because the compiler proved `STATIC_KEY` would be
/// a claim about the compiler rather than about the document.
pub fn locate(module: &mut Module<'_>) {
    let mut positions = Vec::new();
    for (unit, index) in module.units.iter().zip(0u32..) {
        let mut at = 0u32;
        for patch in &unit.patch {
            let Some((kind, key)) = classify_position(patch.op) else { continue };
            positions.push(Position {
                address: Address { unit: index, position: at },
                kind,
                key,
                span: patch.span,
            });
            at += 1;
        }
    }
    module.positions = positions;
}

/// What an opcode is a position OF, and the key that names it inside its unit.
///
/// `EffectGroup` is the one opcode with no position: it is a prefix marker over
/// the records that follow it, and giving it an address would shift every
/// address after it the moment effect fusion was turned off — which is exactly
/// the instability `-O0` exists to expose rather than to introduce.
fn classify_position(op: Op) -> Option<(PositionKind, u32)> {
    Some(match op {
        Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => {
            (PositionKind::Prop, name)
        }
        Op::SetEvent { event, .. } | Op::Delegate { event, .. } | Op::Listen { event, .. } => {
            (PositionKind::Event, event)
        }
        Op::Ref { .. } => (PositionKind::Ref, 0),
        Op::Bind { prop, .. } => (PositionKind::Bind, prop),
        Op::Spread { .. } => (PositionKind::Spread, 0),
        Op::Insert { slot, .. } | Op::Region { slot, .. } => (PositionKind::Slot, slot),
        Op::EffectGroup { .. } => return None,
    })
}

/// The address table as JSON, for a consumer outside this crate.
///
/// The rows are what a diff compares: an address, what sits at it, and the key
/// that names it inside its unit. The SPAN goes with them, because the point of
/// a stable address is that a claim failure can be reported at the JSX that
/// produced it rather than at a node index.
///
/// The module path is written once, at the top, rather than into every row —
/// a compile is one module, and 300 copies of one string is 300 copies of one
/// string.
pub fn to_json(module: &Module<'_>, path: &str) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(64 + module.positions.len() * 64);
    out.push_str("{\"version\":1,\"module\":");
    quote(&mut out, path);
    out.push_str(",\"positions\":[");
    for (index, position) in module.positions.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        let _ = write!(
            out,
            "{{\"at\":\"{}\",\"kind\":\"{}\",\"key\":{},\"start\":{},\"end\":{}}}",
            position.address,
            position.kind.as_str(),
            position.key,
            position.span.start,
            position.span.end
        );
    }
    out.push_str("]}");
    out
}

fn quote(out: &mut String, text: &str) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if (ch as u32) < 0x20 => {
                let _ = std::fmt::Write::write_fmt(out, format_args!("\\u{:04x}", ch as u32));
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod address_tests {
    use crate::compile::compile;
    use crate::options::ResolvedOptions;

    fn both(source: &str) -> (String, String) {
        let dom = ResolvedOptions { addresses: true, ..ResolvedOptions::with_filename("a.tsx") };
        let ssr = ResolvedOptions { ssr: true, ..dom.clone() };
        (
            compile(source, &dom).expect("compiles").addresses.expect("asked for"),
            compile(source, &ssr).expect("compiles").addresses.expect("asked for"),
        )
    }

    /// §5.2's acceptance test for P6, in miniature — the corpus-wide version is
    /// `test/addresses.test.ts`. The two backends disagree about the SKELETON
    /// (the anchor pass inserts markers for one of them) and must not disagree
    /// about a single address.
    #[test]
    fn the_two_backends_address_the_same_positions() {
        let source = "import { Show, For } from \"@barqjs/core\";\n\
             export const V = (p) => (\n\
               <div id={p.id} onClick={p.go}>\n\
                 <span>{p.a}</span>text{p.b}\n\
                 <Show when={p.on}><b>{p.c}</b></Show>\n\
                 <For each={p.rows}>{(r) => <li>{r.n}</li>}</For>\n\
               </div>\n\
             );\n";
        let (dom, ssr) = both(source);
        assert_eq!(dom, ssr, "the two backends addressed different positions");
        assert!(dom.contains("\"kind\":\"slot\""), "{dom}");
        assert!(dom.contains("\"kind\":\"prop\""), "{dom}");
        assert!(dom.contains("\"kind\":\"event\""), "{dom}");
    }

    /// A side artefact and nothing else: the emitted module is byte-identical
    /// whether the table was built or not. Without this the diff above could be
    /// a fact about a compiler that behaves differently when observed.
    #[test]
    fn asking_for_the_address_table_does_not_change_the_emitted_program() {
        let source = "export const V = (p) => <div id={p.id}><b>{p.a}</b></div>;\n";
        let plain = compile(source, &ResolvedOptions::with_filename("a.tsx")).expect("compiles");
        let asked = compile(
            source,
            &ResolvedOptions { addresses: true, ..ResolvedOptions::with_filename("a.tsx") },
        )
        .expect("compiles");
        assert_eq!(plain.code, asked.code);
        assert!(plain.addresses.is_none());
        assert!(asked.addresses.is_some());
    }

    /// `-O0` and `-Ox` are the same program at a different speed (§6 L3), so
    /// they name the same positions. Effect fusion is the case that could break
    /// it: `EffectGroup` is a prefix marker with no position of its own, and
    /// giving it one would shift every address behind it the moment fusion was
    /// turned off.
    #[test]
    fn the_optimisation_level_does_not_move_an_address() {
        let source =
            "export const V = (p) => <div id={p.id} class={p.c} title={p.t}>{p.k}</div>;\n";
        let mut o0 = ResolvedOptions { addresses: true, ..ResolvedOptions::with_filename("a.tsx") };
        o0.opt = crate::options::Opt::NONE;
        let ox = ResolvedOptions { addresses: true, ..ResolvedOptions::with_filename("a.tsx") };
        assert_eq!(
            compile(source, &o0).expect("compiles").addresses,
            compile(source, &ox).expect("compiles").addresses,
        );
    }
}
