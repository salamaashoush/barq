//! P4b Flow — the thirteen control-flow constructs, lowered onto `flow.ts`'s
//! four primitives.
//!
//! `CODESIGN.md` §3.4 and `SEMANTICS.md` K5. A construct that reaches here stops
//! being a component: it becomes a [`Region`] row carrying the arguments its
//! primitive takes, and the patch program hands that primitive the
//! `(parent, anchor)` pair the template walk already computed. What that removes
//! per instance is a props object, an adapter frame, and the runtime's own
//! re-derivation of an insertion point the compiler knew statically.
//!
//! ## What is lowered
//!
//! | construct | primitive | key |
//! |---|---|---|
//! | `Show` | `branch` | the value, or truthiness under `keyed={false}` |
//! | `Switch` / `Match` | `branch` | the winning arm's INDEX, an integer |
//! | `For` | `each` | `keyOf`, whose default is IDENTITY |
//! | `Repeat` | `each` (`COUNT`) | the index |
//! | `Loading` / `Suspense` | `boundary("loading")` | the collector's |
//! | `Errored` / `ErrorBoundary` | `boundary("error")` | the collector's |
//! | `Portal` | `portal` | the target |
//!
//! ## What is not, and why each refusal is a fact rather than a gap
//!
//! - **`Dynamic`** needs the string arm's element construction, which lives in
//!   `components.ts` as a private `createDynamicElement` and is not on the ABI
//!   §3.0 enumerates. Lowering it would mean emitting a fifth element-creation
//!   path out of the compiler, which is the thing M4 deleted from the runtime.
//! - **`Await`** discriminates a `Resource` from a `Cell` carrying one by a
//!   property test on the value (`"state" in carrier`), and its key and its
//!   three bodies each need the resolved resource. Without a shared local that
//!   is four evaluations of the `resource` prop, and the compiler cannot prove
//!   they yield the same object.
//! - **`Reveal`** creates a PROVIDE scope, not a range — `ownership.rs` says so
//!   and O1 lists `provide` separately from `branch`. It is not one of the four
//!   primitives, and lowering it onto `branch` would put a context binding where
//!   a conditional belongs.
//!
//! Every refusal — these three, and every construct whose props the pass cannot
//! read statically — leaves the component call exactly as it was, which reaches
//! the same primitive one adapter frame later. That direction is always safe;
//! the other never is.

use oxc::allocator::{Box as ArenaBox, CloneIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, BinaryOperator, BindingPattern,
    Expression, FormalParameter, FormalParameterKind, FormalParameters, JSXAttributeItem,
    JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName, LogicalOperator,
    NumberBase, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::span::Span;

use crate::analysis::symbol_of;
use crate::codegen::Helper;
use crate::ir::{Flow, NO_SCOPE, React, Region, RegionKind, STATIC_KEY, SourceKind};
use crate::lower::jsx::{attribute_expression, attribute_name};
use crate::lower::text;

use super::shape::Shaper;
use oxc::ast_visit::VisitMut;

/// The attribute names each construct answers to. An attribute outside its row
/// means the pass is looking at something it does not understand, so it refuses
/// — the adapter ignores the same attribute, and refusing is how "does not
/// understand" is spelled without guessing.
fn recognised(flow: Flow) -> &'static [&'static str] {
    match flow {
        Flow::Show => &["when", "fallback", "keyed"],
        Flow::For => &["each", "fallback", "keyed"],
        Flow::Repeat => &["count", "from", "fallback"],
        Flow::Loading => &["fallback", "on"],
        Flow::Suspense | Flow::Errored | Flow::ErrorBoundary | Flow::Switch => &["fallback"],
        Flow::Portal => &["target"],
        Flow::Match => &["when", "keyed"],
        Flow::Await | Flow::Dynamic | Flow::Reveal => &[],
    }
}

/// The attributes without which the construct means nothing.
fn required(flow: Flow) -> &'static [&'static str] {
    match flow {
        Flow::Show | Flow::Match => &["when"],
        Flow::For => &["each"],
        Flow::Repeat => &["count"],
        Flow::Errored | Flow::ErrorBoundary => &["fallback"],
        _ => &[],
    }
}

