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
