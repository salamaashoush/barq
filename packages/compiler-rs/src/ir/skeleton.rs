use oxc::allocator::Allocator;
use oxc::span::Span;

use super::{AVec, NONE, NameId, NodeId, SlotId, StrId, TagId};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum Ns {
    #[default]
    Html,
    Svg,
    MathMl,
}

impl Ns {
    /// Foreign content parses XML-style, so `<path/>` closes itself. In HTML the
    /// same bytes leave the element open and swallow its following siblings.
    #[inline]
    pub fn self_closes(self) -> bool {
        !matches!(self, Ns::Html)
    }
}

/// How many DOM nodes a skeleton node contributes to its parent's child list.
/// `Unknown` exists because raw HTML is bytes, not a node count — no sibling
/// walk may cross it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Materialisation {
    Zero,
    One,
    Unknown,
}

pub struct Skeleton<'a> {
    /// index == `NodeId`, document order
    pub nodes: AVec<'a, SkelNode<'a>>,
    /// `NONE` for roots
    pub parent: AVec<'a, NodeId>,
    /// Position among siblings that actually materialise a DOM node. A `Slot`
    /// materialises nothing, so a leading hole must NOT shift the sibling walk.
    /// P6 walks these indices, never raw `NodeId`s. `NONE` when the node
    /// materialises nothing.
    pub mat_ix: AVec<'a, u32>,
    /// half-open; `len > 1` ⇒ fragment
    pub roots: (NodeId, NodeId),
    pub ns: Ns,
    /// html byte offset → originating JSX span. Drives sourcemap segments INSIDE
    /// the hoisted template literal. DELIBERATELY EXCLUDED from `hash`.
    pub origin: AVec<'a, (u32, Span)>,
    /// filled by P7
    pub hash: u64,
}