fn kind_of(flow: Flow) -> Option<RegionKind> {
    Some(match flow {
        Flow::Show | Flow::Switch => RegionKind::Branch,
        Flow::For | Flow::Repeat => RegionKind::Each,
        Flow::Loading | Flow::Suspense => RegionKind::Loading,
        Flow::Errored | Flow::ErrorBoundary => RegionKind::Error,
        Flow::Portal => RegionKind::Portal,
        // `Match` never reaches a primitive of its own: `Switch` folds every arm
        // into ONE branch, which is the shape the adapter produces and the
        // reason `ownership.rs` gives `Match` no node.
        Flow::Match | Flow::Await | Flow::Dynamic | Flow::Reveal => return None,
    })
}

// ============================================================================
// admissibility
// ============================================================================

/// Whether `element` can be lowered without guessing. Read-only, and exactly the
/// preconditions [`lower`] relies on — the two live in one file so a
/// precondition cannot be added to one without the other.
pub(super) fn admits<'a>(shaper: &Shaper<'a, '_>, flow: Flow, element: &JSXElement<'a>) -> bool {
    kind_of(flow).is_some() && admits_element(shaper, flow, element)
}

fn admits_element<'a>(shaper: &Shaper<'a, '_>, flow: Flow, element: &JSXElement<'a>) -> bool {
    let mut seen: Vec<&str> = Vec::new();
    for item in &element.opening_element.attributes {
        // C9's source list is a runtime object: a spread hides which props exist
        // at all, so there is nothing static to read the construct's shape off.
        let JSXAttributeItem::Attribute(attribute) = item else { return false };
        let JSXAttributeName::Identifier(identifier) = &attribute.name else { return false };
        let name = identifier.name.as_str();
        // A `children=` attribute competes with the JSX children for one slot,
        // and `component_call` already owns that precedence rule.
        if !recognised(flow).contains(&name) || seen.contains(&name) {
            return false;
        }
        seen.push(name);
        if !admits_value(shaper, flow, name, attribute.value.as_ref()) {
            return false;
        }
    }
    if required(flow).iter().any(|name| !seen.contains(name)) {
        return false;
    }
    if flow == Flow::Switch { admits_arms(shaper, element) } else { true }
}

/// The one prop whose VALUE the lowering has to resolve statically, because the
/// key it builds is a different expression depending on the answer.
fn admits_value<'a>(
    shaper: &Shaper<'a, '_>,
    flow: Flow,
    name: &str,
    value: Option<&JSXAttributeValue<'a>>,
) -> bool {
    if name != "keyed" {
        return true;
    }
    match flow {
        // `keyed` decides whether the key carries the value or only its
        // truthiness. Anything the compiler cannot read is refused rather than
        // assumed — the two answers are different programs.
        Flow::Show | Flow::Match => boolean_of(value).is_some(),
        // `For` accepts a third answer: a key FUNCTION, told from a Cell by the
        // parameter it declares (§3.0 rule 1) — the discriminator
        // `components.ts` applies at runtime, asked at compile time.
        Flow::For => boolean_of(value).is_some() || key_function(shaper, value).is_some(),
        _ => false,
    }
}

/// `keyed` → `true`, `keyed={false}` → `false`, anything unreadable → `None`.
fn boolean_of(value: Option<&JSXAttributeValue<'_>>) -> Option<bool> {
    match value {
        None => Some(true),
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            match container.expression.as_expression() {
                Some(Expression::BooleanLiteral(literal)) => Some(literal.value),
                _ => None,
            }
        }
        Some(_) => None,
    }
}

/// A key function: written inline, or a binding the analysis resolved to a
/// function that declares a parameter. A NULLARY binding is a Cell (§3.0 rule 1)
/// and is therefore not one.
fn key_function<'a>(shaper: &Shaper<'a, '_>, value: Option<&JSXAttributeValue<'a>>) -> Option<()> {
    let Some(JSXAttributeValue::ExpressionContainer(container)) = value else { return None };
    let expression = container.expression.as_expression()?;
    let resolves = match expression {
        Expression::ArrowFunctionExpression(arrow) => !arrow.params.items.is_empty(),
        Expression::FunctionExpression(function) => !function.params.items.is_empty(),
        Expression::Identifier(_) => matches!(
            symbol_of(shaper.lift.scoping(), expression)
                .map(|symbol| shaper.lift.env().kind_of(symbol)),
            Some(SourceKind::Fn { nullary: false })
        ),
        _ => false,
    };
    resolves.then_some(())
}

