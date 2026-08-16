//! P8b. DESIGN §5 — the second lowering table over the same `Module`.
//!
//! Target #10 is one sentence: every static byte is escaped at COMPILE time and
//! emitted as a literal chunk of one concatenation, and no DOM operation is
//! performed at all. There is no `template()`, no clone, no walk and no `_el$`;
//! P6's REF PLAN is skipped entirely, because a string has no siblings to walk
//! to. P6's other half — §3.11's compile-time addresses — is not skipped, and is
//! what the two backends are diffed against.
//!
//! The two backends cannot drift because they read the same IR through two
//! total matches: `node` over `SkelNode`, here, and the shared
//! [`crate::codegen::backend::Backend`] over `Op`, which both implement and
//! neither may leave a hole in.
//!
//! Since M6 they also share the CONTROL FLOW. The flow pass runs for both
//! targets, `Op::Region` reaches both, and both expand it through one
//! `dom::region_call` — the string backend passing `(null, null)` where the DOM
//! backend passes the pair its template walk computed. `uninlinable_flow` and
//! the whole-module downgrade it drove are gone with that.

use oxc::allocator::{Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, Expression, IdentifierName, JSXAttributeItem, JSXAttributeValue, JSXChild,
    JSXElement, JSXExpression, JSXFragment, ObjectProperty, ObjectPropertyKind, PropertyKey,
    PropertyKind, SpreadElement, StringLiteral, TemplateElement, TemplateElementValue,
    TemplateLiteral,
};
use oxc::span::{GetSpan, Span};

use crate::codegen::backend::{At, Backend, lower};
use crate::codegen::{Emit, Helper};
use crate::ir::{
    Anchor, Chan, Diff, ExprId, Flow, HandlerRef, InsertPlan, NONE, NameId, NodeId, Ns, Op,
    RegionId, Root, Site, SkelAttrValue, SkelNode, SlotId, TagFlags, Unit, tag_flags,
};
use crate::lower::entity;
use crate::lower::jsx::{attribute_expression, attribute_name, expression_of, intrinsic_tag};
use crate::lower::{names, text};

/// §3.11's branch instruction, at a hole rather than at a branch: a hole has no
/// key to write, so the open comment carries none. `ssr.ts` spells the same
/// three constants — one for the DOM's insert anchor and two for a range — and
/// `packages/core/src/hydration.ts` reads them back. Three places, one format,
/// and `test/hydration.test.ts` asserts the compiler's bytes against the
/// runtime's reader rather than against a copy of this string.
const OPEN_HOLE: &str = "<!--[-->";
const CLOSE: &str = "<!--]-->";
const MARKER: &str = "<!---->";

/// One program-level root. The result is branded `SsrHtml` so a hole can tell
/// markup the compiler produced from user data it has to escape — the whole
/// XSS question, answered once, at the only place the answer is knowable.
pub fn emit_unit_root<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    span: Span,
) -> Expression<'a> {
    let mut chunks = Chunks::new();
    unit_into(ctx, unit, &mut chunks);
    chunks.finish_root(ctx, span)
}

/// A root P1 refused: a fragment, or markup the HTML parser reshapes. The
/// reshaping is a fact about PARSING and no parser runs here, so the string
/// backend serialises it directly instead of falling back to `createElement`.
pub fn emit_verbatim_root<'a>(
    ctx: &mut Emit<'a, '_>,
    expression: Expression<'a>,
) -> Expression<'a> {
    let span = expression.span();
    let mut chunks = Chunks::new();
    value_into(ctx, &mut chunks, expression);
    chunks.finish_root(ctx, span)
}

// ── the chunk stream ─────────────────────────────────────────────────────

/// The quasis and holes of the single template literal a unit becomes. Static
/// bytes accumulate into the open quasi; a hole closes it and opens the next.
struct Chunks<'a> {
    quasis: Vec<String>,
    exprs: Vec<Expression<'a>>,
    /// Set while the stream is exactly one hole holding known `SsrHtml`, so a
    /// component that IS the whole root skips a wrap and an unwrap.
    passthrough: bool,
}

impl<'a> Chunks<'a> {
    fn new() -> Self {
        Self { quasis: vec![String::new()], exprs: Vec::new(), passthrough: false }
    }

    fn text(&mut self, text: &str) {
        if !text.is_empty() {
            self.passthrough = false;
            self.quasis.last_mut().expect("one quasi is always open").push_str(text);
        }
    }

    /// Bytes that came from a skeleton TEXT run. They are already escaped for
    /// markup, with one exception: the DOM path never had to spell a no-break
    /// space, because the parser reads the raw byte and the serialiser writes
    /// `&nbsp;` back out. Nothing re-serialises the wire, so the escape happens
    /// here — and `esc` does the same at runtime, which is what keeps the
    /// compiled bytes and the oracle's identical.
    ///
    /// An ATTRIBUTE value does NOT take this: the serialiser behind
    /// `renderToString` leaves a no-break space raw there, and the two
    /// spellings parse to the same character.
    fn escaped(&mut self, text: &str) {
        match text.find('\u{a0}') {
            None => self.text(text),
            Some(_) => {
                let replaced = text.replace('\u{a0}', "&nbsp;");
                self.text(&replaced);
            }
        }
    }

    fn hole(&mut self, expression: Expression<'a>) {
        self.passthrough = false;
        self.push(expression);
    }

    /// A hole whose value is already `SsrHtml`: interpolating it calls its
    /// `toString`, so no `esc` is needed and none is emitted.
    fn markup(&mut self, expression: Expression<'a>) {
        self.passthrough = self.exprs.is_empty() && self.quasis.iter().all(|q| q.is_empty());
        self.push(expression);
    }

    fn push(&mut self, expression: Expression<'a>) {
        self.exprs.push(expression);
        self.quasis.push(String::new());
    }

    fn literal(self, ctx: &Emit<'a, '_>, span: Span) -> Expression<'a> {
        let last = self.quasis.len() - 1;
        let mut quasis = Vec::with_capacity(self.quasis.len());
        for (index, text) in self.quasis.iter().enumerate() {
            let text: &'a str = ctx.allocator.alloc_str(text);
            let raw = crate::codegen::mappings::template_raw(text, ctx.allocator);
            quasis.push(TemplateElement::new(
                span,
                TemplateElementValue { raw: raw.into(), cooked: Some(text.into()) },
                index == last,
                &ctx.ast,
            ));
        }
        Expression::TemplateLiteral(TemplateLiteral::boxed(
            span,
            ArenaVec::from_iter_in(quasis, &ctx.allocator),
            ArenaVec::from_iter_in(self.exprs, &ctx.allocator),
            &ctx.ast,
        ))
    }

    fn finish_root(mut self, ctx: &mut Emit<'a, '_>, span: Span) -> Expression<'a> {
        if self.passthrough && self.exprs.len() == 1 {
            return self.exprs.pop().expect("checked");
        }
        let literal = self.literal(ctx, span);
        let callee = ctx.helper(Helper::Html, span);
        ctx.call(callee, vec![Argument::from(literal)], span)
    }
}

// ── the skeleton serialiser ──────────────────────────────────────────────

fn unit_into<'a>(ctx: &mut Emit<'a, '_>, unit: &mut Unit<'a>, chunks: &mut Chunks<'a>) {
    let (lo, hi) = unit.skeleton.roots;
    for node in lo..hi {
        node_into(ctx, unit, chunks, node);
    }
}

/// The `SkelNode` half of the lowering table. `serialize_dom` writes the same
/// bytes; the two rules that differ are stated where they differ.
fn node_into<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    node: NodeId,
) {
    match *unit.skeleton.node(node) {
        SkelNode::Text(text) => chunks.escaped(text),
        // Raw html is bytes the author asked for verbatim; nothing re-escapes it.
        SkelNode::RawHtml(text) => chunks.text(text),
        // A `<!---->` is a DOM insert anchor and means nothing on the wire —
        // unless the wire is going to be CLAIMED. The client's walk addresses
        // the template's skeleton, and this comment is a node in it; leaving it
        // out would make the server's logical child list one shorter than the
        // list the emitted `child`/`sib` indices were computed against, at
        // exactly the positions where two holes sit side by side.
        SkelNode::Marker(_) if ctx.hydratable => chunks.text(MARKER),
        SkelNode::Marker(_) | SkelNode::Empty => {}
        // A slot produces NOTHING in the template and terminates a chunk here.
        SkelNode::Slot(slot) => slot_into(ctx, unit, chunks, slot),
        SkelNode::Element(_) => element_into(ctx, unit, chunks, node),
    }
}

fn element_into<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    node: NodeId,
) {
    let element = *unit.skeleton.node(node).as_element().expect("checked by the caller");
    let row = ctx.module.interner.tag(element.tag);
    let (tag, flags) = (row.text, row.flags);

    chunks.text("<");
    chunks.text(tag);
    open_tag(ctx, unit, chunks, node, tag);

    let (lo, hi) = element.children;
    if flags.contains(TagFlags::VOID) {
        chunks.text(">");
        return;
    }
    if lo == hi && element.ns.self_closes() && content_patch(ctx, unit, node).is_none() {
        chunks.text("/>");
        return;
    }
    chunks.text(">");

    // O9, and the one place the two serialisers reason differently. The DOM
    // rule looks PAST leading slots because a slot materialises nothing at
    // parse time; here a slot writes real BYTES whose first one the compiler
    // cannot see, and the parser reading this markup eats it.
    if flags.contains(TagFlags::PRESERVE_WS) && leading_newline_is_eaten(ctx, unit, node) {
        chunks.text("\n");
    }

    if let Some(index) = content_patch(ctx, unit, node) {
        let patch = unit.patch[index];
        let mut backend = Ssr { ctx, unit, chunks, place: Place::Content };
        lower(&mut backend, At::one(patch));
    }

    for child in lo..hi {
        node_into(ctx, unit, chunks, child);
    }
    chunks.text("</");
    chunks.text(tag);
    chunks.text(">");
}

