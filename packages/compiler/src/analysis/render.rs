//! The render-scope rules: what a component body and a computation may do with
//! reactive state, judged where the code says it.
//!
//! A component body runs once and is not a tracked scope (SEMANTICS.md R1), and
//! the engine refuses a write under any owner. Each rule here is a shape whose
//! only correct reading is a mistake, keyed on bindings `bind` has already
//! proved (an accessor, a store, a props parameter, a setter), never on names.
//!
//! - BARQ018: a component picks what to return from a reactive read.
//! - BARQ019: a setter, `refresh` or an action is called while a component body
//!   or a computation runs.
//! - BARQ020: a store is destructured in a component body.
//! - BARQ021: an async computation reads a source after its first `await`.

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, AwaitExpression, BindingPattern, CallExpression,
    ComputedMemberExpression, Expression, ForOfStatement, FormalParameters, Function, IfStatement,
    ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXElement,
    JSXElementName, JSXFragment, ModuleExportName, ObjectPropertyKind, Program, PropertyKey,
    ReturnStatement, Statement, StaticMemberExpression, SwitchStatement, VariableDeclarator,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::{ScopeFlags, Scoping, SymbolId};
use oxc::span::{GetSpan, Span};

use crate::diag::Code;
use crate::ir::{Diag, ReactiveEnv, SourceKind};

use super::{symbol_of, without_type_wrappers};

/// The primitives whose FIRST argument, when it is a function, is a computation
/// the engine runs under an owner. `createEffect` and `createRenderEffect` run
/// their second function in the effect phase, which is where a write belongs,
/// so only the first is listed through them.
const COMPUTES: &[&str] = &[
    "createMemo",
    "createEffect",
    "createRenderEffect",
    "createProjection",
    "createSignal",
    "createStore",
    "createOptimistic",
    "createOptimisticStore",
];

/// The constructors whose second element is a write.
const WRITABLE: &[&str] =
    &["createSignal", "createOptimistic", "createStore", "createOptimisticStore"];

pub(super) fn check<'a>(
    allocator: &'a Allocator,
    program: &Program<'a>,
    scoping: &Scoping,
    env: &mut ReactiveEnv<'a>,
    runtime: &[&str],
) {
    let mut core = Vec::new();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if !runtime.contains(&declaration.source.value.as_str()) {
            continue;
        }
        for specifier in declaration.specifiers.iter().flatten() {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                    let ModuleExportName::IdentifierName(name) = &imported.imported else {
                        continue;
                    };
                    if let Some(symbol) = imported.local.symbol_id.get() {
                        core.push(Import::Named(symbol, name.name.as_str()));
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => {
                    if let Some(symbol) = namespace.local.symbol_id.get() {
                        core.push(Import::Namespace(symbol));
                    }
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {}
            }
        }
    }
    if core.is_empty() {
        return;
    }

    let mut facts = Facts {
        scoping,
        env,
        core: &core,
        writers: Vec::new(),
        props: Vec::new(),
        aliases: Vec::new(),
        changing: Vec::new(),
    };
    facts.visit_program(program);
    let Facts { writers, props, aliases, changing, .. } = facts;

    let mut rules = Rules {
        allocator,
        scoping,
        env,
        source: program.source_text,
        core: &core,
        writers,
        props,
        aliases,
        changing,
        frames: Vec::new(),
        computes: Vec::new(),
        untracks: Vec::new(),
        diagnostics: Vec::new(),
    };
    rules.visit_program(program);
    let found = std::mem::take(&mut rules.diagnostics);
    env.diagnostics.extend(found);
}

#[derive(Clone, Copy)]
enum Import<'a> {
    Named(SymbolId, &'a str),
    Namespace(SymbolId),
}

/// The runtime export (from `coreSource` or `moduleSource`) a callee names,
/// through an alias or a namespace.
fn core_name<'a>(
    scoping: &Scoping,
    core: &[Import<'a>],
    callee: &Expression<'a>,
) -> Option<&'a str> {
    match without_type_wrappers(callee) {
        Expression::StaticMemberExpression(member) => {
            let object = symbol_of(scoping, &member.object)?;
            core.iter()
                .any(|import| matches!(import, Import::Namespace(symbol) if *symbol == object))
                .then(|| member.property.name.as_str())
        }
        callee => {
            let symbol = symbol_of(scoping, callee)?;
            core.iter().find_map(|import| match import {
                Import::Named(local, name) if *local == symbol => Some(*name),
                _ => None,
            })
        }
    }
}