/// A `Switch` is lowered only when its arms are literal `<Match>` elements
/// resolved by `SymbolId`. Anything else — a mapped list of arms, a component
/// that returns one — is a runtime decision, and the adapter is where it
/// belongs.
fn admits_arms<'a>(shaper: &Shaper<'a, '_>, element: &JSXElement<'a>) -> bool {
    let mut arms = 0;
    for child in &element.children {
        match child {
            JSXChild::Text(child) => {
                // Whitespace between arms is dropped by `children`; anything
                // else is content a branch has nowhere to put.
                if text::clean(child.span.source_text(shaper.source_text()), shaper.allocator)
                    .is_some()
                {
                    return false;
                }
            }
            JSXChild::Element(child) => {
                if shaper.flow_of_element(child) != Some(Flow::Match)
                    || !admits_element(shaper, Flow::Match, child)
                {
                    return false;
                }
                arms += 1;
            }
            _ => return false,
        }
    }
    arms > 0
}

// ============================================================================
// the lowering
// ============================================================================

/// One attribute, unwrapped to the expression the author wrote.
struct Attr<'a> {
    name: &'a str,
    value: Expression<'a>,
    span: Span,
}

/// Everything the construct carries: its attributes, and its children already
/// through the shape pass's own `children` rule.
fn parts<'a>(
    shaper: &mut Shaper<'a, '_>,
    element: &mut JSXElement<'a>,
) -> (Vec<Attr<'a>>, Vec<Expression<'a>>) {
    let allocator = shaper.allocator;
    let taken =
        std::mem::replace(&mut element.opening_element.attributes, ArenaVec::new_in(&allocator));
    let mut attrs = Vec::with_capacity(taken.len());
    for item in taken {
        let JSXAttributeItem::Attribute(attribute) = item else {
            unreachable!("a spread is refused by `admits`")
        };
        let attribute = attribute.unbox();
        let name = attribute_name(&attribute.name, allocator);
        let span = attribute.span;
        let value = match attribute.value {
            None => Expression::new_boolean_literal(span, true, &shaper.ast),
            Some(value) => attribute_expression(value, &shaper.ast),
        };
        attrs.push(Attr { name, value, span });
    }
    let children = std::mem::replace(&mut element.children, ArenaVec::new_in(&allocator));
    let kids = shaper.children(children);
    (attrs, kids)
}

fn take<'a>(attrs: &mut Vec<Attr<'a>>, name: &str) -> Option<Attr<'a>> {
    let at = attrs.iter().position(|attr| attr.name == name)?;
    Some(attrs.remove(at))
}

/// Lower one construct. `admits` has already said yes, so every `unreachable!`
/// below names a precondition rather than a hope.
pub(super) fn lower<'a>(
    shaper: &mut Shaper<'a, '_>,
    flow: Flow,
    element: ArenaBox<'a, JSXElement<'a>>,
) -> Region<'a> {
    let span = element.span;
    let mut element = element.unbox();
    shaper.consumed(&element.opening_element.name);
    let kind = kind_of(flow).expect("checked by `admits`");
    let (mut attrs, kids) = parts(shaper, &mut element);

    let mut region = match flow {
        Flow::Show => show(shaper, &mut attrs, kids, span),
        Flow::Switch => switch(shaper, &mut attrs, kids, span),
        Flow::For => list(shaper, &mut attrs, kids, span),
        Flow::Repeat => repeat(shaper, &mut attrs, kids, span),
        Flow::Loading | Flow::Suspense | Flow::Errored | Flow::ErrorBoundary => {
            boundary(shaper, flow, &mut attrs, kids, span)
        }
        Flow::Portal => portal(shaper, &mut attrs, kids, span),
        Flow::Match | Flow::Await | Flow::Dynamic | Flow::Reveal => {
            unreachable!("refused by `admits`")
        }
    };
    region.flow = flow;
    region.kind = kind;
    region.span = span;

    // The walk `component_call` gets for free by being spliced back into the
    // expression the visitor is standing on. A body still holding JSX, or a
    // nested flow construct, is shaped here and nowhere else.
    for slot in region_slots(&mut region) {
        shaper.visit_expression(slot);
    }
    region
}

fn region_slots<'a, 'r>(
    region: &'r mut Region<'a>,
) -> impl Iterator<Item = &'r mut Expression<'a>> {
    [
        region.key.as_mut(),
        Some(&mut region.body),
        region.keyed.as_mut(),
        region.fallback.as_mut(),
        region.on.as_mut(),
    ]
    .into_iter()
    .flatten()
}

fn blank<'a>(shaper: &Shaper<'a, '_>, span: Span) -> Region<'a> {
    Region {
        flow: Flow::Show,
        kind: RegionKind::Branch,
        flags: 0,
        span,
        key: None,
        body: Expression::new_null_literal(span, &shaper.ast),
        keyed: None,
        fallback: None,
        on: None,
    }
}