/// Whether the parser reading this markup will eat the first byte the element's
/// content writes, so the compiler owes it a newline of its own to lose instead.
///
/// "in body" ignores one U+000A directly after `<pre>`, `<textarea>` and
/// `<listing>`, and it ignores it whatever the next character turns out to be.
/// So a hole is always guarded: its value is bytes the compiler cannot see, and
/// a value that begins with a newline — or one that renders empty, leaving the
/// literal behind it against the tag — is otherwise a character the client keeps
/// and the server drops. `browser-parse-check.ts` measures both halves in real
/// Chrome.
fn leading_newline_is_eaten(ctx: &Emit<'_, '_>, unit: &Unit<'_>, node: NodeId) -> bool {
    if content_patch(ctx, unit, node).is_some() {
        return true;
    }
    let (lo, hi) = unit.skeleton.node(node).as_element().expect("checked by the caller").children;
    (lo..hi)
        .find_map(|child| match *unit.skeleton.node(child) {
            // Neither writes a byte here, so the question passes to the next
            // child — where the DOM serialiser's rule stops at a `Marker`,
            // because there it really is the token the parser sees first.
            SkelNode::Marker(_) | SkelNode::Empty => None,
            SkelNode::Text(text) | SkelNode::RawHtml(text) if text.is_empty() => None,
            SkelNode::Text(text) | SkelNode::RawHtml(text) => Some(text.starts_with('\n')),
            SkelNode::Slot(_) => Some(true),
            SkelNode::Element(_) => Some(false),
        })
        .unwrap_or(false)
}

/// The patch that owns the element's CHILD position instead of an attribute.
/// `createElement` applies props before it appends children, so P1 refuses to
/// inline an element carrying both — which is what lets this own the position.
fn content_patch(ctx: &Emit<'_, '_>, unit: &Unit<'_>, node: NodeId) -> Option<usize> {
    unit.patch.iter().position(|patch| {
        if patch.target != node {
            return false;
        }
        match patch.op {
            Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => {
                names::replaces_children(ctx.module.interner.name(name).text)
            }
            _ => false,
        }
    })
}

// ── the opcode lowering table ────────────────────────────────────────────

/// Everything between `<tag` and `>`. Static attributes come from the skeleton
/// and dynamic ones from the patch program; both carry the position the author
/// wrote them at, and they are interleaved back into it.
fn open_tag<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    node: NodeId,
    tag: &'a str,
) {
    let element = *unit.skeleton.node(node).as_element().expect("checked by the caller");
    let content = content_patch(ctx, unit, node);

    let mut items: Vec<(u32, Item)> = Vec::new();
    for (index, attr) in element.attrs.iter().enumerate() {
        items.push((attr.order, Item::Baked(index)));
    }
    for index in 0..unit.patch.len() {
        if unit.patch[index].target != node || Some(index) == content {
            continue;
        }
        match attribute_slot(unit.patch[index].op) {
            // Positioned where the author wrote the name.
            Slot::Named(name) => {
                items.push((attribute_order(unit, node, name), Item::Patch(index)))
            }
            // Writes attributes but names none of them, so it goes last — a
            // spread's own keys carry the order inside it.
            Slot::Unnamed => items.push((u32::MAX, Item::Patch(index))),
            Slot::Elsewhere => {}
        }
    }
    items.sort_by_key(|(order, _)| *order);

    // A spread and a named attribute can name the same key, and the two
    // collapse in OPPOSITE directions: a props object keeps the last write and
    // duplicate attributes in markup keep the FIRST. So once a spread is on the
    // element the whole list is written as one object, in source order, and
    // `spreadAttrs` serialises what survives — which is the same answer the DOM
    // backend gets from applying the same list in the same order.
    if items.iter().any(|(_, item)| matches!(item, Item::Patch(index) if matches!(unit.patch[*index].op, Op::Spread { .. })))
    {
        let object = attribute_object(ctx, unit, node, &items);
        let span = unit.spans[node as usize];
        let name = ctx.string(tag, span);
        let callee = ctx.helper(Helper::SpreadAttrs, span);
        let call = ctx.call(callee, vec![Argument::from(object), Argument::from(name)], span);
        chunks.hole(call);
        return;
    }

    // The class arrives in as many pieces as the author wrote (a baked literal,
    // a dynamic `class`, a `classList` object) and markup has exactly one
    // `class=` slot, so the pieces are joined into one `cls(...)` at the
    // position of the first of them.
    let split_class = class_parts(ctx, unit, node);
    let mut emitted_class = false;

    for (_, item) in items {
        match item {
            Item::Baked(index) => {
                let attr = element.attrs[index];
                if split_class.is_some() && is_class(ctx, attr.name) {
                    emit_class(ctx, unit, chunks, node, &mut emitted_class);
                    continue;
                }
                chunks.text(" ");
                chunks.text(ctx.module.interner.name(attr.name).text);
                if let SkelAttrValue::Str(value) = attr.value {
                    chunks.text("=\"");
                    chunks.text(ctx.module.interner.str(value));
                    chunks.text("\"");
                }
            }
            Item::Patch(index) => {
                if split_class.is_some()
                    && patch_name(unit, index).is_some_and(|name| is_class(ctx, name))
                {
                    emit_class(ctx, unit, chunks, node, &mut emitted_class);
                    continue;
                }
                let patch = unit.patch[index];
                let mut backend = Ssr { ctx, unit, chunks, place: Place::OpenTag(tag) };
                lower(&mut backend, At::one(patch));
            }
        }
    }
}

enum Item {
    Baked(usize),
    Patch(usize),
}

/// `name: value`, with a string key wherever the name is not an identifier —
/// `data-kind` and `aria-label` are the common ones.
fn property<'a>(
    ctx: &Emit<'a, '_>,
    name: &'a str,
    value: Expression<'a>,
    span: Span,
) -> ObjectPropertyKind<'a> {
    let key = if crate::lower::jsx::is_identifier_name(name) {
        PropertyKey::StaticIdentifier(ArenaBox::new_in(
            IdentifierName::new(span, name, &ctx.ast),
            &ctx.allocator,
        ))
    } else {
        PropertyKey::StringLiteral(ArenaBox::new_in(
            StringLiteral::new(span, name, None, &ctx.ast),
            &ctx.allocator,
        ))
    };
    ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
        ObjectProperty::new(span, PropertyKind::Init, key, value, false, false, false, &ctx.ast),
        &ctx.allocator,
    ))
}

/// The whole attribute list of a spread-carrying element as ONE object literal,
/// in source order: a literal is a property, a patch is a property holding its
/// expression, a spread is a JS spread. Evaluation order and last-wins collapse
/// are then JavaScript's, which is exactly the rule the DOM backend gets by
/// applying the same list in the same order.
fn attribute_object<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    node: NodeId,
    items: &[(u32, Item)],
) -> Expression<'a> {
    let element = *unit.skeleton.node(node).as_element().expect("checked by the caller");
    let span = unit.spans[node as usize];
    let mut properties = Vec::with_capacity(items.len());
    for (_, item) in items {
        match *item {
            Item::Baked(index) => {
                let attr = element.attrs[index];
                let name = ctx.module.interner.name(attr.name).text;
                let value = match attr.value {
                    SkelAttrValue::Bare => Expression::new_boolean_literal(span, true, &ctx.ast),
                    SkelAttrValue::Str(value) => {
                        let text = ctx.module.interner.str(value);
                        ctx.string(text, span)
                    }
                };
                properties.push(property(ctx, name, value, span));
            }
            Item::Patch(index) => {
                let patch = unit.patch[index];
                let Some(id) = patch.op.value() else { continue };
                let value = take(ctx, unit, id, patch.span);
                match attribute_slot(patch.op) {
                    Slot::Named(name) => {
                        let name = ctx.module.interner.name(name).text;
                        properties.push(property(ctx, name, value, patch.span));
                    }
                    Slot::Unnamed => {
                        properties.push(ObjectPropertyKind::SpreadProperty(ArenaBox::new_in(
                            SpreadElement::new(patch.span, value, &ctx.ast),
                            &ctx.allocator,
                        )))
                    }
                    Slot::Elsewhere => {}
                }
            }
        }
    }
    let properties = ArenaVec::from_iter_in(properties, &ctx.allocator);
    Expression::new_object_expression(span, properties, &ctx.ast)
}

fn attribute_order(unit: &Unit<'_>, node: NodeId, name: u32) -> u32 {
    unit.attr_order
        .iter()
        .find(|(owner, key, _)| *owner == node && *key == name)
        .map_or(u32::MAX, |(_, _, order)| *order)
}

/// Where an op sits between `<tag` and `>`, if it sits there at all.
///
/// This is the DISPATCH, and it is total on purpose. `attribute_call` below is
/// total too, but a total match nothing reaches is not a guarantee: a filter
/// here that quietly dropped an opcode would produce MISSING OUTPUT with no
/// error, which is the exact silence DESIGN §4's "the two backends cannot
/// drift" is supposed to make impossible. A new opcode has to answer in both
/// places or the crate does not compile.
enum Slot {
    /// writes one attribute, positioned by the name the author wrote
    Named(u32),
    /// writes attributes but names none of them
    Unnamed,
    /// writes nothing here — dropped outright, or owned by another position
    Elsewhere,
}

fn attribute_slot(op: Op) -> Slot {
    match op {
        Op::SetOnce { name, .. } | Op::SetLive { name, .. } | Op::SetOpaque { name, .. } => {
            Slot::Named(name)
        }
        Op::Spread { .. } => Slot::Unnamed,
        // Dropped, and no cut is made: `<button class="btn">Bump` stays one
        // contiguous quasi with no empty `""` slot in it.
        Op::Delegate { .. }
        | Op::Listen { .. }
        | Op::SetEvent { .. }
        | Op::Ref { .. }
        | Op::Bind { .. } => Slot::Elsewhere,
        // Owns the child position (`element_into`), or the slot's own position
        // in the child list (`node_into`), or is a grouping marker with no
        // effects to group. `Region` is a child position like `Insert`.
        Op::Insert { .. } | Op::Region { .. } | Op::EffectGroup { .. } => Slot::Elsewhere,
    }
}

