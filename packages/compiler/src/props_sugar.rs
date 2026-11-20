//! Props are written as values and carried as Cells.
//!
//! A component's props record holds a Cell per prop (C3), which is what keeps a
//! forward free and a copy from evaluating anything. This pass is what lets the
//! author not see that: `props.title` and a destructured `{ title }` are written
//! as the values their types say they are, and each read is rewritten here to
//! the call that performs it, before any other stage looks at the program.
//!
//! A component is a function with a capitalised name that holds JSX or is
//! written as a tag in the module, a default export that holds JSX, or a
//! function written inline at a route option the router renders. Inside one, every reference to its props is
//! one of four things, and all four are decided here so that no reference is
//! left holding a Cell where the author's type says a value:
//!
//! - `props.title`, a read: `props.title?.()`. A prop the caller left out has
//!   no Cell, so the read answers `undefined` as the value would.
//! - `props.title` handed straight on, as a component's attribute or as a
//!   child: left as the Cell itself, so forwarding stays identity (C5).
//! - `{...props}`, `omit(props, …)` and `cells(props)`: the record itself.
//! - anything else (`useThing(props)`, `props[key]`, `Object.keys(props)`):
//!   `values(props)`, a view that reads each Cell on access.
//!
//! A destructured parameter becomes one named record and each bound name the
//! read it stood for, so the names stay live where a JavaScript destructure
//! would have copied them once.