/// `Show` — `branch` on the value itself, or on its truthiness.
///
/// The keyed default re-renders when the VALUE moves, so the value IS the key
/// (`components.ts`), and one body serves every key because the arm is decided
/// by the value rather than by an index. `keyed={false}` moves only on a
/// truthiness flip, which IS an index, so it takes a two-row body table whose
/// falsy row is the fallback.
fn show<'a>(
    shaper: &mut Shaper<'a, '_>,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let when = take(attrs, "when").expect("checked by `admits`");
    let keyed = take(attrs, "keyed").is_none_or(
        |attr| !matches!(&attr.value, Expression::BooleanLiteral(literal) if !literal.value),
    );
    let inert = inert_bodies(shaper, attrs, &kids);
    let konst = shaper.lift.rx(&when.value).konst.is_some();
    let fallback =
        take(attrs, "fallback").map(|attr| body_slot(shaper, vec![attr.value], attr.span));
    let content = body_slot_of(shaper, kids, span);
    let cell = shaper.cell_value(when.value, when.span);
    let read = read_of(shaper, dup(shaper, &cell), span);
    let statik = is_static(shaper, &read, konst);

    let mut region = blank(shaper, span);
    if keyed {
        // `value || false` collapses every falsy value onto ONE key, which is
        // what keeps a fallback in place across `0`, `""` and `null`.
        region.key = Some(arrow(shaper, or_false(shaper, read, span), span));
        region.body = keyed_body(shaper, &cell, content, fallback, span);
    } else {
        let one = number(shaper, 1.0, span);
        let zero = number(shaper, 0.0, span);
        region.key = Some(arrow(shaper, ternary(shaper, read, one, zero, span), span));
        // Non-keyed children are handed the narrowed accessor, which is the
        // `when` Cell itself, so their reads stay live inside the body.
        let content = content.map(|body| pass_value(shaper, body, cell, span));
        region.body = table(shaper, vec![fallback, content], span);
    }
    region.flags = flags(statik, inert);
    region
}

/// `Switch` / `Match` — one `branch` keyed on the winning arm's INDEX. Row 0 is
/// the fallback, so "no arm matched" is a key like any other.
fn switch<'a>(
    shaper: &mut Shaper<'a, '_>,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let fallback =
        take(attrs, "fallback").map(|attr| body_slot(shaper, vec![attr.value], attr.span));
    let mut bodies: Vec<Option<Expression<'a>>> = vec![fallback];
    let mut tests: Vec<(Expression<'a>, Span)> = Vec::new();
    let mut statik = true;

    for kid in kids {
        let Expression::JSXElement(arm) = kid else { unreachable!("checked by `admits`") };
        let arm_span = arm.span;
        let mut arm = arm.unbox();
        shaper.consumed(&arm.opening_element.name);
        let (mut arm_attrs, arm_kids) = parts(shaper, &mut arm);
        let when = take(&mut arm_attrs, "when").expect("checked by `admits`");
        let konst = shaper.lift.rx(&when.value).konst.is_some();
        let cell = shaper.cell_value(when.value, when.span);
        let value = read_of(shaper, dup(shaper, &cell), arm_span);
        let test = read_of(shaper, cell, arm_span);
        statik &= is_static(shaper, &test, konst);
        let body = body_slot_of(shaper, arm_kids, arm_span)
            .map(|body| pass_value(shaper, body, value, arm_span));
        tests.push((test, arm_span));
        bodies.push(body);
    }

    // `() => a() ? 1 : b() ? 2 : 0` — the first truthy arm wins, in written
    // order, exactly as `Switch`'s memo scans them.
    let mut key = number(shaper, 0.0, span);
    for (index, (test, arm_span)) in tests.into_iter().enumerate().rev() {
        let taken = number(shaper, (index + 1) as f64, arm_span);
        key = ternary(shaper, test, taken, key, arm_span);
    }

    let mut region = blank(shaper, span);
    region.key = Some(arrow(shaper, key, span));
    region.body = table(shaper, bodies, span);
    region.flags = flags(statik, false);
    region
}