fn patch_name(unit: &Unit<'_>, index: usize) -> Option<u32> {
    match attribute_slot(unit.patch[index].op) {
        Slot::Named(name) => Some(name),
        Slot::Unnamed | Slot::Elsewhere => None,
    }
}

/// Which of the three positions on the wire an op is being lowered for. The
/// skeleton walk knows this and the op does not, so it travels with the backend
/// rather than being re-derived per row.
#[derive(Clone, Copy)]
enum Place<'a> {
    /// between `<tag` and `>`
    OpenTag(&'a str),
    /// the element's whole child position, which `innerHTML` and `textContent`
    /// own outright
    Content,
    /// a hole in the child list
    Child,
}

/// P8b's `Backend`. A row writes into the chunk stream rather than returning an
/// expression, because a row is allowed to produce BYTES: a literal style object
/// has one answer the compiler can compute, and computing it is target #3 in the
/// one context where a style really can be folded.
struct Ssr<'a, 'e, 'm, 'u, 'c> {
    ctx: &'e mut Emit<'a, 'm>,
    unit: &'u mut Unit<'a>,
    chunks: &'c mut Chunks<'a>,
    place: Place<'a>,
}

impl<'a> Ssr<'a, '_, '_, '_, '_> {
    /// Reactivity is irrelevant on the wire: the value is read once and
    /// interpolated, so `SetOnce`, `SetLive` and `SetOpaque` are one row.
    fn named(&mut self, at: At<'_>, name: NameId, value: ExprId) {
        let span = at.span();
        let key = self.ctx.module.interner.name(name).text;
        match self.place {
            Place::OpenTag(tag) => {
                attr_row(self.ctx, self.unit, self.chunks, key, value, tag, span);
            }
            Place::Content => self.content(key, value, span),
            Place::Child => unreachable!("a named attribute never owns a child position"),
        }
    }

    /// `content(key, value)` — the helper that decides between `innerHTML` and
    /// escaped text, which is the same decision `setProp` makes on the client.
    fn content(&mut self, key: &'a str, value: ExprId, span: Span) {
        let value = take(self.ctx, self.unit, value, span);
        let key = self.ctx.string(key, span);
        let callee = self.ctx.helper(Helper::Content, span);
        let call = self.ctx.call(callee, vec![Argument::from(key), Argument::from(value)], span);
        self.chunks.hole(call);
    }

    fn open_tag(&self) -> &'a str {
        match self.place {
            Place::OpenTag(tag) => tag,
            Place::Content | Place::Child => {
                unreachable!("`attribute_slot` sends this op to the open tag and nowhere else")
            }
        }
    }

    /// The tag of `node`, when its content is RAW text — `<script>`, `<style>`.
    /// Escapable raw text (`<textarea>`, `<title>`) is not here: the tokenizer
    /// does decode references inside those, so the ordinary escaper is right.
    fn raw_text_owner(&self, node: NodeId) -> Option<&'a str> {
        let element = self.unit.skeleton.node(node).as_element()?;
        let row = self.ctx.module.interner.tag(element.tag);
        row.flags.contains(TagFlags::RAW_TEXT).then_some(row.text)
    }
}

impl<'a> Backend<'a> for Ssr<'a, '_, '_, '_, '_> {
    /// A row appends to the chunk stream, so there is nothing to hand back.
    type Out = ();

    fn set_once(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan) {
        self.named(at, name, value);
    }

    fn set_live(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan, _diff: Diff) {
        self.named(at, name, value);
    }

    fn set_opaque(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan) {
        self.named(at, name, value);
    }

    fn spread(&mut self, at: At<'_>, value: ExprId, _live: bool) {
        let tag = self.open_tag();
        let span = at.span();
        let value = take(self.ctx, self.unit, value, span);
        let tag = self.ctx.string(tag, span);
        let callee = self.ctx.helper(Helper::SpreadAttrs, span);
        let call = self.ctx.call(callee, vec![Argument::from(value), Argument::from(tag)], span);
        self.chunks.hole(call);
    }

    /// `dangerouslySetInnerHTML` names no attribute, so it owns the child
    /// position outright and `content_patch` is what routes it here.
    /// A hole in the child list. The value's own bytes join this concatenation.
    fn insert(
        &mut self,
        at: At<'_>,
        slot: SlotId,
        _anchor: Anchor,
        value: ExprId,
        _plan: InsertPlan,
    ) {
        match self.place {
            Place::Child => {
                let expression = take(self.ctx, self.unit, value, at.span());
                // Nothing inside `<script>`/`<style>` is ENTITY-escaped, by the
                // tokenizer and by the DOM serialiser alike, so `esc` would
                // corrupt the content instead of protecting it. The owning tag
                // travels with the value so the runtime neutralises the one
                // sequence that would end the element early — and a hole in raw
                // text is never delimited, because a `<!--[-->` there is TEXT.
                if let Some(tag) = self.raw_text_owner(at.target()) {
                    let span = at.span();
                    let owner = self.ctx.string(tag, span);
                    let callee = self.ctx.helper(Helper::RawText, span);
                    let call = self.ctx.call(
                        callee,
                        vec![Argument::from(expression), Argument::from(owner)],
                        span,
                    );
                    self.chunks.hole(call);
                    return;
                }
                // The bytes recovery needs, at a hole, and NOT ONE MORE.
                //
                // A DELIMITED hole pays two comments and each earns its place:
                // the OPEN keeps a dynamic text run from fusing with the static
                // text beside it — `{a}text` parses as one text node without it,
                // and then no index addresses `a` — and the CLOSE is the anchor
                // `insert` claims against, which is what stops the first client
                // write from going through `parent.textContent` and destroying
                // the server's text node.
                //
                // A hole that OWNS its parent's child list pays neither, because
                // both arguments dissolve: nothing is beside it to fuse with,
                // and its extent is every child of the parent, which the client
                // reads off the document. §12's Q4 reversal is what this
                // predicate is for — it is where 4,800 of the 100-row page's
                // 6,416 hydration bytes were.
                let delimited = self.ctx.hydratable
                    && !self.ctx.hole_owns_child_list(self.unit, at.target(), slot);
                if delimited {
                    self.chunks.text(OPEN_HOLE);
                }
                value_into(self.ctx, self.chunks, expression);
                if delimited {
                    self.chunks.text(CLOSE);
                }
            }
            Place::OpenTag(_) | Place::Content => {
                unreachable!("a slot owns its own position in the child list")
            }
        }
    }

    /// A control-flow hole, on the SAME lowered IR the DOM backend reads.
    ///
    /// `region_call` is shared verbatim — one function, one argument order — and
    /// the only difference is the insertion pair, which is `None` here because a
    /// string has no parent to insert into. The primitive answers that by
    /// building its own range, which on this backend is the markup between its
    /// two boundary comments.
    ///
    /// The result is `SsrHtml`, so it is interpolated as MARKUP and never
    /// escaped: it is bytes this compiler produced.
    fn region(&mut self, at: At<'_>, slot: SlotId, _anchor: Anchor, region: RegionId) {
        let span = at.span();
        let mut row = std::mem::replace(
            &mut self.unit.regions[region as usize],
            crate::codegen::dom::empty_region(self.ctx, span),
        );
        row.flags |= self.ctx.region_owns_child_list(self.unit, at.target(), slot);
        let call = crate::codegen::dom::region_call(self.ctx, row, None, span);
        self.chunks.markup(call);
    }

    // ── nothing reaches the wire ──────────────────────────────────────────
    //
    // Not "unhandled": these are decisions. A server render has no element to
    // hang a handler on, no variable to write a ref into, and no effect to
    // group — the client installs all three when it hydrates. Writing them out
    // is what keeps the choice reviewable, and what makes a NEW opcode that
    // needs bytes on the wire impossible to forget.

    fn delegate(&mut self, _at: At<'_>, _event: NameId, _h: HandlerRef, _data: Option<ExprId>) {}

    fn listen(&mut self, _at: At<'_>, _event: NameId, _handler: HandlerRef) {}

    fn set_event(&mut self, _at: At<'_>, _event: NameId, _value: ExprId) {}

    fn set_ref(&mut self, _at: At<'_>, _value: ExprId, _write: bool) {}

    /// The `bind:` channel is a listener plus a property write, and a server
    /// render has neither. The INITIAL value does reach the wire — as the
    /// property's own attribute — and that is M6's hydration work, not this
    /// milestone's; emitting half of it now would put a value on the wire the
    /// client has no claim rule for yet.
    fn bind(&mut self, _at: At<'_>, _prop: NameId, _event: NameId, _value: ExprId) {}

    fn effect_group(&mut self, _at: At<'_>, _len: u16) {}
}

/// `attr(name, value, tag)`, unless the value is a style object every key and
/// value of which is a literal — then the bytes go straight into the quasi.
fn attr_row<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    key: &'a str,
    value: u32,
    tag: &'a str,
    span: Span,
) {
    if key == "style"
        && let Some(css) = unit.exprs.entry_mut(value).src.expression().and_then(fold_style)
    {
        unit.exprs.entry_mut(value).src.take();
        if !css.is_empty() {
            chunks.text(" style=\"");
            let escaped = entity::escape_attribute(&css);
            chunks.text(ctx.allocator.alloc_str(&escaped));
            chunks.text("\"");
        }
        return;
    }
    let call = attr_call(ctx, unit, key, value, tag, span);
    chunks.hole(call);
}

/// `dom.ts::styleToString`, at compile time, for the object it can be computed
/// from. The px class is `tables::css_number_prop`, which `build.rs`
/// regenerates from `dom.ts` — so a table that drifts from the runtime's shows
/// up as wrong pixels in the emitted bytes instead of nowhere at all.
///
/// A string is NOT folded: `applyResolvedProp` writes a string style through
/// `setAttribute` verbatim, and reproducing that here would only move the same
/// bytes, while an object is where the two spellings could disagree.
fn fold_style(value: &Expression<'_>) -> Option<String> {
    use oxc::ast::ast::{ObjectPropertyKind, PropertyKey};

    let Expression::ObjectExpression(object) = value else { return None };
    let mut css = String::new();
    let mut kebab = String::new();
    for property in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
        if property.computed {
            return None;
        }
        let prop = match &property.key {
            PropertyKey::StaticIdentifier(name) => name.name.as_str(),
            PropertyKey::StringLiteral(literal) => literal.value.as_str(),
            _ => return None,
        };
        kebab.clear();
        for (index, byte) in prop.bytes().enumerate() {
            if byte.is_ascii_uppercase()
                && index > 0
                && prop.as_bytes()[index - 1].is_ascii_lowercase()
            {
                kebab.push('-');
            }
            kebab.push(byte.to_ascii_lowercase() as char);
        }
        if !prop.is_ascii() {
            return None;
        }
        // `false`, `null` and `undefined` are skipped by `styleToString`; a `0`
        // never takes a unit however the table classes it.
        let rendered = match &property.value {
            Expression::StringLiteral(literal) => literal.value.to_string(),
            Expression::NumericLiteral(literal) => {
                let raw = literal.raw_str();
                if literal.value == 0.0 || crate::tables::css_number_prop(&kebab) {
                    raw.to_string()
                } else {
                    format!("{raw}px")
                }
            }
            Expression::BooleanLiteral(literal) if !literal.value => continue,
            Expression::NullLiteral(_) => continue,
            Expression::Identifier(identifier) if identifier.name == "undefined" => continue,
            _ => return None,
        };
        if !css.is_empty() {
            css.push(' ');
        }
        css.push_str(&kebab);
        css.push_str(": ");
        css.push_str(&rendered);
        css.push(';');
    }
    Some(css)
}

/// `attr(name, value, tag)`. The TAG travels because one name's answer depends
/// on it: `value` is the dirty value on a form field and reflects to nothing,
/// and is the content attribute everywhere else.
fn attr_call<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    key: &'a str,
    value: u32,
    tag: &'a str,
    span: Span,
) -> Expression<'a> {
    let lean = lean_attribute(key);
    let name = ctx.string(key, span);
    let value = take(ctx, unit, value, span);
    if lean {
        let callee = ctx.helper(Helper::AttrLit, span);
        return ctx.call(callee, vec![Argument::from(name), Argument::from(value)], span);
    }
    let tag = ctx.string(tag, span);
    let callee = ctx.helper(Helper::Attr, span);
    ctx.call(callee, vec![Argument::from(name), Argument::from(value), Argument::from(tag)], span)
}

/// Whether `attrLit` may stand in for `attr` at this call site.
///
/// The name here is a LITERAL the compiler wrote, so everything `attr` derives
/// from it per call is decidable once: the two aliases, the `on…` prefix, the
/// three tables, the element-dependent `value`, and the XML `Name` production
/// `setAttribute` validates against. What is left depends on the value, and
/// that is all `attrLit` does.
///
/// `spreadAttrs` is untouched and still goes through `attr`, which is where the
/// name really is runtime data and where `checkName` has to run.
fn lean_attribute(name: &str) -> bool {
    !crate::tables::attr_intercepts(name) && !name.starts_with("on") && valid_attribute_name(name)
}

/// The XML `Name` production, which is what `setAttribute` refuses on. A JSX
/// attribute name is almost always one, but `attrLit` does not check and a name
/// that is not one has to keep the runtime's check.
fn valid_attribute_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else { return false };
    name_start(first) && chars.all(|ch| name_start(ch) || name_rest(ch))
}