use oxc::allocator::{Allocator, Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget, BindingPattern,
    Expression, FormalParameters, Function, FunctionBody, IdentifierName, IdentifierReference,
    ImportDeclarationSpecifier, ImportOrExportKind, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, ModuleExportName, NumberBase,
    ObjectProperty, Program, PropertyKey, SimpleAssignmentTarget, Statement, StringLiteral,
    VariableDeclarationKind, VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc::semantic::{ScopeFlags, Scoping, SemanticBuilder, SemanticBuilderReturn, SymbolId};
use oxc::span::Span;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::options::ResolvedOptions;

/// The names this pass imports from the core, under the compiler's prefix.
const VALUES: &str = "_$values";
const OMIT: &str = "_$omit";
const WITH_DEFAULT: &str = "_$withDefault";
pub(crate) const READ: &str = "_$readProp";
const CARRY: &str = "_$carry";

/// The object under `_$carry(object)`, the record this pass makes of an
/// object of values spread onto a component.
pub(crate) fn carried<'e, 'a>(
    call: &'e oxc::ast::ast::CallExpression<'a>,
) -> Option<&'e Expression<'a>> {
    let Expression::Identifier(callee) = &call.callee else { return None };
    if callee.name != CARRY {
        return None;
    }
    match call.arguments.as_slice() {
        [argument] => argument.as_expression(),
        _ => None,
    }
}

/// What the pass leaves for the stages after it.
pub struct Outcome {
    pub refusals: Vec<Refusal>,
    /// Where each component's props parameter is declared. Analysis takes
    /// these, and nothing else, for the records whose members are Cells, so
    /// the two never disagree about what a component is.
    pub params: Vec<Span>,
}

/// A mistake this pass found, for the driver to report at `span`.
pub struct Refusal {
    pub span: Span,
    pub message: &'static str,
}

pub const ASSIGNED: &str = "A prop is assigned here, and props are read-only: the component \
     that passed it owns the value. Call a function prop to ask for the change, or keep a \
     signal of your own and write to that.";
pub const UNSUPPORTED_PATTERN: &str = "This props pattern cannot be kept reactive: a computed \
     key, a default inside a nested pattern, or a rest element inside one. Destructure one \
     level, or read the prop from `props` where it is used.";

/// The route options whose value the router renders as a component, so a
/// function written inline at one takes props as a component does.
const ROUTE_COMPONENT_KEYS: [&str; 5] =
    ["component", "pendingComponent", "errorComponent", "notFoundComponent", "shellComponent"];

/// One step from a prop's value into what a nested pattern bound.
#[derive(Clone, Copy)]
enum Step<'a> {
    Key(&'a str),
    Index(u32),
}

/// What a bound name stands for.
#[derive(Clone)]
enum Action<'a> {
    /// A props record under this name. `param` is the component's own
    /// parameter, the one record every later stage knows holds Cells, so only
    /// its members are handed on uncalled.
    Record { name: &'a str, param: bool },
    /// `record.prop`, then `steps` into its value.
    Field { record: &'a str, prop: &'a str, steps: Vec<Step<'a>>, param: bool },
    /// A Cell this pass declared in the component's body: a prop with a default.
    Cell(&'a str),
}

/// Rewrite every component's props reads in place. Answers with what it had to
/// refuse.
pub fn run<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    options: &ResolvedOptions,
) -> Outcome {
    let core_source: &str = &options.core_source;
    let SemanticBuilderReturn { semantic, .. } = SemanticBuilder::new().build(program);
    let scoping = semantic.into_scoping();

    let mut survey = Survey {
        scoping: &scoping,
        core_source,
        module_source: &options.module_source,
        tags: FxHashSet::default(),
        named: FxHashMap::default(),
        holds_jsx: FxHashSet::default(),
        default_export: None,
        route_options: Vec::new(),
        open: Vec::new(),
        omit: FxHashSet::default(),
        cells: FxHashSet::default(),
        values: FxHashSet::default(),
        merge: FxHashSet::default(),
        constructs: FxHashSet::default(),
        spreads: false,
    };
    survey.visit_program(program);

    let mut components = FxHashSet::default();
    for (span, (name, symbol)) in &survey.named {
        if !name.starts_with(char::is_uppercase) {
            continue;
        }
        let written_as_tag = symbol.is_some_and(|symbol| survey.tags.contains(&symbol));
        if survey.holds_jsx.contains(span) || written_as_tag {
            components.insert(*span);
        }
    }
    for span in survey.default_export.iter().chain(&survey.route_options) {
        if survey.holds_jsx.contains(span) {
            components.insert(*span);
        }
    }
    // A module with no component and no spread has nothing to rewrite.
    if components.is_empty() && !survey.spreads {
        return Outcome { refusals: Vec::new(), params: Vec::new() };
    }

    let mut rewrite = Rewrite {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping: &scoping,
        components,
        omit: survey.omit,
        cells: survey.cells,
        values: survey.values,
        merge: survey.merge,
        constructs: survey.constructs,
        actions: FxHashMap::default(),
        component_tag: false,
        minted: 0,
        needs: [false; 5],
        refusals: Vec::new(),
        params: Vec::new(),
    };
    rewrite.visit_program(program);
    let needs = rewrite.needs;
    let refusals = std::mem::take(&mut rewrite.refusals);
    import_helpers(allocator, program, core_source, needs);
    Outcome { refusals, params: std::mem::take(&mut rewrite.params) }
}

// ── the survey: which functions are components ───────────────────────────────

struct Survey<'s, 'o> {
    scoping: &'s Scoping,
    core_source: &'o str,
    module_source: &'o str,
    /// Every binding written as a JSX tag.
    tags: FxHashSet<SymbolId>,
    /// A function's span, with the name it is bound to.
    named: FxHashMap<Span, (String, Option<SymbolId>)>,
    /// The functions with JSX somewhere inside them.
    holds_jsx: FxHashSet<Span>,
    default_export: Option<Span>,
    /// The functions written inline at a route option the router renders.
    route_options: Vec<Span>,
    open: Vec<Span>,
    omit: FxHashSet<SymbolId>,
    cells: FxHashSet<SymbolId>,
    values: FxHashSet<SymbolId>,
    merge: FxHashSet<SymbolId>,
    /// The constructs the compiler lowers itself, which call what they are
    /// handed: `Show`, `For`, `Portal` and the rest.
    constructs: FxHashSet<SymbolId>,
    /// Whether anything is spread onto a tag.
    spreads: bool,
}

impl Survey<'_, '_> {
    fn saw_jsx(&mut self) {
        for span in &self.open {
            self.holds_jsx.insert(*span);
        }
    }
}

/// The function an initialiser is, under the casts and parentheses around it.
fn function_span(expression: &Expression<'_>) -> Option<Span> {
    match expression {
        Expression::ArrowFunctionExpression(arrow) => Some(arrow.span),
        Expression::FunctionExpression(function) => Some(function.span),
        Expression::ParenthesizedExpression(inner) => function_span(&inner.expression),
        Expression::TSAsExpression(inner) => function_span(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => function_span(&inner.expression),
        Expression::TSNonNullExpression(inner) => function_span(&inner.expression),
        _ => None,
    }
}

impl<'a> Visit<'a> for Survey<'_, '_> {
    fn visit_program(&mut self, program: &Program<'a>) {
        for statement in &program.body {
            let Statement::ImportDeclaration(declaration) = statement else { continue };
            let source = declaration.source.value.as_str();
            let core = source == Some(self.core_source);
            if !core && source != Some(self.module_source) {
                continue;
            }
            for specifier in declaration.specifiers.iter().flatten() {
                let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                    continue;
                };
                let Some(symbol) = specifier.local.symbol_id.get() else { continue };
                let imported = specifier.imported.name();
                if imported.starts_with(char::is_uppercase) {
                    self.constructs.insert(symbol);
                }
                if !core {
                    continue;
                }
                match imported.as_str() {
                    "omit" => {
                        self.omit.insert(symbol);
                    }
                    "cells" => {
                        self.cells.insert(symbol);
                    }
                    "values" => {
                        self.values.insert(symbol);
                    }
                    "merge" => {
                        self.merge.insert(symbol);
                    }
                    _ => {}
                }
            }
        }
        walk::walk_program(self, program);
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        if let BindingPattern::BindingIdentifier(id) = &declarator.id
            && let Some(span) = declarator.init.as_ref().and_then(function_span)
        {
            self.named.insert(span, (id.name.to_string(), id.symbol_id.get()));
        }
        walk::walk_variable_declarator(self, declarator);
    }

    fn visit_export_default_declaration(
        &mut self,
        declaration: &oxc::ast::ast::ExportDefaultDeclaration<'a>,
    ) {
        use oxc::ast::ast::ExportDefaultDeclarationKind as Kind;
        match &declaration.declaration {
            Kind::FunctionDeclaration(function) if function.id.is_none() => {
                self.default_export = Some(function.span);
            }
            Kind::ArrowFunctionExpression(arrow) => self.default_export = Some(arrow.span),
            _ => {}
        }
        walk::walk_export_default_declaration(self, declaration);
    }

    fn visit_object_property(&mut self, property: &ObjectProperty<'a>) {
        if let PropertyKey::StaticIdentifier(key) = &property.key
            && ROUTE_COMPONENT_KEYS.contains(&key.name.as_str())
            && let Some(span) = function_span(&property.value)
        {
            self.route_options.push(span);
        }
        walk::walk_object_property(self, property);
    }

    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        if let Some(id) = &function.id {
            self.named.insert(function.span, (id.name.to_string(), id.symbol_id.get()));
        }
        self.open.push(function.span);
        walk::walk_function(self, function, flags);
        self.open.pop();
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'a>) {
        self.open.push(arrow.span);
        walk::walk_arrow_function_expression(self, arrow);
        self.open.pop();
    }

    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        self.saw_jsx();
        if let JSXElementName::IdentifierReference(name) = &element.opening_element.name
            && let Some(symbol) = name
                .reference_id
                .get()
                .and_then(|reference| self.scoping.get_reference(reference).symbol_id())
        {
            self.tags.insert(symbol);
        }
        walk::walk_jsx_element(self, element);
    }

    fn visit_jsx_spread_attribute(&mut self, spread: &oxc::ast::ast::JSXSpreadAttribute<'a>) {
        self.spreads = true;
        walk::walk_jsx_spread_attribute(self, spread);
    }

    fn visit_jsx_fragment(&mut self, fragment: &oxc::ast::ast::JSXFragment<'a>) {
        self.saw_jsx();
        walk::walk_jsx_fragment(self, fragment);
    }
}

// ── the rewrite ──────────────────────────────────────────────────────────────

struct Rewrite<'a, 's> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    scoping: &'s Scoping,
    components: FxHashSet<Span>,
    omit: FxHashSet<SymbolId>,
    cells: FxHashSet<SymbolId>,
    values: FxHashSet<SymbolId>,
    merge: FxHashSet<SymbolId>,
    constructs: FxHashSet<SymbolId>,
    actions: FxHashMap<SymbolId, Action<'a>>,
    /// Whether the attributes being walked are a component's.
    component_tag: bool,
    minted: u32,
    /// `values`, `omit`, `withDefault`, `readProp`, `carry`, in that order.
    needs: [bool; 5],
    refusals: Vec<Refusal>,
    params: Vec<Span>,
}