/// A binding whose CALL changes state: a setter, or an `action`.
#[derive(Clone, Copy)]
struct Writer {
    symbol: SymbolId,
    action: bool,
}

/// The pre-pass, for what the main walk needs before it reaches it: a
/// component may be declared above the signal it writes, and rendered below.
struct Facts<'s, 'c, 'a> {
    scoping: &'s Scoping,
    env: &'s ReactiveEnv<'a>,
    core: &'c [Import<'a>],
    /// Every never-reassigned setter and action.
    writers: Vec<Writer>,
    /// `(component, its props parameter)`.
    props: Vec<(SymbolId, SymbolId)>,
    /// `const { kind } = props`: `(local, props parameter, key)`.
    aliases: Vec<(SymbolId, SymbolId, &'a str)>,
    /// `(component, prop)` for every prop this module renders the component
    /// with a value that changes: one that makes a reactive read, or an
    /// accessor handed over by name.
    changing: Vec<(SymbolId, &'a str)>,
}

impl<'a> Facts<'_, '_, 'a> {
    fn component(&mut self, binding: Option<SymbolId>, params: &FormalParameters<'a>) {
        if let Some(component) = binding
            && params.items.len() == 1
            && let BindingPattern::BindingIdentifier(props) = &params.items[0].pattern
            && let Some(props) = props.symbol_id.get()
        {
            self.props.push((component, props));
        }
    }

    fn changes(&self, value: &Expression<'a>) -> bool {
        if let Some(symbol) = symbol_of(self.scoping, value)
            && (self.env.kind_of(symbol) == SourceKind::Accessor || self.env.is_derived(symbol))
        {
            return true;
        }
        let mut reads = Reads {
            scoping: self.scoping,
            env: self.env,
            core: self.core,
            aliases: &[],
            deep: true,
            callbacks: false,
            found: Vec::new(),
            awaits: Vec::new(),
        };
        reads.visit_expression(value);
        reads.found.iter().any(|read| matches!(read.source, Source::Binding(_)))
    }
}

impl<'a> Visit<'a> for Facts<'_, '_, 'a> {
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        let binding = it.id.as_ref().and_then(|id| id.symbol_id.get());
        self.component(binding, &it.params);
        walk::walk_function(self, it, flags);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        let binding = match &it.id {
            BindingPattern::BindingIdentifier(identifier) => identifier.symbol_id.get(),
            _ => None,
        };
        match it.init.as_ref().map(without_type_wrappers) {
            Some(Expression::ArrowFunctionExpression(arrow)) => {
                self.component(binding, &arrow.params)
            }
            Some(Expression::FunctionExpression(function)) => {
                self.component(binding, &function.params);
            }
            Some(Expression::CallExpression(call)) => {
                match (&it.id, core_name(self.scoping, self.core, &call.callee)) {
                    (BindingPattern::ArrayPattern(pattern), Some(name))
                        if WRITABLE.contains(&name) =>
                    {
                        if let Some(Some(BindingPattern::BindingIdentifier(setter))) =
                            pattern.elements.get(1)
                            && let Some(symbol) = setter.symbol_id.get()
                            && !self.scoping.symbol_is_mutated(symbol)
                            && !writes_when_owned(call)
                        {
                            self.writers.push(Writer { symbol, action: false });
                        }
                    }
                    (BindingPattern::BindingIdentifier(_), Some("action")) => {
                        if let Some(symbol) = binding
                            && !self.scoping.symbol_is_mutated(symbol)
                        {
                            self.writers.push(Writer { symbol, action: true });
                        }
                    }
                    _ => {}
                }
            }
            Some(init) => {
                if let BindingPattern::ObjectPattern(pattern) = &it.id
                    && let Some(props) = symbol_of(self.scoping, init)
                    && self.env.kind_of(props) == SourceKind::PropsParam
                {
                    for property in &pattern.properties {
                        if let PropertyKey::StaticIdentifier(key) = &property.key
                            && let BindingPattern::BindingIdentifier(local) = &property.value
                            && let Some(local) = local.symbol_id.get()
                        {
                            self.aliases.push((local, props, key.name.as_str()));
                        }
                    }
                }
            }
            None => {}
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if let JSXElementName::IdentifierReference(tag) = &it.opening_element.name
            && let Some(component) =
                tag.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
        {
            for item in &it.opening_element.attributes {
                if let JSXAttributeItem::Attribute(attribute) = item
                    && let JSXAttributeName::Identifier(name) = &attribute.name
                    && let Some(JSXAttributeValue::ExpressionContainer(container)) =
                        &attribute.value
                    && let Some(value) = container.expression.as_expression()
                    && self.changes(value)
                {
                    self.changing.push((component, name.name.as_str()));
                }
            }
        }
        walk::walk_jsx_element(self, it);
    }
}

