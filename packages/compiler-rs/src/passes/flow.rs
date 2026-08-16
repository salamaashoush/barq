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
//! `Dynamic`, `Await` and `Reveal` lower too, since M9. `Await` is the outer of
//! two boundaries rather than a three-state key; `Reveal` is a `reveal` call
//! rather than a region row, because it creates a PROVIDE scope and not a range.
//!
//! ## What is not, and why each refusal is a fact rather than a gap
//!
//! - **`Switch` whose arms are not literal `<Match>` elements.** A mapped list
//!   of arms, or a component that returns one, is a runtime scan
//!   ([`admits_arms`]). `Match` goes with it: it is only ever read by a `Switch`
//!   that folded it.
//! - **`Dynamic` behind a spread.** Everything but `component` is the RESOLVED
//!   component's props, so the source list is not the construct's to read off.
//! - **An unreadable `keyed` written as a static attribute.** `<Show keyed={x}>`
//!   is refused where `<Show {...p}>` is not, and the asymmetry is deliberate:
//!   off a spread the pass emits both programs and tests at run time
//!   ([`show`]), and doing the same for a named prop it could have read would
//!   pay for a decision nobody asked it to defer.
//!
//! Every refusal leaves the component call exactly as it was, which reaches the
//! same primitive one adapter frame later. That direction is always safe; the
//! other never is.
//!
//! **The adapters are not a migration artefact and do not get deleted.**
//! `Opt::flow` is a flippable knob and `-O0` turns this pass off, so at `-O0`
//! every construct is a component call — 37 of 131 fixtures keep a flow import
//! there, against 0 at `-Ox`. §6 L3 grades this pass by comparing the two, so
//! `components.ts` and `ssr.ts`'s string half are the reference it is graded
//! against. `CODESIGN.md` §4.1's row is struck on that ground.

use oxc::allocator::{Box as ArenaBox, CloneIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, BinaryOperator, BindingPattern,
    Expression, FormalParameter, FormalParameterKind, FormalParameters, IdentifierName,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    LogicalOperator, NumberBase, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::span::Span;

use crate::analysis::symbol_of;
use crate::codegen::Helper;
use crate::ir::{Flow, NO_SCOPE, React, Region, RegionKind, STATIC_KEY, SourceKind};
use crate::lower::jsx::{attribute_expression, attribute_name};
use crate::lower::text;

use super::shape::{Shaper, Source};
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
        Flow::Await => &["resource", "loading", "error"],
        Flow::Reveal => &["order", "collapsed"],
        // Every other attribute IS the props of whatever the component resolves
        // to, so there is no row to close here: `admits` reads the tag's own
        // props off the list and hands the rest through.
        Flow::Dynamic => &[],
    }
}

/// The attributes without which the construct means nothing.
fn required(flow: Flow) -> &'static [&'static str] {
    match flow {
        Flow::Show | Flow::Match => &["when"],
        Flow::For => &["each"],
        Flow::Repeat => &["count"],
        Flow::Errored | Flow::ErrorBoundary => &["fallback"],
        Flow::Await => &["resource"],
        Flow::Dynamic => &["component"],
        _ => &[],
    }
}

