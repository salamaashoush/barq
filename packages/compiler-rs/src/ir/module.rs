use oxc::allocator::Allocator;
use oxc::ast::ast::Expression;
use oxc::semantic::{Scoping, SymbolId};
use oxc::span::Span;
use rustc_hash::{FxHashMap, FxHashSet};

use super::{
    AVec, ExprTable, HoistId, Interner, NONE, NameId, NodeId, Ns, Patch, ReactiveEnv, RefPlan,
    Region, Skeleton, TemplateId, UnitId,
};

pub struct Unit<'a> {
    pub skeleton: Skeleton<'a>,
    pub patch: AVec<'a, Patch>,
    pub exprs: ExprTable<'a>,
    /// The region side table `Op::Region` indexes. Populated by the flow pass,
    /// which moves a row out of [`Module::regions`] the moment a patch claims
    /// it — so a region is owned by exactly one unit, or by the module when it
    /// stands free of any template.
    pub regions: AVec<'a, Region<'a>>,
    /// empty until P6
    pub refs: RefPlan<'a>,
    /// `NodeId` → originating JSX span: an `_el$4` that throws must
    /// land on the element it walked to. P7 turns this into `Skeleton::origin`.
    pub spans: AVec<'a, Span>,
    /// `(element, attribute, source position)` for every attribute P1 could not
    /// bake. P3 needs the position to insert a folded attribute where the author
    /// wrote it; `(element, attribute)` is unique because P1 already collapsed
    /// the duplicates the props object would have.
    pub attr_order: AVec<'a, (NodeId, NameId, u32)>,
    /// assigned by P7; `NONE` until then
    pub template: TemplateId,
    pub site: Site,
}

impl<'a> Unit<'a> {
    pub fn new_in(allocator: &'a Allocator, ns: Ns, site: Site) -> Self {
        Self {
            skeleton: Skeleton::new_in(allocator, ns),
            patch: AVec::new_in(&allocator),
            exprs: ExprTable::new_in(allocator),
            regions: AVec::new_in(&allocator),
            refs: RefPlan::new_in(allocator),
            spans: AVec::new_in(&allocator),
            attr_order: AVec::new_in(&allocator),
            template: NONE,
            site,
        }
    }

    /// Target #2 is this predicate, nothing more.
    #[inline]
    pub fn is_pure_static(&self) -> bool {
        self.patch.is_empty()
    }
}

/// Where the compiled statements may be spliced. Only `Nested` needs an IIFE;
/// every other site emits flat statements — one fewer closure allocation, one
/// fewer stack frame, and far more readable output.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Site {
    Return(Span),
    Init(Span),
    ArrowBody(Span),
    Nested(Span),
}

impl Site {
    #[inline]
    pub fn span(self) -> Span {
        match self {
            Site::Return(span) | Site::Init(span) | Site::ArrowBody(span) | Site::Nested(span) => {
                span
            }
        }
    }

    #[inline]
    pub fn needs_iife(self) -> bool {
        matches!(self, Site::Nested(_))
    }
}