/// `For` — `each`, whose `keyOf` is the whole of the keying contract. One
/// primitive, three modes: absent or `true` is IDENTITY, `false` is positional,
/// a function is a custom key (K1).
fn list<'a>(
    shaper: &mut Shaper<'a, '_>,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let source = take(attrs, "each").expect("checked by `admits`");
    let fallback =
        take(attrs, "fallback").map(|attr| body_slot(shaper, vec![attr.value], attr.span));
    let keyed = match take(attrs, "keyed") {
        None => None,
        Some(attr) => match &attr.value {
            // absent and `true` are the same arm — identity is the item — and
            // `null` is how `each` spells it.
            Expression::BooleanLiteral(literal) if literal.value => None,
            Expression::BooleanLiteral(_) => {
                Some(Expression::new_boolean_literal(attr.span, false, &shaper.ast))
            }
            _ => Some(attr.value),
        },
    };
    // O3, which the flow pass has to keep raising because it is the pass that
    // took the component call away. A by-item row is a plain value, so
    // `{item.name}` is applied once with no thunk — right whenever the rows are
    // what `mapArray` recreated, and silently stale when they are store proxies.
    if shaper.dev() && keyed.is_none() && shaper.unproven_rows(&source.value) {
        shaper.diagnose(
            crate::diag::Code::Barq004,
            source.span,
            "For: the origin of `each` cannot be proved to be values `mapArray` recreates, so a \
             member read on the row item is applied once with no effect (DESIGN O3). If these \
             rows are store proxies, read them through an accessor instead.",
        );
    }

    let mut region = blank(shaper, span);
    region.key = Some(shaper.cell_value(source.value, source.span));
    region.keyed = keyed;
    region.body = body_slot_of(shaper, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));
    region.fallback = fallback;
    region
}

/// `Repeat` — `each`'s fourth mode, where the source is a count.
fn repeat<'a>(
    shaper: &mut Shaper<'a, '_>,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let count = take(attrs, "count").expect("checked by `admits`");
    let from = take(attrs, "from");
    let fallback =
        take(attrs, "fallback").map(|attr| body_slot(shaper, vec![attr.value], attr.span));
    let row = body_slot_of(shaper, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));

    let mut region = blank(shaper, span);
    region.key = Some(shaper.cell_value(count.value, count.span));
    region.keyed = Some(shaper.helper(Helper::Count, span));
    region.body = match from {
        // `from` shifts the index the row Block sees: one addition per
        // activation, and nothing at all when it is absent.
        Some(attr) => {
            let shift = shaper.cell_value(attr.value, attr.span);
            shift_index(shaper, row, shift, attr.span)
        }
        None => row,
    };
    region.fallback = fallback;
    region
}

/// `Loading` / `Suspense` / `Errored` / `ErrorBoundary` — `boundary`, whose key
/// is its own collector's state and therefore never the compiler's.
fn boundary<'a>(
    shaper: &mut Shaper<'a, '_>,
    flow: Flow,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let fallback =
        take(attrs, "fallback").map(|attr| body_slot(shaper, vec![attr.value], attr.span));
    let on = take(attrs, "on").map(|attr| shaper.cell_value(attr.value, attr.span));
    let body = body_slot_of(shaper, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));

    let mut region = blank(shaper, span);
    region.body = body;
    // `ErrorBoundary`'s fallback takes the error BY VALUE where `Errored`'s
    // takes an accessor, and one wrapper is the whole difference between them.
    region.fallback = match (flow, fallback) {
        (Flow::ErrorBoundary, Some(fallback)) => Some(unwrap_error(shaper, fallback, span)),
        (_, fallback) => fallback,
    };
    region.on = on;
    region
}

/// `Portal` — the one primitive that takes no `(parent, anchor)`: it returns a
/// marker standing at its LEXICAL position, and the patch inserts that.
fn portal<'a>(
    shaper: &mut Shaper<'a, '_>,
    attrs: &mut Vec<Attr<'a>>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let target = take(attrs, "target").map(|attr| shaper.cell_value(attr.value, attr.span));
    let body = body_slot_of(shaper, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));

    let mut region = blank(shaper, span);
    // No target resolves to `document.body`, which is what `resolveTarget`
    // answers for `undefined`.
    region.key = Some(target.unwrap_or_else(|| {
        let void = Expression::new_void_0(span, &shaper.ast);
        arrow(shaper, void, span)
    }));
    region.body = body;
    region
}

// ============================================================================
// the shapes the four primitives take
// ============================================================================

/// The Cell or Block a renderable slot crosses as — the same three lines
/// `component_call` uses for `children`, because a body IS a `children` slot and
/// there is one rule for it (C6).
fn body_slot<'a>(
    shaper: &mut Shaper<'a, '_>,
    mut kids: Vec<Expression<'a>>,
    span: Span,
) -> Expression<'a> {
    let builds = kids.iter().any(|kid| shaper.builds_dom(kid));
    let value = if kids.len() == 1 {
        kids.remove(0)
    } else {
        let elements = kids.into_iter().map(ArrayExpressionElement::from).collect::<Vec<_>>();
        let elements = ArenaVec::from_iter_in(elements, &shaper.allocator);
        Expression::new_array_expression(span, elements, &shaper.ast)
    };
    if builds { shaper.block(value, span) } else { shaper.cell_value(value, span) }
}