fn kind_of(flow: Flow) -> Option<RegionKind> {
    Some(match flow {
        Flow::Show | Flow::Switch | Flow::Dynamic => RegionKind::Branch,
        Flow::For | Flow::Repeat => RegionKind::Each,
        // `Await` is the OUTER of two boundaries: the loading one, whose body
        // holds the error one, whose body reads the resource. Reading a
        // resource before it settles throws `NotReady` and after it fails throws
        // the error, so the two boundaries ARE the three states — no key, no
        // body table, and no property test to tell a Resource from a Cell.
        Flow::Loading | Flow::Suspense | Flow::Await => RegionKind::Loading,
        Flow::Errored | Flow::ErrorBoundary => RegionKind::Error,
        Flow::Portal => RegionKind::Portal,
        // `Match` never reaches a primitive of its own: `Switch` folds every arm
        // into ONE branch, which is the shape the adapter produces and the
        // reason `ownership.rs` gives `Match` no node.
        //
        // `Reveal` is not a range at all — it is a provide scope — so it has no
        // region row and is lowered to a direct `reveal` call instead.
        Flow::Match | Flow::Reveal => return None,
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

/// The same question for the one construct with no region row.
pub(super) fn admits_reveal<'a>(shaper: &Shaper<'a, '_>, element: &JSXElement<'a>) -> bool {
    admits_element(shaper, Flow::Reveal, element)
}

/// Whether a SPREAD may carry this construct's props.
///
/// M9 recorded the refusal as one gap; it is two, and only one of them is about
/// the spread.
///
/// For `For` there was never a gap at all: `keyOf` is already a runtime argument
/// `each` dispatches on, `mapArray` decides what a row's `item` and `index` are,
/// and the row Block's own parameter list is `(scope, item, index)` in all three
/// modes — the three keying fixtures differ at the `keyOf` argument and nowhere
/// else. The same is true of every pass-through construct here.
///
/// For `Show` the gap was real — `admits_value` refuses an unreadable `keyed`
/// because "the two answers are different programs", one body against a two-row
/// table — and [`show`] closes it by emitting both and testing at run time. The
/// keyed body already dispatches, so the table is an optimisation of it rather
/// than a second mechanism.
///
/// What is left, and neither is about spreads:
///
/// - **`Switch`** refuses on [`admits_arms`]: its arms must be literal `<Match>`
///   elements resolved by `SymbolId`, and `<Switch>{arms.map(…)}</Switch>` is a
///   runtime scan. `Match` goes with it, because it is only ever read by a
///   `Switch` that folded it. Those two adapters are not deletable by any amount
///   of spread work.
/// - **`Dynamic`**'s unrecognised props ARE the resolved component's, so its
///   source list is not the construct's to read off.
fn admits_spread(flow: Flow) -> bool {
    #[expect(clippy::match_same_arms, reason = "one arm per construct, each with its own reason")]
    match flow {
        Flow::For
        | Flow::Repeat
        | Flow::Loading
        | Flow::Suspense
        | Flow::Errored
        | Flow::ErrorBoundary
        | Flow::Portal
        | Flow::Await
        | Flow::Reveal => true,
        // Both answers emitted, the test at run time. See [`show`].
        Flow::Show => true,
        // Read only by a `Switch` that folded it, and `Switch` refuses.
        Flow::Match => false,
        // `admits_arms` — a fact about the construct, not about spreads.
        Flow::Switch => false,
        // The source list is the resolved component's props, not the region's.
        Flow::Dynamic => false,
    }
}

fn admits_element<'a>(shaper: &Shaper<'a, '_>, flow: Flow, element: &JSXElement<'a>) -> bool {
    let mut seen: Vec<&str> = Vec::new();
    let mut spread = false;
    for item in &element.opening_element.attributes {
        // C9's source list is a runtime object, so a spread hides WHICH props
        // exist. That is fatal only where a prop decides the shape of the
        // emitted program rather than the value of an argument.
        let JSXAttributeItem::Attribute(attribute) = item else {
            if !admits_spread(flow) {
                return false;
            }
            // A prop written before a spread can be overridden by it, so it
            // stops being static — `seen` is cleared for the duplicate check
            // and every name reverts to the source list.
            spread = true;
            seen.clear();
            continue;
        };
        let JSXAttributeName::Identifier(identifier) = &attribute.name else { return false };
        let name = identifier.name.as_str();
        // A `children=` attribute competes with the JSX children for one slot,
        // and `component_call` already owns that precedence rule.
        //
        // `Dynamic` is the one construct whose extra attributes are not its own:
        // everything but `component` is the resolved component's props, and it
        // passes them through as a source list rather than reading them.
        let admitted = recognised(flow).contains(&name)
            || (flow == Flow::Dynamic && name != "children")
            || (flow == Flow::Dynamic && name == "component");
        if !admitted || seen.contains(&name) {
            return false;
        }
        seen.push(name);
        if !admits_value(shaper, flow, name, attribute.value.as_ref()) {
            return false;
        }
    }
    // A required prop may arrive through the spread, where nothing can see it.
    // The adapter had the same blindness and reached the same runtime error, so
    // refusing here would only move which frame reports it.
    if !spread && required(flow).iter().any(|name| !seen.contains(name)) {
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
    /// Whether the expression is the one the AUTHOR wrote at this name, or a
    /// member read off the spread source list. The two are not interchangeable:
    /// an authored expression still has to be wrapped into the Cell or Block the
    /// primitive takes, and a member of a props object ALREADY IS one (C3.1), so
    /// wrapping it a second time would hand the runtime a Cell holding a Cell.
    /// It is also what every flag proof reads — nothing off a spread is proven.
    proven: bool,
}

/// Everything the construct carries: its attributes, its children already
/// through the shape pass's own `children` rule, and — when a spread put some of
/// the props out of static reach — the source list to read the rest off.
///
/// The split is written where `_$props` already puts it. Sources are last-wins,
/// so an attribute written AFTER the last spread cannot be overridden and is
/// read directly; everything up to and including that spread goes into the list.
struct Bag<'a> {
    /// Attributes nothing can override, in written order.
    statik: Vec<Attr<'a>>,
    /// The binding name and the source list, when a spread is present.
    spread: Option<(&'a str, Expression<'a>)>,
    span: Span,
}

impl<'a> Bag<'a> {
    /// The construct's prop of this name, wherever it lives. `proven` on the
    /// result is what tells the caller which of the two it got.
    fn take(&mut self, shaper: &Shaper<'a, '_>, name: &'static str) -> Option<Attr<'a>> {
        if let Some(at) = self.statik.iter().position(|attr| attr.name == name) {
            return Some(self.statik.remove(at));
        }
        let (binding, _) = self.spread.as_ref()?;
        let span = self.span;
        let object = shaper.ident(binding, span);
        let value = Expression::new_static_member_expression(
            span,
            object,
            IdentifierName::new(span, name, &shaper.ast),
            false,
            &shaper.ast,
        );
        Some(Attr { name, value, span, proven: false })
    }

    fn has_spread(&self) -> bool {
        self.spread.is_some()
    }
}

/// A renderable slot — a `fallback`, a `loading` arm — as the Block or Cell the
/// primitive takes. An authored expression is wrapped; a prop off the source
/// list is handed on, because C3.1 already made it one.
fn slot_of<'a>(shaper: &mut Shaper<'a, '_>, attr: Attr<'a>) -> Expression<'a> {
    if attr.proven { body_slot(shaper, vec![attr.value], attr.span) } else { attr.value }
}

