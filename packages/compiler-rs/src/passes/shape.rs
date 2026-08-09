use oxc::allocator::{Allocator, Box as ArenaBox, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, Expression, FormalParameterKind, FormalParameters,
    FunctionBody, FunctionType, IdentifierName, JSXAttributeItem, JSXAttributeValue, JSXChild,
    JSXElement, JSXElementName, JSXExpression, JSXMemberExpression, JSXMemberExpressionObject,
    NumberBase, ObjectProperty, ObjectPropertyKind, PropertyKey, PropertyKind, SpreadElement,
    Statement, StringLiteral,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_expression, walk_jsx_attribute_value, walk_jsx_child};
use oxc::semantic::SymbolId;
use oxc::span::Span;

use crate::analysis::symbol_of;
use crate::ir::{
    Diag, DiagLevel, Flow, Interner, Module, React, Root, Rx, Shape as ExprShape, SourceKind,
};
use crate::lower::entity;
use crate::lower::jsx::{attribute_expression, attribute_name, expression_of, is_identifier_name};
use crate::lower::text;
use crate::options::ResolvedOptions;

use super::classify::Lift;

/// P4 Shape. Every JSX element whose tag resolves to a COMPONENT — a user
/// component, a control-flow builtin, a `Ns.Provider` member — becomes a real
/// call expression built in the same arena.
///
/// The call is what buys fine-grained flow across a component boundary.
/// `createElement` copies the props object it is handed (`{ ...props }`,
/// `dom.ts:309`), which reads every getter exactly once and freezes the result;
/// a direct call hands the component the object this pass built, so a `Reactive`
/// prop stays a getter and the READER decides when to read it.
///
/// Intrinsic markup the HTML parser reshapes, and fragments, are left as JSX for
/// codegen's `createElement` path: their semantics are the runtime's, not ours.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>, options: &ResolvedOptions) {
    let Module { units, roots, env, scoping, interner, source, .. } = module;

    let mut diagnostics: Vec<Diag> = Vec::new();
    {
        let mut shape = Shaper {
            allocator,
            ast: AstBuilder::new(allocator),
            lift: Lift::new(allocator, env, scoping),
            source,
            interner,
            diagnostics: &mut diagnostics,
            dev: options.dev,
        };
        for root in roots.iter_mut() {
            if let Root::Verbatim(expression) = root {
                shape.visit_expression(expression);
            }
        }
        for unit in units.iter_mut() {
            for entry in unit.exprs.entries.iter_mut() {
                if let Some(expression) = entry.src.expression_mut() {
                    shape.visit_expression(expression);
                }
            }
        }
    }
    module.env.diagnostics.extend(diagnostics);
}

struct Shaper<'a, 'm> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    lift: Lift<'a, 'm>,
    source: &'a str,
    interner: &'m mut Interner<'a>,
    diagnostics: &'m mut Vec<Diag>,
    dev: bool,
}

/// What a tag resolves to. `Intrinsic` keeps its JSX and goes down the
/// `createElement` path; everything else is called.
enum Callee<'a> {
    Intrinsic,
    Component(Expression<'a>, Option<SymbolId>),
}

/// A built prop, and whether it is installed as a getter.
struct Prop<'a> {
    value: Expression<'a>,
    getter: bool,
}