/// `createSignal(0, { ownedWrite: true })` opts into writes under an owner, and
/// an options value the compiler cannot read might. Either way the setter is
/// not judged.
fn writes_when_owned(call: &CallExpression<'_>) -> bool {
    let Some(options) = call.arguments.get(1) else { return false };
    let Some(options) = options.as_expression() else { return true };
    let Expression::ObjectExpression(object) = without_type_wrappers(options) else {
        return true;
    };
    object.properties.iter().any(|property| match property {
        ObjectPropertyKind::SpreadProperty(_) => true,
        ObjectPropertyKind::ObjectProperty(property) => {
            matches!(&property.key, PropertyKey::StaticIdentifier(key) if key.name == "ownedWrite")
                && !matches!(&property.value, Expression::BooleanLiteral(value) if !value.value)
        }
    })
}

/// What the walk is directly inside of.
#[derive(Clone, Copy)]
struct Frame<'a> {
    /// A write here runs under an owner.
    owned: bool,
    /// The component whose body this is, when it is one.
    component: Option<&'a str>,
    /// The primitive whose computation this is, when it is one.
    compute: Option<&'a str>,
}

struct Rules<'s, 'c, 'a> {
    allocator: &'a Allocator,
    scoping: &'s Scoping,
    env: &'s ReactiveEnv<'a>,
    source: &'a str,
    core: &'c [Import<'a>],
    writers: Vec<Writer>,
    props: Vec<(SymbolId, SymbolId)>,
    aliases: Vec<(SymbolId, SymbolId, &'a str)>,
    changing: Vec<(SymbolId, &'a str)>,
    frames: Vec<Frame<'a>>,
    /// Function spans the enclosing call runs as a computation, with its name.
    computes: Vec<(Span, &'a str)>,
    /// Function spans handed to `untrack`, which run where they are written.
    untracks: Vec<Span>,
    diagnostics: Vec<Diag<'a>>,
}

impl<'a> Rules<'_, '_, 'a> {
    fn text(&self, span: Span) -> &'a str {
        &self.source[span.start as usize..span.end as usize]
    }

    fn diagnose(&mut self, code: Code, span: Span, message: String) {
        let message = self.allocator.alloc_str(&message) as &'a str;
        self.diagnostics.push(Diag { code, span, message });
    }

    fn reads(&self) -> Reads<'_, 'a> {
        Reads {
            scoping: self.scoping,
            env: self.env,
            core: self.core,
            aliases: &self.aliases,
            deep: false,
            callbacks: false,
            found: Vec::new(),
            awaits: Vec::new(),
        }
    }

    /// BARQ018's evidence. A signal, a memo or a store exists to change. A prop
    /// is a Cell whether or not its caller passes anything that moves, and a
    /// component reading a configuration prop once is ordinary, so a prop
    /// counts only where this module renders the component with a value that
    /// changes.
    fn changing_read(&self, visit: impl FnOnce(&mut Reads<'_, 'a>)) -> Option<Read<'a>> {
        let mut reads = self.reads();
        visit(&mut reads);
        reads.found.into_iter().find(|read| match read.source {
            Source::Binding(_) => true,
            Source::Prop(props, prop) => self
                .props
                .iter()
                .filter(|(_, parameter)| *parameter == props)
                .any(|(component, _)| self.changing.contains(&(*component, prop))),
        })
    }

    fn enter(&mut self, span: Span) -> Frame<'a> {
        if let Some((_, name)) = self.env.components.iter().find(|(at, _)| *at == span) {
            return Frame { owned: true, component: Some(name), compute: None };
        }
        if let Some((_, name)) = self.computes.iter().find(|(at, _)| *at == span) {
            return Frame { owned: true, component: None, compute: Some(name) };
        }
        if self.untracks.contains(&span) {
            let owned = self.frames.last().is_some_and(|frame| frame.owned);
            return Frame { owned, component: None, compute: None };
        }
        Frame { owned: false, component: None, compute: None }
    }

    fn component(&self) -> Option<&'a str> {
        self.frames.last().and_then(|frame| frame.component)
    }

    /// BARQ018's message, shared by the `if`, `switch` and `return` arms.
    fn chose_once(&mut self, component: &'a str, read: Read<'a>, fix: &str) {
        let shown = self.text(read.span);
        self.diagnose(
            Code::Barq018,
            read.span,
            format!(
                "`{component}` reads `{shown}` while its body runs and builds what it returns \
                 from that one value. A component body is not a tracked scope: it does not run \
                 again when `{shown}` changes, so the page keeps what it showed first. {fix}"
            ),
        );
    }

    /// BARQ021. One report per computation: the first source that only an
    /// `await` precedes. A source also read before the first `await` is
    /// tracked, and so is not reported.
    fn after_await(&mut self, primitive: &'a str, visit: impl FnOnce(&mut Reads<'_, 'a>)) {
        let mut reads = self.reads();
        reads.callbacks = true;
        visit(&mut reads);
        let Some(first) = reads.awaits.iter().map(|span| span.end).min() else { return };
        let before: Vec<Source<'a>> = reads
            .found
            .iter()
            .filter(|read| read.span.end <= first)
            .map(|read| read.source)
            .collect();
        let Some(late) = reads
            .found
            .iter()
            .find(|read| read.span.start >= first && !before.contains(&read.source))
            .copied()
        else {
            return;
        };
        let shown = self.text(late.span);
        self.diagnose(
            Code::Barq021,
            late.span,
            format!(
                "`{shown}` is read after an `await`, and an async computation tracks only what it \
                 reads before its first `await`. When it changes, this `{primitive}` does not run \
                 again and its value stays stale. Read it before the first `await` and keep the \
                 value in a local, or wrap the read in `untrack(() => …)` if one read is meant."
            ),
        );
    }

    fn function_like(
        &mut self,
        span: Span,
        is_async: bool,
        visit: impl FnOnce(&mut Reads<'_, 'a>),
    ) {
        let frame = self.enter(span);
        if is_async && let Some(primitive) = frame.compute {
            self.after_await(primitive, visit);
        }
        self.frames.push(frame);
    }
}