/// What a destructured parameter asks of the body it belongs to.
struct Opening<'a> {
    statements: Vec<Statement<'a>>,
}

fn unwrapped<'e, 'a>(expression: &'e Expression<'a>) -> &'e Expression<'a> {
    match expression {
        Expression::ParenthesizedExpression(inner) => unwrapped(&inner.expression),
        Expression::TSAsExpression(inner) => unwrapped(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => unwrapped(&inner.expression),
        Expression::TSNonNullExpression(inner) => unwrapped(&inner.expression),
        _ => expression,
    }
}

fn is_handler_channel(name: &str) -> bool {
    name.strip_prefix("on").and_then(|rest| rest.chars().next()).is_some_and(char::is_uppercase)
}

impl<'a> Rewrite<'a, '_> {
    fn symbol(&self, identifier: &IdentifierReference<'a>) -> Option<SymbolId> {
        self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()
    }

    fn action(&self, expression: &Expression<'a>) -> Option<&Action<'a>> {
        let Expression::Identifier(identifier) = expression else { return None };
        self.actions.get(&self.symbol(identifier)?)
    }

    fn record_of(&self, expression: &Expression<'a>) -> Option<&'a str> {
        match self.action(expression) {
            Some(Action::Record { name, .. }) => Some(name),
            _ => None,
        }
    }

    fn is_param(&self, expression: &Expression<'a>) -> bool {
        matches!(self.action(expression), Some(Action::Record { param: true, .. }))
    }

    fn callee(&self, expression: &Expression<'a>) -> Option<SymbolId> {
        let Expression::CallExpression(call) = expression else { return None };
        let Expression::Identifier(callee) = &call.callee else { return None };
        self.symbol(callee)
    }

    /// Whether `merge(…)` is handed a props record, which makes what it
    /// answers with one.
    fn merges_record(&self, expression: &Expression<'a>) -> bool {
        let Expression::CallExpression(call) = expression else { return false };
        self.callee(expression).is_some_and(|symbol| self.merge.contains(&symbol))
            && call
                .arguments
                .iter()
                .filter_map(Argument::as_expression)
                .any(|argument| self.record_of(unwrapped(argument)).is_some())
    }

    /// Leave `expression` as the record it names, when it names one: a props
    /// record, `cells(props)`, `values(record)`, or what `omit` and `merge`
    /// answer with over one. Answers whether it did.
    fn as_record(&mut self, expression: &mut Expression<'a>) -> bool {
        match expression {
            Expression::ParenthesizedExpression(inner) => self.as_record(&mut inner.expression),
            Expression::TSAsExpression(inner) => self.as_record(&mut inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.as_record(&mut inner.expression),
            Expression::TSNonNullExpression(inner) => self.as_record(&mut inner.expression),
            Expression::Identifier(_) => self.record_of(expression).is_some(),
            Expression::CallExpression(_) => {
                let Some(symbol) = self.callee(expression) else { return false };
                let merging = self.merges_record(expression);
                let Expression::CallExpression(call) = expression else { return false };
                let single = call.arguments.len() == 1;
                if single && (self.cells.contains(&symbol) || self.values.contains(&symbol)) {
                    let Some(argument) = call.arguments.pop() else { return false };
                    let mut inner = match argument {
                        Argument::SpreadElement(_) => return false,
                        other => other.into_expression(),
                    };
                    if !self.as_record(&mut inner) {
                        self.visit_expression(&mut inner);
                    }
                    *expression = inner;
                    return true;
                }
                let first_is_record = call
                    .arguments
                    .first()
                    .and_then(Argument::as_expression)
                    .is_some_and(|first| self.record_of(unwrapped(first)).is_some());
                if (self.omit.contains(&symbol) && first_is_record) || merging {
                    self.visit_expression(expression);
                    return true;
                }
                false
            }
            _ => false,
        }
    }

    /// A plain object as a props record: `_$carry(object)`.
    fn carry(&mut self, expression: &mut Expression<'a>) {
        let span = oxc::span::GetSpan::span(expression);
        let placeholder = Expression::new_null_literal(span, &self.ast);
        let object = std::mem::replace(expression, placeholder);
        self.needs[4] = true;
        *expression = self.call(CARRY, vec![object], span);
    }

    /// The rewrite of one expression that names props. Answers `false` for an
    /// expression it leaves to the ordinary walk. Kept out of
    /// `visit_expression` so that a deeply nested source spends a small frame
    /// per level on the way down.
    #[inline(never)]
    fn rewritten(&mut self, expression: &mut Expression<'a>) -> bool {
        let merging = self.merges_record(expression);
        match expression {
            // `merge(defaults, props)`: the record as it stands, and every
            // other source carried, so what it answers with is a record too.
            Expression::CallExpression(call) if merging => {
                for argument in call.arguments.iter_mut() {
                    let Some(source) = argument.as_expression_mut() else { continue };
                    if self.record_of(unwrapped(source)).is_some() {
                        continue;
                    }
                    self.visit_expression(source);
                    self.carry(source);
                }
            }
            Expression::StaticMemberExpression(member)
                if self.record_of(&member.object).is_some() =>
            {
                if member.property.name == "children" {
                    return true;
                }
                let span = member.span;
                let placeholder = Expression::new_null_literal(span, &self.ast);
                let cell = std::mem::replace(expression, placeholder);
                *expression = self.read(cell, span);
            }
            // `props["data-slot"]` is the same read by a name an identifier
            // cannot spell.
            Expression::ComputedMemberExpression(member)
                if matches!(&member.expression, Expression::StringLiteral(_))
                    && self.record_of(&member.object).is_some() =>
            {
                let span = member.span;
                let placeholder = Expression::new_null_literal(span, &self.ast);
                let cell = std::mem::replace(expression, placeholder);
                *expression = self.read(cell, span);
            }
            Expression::Identifier(identifier) => {
                let span = identifier.span;
                match self.action(expression).cloned() {
                    Some(Action::Record { name, .. }) => {
                        self.needs[0] = true;
                        *expression = self.call(VALUES, vec![self.ident(name, span)], span);
                    }
                    Some(action) => *expression = self.field(&action, span, false),
                    None => {}
                }
            }
            Expression::CallExpression(call) => {
                let callee = match &call.callee {
                    Expression::Identifier(callee) => self.symbol(callee),
                    _ => None,
                };
                let takes_record = callee.is_some_and(|symbol| {
                    self.omit.contains(&symbol) || self.cells.contains(&symbol)
                }) && call
                    .arguments
                    .first()
                    .and_then(Argument::as_expression)
                    .is_some_and(|first| self.record_of(first).is_some());
                if !takes_record {
                    return false;
                }
                if callee.is_some_and(|symbol| self.cells.contains(&symbol)) {
                    // `cells(props)` is the record, and nothing is left to call.
                    let span = call.span;
                    let Some(Argument::Identifier(record)) = call.arguments.first() else {
                        return true;
                    };
                    let name = self.allocator.alloc_str(record.name.as_str());
                    *expression = self.ident(name, span);
                    return true;
                }
                for argument in call.arguments.iter_mut().skip(1) {
                    self.visit_argument(argument);
                }
            }
            _ => return false,
        }
        true
    }

    fn mint(&mut self, stem: &str) -> &'a str {
        self.minted += 1;
        self.allocator.alloc_str(&format!("{stem}{}", self.minted))
    }

    fn ident(&self, name: &'a str, span: Span) -> Expression<'a> {
        Expression::new_identifier(span, name, &self.ast)
    }

    fn member(&self, object: Expression<'a>, name: &'a str, span: Span) -> Expression<'a> {
        let property = IdentifierName::new(span, name, &self.ast);
        Expression::new_static_member_expression(span, object, property, false, &self.ast)
    }

    /// `_$readProp(cell)`: the value a prop holds. A prop the caller left out
    /// reads `undefined`, and JSX the caller passed reads as itself, unbuilt.
    fn read(&mut self, cell: Expression<'a>, span: Span) -> Expression<'a> {
        self.needs[3] = true;
        self.call(READ, vec![cell], span)
    }

    fn call(&self, callee: &'a str, arguments: Vec<Expression<'a>>, span: Span) -> Expression<'a> {
        let arguments =
            ArenaVec::from_iter_in(arguments.into_iter().map(Argument::from), &self.allocator);
        Expression::new_call_expression(
            span,
            self.ident(callee, span),
            None,
            arguments,
            false,
            &self.ast,
        )
    }

    fn string(&self, value: &'a str, span: Span) -> Expression<'a> {
        Expression::new_string_literal(span, value, None, &self.ast)
    }

    /// What a name bound by a props pattern reads. `forwarded` is the position
    /// that takes the Cell itself.
    fn field(&mut self, action: &Action<'a>, span: Span, forwarded: bool) -> Expression<'a> {
        match action {
            Action::Record { name, .. } => self.ident(name, span),
            // Declared by this pass, so it is always there to call, and no
            // later stage knows the name holds a Cell: it is never handed on.
            Action::Cell(name) => Expression::new_call_expression(
                span,
                self.ident(name, span),
                None,
                ArenaVec::new_in(&self.allocator),
                false,
                &self.ast,
            ),
            Action::Field { record, prop, steps, param } => {
                let cell = self.member(self.ident(record, span), prop, span);
                if *prop == "children" && steps.is_empty() {
                    return cell;
                }
                if forwarded && *param && steps.is_empty() {
                    return cell;
                }
                let mut value = self.read(cell, span);
                for step in steps {
                    value = match step {
                        Step::Key(key) => self.member(value, key, span),
                        Step::Index(index) => {
                            let at = Expression::new_numeric_literal(
                                span,
                                f64::from(*index),
                                None,
                                NumberBase::Decimal,
                                &self.ast,
                            );
                            Expression::new_computed_member_expression(
                                span, value, at, false, &self.ast,
                            )
                        }
                    };
                }
                value
            }
        }
    }

    /// Whether `expression` is a prop named and nothing more, the shape a
    /// forward takes: `props.title`, or a name a props pattern bound.
    fn forwards(&self, expression: &Expression<'a>) -> bool {
        match unwrapped(expression) {
            Expression::StaticMemberExpression(member) => self.is_param(&member.object),
            identifier @ Expression::Identifier(_) => {
                matches!(
                    self.action(identifier),
                    Some(Action::Field { param: true, steps, .. }) if steps.is_empty()
                )
            }
            _ => false,
        }
    }

    /// The forward itself: the Cell, uncalled.
    fn forward(&mut self, expression: &mut Expression<'a>) {
        match expression {
            Expression::ParenthesizedExpression(inner) => self.forward(&mut inner.expression),
            Expression::TSAsExpression(inner) => self.forward(&mut inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.forward(&mut inner.expression),
            Expression::TSNonNullExpression(inner) => self.forward(&mut inner.expression),
            Expression::Identifier(identifier) => {
                let span = identifier.span;
                if let Some(action) = self.action(expression).cloned() {
                    *expression = self.field(&action, span, true);
                }
            }
            _ => {}
        }
    }

    /// A component's parameters: its props, by name or by pattern.
    fn open(&mut self, params: &mut FormalParameters<'a>) -> Opening<'a> {
        let mut opening = Opening { statements: Vec::new() };
        let Some(first) = params.items.first_mut() else { return opening };
        match &mut first.pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(symbol) = id.symbol_id.get() {
                    let name = self.allocator.alloc_str(id.name.as_str());
                    self.actions.insert(symbol, Action::Record { name, param: true });
                    self.params.push(id.span);
                }
            }
            BindingPattern::ObjectPattern(pattern) => {
                let span = pattern.span;
                if !supported(pattern) {
                    self.refusals.push(Refusal { span, message: UNSUPPORTED_PATTERN });
                    return opening;
                }
                let record = self.mint("_props$");
                for (name, init, at) in self.bind(pattern, record, true) {
                    opening.statements.push(self.declare(name, init, at));
                }
                first.pattern = BindingPattern::new_binding_identifier(span, record, &self.ast);
                self.params.push(span);
            }
            _ => {}
        }
        opening
    }

    /// Give every name a props pattern binds the read it stands for, and answer
    /// with what the pattern has to declare: a Cell per default, and the rest.
    fn bind(
        &mut self,
        pattern: &mut oxc::ast::ast::ObjectPattern<'a>,
        record: &'a str,
        param: bool,
    ) -> Vec<(&'a str, Expression<'a>, Span)> {
        let mut declared = Vec::new();
        let mut taken: Vec<&'a str> = Vec::new();
        let properties =
            std::mem::replace(&mut pattern.properties, ArenaVec::new_in(&self.allocator));
        for property in properties {
            let at = property.span;
            let Some(prop) = key_name(&property.key, self.allocator) else { continue };
            taken.push(prop);
            match property.value {
                BindingPattern::BindingIdentifier(id) => {
                    if let Some(symbol) = id.symbol_id.get() {
                        self.actions.insert(
                            symbol,
                            Action::Field { record, prop, steps: Vec::new(), param },
                        );
                    }
                }
                BindingPattern::AssignmentPattern(assignment) => {
                    let assignment = assignment.unbox();
                    let BindingPattern::BindingIdentifier(id) = assignment.left else {
                        continue;
                    };
                    let mut fallback = assignment.right;
                    // Read where it is used: a default may name a prop bound
                    // before it.
                    self.visit_expression(&mut fallback);
                    let cell = self.mint("_prop$");
                    self.needs[2] = true;
                    let thunk = self.thunk(fallback, at);
                    let made = self.call(
                        WITH_DEFAULT,
                        vec![self.ident(record, at), self.string(prop, at), thunk],
                        at,
                    );
                    declared.push((cell, made, at));
                    if let Some(symbol) = id.symbol_id.get() {
                        self.actions.insert(symbol, Action::Cell(cell));
                    }
                }
                nested => {
                    let mut steps = Vec::new();
                    self.nested(&nested, record, prop, &mut steps, param);
                }
            }
        }
        if let Some(rest) = pattern.rest.take()
            && let BindingPattern::BindingIdentifier(id) = &rest.argument
        {
            let name = self.allocator.alloc_str(id.name.as_str());
            self.needs[1] = true;
            let mut arguments = vec![self.ident(record, rest.span)];
            arguments.extend(taken.iter().map(|prop| self.string(prop, rest.span)));
            let made = self.call(OMIT, arguments, rest.span);
            declared.push((name, made, rest.span));
            // The declaration this pass writes has no symbol, so the pattern's
            // own is what the body's references resolve to.
            if let Some(symbol) = id.symbol_id.get() {
                self.actions.insert(symbol, Action::Record { name, param: false });
            }
        }
        declared
    }

    fn nested(
        &mut self,
        pattern: &BindingPattern<'a>,
        record: &'a str,
        prop: &'a str,
        steps: &mut Vec<Step<'a>>,
        param: bool,
    ) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                if let Some(symbol) = id.symbol_id.get() {
                    self.actions.insert(
                        symbol,
                        Action::Field { record, prop, steps: steps.clone(), param },
                    );
                }
            }
            BindingPattern::ObjectPattern(object) => {
                for property in &object.properties {
                    let Some(key) = key_name(&property.key, self.allocator) else { continue };
                    steps.push(Step::Key(key));
                    self.nested(&property.value, record, prop, steps, param);
                    steps.pop();
                }
            }
            BindingPattern::ArrayPattern(array) => {
                for (index, element) in array.elements.iter().enumerate() {
                    let Some(element) = element else { continue };
                    steps.push(Step::Index(index as u32));
                    self.nested(element, record, prop, steps, param);
                    steps.pop();
                }
            }
            BindingPattern::AssignmentPattern(_) => {}
        }
    }

    fn thunk(&self, value: Expression<'a>, span: Span) -> Expression<'a> {
        let statements = ArenaVec::from_iter_in(
            [Statement::new_return_statement(span, Some(value), &self.ast)],
            &self.allocator,
        );
        let body = ArrowFunctionBody::new_function_body(
            span,
            ArenaVec::new_in(&self.allocator),
            statements,
            &self.ast,
        );
        let params = FormalParameters::boxed(
            span,
            oxc::ast::ast::FormalParameterKind::ArrowFormalParameters,
            ArenaVec::new_in(&self.allocator),
            None,
            &self.ast,
        );
        Expression::new_arrow_function_expression(span, false, None, params, None, body, &self.ast)
    }

    fn declare(&self, name: &'a str, init: Expression<'a>, span: Span) -> Statement<'a> {
        let id = BindingPattern::new_binding_identifier(span, name, &self.ast);
        let declarator = VariableDeclarator::new(span, id, None, Some(init), false, &self.ast);
        Statement::new_variable_declaration(
            span,
            VariableDeclarationKind::Const,
            ArenaVec::from_iter_in([declarator], &self.allocator),
            false,
            &self.ast,
        )
    }

    fn prepend(&self, body: &mut FunctionBody<'a>, opening: Opening<'a>) {
        if opening.statements.is_empty() {
            return;
        }
        let rest = std::mem::replace(&mut body.statements, ArenaVec::new_in(&self.allocator));
        body.statements.extend(opening.statements);
        body.statements.extend(rest);
    }
}

/// Whether every name the pattern binds can be given the read it stands for.
fn supported(pattern: &oxc::ast::ast::ObjectPattern<'_>) -> bool {
    fn nested(pattern: &BindingPattern<'_>) -> bool {
        match pattern {
            BindingPattern::BindingIdentifier(_) => true,
            BindingPattern::AssignmentPattern(_) => false,
            BindingPattern::ObjectPattern(object) => {
                object.rest.is_none()
                    && object.properties.iter().all(|property| {
                        !property.computed && static_key(&property.key) && nested(&property.value)
                    })
            }
            BindingPattern::ArrayPattern(array) => {
                array.rest.is_none() && array.elements.iter().flatten().all(nested)
            }
        }
    }
    let rest_named = pattern
        .rest
        .as_ref()
        .is_none_or(|rest| matches!(rest.argument, BindingPattern::BindingIdentifier(_)));
    rest_named
        && pattern.properties.iter().all(|property| {
            if property.computed || !static_key(&property.key) {
                return false;
            }
            match &property.value {
                BindingPattern::AssignmentPattern(assignment) => {
                    matches!(assignment.left, BindingPattern::BindingIdentifier(_))
                }
                other => nested(other),
            }
        })
}

fn static_key(key: &PropertyKey<'_>) -> bool {
    matches!(key, PropertyKey::StaticIdentifier(_) | PropertyKey::StringLiteral(_))
}

fn key_name<'a>(key: &PropertyKey<'a>, allocator: &'a Allocator) -> Option<&'a str> {
    match key {
        PropertyKey::StaticIdentifier(name) => Some(allocator.alloc_str(name.name.as_str())),
        PropertyKey::StringLiteral(literal) => {
            literal.value.as_str().map(|name| allocator.alloc_str(name) as &str)
        }
        _ => None,
    }
}

impl<'a> VisitMut<'a> for Rewrite<'a, '_> {
    fn visit_function(&mut self, function: &mut Function<'a>, flags: ScopeFlags) {
        if self.components.contains(&function.span) {
            let opening = self.open(&mut function.params);
            if let Some(body) = function.body.as_mut() {
                self.prepend(body, opening);
            }
        }
        walk_mut::walk_function(self, function, flags);
    }

    fn visit_arrow_function_expression(&mut self, arrow: &mut ArrowFunctionExpression<'a>) {
        if self.components.contains(&arrow.span) {
            let opening = self.open(&mut arrow.params);
            if !opening.statements.is_empty() {
                // `(props) => <b/>` has no statement list to open with a
                // declaration, so its expression becomes the body's return.
                let span = arrow.span;
                if !matches!(arrow.body, ArrowFunctionBody::FunctionBody(_)) {
                    let empty = ArrowFunctionBody::new_function_body(
                        span,
                        ArenaVec::new_in(&self.allocator),
                        ArenaVec::new_in(&self.allocator),
                        &self.ast,
                    );
                    let value = std::mem::replace(&mut arrow.body, empty).into_expression();
                    if let ArrowFunctionBody::FunctionBody(body) = &mut arrow.body {
                        body.statements.push(Statement::new_return_statement(
                            span,
                            Some(value),
                            &self.ast,
                        ));
                    }
                }
                if let ArrowFunctionBody::FunctionBody(body) = &mut arrow.body {
                    self.prepend(body, opening);
                }
            }
        }
        walk_mut::walk_arrow_function_expression(self, arrow);
    }

    fn visit_variable_declaration(
        &mut self,
        declaration: &mut oxc::ast::ast::VariableDeclaration<'a>,
    ) {
        // `const { title, ...rest } = props` in the body binds what the same
        // pattern binds as the parameter.
        let declarators =
            std::mem::replace(&mut declaration.declarations, ArenaVec::new_in(&self.allocator));
        for mut declarator in declarators {
            let record = match (&declarator.id, declarator.init.as_ref().map(unwrapped)) {
                (BindingPattern::ObjectPattern(_), Some(init)) => match self.action(init) {
                    Some(Action::Record { name, param }) => Some((*name, *param)),
                    _ => None,
                },
                _ => None,
            };
            if let Some((record, param)) = record
                && let BindingPattern::ObjectPattern(pattern) = &mut declarator.id
            {
                if supported(pattern) {
                    for (name, init, at) in self.bind(pattern, record, param) {
                        let id = BindingPattern::new_binding_identifier(at, name, &self.ast);
                        declaration.declarations.push(VariableDeclarator::new(
                            at,
                            id,
                            None,
                            Some(init),
                            false,
                            &self.ast,
                        ));
                    }
                    continue;
                }
                self.refusals.push(Refusal { span: pattern.span, message: UNSUPPORTED_PATTERN });
            }
            self.visit_variable_declarator(&mut declarator);
            declaration.declarations.push(declarator);
        }
        if declaration.declarations.is_empty() {
            // Every name the pattern bound is a read where it is used, and a
            // declaration has to declare something.
            let span = declaration.span;
            let unused = self.mint("_unused$");
            let id = BindingPattern::new_binding_identifier(span, unused, &self.ast);
            let init = Expression::new_void_0(span, &self.ast);
            declaration.declarations.push(VariableDeclarator::new(
                span,
                id,
                None,
                Some(init),
                false,
                &self.ast,
            ));
        }
    }

    fn visit_variable_declarator(&mut self, declarator: &mut VariableDeclarator<'a>) {
        // `const rest = omit(props, "title")` is a props record under a new name.
        let derived = match declarator.init.as_ref().map(unwrapped) {
            Some(Expression::CallExpression(call)) => {
                let by_omit = matches!(&call.callee, Expression::Identifier(callee)
                    if self.symbol(callee).is_some_and(|symbol| self.omit.contains(&symbol)));
                (by_omit
                    && call
                        .arguments
                        .first()
                        .and_then(Argument::as_expression)
                        .is_some_and(|first| self.record_of(first).is_some()))
                    || declarator
                        .init
                        .as_ref()
                        .is_some_and(|init| self.merges_record(unwrapped(init)))
            }
            _ => false,
        };
        walk_mut::walk_variable_declarator(self, declarator);
        if derived
            && let BindingPattern::BindingIdentifier(id) = &declarator.id
            && let Some(symbol) = id.symbol_id.get()
        {
            let name = self.allocator.alloc_str(id.name.as_str());
            self.actions.insert(symbol, Action::Record { name, param: false });
        }
    }

    fn visit_jsx_element(&mut self, element: &mut JSXElement<'a>) {
        let outer = self.component_tag;
        let construct = matches!(&element.opening_element.name,
            JSXElementName::IdentifierReference(name)
                if self.symbol(name).is_some_and(|symbol| self.constructs.contains(&symbol)));
        self.component_tag =
            !construct && crate::analysis::is_component_tag(&element.opening_element.name);
        self.visit_jsx_opening_element(&mut element.opening_element);
        self.component_tag = outer;
        for child in element.children.iter_mut() {
            // `{props.title}` as a child is handed on as the Cell: the hole
            // follows it, and a forward stays the one function.
            if let JSXChild::ExpressionContainer(container) = child
                && let Some(expression) = container.expression.as_expression_mut()
                && self.forwards(expression)
            {
                self.forward(expression);
                continue;
            }
            self.visit_jsx_child(child);
        }
    }

    fn visit_jsx_attribute_item(&mut self, item: &mut JSXAttributeItem<'a>) {
        match item {
            JSXAttributeItem::SpreadAttribute(spread) => {
                // A record is a source as it stands, read by whoever receives
                // it. Anything else spread onto a component is an object of
                // values, and each is carried as the Cell a prop is.
                if self.as_record(&mut spread.argument) {
                    return;
                }
                self.visit_expression(&mut spread.argument);
                if self.component_tag {
                    self.carry(&mut spread.argument);
                }
            }
            JSXAttributeItem::Attribute(attribute) => {
                let handler = match &attribute.name {
                    JSXAttributeName::Identifier(name) => is_handler_channel(name.name.as_str()),
                    JSXAttributeName::NamespacedName(_) => false,
                };
                if self.component_tag
                    && !handler
                    && let Some(JSXAttributeValue::ExpressionContainer(container)) =
                        attribute.value.as_mut()
                    && let Some(expression) = container.expression.as_expression_mut()
                    && self.forwards(expression)
                {
                    self.forward(expression);
                    return;
                }
                walk_mut::walk_jsx_attribute(self, attribute);
            }
        }
    }

    fn visit_object_property(&mut self, property: &mut ObjectProperty<'a>) {
        // `{ title }` names the key and the value at once, and only the value
        // is a read.
        if property.shorthand && self.action(&property.value).is_some() {
            property.shorthand = false;
        }
        walk_mut::walk_object_property(self, property);
    }

    fn visit_assignment_target(&mut self, target: &mut AssignmentTarget<'a>) {
        let written = match target {
            AssignmentTarget::AssignmentTargetIdentifier(identifier) => self
                .symbol(identifier)
                .is_some_and(|symbol| self.actions.contains_key(&symbol))
                .then_some(identifier.span),
            AssignmentTarget::StaticMemberExpression(member) => {
                self.record_of(&member.object).map(|_| member.span)
            }
            AssignmentTarget::ComputedMemberExpression(member) => {
                self.record_of(&member.object).map(|_| member.span)
            }
            _ => None,
        };
        if let Some(span) = written {
            self.refusals.push(Refusal { span, message: ASSIGNED });
            return;
        }
        walk_mut::walk_assignment_target(self, target);
    }

    fn visit_simple_assignment_target(&mut self, target: &mut SimpleAssignmentTarget<'a>) {
        let written = match target {
            SimpleAssignmentTarget::AssignmentTargetIdentifier(identifier) => self
                .symbol(identifier)
                .is_some_and(|symbol| self.actions.contains_key(&symbol))
                .then_some(identifier.span),
            SimpleAssignmentTarget::StaticMemberExpression(member) => {
                self.record_of(&member.object).map(|_| member.span)
            }
            _ => None,
        };
        if let Some(span) = written {
            self.refusals.push(Refusal { span, message: ASSIGNED });
            return;
        }
        walk_mut::walk_simple_assignment_target(self, target);
    }

    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        let names_props = matches!(
            expression,
            Expression::Identifier(_)
                | Expression::StaticMemberExpression(_)
                | Expression::ComputedMemberExpression(_)
                | Expression::CallExpression(_)
        );
        if !(names_props && self.rewritten(expression)) {
            walk_mut::walk_expression(self, expression);
        }
    }
}

