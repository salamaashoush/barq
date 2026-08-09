use oxc::ast::ast::{
    ArrowFunctionExpression, BindingPattern, Declaration, ExportDefaultDeclarationKind, Expression,
    FormalParameters, Function, ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXExpression,
    JSXMemberExpressionObject, ModuleExportName, Program, Statement, StaticMemberExpression,
    VariableDeclarator,
};
use oxc::ast_visit::Visit;
use oxc::ast_visit::walk;
use oxc::semantic::{Scoping, SymbolId};

use crate::ir::{BIT_OVERFLOW, Const, Flow, MemberMask, Module, Prim, ReactiveEnv, SourceKind};

use super::symbol_of;

/// A declaration initialiser, reduced to what the fixpoint actually reads. It is
/// OWNED, so the AST is walked exactly once and the loop below runs over a flat
/// vector instead of re-traversing the program.
#[derive(Clone, Copy)]
enum InitOf<'a> {
    Literal(Const<'a>),
    Alias(SymbolId),
    Call(SymbolId),
    NamespaceCall(Prim),
    /// Reading the binding tracks nothing and it carries no constant.
    Inert,
    /// A function or arrow expression: reading the binding tracks nothing, AND
    /// the binding is known to hold a callable.
    Fn,
    Unknown,
}

struct Decl<'a> {
    symbol: SymbolId,
    /// `None` for a whole-binding pattern; `Some(i)` for `const [a, b] = …`.
    element: Option<usize>,
    init: InitOf<'a>,
}

/// What an expression PRODUCES, which is a different question from what reading
/// the result costs: `useState(0)` produces a tuple whose first element is an
/// accessor and whose second is inert.
#[derive(Clone, Copy)]
struct Produced<'a> {
    whole: SourceKind,
    tuple: Option<[SourceKind; 2]>,
    konst: Option<Const<'a>>,
}

impl<'a> Produced<'a> {
    const OPAQUE: Self = Self { whole: SourceKind::Opaque, tuple: None, konst: None };

    fn kind(whole: SourceKind) -> Self {
        Self { whole, tuple: None, konst: None }
    }

    fn tuple(first: SourceKind, second: SourceKind) -> Self {
        Self { whole: SourceKind::Inert, tuple: Some([first, second]), konst: None }
    }

    fn literal(konst: Const<'a>) -> Self {
        Self { whole: SourceKind::ConstLit, tuple: None, konst: Some(konst) }
    }

    fn at(self, element: Option<usize>) -> (SourceKind, Option<Const<'a>>) {
        match element {
            None => (self.whole, self.konst),
            Some(index) => match self.tuple {
                Some(pair) if index < pair.len() => (pair[index], None),
                _ => (SourceKind::Opaque, None),
            },
        }
    }
}

/// P0 Bind. Everything resolves by `SymbolId`: the local binding of every
/// `@barqjs/core` import is found by module specifier plus imported name, so
/// `import { signal as sig }` classifies and a user's `const signal = 1` does
/// not. Where an origin cannot be followed — a re-export through a barrel, a
/// reassigned binding, a pattern with no per-name attribution — the answer is
/// `Opaque`, which every later stage emits unwrapped and is therefore
/// oracle-identical.
pub fn classify<'a>(program: &Program<'a>, module: &mut Module<'a>, module_source: &str) {
    let symbols = module.scoping.symbols_len();
    module.env.kind = vec![SourceKind::Opaque; symbols].into();
    module.env.konst = vec![None; symbols].into();
    module.env.bit = vec![BIT_OVERFLOW; symbols].into();

    let mut binder = Binder {
        scoping: &module.scoping,
        env: &mut module.env,
        namespaces: Vec::new(),
        decls: Vec::new(),
        candidates: Vec::new(),
        tags: Vec::new(),
        exported: Vec::new(),
    };
    binder.imports(program, module_source);
    binder.env.namespaces = binder.namespaces.clone();
    binder.exports(program);
    binder.visit_program(program);
    binder.fixpoint();
    binder.props_params();

    number_reactive_symbols(&mut module.env);
}

