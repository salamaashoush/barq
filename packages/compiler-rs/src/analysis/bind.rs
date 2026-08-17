use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ArrowFunctionExpression, BinaryExpression, BindingPattern, ConditionalExpression, Declaration,
    DoWhileStatement, ExportDefaultDeclarationKind, Expression, ForStatement, FormalParameters,
    Function, IfStatement, ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXExpression, LogicalExpression,
    ModuleExportName, Program, Statement, StaticMemberExpression, SwitchStatement,
    TaggedTemplateExpression, TemplateLiteral, UnaryExpression, UnaryOperator, VariableDeclarator,
    WhileStatement,
};
use oxc::ast_visit::Visit;
use oxc::ast_visit::walk;
use oxc::semantic::{Scoping, SymbolId};
use oxc::span::Span;

use crate::diag::Code;
use crate::ir::{
    BIT_OVERFLOW, CellSlot, Const, Diag, Flow, Keyed, MemberMask, Module, Prim, ReactiveEnv,
    SourceKind,
};
use crate::options::ResolvedOptions;

use super::symbol_of;
use crate::scope::is_component_tag;

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
    /// the binding is known to hold a callable. `nullary` is §3.0 rule 1.
    Fn {
        nullary: bool,
    },
    Unknown,
}

struct Decl<'a> {
    symbol: SymbolId,
    /// `None` for a whole-binding pattern; `Some(i)` for `const [a, b] = …`.
    element: Option<usize>,
    init: InitOf<'a>,
    /// `const { x } = props` — the binding holds the CARRIER the prop crossed as,
    /// not a snapshot of its value, because a member read off a props parameter
    /// yields the Cell or the Block itself (C3.1). Re-wrapping such a binding on
    /// the way out is what turned a forward into `() => cell`, one carrier too
    /// many, and destroyed a Block's brand on the way (C3.9).
    member: bool,
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
pub fn classify<'a>(
    allocator: &'a Allocator,
    program: &Program<'a>,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
) {
    let symbols = module.scoping.symbols_len();
    module.env.kind = vec![SourceKind::Opaque; symbols].into();
    module.env.konst = vec![None; symbols].into();
    module.env.bit = vec![BIT_OVERFLOW; symbols].into();

    let mut binder = Binder {
        allocator,
        scoping: &module.scoping,
        env: &mut module.env,
        namespaces: Vec::new(),
        decls: Vec::new(),
        candidates: Vec::new(),
        tags: Vec::new(),
        slotted: Vec::new(),
        root_mounts: Vec::new(),
        exported: Vec::new(),
        rules: options.diagnostics,
        suspects: Vec::new(),
        assumed: Vec::new(),
        destructured: Vec::new(),
        components: Vec::new(),
        declarations: Vec::new(),
        cell_reads: Vec::new(),
        slot_forwards: Vec::new(),
        tagged: 0,
    };
    binder.imports(program, &options.module_source);
    binder.env.namespaces = binder.namespaces.clone();
    binder.exports(program);
    binder.visit_program(program);
    // Before the fixpoint, not after: `const { text } = props` asks what `props`
    // is, and a parameter is never a declarator, so nothing the fixpoint decides
    // can feed back into this.
    binder.props_params();
    binder.fixpoint();
    binder.report();
    binder.publish_components();
    binder.publish_cell_slots();

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
    allocator: &'a Allocator,
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
    /// O5. Every binding imported from the framework whose FIRST argument is a
    /// Block the call itself supplies a root scope to — `render` and `hydrate`.
    root_mounts: Vec<SymbolId>,
    /// Every binding this module writes directly into a COMPONENT tag's slot.
    /// `<For each={rows}>{row}</For>` hands `row` to a callee that invokes it
    /// with a scope, which is the same standing being written as a tag gives.
    slotted: Vec<SymbolId>,
    exported: Vec<SymbolId>,
    /// D1 and D3. Off for a build that will not deliver them, so a production
    /// compile pays nothing for advice nobody reads.
    rules: bool,
    /// D1's candidates. `env.kind` is not final until [`Binder::fixpoint`], so
    /// the walk records `(position, span, symbol)` and the verdict is taken
    /// afterwards — which keeps the rule at zero new traversals.
    suspects: Vec<Suspect<'a>>,
    /// Row parameters whose `Accessor` kind is an ASSUMPTION rather than a
    /// reading: `<For keyed={KEYED}>` and `<For {...opts}>` take the arm that is
    /// safe when wrong, and telling the author to call a row that may be a plain
    /// object would be advice that throws. Codegen is unaffected — the two arms
    /// emit the same bytes for every read that does not call the row.
    assumed: Vec<SymbolId>,
    /// D3. `(owner, pattern span)`; the same tag-or-export evidence
    /// [`Binder::props_params`] needs, applied at the same point.
    destructured: Vec<(Option<SymbolId>, Span)>,
    /// Every function this module DECLARES as a component. `(owner, span, name)`.
    components: Vec<(Option<SymbolId>, Span, &'a str)>,
    /// C2, the other direction. Every named function-valued declaration in the
    /// module, whatever its body returns. A call site emits `Comp(_s$, props)`
    /// for anything written as a tag, so any declaration this module TAGS has to
    /// take the scope even when it never spells JSX — `function Label(props) {
    /// return props.text() }` is an ordinary component and binding `props` to
    /// the scope is a silent miscompilation with both halves in view.
    declarations: Vec<(SymbolId, Span, &'a str)>,
    /// C5.1 item 1, direct: `(props symbol, prop name, the attribute that
    /// consumes it)` for every `props.x` read as an attribute on an intrinsic.
    cell_reads: Vec<(SymbolId, &'a str, Span, &'a str)>,
    /// C5.1 item 1, transitive: `(props symbol, prop name, callee, callee slot)`
    /// for every `<Callee slot={props.x} />`.
    slot_forwards: Vec<(SymbolId, &'a str, SymbolId, &'a str)>,
    /// Inside a tagged template's quasi, where the raw strings are a tag
    /// function's arguments rather than text being built.
    tagged: u32,
}

/// A D1 candidate: an identifier in a syntactic slot where no correct program
/// could put an accessor.
///
/// The rule is that shape and only that shape. `solid/reactivity`'s "this value
/// is somewhere that can never re-run" has ~25 open false-positive reports
/// against `vue/no-ref-as-operand`'s handful, and the difference is the form of
/// the question, not the amount of testing behind it.
#[derive(Clone, Copy)]
struct Suspect<'a> {
    code: Code,
    span: Span,
    symbol: SymbolId,
    /// The member being read, for the member-position arm.
    member: Option<&'a str>,
}

/// Members a barq accessor legitimately has. `Signal<T>` declares
/// `set`/`update`/`peek` (`signals.ts:1136`) and `Computed<T>` declares `peek`
/// (`:1143`); an accessor is a FUNCTION, so `Function.prototype`'s own members
/// are legitimate reads too.
///
/// This list is D1's own and is deliberately the UNION over every primitive
/// rather than `MemberMask`: masking a member a primitive does not have turns a
/// tracked read into `Static` (`Binder::returns`), so `MemberMask` cannot be
/// widened to cover `useMemo(…).peek()` — and an unexempted `.peek()` on a
/// typed public API would be a false positive on correct code.
const ACCESSOR_MEMBERS: &[&str] = &[
    "set",
    "update",
    "peek",
    "apply",
    "arguments",
    "bind",
    "call",
    "caller",
    "constructor",
    "length",
    "name",
    "prototype",
    "toString",
    "valueOf",
];

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
                        if matches!(name.name.as_str(), "render" | "hydrate")
                            && let Some(symbol) = imported.local.symbol_id.get()
                        {
                            self.root_mounts.push(symbol);
                        }
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
                        if function_returns_jsx(function) {
                            if let Some(props) = props_symbol(&function.params) {
                                self.candidates.push((None, props));
                            }
                            if let Some(span) = destructured_props(&function.params) {
                                self.destructured.push((None, span));
                            }
                            let name =
                                function.id.as_ref().map_or("default", |id| id.name.as_str());
                            self.components.push((None, function.span, name));
                        }
                    }
                    ExportDefaultDeclarationKind::ArrowFunctionExpression(arrow) => {
                        if arrow_returns_jsx(arrow) {
                            if let Some(props) = props_symbol(&arrow.params) {
                                self.candidates.push((None, props));
                            }
                            if let Some(span) = destructured_props(&arrow.params) {
                                self.destructured.push((None, span));
                            }
                            self.components.push((None, arrow.span, "default"));
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

    /// D1 and D3, taken after [`Binder::fixpoint`] and [`Binder::props_params`]
    /// because neither `env.kind` nor the tag-or-export evidence is final until
    /// then. Nothing here walks the AST a second time.
    fn report(&mut self) {
        if !self.rules {
            return;
        }
        for index in 0..self.suspects.len() {
            let Suspect { code, span, symbol, member } = self.suspects[index];
            // Keyed on the BINDING, never on `React::Reactive`: `props.count * 2`
            // is correct code — props lower to getters — and a rule keyed on "a
            // reactive read in a binary expression" fires on the commonest
            // correct pattern in the codebase.
            let SourceKind::Accessor { .. } = self.env.kind[symbol] else { continue };
            // An assumed accessor is not evidence. `<For keyed={KEYED}>` takes
            // the accessor arm because it is the safe one, not because the row
            // is one, and `KEYED === true` makes `row()` a TypeError.
            if self.assumed.contains(&symbol) {
                continue;
            }
            if member.is_some_and(|name| ACCESSOR_MEMBERS.contains(&name)) {
                continue;
            }
            let name = self.scoping.symbol_name(symbol);
            // Built here, for the handful that survived, and not at the
            // recording site: a typical component file offers hundreds of
            // candidates and almost none of them are accessors.
            let fix = match member {
                None => format!("{name}()"),
                Some(member) => format!("{name}().{member}"),
            };
            let message = match code {
                Code::Barq001 => format!(
                    "`{name}` is an accessor, and this position turns it into a value: a function \
                     stringifies to its own source text and arithmetic on one is NaN. Call it — \
                     `{fix}`."
                ),
                Code::Barq002 => format!(
                    "`{name}` is an accessor, and a function is always truthy, so this condition \
                     can never take its other branch. Call it — `{fix}`."
                ),
                _ => format!(
                    "`{name}` is an accessor, so `.{}` reads a property of the function rather \
                     than of the value it returns. Call it first — `{fix}`.",
                    member.unwrap_or_default()
                ),
            };
            self.diagnose(code, span, &message);
        }

        for index in 0..self.destructured.len() {
            let (owner, span) = self.destructured[index];
            if !self.is_component(owner) {
                continue;
            }
            self.diagnose(
                Code::Barq005,
                span,
                "this component destructures its props in the parameter list, so every prop is \
                 read once when the component is called and the names it binds are snapshots. \
                 barq cannot make them reactive: lowering takes no Program and codegen only \
                 splices at recorded sites. Read them where they are used — `props.text` — or \
                 take them apart with `splitProps(props, [\"text\"])`. A prop whose VALUE is \
                 itself an accessor is unaffected.",
            );
        }
    }

    /// Only the functions this module proved to be components, so neither the
    /// dev-label containment search nor C1's scope pass can land on a `.map`
    /// body. Published on every build: `scope` reads it to decide which
    /// declarations take a scope, and C2 says that answer may not depend on
    /// whether labels were asked for.
    fn publish_components(&mut self) {
        for index in 0..self.components.len() {
            let (owner, span, name) = self.components[index];
            if self.is_component(owner) {
                self.env.components.push((span, name));
            }
        }
        // C2's second half. `is_component` above wants the body to return JSX,
        // which is the evidence that tells a component from a `<For>` row
        // callback when the module only EXPORTS it. A tag site needs no such
        // guess: this module writes the call, the call passes a scope, and the
        // declaration has to accept one. Without this the two halves read
        // different sets and the mismatch is silent.
        for index in 0..self.declarations.len() {
            let (owner, span, name) = self.declarations[index];
            if !self.tags.contains(&owner) {
                continue;
            }
            if self.env.components.iter().any(|(at, _)| *at == span) {
                continue;
            }
            self.env.components.push((span, name));
        }
    }

    /// The same evidence [`Binder::props_params`] takes: the function returns
    /// JSX, and the module either writes it as a tag or lets it out. A
    /// JSX-returning one-parameter arrow is otherwise indistinguishable from a
    /// `<For>` row callback.
    fn is_component(&self, owner: Option<SymbolId>) -> bool {
        match owner {
            None => true,
            Some(owner) => {
                self.tags.contains(&owner)
                    || self.exported.contains(&owner)
                    || self.slotted.contains(&owner)
            }
        }
    }

    fn diagnose(&mut self, code: Code, span: Span, message: &str) {
        let message = self.allocator.alloc_str(message) as &'a str;
        self.env.diagnostics.push(Diag { code, span, message });
    }

    /// D1's recorder. Only the position, the span and the symbol — the verdict
    /// and the message both wait for the fixpoint.
    fn suspect(&mut self, code: Code, expression: &Expression<'a>, member: Option<&'a str>) {
        if !self.rules {
            return;
        }
        let Expression::Identifier(identifier) = expression else { return };
        let Some(symbol) = symbol_of(self.scoping, expression) else { return };
        self.suspects.push(Suspect { code, span: identifier.span, symbol, member });
    }

    /// Aliasing needs the alias target's answer, so the declaration list runs to
    /// a fixpoint. A symbol only ever moves away from `Opaque` once, so this
    /// converges in as many turns as the longest alias chain; the cap is for a
    /// cycle (`let a = b, b = a`).
    fn fixpoint(&mut self) {
        for _ in 0..8 {
            let mut changed = false;
            for index in 0..self.decls.len() {
                let Decl { symbol, element, init, member } = self.decls[index];
                // A reassigned binding joins every write RHS; none of them are
                // followed, so it stays Opaque.
                if self.scoping.symbol_is_mutated(symbol) {
                    continue;
                }
                let (kind, konst) = if member {
                    (self.destructured_member(init), None)
                } else {
                    self.produced(init).at(element)
                };
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

    /// C3.1/C3.9. `const { text } = props` binds the Cell `props.text` yields,
    /// so the binding answers what a props member read answers and forwards by
    /// identity out of the component. Every other object pattern stays Opaque.
    fn destructured_member(&self, init: InitOf<'a>) -> SourceKind {
        let InitOf::Alias(source) = init else { return SourceKind::Opaque };
        match self.env.kind_of(source) {
            SourceKind::PropsParam => SourceKind::Accessor { nonreactive: MemberMask::EMPTY },
            _ => SourceKind::Opaque,
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
            InitOf::Fn { nullary } => Produced::kind(SourceKind::Fn { nullary }),
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
            // `optimistic()` returns a `Signal<T>` — `actions.ts` builds the
            // reader and hangs `.set`, `.update` and `.peek` off it, which is
            // exactly the SIGNAL mask. It sat under `accessor` until M11, so
            // `optimistic.set` was a tracked read where `signal.set` is static,
            // and a handler passed by reference left the DELEGATED set for an
            // `addEventListener` of its own (B4).
            Prim::Signal | Prim::Optimistic => Produced::kind(signal),
            Prim::Computed | Prim::MapArray | Prim::Repeat => Produced::kind(accessor),
            Prim::Store | Prim::OptimisticStore => {
                Produced::tuple(SourceKind::ReactiveObject, SourceKind::Inert)
            }
            Prim::Projection => Produced::kind(SourceKind::ReactiveObject),
            Prim::Resource => Produced::kind(SourceKind::AccessorRecord),
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
            Expression::ArrowFunctionExpression(arrow) => InitOf::Fn {
                // `nullary` is §3.0 rule 1, and rule 1 is about a value that
                // YIELDS when it is called. A zero-arity arrow whose body cannot
                // produce one is a handler; treating it as a Cell makes
                // `props.onClick()` run it. See `classify::yields_a_value`.
                nullary: !arrow.r#async
                    && arrow.params.items.is_empty()
                    && arrow.params.rest.is_none()
                    && crate::passes::classify::yields_a_value(&arrow.body),
            },
            Expression::FunctionExpression(function) => InitOf::Fn {
                nullary: !function.r#async
                    && function.params.items.is_empty()
                    && function.params.rest.is_none(),
            },
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
            match init {
                Expression::ArrowFunctionExpression(arrow) => {
                    self.declarations.push((owner, arrow.span, identifier.name.as_str()));
                }
                Expression::FunctionExpression(function) => {
                    self.declarations.push((owner, function.span, identifier.name.as_str()));
                }
                _ => {}
            }
            let params = match init {
                Expression::ArrowFunctionExpression(arrow) if arrow_returns_jsx(arrow) => {
                    Some((&arrow.params, arrow.span))
                }
                Expression::FunctionExpression(function) if function_returns_jsx(function) => {
                    Some((&function.params, function.span))
                }
                _ => None,
            };
            if let Some((params, span)) = params {
                if let Some(props) = props_symbol(params) {
                    self.candidates.push((Some(owner), props));
                }
                if let Some(pattern) = destructured_props(params) {
                    self.destructured.push((Some(owner), pattern));
                }
                self.components.push((Some(owner), span, identifier.name.as_str()));
            }
        }
        let init = self.init_of(init);
        match &declarator.id {
            BindingPattern::BindingIdentifier(identifier) => {
                if let Some(symbol) = identifier.symbol_id.get() {
                    self.decls.push(Decl { symbol, element: None, init, member: false });
                }
            }
            BindingPattern::ArrayPattern(pattern) => {
                for (index, element) in pattern.elements.iter().enumerate() {
                    let Some(element) = element else { continue };
                    let BindingPattern::BindingIdentifier(identifier) = element else {
                        continue;
                    };
                    if let Some(symbol) = identifier.symbol_id.get() {
                        self.decls.push(Decl { symbol, element: Some(index), init, member: false });
                    }
                }
            }
            // An object pattern off a store proxy would need per-property
            // attribution the analysis cannot prove; every name stays Opaque.
            // Off a PROPS PARAMETER it is exact: each name binds the carrier its
            // prop crossed as, and `member` is what carries that to `fixpoint`.
            // A defaulted or nested property is an `AssignmentPattern` or an
            // `ObjectPattern`, neither of which matches here, so both stay
            // Opaque and keep the wrapping they had.
            BindingPattern::ObjectPattern(pattern) => {
                for property in &pattern.properties {
                    if property.computed {
                        continue;
                    }
                    let BindingPattern::BindingIdentifier(identifier) = &property.value else {
                        continue;
                    };
                    if let Some(symbol) = identifier.symbol_id.get() {
                        self.decls.push(Decl { symbol, element: None, init, member: true });
                    }
                }
            }
            _ => {}
        }
    }

    /// A binding written by NAME into a component tag's slot. It is forwarded
    /// by identity (C5) into a position the callee invokes with a scope, so it
    /// is a component declaration wherever it was written — the same standing
    /// [`Binder::is_component`] gives a binding written as a tag.
    fn slot_references(&mut self, element: &JSXElement<'a>) {
        if !is_component_tag(&element.opening_element.name) {
            return;
        }
        let mut record = |expression: &JSXExpression<'a>| {
            if let JSXExpression::Identifier(identifier) = expression
                && let Some(symbol) = identifier
                    .reference_id
                    .get()
                    .and_then(|id| self.scoping.get_reference(id).symbol_id())
            {
                self.slotted.push(symbol);
            }
        };
        for item in &element.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attribute) = item
                && let Some(JSXAttributeValue::ExpressionContainer(container)) = &attribute.value
            {
                record(&container.expression);
            }
        }
        for child in &element.children {
            if let JSXChild::ExpressionContainer(container) = child {
                record(&container.expression);
            }
        }
    }

    /// C5.1 item 1's evidence, collected where the JSX is still visible.
    ///
    /// A prop is a CELL slot when the callee reads it in a position the emission
    /// makes a Cell. Two positions in JSX are one: an attribute on an INTRINSIC
    /// element, which lowers to `_$setProp`/`_$spread`, and a named Cell slot of
    /// a FLOW construct — `For`'s `each`, `Show`'s `when`, `Portal`'s `target`,
    /// the rest of [`Flow::cell_slot`] — which lowers to a Cell argument of the
    /// primitive the construct compiles to. A child position takes either kind
    /// (C3.7), and an attribute on any OTHER component is a forward whose
    /// verdict is the callee's.
    ///
    /// Keyed on the PROPS SYMBOL rather than on the enclosing component, so no
    /// visitor stack is needed: `candidates` already carries props → component,
    /// and a props parameter belongs to exactly one function.
    ///
    /// **Only NAMED attributes contribute a pair.** A `SpreadAttribute` names no
    /// key, so a spreading wrapper and a spread at the forwarding site both end
    /// the fixpoint's chain and compile clean. That is C5.1 item 1's declared
    /// bound rather than a hole in the guarantee — item 2, the runtime refusal,
    /// is total and does fire in both cases — and the rule's own text says so.
    fn cell_slot_evidence(&mut self, element: &JSXElement<'a>) {
        let component = is_component_tag(&element.opening_element.name);
        let callee = match &element.opening_element.name {
            JSXElementName::IdentifierReference(name) => {
                name.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
            }
            _ => None,
        };
        if component && callee.is_none() {
            return;
        }
        for item in &element.opening_element.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else { continue };
            let JSXAttributeName::Identifier(slot) = &attribute.name else { continue };
            let Some(JSXAttributeValue::ExpressionContainer(container)) = &attribute.value else {
                continue;
            };
            let Some(expression) = container.expression.as_expression() else { continue };
            let Some((props, prop)) = self.props_member(expression) else { continue };
            let flow_slot = callee
                .filter(|_| component)
                .and_then(|callee| self.env.kind_of(callee).flow())
                .and_then(|flow| flow.cell_slot(slot.name.as_str()));
            match (callee.filter(|_| component), flow_slot) {
                (Some(_), Some(channel)) => {
                    self.cell_reads.push((props, prop, attribute.span, channel))
                }
                (Some(callee), None) => {
                    self.slot_forwards.push((props, prop, callee, slot.name.as_str()))
                }
                (None, _) => {
                    self.cell_reads.push((props, prop, attribute.span, slot.name.as_str()))
                }
            }
        }
    }

    /// `props.name`, through the wrappers that are not values. Answers the props
    /// symbol and the member name.
    fn props_member(&self, expression: &Expression<'a>) -> Option<(SymbolId, &'a str)> {
        match expression {
            Expression::ParenthesizedExpression(inner) => self.props_member(&inner.expression),
            Expression::TSAsExpression(inner) => self.props_member(&inner.expression),
            Expression::TSNonNullExpression(inner) => self.props_member(&inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.props_member(&inner.expression),
            Expression::StaticMemberExpression(member) => {
                let symbol = symbol_of(self.scoping, &member.object)?;
                Some((symbol, self.allocator.alloc_str(member.property.name.as_str())))
            }
            _ => None,
        }
    }

    /// The fixpoint over [`Binder::cell_reads`] and [`Binder::slot_forwards`],
    /// published as `env.cell_slots`. A forward inherits its callee's verdict,
    /// so `Mid` forwarding `props.thing` into `Sink`'s attribute slot makes
    /// `Mid.thing` a Cell slot too — the one-hop case C5.1 item 1 names, at any
    /// depth, within the module.
    fn publish_cell_slots(&mut self) {
        let owner_of = |props: SymbolId| -> Option<SymbolId> {
            self.candidates.iter().find(|(_, p)| *p == props).and_then(|(owner, _)| *owner)
        };
        for (props, prop, read, channel) in &self.cell_reads {
            let Some(component) = owner_of(*props) else { continue };
            self.env.cell_slots.push(CellSlot { component, prop, read: *read, channel });
        }
        loop {
            let mut grew = false;
            for (props, prop, callee, slot) in &self.slot_forwards {
                let Some(component) = owner_of(*props) else { continue };
                let Some((read, channel)) = self
                    .env
                    .cell_slots
                    .iter()
                    .find(|entry| entry.component == *callee && entry.prop == *slot)
                    .map(|entry| (entry.read, entry.channel))
                else {
                    continue;
                };
                if self
                    .env
                    .cell_slots
                    .iter()
                    .any(|entry| entry.component == component && entry.prop == *prop)
                {
                    continue;
                }
                self.env.cell_slots.push(CellSlot { component, prop, read, channel });
                grew = true;
            }
            if !grew {
                break;
            }
        }
    }

    /// Control-flow row parameters, by arity and position from the real
    /// signatures (`components.ts`). The by-item `For` row VALUE is a plain
    /// value, not an accessor — the classic name-heuristic bug (V8) — and a
    /// key FUNCTION is a third arm, not the by-item one.
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

        // `For keyed={false}` is the positional mode — the item arrives as an
        // accessor and the index as a plain number; `For keyed={fn}` boxes the
        // row in a signal, so BOTH its parameters are accessors (`map.ts:57`).
        // A LATER attribute wins, exactly as it does at runtime — including a
        // spread, which can carry `keyed` where nothing can read it.
        let mut verdict: Option<(Keyed, bool)> = None;
        for item in &element.opening_element.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(_) => verdict = Some((Keyed::ByFn, false)),
                JSXAttributeItem::Attribute(attribute) => {
                    let JSXAttributeName::Identifier(name) = &attribute.name else { continue };
                    if name.name.as_str() == "keyed" {
                        verdict = Some(Keyed::verdict_of_attribute_value(attribute.value.as_ref()));
                    }
                }
            }
        }
        // The DEFAULT differs by construct, and that asymmetry is Solid 2.0's
        // and deliberate. A list row is identified BY ITS DATA, so `For` keys on
        // the item and an immutable update rebuilds the row rather than leaving
        // stateful DOM under the wrong value (K1). A `Show`'s `when` is usually
        // a CONDITION, not an identity, so it keys on truthiness and hands over
        // a narrowed accessor — the content survives a value change instead of
        // being torn down with whatever the user had typed into it.
        let (keyed, proved) = verdict.unwrap_or(match flow {
            Flow::Show | Flow::Match => (Keyed::ByIndex, true),
            _ => (Keyed::ByItem, true),
        });

        let accessor = SourceKind::Accessor { nonreactive: MemberMask::EMPTY };
        let params: &[SourceKind] = match (flow, keyed) {
            (Flow::For, Keyed::ByItem) => &[SourceKind::RowValue, accessor],
            (Flow::For, Keyed::ByFn) => &[accessor, accessor],
            (Flow::For, _) => &[accessor, SourceKind::Inert],
            (Flow::Repeat, _) => &[SourceKind::Inert],
            // `Show` and `Match` discriminate on `keyed` exactly as `For` does,
            // and returning early for them left the one parameter they hand
            // over untyped. `keyed={false}` is Solid 2.0's narrowed accessor —
            // the content stays mounted across a value change and only its
            // READS move — so a body written `{v()}` was an opaque call applied
            // once and the text froze at activation. That is the `For` by-item
            // bug (V8) in the construct next to it, and it never had a fixture.
            //
            // The keyed default hands the VALUE, like a by-item row. `ByFn` is
            // where a spread lands, and there the body may receive either — the
            // adapter had the same ambiguity and `show`'s runtime arm keeps it
            // — so it takes the accessor, which is the arm that stays correct
            // when wrong: `insert` subscribes to a function and takes a
            // non-function as the value it is.
            (Flow::Show | Flow::Match, Keyed::ByItem) => &[SourceKind::RowValue],
            (Flow::Show | Flow::Match, _) => &[accessor],
            _ => return,
        };
        // Only `For`, `Show` and `Match` read `keyed`; `Repeat` hands over a
        // plain number, so an unreadable attribute list leaves it proved.
        let proved = proved || !matches!(flow, Flow::For | Flow::Show | Flow::Match);

        // K3 is about a ROW whose identity is its index. A `Show` has no rows,
        // so `keyed={false}` there is not the thing the hint warns about.
        if keyed == Keyed::ByIndex && proved && matches!(flow, Flow::For | Flow::Repeat) {
            self.positional_state_hint(element);
        }

        for child in &element.children {
            let JSXChild::ExpressionContainer(container) = child else { continue };
            let JSXExpression::ArrowFunctionExpression(arrow) = &container.expression else {
                continue;
            };
            self.attribute(arrow, params, proved);
        }
    }

    /// K3, and it is a HINT rather than a safety net.
    ///
    /// The rule it replaces made this diagnostic load-bearing: it was what made
    /// an index-keyed DEFAULT acceptable. It could never carry that, which is
    /// why K1 reversed. It cannot cross a component boundary —
    /// `{x => <TodoRow todo={x}/>}` with an `<input>` inside `TodoRow` is a call
    /// and nothing else here — and a scroll offset, a running animation, an open
    /// `<dialog>` and a third-party widget behind a `ref` are equally invisible
    /// whatever the tag says. Under the identity default nothing rests on it:
    /// `keyed={false}` is written by hand, and this only says what that spelling
    /// means for the markup the compiler happens to be able to see.
    ///
    /// It is raised HERE rather than in the shape pass because this is the last
    /// point at which the row's markup is still markup: P1 has lowered it to a
    /// template root by then, and a scan there finds no tags at all.
    fn positional_state_hint(&mut self, element: &JSXElement<'a>) {
        if !self.rules {
            return;
        }
        let mut scan = StatefulScan { found: None };
        for child in &element.children {
            scan.visit_jsx_child(child);
        }
        let Some((span, tag)) = scan.found else { return };
        self.diagnose(
            Code::Barq011,
            span,
            &format!(
                "`keyed={{false}}` makes a row's identity its POSITION, so `<{tag}>`'s state — a \
                 caret, a selection, playback, an open/closed toggle — belongs to slot N rather \
                 than to the item that happens to be in it, and a reorder leaves it behind \
                 (SEMANTICS K3). Drop `keyed={{false}}` for the identity default, or key on the \
                 item with `keyed={{r => r.id}}`. This sees inline markup only: state inside a \
                 component, behind a `ref`, or on a scrolled element is invisible to it."
            ),
        );
    }

    fn attribute(
        &mut self,
        arrow: &ArrowFunctionExpression<'a>,
        params: &[SourceKind],
        proved: bool,
    ) {
        for (index, param) in arrow.params.items.iter().enumerate() {
            let Some(kind) = params.get(index) else { break };
            let BindingPattern::BindingIdentifier(identifier) = &param.pattern else {
                continue;
            };
            if let Some(symbol) = identifier.symbol_id.get() {
                self.env.kind[symbol] = *kind;
                if !proved {
                    self.assumed.push(symbol);
                }
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

/// D3's trigger, and only this shape. `solid/no-destructure` scopes itself to
/// the parameter list and has ZERO false-positive issues in its tracker; its own
/// docs say why — "catching it in the params covers the most common cases with
/// good DX". A rest parameter or an arity other than one is a different shape
/// and gets no diagnostic.
fn destructured_props(params: &FormalParameters<'_>) -> Option<Span> {
    if params.items.len() != 1 || params.rest.is_some() {
        return None;
    }
    match &params.items[0].pattern {
        BindingPattern::ObjectPattern(pattern) => Some(pattern.span),
        _ => None,
    }
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

/// D1's POSITION ALLOWLIST, taken from `vue/no-ref-as-operand`, which has a
/// handful of known issues where `solid/reactivity` has ~25 — because it reports
/// only where no correct program could put the value. Every narrowing below is a
/// refusal to guess.
///
/// There is deliberately **no JSX arm**. barq's runtime treats a function value
/// as reactive in both children and attribute positions (`dom.ts:954`), so
/// `<div>{count}</div>` and `<div id={count}>` are correct barq code and the
/// fine-grained path; porting eslint-plugin-solid's `badSignal` JSX arm would
/// make D1 fire on the framework's own idiom in the first fixture anyone writes.
///
/// There is also no ASSIGNMENT or UPDATE arm, which `vue/no-ref-as-operand` does
/// have. It could not fire: `Binder::fixpoint` skips any symbol
/// `symbol_is_mutated` reports, so a binding that is written to never reaches
/// `SourceKind::Accessor` and D1 has no evidence to key on. Vue's rule can carry
/// that arm because its origin tracking survives reassignment; ours is a lattice
/// that joins to ⊤ on a write, by design.
impl<'a> Visit<'a> for Binder<'_, 'a> {
    /// O5's Block position. `render((scope) => <App/>, host)` is the only
    /// spelling in which the root reaches the tree, so the literal in that
    /// argument takes a scope exactly as a Block written in a component tag's
    /// slot does.
    fn visit_call_expression(&mut self, it: &oxc::ast::ast::CallExpression<'a>) {
        if symbol_of(self.scoping, &it.callee)
            .is_some_and(|symbol| self.root_mounts.contains(&symbol))
            && let Some(first) = it.arguments.first()
            && let Some(expression) = first.as_expression()
        {
            match expression {
                Expression::ArrowFunctionExpression(arrow) => {
                    self.env.root_blocks.push(arrow.span);
                }
                Expression::FunctionExpression(function) => {
                    self.env.root_blocks.push(function.span);
                }
                _ => {}
            }
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        self.record(it);
        walk::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: oxc::semantic::ScopeFlags) {
        let owner = it.id.as_ref().and_then(|id| id.symbol_id.get());
        if let Some(owner) = owner
            && let Some(name) = it.id.as_ref().map(|id| id.name.as_str())
        {
            self.declarations.push((owner, it.span, name));
        }
        if function_returns_jsx(it) {
            if let Some(props) = props_symbol(&it.params)
                && let Some(owner) = owner
            {
                self.candidates.push((Some(owner), props));
            }
            if let Some(span) = destructured_props(&it.params) {
                self.destructured.push((owner, span));
            }
            if let Some(name) = it.id.as_ref().map(|id| id.name.as_str()) {
                self.components.push((owner, it.span, name));
            }
        }
        walk::walk_function(self, it, flags);
    }

    /// The one arm the parent-kind visitors cannot express: `` `${count}` ``
    /// renders the accessor's own source text into the DOM, and it is one of the
    /// two cases nothing else in the toolchain catches (`tsc --strict` reports
    /// zero errors on it).
    fn visit_template_literal(&mut self, it: &TemplateLiteral<'a>) {
        if self.tagged == 0 {
            for expression in &it.expressions {
                self.suspect(Code::Barq001, expression, None);
            }
        }
        walk::walk_template_literal(self, it);
    }

    /// A tagged template's quasi is an argument list, not text — `sql`SELECT
    /// ${table}`` hands the tag the raw value and the tag decides. Vue's rule
    /// excludes tagged templates for the same reason.
    fn visit_tagged_template_expression(&mut self, it: &TaggedTemplateExpression<'a>) {
        self.tagged += 1;
        walk::walk_tagged_template_expression(self, it);
        self.tagged -= 1;
    }

    /// Arithmetic, concatenation and the relational operators — the positions
    /// BARQ001's own text describes. `vue/no-ref-as-operand` is a bare
    /// `BinaryExpression>Identifier` with no operator narrowing, and taking it
    /// whole fires on `rows.filter((s) => s !== a)`, where comparing accessors
    /// by identity is correct and the printed fix would silently turn identity
    /// into a value comparison.
    fn visit_binary_expression(&mut self, it: &BinaryExpression<'a>) {
        use oxc::syntax::operator::BinaryOperator as Operator;
        if !matches!(
            it.operator,
            // a function is a legitimate operand of both
            Operator::Instanceof
                | Operator::In
                // identity, not coercion: `s !== a`, `saved === count`, `count == null`
                | Operator::Equality
                | Operator::Inequality
                | Operator::StrictEquality
                | Operator::StrictInequality
        ) {
            self.suspect(Code::Barq001, &it.left, None);
            self.suspect(Code::Barq001, &it.right, None);
        }
        walk::walk_binary_expression(self, it);
    }

    fn visit_unary_expression(&mut self, it: &UnaryExpression<'a>) {
        match it.operator {
            // `typeof count === "function"` is how a caller checks whether it was
            // handed an accessor, `void` discards, and `delete` is not a read.
            UnaryOperator::UnaryNegation | UnaryOperator::UnaryPlus | UnaryOperator::BitwiseNot => {
                self.suspect(Code::Barq001, &it.argument, None);
            }
            UnaryOperator::LogicalNot => self.suspect(Code::Barq002, &it.argument, None),
            _ => {}
        }
        walk::walk_unary_expression(self, it);
    }

    fn visit_if_statement(&mut self, it: &IfStatement<'a>) {
        self.suspect(Code::Barq002, &it.test, None);
        walk::walk_if_statement(self, it);
    }

    fn visit_switch_statement(&mut self, it: &SwitchStatement<'a>) {
        self.suspect(Code::Barq002, &it.discriminant, None);
        walk::walk_switch_statement(self, it);
    }

    /// A loop test is the same always-truthy position `if` is, and the failure
    /// is worse: the loop never ends. Vue's rule has no loop arm; this is the
    /// one place D1 is WIDER than its prior art, and only for positions where
    /// the operand is read as a boolean and nothing else.
    fn visit_while_statement(&mut self, it: &WhileStatement<'a>) {
        self.suspect(Code::Barq002, &it.test, None);
        walk::walk_while_statement(self, it);
    }

    fn visit_do_while_statement(&mut self, it: &DoWhileStatement<'a>) {
        self.suspect(Code::Barq002, &it.test, None);
        walk::walk_do_while_statement(self, it);
    }

    fn visit_for_statement(&mut self, it: &ForStatement<'a>) {
        if let Some(test) = &it.test {
            self.suspect(Code::Barq002, test, None);
        }
        walk::walk_for_statement(self, it);
    }

    /// Test position only. `flag() ? count : other` passes the accessor along,
    /// which is the normal way to hand one to a consumer.
    fn visit_conditional_expression(&mut self, it: &ConditionalExpression<'a>) {
        self.suspect(Code::Barq002, &it.test, None);
        walk::walk_conditional_expression(self, it);
    }

    /// Left operand only. `other || count` is a normal way to pass an accessor
    /// along; `count || other` can never reach its right side.
    fn visit_logical_expression(&mut self, it: &LogicalExpression<'a>) {
        self.suspect(Code::Barq002, &it.left, None);
        walk::walk_logical_expression(self, it);
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.row_params(it);
        self.slot_references(it);
        self.cell_slot_evidence(it);
        if let Some(closing) = it.closing_element.as_ref()
            && let JSXElementName::IdentifierReference(identifier) = &closing.name
            && let Some(symbol) = identifier
                .reference_id
                .get()
                .and_then(|id| self.scoping.get_reference(id).symbol_id())
        {
            self.env.jsx_closings.push(symbol);
        }
        walk::walk_jsx_element(self, it);
    }

    /// D1's member arm rides here rather than adding a visitor. Only the STATIC
    /// form: `count[key]` is a computed read whose key the analysis cannot see,
    /// and Vue's rule excludes computed access for the same reason.
    ///
    /// The `core.Portal` collection that used to sit beside it went with
    /// `uninlinable_flow`: the deopt was the only reader of the LIST. The
    /// namespace spelling is still resolved — by `env.namespace_flow`, at the
    /// callee, where the rewrite needs it — and nothing needs the module-wide
    /// tally any more.
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        self.suspect(Code::Barq003, &it.object, Some(it.property.name.as_str()));
        walk::walk_static_member_expression(self, it);
    }
}

/// The intrinsic tags whose state lives in the ELEMENT rather than in any
/// attribute the compiler writes, so a positional reuse leaves it behind and no
/// binding puts it back. A custom element is in the set for the same reason and
/// by the same test the HTML spec uses: a hyphen in the name.
fn stateful_tag(tag: &str) -> bool {
    matches!(
        tag,
        "input" | "textarea" | "select" | "video" | "audio" | "details" | "canvas" | "dialog"
    ) || tag.contains('-')
}

/// The first stateful tag in a row's markup, with its span. Deliberately not a
/// proof: it descends through the raw JSX, which is the only subtree it can see
/// at all — a component call hides everything under it, which is K3's whole
/// limitation stated in code.
struct StatefulScan<'a> {
    found: Option<(Span, &'a str)>,
}

impl<'a> Visit<'a> for StatefulScan<'a> {
    fn visit_jsx_opening_element(&mut self, it: &oxc::ast::ast::JSXOpeningElement<'a>) {
        if self.found.is_none()
            && let JSXElementName::Identifier(name) = &it.name
            && stateful_tag(name.name.as_str())
        {
            self.found = Some((it.span, name.name.as_str()));
        }
        walk::walk_jsx_opening_element(self, it);
    }
}