/// A renderable slot that the LOWERING calls rather than the primitive, and
/// therefore has to know the provenance of. Only `Show` needs it.
struct Slot<'a> {
    value: Expression<'a>,
    /// The slot came off a source list, so the call is an optional one: the
    /// spread may simply not carry this prop, and `Show`'s `fallback` is
    /// optional in the first place.
    maybe: bool,
}

impl<'a> Slot<'a> {
    fn of(shaper: &mut Shaper<'a, '_>, attr: Attr<'a>) -> Self {
        let maybe = !attr.proven;
        Self { value: slot_of(shaper, attr), maybe }
    }

    fn invoke(
        self,
        shaper: &Shaper<'a, '_>,
        arguments: Vec<Expression<'a>>,
        span: Span,
    ) -> Expression<'a> {
        if self.maybe {
            optional_call(shaper, self.value, arguments, span)
        } else {
            call(shaper, self.value, arguments, span)
        }
    }
}

/// The same rule for a slot the primitive takes as a Cell and CALLS itself:
/// `each`'s source. A spread hands its own object's values through untouched,
/// so what arrives may be a Cell or may be a raw value — which is exactly the
/// slot the primitive already validates.
fn cell_of<'a>(shaper: &mut Shaper<'a, '_>, attr: Attr<'a>) -> Expression<'a> {
    if attr.proven { shaper.cell_value(attr.value, attr.span) } else { attr.value }
}

/// A slot the primitive READS but does not treat as a Cell — `portal`'s target,
/// a boundary's `on`, `Reveal`'s order. The adapters wrapped these in
/// `() => readValue(prop)` so a raw value in the slot is a value rather than a
/// call on a non-function, and the lowering keeps that wrapper for exactly the
/// props a spread put out of reach.
fn value_cell<'a>(
    shaper: &mut Shaper<'a, '_>,
    attr: Attr<'a>,
    origin: &'static str,
) -> Expression<'a> {
    if attr.proven {
        return shaper.cell_value(attr.value, attr.span);
    }
    let span = attr.span;
    let read = read_slot(shaper, attr.value, origin, span);
    arrow(shaper, read, span)
}

/// `_$readSlot(v, "origin")` — §3.0 rule 2, emitted rather than assumed.
fn read_slot<'a>(
    shaper: &mut Shaper<'a, '_>,
    value: Expression<'a>,
    origin: &'static str,
    span: Span,
) -> Expression<'a> {
    let callee = shaper.helper(Helper::ReadSlot, span);
    let name = Expression::new_string_literal(span, origin, None, &shaper.ast);
    call(shaper, callee, vec![value, name], span)
}