fn body_slot_of<'a>(
    shaper: &mut Shaper<'a, '_>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Option<Expression<'a>> {
    (!kids.is_empty()).then(|| body_slot(shaper, kids, span))
}

/// A body table: `[b0, b1, …]`, indexed by an integer key. An absent row is
/// `null`, which `region` reads as "build nothing".
fn table<'a>(
    shaper: &Shaper<'a, '_>,
    bodies: Vec<Option<Expression<'a>>>,
    span: Span,
) -> Expression<'a> {
    let elements = bodies
        .into_iter()
        .map(|body| body.unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast)))
        .map(ArrayExpressionElement::from)
        .collect::<Vec<_>>();
    let elements = ArenaVec::from_iter_in(elements, &shaper.allocator);
    Expression::new_array_expression(span, elements, &shaper.ast)
}

/// `Show`'s keyed body: read the value once at ACTIVATION time and dispatch.
///
/// That read is a SECOND evaluation of the `when` Cell — the key ran first, in
/// the same synchronous step, and a Cell is explicitly not memoised (C3.2), so
/// this is within the ABI rather than around it. It costs one read per REBUILD,
/// never per key evaluation, and it is what lets a keyed body tell a truthy
/// value from a falsy one without the slot argument `branch` deliberately does
/// not have.
fn keyed_body<'a>(
    shaper: &mut Shaper<'a, '_>,
    cell: &Expression<'a>,
    content: Option<Expression<'a>>,
    fallback: Option<Expression<'a>>,
    span: Span,
) -> Expression<'a> {
    let temp = shaper.uids.temp();
    let read = read_of(shaper, dup(shaper, cell), span);
    let declaration = binding(shaper, temp, read, span);

    let shown = match content {
        Some(body) => {
            let scope = shaper.ident(shaper.scope, span);
            let taken = shaper.ident(temp, span);
            call(shaper, body, vec![scope, taken], span)
        }
        None => Expression::new_null_literal(span, &shaper.ast),
    };
    let hidden = match fallback {
        Some(body) => {
            let scope = shaper.ident(shaper.scope, span);
            call(shaper, body, vec![scope], span)
        }
        None => Expression::new_null_literal(span, &shaper.ast),
    };
    let test = shaper.ident(temp, span);
    let picked = ternary(shaper, test, shown, hidden, span);
    let statements = ArenaVec::from_iter_in(
        [declaration, Statement::new_return_statement(span, Some(picked), &shaper.ast)],
        &shaper.allocator,
    );
    let body = ArrowFunctionBody::new_function_body(
        span,
        ArenaVec::new_in(&shaper.allocator),
        statements,
        &shaper.ast,
    );
    let scope = shaper.scope;
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[scope], span),
        None,
        body,
        &shaper.ast,
    );
    shaper.brand(arrow, span)
}

/// `(_s$) => body(_s$, value)` — a body that wants the branch's value, wrapped
/// so the value is read at ACTIVATION time rather than captured at construction.
fn pass_value<'a>(
    shaper: &mut Shaper<'a, '_>,
    body: Expression<'a>,
    value: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    if !wants_value(&body) {
        return body;
    }
    let scope = shaper.ident(shaper.scope, span);
    let inner = call(shaper, body, vec![scope, value], span);
    let scope = shaper.scope;
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[scope], span),
        None,
        ArrowFunctionBody::from(inner),
        &shaper.ast,
    );
    shaper.brand(arrow, span)
}

/// Whether a Block declares a parameter beyond its scope. A body that does not
/// want the value is handed on untouched, which is the overwhelming case and
/// costs neither a closure nor a call.
fn wants_value(body: &Expression<'_>) -> bool {
    match body {
        // `_$block(fn)` — the brand is a call around the function it marks.
        Expression::CallExpression(call) if call.arguments.len() == 1 => {
            call.arguments.first().and_then(|it| it.as_expression()).is_some_and(wants_value)
        }
        Expression::ParenthesizedExpression(inner) => wants_value(&inner.expression),
        Expression::ArrowFunctionExpression(arrow) => arrow.params.items.len() > 1,
        Expression::FunctionExpression(function) => function.params.items.len() > 1,
        // A forwarded name, whose arity is not visible here. Offering the value
        // is free: a Cell ignores every argument (§3.0 rule 1).
        _ => true,
    }
}

