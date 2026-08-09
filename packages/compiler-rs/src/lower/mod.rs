pub(crate) mod entity;
pub(crate) mod jsx;
pub(crate) mod names;
mod parse;
pub(crate) mod text;

use std::borrow::Cow;
use std::collections::VecDeque;

use oxc::allocator::{Allocator, Box as ArenaBox, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    ArrowFunctionExpression, Expression, JSXAttributeItem, JSXAttributeValue, JSXChild, JSXElement,
    JSXExpression, ReturnStatement, VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{
    walk_arrow_function_expression, walk_expression, walk_jsx_attribute_value, walk_jsx_child,
    walk_return_statement, walk_variable_declarator,
};
use oxc::span::{GetSpan, Span};

use crate::ir::{
    Anchor, ExprSrc, InsertPlan, Module, NONE, NameId, NodeId, Ns, Op, Patch, Root, Rx, Site,
    SkelAttr, SkelAttrValue, SkelElement, SkelNode, SlotId, TagFlags, TagId, Unit, UnitId,
    tag_flags,
};
use crate::options::ResolvedOptions;
use jsx::{attribute_expression, attribute_name, expression_of, intrinsic_tag};

/// P1 Lower. Reads the JSX roots [`crate::harvest`] moved out of the program and
/// produces IR: skeletons, patches and expression tables. It builds no output
/// AST, emits no runtime call, and is handed no `Program` — so nothing it does
/// can invalidate a semantic fact, and every unit of the module coexists before
/// a single pass runs.
pub fn lower<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    options: &ResolvedOptions,
    module: &mut Module<'a>,
) {
    let mut lower = Lower {
        allocator,
        ast: AstBuilder::new(allocator),
        source,
        use_templates: options.templates,
        module,
    };
    // Nested JSX inside a hole becomes a root of its own, appended as it is
    // found, so the loop re-reads the length every turn.
    let mut index = 0;
    while index < lower.module.roots.len() {
        lower.root(index as u32);
        index += 1;
    }
}

struct Lower<'a, 'm> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    source: &'a str,
    use_templates: bool,
    module: &'m mut Module<'a>,
}

/// Everything one unit needs while its skeleton is being built. Allocated once
/// per unit rather than once per element, which is what the intermediate `Tmp`
/// tree used to cost.
struct Build<'a> {
    unit: Unit<'a>,
    queue: VecDeque<Group<'a>>,
    attribute_patches: Vec<Patch>,
    insert_patches: Vec<Patch>,
    next_slot: SlotId,
}

struct Group<'a> {
    parent: NodeId,
    children: ArenaVec<'a, JSXChild<'a>>,
    at: parse::Context<'a>,
}

/// One attribute before the baked/dynamic split, still in source order so the
/// last write to a name wins the way the props object does.
struct TmpAttr<'a> {
    key: NameId,
    value: TmpAttrValue<'a>,
    span: Span,
}

impl TmpAttr<'_> {
    fn baked(&self, order: u32) -> Option<SkelAttr> {
        match self.value {
            TmpAttrValue::Baked(value) => Some(SkelAttr { name: self.key, order, value }),
            TmpAttrValue::Dynamic(_) => None,
        }
    }
}

enum TmpAttrValue<'a> {
    Baked(SkelAttrValue),
    Dynamic(Expression<'a>),
}

impl<'a> Build<'a> {
    fn push(&mut self, node: SkelNode<'a>, parent: NodeId, mat_ix: u32, span: Span) -> NodeId {
        let id = self.unit.skeleton.nodes.len() as NodeId;
        self.unit.skeleton.nodes.push(node);
        self.unit.skeleton.parent.push(parent);
        self.unit.skeleton.mat_ix.push(mat_ix);
        self.unit.spans.push(span);
        id
    }

    fn slot(&mut self, parent: NodeId, value: Expression<'a>, span: Span) {
        let slot = self.next_slot;
        self.next_slot += 1;
        self.push(SkelNode::Slot(slot), parent, NONE, span);
        let value = self.unit.exprs.push(ExprSrc::Verbatim(value), span, Rx::OPAQUE);
        // Provisionally a marker with no node behind it yet (DESIGN §3/P1). P5
        // is the only pass that materialises one, and only where no cheaper
        // anchor exists.
        self.insert_patches.push(Patch {
            target: parent,
            span,
            op: Op::Insert { slot, anchor: Anchor::Marker(NONE), value, plan: InsertPlan::Opaque },
        });
    }
}