/// The construct's body: its JSX children, or — when it has none and a spread
/// may carry them — the `children` prop off the source list.
///
/// JSX children are written INSIDE the element, so they come after every spread
/// and win. That is the same precedence `component_call` applies by pushing them
/// into the last record.
fn body_of<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Option<Expression<'a>> {
    if let Some(body) = body_slot_of(shaper, kids, span) {
        return Some(body);
    }
    bag.take(shaper, "children").map(|attr| slot_of(shaper, attr))
}

fn parts<'a>(
    shaper: &mut Shaper<'a, '_>,
    element: &mut JSXElement<'a>,
) -> (Bag<'a>, Vec<Expression<'a>>) {
    let allocator = shaper.allocator;
    let span = element.span;
    let taken =
        std::mem::replace(&mut element.opening_element.attributes, ArenaVec::new_in(&allocator));

    // Nothing is put in the source list until a spread is seen, and everything
    // written after the LAST one goes back to being static — which is why a
    // construct with no spread reaches the same expressions it always did.
    let mut statik: Vec<Attr<'a>> = Vec::with_capacity(taken.len());
    let mut sources: Vec<Source<'a>> = Vec::new();
    for item in taken {
        match item {
            JSXAttributeItem::SpreadAttribute(spread) => {
                let record = std::mem::take(&mut statik);
                sources.push(Source::Record(
                    record
                        .into_iter()
                        .map(|attr| {
                            let cell = shaper.cell_at(attr.value, attr.span, Some(attr.name));
                            shaper.property(attr.name, cell, attr.span)
                        })
                        .collect(),
                ));
                sources.push(Source::Spread(spread.unbox().argument));
            }
            JSXAttributeItem::Attribute(attribute) => {
                let attribute = attribute.unbox();
                let name = attribute_name(&attribute.name, allocator);
                let span = attribute.span;
                let value = match attribute.value {
                    None => Expression::new_boolean_literal(span, true, &shaper.ast),
                    Some(value) => attribute_expression(value, &shaper.ast, shaper.allocator),
                };
                statik.push(Attr { name, value, span, proven: true });
            }
        }
    }

    let children = std::mem::replace(&mut element.children, ArenaVec::new_in(&allocator));
    let kids = shaper.children(children);
    let spread = (!sources.is_empty()).then(|| {
        let binding = shaper.mint_sources();
        (binding, shaper.source_list(sources, span))
    });
    (Bag { statik, spread, span }, kids)
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
    let (mut bag, kids) = parts(shaper, &mut element);

    let mut region = match flow {
        Flow::Show => show(shaper, &mut bag, kids, span),
        Flow::Switch => switch(shaper, &mut bag, kids, span),
        Flow::For => list(shaper, &mut bag, kids, span),
        Flow::Repeat => repeat(shaper, &mut bag, kids, span),
        Flow::Loading | Flow::Suspense | Flow::Errored | Flow::ErrorBoundary => {
            boundary(shaper, flow, &mut bag, kids, span)
        }
        Flow::Portal => portal(shaper, &mut bag, kids, span),
        Flow::Await => await_boundaries(shaper, &mut bag, kids, span),
        Flow::Dynamic => dynamic(shaper, &mut bag, kids, span),
        Flow::Match | Flow::Reveal => unreachable!("refused by `admits`"),
    };
    region.flow = flow;
    region.kind = kind;
    region.span = span;
    region.sources = bag.spread;

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
        // A spread argument is an ordinary expression and may hold JSX of its
        // own. It left the tree with the rest of the construct, so it is shaped
        // here or nowhere.
        region.sources.as_mut().map(|(_, list)| list),
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
        sources: None,
    }
}

/// Which of `Show`'s three programs is being emitted.
enum Keying<'a> {
    /// The value IS the key, and one body serves every key.
    Value,
    /// `keyed={false}`: the key is a truthiness INDEX into a two-row table.
    Index,
    /// The carrier came through a spread and nothing can read it, so both
    /// answers are emitted and a test picks between them at run time. The
    /// expression is `_$readSlot(…, "Show.keyed") !== false`, duplicable.
    Runtime(Expression<'a>),
}