impl<'a> Shaper<'a, '_> {
    fn callee(&self, name: &JSXElementName<'a>) -> Callee<'a> {
        match name {
            // oxc gives a lowercase tag the `Identifier` variant and a
            // capitalised one `IdentifierReference`, so the intrinsic/component
            // split is the parser's and never a name test of ours.
            JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_) => Callee::Intrinsic,
            JSXElementName::IdentifierReference(identifier) => {
                let reference = identifier.reference_id.get();
                let symbol =
                    reference.and_then(|id| self.lift.scoping().get_reference(id).symbol_id());
                // The reference travels with the built callee: P8b resolves a
                // flow component by `SymbolId` off this expression, long after
                // the JSX it came from is gone.
                let callee = self.ident(identifier.name.as_str(), identifier.span);
                if let Expression::Identifier(built) = &callee {
                    built.reference_id.set(reference);
                }
                Callee::Component(callee, symbol)
            }
            // `createElement` calls `tag(finalProps)` with no receiver, so a
            // member tag may not keep its `this`. The comma expression says so.
            JSXElementName::MemberExpression(member) => {
                let chain = self.member_chain(member);
                Callee::Component(self.detached(chain, member.span), None)
            }
            JSXElementName::ThisExpression(this) => {
                let expression = Expression::new_this_expression(this.span, &self.ast);
                Callee::Component(self.detached(expression, this.span), None)
            }
        }
    }

    fn ident(&self, name: &str, span: Span) -> Expression<'a> {
        Expression::new_identifier(span, self.allocator.alloc_str(name), &self.ast)
    }

    fn detached(&self, expression: Expression<'a>, span: Span) -> Expression<'a> {
        let zero = Expression::new_numeric_literal(span, 0.0, None, NumberBase::Decimal, &self.ast);
        let parts = ArenaVec::from_iter_in([zero, expression], &self.allocator);
        Expression::new_sequence_expression(span, parts, &self.ast)
    }

    fn member_chain(&self, member: &JSXMemberExpression<'a>) -> Expression<'a> {
        let object = match &member.object {
            // The REFERENCE travels with the name. `<core.For>` is the only
            // spelling of a flow component that reaches codegen as a member
            // expression, and without the reference id the SSR backend has to
            // resolve `core` by name — which is the heuristic this compiler
            // exists to replace.
            JSXMemberExpressionObject::IdentifierReference(identifier) => {
                let expression = self.ident(identifier.name.as_str(), identifier.span);
                if let Expression::Identifier(built) = &expression {
                    built.reference_id.set(identifier.reference_id.get());
                }
                expression
            }
            JSXMemberExpressionObject::ThisExpression(this) => {
                Expression::new_this_expression(this.span, &self.ast)
            }
            JSXMemberExpressionObject::MemberExpression(inner) => self.member_chain(inner),
        };
        let property = IdentifierName::new(
            member.property.span,
            self.allocator.alloc_str(member.property.name.as_str()),
            &self.ast,
        );
        Expression::new_static_member_expression(member.span, object, property, false, &self.ast)
    }

    fn flow_of(&self, symbol: Option<SymbolId>) -> Option<Flow> {
        symbol.and_then(|symbol| self.lift.env().kind_of(symbol).flow())
    }

    /// `<Comp a={x}>{k}</Comp>` → `Comp({ a: x, children: k })`.
    ///
    /// `children` is appended LAST and only when the element really has JSX
    /// children, which is `createElement`'s contract exactly: it overwrites
    /// whatever a `children=` attribute said, and leaves that attribute alone
    /// when the element is childless.
    fn component_call(
        &mut self,
        callee: Expression<'a>,
        flow: Option<Flow>,
        element: ArenaBox<'a, JSXElement<'a>>,
    ) -> Expression<'a> {
        let JSXElement { span, opening_element, children, .. } = element.unbox();
        let opening = opening_element.unbox();

        let mut properties: Vec<ObjectPropertyKind<'a>> =
            Vec::with_capacity(opening.attributes.len() + 1);
        let mut getters = false;
        let mut keyed = true;
        let mut each: Option<(Span, bool)> = None;
        // A `children=` attribute is held back rather than pushed: whether it
        // survives at all depends on JSX children this loop has not read yet.
        // The index it would have taken is kept so it can be put back there.
        let mut attribute_children: Option<(usize, Expression<'a>, Span)> = None;

        for item in opening.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let spread = spread.unbox();
                    properties.push(ObjectPropertyKind::SpreadProperty(ArenaBox::new_in(
                        SpreadElement::new(spread.span, spread.argument, &self.ast),
                        &self.allocator,
                    )));
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let attribute = attribute.unbox();
                    let name = attribute_name(&attribute.name, self.allocator);
                    let at = attribute.span;
                    let value = match attribute.value {
                        None => Expression::new_boolean_literal(at, true, &self.ast),
                        Some(value) => attribute_expression(value, &self.ast),
                    };
                    // `For keyed={false}` delegates to `Index` at runtime, and
                    // an Index row item is an ACCESSOR, so O3 does not apply.
                    if name == "keyed"
                        && matches!(&value, Expression::BooleanLiteral(it) if !it.value)
                    {
                        keyed = false;
                    }
                    if name == "each" {
                        each = Some((at, self.unproven_rows(&value)));
                    }
                    if name == "children" {
                        attribute_children = Some((properties.len(), value, at));
                        continue;
                    }
                    let prop = self.prop_value(flow, name, value);
                    getters |= prop.getter;
                    properties.push(self.property(name, prop, at));
                }
            }
        }

        let mut kids = self.children(children);

        // `createElement` OVERWRITES a `children=` attribute with the JSX
        // children. Emitting both spells that as a duplicate key: right by
        // evaluation order, and rejected by ES5-strict tooling and by every
        // linter that reads the output. So the attribute goes back in its own
        // slot only when it survives; when the JSX children overwrite it, a
        // constant is dropped outright and anything else keeps its one
        // evaluation, still in its own slot, as a spread of `null` — which
        // copies no properties at all. Order among the other props is therefore
        // exactly the order the un-compiled path evaluates them in.
        if let Some((index, value, at)) = attribute_children {
            if kids.is_empty() {
                let prop = self.prop_value(flow, "children", value);
                getters |= prop.getter;
                properties.insert(index, self.property("children", prop, at));
            } else if self.lift.rx(&value).konst.is_none() {
                properties.insert(index, self.discarded(value, at));
            }
        }

        if !kids.is_empty() {
            let value = if kids.len() == 1 {
                kids.remove(0)
            } else {
                let elements =
                    kids.into_iter().map(ArrayExpressionElement::from).collect::<Vec<_>>();
                let elements = ArenaVec::from_iter_in(elements, &self.allocator);
                Expression::new_array_expression(span, elements, &self.ast)
            };
            let prop = self.prop_value(flow, "children", value);
            getters |= prop.getter;
            properties.push(self.property("children", prop, span));
        }

        // O3. A keyed row item is a plain value, so `{item.name}` is applied once
        // with no thunk and no effect. That is right whenever the rows really are
        // the values `mapArray` recreated, and silently stale when they are store
        // proxies: mutating a proxy field leaves the array identity alone, so no
        // row is recreated and the applied-once read never runs again.
        //
        // The gate is therefore NOT "the compiler knows nothing". A resolvable
        // store — `each={store.items}`, `each={() => store.items}` — is the
        // demonstrable failure case, and gating on `Opaque` stayed silent for
        // exactly it.
        if self.dev
            && flow == Some(Flow::For)
            && keyed
            && let Some((at, true)) = each
        {
            self.note(
                at,
                "For: the origin of `each` cannot be proved to be values `mapArray` recreates, so \
                 a member read on the row item is applied once with no effect (DESIGN O3). If \
                 these rows are store proxies, read them through an accessor instead.",
            );
        }

        // O7. `Dynamic` does `const { component: _, ...rest } = props`, which
        // reads every getter once and hands the rendered component dead values.
        if self.dev && flow == Some(Flow::Dynamic) && getters {
            self.warn(
                span,
                "Dynamic spreads its props, which reads every getter once and loses fine-grained \
                 flow into the rendered component (DESIGN O7). Pass an accessor instead.",
            );
        }

        let properties = ArenaVec::from_iter_in(properties, &self.allocator);
        let props = Expression::new_object_expression(span, properties, &self.ast);
        let arguments = ArenaVec::from_iter_in([Argument::from(props)], &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    /// The shapes a prop may take, in the order they are tried.
    ///
    /// Target #8 is not here, and deliberately so. A control-flow child the
    /// author wrote as `{() => <jsx/>}` KEEPS its arrow however static the body
    /// is: unwrapping it builds the subtree at call time even when the branch is
    /// never taken, and hands the same node back on every re-mount where the
    /// un-compiled path builds a fresh one — measurable as node identity, and as
    /// focus, scroll and input state surviving a toggle. What #8 buys is that
    /// the compiler never MANUFACTURES a thunk: an eager `<Show><p/></Show>` is
    /// one `template()` clone passed straight in, with no arrow, no IIFE and no
    /// element binding.
    fn prop_value(&mut self, flow: Option<Flow>, name: &str, value: Expression<'a>) -> Prop<'a> {
        if let Some(flow) = flow
            && unwrapped_by(flow, name)
            && let Some(reduced) = self.eta(&value)
        {
            return Prop { value: reduced, getter: false };
        }
        let rx = self.lift.rx(&value);
        // A getter, and ONLY for a value the analysis PROVED is a tracked read.
        // `Opaque` stays a plain value: the un-compiled path evaluates it once,
        // so a prop carrying a side effect has to fire exactly once here too.
        if rx.react == React::Reactive && getter_shaped(rx) {
            Prop { value, getter: true }
        } else {
            Prop { value, getter: false }
        }
    }

    /// Whether the rows `each` yields might be values `mapArray` does NOT
    /// recreate — a store proxy, a props forward, or an origin the analysis could
    /// not follow at all. Syntactic on purpose: it drives a note, and the honest
    /// answer for anything it cannot see through is "not proven".
    fn unproven_rows(&self, value: &Expression<'a>) -> bool {
        match value {
            Expression::ParenthesizedExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSAsExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSNonNullExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSSatisfiesExpression(it) => self.unproven_rows(&it.expression),
            Expression::ArrowFunctionExpression(arrow) => {
                arrow.body.as_expression().is_some_and(|body| self.unproven_rows(body))
            }
            Expression::StaticMemberExpression(member) => self.unproven_rows(&member.object),
            Expression::ComputedMemberExpression(member) => self.unproven_rows(&member.object),
            Expression::CallExpression(call) => self.unproven_rows(&call.callee),
            Expression::Identifier(_) => match symbol_of(self.lift.scoping(), value) {
                // A global the module never bound is as unresolvable as an
                // import the analysis could not follow.
                None => true,
                Some(symbol) => matches!(
                    self.lift.env().kind_of(symbol),
                    SourceKind::ReactiveObject | SourceKind::PropsParam | SourceKind::Opaque
                ),
            },
            _ => false,
        }
    }

    /// `() => f()` → `f`, for a prop whose unwrapping contract the runtime
    /// documents (`typeof raw === "function" ? raw() : raw`). Illegal for a user
    /// component prop, whose contract we do not know.
    fn eta(&self, value: &Expression<'a>) -> Option<Expression<'a>> {
        let Expression::ArrowFunctionExpression(arrow) = value else { return None };
        if arrow.r#async || !arrow.params.items.is_empty() || arrow.params.rest.is_some() {
            return None;
        }
        let Expression::CallExpression(call) = arrow.body.as_expression()? else { return None };
        if !call.arguments.is_empty() || call.optional {
            return None;
        }
        let Expression::Identifier(identifier) = &call.callee else { return None };
        let symbol = symbol_of(self.lift.scoping(), &call.callee)?;
        matches!(self.lift.env().kind_of(symbol), SourceKind::Accessor { .. })
            .then(|| self.ident(identifier.name.as_str(), identifier.span))
    }

    /// `...(expr, null)` — `expr` evaluated for its effect and nothing else.
    /// CopyDataProperties ignores `null`, so the object is untouched, and the
    /// evaluation stays at the position the author wrote it at.
    fn discarded(&self, value: Expression<'a>, span: Span) -> ObjectPropertyKind<'a> {
        let expressions = ArenaVec::from_iter_in(
            [value, Expression::new_null_literal(span, &self.ast)],
            &self.allocator,
        );
        let argument = Expression::new_sequence_expression(span, expressions, &self.ast);
        ObjectPropertyKind::SpreadProperty(ArenaBox::new_in(
            SpreadElement::new(span, argument, &self.ast),
            &self.allocator,
        ))
    }

    fn property(&self, name: &'a str, prop: Prop<'a>, span: Span) -> ObjectPropertyKind<'a> {
        let key = self.property_key(name, span);
        let (kind, value) = if prop.getter {
            (PropertyKind::Get, self.getter_function(prop.value, span))
        } else {
            (PropertyKind::Init, prop.value)
        };
        ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
            ObjectProperty::new(span, kind, key, value, false, false, false, &self.ast),
            &self.allocator,
        ))
    }

    /// `get k() { return expr }`. A getter, not an arrow property: the component
    /// reads `props.k`, and every prop shape a component can be written with —
    /// destructured, spread, defaulted, renamed, rest — goes through that read.
    fn getter_function(&self, value: Expression<'a>, span: Span) -> Expression<'a> {
        let statements = ArenaVec::from_iter_in(
            [Statement::new_return_statement(span, Some(value), &self.ast)],
            &self.allocator,
        );
        let body =
            FunctionBody::boxed(span, ArenaVec::new_in(&self.allocator), statements, &self.ast);
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::FormalParameter,
            ArenaVec::new_in(&self.allocator),
            None,
            &self.ast,
        );
        Expression::new_function_expression(
            span,
            FunctionType::FunctionExpression,
            None,
            false,
            false,
            false,
            None,
            None,
            params,
            None,
            Some(body),
            &self.ast,
        )
    }

    fn property_key(&self, name: &'a str, span: Span) -> PropertyKey<'a> {
        if is_identifier_name(name) {
            PropertyKey::StaticIdentifier(ArenaBox::new_in(
                IdentifierName::new(span, name, &self.ast),
                &self.allocator,
            ))
        } else {
            PropertyKey::StringLiteral(ArenaBox::new_in(
                StringLiteral::new(span, name, None, &self.ast),
                &self.allocator,
            ))
        }
    }

    fn children(&mut self, children: ArenaVec<'a, JSXChild<'a>>) -> Vec<Expression<'a>> {
        let mut out = Vec::with_capacity(children.len());
        for child in children {
            match child {
                JSXChild::Text(child) => {
                    // This becomes a JS string literal, so the references have to
                    // be resolved here rather than by the HTML parser.
                    let raw = child.span.source_text(self.source);
                    if let Some(cleaned) = text::clean(raw, self.allocator) {
                        let value = self.decoded(cleaned);
                        out.push(Expression::new_string_literal(
                            child.span, value, None, &self.ast,
                        ));
                    }
                }
                JSXChild::Element(element) => out.push(Expression::JSXElement(element)),
                JSXChild::Fragment(fragment) => out.push(Expression::JSXFragment(fragment)),
                JSXChild::ExpressionContainer(container) => {
                    if let Some(value) = expression_of(container.unbox().expression) {
                        out.push(value);
                    }
                }
                JSXChild::Spread(_) => unreachable!("refused by `shapeable`"),
            }
        }
        out
    }

    fn decoded(&self, text: &'a str) -> &'a str {
        match entity::decode(text) {
            Some(std::borrow::Cow::Borrowed(same)) => same,
            Some(owned) => self.allocator.alloc_str(&owned),
            None => text,
        }
    }

    fn diagnose(&mut self, level: DiagLevel, span: Span, message: &str) {
        let message = self.interner.intern_arena_str(self.allocator.alloc_str(message));
        self.diagnostics.push(Diag { level, span, message });
    }

    fn warn(&mut self, span: Span, message: &str) {
        self.diagnose(DiagLevel::Warning, span, message);
    }

    fn note(&mut self, span: Span, message: &str) {
        self.diagnose(DiagLevel::Note, span, message);
    }

    fn is_component(&self, element: &JSXElement<'a>) -> bool {
        shapeable(element)
            && matches!(self.callee(&element.opening_element.name), Callee::Component(..))
    }

    fn shape_jsx(&mut self, mut value: Expression<'a>) -> Expression<'a> {
        self.visit_expression(&mut value);
        value
    }
}

/// A `{...list}` child spreads into `createElement`'s rest parameter, and one
/// `children` value cannot express that, so the whole element stays on the
/// `createElement` path.
fn shapeable(element: &JSXElement<'_>) -> bool {
    !element.children.iter().any(|child| matches!(child, JSXChild::Spread(_)))
}

/// Only a value that reads like a value. A `Shape::Accessor` or a handler is a
/// function the component calls itself, and rebuilding it on every property read
/// would break its identity.
fn getter_shaped(rx: Rx<'_>) -> bool {
    !matches!(rx.shape, ExprShape::Accessor | ExprShape::Handler | ExprShape::HandlerTuple)
}

/// The props the runtime unwraps with `typeof raw === "function" ? raw() : raw`,
/// per component. η-reduction is legal exactly here and nowhere else.
fn unwrapped_by(flow: Flow, name: &str) -> bool {
    match flow {
        Flow::For | Flow::Index => name == "each",
        Flow::Repeat => name == "count",
        Flow::Show | Flow::Match => name == "when",
        Flow::Dynamic => name == "component",
        Flow::Loading => name == "on",
        _ => false,
    }
}

impl<'a> VisitMut<'a> for Shaper<'a, '_> {
    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::JSXElement(element) = it
            && self.is_component(element)
        {
            let Callee::Component(callee, symbol) = self.callee(&element.opening_element.name)
            else {
                unreachable!("checked by is_component")
            };
            let flow = self.flow_of(symbol);
            let Expression::JSXElement(element) = it.take_in(&self.allocator) else {
                unreachable!("matched above")
            };
            *it = self.component_call(callee, flow, element);
        }
        walk_expression(self, it);
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::Element(element) = it
            && self.is_component(element)
        {
            let span = element.span;
            let JSXChild::Element(element) = it.take_in(&self.allocator) else { unreachable!() };
            let value = self.shape_jsx(Expression::JSXElement(element));
            *it = JSXChild::new_expression_container(span, JSXExpression::from(value), &self.ast);
            return;
        }
        walk_jsx_child(self, it);
    }

    fn visit_jsx_attribute_value(&mut self, it: &mut JSXAttributeValue<'a>) {
        if let JSXAttributeValue::Element(element) = it
            && self.is_component(element)
        {
            let span = element.span;
            let JSXAttributeValue::Element(element) = it.take_in(&self.allocator) else {
                unreachable!()
            };
            let value = self.shape_jsx(Expression::JSXElement(element));
            *it = JSXAttributeValue::new_expression_container(
                span,
                JSXExpression::from(value),
                &self.ast,
            );
            return;
        }
        walk_jsx_attribute_value(self, it);
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::options::ResolvedOptions;

    fn emit(source: &str) -> crate::compile::CompileOutput {
        compile(source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles")
    }

    fn dev(source: &str) -> crate::compile::CompileOutput {
        let options = ResolvedOptions { dev: true, ..ResolvedOptions::with_filename("s.tsx") };
        compile(source, &options).expect("compiles")
    }

    /// The M5 headline. `createElement` copies the props object it is handed
    /// (`{ ...props }`), so a snapshot is all a component could ever receive
    /// through it; a direct call with a getter is what keeps the read live.
    #[test]
    fn a_reactive_prop_crosses_the_boundary_as_a_getter() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const V = () => <Badge total={n()} label=\"x\" fn={() => n()} />;\n",
        )
        .code;
        assert!(code.contains("Badge({"), "{code}");
        assert!(code.contains("get total()"), "{code}");
        // A literal is a value, and so is a user-written accessor: wrapping
        // either would change nothing but the number of closures.
        assert!(code.contains("label: \"x\""), "{code}");
        assert!(code.contains("fn: () => n()"), "{code}");
    }

    /// `Opaque` is emitted unwrapped everywhere else for the same reason it is
    /// here: the un-compiled path evaluates the prop exactly once, so a prop
    /// carrying a side effect has to fire exactly once through the compiler too.
    #[test]
    fn an_unresolvable_prop_stays_a_value() {
        let code = emit("const V = () => <Badge total={compute()} />;\n").code;
        assert!(code.contains("Badge({ total: compute() })"), "{code}");
        assert!(!code.contains("get total()"), "{code}");
    }

    /// Target #8. A static body is one `template()` clone handed straight in —
    /// no arrow, no IIFE, no element binding — where a body carrying a patch has
    /// to be built, exactly as `createElement` builds it, at the call site.
    #[test]
    fn a_static_control_flow_body_costs_one_clone_and_nothing_else() {
        let source = "import { Show, signal } from \"@barqjs/core\";\n\
                      const on = signal(false);\n\
                      const A = () => <Show when={() => on()}><p class=\"s\">x</p></Show>;\n\
                      const B = () => <Show when={() => on()}><p class=\"s\">{on()}</p></Show>;\n";
        let code = emit(source).code;
        assert!(code.contains("children: _tmpl$1()"), "{code}");
        assert!(!code.contains("children: () => _tmpl$1()"), "{code}");
        assert!(code.contains("_$insert(_el$1, on)"), "{code}");
        // η-reduction, for the props whose unwrapping contract the runtime
        // documents. Illegal for a user component prop, whose contract we do
        // not know.
        assert!(code.contains("when: on"), "{code}");
    }

    /// The boundary of target #8, and the reason it is a boundary. An arrow the
    /// AUTHOR wrote is kept however static its body is: unwrapping it builds the
    /// subtree at call time even when the branch is never taken, and hands the
    /// same node back on every re-mount where the un-compiled path builds a
    /// fresh one. `For` keeps its thunk for a second reason on top — it calls
    /// `children` per row, so a node there is a TypeError.
    #[test]
    fn an_author_written_thunk_is_never_unwrapped() {
        let source = "import { For, Show, signal } from \"@barqjs/core\";\n\
                      const on = signal(false);\n\
                      const rows = signal([1]);\n\
                      const A = () => <Show when={() => on()}>{() => <p class=\"s\">x</p>}</Show>;\n\
                      const B = () => <For each={() => rows()}>{() => <li>x</li>}</For>;\n";
        let code = emit(source).code;
        assert!(code.contains("children: () => _tmpl$1()"), "{code}");
        assert!(code.contains("children: () => _tmpl$2()"), "{code}");
        assert!(code.contains("each: rows"), "{code}");
    }

    /// A body with a hole is not static, so the thunk stays and the DOM is only
    /// built when the branch is first taken.
    #[test]
    fn a_body_with_a_patch_keeps_its_thunk() {
        let code = emit(
            "import { Show, signal } from \"@barqjs/core\";\n\
             const on = signal(false);\n\
             const V = () => <Show when={() => on()}>{() => <p>{value}</p>}</Show>;\n",
        )
        .code;
        assert!(code.contains("children: () => {"), "{code}");
    }

    /// A `children=` attribute alongside JSX children. `createElement`
    /// overwrites the attribute, so ONE `children` key is the semantics — and
    /// two of them is a duplicate key, which ES5-strict rejects and every
    /// linter flags. The attribute's own evaluation survives where it cannot be
    /// proved constant, in the slot it was written in, so a side effect still
    /// fires exactly once and still fires before the props that follow it.
    #[test]
    fn a_children_attribute_overwritten_by_jsx_children_leaves_one_key() {
        let code =
            emit("const V = () => <Panel children=\"lit\" tone=\"w\"><b>x</b></Panel>;\n").code;
        assert_eq!(code.matches("children:").count(), 1, "{code}");
        assert!(code.contains("children: _tmpl$1()"), "{code}");
        assert!(!code.contains("\"lit\""), "{code}");

        let code =
            emit("const V = () => <Panel children={f()} tone=\"w\"><b>x</b></Panel>;\n").code;
        assert_eq!(code.matches("children:").count(), 1, "{code}");
        // Its slot, not the end: `f()` runs before `tone` exactly as the
        // un-compiled path's props object evaluates them.
        let discard = code.find("...(f(), null)").expect("the discarded evaluation");
        let tone = code.find("tone: \"w\"").expect("the prop after it");
        let kids = code.find("children: _tmpl$1()").expect("the JSX children");
        assert!(discard < tone && tone < kids, "{code}");

        // With no JSX children there is nothing to overwrite it, and the
        // attribute is an ordinary prop again.
        let code = emit("const V = () => <Panel children={f()} tone=\"w\" />;\n").code;
        assert!(code.contains("children: f()"), "{code}");
        assert!(code.contains("tone: \"w\""), "{code}");
        assert!(!code.contains("null"), "{code}");
    }

    /// The M5 blocker: `SourceKind::PropsParam` was defined, read by P2, and
    /// assigned by nobody, so `props.total` classified `Opaque` and was emitted
    /// unwrapped. The getter at the call site was dead weight and the natural
    /// shape rendered once and never updated.
    #[test]
    fn a_props_read_inside_a_component_is_live_and_forwards_as_a_getter() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             function Badge(props) { return <span>{props.total}</span>; }\n\
             function Outer(props) { return <Chip tone={props.tone} />; }\n\
             export default function App() { return <div><Badge total={n()} /><Outer tone=\"w\" /></div>; }\n",
        )
        .code;
        assert!(code.contains("_$insert(_el$1, () => props.total)"), "{code}");
        assert!(code.contains("get tone()"), "{code}");
    }

    /// η-reduction's preconditions, each one negatively. The whitelist itself is
    /// a conservatism boundary rather than a semantic one — every consumer in
    /// `components.ts` either unwraps a function with
    /// `typeof raw === "function" ? raw() : raw`, routes it through
    /// `childToNodes` (which calls it), or hands it to `setProp` (where both
    /// spellings are live bindings) — so what has to be pinned is that the
    /// reduction only ever fires for a ZERO-ARG ACCESSOR RESOLVED BY SYMBOL.
    #[test]
    fn eta_refuses_everything_that_is_not_a_bare_accessor_call() {
        let cases = [
            // the callee is a function, not an accessor: calling it is not a read
            (
                "const f = () => [1];\nexport const V = () => <For each={() => f()}>{r}</For>;",
                "each: () => f()",
            ),
            // an argument means the arrow is not the identity of the call
            (
                "const f = signal([1]);\nexport const V = () => <For each={() => f(1)}>{r}</For>;",
                "each: () => f(1)",
            ),
            // a parameter means the arrow is not zero-arity
            (
                "const f = signal([1]);\nexport const V = () => <For each={(x) => f()}>{r}</For>;",
                "each: (x) => f()",
            ),
            // a member call is not an identifier reference
            (
                "const o = { f: () => [1] };\nexport const V = () => <For each={() => o.f()}>{r}</For>;",
                "each: () => o.f()",
            ),
        ];
        for (body, expected) in cases {
            let source = format!(
                "import {{ For, signal }} from \"@barqjs/core\";\nconst r = (x) => x;\n{body}\n"
            );
            let code = emit(&source).code;
            assert!(code.contains(expected), "{expected} not in:\n{code}");
        }

        // And by SymbolId, never by name: a LOCAL `Show` is not the runtime's.
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const on = signal(false);\n\
             const Show = (props) => props.when;\n\
             export const V = () => <Show when={() => on()} />;\n",
        )
        .code;
        assert!(code.contains("when: () => on()"), "{code}");
    }

    /// A one-parameter JSX-returning arrow is not a component just because it
    /// has that shape: a `<For>` row callback and a `.map` body are both spelled
    /// the same way, and thunking their parameter is pure loss (O3).
    #[test]
    fn a_row_callback_parameter_is_not_a_props_object() {
        let code = emit(
            "import { For, signal } from \"@barqjs/core\";\n\
             const rows = signal([{ id: 1, n: \"a\" }]);\n\
             const row = (item) => <li>{item.n}</li>;\n\
             export const V = () => <For each={rows}>{row}</For>;\n",
        )
        .code;
        assert!(code.contains("_$insert(_el$1, item.n)"), "{code}");
        assert!(!code.contains("() => item.n"), "{code}");
    }

    /// O3 and O7, which are both deliberate divergences — so neither is allowed
    /// to be silent.
    #[test]
    fn the_two_documented_divergences_are_reported() {
        let notes = dev(
            "import { For } from \"@barqjs/core\";\n\
             export const V = (props) => <For each={props.rows}>{(item) => <li>{item.n}</li>}</For>;\n",
        )
        .warnings;
        assert_eq!(notes.len(), 1, "{notes:?}");
        assert!(notes[0].message.contains("origin of `each`"), "{notes:?}");

        // The case the `Opaque` gate stayed silent for, and the one O3's own
        // message names: a RESOLVABLE store, whose rows `mapArray` never
        // recreates because mutating a proxy field leaves the array alone.
        for each in ["store.items", "() => store.items"] {
            let source = format!(
                "import {{ For, useStore }} from \"@barqjs/core\";\n\
                 const [store] = useStore({{ items: [] }});\n\
                 export const V = () => <For each={{{each}}}>{{(item) => <li>{{item.n}}</li>}}</For>;\n"
            );
            let notes = dev(&source).warnings;
            assert_eq!(notes.len(), 1, "each={each}: {notes:?}");
        }

        // A signal of plain rows IS what mapArray recreates, so there is
        // nothing to say and the note stays out of the way.
        let quiet = dev("import { For, signal } from \"@barqjs/core\";\n\
             const rows = signal([]);\n\
             export const V = () => <For each={rows}>{(item) => <li>{item.n}</li>}</For>;\n")
        .warnings;
        assert!(quiet.is_empty(), "{quiet:?}");

        // `For keyed={false}` delegates to `Index`, whose row item is an
        // accessor, so O3 does not apply and there is nothing to say.
        let quiet = dev(
            "import { For } from \"@barqjs/core\";\n\
             export const V = (props) => <For each={props.rows} keyed={false}>{(i) => <li>{i()}</li>}</For>;\n",
        )
        .warnings;
        assert!(quiet.is_empty(), "{quiet:?}");

        // Advice about a runtime behaviour, not a defect in the module, so it
        // is off on a production build exactly as O7 is.
        assert!(
            emit(
                "import { For } from \"@barqjs/core\";\n\
                 export const V = (props) => <For each={props.rows}>{(i) => <li>{i.n}</li>}</For>;\n"
            )
            .warnings
            .is_empty()
        );

        let warnings = dev("import { Dynamic, signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const V = () => <Dynamic component=\"b\" total={n()} />;\n")
        .warnings;
        assert_eq!(warnings.len(), 1, "{warnings:?}");
        assert!(warnings[0].message.contains("loses fine-grained flow"), "{warnings:?}");
        // Off by default: it is advice about a runtime behaviour, not a defect
        // in the module.
        assert!(
            emit(
                "import { Dynamic, signal } from \"@barqjs/core\";\n\
                 const n = signal(0);\n\
                 const V = () => <Dynamic component=\"b\" total={n()} />;\n"
            )
            .warnings
            .is_empty()
        );
    }
}