fn name_start(ch: char) -> bool {
    matches!(ch,
        ':' | '_' | 'A'..='Z' | 'a'..='z'
        | '\u{c0}'..='\u{d6}' | '\u{d8}'..='\u{f6}' | '\u{f8}'..='\u{2ff}'
        | '\u{370}'..='\u{37d}' | '\u{37f}'..='\u{1fff}' | '\u{200c}'..='\u{200d}'
        | '\u{2070}'..='\u{218f}' | '\u{2c00}'..='\u{2fef}' | '\u{3001}'..='\u{d7ff}'
        | '\u{f900}'..='\u{fdcf}' | '\u{fdf0}'..='\u{fffd}' | '\u{10000}'..='\u{effff}')
}

fn name_rest(ch: char) -> bool {
    matches!(ch,
        '-' | '.' | '0'..='9' | '\u{b7}' | '\u{300}'..='\u{36f}' | '\u{203f}'..='\u{2040}')
}

fn is_class(ctx: &Emit<'_, '_>, name: u32) -> bool {
    matches!(ctx.module.interner.name(name).text, "class" | "classList")
}

/// `Some` when the element's class really does arrive in more than one piece.
fn class_parts(ctx: &Emit<'_, '_>, unit: &Unit<'_>, node: NodeId) -> Option<()> {
    let mut list = false;
    let mut pieces = 0;
    for attr in unit.skeleton.node(node).as_element()?.attrs {
        if is_class(ctx, attr.name) {
            pieces += 1;
        }
    }
    for index in 0..unit.patch.len() {
        if unit.patch[index].target != node {
            continue;
        }
        let Some(name) = patch_name(unit, index) else { continue };
        if !is_class(ctx, name) {
            continue;
        }
        pieces += 1;
        list |= ctx.module.interner.name(name).text == "classList";
    }
    (list && pieces > 1).then_some(())
}

fn emit_class<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    node: NodeId,
    emitted: &mut bool,
) {
    if *emitted {
        return;
    }
    *emitted = true;
    let span = unit.spans[node as usize];
    let call = class_call(ctx, unit, node, span);
    chunks.hole(call);
}

fn class_call<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    node: NodeId,
    span: Span,
) -> Expression<'a> {
    let element = *unit.skeleton.node(node).as_element().expect("an element owns its class");
    let mut arguments: Vec<Argument<'a>> = Vec::new();
    for attr in element.attrs {
        if !is_class(ctx, attr.name) {
            continue;
        }
        if let SkelAttrValue::Str(value) = attr.value {
            let text = ctx.module.interner.str(value);
            let text = decode_entities(ctx, text);
            arguments.push(Argument::from(ctx.string(text, span)));
        }
    }
    for index in 0..unit.patch.len() {
        if unit.patch[index].target != node {
            continue;
        }
        let Some(name) = patch_name(unit, index) else { continue };
        if !is_class(ctx, name) {
            continue;
        }
        let Some(value) = unit.patch[index].op.value() else { continue };
        let at = unit.patch[index].span;
        let mut piece = take(ctx, unit, value, at);
        // `classList` is not `class`: a per-key FUNCTION is called and the
        // result decides, where `classToString` reads the function itself as a
        // truthy key. The two names really do disagree about the same object.
        if ctx.module.interner.name(name).text == "classList" {
            let callee = ctx.helper(Helper::ClsList, at);
            piece = ctx.call(callee, vec![Argument::from(piece)], at);
        }
        arguments.push(Argument::from(piece));
    }
    let callee = ctx.helper(Helper::Cls, span);
    ctx.call(callee, arguments, span)
}

/// The one sequence a raw-text element's content may not contain: the one that
/// ENDS it. There are no entities inside `<script>`/`<style>`, so there is
/// nothing to escape WITH — `</` becomes `<\/`, which the tokenizer reads as
/// ordinary raw text (`</` followed by a non-letter never opens an end tag) and
/// which JS and CSS both read as an identity escape, so a value that reaches
/// here inside a string literal survives verbatim.
///
/// `<!--` goes with it in script data only: it is the sole way into
/// script-data-escaped state, where a following `<script` stops `</script>`
/// from closing the element. In CSS it is a legal CDO token and is left alone.
///
/// `ssr.ts::neutralizeRawText` is the runtime half of exactly this rule.
fn neutralize_raw_text<'a>(ctx: &Emit<'a, '_>, text: &'a str, tag: &str) -> &'a str {
    if !text.contains('<') {
        return text;
    }
    let comments = tag.eq_ignore_ascii_case("script");
    let mut out = String::with_capacity(text.len() + 8);
    let mut rest = text;
    while let Some(at) = rest.find('<') {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        let close = tail.strip_prefix("</").filter(|after| {
            after.len() >= tag.len()
                && after.as_bytes()[..tag.len()].eq_ignore_ascii_case(tag.as_bytes())
        });
        if let Some(after) = close {
            out.push_str("<\\/");
            rest = after;
        } else if comments && let Some(after) = tail.strip_prefix("<!--") {
            out.push_str("<\\!--");
            rest = after;
        } else {
            out.push('<');
            rest = &tail[1..];
        }
    }
    out.push_str(rest);
    if out == text { text } else { ctx.allocator.alloc_str(&out) }
}

/// A baked attribute value is escaped for markup; `cls` re-escapes what it
/// joins, so the piece has to go back to its decoded form first.
fn decode_entities<'a>(ctx: &Emit<'a, '_>, text: &'a str) -> &'a str {
    match entity::decode(text) {
        Some(std::borrow::Cow::Borrowed(same)) => same,
        Some(owned) => ctx.allocator.alloc_str(&owned),
        None => text,
    }
}

// ── holes ────────────────────────────────────────────────────────────────

fn slot_into<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    chunks: &mut Chunks<'a>,
    slot: SlotId,
) {
    // Both opcodes own a child position and are told apart by the value that
    // fills it, never by the position itself — so the search is for the SLOT and
    // the dispatch below is `lower`'s.
    let Some(index) = unit.patch.iter().position(|patch| match patch.op {
        Op::Insert { slot: it, .. } | Op::Region { slot: it, .. } => it == slot,
        _ => false,
    }) else {
        return;
    };
    let patch = unit.patch[index];
    let mut backend = Ssr { ctx, unit, chunks, place: Place::Child };
    lower(&mut backend, At::one(patch));
}