impl<'a> Visit<'a> for Rules<'_, '_, 'a> {
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.function_like(it.span, it.r#async, |reads| {
            if let Some(body) = it.body.as_deref() {
                reads.visit_function_body(body);
            }
        });
        walk::walk_function(self, it, flags);
        self.frames.pop();
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.function_like(it.span, it.r#async, |reads| match &it.body {
            ArrowFunctionBody::FunctionBody(body) => reads.visit_function_body(body),
            body => {
                if let Some(expression) = body.as_expression() {
                    reads.visit_expression(expression);
                }
            }
        });
        walk::walk_arrow_function_expression(self, it);
        self.frames.pop();
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let name = core_name(self.scoping, self.core, &it.callee);
        if let Some(name) = name
            && let Some(first) = it.arguments.first().and_then(|argument| argument.as_expression())
        {
            let span = match without_type_wrappers(first) {
                Expression::ArrowFunctionExpression(arrow) => Some(arrow.span),
                Expression::FunctionExpression(function) => Some(function.span),
                _ => None,
            };
            if let Some(span) = span {
                if COMPUTES.contains(&name) {
                    self.computes.push((span, name));
                } else if name == "untrack" {
                    self.untracks.push(span);
                }
            }
        }

        if self.frames.last().is_some_and(|frame| frame.owned) {
            let frame = *self.frames.last().expect("checked above");
            let written = symbol_of(self.scoping, &it.callee)
                .and_then(|symbol| self.writers.iter().find(|writer| writer.symbol == symbol))
                .copied();
            let place = match (frame.component, frame.compute) {
                (Some(component), _) => format!("while `{component}`'s body runs"),
                (None, Some(primitive)) => {
                    format!("inside the function `{primitive}` runs to compute its value")
                }
                (None, None) => "while a component or a computation runs".to_string(),
            };
            let callee = self.text(it.callee.span());
            if let Some(writer) = written {
                let message = if writer.action {
                    format!(
                        "`{callee}` is an action, and it is called {place}. Development builds \
                         throw `ACTION_CALLED_IN_OWNED_SCOPE` here, because an action is a \
                         transaction started by the user. Call it from an event handler, or from \
                         the second function of `createEffect`."
                    )
                } else {
                    format!(
                        "`{callee}` writes reactive state {place}. Development builds throw \
                         `REACTIVE_WRITE_IN_OWNED_SCOPE` here, so this code stops working when \
                         it runs in development. Derive the value instead (an initial value, or \
                         `createMemo(() => …)`), or write it from an event handler, \
                         `onSettled`, or the second function of `createEffect`."
                    )
                };
                self.diagnose(Code::Barq019, it.span, message);
            } else if name == Some("refresh") {
                self.diagnose(
                    Code::Barq019,
                    it.span,
                    format!(
                        "`{callee}` is called {place}, and a refresh invalidates a source the \
                         graph is reading. Development builds throw \
                         `REACTIVE_WRITE_IN_OWNED_SCOPE` here. Call it from an event handler, \
                         an action, or the second function of `createEffect`."
                    ),
                );
            }
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_if_statement(&mut self, it: &IfStatement<'a>) {
        if let Some(component) = self.component()
            && (returns(&it.consequent) || it.alternate.as_ref().is_some_and(returns))
            && let Some(read) = self.changing_read(|reads| reads.visit_expression(&it.test))
        {
            self.chose_once(
                component,
                read,
                "Make the choice in the returned JSX, where it stays live: `<Show when={…} \
                 fallback={…}>…</Show>`.",
            );
        }
        walk::walk_if_statement(self, it);
    }

    fn visit_switch_statement(&mut self, it: &SwitchStatement<'a>) {
        if let Some(component) = self.component()
            && it.cases.iter().any(|case| case.consequent.iter().any(returns))
            && let Some(read) = self.changing_read(|reads| reads.visit_expression(&it.discriminant))
        {
            self.chose_once(
                component,
                read,
                "Make the choice in the returned JSX, where it stays live: `<Switch>` with one \
                 `<Match when={…}>` per case.",
            );
        }
        walk::walk_switch_statement(self, it);
    }

    fn visit_return_statement(&mut self, it: &ReturnStatement<'a>) {
        if let Some(component) = self.component()
            && let Some(argument) = it.argument.as_ref()
            && let Some(read) = self.changing_read(|reads| reads.visit_expression(argument))
        {
            self.chose_once(
                component,
                read,
                "Read it inside the returned JSX instead, where it stays live: `<>{…}</>`, \
                 `<Show>` or `<For>`.",
            );
        }
        walk::walk_return_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let Some(component) = self.component()
            && let BindingPattern::ObjectPattern(pattern) = &it.id
            && let Some(init) = it.init.as_ref()
            && let Some(store) = symbol_of(self.scoping, init)
            && self.env.kind_of(store) == SourceKind::ReactiveObject
        {
            let name = self.scoping.symbol_name(store);
            let first = pattern.properties.first().and_then(|property| match &property.key {
                PropertyKey::StaticIdentifier(key) => Some(key.name.as_str()),
                _ => None,
            });
            let fix = match first {
                Some(key) => format!("`{name}.{key}`"),
                None => format!("`{name}.<key>`"),
            };
            self.diagnose(
                Code::Barq020,
                pattern.span,
                format!(
                    "`{component}` takes the store `{name}` apart in its body, so each name \
                     holds the value its property had when the body ran. A component body is \
                     not a tracked scope, and a later write to the store does not reach these \
                     names. Read the property where it is used, for example {fix} inside the \
                     JSX."
                ),
            );
        }
        walk::walk_variable_declarator(self, it);
    }
}