/// One compiled JSX root, in the numbering the placeholder identifiers left in
/// the program use. P1 turns every `Pending` into one of the other two; codegen
/// reads the result and never has to decide anything itself.
pub enum Root<'a> {
    /// Harvested out of the AST, not lowered yet. The [`Site`] is where the
    /// placeholder sits in the program, which is what decides whether P8 may
    /// splice flat statements or has to pay for an IIFE.
    Pending(Expression<'a>, Site),
    /// The template path: an index into [`Module::units`].
    Unit(UnitId),
    /// Refused by P1 — a component, a fragment, or markup the HTML parser
    /// reshapes. Codegen lowers it through `createElement`.
    Verbatim(Expression<'a>),
}

pub struct Module<'a> {
    /// The text every `Span` in the IR indexes into. P4 reads it for JSX text
    /// children, which become JS string literals rather than template bytes.
    pub source: &'a str,
    pub units: AVec<'a, Unit<'a>>,
    /// index == the `N` in the `_jsx$N` placeholder P1 left in the program
    pub roots: AVec<'a, Root<'a>>,
    pub interner: Interner<'a>,
    pub uids: Uids<'a>,
    /// Every template's bytes, concatenated. A template is a contiguous range, so
    /// hashing is one pass over bytes still in L1, and a dedup hit is
    /// `html.truncate(range.0)` — a duplicate leaves no residue.
    pub html: String,
    pub templates: AVec<'a, TemplateRow>,
    /// Parallel to `templates`, and deliberately outside [`TemplateRow`]: these
    /// are emission facts, not content, so nothing here may reach the hash.
    pub template_meta: AVec<'a, TemplateMeta>,
    pub dedup: FxHashMap<u64, TemplateId>,
    /// Templates whose hash slot was already taken by DIFFERENT bytes. The map
    /// is single-valued because a 64-bit collision does not happen for short
    /// strings, but "does not happen" is not "is handled": the loser used to go
    /// unregistered, so a THIRD template identical to it missed the share and
    /// the module grew a duplicate row that nothing could ever collapse. This
    /// vector is empty on every real compile and is scanned only after the probe
    /// misses.
    pub dedup_overflow: Vec<TemplateId>,
    /// Names an expression P3 folded into the template HTML used to read. The
    /// value is now bytes in a `_tmpl$` string, so the binding it came from may
    /// have no reader left; codegen drops the ones that do not.
    pub folded_reads: FxHashSet<&'a str>,
    /// bitset over the 22 `DELEGATED_EVENTS`
    pub delegated: u32,
    pub hoisted: AVec<'a, Hoisted<'a>>,
    /// Every region the flow pass built, in the order it built them, indexed by
    /// the `_g$N` placeholder the shape pass left in the program. A row is
    /// `None` once a unit has claimed it into its own table; what survives here
    /// is the free-standing form — a construct that is a whole root, a prop
    /// value, or nested inside a hole expression — and codegen expands those
    /// with `(parent, anchor) = (null, null)`, which is `flow.ts`'s own
    /// "the caller inserts the anchor I return" path.
    pub regions: AVec<'a, Option<Region<'a>>>,
    /// The compile-time addresses, filled by `passes::address::locate` for
    /// every target. A side table: nothing in lowering, the passes or codegen
    /// reads it, so the emitted code is byte-identical whether it was built or
    /// not — which is what makes the both-ways address diff evidence about the
    /// IR rather than about the artefact.
    pub positions: Vec<crate::ir::Position>,
    pub env: ReactiveEnv<'a>,
    /// oxc's symbol table, detached from the AST it was built against. P0 reads
    /// it in M3; it stays valid across codegen because it holds `SymbolId`s and
    /// owned names, never AST references.
    pub scoping: Scoping,
    pub maps: Mappings,
    /// One entry per reference P8b rewrote from a flow component to its string
    /// implementation. When the count reaches the binding's resolved reference
    /// count, the import specifier has no reader left and comes off — otherwise
    /// a server bundle keeps pulling `@barqjs/core`'s DOM runtime in for a
    /// component nothing calls.
    pub flow_rewrites: Vec<SymbolId>,
    /// A JSX root was written outside every function, so no component parameter
    /// binds the scope name P4 threads through the calls it emits. `install`
    /// answers it with one module-scope binding, `const _s$ = null`.
    ///
    /// `null` is a scope VALUE and not a missing one (`scope.ts`: it is the
    /// parent of a root), so a Block reached this way is invoked, runs, and owns
    /// nothing — it does NOT raise `ScopeMissingError`, which only `undefined`
    /// does. A module-level root therefore produces an ownerless subtree today.
    /// Whether that should instead be `enterRoot()` or a diagnostic is an open
    /// question; what it must not be is described as a throw it is not.
    pub detached_roots: bool,
    /// Every runtime entry point's local name in this module, and which of them
    /// the compiler has already committed to. The names are derived from the
    /// source once, here, because P4 `shape` emits `_$props` and `_$cell` long
    /// before codegen exists to name them — and both stages have to agree, or
    /// the import would not match the call.
    pub helpers: [&'a str; crate::codegen::HELPER_COUNT],
    pub used_helpers: [bool; crate::codegen::HELPER_COUNT],
}

pub struct TemplateRow {
    /// half-open byte range into [`Module::html`]
    pub range: (u32, u32),
    pub ns: Ns,
    pub hash: u64,
}

pub struct TemplateMeta {
    /// the `isSVG` argument: `template(html, true)` wraps the markup in
    /// `<svg xmlns>` and returns its first child
    pub wrapped: bool,
    pub span: Span,
}

/// Names the compiler may emit without colliding with a user binding, and the
/// counters behind them. Held on the module because P6 hands out element names
/// and P8 hands out template names, and both have to agree with the placeholders
/// P1 wrote.
pub struct Uids<'a> {
    element: &'a str,
    template: &'a str,
    root: &'a str,
    handler: &'a str,
    /// The accumulator a fused effect threads through `recompute` (V6), and the
    /// per-slot value it compares against.
    prev: &'a str,
    value: &'a str,
    /// One serialised unit of the analysed IR, for the reference backend.
    ir: &'a str,
    /// The ownership channel. ONE name for every position: a Block declares it
    /// too, so an inner Block shadows an outer one and a component call reaches
    /// the innermost enclosing scope by writing this and nothing else.
    scope: &'a str,
    /// A module-hoisted constant Cell (`_k$N`), deduped module-wide.
    konst: &'a str,
    /// A module-hoisted Block (`_b$N`).
    block: &'a str,
    /// A lowered control-flow region (`_g$N`), standing where the component call
    /// used to, until a patch claims it or codegen expands it in place.
    region: &'a str,
    /// The ordered source list a construct whose props came through a SPREAD
    /// reads them off (`_o$N`).
    ///
    /// It cannot be [`Uids::temp`]. That name's whole invariant is that the flow
    /// pass declares it at the head of a body arrow and reads it in the same
    /// arrow, so a nested declaration shadows an outer one only after the outer
    /// value has been read. A source binding is declared AROUND a body that
    /// declares one too and is read INSIDE it — `Repeat`'s index shift is the
    /// case — so the undecorated name reads the shift's own index and finds a
    /// property on a number. Numbered, and its own base, so neither can happen.
    sources: &'a str,
    next_element: u32,
    next_value: u32,
}