/// One hole. The three cases are the whole escaping policy: markup the compiler
/// produced is spliced or interpolated raw, and EVERYTHING else is escaped.
fn value_into<'a>(ctx: &mut Emit<'a, '_>, chunks: &mut Chunks<'a>, expression: Expression<'a>) {
    // A nested unit: its bytes join this concatenation directly, so no `SsrHtml`
    // is allocated for it and no chunk boundary is spent unwrapping one.
    if let Expression::Identifier(identifier) = &expression
        && let Some(index) = ctx.module.uids.root_index(identifier.name.as_str())
    {
        let span = identifier.span;
        root_into(ctx, chunks, index, span);
        return;
    }
    if matches!(expression, Expression::JSXElement(_) | Expression::JSXFragment(_)) {
        jsx_into(ctx, chunks, expression);
        return;
    }
    // The six string-inlinable flow components, resolved by `SymbolId`. Each
    // returns `SsrHtml`, so the call is interpolated with no `esc` around it.
    let (expression, is_markup) = flow_call(ctx, expression);
    if is_markup {
        chunks.markup(expression);
        return;
    }
    // Everything else is user data until proven otherwise, including a call
    // whose callee the analysis could not resolve. `esc` passes an `SsrHtml`
    // through, so a component compiled by this backend still emits markup.
    let span = expression.span();
    let callee = ctx.helper(Helper::Esc, span);
    let call = ctx.call(callee, vec![Argument::from(expression)], span);
    chunks.hole(call);
}

fn root_into<'a>(ctx: &mut Emit<'a, '_>, chunks: &mut Chunks<'a>, index: u32, span: Span) {
    match std::mem::replace(&mut ctx.module.roots[index as usize], Root::Unit(NONE)) {
        Root::Unit(id) if id != NONE => {
            let empty = Unit::new_in(ctx.allocator, Ns::Html, Site::Nested(span));
            let mut unit = std::mem::replace(&mut ctx.module.units[id as usize], empty);
            unit_into(ctx, &mut unit, chunks);
            ctx.module.units[id as usize] = unit;
        }
        Root::Unit(_) => {}
        Root::Verbatim(expression) => value_into(ctx, chunks, expression),
        Root::Pending(..) => unreachable!("P1 lowers every root it is handed"),
    }
}

/// A control-flow construct the flow pass REFUSED, rewritten to the string
/// implementation of the same component.
///
/// The pass lowers ten constructs to a primitive and never emits a call for
/// them; what reaches here is the shapes it cannot read statically — a spread
/// source, an unreadable `keyed` — and the three §3.4 names as refusals. All
/// thirteen have a string component now, each of them an adapter over the same
/// four primitives, so there is no construct left that could send a module to
/// another backend. `uninlinable_flow` and its eight-component set went with
/// that, and so did the whole-module downgrade behind them.
fn flow_call<'a>(ctx: &mut Emit<'a, '_>, expression: Expression<'a>) -> (Expression<'a>, bool) {
    let Expression::CallExpression(mut call) = expression else { return (expression, false) };
    let flow = callee_flow(ctx, &call.callee)
        // `Match` is an identity function, not a fragment, so its result is a
        // props object a `Switch` reads — never markup, never interpolated.
        .filter(|flow| flow.returns_a_fragment());
    let Some(flow) = flow else {
        return (Expression::CallExpression(call), false);
    };
    if let Some(symbol) = crate::analysis::symbol_of(&ctx.module.scoping, &call.callee) {
        ctx.module.flow_rewrites.push(symbol);
    }
    let span = call.callee.span();
    call.callee = ctx.helper(server_flow(flow), span);
    (Expression::CallExpression(call), true)
}

/// By `SymbolId` for a named import, and by the namespace binding plus the
/// exported name for `import * as core`. The second spelling reaches the SSR
/// backend as `(0, core.For)(props)`: a member tag drops its receiver, so the
/// callee arrives wrapped in a sequence.
fn callee_flow(ctx: &Emit<'_, '_>, callee: &Expression<'_>) -> Option<Flow> {
    match callee {
        Expression::Identifier(_) => crate::analysis::symbol_of(&ctx.module.scoping, callee)
            .and_then(|symbol| ctx.module.env.kind_of(symbol).flow()),
        Expression::ParenthesizedExpression(inner) => callee_flow(ctx, &inner.expression),
        Expression::SequenceExpression(sequence) => callee_flow(ctx, sequence.expressions.last()?),
        Expression::StaticMemberExpression(member) => {
            let object = crate::analysis::symbol_of(&ctx.module.scoping, &member.object)?;
            ctx.module.env.namespace_flow(object, member.property.name.as_str())
        }
        _ => None,
    }
}

/// The string implementation of every construct, with no hole in it. Total on
/// `Flow` by construction — a new construct is a compile error here, which is
/// what stops a fourteenth from quietly acquiring a DOM-only implementation.
///
/// `Suspense` is `Loading` and nothing else, exactly as `components.ts` spells
/// it; `ErrorBoundary` is NOT `Errored`, because its fallback takes the error by
/// value where `Errored`'s takes an accessor.
pub(crate) fn server_flow(flow: Flow) -> Helper {
    match flow {
        Flow::For => Helper::SsrFor,
        Flow::Repeat => Helper::SsrRepeat,
        Flow::Show => Helper::SsrShow,
        Flow::Switch => Helper::SsrSwitch,
        Flow::Match => Helper::SsrMatch,
        Flow::Loading | Flow::Suspense => Helper::SsrLoading,
        Flow::Errored => Helper::SsrErrored,
        Flow::ErrorBoundary => Helper::SsrErrorBoundary,
        Flow::Portal => Helper::SsrPortal,
        Flow::Await => Helper::SsrAwait,
        Flow::Dynamic => Helper::SsrDynamic,
        Flow::Reveal => Helper::SsrReveal,
    }
}

fn take<'a>(ctx: &Emit<'a, '_>, unit: &mut Unit<'a>, id: u32, span: Span) -> Expression<'a> {
    unit.exprs.entry_mut(id).src.take().unwrap_or_else(|| Expression::new_void_0(span, &ctx.ast))
}

// ── JSX P1 refused ───────────────────────────────────────────────────────

fn jsx_into<'a>(ctx: &mut Emit<'a, '_>, chunks: &mut Chunks<'a>, expression: Expression<'a>) {
    match expression {
        Expression::JSXFragment(fragment) => {
            let JSXFragment { children, .. } = fragment.unbox();
            children_into(ctx, chunks, children, None, false);
        }
        Expression::JSXElement(element) => jsx_element_into(ctx, chunks, element, false),
        other => value_into(ctx, chunks, other),
    }
}

fn jsx_element_into<'a>(
    ctx: &mut Emit<'a, '_>,
    chunks: &mut Chunks<'a>,
    element: ArenaBox<'a, JSXElement<'a>>,
    in_svg: bool,
) {
    let Some(tag) = intrinsic_tag(&element.opening_element.name)
        .map(|tag| ctx.allocator.alloc_str(tag) as &'a str)
    else {
        // A component tag the shape pass could not turn into a call. It builds
        // DOM, so it needs a DOM: `esc` serialises the node it returns.
        let built = ctx.create_element_path(Expression::JSXElement(element));
        value_into(ctx, chunks, built);
        return;
    };

    let JSXElement { opening_element, children, .. } = element.unbox();
    let opening = opening_element.unbox();
    let is_svg = in_svg || names::is_svg_tag(tag);
    let flags = tag_flags(tag);

    chunks.text("<");
    chunks.text(tag);
    let mut content: Option<(&'a str, Expression<'a>)> = None;
    // A spread and a named attribute can name the same key, and the props
    // object collapses them LAST-wins where two `name=` in markup collapse
    // FIRST-wins. So once there is a spread the whole attribute list is built
    // as the object `createElement` would have built and written from there —
    // same order, same collapse, one helper call.
    if opening.attributes.iter().any(|item| matches!(item, JSXAttributeItem::SpreadAttribute(_))) {
        let span = opening.span;
        let props = ctx.props(opening.attributes);
        let name = ctx.string(tag, span);
        let callee = ctx.helper(Helper::SpreadAttrs, span);
        let call = ctx.call(callee, vec![Argument::from(props), Argument::from(name)], span);
        chunks.hole(call);
    } else {
        for item in opening.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else {
                unreachable!("checked above")
            };
            let attribute = attribute.unbox();
            let span = attribute.span;
            let raw = attribute_name(&attribute.name, ctx.allocator);
            let name = names::attr_name(raw, is_svg, ctx.allocator);
            if names::replaces_children(name) {
                let value = match attribute.value {
                    Some(value) => attribute_expression(value, &ctx.ast, ctx.allocator),
                    None => Expression::new_boolean_literal(span, true, &ctx.ast),
                };
                content = Some((name, value));
                continue;
            }
            // The same two bakeable shapes P1 puts straight into a skeleton: a
            // literal value and a bare `disabled`. Everything else is a runtime
            // decision `attr` makes, exactly as `setElementAttr` makes it.
            let bakeable = names::bakeable(names::normalize(raw), is_svg, tag);
            match attribute.value {
                None if bakeable && !crate::tables::is_intercepted(names::normalize(raw)) => {
                    chunks.text(" ");
                    chunks.text(name);
                    chunks.text("=\"\"");
                }
                Some(JSXAttributeValue::StringLiteral(literal)) if bakeable => {
                    let text = bake_attribute(ctx, literal.span.source_text(ctx.source));
                    chunks.text(" ");
                    chunks.text(name);
                    chunks.text("=\"");
                    chunks.text(text);
                    chunks.text("\"");
                }
                value => {
                    let key = ctx.string(name, span);
                    let value = match value {
                        Some(value) => attribute_expression(value, &ctx.ast, ctx.allocator),
                        None => Expression::new_boolean_literal(span, true, &ctx.ast),
                    };
                    let mut arguments = vec![Argument::from(key), Argument::from(value)];
                    let helper = if lean_attribute(name) {
                        Helper::AttrLit
                    } else {
                        arguments.push(Argument::from(ctx.string(tag, span)));
                        Helper::Attr
                    };
                    let callee = ctx.helper(helper, span);
                    let call = ctx.call(callee, arguments, span);
                    chunks.hole(call);
                }
            }
        }
    }

    if flags.contains(TagFlags::VOID) {
        chunks.text(">");
        return;
    }
    if children.is_empty() && content.is_none() && is_svg {
        chunks.text("/>");
        return;
    }
    chunks.text(">");

    // O9, for the JSX P1 refused. `<textarea>{value}</textarea>` reaches the
    // wire through here and nowhere else, and it is the shape the rule bites
    // hardest: `createElement` appends the value as a text node, so a client
    // keeps a leading newline that the server's parser would eat.
    if flags.contains(TagFlags::PRESERVE_WS)
        && (content.is_some() || jsx_first_byte_is_eaten(ctx, &children).unwrap_or(false))
    {
        chunks.text("\n");
    }

    if let Some((name, value)) = content {
        let span = value.span();
        let key = ctx.string(name, span);
        let callee = ctx.helper(Helper::Content, span);
        let call = ctx.call(callee, vec![Argument::from(key), Argument::from(value)], span);
        chunks.hole(call);
    }
    let raw_text = flags.contains(TagFlags::RAW_TEXT).then_some(tag);
    children_into(ctx, chunks, children, raw_text, is_svg);
    chunks.text("</");
    chunks.text(tag);
    chunks.text(">");
}