/// `Show` — `branch` on the value itself, or on its truthiness.
///
/// The keyed default re-renders when the VALUE moves, so the value IS the key
/// (`components.ts`), and one body serves every key because the arm is decided
/// by the value rather than by an index. `keyed={false}` moves only on a
/// truthiness flip, which IS an index, so it takes a two-row body table whose
/// falsy row is the fallback.
///
/// ## The third arm, and why it is not a table
///
/// A `keyed` the compiler cannot read is what `admits_value` refuses in as many
/// words — "the two answers are different programs" — and off a SPREAD there is
/// nothing to read at all. What makes it emittable anyway is that the two
/// programs differ in exactly two expressions, and `branch`'s ABI already
/// covers both: the KEY, and what the content Block is handed.
///
/// The keyed body is the general one. It reads the value at activation and
/// dispatches to content or fallback itself, which is the two-row table's whole
/// job — so the table is an optimisation of the keyed shape rather than a second
/// mechanism, and the runtime arm keeps the general one and varies its slot
/// argument. `branch` is told a single Block, which it uses for every key, so
/// the two key SPACES — a value, or 0/1 — never have to agree.
///
/// The test is re-read rather than bound once. The adapter read `keyed` once at
/// construction; this reads it in the key closure and again at activation, on
/// the same ground `keyed_body`'s second read of `when` already stands on: a
/// Cell is explicitly not memoised (C3.2). The difference is observable only for
/// a `keyed` that CHANGES over the construct's life, where re-reading re-keys
/// the region and the adapter silently ignored it.
fn show<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let when = bag.take(shaper, "when").expect("checked by `admits`");
    let keying = match bag.take(shaper, "keyed") {
        None => Keying::Value,
        Some(attr) if attr.proven => match &attr.value {
            Expression::BooleanLiteral(literal) if !literal.value => Keying::Index,
            _ => Keying::Value,
        },
        Some(attr) => {
            let at = attr.span;
            let read = read_slot(shaper, attr.value, "Show.keyed", at);
            let no = Expression::new_boolean_literal(at, false, &shaper.ast);
            Keying::Runtime(Expression::new_binary_expression(
                at,
                read,
                BinaryOperator::StrictInequality,
                no,
                &shaper.ast,
            ))
        }
    };
    let inert = inert_bodies(shaper, bag, &kids);
    let konst = shaper.lift.rx(&when.value).konst.is_some();
    // `Show` is the one construct that CALLS its Block slots itself rather than
    // handing them to the primitive, so it is the one that has to know which of
    // them it can prove are there. A slot off the source list is a member read
    // and may be nothing at all.
    let fallback = bag.take(shaper, "fallback").map(|attr| Slot::of(shaper, attr));
    let content = match body_slot_of(shaper, kids, span) {
        Some(body) => Some(Slot { value: body, maybe: false }),
        None => bag.take(shaper, "children").map(|attr| Slot::of(shaper, attr)),
    };
    let cell = cell_of(shaper, when);
    let read = read_of(shaper, dup(shaper, &cell), span);
    let statik = is_static(shaper, &read, konst);

    let mut region = blank(shaper, span);
    match keying {
        // `value || false` collapses every falsy value onto ONE key, which is
        // what keeps a fallback in place across `0`, `""` and `null`.
        Keying::Value => {
            region.key = Some(arrow(shaper, or_false(shaper, read, span), span));
            region.body = keyed_body(shaper, &cell, None, content, fallback, span);
        }
        Keying::Index => {
            let one = number(shaper, 1.0, span);
            let zero = number(shaper, 0.0, span);
            region.key = Some(arrow(shaper, ternary(shaper, read, one, zero, span), span));
            // Non-keyed children are handed the narrowed accessor, which is the
            // `when` Cell itself, so their reads stay live inside the body.
            let content = content.map(|slot| pass_value(shaper, slot.value, cell, span));
            region.body = table(shaper, vec![fallback.map(|slot| slot.value), content], span);
        }
        Keying::Runtime(test) => {
            let keyed_key = or_false(shaper, read, span);
            let again = read_of(shaper, dup(shaper, &cell), span);
            let one = number(shaper, 1.0, span);
            let zero = number(shaper, 0.0, span);
            let index_key = ternary(shaper, again, one, zero, span);
            let picked = ternary(shaper, dup(shaper, &test), keyed_key, index_key, span);
            region.key = Some(arrow(shaper, picked, span));
            region.body = keyed_body(shaper, &cell, Some(test), content, fallback, span);
            // Nothing off a spread is proven, so neither flag is.
            return region;
        }
    }
    region.flags = flags(statik, inert);
    region
}

