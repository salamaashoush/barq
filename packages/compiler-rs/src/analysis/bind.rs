use oxc::ast::ast::{
    ArrowFunctionExpression, BindingPattern, Expression, ImportDeclarationSpecifier,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    JSXExpression, ModuleExportName, Program, Statement, VariableDeclarator,
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
    };
    binder.imports(program, module_source);
    binder.visit_program(program);
    binder.fixpoint();

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

impl<'a> Visit<'a> for Binder<'_, 'a> {
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        self.record(it);
        walk::walk_variable_declarator(self, it);
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.row_params(it);
        walk::walk_jsx_element(self, it);
    }
}