#[derive(Clone, Copy)]
pub enum SkelNode<'a> {
    Element(SkelElement<'a>),
    /// Already HTML-escaped at compile time. Both backends emit these bytes
    /// verbatim — one escape function, two consumers, zero divergence.
    Text(&'a str),
    /// A child position owned by the patch program. Materialises as NOTHING in
    /// the DOM template and as a chunk boundary in SSR.
    Slot(SlotId),
    /// A `<!---->` the DOM backend needs as an insert anchor. Created only by P5,
    /// only when no cheaper anchor exists. Skipped by the SSR serialiser.
    Marker(SlotId),
    /// Raw unescaped bytes from a literal `dangerouslySetInnerHTML`.
    RawHtml(&'a str),
}

impl SkelNode<'_> {
    #[inline]
    pub fn materialisation(&self) -> Materialisation {
        match self {
            SkelNode::Slot(_) => Materialisation::Zero,
            SkelNode::RawHtml(_) => Materialisation::Unknown,
            _ => Materialisation::One,
        }
    }

    #[inline]
    pub fn as_element(&self) -> Option<&SkelElement<'_>> {
        match self {
            SkelNode::Element(element) => Some(element),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
pub struct SkelElement<'a> {
    /// interned; [`super::Interner::tag`] carries VOID / RAW_TEXT / PRESERVE_WS
    pub tag: TagId,
    /// STATIC ONLY, in SOURCE order — that is what reads well in the emitted
    /// template string, and P1 has already collapsed the duplicates, so the
    /// order carries no meaning. DESIGN §2.1 originally wanted these sorted by
    /// name for a stable content hash; §2.1's M4 amendment keeps source order
    /// instead, which costs P7 a share between two elements that spell the same
    /// attributes in a different order and buys back an emitted template a
    /// reader can line up with the JSX that produced it.
    pub attrs: &'a [SkelAttr],
    /// half-open range into [`Skeleton::nodes`]
    pub children: (NodeId, NodeId),
    pub ns: Ns,
    /// how many children materialise a node — P6 uses this to choose
    /// firstChild-forward vs lastChild-backward
    pub mat_kids: u32,
}

#[derive(Clone, Copy)]
pub struct SkelAttr {
    pub name: NameId,
    /// Position among the element's attributes in SOURCE order. P3 folds a
    /// dynamic attribute into this list and has to put it back where the author
    /// wrote it, because `createElement` walks the props object in that order.
    pub order: u32,
    pub value: SkelAttrValue,
}

#[derive(Clone, Copy)]
pub enum SkelAttrValue {
    /// `disabled` with a literal-true value in an ATTRIBUTE channel
    Bare,
    /// pre-escaped for a double-quoted attribute context
    Str(StrId),
}

impl<'a> Skeleton<'a> {
    pub fn new_in(allocator: &'a Allocator, ns: Ns) -> Self {
        Self {
            nodes: AVec::new_in(&allocator),
            parent: AVec::new_in(&allocator),
            mat_ix: AVec::new_in(&allocator),
            roots: (0, 0),
            ns,
            origin: AVec::new_in(&allocator),
            hash: 0,
        }
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    #[inline]
    pub fn node(&self, id: NodeId) -> &SkelNode<'a> {
        &self.nodes[id as usize]
    }

    #[inline]
    pub fn parent_of(&self, id: NodeId) -> NodeId {
        self.parent[id as usize]
    }

    #[inline]
    pub fn mat_ix_of(&self, id: NodeId) -> u32 {
        self.mat_ix[id as usize]
    }

    #[inline]
    pub fn is_fragment(&self) -> bool {
        self.roots.1 - self.roots.0 > 1
    }

    /// The sibling group `id` belongs to, as a half-open `NodeId` range.
    pub fn siblings_of(&self, id: NodeId) -> (NodeId, NodeId) {
        match self.parent_of(id) {
            NONE => self.roots,
            parent => self.children_of(parent),
        }
    }

    /// Empty range for anything that cannot hold children.
    pub fn children_of(&self, id: NodeId) -> (NodeId, NodeId) {
        match self.node(id) {
            SkelNode::Element(element) => element.children,
            _ => (id + 1, id + 1),
        }
    }

    /// Recomputes every `mat_ix` and every `mat_kids` from the node kinds. P5
    /// materialises and elides marker nodes, which shifts the position of every
    /// later sibling; recomputing is one linear pass and cannot drift the way a
    /// patched-in-place index can.
    pub fn renumber_materialisation(&mut self) {
        let (lo, hi) = self.roots;
        self.renumber_group(lo, hi);
        for id in 0..self.nodes.len() {
            let SkelNode::Element(element) = self.nodes[id] else { continue };
            let (lo, hi) = element.children;
            let count = self.renumber_group(lo, hi);
            if let SkelNode::Element(element) = &mut self.nodes[id] {
                element.mat_kids = count;
            }
        }
    }

    fn renumber_group(&mut self, lo: NodeId, hi: NodeId) -> u32 {
        let mut next = 0;
        for id in lo..hi {
            self.mat_ix[id as usize] = match self.nodes[id as usize].materialisation() {
                Materialisation::One => {
                    next += 1;
                    next - 1
                }
                _ => NONE,
            };
        }
        next
    }

    /// Every structural invariant P6 addressing and P7 hashing silently assume.
    /// Not called in a normal compile; it is what the unit tests and a
    /// `debug_assert` in a future pass check against.
    pub fn validate(&self) -> Result<(), String> {
        let count = self.nodes.len();
        if self.parent.len() != count || self.mat_ix.len() != count {
            return Err(format!(
                "column lengths diverge: nodes {count}, parent {}, mat_ix {}",
                self.parent.len(),
                self.mat_ix.len()
            ));
        }
        let (root_lo, root_hi) = self.roots;
        if root_lo > root_hi || root_hi as usize > count {
            return Err(format!("roots {:?} out of range for {count} nodes", self.roots));
        }
        for id in root_lo..root_hi {
            if self.parent[id as usize] != NONE {
                return Err(format!("root {id} has parent {}", self.parent[id as usize]));
            }
        }
        for id in 0..count as NodeId {
            let parent = self.parent[id as usize];
            if parent != NONE && parent >= id {
                return Err(format!("node {id} precedes its parent {parent}; not document order"));
            }
        }

        self.check_group(root_lo, root_hi, None)?;
        for id in 0..count as NodeId {
            let Some(element) = self.node(id).as_element() else {
                continue;
            };
            let (lo, hi) = element.children;
            if lo > hi || hi as usize > count || lo <= id {
                return Err(format!("element {id} has children range {:?}", element.children));
            }
            for child in lo..hi {
                if self.parent[child as usize] != id {
                    return Err(format!(
                        "child {child} of {id} points at parent {}",
                        self.parent[child as usize]
                    ));
                }
            }
            self.check_group(lo, hi, Some(element.mat_kids))?;
        }
        Ok(())
    }

    fn check_group(&self, lo: NodeId, hi: NodeId, declared: Option<u32>) -> Result<(), String> {
        let mut next = 0u32;
        let mut opaque = false;
        for id in lo..hi {
            match self.node(id).materialisation() {
                Materialisation::Zero => {
                    if self.mat_ix[id as usize] != NONE {
                        return Err(format!(
                            "node {id} materialises nothing but carries mat_ix {}",
                            self.mat_ix[id as usize]
                        ));
                    }
                }
                Materialisation::One => {
                    if self.mat_ix[id as usize] != next {
                        return Err(format!(
                            "node {id} has mat_ix {} where document order says {next}",
                            self.mat_ix[id as usize]
                        ));
                    }
                    next += 1;
                }
                Materialisation::Unknown => {
                    opaque = true;
                    if hi - lo != 1 {
                        return Err(format!(
                            "raw html node {id} has {} siblings; its node count is not \
                             statically known, so no sibling walk may cross it",
                            hi - lo - 1
                        ));
                    }
                }
            }
        }
        match declared {
            Some(mat_kids) if !opaque && mat_kids != next => Err(format!(
                "sibling group [{lo},{hi}) declares mat_kids {mat_kids} but materialises {next}"
            )),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{Interner, TagFlags};

    /// `<p>{hole} clicks</p>` — the case §3/P6 calls out: one materialised child,
    /// at index 0, even though the hole is written first.
    fn hole_then_text<'a>(allocator: &'a Allocator, interner: &mut Interner<'a>) -> Skeleton<'a> {
        let tag = interner.intern_tag("p");
        let mut skeleton = Skeleton::new_in(allocator, Ns::Html);
        skeleton.nodes.push(SkelNode::Element(SkelElement {
            tag,
            attrs: &[],
            children: (1, 3),
            ns: Ns::Html,
            mat_kids: 1,
        }));
        skeleton.nodes.push(SkelNode::Slot(0));
        skeleton.nodes.push(SkelNode::Text(" clicks"));
        skeleton.parent.extend([NONE, 0, 0]);
        skeleton.mat_ix.extend([0, NONE, 0]);
        skeleton.roots = (0, 1);
        skeleton
    }

    #[test]
    fn a_leading_hole_does_not_shift_the_sibling_walk() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let skeleton = hole_then_text(&allocator, &mut interner);
        skeleton.validate().unwrap();
        assert_eq!(skeleton.mat_ix_of(1), NONE);
        assert_eq!(skeleton.mat_ix_of(2), 0);
        assert_eq!(skeleton.node(0).as_element().unwrap().mat_kids, 1);
    }

    #[test]
    fn validate_rejects_a_mat_ix_that_counted_the_hole() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let mut skeleton = hole_then_text(&allocator, &mut interner);
        skeleton.mat_ix[1] = 0;
        skeleton.mat_ix[2] = 1;
        let error = skeleton.validate().unwrap_err();
        assert!(error.contains("materialises nothing"), "{error}");
    }

    #[test]
    fn validate_rejects_a_mat_kids_count_that_disagrees() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let mut skeleton = hole_then_text(&allocator, &mut interner);
        if let SkelNode::Element(element) = &mut skeleton.nodes[0] {
            element.mat_kids = 2;
        }
        let error = skeleton.validate().unwrap_err();
        assert!(error.contains("mat_kids 2"), "{error}");
    }

    /// A void element and a nested element are the two shapes P1 emits most, and
    /// both have an empty child range that still has to sit after the parent.
    #[test]
    fn empty_and_nested_element_ranges_validate() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let div = interner.intern_tag("div");
        let br = interner.intern_tag("br");
        let mut skeleton = Skeleton::new_in(&allocator, Ns::Html);
        skeleton.nodes.push(SkelNode::Element(SkelElement {
            tag: div,
            attrs: &[],
            children: (1, 2),
            ns: Ns::Html,
            mat_kids: 1,
        }));
        skeleton.nodes.push(SkelNode::Element(SkelElement {
            tag: br,
            attrs: &[],
            children: (2, 2),
            ns: Ns::Html,
            mat_kids: 0,
        }));
        skeleton.parent.extend([NONE, 0]);
        skeleton.mat_ix.extend([0, 0]);
        skeleton.roots = (0, 1);
        skeleton.validate().unwrap();
        assert_eq!(skeleton.children_of(1), (2, 2));
        assert!(interner.tag(br).flags.contains(TagFlags::VOID));
    }

    #[test]
    fn validate_rejects_raw_html_beside_a_sibling() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        let tag = interner.intern_tag("div");
        let mut skeleton = Skeleton::new_in(&allocator, Ns::Html);
        skeleton.nodes.push(SkelNode::Element(SkelElement {
            tag,
            attrs: &[],
            children: (1, 3),
            ns: Ns::Html,
            mat_kids: 1,
        }));
        skeleton.nodes.push(SkelNode::RawHtml("<b>x</b>"));
        skeleton.nodes.push(SkelNode::Text("tail"));
        skeleton.parent.extend([NONE, 0, 0]);
        skeleton.mat_ix.extend([0, NONE, 0]);
        skeleton.roots = (0, 1);
        let error = skeleton.validate().unwrap_err();
        assert!(error.contains("no sibling walk may cross it"), "{error}");
    }

    #[test]
    fn a_multi_root_skeleton_is_a_fragment() {
        let allocator = Allocator::new();
        let mut skeleton = Skeleton::new_in(&allocator, Ns::Html);
        skeleton.nodes.push(SkelNode::Text("a"));
        skeleton.nodes.push(SkelNode::Slot(0));
        skeleton.nodes.push(SkelNode::Text("b"));
        skeleton.parent.extend([NONE, NONE, NONE]);
        skeleton.mat_ix.extend([0, NONE, 1]);
        skeleton.roots = (0, 3);
        skeleton.validate().unwrap();
        assert!(skeleton.is_fragment());
        assert_eq!(skeleton.siblings_of(1), (0, 3));
    }

    #[test]
    fn foreign_content_self_closes_and_html_does_not() {
        assert!(!Ns::Html.self_closes());
        assert!(Ns::Svg.self_closes());
        assert!(Ns::MathMl.self_closes());
    }

    #[test]
    fn tags_that_eat_a_leading_newline_are_flagged() {
        let allocator = Allocator::new();
        let mut interner = Interner::new(&allocator);
        for tag in ["pre", "textarea", "listing"] {
            let id = interner.intern_tag(tag);
            assert!(
                interner.tag(id).flags.contains(TagFlags::PRESERVE_WS),
                "{tag} must be flagged: the parser eats one newline after the open tag"
            );
        }
    }
}