/// The dense renumbering `DepSet::mask` indexes. Only a binding whose READ is a
/// tracked read can appear in a dep set, so nothing else costs a bit.
fn number_reactive_symbols(env: &mut ReactiveEnv<'_>) {
    let mut next = 0u8;
    for index in 0..env.kind.len() {
        let symbol = SymbolId::from_usize(index);
        if !ReactiveEnv::is_reactive(env.kind[symbol]) {
            continue;
        }
        env.bit[symbol] = if next < 64 { next } else { BIT_OVERFLOW };
        next = next.saturating_add(1);
    }
}

struct Binder<'p, 'a> {
    scoping: &'p Scoping,
    env: &'p mut ReactiveEnv<'a>,
    /// `import * as core from "@barqjs/core"` — `core.signal(0)` still resolves.
    namespaces: Vec<SymbolId>,
    decls: Vec<Decl<'a>>,
    /// `(owner, props)` for every function shaped like a component. Applied
    /// after the walk so a control-flow row attribution always wins.
    candidates: Vec<(Option<SymbolId>, SymbolId)>,
    /// Every binding this module writes as a JSX tag.
    tags: Vec<SymbolId>,
    exported: Vec<SymbolId>,
}

impl<'a> Binder<'_, 'a> {
    /// A flat scan over top-level statements, not a walk: `build_module_record`
    /// does not exist on oxc 0.143, and an import binding is an ordinary symbol
    /// anyway.
    fn imports(&mut self, program: &Program<'a>, module_source: &str) {
        for statement in &program.body {
            let Statement::ImportDeclaration(declaration) = statement else { continue };
            if declaration.source.value.as_str() != module_source {
                continue;
            }
            let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
            for specifier in specifiers {
                match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                        let ModuleExportName::IdentifierName(name) = &imported.imported else {
                            continue;
                        };
                        let Some(prim) = Prim::of_export(name.name.as_str()) else { continue };
                        if let Some(symbol) = imported.local.symbol_id.get() {
                            self.env.kind[symbol] = SourceKind::Primitive(prim);
                        }
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => {
                        if let Some(symbol) = namespace.local.symbol_id.get() {
                            self.namespaces.push(symbol);
                        }
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {}
                }
            }
        }
    }

    /// Which bindings leave the module. A component used only by its importers
    /// is still a component, so being exported counts as evidence exactly as
    /// being written as a tag does.
    fn exports(&mut self, program: &Program<'a>) {
        for statement in &program.body {
            match statement {
                Statement::ExportDeclaration(export) => match &export.declaration {
                    Declaration::VariableDeclaration(declaration) => {
                        for declarator in &declaration.declarations {
                            if let BindingPattern::BindingIdentifier(identifier) = &declarator.id
                                && let Some(symbol) = identifier.symbol_id.get()
                            {
                                self.exported.push(symbol);
                            }
                        }
                    }
                    Declaration::FunctionDeclaration(function) => {
                        if let Some(symbol) = function.id.as_ref().and_then(|id| id.symbol_id.get())
                        {
                            self.exported.push(symbol);
                        }
                    }
                    _ => {}
                },
                Statement::ExportNamedDeclaration(export) => {
                    for specifier in &export.specifiers {
                        let ModuleExportName::IdentifierReference(reference) = &specifier.local
                        else {
                            continue;
                        };
                        if let Some(symbol) = reference
                            .reference_id
                            .get()
                            .and_then(|id| self.scoping.get_reference(id).symbol_id())
                        {
                            self.exported.push(symbol);
                        }
                    }
                }
                // The default export has no binding of its own to look up, so
                // the evidence is the export itself.
                Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                    ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                        if function_returns_jsx(function)
                            && let Some(props) = props_symbol(&function.params)
                        {
                            self.candidates.push((None, props));
                        }
                    }
                    ExportDefaultDeclarationKind::ArrowFunctionExpression(arrow) => {
                        if arrow_returns_jsx(arrow)
                            && let Some(props) = props_symbol(&arrow.params)
                        {
                            self.candidates.push((None, props));
                        }
                    }
                    ExportDefaultDeclarationKind::Identifier(reference) => {
                        if let Some(symbol) = reference
                            .reference_id
                            .get()
                            .and_then(|id| self.scoping.get_reference(id).symbol_id())
                        {
                            self.exported.push(symbol);
                        }
                    }
                    _ => {}
                },
                _ => {}
            }
        }
    }

    /// DESIGN §2.4: the props parameter of a compiled component. Member reads on
    /// it are ⊤-reactive because our own component emit lowers props to getters,
    /// so without this the getter is dead weight and `{props.total}` renders once.
    ///
    /// A candidate needs BOTH halves of the evidence: the function returns JSX,
    /// and the module either writes it as a tag or lets it out. A one-parameter
    /// JSX-returning arrow is otherwise indistinguishable from a `<For>` row
    /// callback or a `.map` body, where a thunk would be pure loss.
    ///
    /// Applied after the walk, and only to a symbol nothing else classified, so
    /// a row attribution always wins.
    fn props_params(&mut self) {
        for index in 0..self.candidates.len() {
            let (owner, props) = self.candidates[index];
            let known = match owner {
                None => true,
                Some(owner) => self.tags.contains(&owner) || self.exported.contains(&owner),
            };
            if known && self.env.kind[props] == SourceKind::Opaque {
                self.env.kind[props] = SourceKind::PropsParam;
            }
        }
    }

    /// Aliasing needs the alias target's answer, so the declaration list runs to
    /// a fixpoint. A symbol only ever moves away from `Opaque` once, so this
    /// converges in as many turns as the longest alias chain; the cap is for a
    /// cycle (`let a = b, b = a`).
    fn fixpoint(&mut self) {
        for _ in 0..8 {
            let mut changed = false;
            for index in 0..self.decls.len() {
                let Decl { symbol, element, init } = self.decls[index];
                // A reassigned binding joins every write RHS; none of them are
                // followed, so it stays Opaque.
                if self.scoping.symbol_is_mutated(symbol) {
                    continue;
                }
                let (kind, konst) = self.produced(init).at(element);
                if self.env.kind[symbol] != kind {
                    self.env.kind[symbol] = kind;
                    changed = true;
                }
                if self.env.konst[symbol] != konst {
                    self.env.konst[symbol] = konst;
                    changed = true;
                }
            }
            if !changed {
                return;
            }
        }
    }

    fn produced(&self, init: InitOf<'a>) -> Produced<'a> {
        match init {
            InitOf::Literal(konst) => Produced::literal(konst),
            InitOf::Alias(symbol) => Produced {
                whole: self.env.kind_of(symbol),
                tuple: None,
                konst: self.env.konst_of(symbol),
            },
            InitOf::Call(symbol) => match self.env.kind_of(symbol) {
                SourceKind::Primitive(prim) => self.returns(prim),
                // `const c = count()` snapshots the value; reading `c` later
                // tracks nothing.
                SourceKind::Accessor { .. } => Produced::kind(SourceKind::Inert),
                _ => Produced::OPAQUE,
            },
            InitOf::NamespaceCall(prim) => self.returns(prim),
            InitOf::Inert => Produced::kind(SourceKind::Inert),
            InitOf::Fn => Produced::kind(SourceKind::Fn),
            InitOf::Unknown => Produced::OPAQUE,
        }
    }

    /// The per-primitive return-shape table, verified against the runtime: V3
    /// says `signal()` is a callable `Signal<T>` with `.set`/`.update`/`.peek`,
    /// not a tuple, and `useState` is the tuple form.
    fn returns(&self, prim: Prim) -> Produced<'a> {
        let signal = SourceKind::Accessor { nonreactive: MemberMask::SIGNAL };
        // Only `signal()` documents the write members. Masking a member a
        // primitive does not have would turn a tracked read into `Static`.
        let accessor = SourceKind::Accessor { nonreactive: MemberMask::EMPTY };
        match prim {
            Prim::Signal => Produced::kind(signal),
            Prim::Computed
            | Prim::UseMemo
            | Prim::CreateAsync
            | Prim::CreateOptimistic
            | Prim::MapArray
            | Prim::Repeat => Produced::kind(accessor),
            Prim::UseState => Produced::tuple(accessor, SourceKind::Inert),
            Prim::UseStore | Prim::CreateOptimisticStore => {
                Produced::tuple(SourceKind::ReactiveObject, SourceKind::Inert)
            }
            Prim::CreateProjection => Produced::kind(SourceKind::ReactiveObject),
            Prim::UseResource => Produced::kind(SourceKind::AccessorRecord),
            // `useContext` hands back whatever was provided; guessing is the one
            // kind of wrong verdict that produces a silently dead UI.
            Prim::UseContext => Produced::OPAQUE,
            Prim::Untrack | Prim::Batch | Prim::Peek => Produced::kind(SourceKind::Inert),
            Prim::Flow(_) => Produced::OPAQUE,
        }
    }

    fn init_of(&self, expression: &Expression<'a>) -> InitOf<'a> {
        match expression {
            Expression::ParenthesizedExpression(inner) => self.init_of(&inner.expression),
            Expression::TSAsExpression(inner) => self.init_of(&inner.expression),
            Expression::TSNonNullExpression(inner) => self.init_of(&inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.init_of(&inner.expression),
            // A lone-surrogate literal's `value` is an escaped encoding, not
            // the string itself (see P2). Reading the binding still tracks
            // nothing; it simply carries no constant the folder may bake.
            Expression::StringLiteral(literal) if literal.lone_surrogates => InitOf::Inert,
            Expression::StringLiteral(literal) => {
                InitOf::Literal(Const::Str(literal.value.as_str()))
            }
            Expression::NumericLiteral(literal) => InitOf::Literal(Const::Num(literal.value)),
            Expression::BooleanLiteral(literal) => InitOf::Literal(Const::Bool(literal.value)),
            Expression::NullLiteral(_) => InitOf::Literal(Const::Null),
            Expression::TemplateLiteral(literal) if literal.expressions.is_empty() => literal
                .quasis
                .first()
                .filter(|quasi| !quasi.lone_surrogates)
                .and_then(|quasi| quasi.value.cooked.as_ref())
                .map_or(InitOf::Inert, |cooked| InitOf::Literal(Const::Str(cooked.as_str()))),
            Expression::Identifier(_) => {
                symbol_of(self.scoping, expression).map_or(InitOf::Unknown, InitOf::Alias)
            }
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                InitOf::Fn
            }
            Expression::CallExpression(call) => match &call.callee {
                Expression::Identifier(_) => {
                    symbol_of(self.scoping, &call.callee).map_or(InitOf::Unknown, InitOf::Call)
                }
                Expression::StaticMemberExpression(member) => {
                    symbol_of(self.scoping, &member.object)
                        .filter(|symbol| self.namespaces.contains(symbol))
                        .and_then(|_| Prim::of_export(member.property.name.as_str()))
                        .map_or(InitOf::Unknown, InitOf::NamespaceCall)
                }
                _ => InitOf::Unknown,
            },
            _ => InitOf::Unknown,
        }
    }

    fn record(&mut self, declarator: &VariableDeclarator<'a>) {
        let Some(init) = declarator.init.as_ref() else { return };
        if let BindingPattern::BindingIdentifier(identifier) = &declarator.id
            && let Some(owner) = identifier.symbol_id.get()
        {
            let props = match init {
                Expression::ArrowFunctionExpression(arrow) if arrow_returns_jsx(arrow) => {
                    props_symbol(&arrow.params)
                }
                Expression::FunctionExpression(function) if function_returns_jsx(function) => {
                    props_symbol(&function.params)
                }
                _ => None,
            };
            if let Some(props) = props {
                self.candidates.push((Some(owner), props));
            }
        }
        let init = self.init_of(init);
        match &declarator.id {
            BindingPattern::BindingIdentifier(identifier) => {
                if let Some(symbol) = identifier.symbol_id.get() {
                    self.decls.push(Decl { symbol, element: None, init });
                }
            }
            BindingPattern::ArrayPattern(pattern) => {
                for (index, element) in pattern.elements.iter().enumerate() {
                    let Some(element) = element else { continue };
                    let BindingPattern::BindingIdentifier(identifier) = element else {
                        continue;
                    };
                    if let Some(symbol) = identifier.symbol_id.get() {
                        self.decls.push(Decl { symbol, element: Some(index), init });
                    }
                }
            }
            // An object pattern off a store proxy would need per-property
            // attribution the analysis cannot prove; every name stays Opaque.
            _ => {}
        }
    }

    /// Control-flow row parameters, by arity and position from the real
    /// signatures (`components.ts`). The keyed `For` row VALUE is a plain value,
    /// not an accessor — the classic name-heuristic bug (V8).
    fn row_params(&mut self, element: &JSXElement<'a>) {
        let JSXElementName::IdentifierReference(name) = &element.opening_element.name else {
            return;
        };
        let Some(symbol) =
            name.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
        else {
            return;
        };
        self.tags.push(symbol);
        let Some(flow) = self.env.kind_of(symbol).flow() else { return };

        // `For keyed={false}` delegates to `Index` at runtime, so it takes
        // Index's attribution.
        let keyed = !element.opening_element.attributes.iter().any(|item| {
            let JSXAttributeItem::Attribute(attribute) = item else { return false };
            let JSXAttributeName::Identifier(name) = &attribute.name else { return false };
            name.name.as_str() == "keyed"
                && matches!(
                    attribute.value.as_ref(),
                    Some(JSXAttributeValue::ExpressionContainer(container))
                        if matches!(
                            &container.expression,
                            JSXExpression::BooleanLiteral(literal) if !literal.value
                        )
                )
        });

        let accessor = SourceKind::Accessor { nonreactive: MemberMask::EMPTY };
        let params: &[SourceKind] = match flow {
            Flow::For if keyed => &[SourceKind::RowValue, accessor],
            Flow::For | Flow::Index => &[accessor, SourceKind::Inert],
            Flow::Repeat => &[SourceKind::Inert],
            _ => return,
        };

        for child in &element.children {
            let JSXChild::ExpressionContainer(container) = child else { continue };
            let JSXExpression::ArrowFunctionExpression(arrow) = &container.expression else {
                continue;
            };
            self.attribute(arrow, params);
        }
    }

    fn attribute(&mut self, arrow: &ArrowFunctionExpression<'a>, params: &[SourceKind]) {
        for (index, param) in arrow.params.items.iter().enumerate() {
            let Some(kind) = params.get(index) else { break };
            let BindingPattern::BindingIdentifier(identifier) = &param.pattern else {
                continue;
            };
            if let Some(symbol) = identifier.symbol_id.get() {
                self.env.kind[symbol] = *kind;
            }
        }
    }
}