/// `Switch` / `Match` — one `branch` keyed on the winning arm's INDEX. Row 0 is
/// the fallback, so "no arm matched" is a key like any other.
fn switch<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let fallback = bag.take(shaper, "fallback").map(|attr| slot_of(shaper, attr));
    let mut bodies: Vec<Option<Expression<'a>>> = vec![fallback];
    let mut tests: Vec<(Expression<'a>, Span)> = Vec::new();
    let mut statik = true;

    for kid in kids {
        let Expression::JSXElement(arm) = kid else { unreachable!("checked by `admits`") };
        let arm_span = arm.span;
        let mut arm = arm.unbox();
        shaper.consumed(&arm.opening_element.name);
        let (mut arm_bag, arm_kids) = parts(shaper, &mut arm);
        let when = arm_bag.take(shaper, "when").expect("checked by `admits`");
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
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let source = bag.take(shaper, "each").expect("checked by `admits`");
    let fallback = bag.take(shaper, "fallback").map(|attr| slot_of(shaper, attr));
    let keyed = match bag.take(shaper, "keyed") {
        // Off a spread the three modes are not a compile-time choice, and they
        // do not have to be: `keyOf` is already a RUNTIME argument that `each`
        // dispatches on, and §3.0 rule 1 — a Cell declares no parameter, a key
        // function declares one — is the same discriminator the compiler
        // applies here statically. So the carrier goes through unresolved and
        // `each` reads it. The body is untouched either way: `mapArray` decides
        // what `item` and `index` ARE, and the row Block's parameter list is
        // `(scope, item, index)` in all three modes.
        Some(attr) if !attr.proven => Some(attr.value),
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
    if shaper.dev() && source.proven && keyed.is_none() && shaper.unproven_rows(&source.value) {
        shaper.diagnose(
            crate::diag::Code::Barq004,
            source.span,
            "For: the origin of `each` cannot be proved to be values `mapArray` recreates, so a \
             member read on the row item is applied once with no effect (DESIGN O3). If these \
             rows are store proxies, read them through an accessor instead.",
        );
    }

    let mut region = blank(shaper, span);
    region.key = Some(cell_of(shaper, source));
    region.keyed = keyed;
    region.body = body_of(shaper, bag, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));
    region.fallback = fallback;
    region
}

/// `Repeat` — `each`'s fourth mode, where the source is a count.
fn repeat<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let count = bag.take(shaper, "count").expect("checked by `admits`");
    let from = bag.take(shaper, "from");
    let fallback = bag.take(shaper, "fallback").map(|attr| slot_of(shaper, attr));
    let row = body_of(shaper, bag, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));

    let mut region = blank(shaper, span);
    region.key = Some(cell_of(shaper, count));
    region.keyed = Some(shaper.helper(Helper::Count, span));
    region.body = match from {
        // `from` shifts the index the row Block sees: one addition per
        // activation, and nothing at all when it is absent.
        //
        // Off a spread the prop is ALWAYS present as a member read — the list
        // may or may not carry it and nothing here can tell — so the shift is
        // emitted unconditionally and `_$readSlot(…) ?? 0` is what an absent
        // `from` reads as, which is the adapter's own `readValue(…) ?? 0`.
        Some(attr) => {
            let at = attr.span;
            let read = if attr.proven {
                let cell = shaper.cell_value(attr.value, at);
                read_of(shaper, cell, at)
            } else {
                let read = read_slot(shaper, attr.value, "Repeat.from", at);
                let zero = number(shaper, 0.0, at);
                Expression::new_logical_expression(
                    at,
                    read,
                    LogicalOperator::Coalesce,
                    zero,
                    &shaper.ast,
                )
            };
            shift_index(shaper, row, read, at)
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
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let fallback = bag.take(shaper, "fallback").map(|attr| slot_of(shaper, attr));
    let on = bag.take(shaper, "on").map(|attr| value_cell(shaper, attr, "Loading.on"));
    let body = body_of(shaper, bag, kids, span)
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
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let target = bag.take(shaper, "target").map(|attr| value_cell(shaper, attr, "Portal.target"));
    let body = body_of(shaper, bag, kids, span)
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

/// `Await` — two boundaries, not four states.
///
/// The three arms it used to compute a key for are the three things reading a
/// resource does: throw `NotReady` before it settles, throw the error after it
/// fails, return the value otherwise. So the loading boundary catches the first,
/// the error boundary inside it catches the second, and the body — which reads
/// the resource where the author wrote a parameter — is the third.
///
/// That also removes the property test the adapter needed. `resource={r}` is a
/// Cell like any other; nothing here asks whether it IS the resource or carries
/// one, because the only thing done with it is a read.
fn await_boundaries<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let resource = bag.take(shaper, "resource").expect("checked by `admits`");
    let loading = bag.take(shaper, "loading").map(|attr| slot_of(shaper, attr));
    let failed = bag.take(shaper, "error").map(|attr| slot_of(shaper, attr));

    // The body takes the settled VALUE where the author declared a parameter,
    // and a read of the resource is what produces it — after the two boundaries
    // above have had their answer.
    // ONE reference to the resource, in the one place its value is used. The
    // adapter needed four — a key and three bodies — which is what made a
    // shared local necessary and the discrimination test unavoidable.
    let body = match body_of(shaper, bag, kids, span) {
        Some(body) => pass_value(shaper, body, resource.value, span),
        None => Expression::new_null_literal(span, &shaper.ast),
    };

    let mut inner = blank(shaper, span);
    inner.flow = Flow::Errored;
    inner.kind = RegionKind::Error;
    inner.span = span;
    // `Await`'s error slot takes the error BY VALUE, exactly as
    // `ErrorBoundary`'s does.
    inner.fallback = failed.map(|fallback| unwrap_error(shaper, fallback, span));
    inner.body = body;
    let nested = shaper.nested_region(inner, span);

    let mut region = blank(shaper, span);
    region.fallback = loading;
    region.body = shaper.block(nested, span);
    region
}

/// `Dynamic` — a `branch` keyed on the component VALUE with ONE body, which is
/// what the adapter always did; what M9 removes is the props OBJECT it built by
/// `omit`, and the fifth element-creation path its string arm had.
fn dynamic<'a>(
    shaper: &mut Shaper<'a, '_>,
    bag: &mut Bag<'a>,
    kids: Vec<Expression<'a>>,
    span: Span,
) -> Region<'a> {
    let component = bag.take(shaper, "component").expect("checked by `admits`");
    let cell = shaper.cell_value(component.value, component.span);

    let mut properties = Vec::with_capacity(bag.statik.len() + 1);
    for attr in std::mem::take(&mut bag.statik) {
        let value = shaper.cell_value(attr.value, attr.span);
        properties.push(shaper.property(attr.name, value, attr.span));
    }
    if let Some(children) = body_slot_of(shaper, kids, span) {
        properties.push(shaper.property("children", children, span));
    }
    let properties = ArenaVec::from_iter_in(properties, &shaper.allocator);
    let props = Expression::new_object_expression(span, properties, &shaper.ast);

    let callee = shaper.helper(Helper::Dynamic, span);
    let scope = shaper.ident(shaper.scope, span);
    let call = call(shaper, callee, vec![scope, dup(shaper, &cell), props], span);
    let scope = shaper.scope;
    let body = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[scope], span),
        None,
        ArrowFunctionBody::from(call),
        &shaper.ast,
    );

    let mut region = blank(shaper, span);
    region.key = Some(cell);
    region.body = shaper.brand(body, span);
    region
}