/// `(_s$, i) => row(_s$, i + from())` — `Repeat`'s index shift.
fn shift_index<'a>(
    shaper: &mut Shaper<'a, '_>,
    row: Expression<'a>,
    from: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    let index = shaper.uids.temp();
    let scope = shaper.ident(shaper.scope, span);
    let read = read_of(shaper, from, span);
    let shifted = Expression::new_binary_expression(
        span,
        shaper.ident(index, span),
        BinaryOperator::Addition,
        read,
        &shaper.ast,
    );
    let inner = call(shaper, row, vec![scope, shifted], span);
    let scope = shaper.scope;
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[scope, index], span),
        None,
        ArrowFunctionBody::from(inner),
        &shaper.ast,
    );
    shaper.brand(arrow, span)
}

/// `(_s$, e, r) => fallback(_s$, e(), r)` — `ErrorBoundary`'s fallback takes the
/// error by value where `boundary` hands it an accessor.
fn unwrap_error<'a>(
    shaper: &mut Shaper<'a, '_>,
    fallback: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    let error = shaper.uids.temp();
    let reset = shaper.allocator.alloc_str(&format!("{error}r")) as &'a str;
    let scope = shaper.ident(shaper.scope, span);
    let read = shaper.ident(error, span);
    let value = call(shaper, read, vec![], span);
    let handle = shaper.ident(reset, span);
    let inner = call(shaper, fallback, vec![scope, value, handle], span);
    let scope = shaper.scope;
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[scope, error, reset], span),
        None,
        ArrowFunctionBody::from(inner),
        &shaper.ast,
    );
    shaper.brand(arrow, span)
}

// ============================================================================
// the flags — a proof, or zero
// ============================================================================

/// `STATIC_KEY` rides P2's classification directly: `React::Static` IS "reads
/// nothing reactive", and `Opaque` — the value an expression takes when the
/// compiler could not read it either way — is not it.
///
/// `NO_SCOPE` needs every body to register nothing disposable, which after P1
/// is a question about the LOWERED body rather than about its markup: a root
/// that became a unit with an empty patch program is one `template()` clone and
/// nothing else — no effect, no listener, no ref, no nested construct, nothing a
/// `Scope` could hold.
fn flags(statik: bool, inert: bool) -> u8 {
    (if statik { STATIC_KEY } else { 0 }) | (if inert { NO_SCOPE } else { 0 })
}

/// The key expression, classified — the READ the primitive performs, never the
/// prop the author wrote. `when={on}` is a `Static` expression whose read is
/// `on()` and is not; getting that backwards would open no effect for a key that
/// moves, which is the one direction a flag may never be wrong in.
///
/// `konst` is the escape hatch for a literal that `cell_value` hoisted into a
/// `_k$N` the classifier has never seen: the CONSTANT was proved before the
/// hoist, so the read of it is static however the thunk is spelled.
fn is_static<'a>(shaper: &mut Shaper<'a, '_>, read: &Expression<'a>, konst: bool) -> bool {
    konst || shaper.lift.rx(read).react == React::Static
}

fn inert_bodies<'a>(shaper: &Shaper<'a, '_>, attrs: &[Attr<'a>], kids: &[Expression<'a>]) -> bool {
    kids.iter().all(|kid| inert_value(shaper, kid))
        && attrs
            .iter()
            .filter(|attr| attr.name == "fallback")
            .all(|attr| inert_value(shaper, &attr.value))
}

/// A body that builds no reactive work: a compiled unit with no patches, or a
/// literal. Everything else — a component call, a thunk, a name — is refused,
/// because the flag has to be a proof and the safe direction is zero.
fn inert_value<'a>(shaper: &Shaper<'a, '_>, value: &Expression<'a>) -> bool {
    match value {
        // An author-written thunk around the body. The Block the compiler
        // builds is the same either way, so the proof looks through it — what
        // it is a proof ABOUT is the subtree, not the syntax around it.
        Expression::ArrowFunctionExpression(arrow) => {
            arrow.body.as_expression().is_some_and(|body| inert_value(shaper, body))
        }
        Expression::Identifier(identifier) => shaper
            .uids
            .root_index(identifier.name.as_str())
            .is_some_and(|index| shaper.inert_root(index)),
        Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_) => true,
        _ => false,
    }
}

