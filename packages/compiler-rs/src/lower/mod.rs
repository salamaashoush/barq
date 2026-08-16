pub(crate) mod entity;
pub(crate) mod jsx;
pub(crate) mod names;
mod parse;
pub(crate) mod text;

use std::borrow::Cow;
use std::collections::VecDeque;

use oxc::allocator::{Allocator, Box as ArenaBox, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    ArrayExpressionElement, ArrowFunctionExpression, Expression, JSXAttributeItem,
    JSXAttributeValue, JSXChild, JSXElement, JSXExpression, ReturnStatement, VariableDeclarator,
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

/// At least one child position the patch program has to fill. An empty
/// expression container — `{}`, `{/* a comment */}` — is not one: P1 drops it
/// exactly as it drops whitespace-only text.
fn holds_a_hole(children: &[JSXChild<'_>]) -> bool {
    children.iter().any(|child| match child {
        JSXChild::ExpressionContainer(container) => {
            !matches!(container.expression, JSXExpression::EmptyExpression(_))
        }
        JSXChild::Text(_) => false,
        _ => true,
    })
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
    kind: AttrKind,
    value: TmpAttrValue<'a>,
    span: Span,
}

/// The instruction the attribute becomes, decided at P1 — §3.5's "every
/// attribute resolves at compile time to exactly one channel".
#[derive(Clone, Copy)]
enum AttrKind {
    Chan(crate::ir::Chan),
    /// a delegated expando or an `addEventListener`; P2 picks which
    Event,
    /// `bind:x` — resolved into `(property, event)` by the element
    Bind,
    Ref,
    /// `{...rest}`. The one attribute whose NAMES are not a compile-time fact
    /// (§3.13 item 1), so the channel per key is resolved at run time — by the
    /// same tables `build.rs` generates the compiler's from.
    Spread,
    /// `action` on a `<form>`. §3.8's compiler surface: the name is resolved
    /// here like every other, and it is the one whose VALUE decides whether it
    /// is an attribute at all.
    FormAction,
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

    /// Whether the browser's tree builder produces this element as written.
    /// Everything refused here is split out of the template and joined back
    /// with `insert`, which never foster-parents.
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
            // A non-SVG tag closes foreign content, which would move it out of
            // the subtree the JSX puts it in.
            if !svg {
                return false;
            }
        } else if svg && tag != "svg" && at.parent.is_some() {
            // Only a template ROOT can reach the SVG namespace, via
            // `template(html, true)`.
            return false;
        }
        // The same rule in the other foreign namespace. An HTML tag inside
        // `<math>` is a MathML text integration point's business and nothing
        // here proves it is at one, so the element leaves the template.
        if at.in_math && !names::is_math_tag(tag) {
            return false;
        }
        // `<template>`'s children are parsed into `.content`, where no sibling
        // walk can reach them: `firstChild` on the element itself is null. The
        // bytes are still exactly what the author wrote, so a subtree with
        // nothing dynamic in it bakes and a subtree with a hole in it does not.
        if tag == "template" && !self.wholly_static(element) {
            return false;
        }
        // A `children=` attribute is the one name that still takes an element
        // off the template path: it is a PROP whose value is the child list,
        // and P4 is where a child list becomes a Block.
        let names_children = element.opening_element.attributes.iter().any(|item| match item {
            // A spread stays on the template path (§5.2). Its NAMES are the one
            // thing about an attribute the compiler cannot know, so the channel
            // per key is resolved at run time — but the element around it, its
            // literal attributes and its children are compiled as ever.
            JSXAttributeItem::SpreadAttribute(_) => false,
            JSXAttributeItem::Attribute(attribute) => {
                attribute_name(&attribute.name, self.allocator) == "children"
            }
        });
        if names_children {
            return false;
        }
        self.children_survive_the_parser(element, tag)
    }

    /// Nothing under this element addresses a node at run time: every attribute
    /// is a source literal a template may carry and every child is text or
    /// another such element. The predicate a `<template>` has to satisfy,
    /// because a patch inside one could never find its target.
    fn wholly_static(&self, element: &JSXElement<'a>) -> bool {
        let attributes = element.opening_element.attributes.iter().all(|item| match item {
            JSXAttributeItem::SpreadAttribute(_) => false,
            JSXAttributeItem::Attribute(attribute) => {
                let name = attribute_name(&attribute.name, self.allocator);
                let tag = intrinsic_tag(&element.opening_element.name).unwrap_or("");
                if !names::bakeable(names::normalize(name), false, tag) {
                    return false;
                }
                match attribute.value {
                    Some(JSXAttributeValue::StringLiteral(_)) => true,
                    // A bare intercepted name is the one literal P1 still sends
                    // down a channel: `<div class/>` REMOVES the attribute the
                    // parser would have written.
                    None => !crate::tables::is_intercepted(names::normalize(name)),
                    _ => false,
                }
            }
        });
        attributes
            && element.children.iter().all(|child| match child {
                JSXChild::Text(_) => true,
                JSXChild::Element(child) => {
                    intrinsic_tag(&child.opening_element.name).is_some()
                        && self.wholly_static(child)
                }
                _ => false,
            })
    }

    /// Whether a raw-text element's whole child list becomes ONE value rather
    /// than baked bytes: because something in it is dynamic, or because the
    /// bytes it would bake would close the element early.
    fn content_is_a_value(&self, children: &[JSXChild<'a>], tag: &str) -> bool {
        if holds_a_hole(children) {
            return true;
        }
        tag_flags(tag).contains(TagFlags::RAW_TEXT)
            && children.iter().any(|child| {
                let JSXChild::Text(text) = child else { return false };
                text::clean(text.span.source_text(self.source), self.allocator).is_some_and(
                    |cleaned| parse::raw_text_hazard(self.bake_text(cleaned, true), tag),
                )
            })
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
        // A `<!---->` inside a `<style>` is TEXT, so a hole in raw text may
        // never be given an anchor — and it never needs one, because the whole
        // child list becomes ONE insert: the static runs travel as strings in
        // the same array as the holes, in source order, and the element is
        // baked empty. That is also the shape the string backend writes with no
        // boundary comments and the client claims as `WHOLE`.
        //
        // Text that would close the element early takes the same route, which
        // is why the hazard is not a refusal here.
        if text_only && self.content_is_a_value(&element.children, tag) {
            return !element.children.iter().any(|child| matches!(child, JSXChild::Spread(_)));
        }
        element.children.iter().all(|child| match child {
            JSXChild::Text(text) => {
                let Some(cleaned) = text::clean(text.span.source_text(self.source), self.allocator)
                else {
                    return true;
                };
                !(fosters && cleaned.bytes().any(|byte| !byte.is_ascii_whitespace()))
            }
            // `{}` and `{/* … */}` carry no value, so they are not a position
            // and there is nothing for the parser to disagree about.
            JSXChild::ExpressionContainer(container)
                if matches!(container.expression, JSXExpression::EmptyExpression(_)) =>
            {
                true
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

        let ordered = self.ordered_attributes(opening.attributes, inside.in_svg, tag);
        let input_type = self.literal_type_attribute(&ordered);
        let editable = self.is_contenteditable(&ordered);
        let mut attrs = ArenaVec::with_capacity_in(ordered.len(), &self.allocator);
        let mut dynamic = Vec::new();
        for (order, attr) in ordered.into_iter().enumerate() {
            let order = order as u32;
            let kind = attr.kind;
            match attr.baked(order) {
                Some(baked) => attrs.push(baked),
                None => {
                    let TmpAttrValue::Dynamic(value) = attr.value else { unreachable!() };
                    dynamic.push((attr.key, kind, value, attr.span, order));
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

        for (name, kind, value, span, order) in dynamic {
            if matches!(kind, AttrKind::Event)
                && let Some(index) =
                    crate::tables::delegated_index(self.module.interner.name(name).text)
            {
                self.module.delegated |= 1 << index;
            }
            let writable = matches!(kind, AttrKind::Ref) && self.writable_binding(&value);
            let value = build.unit.exprs.push(ExprSrc::Verbatim(value), span, Rx::OPAQUE);
            build.unit.attr_order.push((node, name, order));
            let op = match kind {
                AttrKind::Chan(chan) => Op::SetOpaque { name, value, chan },
                AttrKind::Event => Op::SetEvent { event: name, value },
                AttrKind::Ref => Op::Ref { value, write: writable },
                AttrKind::Spread => Op::Spread { value, live: false },
                AttrKind::FormAction => Op::FormAction { value },
                AttrKind::Bind => {
                    let text = self.module.interner.name(name).text;
                    let (prop, event) = names::bind_channel(text, tag, input_type, editable);
                    let prop = self.module.interner.intern_name(prop);
                    let event = self.module.interner.intern_name(event);
                    Op::Bind { prop, event, value }
                }
            };
            build.attribute_patches.push(Patch { target: node, span, op });
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
        tag: &str,
    ) -> Vec<TmpAttr<'a>> {
        let mut ordered: Vec<TmpAttr<'a>> = Vec::with_capacity(attributes.len());
        // A spread closes the whole element to baking, in BOTH directions. The
        // template is applied by the parser, before every patch, so a literal
        // written after a spread would be applied before it; and duplicate
        // attributes in markup keep the FIRST where a props object keeps the
        // LAST, so a literal baked before a spread would win a collapse the
        // source says it loses. Applying the list in source order is the only
        // arrangement that agrees with itself, and it is one patch per name.
        let spread_seen =
            attributes.iter().any(|item| matches!(item, JSXAttributeItem::SpreadAttribute(_)));
        for item in attributes {
            let attribute = match item {
                JSXAttributeItem::Attribute(attribute) => attribute,
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let spread = spread.unbox();
                    ordered.push(TmpAttr {
                        key: self.module.interner.intern_name("..."),
                        kind: AttrKind::Spread,
                        value: TmpAttrValue::Dynamic(spread.argument),
                        span: spread.span,
                    });
                    continue;
                }
            };
            let attribute = attribute.unbox();
            let raw = attribute_name(&attribute.name, self.allocator);
            // §3.5/§3.12: the channel is decided HERE, from the name plus the
            // namespace plus the author's override, and never again.
            let (kind, key) = match names::prefixed(raw) {
                names::Prefixed::Ref => (AttrKind::Ref, "ref"),
                // The type is resolved here and never re-derived: `on:` is
                // verbatim, `onX` is `key.slice(2).toLowerCase()`.
                names::Prefixed::Event(event) => (AttrKind::Event, event),
                names::Prefixed::Bind(name) => (AttrKind::Bind, name),
                names::Prefixed::Chan(name, chan) => (
                    AttrKind::Chan(chan),
                    match chan {
                        crate::ir::Chan::Attr | crate::ir::Chan::Bool => {
                            names::attr_name(name, in_svg, self.allocator)
                        }
                        crate::ir::Chan::StyleProp => names::to_kebab(name, self.allocator),
                        _ => name,
                    },
                ),
                names::Prefixed::Plain(name) if name.starts_with("on") => (
                    AttrKind::Event,
                    self.allocator.alloc_str(&name[2..].to_ascii_lowercase()) as &'a str,
                ),
                // §3.8. `action` on a `<form>` is a URL or a SUBMIT HANDLER,
                // and §3.0 rule 1 cannot separate them: an `action()` is
                // `(...args) => Promise<R>`, whose arity is 0, so the attribute
                // channel read it as a Cell, CALLED it at mount, and wrote the
                // promise it returned into the form's target. The slot decides,
                // exactly as it does for `on*` (§3.5's `is_cell` exception).
                //
                // A literal `action="/url"` never reaches here: it is bakeable
                // by name and folds into the template bytes.
                names::Prefixed::Plain(name) if name == "action" && !in_svg && tag == "form" => {
                    (AttrKind::FormAction, "action")
                }
                names::Prefixed::Plain(name) => (
                    AttrKind::Chan(names::channel_of(names::normalize(name), in_svg, tag)),
                    names::attr_name(name, in_svg, self.allocator),
                ),
            };
            // Only a plain name or an explicit `attr:` may become template
            // bytes: every other channel writes something the HTML parser does
            // not produce.
            let bakeable = !spread_seen
                && match (kind, names::prefixed(raw)) {
                    (AttrKind::Chan(crate::ir::Chan::Attr), names::Prefixed::Chan(..)) => true,
                    (AttrKind::Chan(_), names::Prefixed::Plain(_)) => {
                        names::bakeable(names::normalize(raw), in_svg, tag)
                    }
                    // A literal URL is still template bytes. Only a value the
                    // parser cannot produce — anything that is not a string —
                    // reaches the op, which is the case the op exists for.
                    (AttrKind::FormAction, names::Prefixed::Plain(_)) => {
                        names::bakeable("action", in_svg, tag)
                    }
                    _ => false,
                };
            let key = self.module.interner.intern_name(key);
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
                // A bare attribute is the value `true`. `setAttr` writes
                // `key=""` for it, but a channel of its own never gets there —
                // `classToString(true)` is null, so `<div class/>` REMOVES the
                // attribute the parser would have created.
                None if bakeable && !crate::tables::is_intercepted(names::normalize(raw)) => {
                    TmpAttr {
                        key,
                        kind,
                        value: TmpAttrValue::Baked(SkelAttrValue::Bare),
                        span: attribute.span,
                    }
                }
                None => {
                    let value = Expression::new_boolean_literal(attribute.span, true, &self.ast);
                    TmpAttr { key, kind, value: TmpAttrValue::Dynamic(value), span: attribute.span }
                }
                Some(JSXAttributeValue::StringLiteral(literal)) if baked.is_some() => {
                    let text = baked.expect("checked by the guard");
                    let value = SkelAttrValue::Str(self.module.interner.intern_arena_str(text));
                    TmpAttr { key, kind, value: TmpAttrValue::Baked(value), span: literal.span }
                }
                // A JSX attribute string is not a JS string: backslashes are
                // literal and character references ARE resolved, by the
                // transform rather than by the parser. Down the template
                // channel the HTML parser resolves them; down the patch channel
                // nothing would, so the reference is resolved here and the
                // decoded text is what the channel is handed — which is what the
                // un-compiled path passes.
                Some(JSXAttributeValue::StringLiteral(literal)) if literal.value.contains('&') => {
                    let span = literal.span;
                    let text = entity::decode(literal.value.as_str())
                        .map_or(literal.value.as_str(), |decoded| {
                            self.allocator.alloc_str(&decoded)
                        });
                    let value = Expression::new_string_literal(span, text, None, &self.ast);
                    TmpAttr { key, kind, value: TmpAttrValue::Dynamic(value), span }
                }
                Some(value) => {
                    let span = value.span();
                    let value = attribute_expression(value, &self.ast, self.allocator);
                    TmpAttr { key, kind, value: TmpAttrValue::Dynamic(value), span }
                }
            };
            // A spread names nothing, so it never collapses with anything and
            // nothing collapses THROUGH it: `{...a} id="x"` keeps both, in that
            // order, because the object the spread carries may hold `id` too.
            let collapses = ordered
                .iter()
                .position(|entry| entry.key == key && !matches!(entry.kind, AttrKind::Spread));
            if let Some(previous) = collapses
                && !ordered[previous..].iter().any(|entry| matches!(entry.kind, AttrKind::Spread))
            {
                ordered.remove(previous);
            }
            ordered.push(attr);
        }
        ordered
    }

    /// Whether an attribute on this element writes its whole content, which is
    /// what stops its children being baked into the template.
    fn content_is_replaced(&self, build: &Build<'a>, node: NodeId) -> bool {
        build.attribute_patches.iter().any(|patch| {
            let name = match patch.op {
                Op::SetOpaque { name, .. } => name,
                _ => return false,
            };
            patch.target == node && names::replaces_children(self.module.interner.name(name).text)
        })
    }

    /// `<input type="number">` — the literal the `bind:` channel is resolved
    /// against. A computed `type` leaves it `None` and the text-input answer
    /// stands, which is what the un-compiled path would also produce.
    fn literal_type_attribute(&self, ordered: &[TmpAttr<'a>]) -> Option<&'a str> {
        self.literal_attribute(ordered, "type")
    }

    /// §3.10 — a `contenteditable` host has no `value`, so `bind:value` on one
    /// resolves to its TEXT. The author writes the attribute statically or the
    /// compiler cannot know, which is the same rule `type` follows.
    fn is_contenteditable(&self, ordered: &[TmpAttr<'a>]) -> bool {
        matches!(
            self.literal_attribute(ordered, "contenteditable")
                .or_else(|| self.literal_attribute(ordered, "contentEditable")),
            Some(value) if value != "false"
        )
    }

    fn literal_attribute(&self, ordered: &[TmpAttr<'a>], name: &str) -> Option<&'a str> {
        ordered.iter().find_map(|attr| {
            if self.module.interner.name(attr.key).text != name {
                return None;
            }
            match attr.value {
                TmpAttrValue::Baked(SkelAttrValue::Str(id)) => Some(self.module.interner.str(id)),
                _ => None,
            }
        })
    }

    /// B3: `<div ref={el}>` with a writable binding is an ASSIGNMENT. A `const`,
    /// an import, a member expression or a call is not, and takes the
    /// registration path instead.
    fn writable_binding(&self, expression: &Expression<'a>) -> bool {
        use oxc::semantic::SymbolFlags;
        let Some(symbol) = crate::analysis::symbol_of(&self.module.scoping, expression) else {
            return false;
        };
        let flags = self.module.scoping.symbol_flags(symbol);
        !flags.contains(SymbolFlags::ConstVariable)
            && (flags.contains(SymbolFlags::BlockScopedVariable)
                || flags.contains(SymbolFlags::FunctionScopedVariable))
    }

    fn children(&mut self, build: &mut Build<'a>, group: Group<'a>) -> (NodeId, NodeId, u32) {
        let Group { parent, children, at } = group;
        let lo = build.unit.skeleton.nodes.len() as NodeId;
        let mut materialised = 0u32;
        let flags = self.module.interner.tag(self.parent_tag(build, parent)).flags;
        let raw_text = flags.contains(TagFlags::RAW_TEXT);

        let tag = self.module.interner.tag(self.parent_tag(build, parent)).text;
        // A name that REPLACES the content — `dangerouslySetInnerHTML`,
        // `innerHTML`, `innerText`, `textContent` — is an attribute patch, and
        // attribute patches run before inserts. So the children may not be
        // baked (the write would delete them) but they may still be children:
        // one insert, after the write, which is the order the un-compiled path
        // produced by applying props before it appended anything.
        let replaced = self.content_is_replaced(build, parent);
        if replaced
            || ((raw_text || flags.contains(TagFlags::ESCAPABLE_RAW_TEXT))
                && self.content_is_a_value(&children, tag))
        {
            let span = children.first().map_or(Span::default(), GetSpan::span);
            if let Some(value) = self.text_content(children, span) {
                build.slot(parent, value, span);
            }
            return (lo, build.unit.skeleton.nodes.len() as NodeId, 0);
        }

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

    /// The whole child list of a raw-text element as ONE value: the static runs
    /// as string literals, the holes as themselves, in source order. A single
    /// part is that part; more than one is an array, which `insert` appends in
    /// order and the string backend concatenates.
    ///
    /// Nothing is baked, so nothing here is escaped for a parser: the DOM side
    /// writes a text node and the string side neutralises the close sequence at
    /// the seam. Character references are resolved because that is a rule of the
    /// JSX TRANSFORM and not of the HTML parser — `bake_text` resolves them for
    /// a raw-text template too, for the same reason.
    fn text_content(
        &mut self,
        children: ArenaVec<'a, JSXChild<'a>>,
        span: Span,
    ) -> Option<Expression<'a>> {
        let mut parts: Vec<Expression<'a>> = Vec::with_capacity(children.len());
        for child in children {
            match child {
                JSXChild::Text(text) => {
                    let raw = text.span.source_text(self.source);
                    let Some(cleaned) = text::clean(raw, self.allocator) else { continue };
                    let value = self.decoded(cleaned);
                    parts.push(Expression::new_string_literal(text.span, value, None, &self.ast));
                }
                JSXChild::ExpressionContainer(container) => {
                    if let Some(value) = expression_of(container.unbox().expression) {
                        parts.push(value);
                    }
                }
                JSXChild::Element(element) => parts.push(Expression::JSXElement(element)),
                JSXChild::Fragment(fragment) => parts.push(Expression::JSXFragment(fragment)),
                JSXChild::Spread(_) => unreachable!("refused by inlinable"),
            }
        }
        if parts.is_empty() {
            return None;
        }
        if parts.len() == 1 {
            return Some(parts.remove(0));
        }
        let elements = parts.into_iter().map(ArrayExpressionElement::from);
        let elements = ArenaVec::from_iter_in(elements, &self.allocator);
        Some(Expression::new_array_expression(span, elements, &self.ast))
    }

    fn decoded(&self, text: &'a str) -> &'a str {
        match entity::decode(text) {
            Some(Cow::Borrowed(same)) => same,
            Some(owned) => self.allocator.alloc_str(&owned),
            None => text,
        }
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