/// An attribute as a Cell, or `() => void 0` when it was not written — which is
/// what an absent option reads as on the other side.
fn optional_cell<'a>(
    shaper: &mut Shaper<'a, '_>,
    attr: Option<Attr<'a>>,
    origin: &'static str,
    span: Span,
) -> Expression<'a> {
    match attr {
        Some(attr) => value_cell(shaper, attr, origin),
        None => {
            let value = Expression::new_void_0(span, &shaper.ast);
            arrow(shaper, value, span)
        }
    }
}

/// `Reveal` — a provide scope, so it is a CALL rather than a region row. The
/// order and the collapsed flag are Cells the compiler computed and the children
/// are the Block they already were; nothing reads a props record to find them.
pub(super) fn reveal<'a>(
    shaper: &mut Shaper<'a, '_>,
    element: ArenaBox<'a, JSXElement<'a>>,
) -> Expression<'a> {
    let span = element.span;
    let mut element = element.unbox();
    shaper.consumed(&element.opening_element.name);
    let (mut bag, kids) = parts(shaper, &mut element);

    let order = optional_cell(shaper, bag.take(shaper, "order"), "Reveal.order", span);
    let collapsed = optional_cell(shaper, bag.take(shaper, "collapsed"), "Reveal.collapsed", span);
    let body = body_of(shaper, &mut bag, kids, span)
        .unwrap_or_else(|| Expression::new_null_literal(span, &shaper.ast));

    let callee = shaper.helper(Helper::Reveal, span);
    let scope = shaper.ident(shaper.scope, span);
    let mut call = call(shaper, callee, vec![scope, order, collapsed, body], span);
    // `reveal` is a call rather than a region row, so the source list is bound
    // here instead of in `region_call` — same shape, same one evaluation.
    if let Some((binding, mut list)) = bag.spread.take() {
        shaper.visit_expression(&mut list);
        call = bind_sources(shaper, binding, list, call, span);
    }
    call
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
///
/// `narrowed` is the third arm's other half. When it is `Some(test)` the slot
/// argument becomes `test ? value : cell` — the value under keyed, the narrowed
/// accessor under `keyed={false}` — which is the one thing the two-row table
/// does that this shape otherwise would not.
fn keyed_body<'a>(
    shaper: &mut Shaper<'a, '_>,
    cell: &Expression<'a>,
    narrowed: Option<Expression<'a>>,
    content: Option<Slot<'a>>,
    fallback: Option<Slot<'a>>,
    span: Span,
) -> Expression<'a> {
    let temp = shaper.uids.temp();
    let read = read_of(shaper, dup(shaper, cell), span);
    let declaration = binding(shaper, temp, read, span);

    let shown = match content {
        Some(slot) => {
            let scope = shaper.ident(shaper.scope, span);
            let taken = shaper.ident(temp, span);
            let taken = match narrowed {
                Some(test) => {
                    let accessor = dup(shaper, cell);
                    ternary(shaper, test, taken, accessor, span)
                }
                None => taken,
            };
            slot.invoke(shaper, vec![scope, taken], span)
        }
        None => Expression::new_null_literal(span, &shaper.ast),
    };
    let hidden = match fallback {
        Some(slot) => {
            let scope = shaper.ident(shaper.scope, span);
            slot.invoke(shaper, vec![scope], span)
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

/// `((_p$1) => call)(sources)` — the same binding `region_call` makes, for the
/// one construct that is a call rather than a region row.
fn bind_sources<'a>(
    shaper: &mut Shaper<'a, '_>,
    binding: &'a str,
    list: Expression<'a>,
    call_expression: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params(shaper, &[binding], span),
        None,
        ArrowFunctionBody::from(call_expression),
        &shaper.ast,
    );
    call(shaper, arrow, vec![list], span)
}