impl<'a> Lower<'a, '_> {
    fn root(&mut self, index: u32) {
        let taken =
            std::mem::replace(&mut self.module.roots[index as usize], Root::Unit(NONE as UnitId));
        let Root::Pending(expression, site) = taken else {
            self.module.roots[index as usize] = taken;
            return;
        };
        let lowered = match expression {
            Expression::JSXElement(element)
                if self.inlinable(&element, parse::Context::default()) =>
            {
                Root::Unit(self.unit(element, site))
            }
            mut other => {
                // Refused: it stays JSX for codegen's `createElement` path, but
                // the JSX it contains may still hold units.
                self.visit_expression(&mut other);
                Root::Verbatim(other)
            }
        };
        self.module.roots[index as usize] = lowered;
    }

    // ── the inlinability gate ─────────────────────────────────────────────

    /// Whether the HTML parser reproduces this element exactly as
    /// `createElement` would. Everything refused here still renders, through
    /// the un-compiled `createElement` path.
    fn inlinable(&self, element: &JSXElement<'a>, at: parse::Context<'a>) -> bool {
        if !self.use_templates {
            return false;
        }
        let Some(tag) = intrinsic_tag(&element.opening_element.name) else {
            return false;
        };
        if parse::reshapes(tag, at) {
            return false;
        }
        let svg = names::is_svg_tag(tag);
        if at.in_svg {
            // A non-SVG tag closes foreign content in the parser but not in
            // `createElement`, which would move it out of the subtree.
            if !svg {
                return false;
            }
        } else if svg && tag != "svg" && at.parent.is_some() {
            // Only a template ROOT can reach the SVG namespace, via
            // `template(html, true)`.
            return false;
        }
        let has_children = !element.children.is_empty();
        let bad_attribute = element.opening_element.attributes.iter().any(|item| match item {
            JSXAttributeItem::SpreadAttribute(_) => true,
            JSXAttributeItem::Attribute(attribute) => {
                let name = attribute_name(&attribute.name, self.allocator);
                name == "children"
                    || (has_children && names::replaces_children(name))
                    // `multiple` is a DOM_PROP, so it is written AFTER the clone
                    // and the template parses as a single-select — which selects
                    // its first `<option>` on the spot. `createElement` sets the
                    // property before it appends anything, so nothing is
                    // selected there, and the two `selectedIndex`es differ. Only
                    // a real browser has the rule; happy-dom does not.
                    || (has_children && tag == "select" && names::normalize(name) == "multiple")
            }
        });
        if bad_attribute {
            return false;
        }
        self.children_survive_the_parser(element, tag)
    }

    /// The child half of the same question. A void element's children are not
    /// parsed at all, a raw-text element's are not parsed as markup, and a table
    /// context foster-parents its text out of the subtree.
    fn children_survive_the_parser(&self, element: &JSXElement<'a>, tag: &str) -> bool {
        let flags = tag_flags(tag);
        if flags.contains(TagFlags::VOID) {
            return element.children.is_empty();
        }
        let raw = flags.contains(TagFlags::RAW_TEXT);
        let text_only = raw || flags.contains(TagFlags::ESCAPABLE_RAW_TEXT);
        let fosters = parse::fosters_text(tag);
        let rewritten = element.children.iter().any(|child| {
            let JSXChild::Text(text) = child else { return false };
            text::clean(text.span.source_text(self.source), self.allocator).is_some_and(|cleaned| {
                text::rewritten_by_the_tokenizer(self.bake_text(cleaned, raw))
            })
        });
        if rewritten {
            return false;
        }
        if !raw && !text_only && !fosters {
            return !element.children.iter().any(|child| matches!(child, JSXChild::Spread(_)));
        }
        element.children.iter().all(|child| match child {
            JSXChild::Text(text) => {
                let Some(cleaned) = text::clean(text.span.source_text(self.source), self.allocator)
                else {
                    return true;
                };
                if raw && parse::raw_text_hazard(cleaned) {
                    return false;
                }
                !(fosters && cleaned.bytes().any(|byte| !byte.is_ascii_whitespace()))
            }
            // A `<!---->` inside `<style>` is text, not a comment, and the hole
            // would anchor against it forever.
            _ => !text_only && !matches!(child, JSXChild::Spread(_)),
        })
    }

    // ── skeleton construction ─────────────────────────────────────────────

    fn unit(&mut self, element: ArenaBox<'a, JSXElement<'a>>, site: Site) -> UnitId {
        let tag = intrinsic_tag(&element.opening_element.name).expect("checked by inlinable");
        let ns = if names::is_svg_tag(tag) { Ns::Svg } else { Ns::Html };
        let mut build = Build {
            unit: Unit::new_in(self.allocator, ns, site),
            queue: VecDeque::new(),
            attribute_patches: Vec::new(),
            insert_patches: Vec::new(),
            next_slot: 0,
        };

        let root = self.element_node(&mut build, element, NONE, 0, parse::Context::default());
        build.unit.skeleton.roots = (root, root + 1);

        while let Some(group) = build.queue.pop_front() {
            let parent = group.parent;
            let (lo, hi, mat_kids) = self.children(&mut build, group);
            if let SkelNode::Element(element) = &mut build.unit.skeleton.nodes[parent as usize] {
                element.children = (lo, hi);
                element.mat_kids = mat_kids;
            }
        }

        // Attributes before children: `insert` splices nodes, and nothing the
        // attribute patches touch can be invalidated by it.
        let mut unit = build.unit;
        unit.patch.extend(build.attribute_patches);
        unit.patch.extend(build.insert_patches);
        debug_assert_eq!(unit.skeleton.validate(), Ok(()));
        debug_assert_eq!(unit.spans.len(), unit.skeleton.len());

        // In patch order, so a nested unit is numbered where it will be emitted.
        for index in 0..unit.patch.len() {
            let Some(id) = unit.patch[index].op.value() else { continue };
            if let Some(expression) = unit.exprs.entry_mut(id).src.expression_mut() {
                self.visit_expression(expression);
            }
        }

        let id = self.module.units.len() as UnitId;
        self.module.units.push(unit);
        id
    }

    fn element_node(
        &mut self,
        build: &mut Build<'a>,
        element: ArenaBox<'a, JSXElement<'a>>,
        parent: NodeId,
        mat_ix: u32,
        at: parse::Context<'a>,
    ) -> NodeId {
        let JSXElement { span, opening_element, children, .. } = element.unbox();
        let opening = opening_element.unbox();
        let tag = intrinsic_tag(&opening.name).expect("checked by inlinable");
        let is_svg = names::is_svg_tag(tag);
        let inside = at.inside(tag, is_svg);
        let tag_id = self.module.interner.intern_tag(tag);

        let ordered = self.ordered_attributes(opening.attributes, inside.in_svg);
        let mut attrs = ArenaVec::with_capacity_in(ordered.len(), &self.allocator);
        let mut dynamic = Vec::new();
        for (order, attr) in ordered.into_iter().enumerate() {
            let order = order as u32;
            match attr.baked(order) {
                Some(baked) => attrs.push(baked),
                None => {
                    let TmpAttrValue::Dynamic(value) = attr.value else { unreachable!() };
                    dynamic.push((attr.key, value, attr.span, order));
                }
            }
        }

        let node = build.push(
            SkelNode::Element(SkelElement {
                tag: tag_id,
                attrs: attrs.into_arena_slice(),
                children: (0, 0),
                ns: if inside.in_svg { Ns::Svg } else { Ns::Html },
                mat_kids: 0,
            }),
            parent,
            mat_ix,
            span,
        );

        for (name, value, span, order) in dynamic {
            let value = build.unit.exprs.push(ExprSrc::Verbatim(value), span, Rx::OPAQUE);
            build.unit.attr_order.push((node, name, order));
            build.attribute_patches.push(Patch {
                target: node,
                span,
                op: Op::SetOpaque { name, value },
            });
        }

        build.queue.push_back(Group { parent: node, children, at: inside });
        node
    }

    /// `createElement` walks a props OBJECT, so two attributes that normalise
    /// to one DOM name collapse to the LAST one written. Baking the first into
    /// the template and patching the second after the clone would apply them in
    /// the opposite order, and the parser keeps the first duplicate where
    /// `setAttribute` keeps the last.
    fn ordered_attributes(
        &mut self,
        attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
        in_svg: bool,
    ) -> Vec<TmpAttr<'a>> {
        let mut ordered: Vec<TmpAttr<'a>> = Vec::with_capacity(attributes.len());
        for item in attributes {
            let JSXAttributeItem::Attribute(attribute) = item else {
                unreachable!("a spread attribute is refused by inlinable")
            };
            let attribute = attribute.unbox();
            let raw = attribute_name(&attribute.name, self.allocator);
            let bakeable = names::bakeable(names::normalize(raw), in_svg);
            let key =
                self.module.interner.intern_name(names::attr_name(raw, in_svg, self.allocator));
            // `None` once the value is not a literal, once the name may not be
            // baked, and once the parser would not hand these bytes back.
            let baked = match &attribute.value {
                Some(JSXAttributeValue::StringLiteral(literal)) if bakeable => {
                    let text = self.bake_attribute(literal.span.source_text(self.source));
                    (!text::rewritten_by_the_tokenizer(text)).then_some(text)
                }
                _ => None,
            };
            let attr = match attribute.value {
                // A bare attribute is the value `true`. `setElementAttr` writes
                // `key=""` for it, but an INTERCEPTED name never gets there —
                // `classToString(true)` is null, so `<div class/>` REMOVES the
                // attribute the parser would have created.
                None if bakeable && !crate::tables::is_intercepted(names::normalize(raw)) => {
                    TmpAttr {
                        key,
                        value: TmpAttrValue::Baked(SkelAttrValue::Bare),
                        span: attribute.span,
                    }
                }
                None => {
                    let value = Expression::new_boolean_literal(attribute.span, true, &self.ast);
                    TmpAttr { key, value: TmpAttrValue::Dynamic(value), span: attribute.span }
                }
                Some(JSXAttributeValue::StringLiteral(literal)) if baked.is_some() => {
                    let text = baked.expect("checked by the guard");
                    let value = SkelAttrValue::Str(self.module.interner.intern_arena_str(text));
                    TmpAttr { key, value: TmpAttrValue::Baked(value), span: literal.span }
                }
                // A JSX attribute string is not a JS string: backslashes are
                // literal and character references ARE resolved, by the
                // transform rather than by the parser. Down the template
                // channel the HTML parser resolves them; down the patch channel
                // nothing would, so the reference is resolved here and the
                // decoded text is what `setProp` is handed — which is what the
                // un-compiled path passes.
                Some(JSXAttributeValue::StringLiteral(literal)) if literal.value.contains('&') => {
                    let span = literal.span;
                    let text = entity::decode(literal.value.as_str())
                        .map_or(literal.value.as_str(), |decoded| {
                            self.allocator.alloc_str(&decoded)
                        });
                    let value = Expression::new_string_literal(span, text, None, &self.ast);
                    TmpAttr { key, value: TmpAttrValue::Dynamic(value), span }
                }
                Some(value) => {
                    let span = value.span();
                    let value = attribute_expression(value, &self.ast);
                    TmpAttr { key, value: TmpAttrValue::Dynamic(value), span }
                }
            };
            if let Some(previous) = ordered.iter().position(|entry| entry.key == key) {
                ordered.remove(previous);
            }
            ordered.push(attr);
        }
        ordered
    }

    fn children(&mut self, build: &mut Build<'a>, group: Group<'a>) -> (NodeId, NodeId, u32) {
        let Group { parent, children, at } = group;
        let lo = build.unit.skeleton.nodes.len() as NodeId;
        let mut materialised = 0u32;
        let raw_text = self
            .module
            .interner
            .tag(self.parent_tag(build, parent))
            .flags
            .contains(TagFlags::RAW_TEXT);

        for child in children {
            match child {
                JSXChild::Text(text) => {
                    let span = text.span;
                    let raw = span.source_text(self.source);
                    let Some(cleaned) = text::clean(raw, self.allocator) else { continue };
                    let text = self.bake_text(cleaned, raw_text);
                    build.push(SkelNode::Text(text), parent, materialised, span);
                    materialised += 1;
                }
                JSXChild::Element(element) if self.inlinable(&element, at) => {
                    self.element_node(build, element, parent, materialised, at);
                    materialised += 1;
                }
                JSXChild::Element(element) => {
                    let span = element.span;
                    build.slot(parent, Expression::JSXElement(element), span);
                }
                JSXChild::Fragment(fragment) => {
                    let span = fragment.span;
                    build.slot(parent, Expression::JSXFragment(fragment), span);
                }
                JSXChild::ExpressionContainer(container) => {
                    if let Some(value) = expression_of(container.unbox().expression) {
                        let span = value.span();
                        build.slot(parent, value, span);
                    }
                }
                JSXChild::Spread(_) => unreachable!("refused by inlinable"),
            }
        }

        (lo, build.unit.skeleton.nodes.len() as NodeId, materialised)
    }

    fn parent_tag(&self, build: &Build<'a>, parent: NodeId) -> TagId {
        match build.unit.skeleton.node(parent) {
            SkelNode::Element(element) => element.tag,
            _ => unreachable!("only an element owns a child group"),
        }
    }

    // ── compile-time escaping ─────────────────────────────────────────────

    /// Bytes for a template text node: references resolved once here, then
    /// re-escaped minimally, so the emitted markup never depends on how complete
    /// the consuming parser's entity table is. Raw-text elements
    /// (`<script>`/`<style>`) resolve nothing at parse time, so their decoded
    /// text goes in verbatim.
    fn bake_text(&self, cleaned: &'a str, raw_text: bool) -> &'a str {
        if raw_text {
            if !cleaned.contains('&') {
                return cleaned;
            }
            let Some(decoded) = entity::decode(cleaned) else { return cleaned };
            return self.allocator.alloc_str(&decoded);
        }
        // A `>` needs escaping even in text that resolves no reference at all,
        // so the cheap "no `&`, nothing to do" exit cannot stand on its own.
        if !cleaned.contains('&') {
            let escaped = entity::escape_text(cleaned);
            return match escaped {
                Cow::Borrowed(_) => cleaned,
                Cow::Owned(owned) => self.allocator.alloc_str(&owned),
            };
        }
        let Some(decoded) = entity::decode(cleaned) else { return cleaned };
        let escaped = entity::escape_text(&decoded);
        if escaped == cleaned { cleaned } else { self.allocator.alloc_str(&escaped) }
    }

    /// `raw` still carries its delimiters; a single-quoted source value may hold
    /// a `"` that the emitted double-quoted attribute cannot.
    fn bake_attribute(&self, raw: &'a str) -> &'a str {
        let inner = raw.get(1..raw.len().saturating_sub(1)).unwrap_or(raw);
        if let Some(decoded) = entity::decode(inner) {
            let escaped = entity::escape_attribute(&decoded);
            return if escaped == inner { inner } else { self.allocator.alloc_str(&escaped) };
        }
        if inner.contains('"') {
            return self.allocator.alloc_str(&inner.replace('"', "&quot;"));
        }
        inner
    }

    fn placeholder(&mut self, taken: Expression<'a>, span: Span, site: Site) -> Expression<'a> {
        let index = self.module.push_root(Root::Pending(taken, site));
        let name = self.module.uids.root(index, self.allocator);
        Expression::new_identifier(span, name, &self.ast)
    }

    /// Replaces an inlinable JSX root with a placeholder, recording where it
    /// sat. A row callback written `(item) => <li>…</li>` is the shape that
    /// matters most: splicing there deletes one closure and one call PER ROW.
    fn capture(&mut self, it: &mut Expression<'a>, site: fn(Span) -> Site) -> bool {
        let mut inner = &*it;
        while let Expression::ParenthesizedExpression(parens) = inner {
            inner = &parens.expression;
        }
        let Expression::JSXElement(element) = inner else { return false };
        if !self.inlinable(element, parse::Context::default()) {
            return false;
        }
        let span = it.span();
        let mut taken = it.take_in(&self.allocator);
        while let Expression::ParenthesizedExpression(parens) = taken {
            taken = parens.unbox().expression;
        }
        *it = self.placeholder(taken, span, site(span));
        true
    }
}

/// The scan over everything P1 does NOT own as skeleton: hole expressions, and
/// the interior of refused JSX. Every inlinable element it finds becomes a root
/// of its own, so a component's children still compile to templates.
impl<'a> VisitMut<'a> for Lower<'a, '_> {
    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if self.capture(it, Site::Nested) {
            return;
        }
        walk_expression(self, it);
    }

    fn visit_return_statement(&mut self, it: &mut ReturnStatement<'a>) {
        if let Some(argument) = &mut it.argument
            && self.capture(argument, Site::Return)
        {
            return;
        }
        walk_return_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &mut VariableDeclarator<'a>) {
        if let Some(init) = &mut it.init
            && self.capture(init, Site::Init)
        {
            return;
        }
        walk_variable_declarator(self, it);
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        if let Some(body) = it.body.as_expression_mut() {
            self.capture(body, Site::ArrowBody);
        }
        walk_arrow_function_expression(self, it);
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::Element(element) = it
            && self.inlinable(element, parse::Context::default())
        {
            let span = element.span;
            let JSXChild::Element(element) = it.take_in(&self.allocator) else { unreachable!() };
            let placeholder =
                self.placeholder(Expression::JSXElement(element), span, Site::Nested(span));
            *it = JSXChild::new_expression_container(
                span,
                JSXExpression::from(placeholder),
                &self.ast,
            );
            return;
        }
        walk_jsx_child(self, it);
    }

    fn visit_jsx_attribute_value(&mut self, it: &mut JSXAttributeValue<'a>) {
        if let JSXAttributeValue::Element(element) = it
            && self.inlinable(element, parse::Context::default())
        {
            let span = element.span;
            let JSXAttributeValue::Element(element) = it.take_in(&self.allocator) else {
                unreachable!()
            };
            let placeholder =
                self.placeholder(Expression::JSXElement(element), span, Site::Nested(span));
            *it = JSXAttributeValue::new_expression_container(
                span,
                JSXExpression::from(placeholder),
                &self.ast,
            );
            return;
        }
        walk_jsx_attribute_value(self, it);
    }
}