/// Whether a statement returns from the function it is written in.
fn returns(statement: &Statement<'_>) -> bool {
    match statement {
        Statement::ReturnStatement(_) => true,
        Statement::BlockStatement(block) => block.body.iter().any(returns),
        Statement::IfStatement(it) => {
            returns(&it.consequent) || it.alternate.as_ref().is_some_and(returns)
        }
        Statement::SwitchStatement(it) => {
            it.cases.iter().any(|case| case.consequent.iter().any(returns))
        }
        Statement::TryStatement(it) => {
            it.block.body.iter().any(returns)
                || it.handler.as_ref().is_some_and(|handler| handler.body.body.iter().any(returns))
                || it.finalizer.as_ref().is_some_and(|block| block.body.iter().any(returns))
        }
        Statement::LabeledStatement(it) => returns(&it.body),
        Statement::ForStatement(it) => returns(&it.body),
        Statement::ForInStatement(it) => returns(&it.body),
        Statement::ForOfStatement(it) => returns(&it.body),
        Statement::WhileStatement(it) => returns(&it.body),
        Statement::DoWhileStatement(it) => returns(&it.body),
        _ => false,
    }
}

/// What a reactive read reads, so a second read of the same source is known.
#[derive(Clone, Copy, PartialEq)]
enum Source<'a> {
    Binding(SymbolId),
    Prop(SymbolId, &'a str),
}