/// [`leading_newline_is_eaten`] over children that are still JSX. `None` is a
/// child that writes no byte, which passes the question to its next sibling.
///
/// No `PRESERVE_WS` tag is a raw-text one, so the bake asked about here is
/// always the escaping one.
fn jsx_first_byte_is_eaten<'a>(ctx: &Emit<'a, '_>, children: &[JSXChild<'a>]) -> Option<bool> {
    children.iter().find_map(|child| match child {
        JSXChild::Text(node) => {
            let cleaned = text::clean(node.span.source_text(ctx.source), ctx.allocator)?;
            Some(bake_text(ctx, cleaned, None).starts_with('\n'))
        }
        JSXChild::Fragment(fragment) => jsx_first_byte_is_eaten(ctx, &fragment.children),
        JSXChild::ExpressionContainer(container) => {
            (!matches!(container.expression, JSXExpression::EmptyExpression(_))).then_some(true)
        }
        JSXChild::Spread(_) => Some(true),
        JSXChild::Element(_) => Some(false),
    })
}

fn children_into<'a>(
    ctx: &mut Emit<'a, '_>,
    chunks: &mut Chunks<'a>,
    children: ArenaVec<'a, JSXChild<'a>>,
    raw_text: Option<&'a str>,
    in_svg: bool,
) {
    for child in children {
        match child {
            JSXChild::Text(node) => {
                let raw = node.span.source_text(ctx.source);
                let Some(cleaned) = text::clean(raw, ctx.allocator) else { continue };
                let baked = bake_text(ctx, cleaned, raw_text);
                if raw_text.is_some() {
                    chunks.text(baked);
                } else {
                    chunks.escaped(baked);
                }
            }
            JSXChild::Element(element) => jsx_element_into(ctx, chunks, element, in_svg),
            JSXChild::Fragment(fragment) => {
                let JSXFragment { children, .. } = fragment.unbox();
                children_into(ctx, chunks, children, raw_text, in_svg);
            }
            JSXChild::ExpressionContainer(container) => {
                let Some(value) = expression_of(container.unbox().expression) else { continue };
                if let Some(owner) = raw_text {
                    // Nothing inside `<script>`/`<style>` is ENTITY-escaped, by
                    // the tokenizer and by the DOM serialiser alike — the owning
                    // tag travels so the runtime can neutralise the one sequence
                    // that would end the element early.
                    let span = value.span();
                    let owner = ctx.string(owner, span);
                    let callee = ctx.helper(Helper::RawText, span);
                    let call =
                        ctx.call(callee, vec![Argument::from(value), Argument::from(owner)], span);
                    chunks.hole(call);
                    continue;
                }
                value_into(ctx, chunks, value);
            }
            JSXChild::Spread(spread) => {
                let spread = spread.unbox();
                value_into(ctx, chunks, spread.expression);
            }
        }
    }
}

/// P1's `bake_attribute`, for the JSX it refused. `raw` still carries its
/// delimiters; a single-quoted source value may hold a `"` the emitted
/// double-quoted attribute cannot.
fn bake_attribute<'a>(ctx: &Emit<'a, '_>, raw: &'a str) -> &'a str {
    let inner = raw.get(1..raw.len().saturating_sub(1)).unwrap_or(raw);
    let decoded = decode_entities(ctx, inner);
    match entity::escape_attribute(decoded) {
        std::borrow::Cow::Borrowed(_) => decoded,
        std::borrow::Cow::Owned(owned) => ctx.allocator.alloc_str(&owned),
    }
}