/// The single identifier parameter a props object can arrive through. A
/// destructured or defaulted pattern reads every getter at binding time, so the
/// names it produces are snapshots and marking them reactive would buy an effect
/// that can never re-run.
fn props_symbol(params: &FormalParameters<'_>) -> Option<SymbolId> {
    if params.items.len() != 1 || params.rest.is_some() {
        return None;
    }
    let BindingPattern::BindingIdentifier(identifier) = &params.items[0].pattern else {
        return None;
    };
    identifier.symbol_id.get()
}

fn function_returns_jsx(function: &Function<'_>) -> bool {
    function.body.as_ref().is_some_and(|body| statements_return_jsx(&body.statements))
}

fn arrow_returns_jsx(arrow: &ArrowFunctionExpression<'_>) -> bool {
    match &arrow.body {
        oxc::ast::ast::ArrowFunctionBody::FunctionBody(body) => {
            statements_return_jsx(&body.statements)
        }
        body => body.as_expression().is_some_and(yields_jsx),
    }
}

/// Descends through the statements that can HOLD a return, and stops at a nested
/// function — a component that returns a row callback is not the row callback.
fn statements_return_jsx(statements: &[Statement<'_>]) -> bool {
    statements.iter().any(statement_returns_jsx)
}

fn statement_returns_jsx(statement: &Statement<'_>) -> bool {
    match statement {
        Statement::ReturnStatement(it) => it.argument.as_ref().is_some_and(yields_jsx),
        Statement::BlockStatement(it) => statements_return_jsx(&it.body),
        Statement::IfStatement(it) => {
            statement_returns_jsx(&it.consequent)
                || it.alternate.as_ref().is_some_and(statement_returns_jsx)
        }
        Statement::SwitchStatement(it) => {
            it.cases.iter().any(|case| statements_return_jsx(&case.consequent))
        }
        Statement::TryStatement(it) => {
            statements_return_jsx(&it.block.body)
                || it.handler.as_ref().is_some_and(|c| statements_return_jsx(&c.body.body))
                || it.finalizer.as_ref().is_some_and(|b| statements_return_jsx(&b.body))
        }
        Statement::ForStatement(it) => statement_returns_jsx(&it.body),
        Statement::ForInStatement(it) => statement_returns_jsx(&it.body),
        Statement::ForOfStatement(it) => statement_returns_jsx(&it.body),
        Statement::WhileStatement(it) => statement_returns_jsx(&it.body),
        Statement::DoWhileStatement(it) => statement_returns_jsx(&it.body),
        Statement::LabeledStatement(it) => statement_returns_jsx(&it.body),
        _ => false,
    }
}

fn yields_jsx(expression: &Expression<'_>) -> bool {
    match expression {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ParenthesizedExpression(it) => yields_jsx(&it.expression),
        Expression::TSAsExpression(it) => yields_jsx(&it.expression),
        Expression::TSNonNullExpression(it) => yields_jsx(&it.expression),
        Expression::TSSatisfiesExpression(it) => yields_jsx(&it.expression),
        Expression::ConditionalExpression(it) => {
            yields_jsx(&it.consequent) || yields_jsx(&it.alternate)
        }
        Expression::LogicalExpression(it) => yields_jsx(&it.right),
        Expression::SequenceExpression(it) => it.expressions.last().is_some_and(yields_jsx),
        _ => false,
    }
}

impl<'a> Visit<'a> for Binder<'_, 'a> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        self.record(it);
        walk::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: oxc::semantic::ScopeFlags) {
        if let Some(owner) = it.id.as_ref().and_then(|id| id.symbol_id.get())
            && function_returns_jsx(it)
            && let Some(props) = props_symbol(&it.params)
        {
            self.candidates.push((Some(owner), props));
        }
        walk::walk_function(self, it, flags);
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.row_params(it);
        if let Some(closing) = it.closing_element.as_ref()
            && let JSXElementName::IdentifierReference(identifier) = &closing.name
            && let Some(symbol) = identifier
                .reference_id
                .get()
                .and_then(|id| self.scoping.get_reference(id).symbol_id())
        {
            self.env.jsx_closings.push(symbol);
        }
        if let JSXElementName::MemberExpression(member) = &it.opening_element.name
            && let JSXMemberExpressionObject::IdentifierReference(object) = &member.object
            && let Some(symbol) =
                object.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
            && let Some(flow) = self.env.namespace_flow(symbol, member.property.name.as_str())
        {
            self.env.namespace_flows.push(flow);
        }
        walk::walk_jsx_element(self, it);
    }

    /// `core.Portal(props)` written as a call rather than as a tag. Same binding,
    /// same component, and the SSR fallback has to see both spellings.
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let Some(symbol) = symbol_of(self.scoping, &it.object)
            && let Some(flow) = self.env.namespace_flow(symbol, it.property.name.as_str())
        {
            self.env.namespace_flows.push(flow);
        }
        walk::walk_static_member_expression(self, it);
    }
}