#[derive(Clone, Copy)]
struct Read<'a> {
    span: Span,
    source: Source<'a>,
}

/// The reactive reads an expression makes where it is evaluated, in source
/// order. It stops at a function, which reads later or never; at JSX, which the
/// compiler makes live; and at `untrack`, which is a one-time read on purpose.
struct Reads<'s, 'a> {
    scoping: &'s Scoping,
    env: &'s ReactiveEnv<'a>,
    core: &'s [Import<'a>],
    aliases: &'s [(SymbolId, SymbolId, &'a str)],
    /// Into nested functions too: a value handed to a component that reads it
    /// later still changes.
    deep: bool,
    /// Into a function passed to a call, which the callee may run on the spot:
    /// `items.filter((item) => item.tag === query())` reads where it is written.
    callbacks: bool,
    found: Vec<Read<'a>>,
    awaits: Vec<Span>,
}

impl<'a> Reads<'_, 'a> {
    fn called(&self, call: &CallExpression<'a>) -> Option<Source<'a>> {
        if !call.arguments.is_empty() {
            return None;
        }
        match without_type_wrappers(&call.callee) {
            Expression::StaticMemberExpression(member) => {
                let object = symbol_of(self.scoping, &member.object)?;
                let prop = member.property.name.as_str();
                // `children` is the slot a Block arrives in, built by whoever
                // places it rather than read as a value.
                (self.env.kind_of(object) == SourceKind::PropsParam && prop != "children")
                    .then_some(Source::Prop(object, prop))
            }
            callee => {
                let symbol = symbol_of(self.scoping, callee)?;
                if let Some((_, props, key)) =
                    self.aliases.iter().find(|(local, _, _)| *local == symbol)
                {
                    return Some(Source::Prop(*props, key));
                }
                (self.env.kind_of(symbol) == SourceKind::Accessor || self.env.is_derived(symbol))
                    .then_some(Source::Binding(symbol))
            }
        }
    }

    fn store(&self, object: &Expression<'a>) -> Option<Source<'a>> {
        let symbol = symbol_of(self.scoping, object)?;
        (self.env.kind_of(symbol) == SourceKind::ReactiveObject).then_some(Source::Binding(symbol))
    }
}

impl<'a> Visit<'a> for Reads<'_, 'a> {
    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        if self.deep {
            walk::walk_function(self, it, flags);
        }
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        if self.deep {
            walk::walk_arrow_function_expression(self, it);
        }
    }

    fn visit_jsx_element(&mut self, _: &JSXElement<'a>) {}

    fn visit_jsx_fragment(&mut self, _: &JSXFragment<'a>) {}

    fn visit_await_expression(&mut self, it: &AwaitExpression<'a>) {
        walk::walk_await_expression(self, it);
        self.awaits.push(it.span);
    }

    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        if it.r#await {
            self.visit_for_statement_left(&it.left);
            self.visit_expression(&it.right);
            self.awaits.push(Span::new(it.right.span().end, it.right.span().end));
            self.visit_statement(&it.body);
            return;
        }
        walk::walk_for_of_statement(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if core_name(self.scoping, self.core, &it.callee) == Some("untrack") {
            return;
        }
        if let Some(source) = self.called(it) {
            self.found.push(Read { span: it.span, source });
            return;
        }
        if self.callbacks {
            self.visit_expression(&it.callee);
            for argument in &it.arguments {
                match argument.as_expression().map(without_type_wrappers) {
                    Some(Expression::ArrowFunctionExpression(arrow)) => {
                        walk::walk_arrow_function_expression(self, arrow);
                    }
                    Some(Expression::FunctionExpression(function)) => {
                        walk::walk_function(self, function, ScopeFlags::Function);
                    }
                    _ => self.visit_argument(argument),
                }
            }
            return;
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let Some(source) = self.store(&it.object) {
            self.found.push(Read { span: it.span, source });
            return;
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if let Some(source) = self.store(&it.object) {
            self.found.push(Read { span: it.span, source });
            return;
        }
        walk::walk_computed_member_expression(self, it);
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::source_type_for;
    use crate::ir::Module;
    use crate::options::ResolvedOptions;
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;

    const IMPORT: &str = "import { createSignal, createMemo, createEffect, createStore, untrack, \
                          refresh, action, onSettled, For } from \"@barqjs/core\";\n";

    fn codes(body: &str) -> Vec<&'static str> {
        codes_with(body, true)
    }

    fn codes_with(body: &str, diagnostics: bool) -> Vec<&'static str> {
        let source = format!("{IMPORT}{body}");
        let allocator = Allocator::new();
        let source = allocator.alloc_str(&source);
        let program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        let options = ResolvedOptions { dev: true, diagnostics, ..ResolvedOptions::default() };
        super::super::bind(&allocator, &program, &mut module, &options);
        module.env.diagnostics.iter().map(|diag| diag.code.as_str()).collect()
    }

    #[test]
    fn a_choice_made_from_a_signal_in_a_component_body_is_reported() {
        let cases = [
            "if (!on()) return <p>off</p>;\n  return <p>on</p>;",
            "switch (on()) { case true: return <p>on</p>; }\n  return <p>off</p>;",
            "return on() ? <p>on</p> : <p>off</p>;",
            "return on() && <p>on</p>;",
            "if (state.on) return <p>on</p>;\n  return <p>off</p>;",
        ];
        for case in cases {
            let body = format!(
                "const [on] = createSignal(false);\nconst [rows] = createSignal([]);\n\
                 const [state] = createStore({{ on: false }});\n\
                 export function Gate() {{\n  {case}\n}}\n"
            );
            assert_eq!(codes(&body), ["BARQ018"], "{case}");
        }
    }

    #[test]
    fn a_choice_made_where_it_stays_live_is_not_reported() {
        let cases = [
            "return <>{on() ? <p>on</p> : <p>off</p>}</>;",
            "if (untrack(() => on())) return <p>on</p>;\n  return <p>off</p>;",
            "const click = () => { if (on()) return; };\n  return <button onClick={click}>x</button>;",
            "return <For each={rows()}>{(row) => { if (row) return <i />; return null; }}</For>;",
            "if (on()) console.log(\"on\");\n  return <p>x</p>;",
        ];
        for case in cases {
            let body = format!(
                "const [on] = createSignal(false);\nconst [rows] = createSignal([]);\n\
                 export function Gate() {{\n  {case}\n}}\n"
            );
            assert_eq!(codes(&body), Vec::<&str>::new(), "{case}");
        }
    }

    /// A prop is only evidence when this module renders the component with a
    /// value that changes; a constant there, or no call site at all, says
    /// nothing about whether it moves.
    #[test]
    fn a_choice_made_from_a_prop_needs_a_changing_call_site() {
        let gate = "function Gate(props) {\n  if (!props.on()) return <p>off</p>;\n  \
                    return <p>on</p>;\n}\n";
        let live = format!(
            "{gate}const [on] = createSignal(false);\nexport const V = () => <Gate on={{on()}} />;\n"
        );
        assert_eq!(codes(&live), ["BARQ018"]);
        let by_name = format!(
            "{gate}const [on] = createSignal(false);\nexport const V = () => <Gate on={{on}} />;\n"
        );
        assert_eq!(codes(&by_name), ["BARQ018"]);
        let constant = format!("{gate}export const V = () => <Gate on={{true}} />;\n");
        assert_eq!(codes(&constant), Vec::<&str>::new());
        let once = format!(
            "{gate}const [on] = createSignal(false);\nexport const V = () => <Gate on={{untrack(() => on())}} />;\n"
        );
        assert_eq!(codes(&once), Vec::<&str>::new());
        let exported = format!("export {gate}");
        assert_eq!(codes(&exported), Vec::<&str>::new());
        let other_prop = format!(
            "{gate}const [on] = createSignal(false);\nexport const V = () => <Gate on={{true}} label={{on()}} />;\n"
        );
        assert_eq!(codes(&other_prop), Vec::<&str>::new());

        let aliased = "function Gate(props) {\n  const { on } = props;\n  if (!on()) return <p>off</p>;\n  \
                       return <p>on</p>;\n}\nconst [on] = createSignal(false);\n\
                       export const V = () => <Gate on={on()} />;\n";
        assert_eq!(codes(aliased), ["BARQ018"]);
    }

    #[test]
    fn a_write_while_a_component_or_a_computation_runs_is_reported() {
        let cases = [
            "export function C() {\n  setCount(1);\n  return <p />;\n}\n",
            "export function C() {\n  untrack(() => setCount(1));\n  return <p />;\n}\n",
            "export function C() {\n  return <p>{setCount(1)}</p>;\n}\n",
            "export const total = createMemo(() => { setCount(2); return 1; });\n",
            "createEffect(() => { setCount(2); return 1; }, () => {});\n",
            "const save = action(async () => {});\nexport function C() {\n  save();\n  return <p />;\n}\n",
            "export function C() {\n  refresh(count);\n  return <p />;\n}\n",
            "const [state, setState] = createStore({ n: 0 });\nexport function C() {\n  setState((s) => { s.n = 1; });\n  return <p />;\n}\n",
        ];
        for case in cases {
            let body = format!("const [count, setCount] = createSignal(0);\n{case}");
            assert_eq!(codes(&body), ["BARQ019"], "{case}");
        }
    }

    #[test]
    fn a_write_from_an_event_handler_or_an_effect_is_not_reported() {
        let cases = [
            "export function C() {\n  return <button onClick={() => setCount(1)}>x</button>;\n}\n",
            "export function C() {\n  onSettled(() => setCount(1));\n  return <p />;\n}\n",
            "createEffect(() => count(), (value) => { setCount(value + 1); });\n",
            "setCount(1);\n",
            "export function C() {\n  return <button onClick={setCount}>x</button>;\n}\n",
        ];
        for case in cases {
            let body = format!("const [count, setCount] = createSignal(0);\n{case}");
            assert_eq!(codes(&body), Vec::<&str>::new(), "{case}");
        }
        let owned = "const [count, setCount] = createSignal(0, { ownedWrite: true });\n\
                     export function C() {\n  setCount(1);\n  return <p />;\n}\n";
        assert_eq!(codes(owned), Vec::<&str>::new());
        let unknown = "const options = {};\nconst [count, setCount] = createSignal(0, options);\n\
                       export function C() {\n  setCount(1);\n  return <p />;\n}\n";
        assert_eq!(codes(unknown), Vec::<&str>::new());
    }

    #[test]
    fn a_store_taken_apart_in_a_component_body_is_reported() {
        let store = "const [state] = createStore({ count: 0, name: \"salama\" });\n";
        let body = format!(
            "{store}export function C() {{\n  const {{ count, name }} = state;\n  return <p>{{count}} {{name}}</p>;\n}}\n"
        );
        assert_eq!(codes(&body), ["BARQ020"]);
        let in_memo = format!(
            "{store}export function C() {{\n  const sum = createMemo(() => {{ const {{ count }} = state; return count; }});\n  return <p>{{sum()}}</p>;\n}}\n"
        );
        assert_eq!(codes(&in_memo), Vec::<&str>::new());
        let props =
            "export function C(props) {\n  const { name } = props;\n  return <p>{name()}</p>;\n}\n";
        assert_eq!(codes(props), Vec::<&str>::new());
    }

    #[test]
    fn a_read_after_the_first_await_of_an_async_computation_is_reported() {
        let signals = "const [id] = createSignal(1);\nconst [unit] = createSignal(\"kg\");\n\
                       const load = async (n) => n;\n";
        let late = format!(
            "{signals}export const w = createMemo(async () => {{ const n = await load(id()); return n + unit(); }});\n"
        );
        assert_eq!(codes(&late), ["BARQ021"]);
        let both = format!(
            "{signals}export const w = createMemo(async () => {{ const u = unit(); const n = await load(id()); return n + u + unit(); }});\n"
        );
        assert_eq!(codes(&both), Vec::<&str>::new());
        let untracked = format!(
            "{signals}export const w = createMemo(async () => {{ const n = await load(id()); return n + untrack(unit); }});\n"
        );
        assert_eq!(codes(&untracked), Vec::<&str>::new());
        let sync = format!("{signals}export const w = createMemo(() => id() + unit());\n");
        assert_eq!(codes(&sync), Vec::<&str>::new());
        let deferred = format!(
            "{signals}export const w = createMemo(async () => {{ const n = await load(id()); return () => n + unit(); }});\n"
        );
        assert_eq!(codes(&deferred), Vec::<&str>::new());
        let callback = format!(
            "{signals}export const w = createMemo(async () => {{ const rows = await load([]); return rows.filter((row) => row === unit()); }});\n"
        );
        assert_eq!(codes(&callback), ["BARQ021"]);
        let effect = format!(
            "{signals}createEffect(async () => {{ await load(1); return unit(); }}, () => {{}});\n"
        );
        assert_eq!(codes(&effect), ["BARQ021"]);
    }

    #[test]
    fn nothing_is_reported_when_diagnostics_are_off() {
        let body = "const [count, setCount] = createSignal(0);\n\
                    export function C() {\n  setCount(1);\n  if (count()) return null;\n  return <p />;\n}\n";
        assert_eq!(codes(body), ["BARQ019", "BARQ018"]);
        assert_eq!(codes_with(body, false), Vec::<&str>::new());
    }
}