/// `(_s$, i) => row(_s$, i + from())` — `Repeat`'s index shift.
fn shift_index<'a>(
    shaper: &mut Shaper<'a, '_>,
    row: Expression<'a>,
    read: Expression<'a>,
    span: Span,
) -> Expression<'a> {
    let index = shaper.uids.temp();
    let scope = shaper.ident(shaper.scope, span);
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

/// A proof, so a spread is disqualifying: what the source list carries in the
/// slots this reads is exactly what cannot be seen.
fn inert_bodies<'a>(shaper: &Shaper<'a, '_>, bag: &Bag<'a>, kids: &[Expression<'a>]) -> bool {
    !bag.has_spread()
        && kids.iter().all(|kid| inert_value(shaper, kid))
        && bag
            .statik
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

/// `slot?.(…)` — a Block slot the compiler cannot prove is there.
///
/// Only `Show`'s keyed body needs it. Every other construct hands its optional
/// slots to the PRIMITIVE, which tests them itself (`each`'s `fallback === null
/// || fallback === undefined`); this one dispatches inline, so the absent case
/// is a call on `undefined` unless it is written here.
fn optional_call<'a>(
    shaper: &Shaper<'a, '_>,
    callee: Expression<'a>,
    arguments: Vec<Expression<'a>>,
    span: Span,
) -> Expression<'a> {
    let arguments =
        ArenaVec::from_iter_in(arguments.into_iter().map(Argument::from), &shaper.allocator);
    Expression::new_call_expression(span, callee, None, arguments, true, &shaper.ast)
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