impl<'a> Uids<'a> {
    pub fn new(source: &str, allocator: &'a Allocator) -> Self {
        let [
            element,
            template,
            root,
            handler,
            prev,
            value,
            ir,
            scope,
            konst,
            block,
            region,
            sources,
        ] = free_names(source, allocator);
        Self {
            element,
            template,
            root,
            handler,
            prev,
            value,
            ir,
            scope,
            konst,
            block,
            region,
            sources,
            next_element: 0,
            next_value: 0,
        }
    }

    pub fn region(&self, id: crate::ir::RegionId, allocator: &'a Allocator) -> &'a str {
        numbered(self.region, id + 1, allocator)
    }

    /// The Nth spread source binding of this module. The counter is the shape
    /// pass's own — it is the only thing that mints these — which is also what
    /// keeps this immutable where `value` is not.
    pub fn sources(&self, n: u32, allocator: &'a Allocator) -> &'a str {
        numbered(self.sources, n + 1, allocator)
    }

    /// The prefix is absent from the source text, so no user identifier can
    /// begin with it and this cannot mistake one for a placeholder.
    #[inline]
    pub fn region_index(&self, name: &str) -> Option<crate::ir::RegionId> {
        name.strip_prefix(self.region)
            .and_then(|digits| digits.parse::<u32>().ok())
            .and_then(|value| value.checked_sub(1))
    }

    /// The scope every component takes and every Block declares.
    #[inline]
    pub fn scope(&self) -> &'a str {
        self.scope
    }

    pub fn konst(&self, id: HoistId, allocator: &'a Allocator) -> &'a str {
        numbered(self.konst, id + 1, allocator)
    }

    pub fn block(&self, id: HoistId, allocator: &'a Allocator) -> &'a str {
        numbered(self.block, id + 1, allocator)
    }

    pub fn ir(&self, id: UnitId, allocator: &'a Allocator) -> &'a str {
        numbered(self.ir, id + 1, allocator)
    }

    pub fn handler(&self, id: HoistId, allocator: &'a Allocator) -> &'a str {
        numbered(self.handler, id + 1, allocator)
    }

    #[inline]
    pub fn prev(&self) -> &'a str {
        self.prev
    }

    pub fn value(&mut self, allocator: &'a Allocator) -> &'a str {
        self.next_value += 1;
        numbered(self.value, self.next_value, allocator)
    }

    /// The undecorated `_v$`. A fused effect's locals are always `numbered`, so
    /// this name is minted by nothing else, and one name serves every region:
    /// the flow pass only ever declares it at the head of a body arrow and reads
    /// it in the same arrow, so a nested region's declaration shadows the outer
    /// one at a point where the outer value has already been read.
    #[inline]
    pub fn temp(&self) -> &'a str {
        self.value
    }

    pub fn element(&mut self, allocator: &'a Allocator) -> &'a str {
        self.next_element += 1;
        numbered(self.element, self.next_element, allocator)
    }

    pub fn template(&self, id: TemplateId, allocator: &'a Allocator) -> &'a str {
        numbered(self.template, id + 1, allocator)
    }

    /// Absent from the source text, so a hit on it in the emitted module is
    /// always one of ours. The template-interior segments find the hoisted
    /// declaration by it, after codegen has printed and the arena is no longer
    /// in reach.
    #[inline]
    pub fn template_prefix(&self) -> &'a str {
        self.template
    }

    pub fn root(&self, index: u32, allocator: &'a Allocator) -> &'a str {
        numbered(self.root, index, allocator)
    }

    /// The prefix is absent from the source text, so no user identifier can
    /// begin with it and this cannot mistake one for a placeholder.
    #[inline]
    pub fn root_index(&self, name: &str) -> Option<u32> {
        name.strip_prefix(self.root).and_then(|digits| digits.parse().ok())
    }
}

/// `prefix` + a decimal, built on the stack. One of these exists per emitted
/// binding, and `format!` costs a heap allocation and a formatting machine per
/// call — which shows up, because P6 asks for one per addressed node.
fn numbered<'a>(prefix: &str, value: u32, allocator: &'a Allocator) -> &'a str {
    let mut digits = [0u8; 10];
    let mut at = digits.len();
    let mut rest = value;
    loop {
        at -= 1;
        digits[at] = b'0' + (rest % 10) as u8;
        rest /= 10;
        if rest == 0 {
            break;
        }
    }
    let mut name = String::with_capacity(prefix.len() + digits.len() - at);
    name.push_str(prefix);
    name.push_str(std::str::from_utf8(&digits[at..]).expect("ascii digits"));
    allocator.alloc_str(&name)
}

const UID_BASES: [&str; 12] =
    ["_el$", "_tmpl$", "_jsx$", "_h$", "_p$", "_v$", "_ir$", "_s$", "_k$", "_b$", "_g$", "_o$"];

/// Twelve names the source never mentions. `generate_uid` against a real scope
/// tree is not on oxc 0.143's `Scoping`; only `oxc_traverse`'s
/// `TraverseScoping` has that API.
///
/// Every base opens with `_`, so the underscores are the only positions a
/// collision can start at and one scan answers all of them. A source that spells
/// one is rare enough to be worth no more than the escalating re-scan below.
fn free_names<'a>(source: &str, allocator: &'a Allocator) -> [&'a str; 12] {
    let mut taken = [false; UID_BASES.len()];
    for (at, _) in source.match_indices('_') {
        let rest = &source[at..];
        for (index, base) in UID_BASES.iter().enumerate() {
            taken[index] |= rest.starts_with(base);
        }
    }

    let mut names: [&'a str; UID_BASES.len()] = UID_BASES;
    for index in 0..UID_BASES.len() {
        if !taken[index] {
            continue;
        }
        let mut candidate = UID_BASES[index].to_string();
        loop {
            candidate.push('$');
            if !source.contains(&candidate) {
                break;
            }
        }
        names[index] = allocator.alloc_str(&candidate);
    }
    names
}

pub enum Hoisted<'a> {
    /// module-scope `const _h$1 = (e) => {…}` — capture-free handler
    Handler { id: HoistId, expr: &'a Expression<'a>, span: Span },
    /// module-scope frozen literal for a fully-`Const` spread / style object
    Frozen { id: HoistId, expr: &'a Expression<'a>, span: Span },
    /// module-scope `const _k$1 = () => "w"` — a constant prop Cell.
    ///
    /// Grafted from Uniform Deferral: a proven constant
    /// crosses a component boundary through a module-hoisted deduped thunk, so
    /// a constant prop costs **zero** per-instance allocation. Deduped by the
    /// printed text of the expression, module-wide, which is why `id` is
    /// assigned by the shape pass rather than by position.
    Cell { id: HoistId, expr: &'a Expression<'a>, span: Span },
}

impl Hoisted<'_> {
    #[inline]
    pub fn id(&self) -> HoistId {
        match self {
            Hoisted::Handler { id, .. } | Hoisted::Frozen { id, .. } | Hoisted::Cell { id, .. } => {
                *id
            }
        }
    }
}

/// Three parallel `u32` columns, appended only at semantic boundaries. Byte
/// offsets throughout; line/column conversion runs once at the end against a
/// precomputed line-start table, so the emit loop never does line arithmetic.
///
/// These are the segments oxc's own builder cannot produce, and only those: it
/// records a position per emitted AST node, which covers the statement and
/// expression cases by construction, but a `_$template("…")` is ONE node and
/// the map wants a segment per originating element *inside* its string literal.
/// `gen_off` is a byte offset into the finished output, so the columns are
/// filled after codegen has printed, which is also the only moment those
/// offsets exist.
#[derive(Default)]
pub struct Mappings {
    pub gen_off: Vec<u32>,
    pub src_off: Vec<u32>,
    pub name: Vec<NameId>,
    /// Half-open generated byte ranges of the template literals these segments
    /// address the inside of, ascending and non-overlapping. Only a consumer of
    /// the finished map needs them: a generated line that STARTS inside one is
    /// the continuation of a token, not the start of a statement.
    pub literals: Vec<(u32, u32)>,
}

impl Mappings {
    #[inline]
    pub fn push(&mut self, gen_off: u32, src_off: u32, name: NameId) {
        self.gen_off.push(gen_off);
        self.src_off.push(src_off);
        self.name.push(name);
    }

    /// Appends, unless the previous segment already sits on this generated byte.
    /// A skeleton node that materialises nothing — a `Slot`, and a `Marker` P5
    /// elided — shares its html offset with the node that follows it, and those
    /// bytes belong to whichever node actually wrote them.
    #[inline]
    pub fn push_shadowing(&mut self, gen_off: u32, src_off: u32, name: NameId) {
        if self.gen_off.last() == Some(&gen_off) {
            let last = self.gen_off.len() - 1;
            self.src_off[last] = src_off;
            self.name[last] = name;
            return;
        }
        self.push(gen_off, src_off, name);
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.gen_off.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.gen_off.is_empty()
    }

    /// The `String` and these columns are the parts a `CompilerSession` reuses
    /// across HMR compiles; the arena is reset separately.
    pub fn clear(&mut self) {
        self.gen_off.clear();
        self.src_off.clear();
        self.name.clear();
        self.literals.clear();
    }

    /// Whether `offset` falls strictly inside one of the mapped literals.
    pub fn inside_a_literal(&self, offset: u32) -> bool {
        let next = self.literals.partition_point(|range| range.0 <= offset);
        next > 0 && offset < self.literals[next - 1].1
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.src_off.len() != self.gen_off.len() || self.name.len() != self.gen_off.len() {
            return Err(format!(
                "mapping columns diverge: gen {} src {} name {}",
                self.gen_off.len(),
                self.src_off.len(),
                self.name.len()
            ));
        }
        if self.gen_off.windows(2).any(|pair| pair[0] > pair[1]) {
            return Err("generated offsets are not monotonic".to_string());
        }
        Ok(())
    }
}

/// The precomputed line-start table: byte offset → `(line, column)`, with
/// columns in UTF-16 code units because that is what a source map v3 counts.
///
/// The terminator set is the one a JS engine recognises — U+2028 and U+2029
/// included — and it is not a detail: template HTML is printed inside a string
/// literal, so a paragraph separator in JSX text really does start a new
/// generated line, and a table that disagreed with oxc's would place every
/// later segment on the wrong one.
pub struct LineIndex {
    starts: Vec<u32>,
    /// per line; an all-ASCII line needs no UTF-16 recount
    ascii: Vec<bool>,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let bytes = text.as_bytes();
        let mut starts = Vec::with_capacity(text.len() / 32 + 1);
        let mut ascii = Vec::with_capacity(text.len() / 32 + 1);
        starts.push(0);
        let mut line_is_ascii = true;
        let mut at = 0usize;
        while at < bytes.len() {
            let byte = bytes[at];
            let width = match byte {
                b'\n' => 1,
                b'\r' => usize::from(bytes.get(at + 1) == Some(&b'\n')) + 1,
                0xE2 if matches!(bytes.get(at + 1..at + 3), Some([0x80, 0xA8 | 0xA9])) => 3,
                _ => {
                    line_is_ascii &= byte.is_ascii();
                    at += 1;
                    continue;
                }
            };
            at += width;
            starts.push(at as u32);
            ascii.push(line_is_ascii);
            line_is_ascii = true;
        }
        ascii.push(line_is_ascii);
        Self { starts, ascii }
    }

    /// `offset` must be a char boundary of the same `text` the index was built
    /// from; every caller passes either a `Span` bound or an offset it computed
    /// by counting whole bytes of the template html.
    pub fn locate(&self, text: &str, offset: u32) -> (u32, u32) {
        let line = self.starts.partition_point(|start| *start <= offset).saturating_sub(1);
        let start = self.starts[line] as usize;
        let offset = (offset as usize).min(text.len());
        let column = if self.ascii[line] {
            (offset - start) as u32
        } else {
            text[start..offset].encode_utf16().count() as u32
        };
        (line as u32, column)
    }

    /// Byte offset `line` starts at.
    pub fn line_start(&self, line: u32) -> Option<u32> {
        self.starts.get(line as usize).copied()
    }

    /// Column of the first non-blank character on `line`, or `None` when the
    /// line is blank to its end.
    pub fn indent(&self, text: &str, line: u32) -> Option<u32> {
        let start = *self.starts.get(line as usize)? as usize;
        let end = self.starts.get(line as usize + 1).map_or(text.len(), |next| *next as usize);
        let bytes = &text.as_bytes()[start..end];
        let width = bytes.iter().take_while(|byte| matches!(byte, b' ' | b'\t')).count();
        match bytes.get(width) {
            None | Some(b'\n' | b'\r') => None,
            Some(_) => Some(width as u32),
        }
    }
}

impl<'a> Module<'a> {
    pub fn new_in(allocator: &'a Allocator) -> Self {
        Self::for_source(allocator, "")
    }