// ============================================================================
// arena construction
// ============================================================================

/// A Cell read in two places needs the same EXPRESSION twice, and an owned AST
/// node cannot be in two places. `cell_value` has already produced a Cell, so
/// what is duplicated is the compiler's own small expression — an identifier, a
/// member read, a thunk — never a user statement.
fn dup<'a>(shaper: &Shaper<'a, '_>, cell: &Expression<'a>) -> Expression<'a> {
    cell.clone_in_with_semantic_ids(shaper.allocator)
}

/// Reading a Cell. A plain thunk is UNWRAPPED rather than called, which is the
/// same rule `dom::value_expression` applies inside a fused effect: `() => c()`
/// read as `c()` is one closure and one call fewer, and the same value.
fn read_of<'a>(shaper: &Shaper<'a, '_>, cell: Expression<'a>, span: Span) -> Expression<'a> {
    if let Expression::ArrowFunctionExpression(arrow) = &cell
        && !arrow.r#async
        && arrow.params.items.is_empty()
        && arrow.params.rest.is_none()
        && !matches!(arrow.body, ArrowFunctionBody::FunctionBody(_))
    {
        let Expression::ArrowFunctionExpression(arrow) = cell else {
            unreachable!("matched above")
        };
        return arrow.unbox().body.into_expression();
    }
    call(shaper, cell, Vec::new(), span)
}

fn call<'a>(
    shaper: &Shaper<'a, '_>,
    callee: Expression<'a>,
    arguments: Vec<Expression<'a>>,
    span: Span,
) -> Expression<'a> {
    let arguments =
        ArenaVec::from_iter_in(arguments.into_iter().map(Argument::from), &shaper.allocator);
    Expression::new_call_expression(span, callee, None, arguments, false, &shaper.ast)
}

fn arrow<'a>(shaper: &Shaper<'a, '_>, body: Expression<'a>, span: Span) -> Expression<'a> {
    Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[], span),
        None,
        ArrowFunctionBody::from(body),
        &shaper.ast,
    )
}

fn params<'a>(
    shaper: &Shaper<'a, '_>,
    names: &[&'a str],
    span: Span,
) -> ArenaBox<'a, FormalParameters<'a>> {
    let mut items = ArenaVec::new_in(&shaper.allocator);
    for name in names {
        let pattern = BindingPattern::new_binding_identifier(span, *name, &shaper.ast);
        items.push(FormalParameter::new(
            span,
            ArenaVec::new_in(&shaper.allocator),
            pattern,
            None,
            None,
            false,
            None,
            false,
            false,
            &shaper.ast,
        ));
    }
    FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        items,
        None,
        &shaper.ast,
    )
}

fn ternary<'a>(
    shaper: &Shaper<'a, '_>,
    test: Expression<'a>,
    consequent: Expression<'a>,
    alternate: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    Expression::new_conditional_expression(span, test, consequent, alternate, &shaper.ast)
}

fn or_false<'a>(shaper: &Shaper<'a, '_>, value: Expression<'a>, span: Span) -> Expression<'a> {
    Expression::new_logical_expression(
        span,
        value,
        LogicalOperator::Or,
        Expression::new_boolean_literal(span, false, &shaper.ast),
        &shaper.ast,
    )
}

fn number<'a>(shaper: &Shaper<'a, '_>, value: f64, span: Span) -> Expression<'a> {
    Expression::new_numeric_literal(span, value, None, NumberBase::Decimal, &shaper.ast)
}

fn binding<'a>(
    shaper: &Shaper<'a, '_>,
    name: &'a str,
    init: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let declarator = VariableDeclarator::new(
        span,
        VariableDeclarationKind::Const,
        BindingPattern::new_binding_identifier(span, name, &shaper.ast),
        None,
        Some(init),
        false,
        &shaper.ast,
    );
    Statement::new_variable_declaration(
        span,
        VariableDeclarationKind::Const,
        [declarator],
        false,
        &shaper.ast,
    )
}

impl<'a> Shaper<'a, '_> {
    /// What an arm's tag resolved to, by `SymbolId` — never by name, which is
    /// unsound under shadowing (K5).
    pub(super) fn flow_of_element(&self, element: &JSXElement<'a>) -> Option<Flow> {
        let JSXElementName::IdentifierReference(identifier) = &element.opening_element.name else {
            return None;
        };
        identifier
            .reference_id
            .get()
            .and_then(|id| self.lift.scoping().get_reference(id).symbol_id())
            .and_then(|symbol| self.lift.env().kind_of(symbol).flow())
    }
}