/// Bring in the helpers the rewrite called, beside what the module already
/// imports from the core when it imports anything by name.
fn import_helpers<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    core_source: &str,
    needs: [bool; 5],
) {
    let wanted: Vec<(&str, &str)> = [
        ("values", VALUES),
        ("omit", OMIT),
        ("withDefault", WITH_DEFAULT),
        ("readProp", READ),
        ("carry", CARRY),
    ]
    .into_iter()
    .zip(needs)
    .filter_map(|(names, needed)| needed.then_some(names))
    .collect();
    if wanted.is_empty() {
        return;
    }
    let ast = AstBuilder::new(allocator);
    let specifier = |imported: &str, local: &str| {
        ImportDeclarationSpecifier::new_import_specifier(
            Span::default(),
            ModuleExportName::IdentifierName(IdentifierName::new(
                Span::default(),
                allocator.alloc_str(imported) as &str,
                &ast,
            )),
            oxc::ast::ast::BindingIdentifier::new(
                Span::default(),
                allocator.alloc_str(local) as &str,
                &ast,
            ),
            ImportOrExportKind::Value,
            &ast,
        )
    };
    for statement in program.body.iter_mut() {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != Some(core_source)
            || declaration.import_kind != ImportOrExportKind::Value
        {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_mut() else { continue };
        if specifiers.iter().any(|specifier| {
            matches!(specifier, ImportDeclarationSpecifier::ImportNamespaceSpecifier(_))
        }) {
            continue;
        }
        for (imported, local) in &wanted {
            specifiers.push(specifier(imported, local));
        }
        return;
    }
    let specifiers = ArenaVec::from_iter_in(
        wanted.iter().map(|(imported, local)| specifier(imported, local)),
        &allocator,
    );
    let source =
        StringLiteral::new(Span::default(), allocator.alloc_str(core_source) as &str, None, &ast);
    let declaration = Statement::new_import_declaration(
        Span::default(),
        Some(specifiers),
        source,
        None,
        None::<ArenaBox<'a, oxc::ast::ast::WithClause<'a>>>,
        ImportOrExportKind::Value,
        &ast,
    );
    program.body.insert(0, declaration);
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::diag::Code;
    use crate::options::ResolvedOptions;

    fn emit(source: &str) -> String {
        compile(source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles").code
    }

    fn codes(source: &str) -> Vec<Code> {
        match compile(source, &ResolvedOptions::with_filename("s.tsx")) {
            Ok(output) => output.warnings.iter().filter_map(|warning| warning.code).collect(),
            Err(errors) => errors.iter().filter_map(|error| error.code).collect(),
        }
    }

    #[test]
    fn a_read_becomes_read_prop() {
        let code = emit(
            "export function Card(props) { const n = props.count + 1; \
             return <p title={props.title}>{n}</p>; }\n",
        );
        assert!(code.contains("const n = _$readProp(props.count) + 1;"), "{code}");
        assert!(
            code.contains(
                "_$bindEffect(() => _$readProp(props.title), (_v$, _p$) => {\n    _$setAttr(_el$1, \"title\", _v$, _p$);\n  });"
            ),
            "{code}"
        );
        assert!(code.contains("readProp as _$readProp"), "{code}");
    }

    #[test]
    fn an_attribute_forward_and_a_child_forward_stay_the_bare_cell() {
        let code = emit(
            "import { Chip } from \"./chip\";\n\
             export function Card(props) { return <Chip tone={props.tone}>{props.label}</Chip>; }\n",
        );
        assert!(code.contains("tone: props.tone,"), "{code}");
        assert!(code.contains("children: props.label"), "{code}");
        assert!(!code.contains("_$readProp"), "{code}");
    }

    #[test]
    fn a_handler_attribute_on_a_component_tag_is_read_not_forwarded() {
        let code = emit(
            "import { Chip } from \"./chip\";\n\
             export function Card(props) { return <Chip onPress={props.onPress} />; }\n",
        );
        assert!(code.contains("Chip({ onPress: () => _$readProp(props.onPress) })"), "{code}");
    }

    #[test]
    fn children_is_untouched() {
        let code = emit(
            "export function Card(props) { const kids = props.children; return <p>{kids}</p>; }\n",
        );
        assert!(code.contains("const kids = props.children;"), "{code}");
        assert!(!code.contains("_$readProp"), "{code}");
        assert!(!code.contains("_$values"), "{code}");
    }

    #[test]
    fn a_destructured_parameter_keeps_its_default_its_nested_name_and_its_rest() {
        let code = emit(
            "import { Chip } from \"./chip\";\n\
             export function Card({ title, tone = \"warm\", user: { name }, ...rest }) { \
             return <Chip {...rest} label={title + tone + name} />; }\n",
        );
        assert!(code.contains("export function Card(_props$1) {"), "{code}");
        assert!(
            code.contains("const _prop$2 = _$withDefault(_props$1, \"tone\", () => {\n    return \"warm\";\n  });"),
            "{code}"
        );
        assert!(
            code.contains("const rest = _$omit(_props$1, \"title\", \"tone\", \"user\");"),
            "{code}"
        );
        assert!(
            code.contains(
                "label: () => _$readProp(_props$1.title) + _prop$2() + _$readProp(_props$1.user).name"
            ),
            "{code}"
        );
        assert!(code.contains("_$props([rest, {"), "{code}");
    }

    #[test]
    fn a_pattern_over_props_in_the_body_binds_what_the_parameter_pattern_binds() {
        let code = emit(
            "export function Card(props) { const { a, ...rest } = props; \
             return <p {...rest}>{a + 1}</p>; }\n",
        );
        assert!(code.contains("const rest = _$omit(props, \"a\");"), "{code}");
        assert!(code.contains("_$spread(_el$1, () => rest);"), "{code}");
        assert!(code.contains("_$insert(_el$1, () => _$readProp(props.a) + 1);"), "{code}");
        assert!(!code.contains("const {"), "{code}");
    }

    #[test]
    fn what_omit_answers_with_is_read_as_values() {
        let code = emit(
            "import { omit } from \"@barqjs/core\";\n\
             export function Card(props) { const rest = omit(props, \"a\"); \
             return <p title={rest.title} />; }\n",
        );
        assert!(code.contains("const rest = omit(props, \"a\");"), "{code}");
        assert!(
            code.contains("_$bindProp(_el$1, _$setAttr, \"title\", () => _$readProp(rest.title));"),
            "{code}"
        );
        assert!(!code.contains("_$values"), "{code}");
    }

    #[test]
    fn cells_of_props_compiles_to_the_record() {
        let code = emit(
            "import { cells } from \"@barqjs/core\";\n\
             export function Card(props) { useThing(cells(props)); return <p />; }\n",
        );
        assert!(code.contains("useThing(props);"), "{code}");
        assert!(!code.contains("cells(props)"), "{code}");
        assert!(!code.contains("_$values"), "{code}");
    }

    #[test]
    fn props_used_whole_becomes_the_values_view() {
        let code = emit("export function Card(props) { useThing(props); return <p />; }\n");
        assert!(code.contains("useThing(_$values(props));"), "{code}");
        assert!(code.contains("values as _$values"), "{code}");
    }

    #[test]
    fn a_lowercase_function_and_a_capitalised_one_without_jsx_are_left_alone() {
        let code = emit(
            "function card(props) { return <p>{props.title()}</p>; }\n\
             export function Total(props) { return props.count() + 1; }\n",
        );
        assert!(code.contains("_$insert(_el$1, () => props.title());"), "{code}");
        assert!(code.contains("return props.count() + 1;"), "{code}");
        assert!(!code.contains("_$readProp"), "{code}");
    }

    #[test]
    fn a_default_export_and_an_inline_route_option_are_components() {
        let exported = emit("export default (props) => <p title={props.title} />;\n");
        assert!(
            exported.contains(
                "_$bindEffect(() => _$readProp(props.title), (_v$, _p$) => {\n    _$setAttr(_el$1, \"title\", _v$, _p$);\n  });"
            ),
            "{exported}"
        );
        let option = emit(
            "import { createFileRoute } from \"@barqjs/router\";\n\
             export const Route = createFileRoute(\"/x\")({ \
             notFoundComponent: (props) => <p title={props.title} /> });\n",
        );
        assert!(option.contains("notFoundComponent: (props) => {"), "{option}");
        assert!(
            option.contains(
                "_$bindEffect(() => _$readProp(props.title), (_v$, _p$) => {\n    _$setAttr(_el$1, \"title\", _v$, _p$);\n  });"
            ),
            "{option}"
        );
    }

    #[test]
    fn an_assignment_to_a_prop_reports_barq030() {
        let found = codes(
            "export function Card(props) { props.count = 1; return <p>{props.count}</p>; }\n",
        );
        assert_eq!(found, vec![Code::Barq030]);
        let bound =
            codes("export function Card({ count }) { count += 1; return <p>{count}</p>; }\n");
        assert_eq!(bound, vec![Code::Barq030]);
    }

    #[test]
    fn a_default_inside_a_nested_pattern_reports_barq031() {
        let found = codes(
            "export function Card({ user: { name = \"guest\" } }) { return <p>{name}</p>; }\n",
        );
        assert!(found.contains(&Code::Barq031), "{found:?}");
    }

    #[test]
    fn an_object_shorthand_keeps_its_key_and_reads_its_value() {
        let code = emit("export function Card({ title }) { return <p>{log({ title })}</p>; }\n");
        assert!(
            code.contains("_$insert(_el$1, () => log({ title: _$readProp(_props$1.title) }));"),
            "{code}"
        );
    }
}