    pub fn for_source(allocator: &'a Allocator, source: &'a str) -> Self {
        Self {
            source,
            units: AVec::new_in(&allocator),
            roots: AVec::new_in(&allocator),
            interner: Interner::new(allocator),
            uids: Uids::new(source, allocator),
            html: String::new(),
            templates: AVec::new_in(&allocator),
            template_meta: AVec::new_in(&allocator),
            dedup: FxHashMap::default(),
            dedup_overflow: Vec::new(),
            folded_reads: FxHashSet::default(),
            delegated: 0,
            hoisted: AVec::new_in(&allocator),
            regions: AVec::new_in(&allocator),
            env: ReactiveEnv::new_in(allocator),
            scoping: Scoping::default(),
            maps: Mappings::default(),
            flow_rewrites: Vec::new(),
            positions: Vec::new(),
            detached_roots: false,
            helpers: crate::codegen::helper_names(&crate::codegen::free_sigil(source), allocator),
            used_helpers: [false; crate::codegen::HELPER_COUNT],
        }
    }

    /// Registers a harvested JSX root and returns the index its placeholder
    /// identifier carries.
    pub fn push_root(&mut self, root: Root<'a>) -> u32 {
        let index = self.roots.len() as u32;
        self.roots.push(root);
        index
    }