/// P1's `bake_text`, for the JSX it refused. Same bytes, same reason: the
/// references are resolved once here so the emitted markup never depends on
/// how complete the consuming parser's entity table is.
fn bake_text<'a>(ctx: &Emit<'a, '_>, cleaned: &'a str, raw_text: Option<&'a str>) -> &'a str {
    if let Some(owner) = raw_text {
        // The decode is what makes this dangerous: JSX text cannot hold a bare
        // `<`, but `&lt;/script&gt;` is ordinary JSX text and decodes to the one
        // sequence that ends the element.
        return neutralize_raw_text(ctx, decode_entities(ctx, cleaned), owner);
    }
    let decoded = decode_entities(ctx, cleaned);
    match entity::escape_text(decoded) {
        std::borrow::Cow::Borrowed(_) => decoded,
        std::borrow::Cow::Owned(owned) => ctx.allocator.alloc_str(&owned),
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    fn ssr(source: &str) -> CompileOutput {
        let options = ResolvedOptions { ssr: true, ..ResolvedOptions::with_filename("s.tsx") };
        compile(source, &options).expect("compiles")
    }

    fn dom(source: &str) -> CompileOutput {
        compile(source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles")
    }

    /// Target #10, stated as the property rather than as a shape: the static
    /// bytes are already escaped in the output, the whole unit is ONE
    /// concatenation, and there is no DOM call of any kind left to make.
    #[test]
    fn a_unit_becomes_one_concatenation_with_no_dom_call_in_it() {
        let code = ssr("export const V = () => (\n  <div class=\"card\">\n    <h2>Title &amp; more</h2>\n    <p>{body}</p>\n  </div>\n);\n")
            .code;
        assert!(
            code.contains(
                "_$html(`<div class=\"card\"><h2>Title &amp; more</h2><p>${_$esc(body)}</p></div>`)"
            ),
            "{code}"
        );
        for dom_call in ["_$template", "_$insert", "_$setProp", "_$createElement", "document."] {
            assert!(!code.contains(dom_call), "{dom_call} in:\n{code}");
        }
        // One template literal, so exactly one pair of backticks.
        assert_eq!(code.matches('`').count(), 2, "{code}");
    }

    /// The static half of the escaping contract. `>` is escaped in text and left
    /// alone in an attribute, `"` the other way round — three contexts, three
    /// tables, and the bytes are in the OUTPUT rather than in a helper call.
    #[test]
    fn static_bytes_are_escaped_at_compile_time_per_context() {
        let code = ssr(
            "export const V = () => <p title=\"a &gt; b &amp; &quot;q&quot;\">x &lt; y &amp; z</p>;\n",
        )
        .code;
        assert!(code.contains("title=\"a > b &amp; &quot;q&quot;\""), "{code}");
        assert!(code.contains(">x &lt; y &amp; z<"), "{code}");
        // Nothing was punted to a runtime escaper.
        assert!(!code.contains("_$esc"), "{code}");
    }

    /// A raw-text element decodes nothing and escapes nothing, in both
    /// directions: the tokenizer would read `&amp;` inside `<style>` as four
    /// literal characters, so an escaper there corrupts the stylesheet.
    #[test]
    fn raw_text_content_is_never_escaped_and_escapable_raw_text_is() {
        let code = ssr(
            "export const V = () => <div><style>{\".a::after { content: '>' }\"}</style><textarea>{t}</textarea></div>;\n",
        )
        .code;
        assert!(code.contains("_$rawText("), "{code}");
        // The newline in front of the hole is O9's guard, pinned by
        // `compile::tests::the_string_backend_guards_a_hole_against_the_same_rule`.
        assert!(code.contains("<textarea>\n${_$esc(t)}</textarea>"), "{code}");
    }

    /// A no-break space is the one byte the DOM path never had to spell: the
    /// parser reads it raw and `innerHTML` writes `&nbsp;` back. Nothing
    /// re-serialises the wire, so the compiled chunk has to carry the entity or
    /// it diverges from the oracle byte for byte.
    #[test]
    fn a_no_break_space_reaches_the_wire_as_an_entity() {
        let code = ssr("export const V = () => <p title=\"a\u{a0}b\">x\u{a0}y</p>;\n").code;
        assert!(code.contains(">x&nbsp;y<"), "{code}");
        // Not in an attribute: the serialiser behind `renderToString` leaves it
        // raw there, and both spellings parse to the same character.
        assert!(code.contains("title=\"a\u{a0}b\""), "{code}");
        // The DOM template is untouched: the parser hands the raw byte back.
        assert!(dom("export const V = () => <p>x\u{a0}y</p>;\n").code.contains("x\u{a0}y"));
    }

    /// A dynamic value is escaped by the RUNTIME, because it does not exist at
    /// compile time — and every one of them is, including a call whose callee
    /// the analysis could not resolve. Under-escaping here is an XSS hole on
    /// every page the compiler touches.
    #[test]
    fn every_unresolvable_value_goes_through_the_escaper() {
        let code = ssr(
            "export const V = () => <p title={t()} data-x={whatever()}>{markup()}{listOf()}</p>;\n",
        )
        .code;
        // Neither name is one `attr` decides about, so both take the lean
        // helper and neither needs the tag.
        assert!(code.contains("_$attrLit(\"title\", t())"), "{code}");
        assert!(code.contains("_$attrLit(\"data-x\", whatever())"), "{code}");
        assert!(code.contains("_$esc(markup())"), "{code}");
        assert!(code.contains("_$esc(listOf())"), "{code}");

        // And the tag DOES travel where the name's answer depends on it:
        // `value` is the dirty value on a form field and the content attribute
        // everywhere else, which only `attr` can tell apart.
        let dirty = ssr("export const V = () => <input value={t()} readOnly={r()} />;\n").code;
        assert!(dirty.contains("_$attr(\"value\", t(), \"input\")"), "{dirty}");
        assert!(dirty.contains("_$attr(\"readOnly\", r(), \"input\")"), "{dirty}");

        // A spread is the one place a NAME is runtime data, and it keeps
        // `attr`'s `checkName` — the M6 fix against a hostile key.
        let spread = ssr("export const V = () => <p {...props} />;\n").code;
        assert!(spread.contains("_$spreadAttrs({ ...props }, \"p\")"), "{spread}");
        assert!(!spread.contains("_$attrLit"), "{spread}");
    }

    /// The ten constructs the flow pass lowers reach the SAME primitives on
    /// this backend as on the DOM one — one lowered IR, two emissions — and the
    /// only difference in the emitted call is where `branch` is imported from.
    #[test]
    fn a_lowered_construct_reaches_the_same_primitive_on_both_backends() {
        let source = "import { For, Show, Errored, Portal } from \"@barqjs/core\";\n\
             export const V = () => (\n  <div>\n    <For each={rows}>{(r) => <li>{r.n}</li>}</For>\n\
             <Show when={on}>yes</Show>\n\
             <Errored fallback={(e) => <b>{e().message}</b>}>x</Errored>\n\
             <Portal target={t}>p</Portal>\n  </div>\n);\n";
        let string = ssr(source);
        let nodes = dom(source).code;
        for helper in ["_$branch(", "_$each(", "_$boundary(", "_$portal("] {
            assert!(string.code.contains(helper), "{helper} missing from:\n{}", string.code);
            assert!(nodes.contains(helper), "{helper} missing from the DOM emission:\n{nodes}");
        }
        assert!(string.warnings.is_empty(), "{:?}", string.warnings);
        // Not one `ssr*` component call between them: the pass took the
        // component away, on both targets.
        assert!(!string.code.contains("_$ssr"), "{}", string.code);
        // The one thing that differs is the SOURCE the shared names come from,
        // and the string module imports from the client entry not at all.
        assert!(string.code.contains("branch as _$branch"), "{}", string.code);
        assert!(string.code.contains("from \"@barqjs/core/server\""), "{}", string.code);
        assert!(core_import(&string.code).is_empty(), "{}", string.code);
        assert!(nodes.contains("branch as _$branch"), "{nodes}");
        assert!(!nodes.contains("@barqjs/core/server"), "{nodes}");
    }

    /// What the flow pass REFUSES still has a string answer, and every one of
    /// the thirteen has one: the component call survives and is rewritten to the
    /// adapter over the same four primitives.
    ///
    /// The example is `Dynamic` behind a spread, and it used to be `For`, then
    /// `Show`. Both of those lower now: M10 admits a spread for ten of the
    /// thirteen. What is left is stated in `admits_spread` and none of it is
    /// about spreads — `Dynamic`'s unrecognised props are the RESOLVED
    /// component's rather than the construct's, and `Switch` needs literal
    /// `<Match>` arms it can read (`admits_arms`), which takes `Match` with it.
    #[test]
    fn a_refused_construct_becomes_its_string_component() {
        let code = ssr("import { Dynamic } from \"@barqjs/core\";\n\
             export const V = () => <div><Dynamic {...p}/></div>;\n")
        .code;
        assert!(code.contains("_$ssrDynamic("), "{code}");
        // Markup, so no escaper wraps it.
        assert!(!code.contains("_$esc(_$ssr"), "{code}");
        assert!(code.contains("from \"@barqjs/core/server\""), "{code}");

        // A `Switch` whose arms are not literal `<Match>` elements, which is the
        // refusal no spread work can close.
        let scanned = ssr("import { Switch } from \"@barqjs/core\";\n\
             export const V = () => <div><Switch>{arms.map((a) => a)}</Switch></div>;\n")
        .code;
        assert!(scanned.contains("_$ssrSwitch("), "{scanned}");

        // And the other direction, which is the half that moved: a spread the
        // pass DOES admit reaches the primitive here exactly as it does on the
        // DOM backend, with no adapter between them.
        let lowered = ssr("import { For } from \"@barqjs/core\";\n\
             export const V = () => <div><For {...p}>{(r) => <li>{r.n}</li>}</For></div>;\n")
        .code;
        assert!(lowered.contains("_$each("), "{lowered}");
        assert!(!lowered.contains("_$ssrFor("), "{lowered}");

        let shown = ssr("import { Show } from \"@barqjs/core\";\n\
             export const V = () => <div><Show {...p}>{(r) => <li>{r.n}</li>}</Show></div>;\n")
        .code;
        assert!(shown.contains("_$branch("), "{shown}");
        assert!(!shown.contains("_$ssrShow("), "{shown}");

        // `Match` is an identity function, not a fragment: it returns its own
        // props record and `Switch` reads it, so it is never interpolated as
        // markup and never rewritten at a hole — there is no hole. It builds
        // nothing, touches no DOM and is correct as it stands on either target,
        // which is why the call survives verbatim.
        let switched = ssr("import { Switch, Match } from \"@barqjs/core\";\n\
             export const V = () => <div><Switch {...p}><Match when={o}>a</Match></Switch></div>;\n")
        .code;
        assert!(switched.contains("_$ssrSwitch("), "{switched}");
        assert!(switched.contains("Match(_s$, {"), "{switched}");

        // By SymbolId and never by name.
        let local =
            ssr("const Show = (p) => p.when;\nexport const V = () => <Show when={1} />;\n").code;
        assert!(local.contains("_$esc(Show(_s$, {"), "{local}");
        assert!(!local.contains("_$ssrShow"), "{local}");
    }

    /// The 41.88x row, as a property of the compiler rather than of a benchmark.
    ///
    /// `uninlinable_flow` dropped the WHOLE module to the DOM backend when any
    /// of eight flow components was referenced — one import, and every unrelated
    /// page in the module lost its string backend. It is deleted, and the shape
    /// that used to trigger it is asserted here for all thirteen constructs at
    /// once: the string backend, no `_$template`, and nothing to warn about.
    #[test]
    fn no_construct_sends_the_module_to_another_backend() {
        for name in [
            "For",
            "Repeat",
            "Show",
            "Switch",
            "Match",
            "Loading",
            "Errored",
            "Reveal",
            "Suspense",
            "Await",
            "Portal",
            "Dynamic",
            "ErrorBoundary",
        ] {
            // A SPREAD, so the flow pass refuses and the construct really does
            // reach a component call — which is the position the deleted scan
            // was defending, and the only one where a construct could still
            // want an implementation this backend does not have.
            let source = format!(
                "import {{ {name} }} from \"@barqjs/core\";\n\
                 export const V = () => <div><{name} {{...p}}>x</{name}></div>;\n"
            );
            let out = ssr(&source);
            assert!(out.code.contains("_$html("), "{name}:\n{}", out.code);
            assert!(!out.code.contains("_$template"), "{name}:\n{}", out.code);
            assert!(out.code.contains("@barqjs/core/server"), "{name}:\n{}", out.code);
            assert!(out.warnings.is_empty(), "{name}: {:?}", out.warnings);
        }

        // A local binding of the same name is not the runtime's component at
        // all, and is left exactly as written.
        let local =
            ssr("const Portal = (p) => p.children;\nexport const V = () => <Portal>x</Portal>;\n");
        assert!(local.warnings.is_empty(), "{:?}", local.warnings);
        assert!(local.code.contains("_$html("), "{}", local.code);
        assert!(!local.code.contains("_$ssrPortal"), "{}", local.code);
    }

    /// A fragment and the markup the HTML parser reshapes are both refused by
    /// P1, and both are PARSE facts. No parser runs on a string, so the string
    /// backend serialises them directly instead of building them with
    /// `createElement` and serialising a DOM.
    #[test]
    fn the_jsx_p1_refused_is_serialised_rather_than_built() {
        let code = ssr("export const V = () => <><span>a</span>{x}</>;\n").code;
        assert!(code.contains("_$html(`<span>a</span>${_$esc(x)}`)"), "{code}");
        assert!(!code.contains("_$createElement"), "{code}");

        // A table: the parser would insert a `<tbody>` the oracle never makes,
        // which is why P1 refuses it — and why the string backend does not.
        let code = ssr("export const V = () => <table><tr><td>{x}</td></tr></table>;\n").code;
        assert!(code.contains("<table><tr><td>${_$esc(x)}</td></tr></table>"), "{code}");

        // A spread and a named attribute can name the same key, and the props
        // object collapses LAST-wins where two `name=` in markup collapse
        // FIRST-wins, so the whole list goes through one object.
        let code = ssr("export const V = () => <div {...rest} class=\"c\">x</div>;\n").code;
        assert!(code.contains("_$spreadAttrs({"), "{code}");
        assert!(code.contains("class: \"c\""), "{code}");
    }

    /// A nested unit joins its parent's concatenation directly: no `SsrHtml` is
    /// allocated for it and no chunk boundary is spent unwrapping one.
    #[test]
    fn a_nested_unit_is_spliced_into_the_parent_concatenation() {
        let code = ssr("import { Show } from \"@barqjs/core\";\n\
             export const V = () => <div><Show when={on}><p class=\"y\">yes</p></Show></div>;\n")
        .code;
        // C6: the body is a BLOCK taking a scope, and its unit is spliced into
        // the arrow rather than built as an argument.
        assert!(code.contains("_$block((_s$) => _$html(`<p class=\"y\">yes</p>`))"), "{code}");
        assert!(code.contains("_$html(`<div>${_$branch("), "{code}");
    }

    /// `innerHTML` and its siblings replace the element's CONTENT, so they are
    /// not attributes at all — the DOM path writes a property and the string
    /// path writes the child position.
    #[test]
    fn a_content_replacing_name_owns_the_child_position() {
        let code = ssr("export const V = () => <div innerHTML={html} />;\n").code;
        assert!(code.contains("<div>${_$content(\"innerHTML\", html)}</div>"), "{code}");
    }

    /// A `<!---->` is an insert anchor for a sibling walk. There is no walk, so
    /// there is no marker — and a hole between two literal text runs, which is
    /// the case that forces one on the DOM path, costs nothing here.
    #[test]
    fn no_marker_and_no_walk_survive_into_the_string_backend() {
        let code = ssr("export const V = () => <p>Total: {n} clicks</p>;\n").code;
        assert!(code.contains("<p>Total: ${_$esc(n)} clicks</p>"), "{code}");
        assert!(!code.contains("<!---->"), "{code}");
        assert!(dom("export const V = () => <p>Total: {n} clicks</p>;\n").code.contains("<!---->"));
    }

    /// A raw-text element has no entities, so there is nothing to escape WITH —
    /// the one sequence that must not survive is the one that ENDS the element.
    /// Both halves are here: the value the runtime cannot see travels with its
    /// owning tag, and a literal the compiler CAN see is neutralised in place.
    #[test]
    fn a_raw_text_value_can_never_close_its_own_element() {
        let code = ssr("export const V = () => <div><script>{src}</script></div>;\n").code;
        assert!(code.contains("_$rawText(src, \"script\")"), "{code}");

        // JSX text cannot hold a bare `<`, but this decodes to one — and a
        // literal that would close the element is not baked at all. It travels
        // as a JS STRING through the same seam a hole would, where `rawText`
        // neutralises it. The DOM side then writes a text node no parser reads,
        // so the two backends agree on the character data byte for byte, which
        // a compile-time `<\/style>` in the template would not.
        let baked =
            ssr("export const V = () => <style>a &lt;/style&gt;&lt;img src=x&gt; b</style>;\n")
                .code;
        assert!(baked.contains("_$rawText(\"a </style><img src=x> b\", \"style\")"), "{baked}");
        assert!(!baked.contains("<style>a "), "{baked}");

        // `<!--` is the only route into script-data-escaped state, and it is a
        // legal CDO token in CSS — so script leaves the template for it and
        // style bakes it.
        let script =
            ssr("export const V = () => <script>a &lt;!--&lt;script&gt; b</script>;\n").code;
        assert!(script.contains("_$rawText(\"a <!--<script> b\", \"script\")"), "{script}");
        let style = ssr("export const V = () => <style>a &lt;!-- b</style>;\n").code;
        assert!(style.contains("<style>a <!-- b</style>"), "{style}");
    }

    /// Target #3 in the one context where a style object really can be folded:
    /// markup has one `style=` slot and no CSSOM. The px rule is
    /// `tables::css_number_prop`, regenerated from `dom.ts` — which is what
    /// makes a drifted table visible as wrong bytes instead of nowhere.
    #[test]
    fn a_literal_style_object_folds_with_the_px_rule() {
        let code = ssr(
            "export const V = () => <div style={{ \"z-index\": 2, width: 3, marginTop: 0, color: \"red\" }} />;\n",
        )
        .code;
        assert!(
            code.contains("style=\"z-index: 2; width: 3px; margin-top: 0; color: red;\""),
            "{code}"
        );
        assert!(!code.contains("_$attr"), "{code}");

        // Anything the compiler cannot evaluate stays the runtime's decision.
        let dynamic = ssr("export const V = () => <div style={{ width: w }} />;\n").code;
        assert!(dynamic.contains("_$attr(\"style\","), "{dynamic}");
        let opaque = ssr("export const V = () => <div style={s} />;\n").code;
        assert!(opaque.contains("_$attr(\"style\", s, \"div\")"), "{opaque}");
    }

    /// `import * as core` binds no symbol for `core.For`, so the flow PASS walks
    /// straight past it — a member tag is not an identifier reference and cannot
    /// be resolved to a construct at lowering time. It still reaches a string
    /// implementation, because the rewrite resolves the namespace binding plus
    /// the exported name, and that is now true of all thirteen rather than six.
    #[test]
    fn a_namespace_import_resolves_to_the_same_flow_as_a_named_one() {
        let inlined = ssr("import * as core from \"@barqjs/core\";\n\
             export const V = () => <div><core.For each={r}>{(i) => <b>{i}</b>}</core.For></div>;\n");
        assert!(inlined.code.contains("_$ssrFor("), "{}", inlined.code);
        assert!(!inlined.code.contains("core.For"), "{}", inlined.code);
        assert!(inlined.warnings.is_empty(), "{:?}", inlined.warnings);

        let was_a_fallback = ssr("import * as core from \"@barqjs/core\";\n\
             export const V = () => <div><core.Portal>x</core.Portal></div>;\n");
        assert!(was_a_fallback.code.contains("_$ssrPortal("), "{}", was_a_fallback.code);
        assert!(!was_a_fallback.code.contains("_$template"), "{}", was_a_fallback.code);
        assert!(was_a_fallback.warnings.is_empty(), "{:?}", was_a_fallback.warnings);

        // A member of something that is NOT the runtime namespace is nobody's
        // flow, however it is spelled.
        let local = ssr("const core = { For: (p) => p.children };\n\
             export const V = () => <div><core.For each={r}>x</core.For></div>;\n");
        assert!(!local.code.contains("_$ssrFor"), "{}", local.code);
        assert!(local.warnings.is_empty(), "{:?}", local.warnings);
    }

    /// The import statement the module source contributes, as one line, so an
    /// assertion about a SPECIFIER is not confounded by a helper name that
    /// happens to contain it (`ssrShow as _$ssrShow` contains `Show`).
    fn core_import(code: &str) -> String {
        code.lines()
            .find(|line| line.ends_with("from \"@barqjs/core\";"))
            .unwrap_or_default()
            .to_string()
    }

    /// A rewritten callee leaves its import specifier with no reader, and that
    /// name drags `@barqjs/core`'s whole DOM runtime into a server bundle. It
    /// comes off only when EVERY reference was rewritten.
    #[test]
    fn an_import_whose_every_reference_was_rewritten_comes_off() {
        let gone = ssr("import { Dynamic } from \"@barqjs/core\";\n\
             export const V = () => <div><Dynamic {...p}/></div>;\n")
        .code;
        assert!(gone.contains("_$ssrDynamic("), "{gone}");
        // The SPECIFIER is what has to come off, not the whole import: since
        // `codegen::brand`, every component declaration carries `_$block`,
        // which is a shared-ABI helper and lives in the module source, so the
        // import itself survives with one specifier that is not `Show`.
        assert!(!core_import(&gone).contains("Dynamic"), "{gone}");

        // One reader left is one reader too many.
        let kept = ssr("import { Dynamic } from \"@barqjs/core\";\n\
             const alias = Dynamic;\n\
             export const V = () => <div><Dynamic {...p}/></div>;\n")
        .code;
        assert!(core_import(&kept).contains("Dynamic"), "{kept}");

        // And a binding the backend never rewrote is untouched.
        let other = ssr("import { Dynamic, signal } from \"@barqjs/core\";\n\
             export const n = signal(0);\n\
             export const V = () => <div><Dynamic {...p}/></div>;\n")
        .code;
        assert!(core_import(&other).contains("signal"), "{other}");
        assert!(!core_import(&other).contains("Dynamic"), "{other}");
    }

    /// Every fixture in the corpus compiles through the string backend, and
    /// none of them leaves a DOM call in the output. That is the compile-time
    /// half of the dual-render suite: the runtime half diffs the HTML.
    #[test]
    fn every_fixture_compiles_through_the_string_backend() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let (mut compiled, mut fell_back) = (0, 0);
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let name = path.file_name().expect("a name").to_string_lossy().to_string();
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            let options = ResolvedOptions { ssr: true, ..ResolvedOptions::with_filename(&name) };
            let out =
                compile(&source, &options).unwrap_or_else(|errors| panic!("{name}: {errors:?}"));
            if out.code.contains("@barqjs/core/server") {
                // The IMPORT, not a call-shaped substring: a fixture may
                // carry `_$insert(` as literal text, and marker-literal-text
                // deliberately does.
                for helper in
                    ["template as _$", "insert as _$", "setProp as _$", "bindEffect as _$"]
                {
                    assert!(!out.code.contains(helper), "{name}: {helper} in\n{}", out.code);
                }
                compiled += 1;
            } else {
                fell_back += 1;
            }
        }
        assert!(compiled >= 60, "only {compiled} fixtures reached the string backend");
        // ZERO, and this is the assertion M6 exists to make. It read
        // `fell_back > 0` until this milestone — the corpus had to keep
        // exercising the whole-module downgrade, because the downgrade was the
        // only answer eight constructs had. There is no fallback path left to
        // exercise, and a fixture that stopped reaching the string backend
        // would be one that quietly got one back.
        assert_eq!(fell_back, 0, "a fixture did not reach the string backend");
    }
}