    #[inline]
    pub fn template_html(&self, id: TemplateId) -> &str {
        let row = &self.templates[id as usize];
        &self.html[row.range.0 as usize..row.range.1 as usize]
    }

    /// A dedup hit leaves no residue: the bytes P7 just appended are truncated
    /// away and the existing `TemplateId` is reused. Target #6 is this, plus a
    /// hash that excludes `Skeleton::origin`.
    pub fn rollback_html(&mut self, start: u32) {
        self.html.truncate(start as usize);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{Chan, Op, SkelNode, TemplateId};

    #[test]
    fn a_unit_with_no_patches_is_the_whole_of_target_two() {
        let allocator = Allocator::new();
        let mut unit = Unit::new_in(&allocator, Ns::Html, Site::Return(Span::default()));
        unit.skeleton.nodes.push(SkelNode::Text("hello"));
        unit.skeleton.parent.push(NONE);
        unit.skeleton.mat_ix.push(0);
        unit.skeleton.roots = (0, 1);
        unit.skeleton.validate().unwrap();
        assert!(unit.is_pure_static());
        assert_eq!(unit.template, NONE);

        unit.patch.push(Patch {
            target: 0,
            span: Span::default(),
            op: Op::SetOpaque { name: 0, value: 0, chan: Chan::Attr },
        });
        assert!(!unit.is_pure_static());
    }

    #[test]
    fn only_a_nested_site_pays_for_an_iife() {
        let span = Span::new(1, 2);
        assert!(!Site::Return(span).needs_iife());
        assert!(!Site::Init(span).needs_iife());
        assert!(!Site::ArrowBody(span).needs_iife());
        assert!(Site::Nested(span).needs_iife());
        assert_eq!(Site::Nested(span).span(), span);
    }

    #[test]
    fn templates_are_ranges_into_one_buffer() {
        let allocator = Allocator::new();
        let mut module = Module::new_in(&allocator);

        let start = module.html.len() as u32;
        module.html.push_str("<div class=\"row\"></div>");
        let end = module.html.len() as u32;
        module.templates.push(TemplateRow { range: (start, end), ns: Ns::Html, hash: 7 });
        module.dedup.insert(7, 0);

        // A second unit serialises to the same bytes: append, hash, hit, rewind.
        let second = module.html.len() as u32;
        module.html.push_str("<div class=\"row\"></div>");
        let hit: Option<TemplateId> = module.dedup.get(&7).copied();
        assert_eq!(hit, Some(0));
        module.rollback_html(second);

        assert_eq!(module.html.len(), end as usize);
        assert_eq!(module.template_html(0), "<div class=\"row\"></div>");
        assert_eq!(module.templates.len(), 1);
    }

    #[test]
    fn mapping_columns_stay_parallel_and_monotonic() {
        let mut maps = Mappings::default();
        assert!(maps.is_empty());
        maps.push(0, 10, 0);
        maps.push(12, 4, 1);
        assert_eq!(maps.len(), 2);
        maps.validate().unwrap();

        maps.gen_off.push(3);
        let error = maps.validate().unwrap_err();
        assert!(error.contains("columns diverge"), "{error}");

        maps.src_off.push(0);
        maps.name.push(0);
        let error = maps.validate().unwrap_err();
        assert!(error.contains("monotonic"), "{error}");

        maps.clear();
        maps.validate().unwrap();
        assert!(maps.is_empty());
    }

    #[test]
    fn a_segment_yields_its_offset_to_the_node_that_wrote_the_bytes() {
        let mut maps = Mappings::default();
        maps.push_shadowing(10, 4, 0);
        // A `Slot` writes nothing, so the text after it starts on the same byte.
        maps.push_shadowing(10, 7, 1);
        maps.push_shadowing(12, 9, 2);
        assert_eq!(maps.gen_off, vec![10, 12]);
        assert_eq!(maps.src_off, vec![7, 9]);
        assert_eq!(maps.name, vec![1, 2]);
        maps.validate().unwrap();
    }

    #[test]
    fn the_line_table_counts_utf16_columns_and_every_js_line_terminator() {
        let text = "abc\ndé\u{2028}f\r\ng\rh";
        let index = LineIndex::new(text);
        let at = |offset: usize| index.locate(text, offset as u32);

        assert_eq!(at(0), (0, 0));
        assert_eq!(at(2), (0, 2));
        // `é` is two bytes and one UTF-16 unit, so the column is not the offset.
        assert_eq!(at(text.find('\u{2028}').unwrap()), (1, 2));
        // U+2028 ends a line for a JS engine, and therefore for the map.
        assert_eq!(at(text.find('f').unwrap()), (2, 0));
        // CRLF is one terminator, CR alone is another.
        assert_eq!(at(text.find('g').unwrap()), (3, 0));
        assert_eq!(at(text.find('h').unwrap()), (4, 0));

        // An astral char costs two UTF-16 units.
        let text = "a\u{1F600}b";
        let index = LineIndex::new(text);
        assert_eq!(index.locate(text, text.find('b').unwrap() as u32), (0, 3));
    }

    #[test]
    fn the_line_table_finds_the_first_token_of_a_line_and_skips_a_blank_one() {
        let text = "const a = 1;\n  return b;\n   \n\tx;\n";
        let index = LineIndex::new(text);
        assert_eq!(index.indent(text, 0), Some(0));
        assert_eq!(index.indent(text, 1), Some(2));
        assert_eq!(index.indent(text, 2), None);
        assert_eq!(index.indent(text, 3), Some(1));
        assert_eq!(index.indent(text, 99), None);
    }

    #[test]
    fn a_hoisted_entry_answers_its_own_id() {
        let allocator = Allocator::new();
        let builder = oxc::ast::builder::AstBuilder::new(&allocator);
        let expr: &Expression =
            allocator.alloc(Expression::new_null_literal(Span::default(), &builder));
        let handler = Hoisted::Handler { id: 1, expr, span: Span::default() };
        let frozen = Hoisted::Frozen { id: 2, expr, span: Span::default() };
        assert_eq!(handler.id(), 1);
        assert_eq!(frozen.id(), 2);
    }
}
