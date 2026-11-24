//! `css` / `keyframes` / `globalCss`, compiled away.
//!
//! A tagged template whose tag resolves to `cssSource` is replaced by the class
//! name it produces, and its CSS is collected for the module. Nothing of the
//! call survives: no tag function, no template, no runtime.
//!
//! It runs BEFORE `bind`, which is what makes the second-order win available.
//! `class={cardStyle}` is a string literal by the time the JSX is lowered, so
//! `fold` bakes it into the template markup and the element carries no class
//! channel and no `renderEffect` at all.
//!
//! Resolution is by `SymbolId`, like everything else here: a local function
//! named `css` is not this `css`, and `import { css as style }` still is.

use oxc::allocator::{Allocator, Vec as ArenaVec};
use oxc::ast::ast::{
    Expression, ImportDeclarationSpecifier, LogicalOperator, ModuleExportName, ObjectProperty,
    ObjectPropertyKind, Program, PropertyKey, PropertyKind, Statement, TemplateElement,
    TemplateLiteral, UnaryOperator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_expression, walk_statements, walk_variable_declarator};
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::{GetSpan, Span};
use std::cell::RefCell;

use rustc_hash::{FxHashMap, FxHashSet};

use crate::analysis::without_type_wrappers;
use crate::diag::Code;
use crate::options::{ImportedValue, ResolvedOptions};

/// What one of the three tags compiles to.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Tag {
    Css,
    Keyframes,
    Global,
    Atoms,
    Layer,
    Create,
    FirstThatWorks,
    Props,
    DefineConditions,
    DefineVars,
    GlobalVars,
    CreateTheme,
    Dynamic,
}

impl Tag {
    fn of(name: &str) -> Option<Self> {
        Some(match name {
            "css" => Tag::Css,
            "keyframes" => Tag::Keyframes,
            "globalCss" => Tag::Global,
            "atoms" => Tag::Atoms,
            "layer" => Tag::Layer,
            "create" => Tag::Create,
            "firstThatWorks" => Tag::FirstThatWorks,
            "props" => Tag::Props,
            "defineConditions" => Tag::DefineConditions,
            "defineVars" => Tag::DefineVars,
            "globalVars" => Tag::GlobalVars,
            "createTheme" => Tag::CreateTheme,
            "dynamic" => Tag::Dynamic,
            _ => return None,
        })
    }

    fn kind(self) -> barq_css::Kind {
        match self {
            Tag::Keyframes => barq_css::Kind::Keyframes,
            Tag::Global => barq_css::Kind::Global,
            _ => barq_css::Kind::Scoped,
        }
    }
}

pub struct Extracted {
    /// This module's stylesheet, or empty when it produced none.
    pub css: String,
    pub reports: Vec<Report>,
    /// `[specifier, exported name]` for every imported binding a fold needed
    /// and did not have. Empty when the module folded on its own, which is the
    /// point: an integration pays for resolution only where it buys something.
    pub wanted: Vec<(String, String)>,
    /// `[exported name, kind, member, value]` for every module-level binding
    /// this pass resolved, so a module importing one can be handed it.
    pub exports: Vec<(String, Resolved)>,
    /// `(exported name, specifier, imported name)` for each export whose value
    /// another module declares: a re-export, or a `const` naming an import.
    ///
    /// The value is in `exports` already. This says where its RULES are, so an
    /// integration carrying the stylesheet a fold needs carries that module's
    /// rather than a barrel's, which holds none, or every module a barrel
    /// re-exports, which is all of them.
    pub origins: Vec<Origin>,
    /// The table the pass resolved against. Building it stamped its ids into
    /// the program, so whatever reads those ids next has to read this table.
    pub scoping: Scoping,
}

/// `(exported name, specifier, imported name)`: an export whose value another
/// module declares, and which module that is.
pub type Origin = (String, String, String);

/// A value one module exports and another can fold against.
#[derive(Debug, Clone)]
pub enum Resolved {
    /// A string, or a class this pass generated.
    Text(String),
    /// A number, as its text. Kept apart from `Text` because a length written
    /// as a number takes a unit and the same digits written as a string do
    /// not: `export const GAP = 8` folded as text gave `padding:8` in the
    /// module that imported it, where the runtime writes `8px`.
    Number(String),
    /// A `create` group, a `defineVars` token set or a token object, as
    /// `(member, value, numeric)`, where a nested member is its path.
    Group(Vec<(String, String, bool)>),
    /// A `layer("…")` binding, as the layer it names.
    Layer(String),
}

pub struct Report {
    pub code: Code,
    pub message: String,
    pub span: Span,
}

/// The cheap question first: a module that never names the package cannot
/// import from it, and a symbol table built to discover that is pure cost.
pub fn mentions(source: &str, css_source: &str) -> bool {
    source.contains(css_source)
}

pub fn run<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    options: &ResolvedOptions,
) -> Extracted {
    // Semantic FIRST: `ImportSpecifier::local.symbol_id` is a `Cell` the
    // builder fills, so reading it before the build finds every import
    // unresolved and the pass silently does nothing.
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();
    let tags = imported_tags(program, &options.css_source);
    // A module with no tag of ours writes no CSS — but it can still EXPORT the
    // constant another module folds against, and `tokens.ts` holding
    // `export const BRAND = "var(--brand)"` is exactly that file. So the seed
    // still runs when a caller asked for the exports, and only the rewrite is
    // skipped.
    let through_import = tags.is_empty() && calls_through_import(program, &options.css_source);
    if tags.is_empty() && !options.css_exports && !through_import {
        return Extracted {
            css: String::new(),
            reports: Vec::new(),
            wanted: Vec::new(),
            exports: Vec::new(),
            origins: Vec::new(),
            scoping,
        };
    }
    let rewrite = !tags.is_empty() || through_import;

    let mut pass = Css {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping: &scoping,
        tags,
        imports: imported_bindings(program, &options.css_source),
        resolved: options.css_imports.clone(),
        wanted: RefCell::new(Vec::new()),
        exported: FxHashMap::default(),
        reexports: Vec::new(),
        stars: Vec::new(),
        asked_for_exports: options.css_exports,
        numeric_members: FxHashSet::default(),
        aliases: Vec::new(),
        written: written_objects(program, &scoping),
        folded: FxHashMap::default(),
        numeric: FxHashSet::default(),
        groups: FxHashMap::default(),
        layers: FxHashMap::default(),
        unread_layers: FxHashSet::default(),
        debug: options.dev,
        css: String::new(),
        emitted: FxHashSet::default(),
        atoms: barq_css::atoms::Emitted::default(),
        site: Span::default(),
        reports: Vec::new(),
        name: None,
        dynamics: FxHashSet::default(),
        merges: false,
    };
    pass.seed_module_constants(program);
    if rewrite {
        pass.visit_program(program);
        if pass.merges {
            import_merge_styles(allocator, program, &options.css_source);
        }
    }
    // Again after the walk: an alias of a group the walk produced, such as an
    // object of `ui(…)` calls, only has a value now.
    pass.resolve_aliases();
    let (exports, origins) = pass.resolved_exports();
    Extracted {
        css: gather_layers(&pass.css),
        reports: pass.reports,
        wanted: pass.wanted.into_inner(),
        exports,
        origins,
        scoping,
    }
}

struct Css<'a, 'b> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    scoping: &'b Scoping,
    tags: FxHashMap<SymbolId, Tag>,
    /// Module-level `const`s whose value is known as text, so an interpolation
    /// naming one folds. Gains every class this pass generates as it goes,
    /// which is what makes `` css`.${button} & { … }` `` compose.
    folded: FxHashMap<SymbolId, String>,
    /// Of those, the ones whose value is a NUMBER.
    ///
    /// `{ padding: 8 }` is `8px` and `{ padding: "8" }` is `8`, because
    /// `cssValue` asks `typeof value === "number"`. Folding a binding to its
    /// text alone loses exactly that, and the compiler would have written `8`
    /// where the runtime writes `8px` — one declaration reaching the page as
    /// two classes, which is the failure the parity test exists to catch.
    numeric: FxHashSet<SymbolId>,
    /// `create` results, so `styles.root` in a later `atoms` folds to the class
    /// string that group produced. Filled as the walk goes, like `folded`.
    groups: FxHashMap<SymbolId, FxHashMap<String, String>>,
    /// `const ui = layer("barq.ui")`, so a call through the binding folds into
    /// that layer. The literal is read HERE, in the module that names it, which
    /// is what keeps the pass per-file.
    layers: FxHashMap<SymbolId, String>,
    /// `const ui = layer(name)` with a name this pass cannot read. Every call
    /// through such a binding goes to the runtime whole, objects and all, so
    /// the call says so.
    unread_layers: FxHashSet<SymbolId>,
    /// What each import binding names, so a value this module cannot see can be
    /// ASKED for by name. `[[specifier, exported name]]`, and the integration
    /// resolves them.
    ///
    /// The pass stays a pure function of its inputs: it reads no file, it only
    /// says which one it would have to. That is the difference between this and
    /// StyleX's global rule store — a name resolves to the same value in dev
    /// and in a build, where an aggregate over every module does not.
    imports: FxHashMap<SymbolId, (String, String)>,
    /// What an integration resolved those to, if it resolved any.
    resolved: Vec<(String, String, ImportedValue)>,
    /// Of those, the ones a lookup actually missed. Interior mutability because
    /// the reading half of the pass is `&self` all the way down, and a miss is
    /// a fact about the read rather than a change to the fold.
    wanted: RefCell<Vec<(String, String)>>,
    /// The name each module-level binding is exported under, so what this pass
    /// resolved can be handed to the modules that import it.
    exported: FxHashMap<SymbolId, String>,
    /// `export { a as b } from "./x"` as `(b, "./x", a)`, and `export * as ns
    /// from "./x"` as `(ns, "./x", "*")`. Nothing is bound here, so the value
    /// is whatever an integration resolved the other module's export to.
    reexports: Vec<(String, String, String)>,
    /// `export * from "./x"`, by specifier.
    stars: Vec<String>,
    /// Whether an integration asked what this module exports, in which case a
    /// value it only re-exports is asked for rather than waited on: no read in
    /// this module would ever miss on it.
    asked_for_exports: bool,
    /// Group members whose value is a NUMBER, by the binding and the member
    /// path, for the reason `numeric` exists.
    numeric_members: FxHashSet<(SymbolId, String)>,
    /// `const b = a`, where `a` is a group, a token object or a layer binding,
    /// so `b` is one too.
    aliases: Vec<(SymbolId, SymbolId)>,
    /// Objects this module writes into after declaring them (`theme.x = …`,
    /// `delete theme.x`, `Object.assign(theme, …)`), whose literal is not what
    /// a later read sees, so they are never read as one.
    written: FxHashSet<SymbolId>,
    debug: bool,
    css: String,
    /// One rule per class, however many times the module writes the block.
    emitted: FxHashSet<String>,
    /// The same for atoms, with each class's rule kept: a second rule under a
    /// class this holds is two declarations that hash alike.
    atoms: barq_css::atoms::Emitted,
    /// The call being folded, which is where such a pair is reported.
    site: Span,
    reports: Vec<Report>,
    /// The binding the template is being assigned to, for a readable dev class.
    name: Option<String>,
    /// `const`s holding a `dynamic` group this pass compiled, whose calls are
    /// known to return a class string and its variables.
    dynamics: FxHashSet<SymbolId>,
    /// Whether a `props` call was pointed at `mergeStyles`, which the module
    /// then has to import.
    merges: bool,
}

impl<'a> VisitMut<'a> for Css<'a, '_> {
    /// `globalCss` yields nothing, so its statement goes rather than becoming a
    /// dead expression. Handled here because this is the only place the
    /// statement list is addressable.
    fn visit_statements(&mut self, statements: &mut ArenaVec<'a, Statement<'a>>) {
        let mut compiled: FxHashSet<Span> = FxHashSet::default();
        for statement in statements.iter() {
            let Statement::ExpressionStatement(expression) = statement else { continue };
            let Expression::TaggedTemplateExpression(tagged) = &expression.expression else {
                continue;
            };
            if self.tag_of(&tagged.tag) != Some(Tag::Global) {
                continue;
            }
            if self.compile(Tag::Global, &tagged.quasi, tagged.span).is_some() {
                compiled.insert(expression.span);
            }
        }
        if !compiled.is_empty() {
            statements.retain(|statement| match statement {
                Statement::ExpressionStatement(expression) => !compiled.contains(&expression.span),
                _ => true,
            });
        }
        walk_statements(self, statements);
    }

    fn visit_variable_declarator(
        &mut self,
        declarator: &mut oxc::ast::ast::VariableDeclarator<'a>,
    ) {
        let outer = self.name.replace(
            declarator
                .id
                .get_binding_identifier()
                .map(|id| id.name.to_string())
                .unwrap_or_default(),
        );
        let dynamic = matches!(declarator.init.as_ref().map(without_type_wrappers),
                Some(Expression::CallExpression(call)) if self.is_dynamic_callee(&call.callee));
        walk_variable_declarator(self, declarator);
        self.name = outer;
        // Compiled, the call is the arrow it was handed; declined, it is still
        // a call, and what that returns is the runtime's business.
        if dynamic
            && matches!(declarator.init, Some(Expression::ArrowFunctionExpression(_)))
            && let Some(symbol) =
                declarator.id.get_binding_identifier().and_then(|id| id.symbol_id.get())
            && self.scoping.symbol_flags(symbol).is_const_variable()
        {
            self.dynamics.insert(symbol);
        }

        // Recorded after the walk, so what lands in the table is the class the
        // rewrite produced rather than the call that produced it.
        let Some(symbol) = declarator.id.get_binding_identifier().and_then(|id| id.symbol_id.get())
        else {
            return;
        };
        match declarator.init.as_ref() {
            Some(Expression::StringLiteral(literal)) => {
                if let Some(text) = literal.value.as_str() {
                    self.folded.insert(symbol, text.to_string());
                }
            }
            // `` const W = `2px` ``. `text_of` already reads such a template
            // where it stands, and a `const` holding one is the same value by
            // another spelling — a formatter is what turns one into the other.
            Some(Expression::TemplateLiteral(template)) if template.expressions.is_empty() => {
                if let Some(text) = template.quasis.first().and_then(quasi_text) {
                    self.folded.insert(symbol, text.to_string());
                }
            }
            Some(Expression::ObjectExpression(object))
                if !self.written.contains(&symbol) && !self.scoping.symbol_is_mutated(symbol) =>
            {
                let mut group = FxHashMap::default();
                for property in &object.properties {
                    let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
                    let (PropertyKey::StaticIdentifier(name), Expression::StringLiteral(value)) =
                        (&property.key, &property.value)
                    else {
                        continue;
                    };
                    if let Some(value) = value.value.as_str() {
                        group.insert(name.name.to_string(), value.to_string());
                    }
                }
                // Added to what the seed read rather than put in its place: a
                // `defineConditions` call is this object by the time the walk
                // is here, and the seed read keys this arm does not.
                self.groups.entry(symbol).or_default().extend(group);
            }
            // `const ui = layer("barq.ui")`. The call is left standing: a
            // sibling call this pass declines still has to reach the runtime,
            // and an unused binding is what a bundler drops.
            Some(Expression::CallExpression(call))
                if self.tag_of(&call.callee) == Some(Tag::Layer) =>
            {
                self.bind_layer(symbol, call);
            }
            _ => {}
        }
    }

    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        walk_expression(self, expression);

        if let Expression::CallExpression(call) = expression {
            let span = call.span;
            self.site = span;
            match self.tag_of(&call.callee) {
                // `defineConditions({ … })` is the object it was handed, so a
                // call the pass can read leaves nothing for the runtime to run.
                Some(Tag::DefineConditions) => {
                    if self.conditions_of(call).is_some()
                        && let Some(argument) = call.arguments.pop()
                    {
                        *expression = argument.into_expression();
                    }
                    return;
                }
                // Left standing for any call through it this pass declines, and
                // marked pure so that a bundler drops it, and the runtime behind
                // it, once every such call has folded.
                Some(Tag::Layer) => {
                    call.pure = true;
                    return;
                }
                Some(Tag::Atoms) => {
                    if let Some(replacement) = self.compile_atoms(call, span, "") {
                        *expression = replacement;
                    }
                    return;
                }
                Some(Tag::Create) => {
                    match self.compile_create(call, span, "") {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(span, GROUP_UNREADABLE),
                    }
                    return;
                }
                Some(Tag::GlobalVars) => {
                    match self.compile_define_vars(call, span, true, true) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            (
                                "A token value in this `globalVars` call is not a literal or a \
                                 `const` from this file.",
                                "Write the value out, or name a `const` declared in this module.",
                            ),
                        ),
                    }
                    return;
                }
                Some(Tag::Props) => {
                    match self.compile_atoms(call, span, "") {
                        // `{ class: … }`. The `style` half only exists when a
                        // dynamic group is in the call.
                        Some(classes) => *expression = self.object(span, vec![("class", classes)]),
                        None => {
                            self.merge_styles(call, span);
                        }
                    }
                    return;
                }
                Some(Tag::CreateTheme) => {
                    match self.compile_create_theme(call, span) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            (
                                "This `createTheme` call overrides a token set the compiler \
                                 cannot read in this file.",
                                "Declare the theme in the module that declares its tokens with \
                                 `defineVars`, and write the overrides as literals.",
                            ),
                        ),
                    }
                    return;
                }
                Some(Tag::DefineVars) => {
                    match self.compile_define_vars(call, span, true, false) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            (
                                "A token value in this `defineVars` call is not a literal or a \
                                 `const` from this file.",
                                "Write the value out, or name a `const` declared in this module.",
                            ),
                        ),
                    }
                    return;
                }
                Some(Tag::Dynamic) => {
                    match self.compile_dynamic(call, span, "") {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(span, DYNAMIC_UNREADABLE),
                    }
                    return;
                }
                _ => {}
            }

            // A call through a binding `layer` produced, which folds as `atoms`
            // does with every rule in that layer: the layer was read as a
            // literal in this module, so it is still one here.
            if let Some(layer) = self.layer_of(&call.callee) {
                if let Some(replacement) = self.compile_atoms(call, span, &layer) {
                    *expression = replacement;
                }
                return;
            }
            // `ui.create({…})`, `ui.props(…)`, `ui.dynamic(…)`: `create`, `props`
            // and `dynamic` with the layer already bound, which is what
            // `layer()` returns. Each folds and declines as the unlayered
            // helper does; the binding was read in this module, so the layer is
            // still a literal here.
            if let Some((layer, member)) = self.bound_layer(&call.callee) {
                let folded = match member.as_str() {
                    "create" => {
                        let folded = self.compile_create(call, span, &layer);
                        if folded.is_none() {
                            self.decline(span, GROUP_UNREADABLE);
                        }
                        folded
                    }
                    "props" => {
                        let folded = self
                            .compile_atoms(call, span, &layer)
                            .map(|classes| self.object(span, vec![("class", classes)]));
                        if folded.is_none() {
                            self.merge_styles(call, span);
                        }
                        folded
                    }
                    "dynamic" => {
                        let folded = self.compile_dynamic(call, span, &layer);
                        if folded.is_none() {
                            self.decline(span, DYNAMIC_UNREADABLE);
                        }
                        folded
                    }
                    _ => None,
                };
                if let Some(replacement) = folded {
                    *expression = replacement;
                }
                return;
            }
            if self.through_unread_layer(&call.callee) {
                self.declined_layer(call, span);
                return;
            }
        }

        let Expression::TaggedTemplateExpression(tagged) = expression else { return };
        let Some(tag) = self.tag_of(&tagged.tag) else { return };
        // A `globalCss` reached here is one written somewhere other than
        // statement position, where deleting the statement is not available.
        // It stays on the runtime rather than being rewritten to a value it
        // never had.
        let span = tagged.span;
        if tag == Tag::Global {
            self.decline(
                span,
                (
                    "This `globalCss` block is used inside an expression, and it returns \
                     nothing, so the compiler cannot remove it.",
                    "Write it as a statement of its own.",
                ),
            );
            return;
        }
        let Some(name) = self.compile(tag, &tagged.quasi, span) else { return };
        let name = self.allocator.alloc_str(&name);
        *expression = Expression::new_string_literal(span, name, None, &self.ast);
    }
}

/// What a dynamic group says when its body will not read.
const DYNAMIC_UNREADABLE: (&str, &str) = (
    "The function passed to `dynamic` does not return an object literal with one value per \
     property. A value per condition, a `firstThatWorks` list, a condition key, a spread or a \
     computed key cannot be one custom property.",
    "Write it as `(color) => ({ backgroundColor: color })`, and put conditions and fallbacks \
     in a `create` group passed beside it.",
);

/// What a style object says when a value in it is bound inside a function.
const LOCAL_VALUE: (&str, &str) = (
    "This style object has a value bound inside a function, such as a parameter or a local \
     variable, and the compiler reads only literals and `const`s declared at the top of the \
     module.",
    "For a value that changes, declare a `dynamic` group, `const tint = dynamic((color) => \
     ({ color }))`, and spread `props(tint(value))`: its class is compiled, and the value is \
     set as a custom property.",
);

/// What a group says when one of its style objects will not read.
const GROUP_UNREADABLE: (&str, &str) = (
    "A style in this `create` call has a value, a key or a nested object the \
     compiler cannot read in this file, such as an imported value or a function call.",
    "Write literals, or name a `const` declared in this module.",
);

/// `(property, condition path, value)`, where `None` REMOVES what an earlier
/// argument applied — StyleX's rule for `null`, and the reason it is one:
/// `props(base, { color: null })` is how a component says "whatever you set,
/// not this".
type Declaration = (String, String, Option<String>);

/// One argument to `atoms`, once its declarations are known.
struct Argument {
    /// Where it sits in the call, for taking a conditional's test back out.
    at: usize,
    /// `cond && { … }`, whose classes apply only when the test holds.
    conditional: bool,
    declarations: Vec<Declaration>,
    /// Classes another `atoms` or `create` already produced, whose rules are
    /// already in the sheet. Only the key each name carries is needed to merge.
    atoms: Vec<barq_css::atoms::Atom>,
}

/// What one argument of the call turned out to be.
enum Slot {
    /// Read by this pass.
    Known(Argument),
    /// Only the runtime can merge it: an imported group, a prop, a call.
    Opaque(usize),
    /// `false`, `null` or `undefined`, which contribute nothing either way.
    Dropped,
}

/// The call, rebuilt: runs of readable arguments folded, the rest left alone.
enum Step {
    Fold {
        arguments: Vec<Argument>,
        /// Whether a `null` in this run can be resolved here, which it can only
        /// be when nothing opaque came before it.
        removals_safe: bool,
    },
    Opaque(usize),
}

impl<'a> Css<'a, '_> {
    /// Every module-level binding whose value is text, before anything reads
    /// one.
    ///
    /// The fold table used to be filled by the same walk that reads it, so
    /// whether a `const` folded depended on where in the FILE it was written:
    ///
    /// ```ts
    /// export function Card() { return <div class={atoms({ color: BRAND })} />; }
    /// const BRAND = "#3b82f6";
    /// ```
    ///
    /// That is ordinary, valid code — the component runs after the module is
    /// evaluated — and it compiled to nothing while the same two lines the
    /// other way round compiled away. A module-level `const` is a fact about
    /// the module, not about the line it is on, so it is read as one.
    ///
    /// Only values that need no emission: a string, a number, a template with
    /// no substitutions, and a binding naming one of those. A `css` block's
    /// class and a `create` group still land in the table as the walk produces
    /// them, because knowing those means emitting them and emitting twice is
    /// two copies of every rule.
    fn seed_module_constants(&mut self, program: &Program<'a>) {
        let mut pending: Vec<(SymbolId, &Expression<'a>)> = Vec::new();
        let mut bindings: Vec<(SymbolId, &Expression<'a>)> = Vec::new();
        let mut objects: Vec<(SymbolId, &oxc::ast::ast::ObjectExpression<'a>)> = Vec::new();
        self.collect_exports(program);
        self.seed_resolved_imports();
        for statement in &program.body {
            let declaration = match statement {
                Statement::VariableDeclaration(declaration) => &**declaration,
                // `export const five = 5` is its own variant here, not a
                // named export carrying a declaration.
                Statement::ExportDeclaration(export) => match &export.declaration {
                    oxc::ast::ast::Declaration::VariableDeclaration(declaration) => &**declaration,
                    _ => continue,
                },
                _ => continue,
            };
            for declarator in &declaration.declarations {
                let (Some(symbol), Some(init)) = (
                    declarator.id.get_binding_identifier().and_then(|id| id.symbol_id.get()),
                    declarator.init.as_ref(),
                ) else {
                    continue;
                };
                if declaration.kind == oxc::ast::ast::VariableDeclarationKind::Const {
                    match without_type_wrappers(init) {
                        Expression::Identifier(_) => {
                            if let Some(target) = crate::analysis::symbol_of(self.scoping, init) {
                                self.aliases.push((symbol, target));
                            }
                        }
                        Expression::ObjectExpression(object) => objects.push((symbol, object)),
                        _ => {}
                    }
                }
                match literal_text(init) {
                    Some((text, numeric)) => {
                        self.folded.insert(symbol, text);
                        if numeric {
                            self.numeric.insert(symbol);
                        }
                        continue;
                    }
                    // `const B = A`, where `A` is one of these. Deferred rather
                    // than resolved here, because `A` may be written below it.
                    None => pending.push((symbol, init)),
                }
                bindings.push((symbol, init));
            }
        }

        // A chain is at most as long as the list, and each round resolves at
        // least one link or there is nothing left to resolve.
        for _ in 0..pending.len() {
            let mut moved = false;
            let mut resolved: Vec<(SymbolId, String, bool)> = Vec::new();
            pending.retain(|(symbol, init)| {
                let Some(text) = self.text_of(init) else { return true };
                let numeric = crate::analysis::symbol_of(self.scoping, init)
                    .is_some_and(|source| self.numeric.contains(&source));
                resolved.push((*symbol, text, numeric));
                moved = true;
                false
            });
            for (symbol, text, numeric) in resolved {
                self.folded.insert(symbol, text);
                if numeric {
                    self.numeric.insert(symbol);
                }
            }
            if !moved {
                break;
            }
        }

        // A group, a token set and a bound layer are values too, and a
        // component written above the `const` that declares one reads it just
        // as legitimately as a component written below. Named here and emitted
        // nowhere: seeding by emitting would put a group's rules ahead of rules
        // from calls written above it, and order is what decides between two
        // atoms of one tier.
        let mut bound: Vec<(SymbolId, &oxc::ast::ast::CallExpression<'a>)> = Vec::new();
        for (symbol, init) in bindings {
            let Expression::CallExpression(call) = without_type_wrappers(init) else { continue };
            match self.tag_of(&call.callee) {
                Some(Tag::Layer) => self.bind_layer(symbol, call),
                Some(Tag::Create) => self.seed_group(symbol, call, ""),
                Some(tag @ (Tag::DefineVars | Tag::GlobalVars)) => {
                    let Some(tokens) = self.token_values(call) else { continue };
                    let (entries, ..) = Self::token_entries(&tokens, tag == Tag::GlobalVars);
                    let mut members = FxHashMap::default();
                    flatten_tokens(entries, "", &mut members);
                    self.groups.insert(symbol, members);
                }
                Some(Tag::DefineConditions) => {
                    if let Some(conditions) = self.conditions_of(call) {
                        self.groups.insert(symbol, conditions.into_iter().collect());
                    }
                }
                _ => bound.push((symbol, call)),
            }
        }

        // `ui.create({ … })`, read once every binding `layer` made is known, so
        // a group declared above the layer it is written into is one too.
        for (symbol, call) in bound {
            let Expression::StaticMemberExpression(member) = without_type_wrappers(&call.callee)
            else {
                continue;
            };
            if member.property.name != "create" {
                continue;
            }
            let Some(layer) = crate::analysis::symbol_of(self.scoping, &member.object)
                .and_then(|object| self.layers.get(&object))
            else {
                continue;
            };
            let layer = layer.clone();
            self.seed_group(symbol, call, &layer);
        }

        // Written through an alias is written.
        for (alias, target) in self.aliases.clone() {
            if self.written.contains(&alias) {
                self.written.insert(target);
            }
        }
        self.seed_objects(&objects);
        self.resolve_aliases();
        self.ask_for_reexports();
    }

    /// A token object, `{ brand: "var(--brand)", space: { md: 8 } }`, with or
    /// without `as const`: a group whose members are its static values, by
    /// path, so `tokens.space.md` folds as `theme.brand` does.
    ///
    /// Only a `const` this module never writes into, and only the members
    /// whose value is a literal or names one, which is what makes reading the
    /// literal the same as reading the object at run time. A member that is
    /// not one is left out rather than guessed at, so a read of it declines
    /// with the diagnostic any unreadable value gets. A spread anywhere leaves
    /// the whole object out, because a later spread replaces an earlier key.
    ///
    /// In rounds, because a member may name another object's member and that
    /// object may be written below this one.
    fn seed_objects(&mut self, objects: &[(SymbolId, &oxc::ast::ast::ObjectExpression<'a>)]) {
        let readable: Vec<_> = objects
            .iter()
            .filter(|(symbol, object)| {
                !self.written.contains(symbol)
                    && !self.scoping.symbol_is_mutated(*symbol)
                    && object
                        .properties
                        .iter()
                        .all(|property| matches!(property, ObjectPropertyKind::ObjectProperty(_)))
            })
            .collect();
        for _ in 0..=readable.len() {
            let mut moved = false;
            for (symbol, object) in &readable {
                let mut members = Vec::new();
                self.static_members(object, "", &mut members);
                let known = self.groups.get(symbol).map_or(0, FxHashMap::len);
                if members.len() <= known {
                    continue;
                }
                moved = true;
                let group = self.groups.entry(*symbol).or_default();
                for (path, value, numeric) in members {
                    if numeric {
                        self.numeric_members.insert((*symbol, path.clone()));
                    }
                    group.insert(path, value);
                }
            }
            if !moved {
                break;
            }
        }
    }

    /// An object literal's static members as `(path, value, numeric)`.
    fn static_members(
        &self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        prefix: &str,
        out: &mut Vec<(String, String, bool)>,
    ) {
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
            if property.kind != PropertyKind::Init || property.method {
                continue;
            }
            let Some(key) = self.key_text(property) else { continue };
            let path = member_join(prefix, &key);
            match without_type_wrappers(&property.value) {
                Expression::ObjectExpression(inner) => self.static_members(inner, &path, out),
                value => {
                    if let Some(text) = self.text_of(value) {
                        let numeric = number_of(value).is_some() || self.is_numeric(value);
                        out.push((path, text, numeric));
                    }
                }
            }
        }
    }

    /// `const b = a` takes on what `a` is, as a group, a token object or a
    /// layer binding. A text constant is already resolved by the seed's own
    /// chain; this is for the values that are not text.
    fn resolve_aliases(&mut self) {
        for _ in 0..=self.aliases.len() {
            let mut moved = false;
            for (alias, target) in self.aliases.clone() {
                if self.written.contains(&alias) {
                    continue;
                }
                if let Some(group) = self.groups.get(&target).cloned()
                    && self.groups.get(&alias) != Some(&group)
                {
                    let numeric: Vec<String> = self
                        .numeric_members
                        .iter()
                        .filter(|(symbol, _)| *symbol == target)
                        .map(|(_, path)| path.clone())
                        .collect();
                    for path in numeric {
                        self.numeric_members.insert((alias, path));
                    }
                    self.groups.insert(alias, group);
                    moved = true;
                }
                if let Some(layer) = self.layers.get(&target).cloned()
                    && !self.layers.contains_key(&alias)
                {
                    self.layers.insert(alias, layer);
                    moved = true;
                }
            }
            if !moved {
                break;
            }
        }
    }

    /// The import a binding is, directly or through `const b = a`.
    fn import_behind(&self, symbol: SymbolId) -> Option<(String, String)> {
        let mut current = symbol;
        for _ in 0..=self.aliases.len() {
            if let Some(entry) = self.imports.get(&current) {
                return Some(entry.clone());
            }
            current = self.aliases.iter().find(|(alias, _)| *alias == current)?.1;
        }
        None
    }

    /// What a module only re-exports, asked for up front when an integration
    /// asked for this module's exports.
    ///
    /// A read misses and says so, but a barrel reads nothing: `export { x }
    /// from` binds no name here, and `import { x }` then `export { x }` never
    /// looks `x` up. Without this the barrel would answer with nothing, and
    /// every module importing through it would decline.
    fn ask_for_reexports(&self) {
        if !self.asked_for_exports {
            return;
        }
        let answered = |specifier: &str, name: &str| {
            self.resolved
                .iter()
                .any(|(from, exported, _)| from == specifier && (name == "*" || exported == name))
        };
        let mut asked: Vec<(String, String)> = Vec::new();
        for (_, specifier, imported) in &self.reexports {
            if !answered(specifier, imported) {
                asked.push((specifier.clone(), imported.clone()));
            }
        }
        for specifier in &self.stars {
            if !answered(specifier, "*") {
                asked.push((specifier.clone(), "*".to_string()));
            }
        }
        for symbol in self.exported.keys() {
            if self.groups.contains_key(symbol)
                || self.layers.contains_key(symbol)
                || self.folded.contains_key(symbol)
            {
                continue;
            }
            if let Some(entry) = self.import_behind(*symbol) {
                asked.push(entry);
            }
        }
        let mut wanted = self.wanted.borrow_mut();
        for entry in asked {
            if !wanted.contains(&entry) {
                wanted.push(entry);
            }
        }
    }

    /// A `create` group's names, known before the walk reaches the call.
    fn seed_group(
        &mut self,
        symbol: SymbolId,
        call: &oxc::ast::ast::CallExpression<'_>,
        layer: &str,
    ) {
        let Some(argument) = call.arguments.first().and_then(|a| a.as_expression()) else {
            return;
        };
        let Expression::ObjectExpression(object) = without_type_wrappers(argument) else {
            return;
        };
        if let Some(groups) = self.group_classes(object, layer, false) {
            self.groups.insert(symbol, groups.into_iter().collect());
        }
    }

    /// `const ui = layer(…)`: the layer it binds, or that this pass cannot
    /// read it.
    fn bind_layer(&mut self, symbol: SymbolId, call: &oxc::ast::ast::CallExpression<'_>) {
        // A binding written again later holds whichever layer was assigned
        // last when a call runs, which is not a fact about this declaration.
        let name =
            if self.scoping.symbol_is_mutated(symbol) { None } else { self.text_argument(call, 0) };
        match name {
            Some(name) => {
                self.layers.insert(symbol, name);
            }
            None => {
                self.unread_layers.insert(symbol);
            }
        }
    }

    /// `defineConditions`' argument as `(name, condition)`, when every entry is
    /// text this pass can read and a condition the runtime would accept.
    ///
    /// A name is then a group member like any other, so `[when.md]` folds by
    /// the path `styles.root` does, and crosses a module boundary the same way.
    fn conditions_of(
        &self,
        call: &oxc::ast::ast::CallExpression<'_>,
    ) -> Option<Vec<(String, String)>> {
        let [argument] = call.arguments.as_slice() else { return None };
        let Expression::ObjectExpression(object) = without_type_wrappers(argument.as_expression()?)
        else {
            return None;
        };
        let mut conditions = Vec::new();
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let condition = self.text_of(&property.value)?;
            if !is_condition(&condition) {
                return None;
            }
            conditions.push((self.key_text(property)?, condition));
        }
        Some(conditions)
    }

    /// What an integration resolved this module's imports to.
    ///
    /// Seeded exactly where a local binding is, so an imported group and a
    /// group declared here fold by the same path and there is no second rule
    /// for a reader to know. Nothing is EMITTED for them: the module that
    /// declares a group emits its rules when it is itself compiled, and this
    /// one only needs the names.
    fn seed_resolved_imports(&mut self) {
        if self.resolved.is_empty() {
            return;
        }
        let bindings: Vec<(SymbolId, (String, String))> =
            self.imports.iter().map(|(symbol, entry)| (*symbol, entry.clone())).collect();
        for (symbol, (specifier, name)) in bindings {
            // `import * as theme`, read as `theme.tokens.brand`: one group
            // holding every export of the module by path.
            if name == "*" {
                if let Some(members) = self.namespace_of(&specifier) {
                    for (path, _, numeric) in &members {
                        if *numeric {
                            self.numeric_members.insert((symbol, path.clone()));
                        }
                    }
                    self.groups.insert(
                        symbol,
                        members.into_iter().map(|(path, value, _)| (path, value)).collect(),
                    );
                }
                continue;
            }
            let Some((.., value)) = self
                .resolved
                .iter()
                .find(|(from, exported, _)| *from == specifier && *exported == name)
            else {
                continue;
            };
            match value {
                ImportedValue::Text(text) => {
                    self.folded.insert(symbol, text.clone());
                }
                ImportedValue::Number(text) => {
                    self.folded.insert(symbol, text.clone());
                    self.numeric.insert(symbol);
                }
                ImportedValue::Group(members) => {
                    for (member, _, numeric) in members {
                        if *numeric {
                            self.numeric_members.insert((symbol, member.clone()));
                        }
                    }
                    self.groups.insert(
                        symbol,
                        members
                            .iter()
                            .map(|(member, value, _)| (member.clone(), value.clone()))
                            .collect(),
                    );
                }
                ImportedValue::Layer(layer) => {
                    self.layers.insert(symbol, layer.clone());
                }
            }
        }
    }

    /// Every export an integration resolved for one specifier, as one group's
    /// `(path, value, numeric)`: a constant by its name, a group's member under
    /// its group's name. A layer binding is a function rather than a value and
    /// is not a member of anything.
    fn namespace_of(&self, specifier: &str) -> Option<Vec<(String, String, bool)>> {
        let mut members = Vec::new();
        for (from, name, value) in &self.resolved {
            if from != specifier {
                continue;
            }
            match value {
                ImportedValue::Text(text) => members.push((name.clone(), text.clone(), false)),
                ImportedValue::Number(text) => members.push((name.clone(), text.clone(), true)),
                ImportedValue::Group(group) => {
                    for (member, value, numeric) in group {
                        members.push((member_join(name, member), value.clone(), *numeric));
                    }
                }
                ImportedValue::Layer(_) => {}
            }
        }
        (!members.is_empty()).then_some(members)
    }

    /// One export of another module, as this module would export it.
    fn reexported(&self, specifier: &str, name: &str) -> Option<Resolved> {
        if name == "*" {
            return self.namespace_of(specifier).map(Resolved::Group);
        }
        let (.., value) = self
            .resolved
            .iter()
            .find(|(from, exported, _)| from == specifier && exported == name)?;
        Some(match value {
            ImportedValue::Text(text) => Resolved::Text(text.clone()),
            ImportedValue::Number(text) => Resolved::Number(text.clone()),
            ImportedValue::Group(members) => Resolved::Group(members.clone()),
            ImportedValue::Layer(layer) => Resolved::Layer(layer.clone()),
        })
    }

    /// The name each module-level binding is exported under.
    ///
    /// Both spellings: `export const x = …` and `export { x as y }`. Only what
    /// is exported, because only what is exported can be imported, and a
    /// module's private constants are nobody else's business.
    fn collect_exports(&mut self, program: &Program<'a>) {
        for statement in &program.body {
            match statement {
                Statement::ExportDeclaration(export) => {
                    let oxc::ast::ast::Declaration::VariableDeclaration(declaration) =
                        &export.declaration
                    else {
                        continue;
                    };
                    for declarator in &declaration.declarations {
                        if let Some(id) = declarator.id.get_binding_identifier()
                            && let Some(symbol) = id.symbol_id.get()
                        {
                            self.exported.insert(symbol, id.name.to_string());
                        }
                    }
                }
                Statement::ExportNamedDeclaration(export) => {
                    for specifier in &export.specifiers {
                        let ModuleExportName::IdentifierReference(local) = &specifier.local else {
                            continue;
                        };
                        let name = match &specifier.exported {
                            ModuleExportName::IdentifierName(name) => name.name.to_string(),
                            ModuleExportName::StringLiteral(literal) => {
                                let Some(name) = literal.value.as_str() else { continue };
                                name.to_string()
                            }
                            ModuleExportName::IdentifierReference(reference) => {
                                reference.name.to_string()
                            }
                        };
                        if let Some(symbol) = local
                            .reference_id
                            .get()
                            .and_then(|id| self.scoping.get_reference(id).symbol_id())
                        {
                            self.exported.insert(symbol, name);
                        }
                    }
                }
                // `export { x as y } from "./x"`, which binds nothing here.
                Statement::ExportFromDeclaration(export) => {
                    if export.export_kind.is_type() {
                        continue;
                    }
                    let Some(specifier) = export.source.value.as_str() else { continue };
                    for entry in &export.specifiers {
                        if entry.export_kind.is_type() {
                            continue;
                        }
                        let (Some(imported), Some(exported)) =
                            (export_name(&entry.local), export_name(&entry.exported))
                        else {
                            continue;
                        };
                        self.reexports.push((exported, specifier.to_string(), imported));
                    }
                }
                // `export * from "./x"`, and `export * as ns from "./x"`, which
                // is one name holding the module.
                Statement::ExportAllDeclaration(export) => {
                    if export.export_kind.is_type() {
                        continue;
                    }
                    let Some(specifier) = export.source.value.as_str() else { continue };
                    match export.exported.as_ref() {
                        Some(name) => {
                            if let Some(name) = export_name(name) {
                                self.reexports.push((name, specifier.to_string(), "*".to_string()));
                            }
                        }
                        None => self.stars.push(specifier.to_string()),
                    }
                }
                _ => {}
            }
        }
    }

    /// What this module exports that another can fold against.
    ///
    /// Read AFTER the walk, so a `create` group and a `css` block's class are
    /// the values the rewrite produced rather than the calls that produced
    /// them.
    ///
    /// A re-export is one of them, with the value the other module was
    /// resolved to, and so is every name an `export *` brings, except
    /// `default` and a name this module exports itself, as ES modules have it.
    /// A name two `export *` lines both bring is ambiguous to a JavaScript
    /// importer too, and is left out.
    ///
    /// Each value another module declares also says which module, in the
    /// second list, so the stylesheet that travels with a fold is the one its
    /// rules are in.
    fn resolved_exports(&self) -> (Vec<(String, Resolved)>, Vec<Origin>) {
        let mut out = Vec::new();
        let mut origins = Vec::new();
        for (symbol, name) in &self.exported {
            let value = if let Some(layer) = self.layers.get(symbol) {
                Resolved::Layer(layer.clone())
            } else if let Some(group) = self.groups.get(symbol) {
                let mut members: Vec<(String, String, bool)> = group
                    .iter()
                    .map(|(key, value)| {
                        let numeric = self.numeric_members.contains(&(*symbol, key.clone()));
                        (key.clone(), value.clone(), numeric)
                    })
                    .collect();
                // Stable, so two builds of one file hand over the same bytes.
                members.sort_by(|a, b| a.0.cmp(&b.0));
                Resolved::Group(members)
            } else if let Some(text) = self.folded.get(symbol) {
                if self.numeric.contains(symbol) {
                    Resolved::Number(text.clone())
                } else {
                    Resolved::Text(text.clone())
                }
            } else {
                continue;
            };
            out.push((name.clone(), value));
            if let Some((specifier, imported)) = self.import_behind(*symbol) {
                origins.push((name.clone(), specifier, imported));
            }
        }
        for (name, specifier, imported) in &self.reexports {
            if out.iter().any(|(taken, _)| taken == name) {
                continue;
            }
            if let Some(value) = self.reexported(specifier, imported) {
                out.push((name.clone(), value));
                origins.push((name.clone(), specifier.clone(), imported.clone()));
            }
        }
        let mut starred: Vec<(String, String)> = Vec::new();
        for specifier in &self.stars {
            for (from, name, _) in &self.resolved {
                if from == specifier
                    && name != "default"
                    && !starred.contains(&(name.clone(), from.clone()))
                {
                    starred.push((name.clone(), from.clone()));
                }
            }
        }
        for (name, specifier) in &starred {
            let ambiguous = starred.iter().any(|(other, from)| other == name && from != specifier);
            if ambiguous || out.iter().any(|(taken, _)| taken == name) {
                continue;
            }
            if let Some(value) = self.reexported(specifier, name) {
                out.push((name.clone(), value));
                origins.push((name.clone(), specifier.clone(), name.clone()));
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        origins.sort();
        (out, origins)
    }

    /// One reason this call is going to the runtime, said out loud.
    ///
    /// The pass declined in seven different shapes and reported in two of them,
    /// so a build had no way to know whether it was paying for `@barqjs/css`'s
    /// object walk or using it. `strictCss` is the switch on top of this; the
    /// note is the thing that had to exist first.
    ///
    /// Deliberately NOT raised for an argument the pass cannot read that is a
    /// class STRING — an imported group, a `class` prop, a call. Those fold
    /// their neighbours, put their rules in the stylesheet, and leave a merge
    /// over strings behind, which reaches none of the machinery this is about.
    /// Reporting them would fire 127 times in `@barqjs/ui` on the documented
    /// idiom.
    fn decline(&mut self, span: Span, (what, how): (&str, &str)) {
        self.reports.push(Report {
            code: Code::Barq017,
            message: format!(
                "{what} The call is left as written, and `@barqjs/css` works out its classes in \
                 the browser each time it runs. {how}"
            ),
            span,
        });
    }

    /// A call through a `layer` binding whose name this pass cannot read.
    ///
    /// Reported when a style object is in the call, because a layer this pass
    /// cannot read takes the WHOLE call to the runtime — objects and all —
    /// where an opaque argument beside a literal layer takes only the merge.
    /// A `dynamic` group always declares one, behind the function it is handed.
    fn declined_layer(&mut self, call: &oxc::ast::ast::CallExpression<'_>, span: Span) {
        let dynamic = matches!(without_type_wrappers(&call.callee),
            Expression::StaticMemberExpression(member) if member.property.name == "dynamic");
        let holds_an_object = dynamic
            || call.arguments.iter().any(|argument| {
                let Some(expression) = argument.as_expression() else { return true };
                match without_type_wrappers(expression) {
                    Expression::ObjectExpression(_) => true,
                    Expression::LogicalExpression(logical) => {
                        matches!(
                            without_type_wrappers(&logical.right),
                            Expression::ObjectExpression(_)
                        )
                    }
                    _ => false,
                }
            });
        if holds_an_object {
            self.decline(
                span,
                (
                    "The layer this call writes into cannot be read in this file: the binding \
                     was given to `layer` as something other than a string literal or a \
                     `const`, or is assigned again, and the layer becomes part of every class \
                     name.",
                    "Bind it once with a literal, `const ui = layer(\"app.ui\")`, or with a \
                     `const` declared in this module.",
                ),
            );
        }
    }

    /// `atoms({ … })` as the class string it produces.
    ///
    /// `None` leaves the call for the runtime, which computes exactly this.
    ///
    /// One argument the pass cannot read no longer makes that all-or-nothing.
    /// The literals around it fold anyway, so their rules reach the stylesheet
    /// instead of being registered from the JS bundle at import time, and what
    /// is left for the runtime is a merge over class strings. That is what lets
    /// a treatment shared across a package be a group in another module.
    fn compile_atoms(
        &mut self,
        call: &mut oxc::ast::ast::CallExpression<'a>,
        span: Span,
        layer: &str,
    ) -> Option<Expression<'a>> {
        self.flatten_arguments(call);
        let mut slots: Vec<Slot> = Vec::new();
        for (at, argument) in call.arguments.iter().enumerate() {
            // A spread is not an argument list this pass can count through.
            let Some(expression) = argument.as_expression() else {
                self.decline(
                    span,
                    (
                        "This call spreads its arguments (`...args`), so the compiler cannot \
                         tell how many there are or what they hold.",
                        "Write the arguments out, or spread an array literal.",
                    ),
                );
                return None;
            };
            match crate::analysis::without_type_wrappers(expression) {
                // `false && …` and friends: the argument contributes nothing and
                // is not a value the compiler has to know.
                Expression::NullLiteral(_) => {
                    slots.push(Slot::Dropped);
                    continue;
                }
                Expression::BooleanLiteral(literal) if !literal.value => {
                    slots.push(Slot::Dropped);
                    continue;
                }
                Expression::Identifier(identifier) if identifier.name == "undefined" => {
                    slots.push(Slot::Dropped);
                    continue;
                }
                _ => {}
            }
            // An object this pass cannot read is the one shape that costs the
            // runtime's object walk, so it is the one that reports. A class
            // string it cannot read is a merge and reports nothing.
            let mut object_declined: Option<&Expression<'a>> = None;
            let read = match expression {
                Expression::ObjectExpression(_) => {
                    let read = self.declarations(expression);
                    if read.is_none() {
                        object_declined = Some(expression);
                    }
                    read.map(|declarations| Argument {
                        at,
                        conditional: false,
                        declarations,
                        atoms: Vec::new(),
                    })
                }
                // `styles.root`, a group `create` already produced; a class
                // string; and a `const` in this module holding one.
                Expression::StaticMemberExpression(_)
                | Expression::StringLiteral(_)
                | Expression::Identifier(_) => self.known(expression).map(|atoms| Argument {
                    at,
                    conditional: false,
                    declarations: Vec::new(),
                    atoms,
                }),
                Expression::LogicalExpression(logical)
                    if logical.operator == LogicalOperator::And =>
                {
                    match &logical.right {
                        Expression::ObjectExpression(_) => {
                            let read = self.declarations(&logical.right);
                            if read.is_none() {
                                object_declined = Some(&logical.right);
                            }
                            read.map(|declarations| Argument {
                                at,
                                conditional: true,
                                declarations,
                                atoms: Vec::new(),
                            })
                        }
                        other => self.known(other).map(|atoms| Argument {
                            at,
                            conditional: true,
                            declarations: Vec::new(),
                            atoms,
                        }),
                    }
                }
                _ => None,
            };
            if let Some(object) = object_declined {
                let reason = if self.holds_local(object) {
                    LOCAL_VALUE
                } else {
                    (
                        "This style object has a value, a key or a nested object the compiler \
                         cannot read in this file, such as an imported value or a function call.",
                        "Write literals or a `const` declared in this module; for a value that \
                         changes, use `var(--name)` and set it through `style`.",
                    )
                };
                self.decline(object.span(), reason);
            }
            slots.push(match read {
                Some(argument) => Slot::Known(argument),
                None => Slot::Opaque(at),
            });
        }

        // One conditional is the idiom (`atoms(base, active() && { … })`) and
        // costs one ternary. Two is four outcomes and three is eight, and a
        // nested ternary over eight class strings is larger than the runtime it
        // replaces — so past one, the runtime keeps the call.
        let conditionals = slots
            .iter()
            .filter(|slot| matches!(slot, Slot::Known(argument) if argument.conditional))
            .count();
        if conditionals > 1 {
            self.reports.push(Report {
                code: Code::Barq016,
                message: format!(
                    "`atoms` has {conditionals} conditional arguments and the compiler handles \
                     one, so this call is left as written and `@barqjs/css` works out its \
                     classes in the browser each time it runs. Merge the conditions into one \
                     object, or apply the second with its own call: \
                     `atoms(atoms(base, a && x), b && y)`."
                ),
                span,
            });
            return None;
        }

        // Readable arguments next to each other fold together. An opaque one
        // breaks the run, because what it applies is what the argument after it
        // replaces.
        let mut steps: Vec<Step> = Vec::new();
        let mut after_opaque = false;
        for slot in slots {
            match slot {
                Slot::Dropped => {}
                Slot::Opaque(at) => {
                    steps.push(Step::Opaque(at));
                    after_opaque = true;
                }
                Slot::Known(argument) => match steps.last_mut() {
                    Some(Step::Fold { arguments, .. }) => arguments.push(argument),
                    _ => steps.push(Step::Fold {
                        arguments: vec![argument],
                        // `{ color: null }` removes what an EARLIER argument
                        // applied, and what an opaque one applied is not
                        // knowable here. Folding the removal on its own would
                        // drop it in silence.
                        removals_safe: !after_opaque,
                    }),
                },
            }
        }
        let unsafe_removal = steps.iter().any(|step| match step {
            Step::Fold { arguments, removals_safe } => {
                !removals_safe
                    && arguments.iter().any(|argument| {
                        argument.declarations.iter().any(|(.., value)| value.is_none())
                    })
            }
            Step::Opaque(_) => false,
        });
        if unsafe_removal {
            self.decline(
                span,
                (
                    "A `null` value removes a property an earlier argument set, and an earlier \
                     argument here is one the compiler cannot read.",
                    "Put the object that holds `null` before that argument, or apply it with a \
                     separate `atoms` call.",
                ),
            );
            return None;
        }

        if let [Step::Fold { arguments, .. }] = steps.as_slice() {
            return Some(self.fold(call, arguments, span, layer));
        }
        if !steps.iter().any(|step| matches!(step, Step::Fold { .. })) {
            return None;
        }

        // Every rule this call produces, emitted in ONE tier-ordered pass. Tier
        // order is the one thing specificity cannot give, and it holds within a
        // call; emitting run by run would let a run's `@media` rule land before
        // a later run's base rule for the same property.
        let mut every: Vec<barq_css::atoms::Atom> = Vec::new();
        let mut merged: Vec<(Vec<barq_css::atoms::Atom>, Option<Vec<barq_css::atoms::Atom>>)> =
            Vec::new();
        for step in &steps {
            let Step::Fold { arguments, .. } = step else { continue };
            let with = Self::merge(arguments, true, layer);
            self.report_whole_shorthand(&with, span);
            self.report_condition_order(&with, span);
            let without = arguments
                .iter()
                .any(|argument| argument.conditional)
                .then(|| Self::merge(arguments, false, layer));
            every.extend(with.iter().cloned());
            if let Some(without) = &without {
                every.extend(without.iter().cloned());
            }
            merged.push((with, without));
        }
        self.emit_rules(&every);

        let old = std::mem::replace(&mut call.arguments, ArenaVec::new_in(&self.allocator));
        let mut originals: Vec<Option<oxc::ast::ast::Argument<'a>>> =
            old.into_iter().map(Some).collect();
        let mut folded = merged.into_iter();

        for step in &steps {
            match step {
                Step::Opaque(at) => {
                    if let Some(argument) = originals.get_mut(*at).and_then(Option::take) {
                        call.arguments.push(argument);
                    }
                }
                Step::Fold { arguments, .. } => {
                    let Some((with, without)) = folded.next() else { continue };
                    let classes = Self::classes(&with);
                    // A run that merged away to nothing is not an argument.
                    if classes.is_empty() && without.is_none() {
                        continue;
                    }
                    let expression = match without {
                        None => Expression::new_string_literal(
                            span,
                            self.allocator.alloc_str(&classes),
                            None,
                            &self.ast,
                        ),
                        Some(without) => {
                            let at = arguments
                                .iter()
                                .find(|argument| argument.conditional)
                                .map(|argument| argument.at);
                            let test = at
                                .and_then(|at| originals.get_mut(at))
                                .and_then(Option::as_mut)
                                .and_then(|argument| self.take_test(argument));
                            let Some(test) = test else { continue };
                            self.ternary(span, test, &classes, &Self::classes(&without))
                        }
                    };
                    call.arguments.push(oxc::ast::ast::Argument::from(expression));
                }
            }
        }
        None
    }

    /// `atoms([base, loud], x)` as `atoms(base, loud, x)`, in the AST.
    ///
    /// `build` does `styles.flat(4)`, so an array argument has always MEANT
    /// the arguments it holds — the README writes `atoms([base, active() &&
    /// loud])` and it is the shape a list of conditional treatments takes. The
    /// pass had no arm for it, so the whole call went to the runtime and every
    /// object in it with it.
    ///
    /// Done as a rewrite before the fold rather than as another case inside it:
    /// the fold indexes arguments by position to take a conditional's test back
    /// out, and a list flattened underneath that would address the wrong one.
    /// Flattening a call this pass then declines is still correct, because it
    /// is the same call — `flat` was going to do it anyway.
    ///
    /// Four levels, which is `flat(4)`. A depth past that is not something the
    /// runtime flattens either.
    fn flatten_arguments(&self, call: &mut oxc::ast::ast::CallExpression<'a>) {
        for _ in 0..4 {
            let nested = call.arguments.iter().any(|argument| match argument {
                oxc::ast::ast::Argument::SpreadElement(spread) => {
                    matches!(
                        without_type_wrappers(&spread.argument),
                        Expression::ArrayExpression(_)
                    )
                }
                other => matches!(
                    other.as_expression().map(without_type_wrappers),
                    Some(Expression::ArrayExpression(_))
                ),
            });
            if !nested {
                return;
            }
            let old = std::mem::replace(&mut call.arguments, ArenaVec::new_in(&self.allocator));
            for argument in old {
                let mut expression = match argument {
                    oxc::ast::ast::Argument::SpreadElement(spread) => spread.unbox().argument,
                    // Every other `Argument` variant IS an expression: the
                    // spread above is the only one that is not.
                    other => other.into_expression(),
                };
                match array_of(&mut expression) {
                    Some(array) => {
                        let elements = std::mem::replace(
                            &mut array.elements,
                            ArenaVec::new_in(&self.allocator),
                        );
                        for element in elements {
                            // A hole contributes nothing, which is what an
                            // `undefined` in the list does at run time.
                            let oxc::ast::ast::ArrayExpressionElement::Elision(_) = element else {
                                call.arguments
                                    .push(oxc::ast::ast::Argument::from(element.into_expression()));
                                continue;
                            };
                        }
                    }
                    None => call.arguments.push(oxc::ast::ast::Argument::from(expression)),
                }
            }
        }
    }

    /// A whole call's worth of readable arguments, as the one value they make.
    fn fold(
        &mut self,
        call: &mut oxc::ast::ast::CallExpression<'a>,
        arguments: &[Argument],
        span: Span,
        layer: &str,
    ) -> Expression<'a> {
        let with = Self::merge(arguments, true, layer);
        self.report_whole_shorthand(&with, span);
        self.report_condition_order(&with, span);
        let Some(conditional) = arguments.iter().find(|argument| argument.conditional) else {
            let all = self.emit_atoms(&with);
            return Expression::new_string_literal(
                span,
                self.allocator.alloc_str(&all),
                None,
                &self.ast,
            );
        };

        // Both branches, because either can run — but only the atoms one of
        // them actually names.
        let without_atoms = Self::merge(arguments, false, layer);
        let all = self.emit_atoms(&with);
        let without = self.emit_atoms(&without_atoms);
        let test = call
            .arguments
            .get_mut(conditional.at)
            .and_then(|argument| self.take_test(argument))
            .unwrap_or_else(|| Expression::new_null_literal(span, &self.ast));
        self.ternary(span, test, &all, &without)
    }

    /// `test ? "…" : "…"`.
    fn ternary(
        &self,
        span: Span,
        test: Expression<'a>,
        consequent: &str,
        alternate: &str,
    ) -> Expression<'a> {
        let consequent = Expression::new_string_literal(
            span,
            self.allocator.alloc_str(consequent),
            None,
            &self.ast,
        );
        let alternate = Expression::new_string_literal(
            span,
            self.allocator.alloc_str(alternate),
            None,
            &self.ast,
        );
        Expression::new_conditional_expression(span, test, consequent, alternate, &self.ast)
    }

    /// The test out of `cond && { … }`, leaving the argument behind.
    ///
    /// Taken only once this pass has committed to folding. Taken up front, an
    /// argument list the pass then declined kept `null && { … }`, which is a
    /// conditional switched permanently off, and BARQ016 declines by design.
    fn take_test(&self, argument: &mut oxc::ast::ast::Argument<'a>) -> Option<Expression<'a>> {
        let Expression::LogicalExpression(logical) = argument.as_expression_mut()? else {
            return None;
        };
        let placeholder = Expression::new_null_literal(logical.left.span(), &self.ast);
        Some(std::mem::replace(&mut logical.left, placeholder))
    }

    /// An object literal from `(key, value)` pairs.
    fn object(&self, span: Span, entries: Vec<(&'a str, Expression<'a>)>) -> Expression<'a> {
        let mut properties = ArenaVec::new_in(&self.allocator);
        for (name, value) in entries {
            // A custom property is not a JS identifier, and an unquoted
            // `--background-color-1j1m7tz:` is a syntax error rather than a key.
            let key = if is_identifier(name) {
                PropertyKey::new_static_identifier(span, name, &self.ast)
            } else {
                PropertyKey::StringLiteral(oxc::ast::ast::StringLiteral::boxed(
                    span, name, None, &self.ast,
                ))
            };
            properties.push(ObjectPropertyKind::ObjectProperty(ObjectProperty::boxed(
                span,
                PropertyKind::Init,
                key,
                value,
                false,
                false,
                false,
                &self.ast,
            )));
        }
        Expression::new_object_expression(span, properties, &self.ast)
    }

    /// `dynamic((c) => ({ backgroundColor: c }))` as the arrow it already is,
    /// with a compiled body.
    ///
    /// The CLASS half is knowable here and the value half is not, which is the
    /// whole shape of a dynamic style: the class reads `var(--…)` and is fixed,
    /// so a colour that changes every frame writes one custom property and
    /// produces no CSS. The property name comes from the declaration's property
    /// alone, so this and `@barqjs/css`'s runtime agree without either knowing
    /// what the other saw.
    ///
    /// The arrow is REUSED rather than rebuilt: its parameters are already
    /// bound to the expressions this moves into `$vars`, and synthesising a new
    /// one would have to rebind them.
    fn compile_dynamic(
        &mut self,
        call: &mut oxc::ast::ast::CallExpression<'a>,
        span: Span,
        layer: &str,
    ) -> Option<Expression<'a>> {
        if call.arguments.len() != 1 {
            return None;
        }
        let argument = call.arguments.first_mut()?.as_expression_mut()?;
        let Expression::ArrowFunctionExpression(arrow) = argument else { return None };
        // StyleX requires the same: "the function body must be an object
        // literal", because a body that computes cannot be read statically.
        // An expression-bodied arrow carries its expression directly; a braced
        // one carries a `return`. `(c) => ({ … })` is the first, and the second
        // is what a formatter produces from it.
        let body: &mut Expression<'a> = match &mut arrow.body {
            oxc::ast::ast::ArrowFunctionBody::FunctionBody(block) => {
                match block.statements.first_mut()? {
                    Statement::ExpressionStatement(statement) => &mut statement.expression,
                    Statement::ReturnStatement(statement) => statement.argument.as_mut()?,
                    _ => return None,
                }
            }
            other => other.as_expression_mut()?,
        };
        // `(c) => ({ … })` parses with the object inside parentheses, and the
        // parser keeps them (`preserve_parens`) so a printed expression keeps
        // the author's grouping.
        let mut body = body;
        while let Expression::ParenthesizedExpression(inner) = body {
            body = &mut inner.expression;
        }
        let Expression::ObjectExpression(object) = body else { return None };

        // Every value is found before any is moved: a call this declines is
        // left for the runtime, which has to find the body it was written with
        // rather than one whose earlier values are now `null`.
        let mut leaves: Vec<(String, String)> = Vec::new();
        self.dynamic_leaves(object, "default", &mut leaves)?;
        let mut values: Vec<Expression<'a>> = Vec::with_capacity(leaves.len());
        take_leaves(&self.ast, object, &mut values);

        let mut classes: Vec<barq_css::atoms::Atom> = Vec::new();
        let mut vars: Vec<(&'a str, Expression<'a>)> = Vec::new();
        let mut read: Vec<String> = Vec::new();
        for ((property, condition), value) in leaves.into_iter().zip(values) {
            for atom in barq_css::atoms::dynamic_atoms(layer, &property, &condition) {
                barq_css::atoms::apply(&mut classes, atom);
            }
            if barq_css::atoms::own_variable(&condition) {
                read.extend(
                    barq_css::atoms::dynamic_longhands(&property)
                        .into_iter()
                        .map(|longhand| barq_css::atoms::dynamic_var_in(longhand, &condition)),
                );
            }
            let variable = barq_css::atoms::dynamic_var_in(&property, &condition);
            vars.push((self.allocator.alloc_str(&variable), value));
        }
        if classes.is_empty() {
            return None;
        }

        let class = self.emit_atoms(&classes);
        for variable in read {
            if self.emitted.insert(format!("@property {variable}")) {
                self.css.push_str(&barq_css::atoms::dynamic_registration(&variable));
            }
        }
        let class =
            Expression::new_string_literal(span, self.allocator.alloc_str(&class), None, &self.ast);
        let vars = self.object(span, vars);
        *body = self.object(span, vec![("$class", class), ("$vars", vars)]);

        let placeholder = Expression::new_null_literal(span, &self.ast);
        Some(std::mem::replace(argument, placeholder))
    }

    /// `defineVars({ brand: "#3b82f6" })` as the `var()` references it names.
    ///
    /// The declarations go to `:root` and the call becomes an object of plain
    /// strings — which is what lets a token set cross a module boundary as DATA
    /// rather than as something the compiler has to resolve there.
    fn compile_define_vars(
        &mut self,
        call: &oxc::ast::ast::CallExpression<'a>,
        span: Span,
        emit: bool,
        global: bool,
    ) -> Option<Expression<'a>> {
        let tokens = self.token_values(call)?;
        let (entries, group, declarations) = Self::token_entries(&tokens, global);
        if emit && self.emitted.insert(format!("vars:{group}")) {
            self.css.push_str(&format!(":root{{{declarations}}}"));
        }

        Some(self.token_object(span, entries))
    }

    fn token_object(&self, span: Span, entries: Vec<(String, TokenEntry)>) -> Expression<'a> {
        let built: Vec<(&'a str, Expression<'a>)> = entries
            .into_iter()
            .map(|(token, entry)| {
                let value = match entry {
                    TokenEntry::Reference(reference) => Expression::new_string_literal(
                        span,
                        self.allocator.alloc_str(&reference),
                        None,
                        &self.ast,
                    ),
                    TokenEntry::Group(inner) => self.token_object(span, inner),
                };
                (self.allocator.alloc_str(&token), value)
            })
            .collect();
        self.object(span, built)
    }

    /// `defineVars`' argument as `(token, value)`, with each value's KIND kept.
    ///
    /// The group's name is a hash of `JSON.stringify(tokens)`, so `{"gap":8}`
    /// and `{"gap":"8"}` are two different token sets and a binding folded to
    /// its text alone would name one of them the other.
    fn token_values(
        &self,
        call: &oxc::ast::ast::CallExpression<'_>,
    ) -> Option<Vec<(String, barq_css::atoms::TokenValue)>> {
        let [argument] = call.arguments.as_slice() else { return None };
        let Expression::ObjectExpression(object) =
            crate::analysis::without_type_wrappers(argument.as_expression()?)
        else {
            return None;
        };
        self.token_group(object)
    }

    /// One level of a token set, in the order `JSON.stringify` writes it.
    fn token_group(
        &self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
    ) -> Option<Vec<(String, barq_css::atoms::TokenValue)>> {
        let mut tokens = Vec::new();
        for (name, value) in self.ordered_properties(object)? {
            let value = match value {
                Expression::ObjectExpression(inner) => {
                    barq_css::atoms::TokenValue::Group(self.token_group(inner)?)
                }
                other if number_of(other).is_some() => {
                    barq_css::atoms::TokenValue::Number(number_of(other)?)
                }
                other if self.is_numeric(other) => {
                    barq_css::atoms::TokenValue::Number(self.text_of(other)?.parse().ok()?)
                }
                other => barq_css::atoms::TokenValue::Text(self.text_of(other)?),
            };
            tokens.push((name, value));
        }
        Some(tokens)
    }

    /// An object literal's properties in the order JavaScript enumerates them,
    /// or `None` when one of them is a spread or a key this cannot read.
    fn ordered_properties<'e>(
        &self,
        object: &'e oxc::ast::ast::ObjectExpression<'_>,
    ) -> Option<Vec<(String, &'e Expression<'e>)>> {
        let mut entries = Vec::with_capacity(object.properties.len());
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let value: &'e Expression<'e> = without_type_wrappers(&property.value);
            entries.push((self.key_text(property)?, value));
        }
        Some(barq_css::atoms::in_property_order(entries))
    }

    /// A token set as the `var()` references it hands back, in the shape it
    /// was given, its group name and its `:root` declarations. Naming only, so
    /// a token set can be known before the walk reaches it and emitted where
    /// the walk reaches it.
    fn token_entries(
        tokens: &[(String, barq_css::atoms::TokenValue)],
        global: bool,
    ) -> (Vec<(String, TokenEntry)>, String, String) {
        // `globalVars` names the property what the author called it, so a
        // theme an application already has can be heard. `defineVars` suffixes
        // it with a hash of the whole object, so two files declaring different
        // tokens cannot collide.
        let group = if global {
            let mut paths = Vec::new();
            token_paths(tokens, "", &mut paths);
            barq_css::atoms::hash32(&paths.join(","))
        } else {
            barq_css::atoms::hash32(&barq_css::atoms::json_object(tokens))
        };
        let mut declarations = String::new();
        let entries = declare_tokens(tokens, "", &group, global, &mut declarations);
        (entries, group, declarations)
    }

    /// `createTheme(tokens, { brand: "#60a5fa" })` as the class that redeclares
    /// them.
    ///
    /// Readable exactly when the token set is one THIS module declared, which
    /// is what `defineVars` leaves behind in `groups`. Nothing else is needed:
    /// the custom property's name is already inside the `var()` reference the
    /// token set handed back, so a theme asks the call that declared it for
    /// nothing. An imported token set is opaque here and stays on the runtime,
    /// which is the per-file rule rather than a gap in it.
    ///
    /// The name is the runtime's, `r` prefix and all, and that is the point:
    /// a theme this compiles and a theme the runtime built for an imported
    /// token set are one rule under one class rather than two.
    fn compile_create_theme(
        &mut self,
        call: &oxc::ast::ast::CallExpression<'a>,
        span: Span,
    ) -> Option<Expression<'a>> {
        let [vars, values] = call.arguments.as_slice() else { return None };
        let symbol = crate::analysis::symbol_of(self.scoping, vars.as_expression()?)?;
        let tokens = self.groups.get(&symbol)?.clone();
        let Expression::ObjectExpression(object) =
            crate::analysis::without_type_wrappers(values.as_expression()?)
        else {
            return None;
        };
        let mut declarations = String::new();
        self.redeclare(&tokens, object, "", &mut declarations)?;

        let name = format!("r{}", barq_css::atoms::hash32(&declarations));
        if self.emitted.insert(name.clone()) {
            self.css.push_str(&format!(".{name}{{{declarations}}}"));
        }
        Some(Expression::new_string_literal(span, self.allocator.alloc_str(&name), None, &self.ast))
    }

    /// A theme's values as declarations, in the order the runtime walks them.
    ///
    /// A group of values redeclares the tokens of the group under that name,
    /// and a token the set does not carry has no property to redeclare.
    fn redeclare(
        &self,
        tokens: &FxHashMap<String, String>,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        prefix: &str,
        declarations: &mut String,
    ) -> Option<()> {
        for (token, value) in self.ordered_properties(object)? {
            let path = member_join(prefix, &token);
            let value = match value {
                Expression::ObjectExpression(inner) => {
                    self.redeclare(tokens, inner, &path, declarations)?;
                    continue;
                }
                // What an absent optional produces, and the runtime skips it.
                Expression::Identifier(identifier) if identifier.name == "undefined" => continue,
                // `String(8.0)` is `8`, whatever the source wrote, and the two
                // sides have to hash the same text. `text_of` prints a number
                // that way.
                other => self.text_of(other)?,
            };
            let Some(property_name) = tokens
                .get(&path)
                .and_then(|reference| reference.strip_prefix("var("))
                .and_then(|inside| inside.split([',', ')']).next())
                .filter(|name| name.starts_with("--"))
            else {
                continue;
            };
            if !declarations.is_empty() {
                declarations.push(';');
            }
            declarations.push_str(&format!("{property_name}:{value}"));
        }
        Some(())
    }

    /// `create({ root: { … }, child: { … } })` as an object of class strings.
    ///
    /// StyleX's shape, and it costs nothing beyond `atoms`: a group is one
    /// merge, and two groups compose by handing both back to `atoms`, which
    /// merges names by the key each one carries.
    fn compile_create(
        &mut self,
        call: &mut oxc::ast::ast::CallExpression<'a>,
        span: Span,
        layer: &str,
    ) -> Option<Expression<'a>> {
        let [argument] = call.arguments.as_slice() else { return None };
        let Expression::ObjectExpression(object) =
            crate::analysis::without_type_wrappers(argument.as_expression()?)
        else {
            return None;
        };

        let groups = self.group_classes(object, layer, true)?;

        // Through `object`, which quotes a key that is not an identifier: a
        // group keyed by a breakpoint, `"2xl"`, written back unquoted is a
        // syntax error in the module it compiled.
        let entries = groups
            .into_iter()
            .map(|(name, classes)| {
                let value = Expression::new_string_literal(
                    span,
                    self.allocator.alloc_str(&classes),
                    None,
                    &self.ast,
                );
                (self.allocator.alloc_str(&name), value)
            })
            .collect();
        Some(self.object(span, entries))
    }

    /// A `create` object as `(name, classes)`, emitting or not.
    ///
    /// The two halves are separate so a group can be KNOWN before the walk
    /// reaches it and still be EMITTED where the walk reaches it. Seeding by
    /// emitting would put a group's rules before rules from calls written
    /// above it, and order is what decides between two same-tier atoms.
    fn group_classes(
        &mut self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        layer: &str,
        emit: bool,
    ) -> Option<Vec<(String, String)>> {
        let mut groups: Vec<(String, String)> = Vec::new();
        // In the order the runtime walks the object, which is the order its
        // rules reach the sheet in.
        for (name, value) in self.ordered_properties(object)? {
            let declarations = self.declarations(value)?;
            let merged = Self::merge(
                &[Argument { at: 0, conditional: false, declarations, atoms: Vec::new() }],
                true,
                layer,
            );
            if emit {
                self.emit_rules(&merged);
            }
            groups.push((name, Self::classes(&merged)));
        }
        Some(groups)
    }

    /// The merged atoms, with the conditional argument in or out.
    ///
    /// Merging is "keep the last per key", which is what makes PASSING order
    /// decide instead of the order the rules were written. Nothing is emitted
    /// here: an atom a later argument replaced is not in the result, and
    /// emitting as the walk went left `margin-top:0` in the stylesheet under a
    /// class no output referenced.
    fn merge(arguments: &[Argument], conditional: bool, layer: &str) -> Vec<barq_css::atoms::Atom> {
        let mut applied: Vec<barq_css::atoms::Atom> = Vec::new();
        for argument in arguments {
            if argument.conditional && !conditional {
                continue;
            }
            for atom in argument.atoms.iter().cloned() {
                barq_css::atoms::apply(&mut applied, atom);
            }
            for (property, condition, value) in &argument.declarations {
                // `"0"` is a stand-in: a removal only needs the KEY, and the key
                // is the class up to its value.
                let text = value.clone().unwrap_or_else(|| "0".to_string());
                for atom in expand_atoms(layer, property, condition, &text) {
                    if value.is_none() {
                        applied.retain(|slot| slot.key != atom.key);
                        continue;
                    }
                    barq_css::atoms::apply(&mut applied, atom);
                }
            }
        }
        applied
    }

    /// One merge that holds a shorthand left whole beside one of its longhands.
    ///
    /// `border` is not split into sides, so it and `border-color` are two
    /// classes for two keys and both stay on the element. Which declaration
    /// wins is then the stylesheet's order, and an atom is written where the
    /// first call to use it stood, so the order they were passed in decides
    /// only until another call has used either one.
    fn report_whole_shorthand(&mut self, atoms: &[barq_css::atoms::Atom], span: Span) {
        let declared: Vec<(String, &str)> = atoms
            .iter()
            .filter_map(|atom| {
                let open = atom.rule.rfind('{')?;
                let colon = open + atom.rule[open..].find(':')?;
                let property = &atom.rule[open + 1..colon];
                // Where the rule applies: the rule with its own class and its
                // declaration taken out.
                let condition = atom.rule[..open].replace(atom.class.as_str(), "&");
                Some((condition, property))
            })
            .collect();
        for (condition, shorthand) in &declared {
            if !barq_css::atoms::unexpandable(shorthand) {
                continue;
            }
            let Some((_, longhand)) = declared.iter().find(|(other, property)| {
                other == condition && barq_css::atoms::sets(shorthand, property)
            }) else {
                continue;
            };
            if self.reports.iter().any(|report| report.code == Code::Barq032 && report.span == span)
            {
                return;
            }
            self.reports.push(Report {
                code: Code::Barq032,
                message: format!(
                    "`{shorthand}` and `{longhand}` are merged here, and `{shorthand}` is a \
                     shorthand whose values are told apart by type, so it is kept whole and \
                     does not give way to `{longhand}` or replace it. Both classes stay on the \
                     element and the order of the stylesheet decides between them, which is \
                     not the order they are passed in. Write `{shorthand}` as its longhands \
                     instead, as `border` is `border-width`, `border-style` and `border-color`."
                ),
                span,
            });
            return;
        }
    }

    /// One merge that sets a property under two conditions of one tier that
    /// can both match, written in the order the shared stylesheet reverses.
    ///
    /// Two such classes both stay on the element, and one stylesheet serves
    /// every call, so it cannot follow this call's writing order: a fixed order
    /// decides, interaction pseudo-classes in their conventional order and then
    /// the condition's hash. The one case worth saying anything about is the
    /// pair whose later condition loses although it is written later. Two
    /// conditions that rule each other out cannot both match, and are left
    /// alone: `[data-state="open"]` against `[data-state="closed"]`, or `X`
    /// against `:not(X)`. Nor is a pair the same call already decides with a
    /// third condition that is both at once and weighs more than either.
    ///
    /// Every pair is said, so fixing one does not uncover the next.
    fn report_condition_order(&mut self, atoms: &[barq_css::atoms::Atom], span: Span) {
        let read: Vec<(&str, String, &barq_css::atoms::Atom)> = atoms
            .iter()
            .filter(|atom| atom.tier != barq_css::atoms::Tier::Base)
            .filter_map(|atom| {
                let open = atom.rule.rfind('{')?;
                let colon = open + atom.rule[open..].find(':')?;
                let condition = atom.rule[..open].replace(atom.class.as_str(), "&");
                Some((&atom.rule[open + 1..colon], condition, atom))
            })
            .collect();
        for (index, (property, first, early)) in read.iter().enumerate() {
            for (other, second, late) in &read[index + 1..] {
                // The same value under both changes nothing, whichever wins.
                let value = |atom: &barq_css::atoms::Atom| {
                    atom.class.rsplit('_').next().map(str::to_string)
                };
                if other != property
                    || first == second
                    || early.tier != late.tier
                    || value(early) == value(late)
                {
                    continue;
                }
                // Two selectors of different weight are decided by specificity,
                // whatever the order; and two pseudo-elements are two subjects.
                if exclusive(first, second)
                    || specificity(subject(&early.rule)) != specificity(subject(&late.rule))
                    || pseudo_element(subject(&early.rule)) != pseudo_element(subject(&late.rule))
                {
                    continue;
                }
                // `{ A: …, B: …, "A B": … }` says what wins where both match.
                let weight = specificity(subject(&early.rule));
                let settled = read.iter().any(|(third, both, atom)| {
                    third == property
                        && conjunction(both, first, second)
                        && specificity(subject(&atom.rule)) > weight
                        && pseudo_element(subject(&atom.rule))
                            == pseudo_element(subject(&early.rule))
                });
                if settled {
                    continue;
                }
                let order = barq_css::order::rank(late.tier, &late.rule)
                    .cmp(&barq_css::order::rank(early.tier, &early.rule));
                if order != std::cmp::Ordering::Less {
                    continue;
                }
                let message = format!(
                    "`{property}` is set under `{}` and then under `{}`, and both can match \
                         one element. One stylesheet serves every call, so it cannot keep this \
                         call's order: it puts `{}` first, and where both match `{}` wins although \
                         it is written earlier. Write them in that order, so the code reads the \
                         way the page behaves, or make one rule the other out.",
                    shown(first),
                    shown(second),
                    shown(second),
                    shown(first),
                );
                if !self.reports.iter().any(|report| {
                    report.code == Code::Barq033 && report.span == span && report.message == message
                }) {
                    self.reports.push(Report { code: Code::Barq033, message, span });
                }
            }
        }
    }

    fn emit_atoms(&mut self, atoms: &[barq_css::atoms::Atom]) -> String {
        self.emit_rules(atoms);
        Self::classes(atoms)
    }

    /// The rules, into this module's stylesheet.
    ///
    /// Emitted in TIER order, which is the one ordering specificity cannot
    /// give: `@media` adds none, so a base and the same property under one are
    /// separated by source order alone. A stable sort, so everything within a
    /// tier keeps the order the author wrote it in, except under an at-rule,
    /// where `barq_css::order::Rank` puts the narrower query later.
    fn emit_rules(&mut self, atoms: &[barq_css::atoms::Atom]) {
        for atom in barq_css::order::arranged(atoms) {
            if atom.rule.is_empty() {
                continue;
            }
            match self.atoms.insert(atom) {
                Ok(true) => self.css.push_str(&atom.rule),
                Ok(false) => {}
                Err(collision) => self.reports.push(Report {
                    code: Code::Barq014,
                    message: format!("This CSS could not be compiled. {collision}"),
                    span: self.site,
                }),
            }
        }
    }

    fn classes(atoms: &[barq_css::atoms::Atom]) -> String {
        atoms.iter().map(|atom| atom.class.as_str()).collect::<Vec<_>>().join(" ")
    }

    /// The atoms behind a class string this module already produced.
    ///
    /// Their rules are in the sheet already, so only the key matters — which is
    /// in the name, which is the whole reason the key lives there.
    fn known(&self, expression: &Expression<'_>) -> Option<Vec<barq_css::atoms::Atom>> {
        let classes = match crate::analysis::without_type_wrappers(expression) {
            Expression::StringLiteral(literal) => literal.value.as_str()?.to_string(),
            // `styles.root`, `gap[2]`, and `style.layout.row` through a
            // namespace import or a nested group.
            Expression::StaticMemberExpression(member) => {
                self.member_text(&member.object, member.property.name.as_str())?
            }
            Expression::ComputedMemberExpression(member) => {
                self.member_text(&member.object, &member_name(&member.expression)?)?
            }
            // A `const` in this module holding a class string, which is what
            // every folded `atoms` call above it has become.
            Expression::Identifier(_) => {
                let symbol = crate::analysis::symbol_of(self.scoping, expression)?;
                match self.folded.get(&symbol) {
                    Some(text) => text.clone(),
                    None => return self.miss(symbol).map(|_| Vec::new()),
                }
            }
            _ => return None,
        };
        Some(
            classes
                .split(' ')
                .filter(|class| !class.is_empty())
                .map(|class| barq_css::atoms::Atom {
                    key: barq_css::atoms::merge_key(class),
                    class: class.to_string(),
                    // Already registered by the call that produced it; only
                    // the key matters here, and the key is in the name.
                    rule: String::new(),
                    tier: barq_css::atoms::Tier::Base,
                })
                .collect(),
        )
    }

    /// A style object as `(property, condition, value)`, where `None` for the
    /// value means REMOVE what an earlier argument applied.
    ///
    /// The same walk `@barqjs/css` does, and it has to be: a form this read
    /// differently would compile to something the runtime would not have
    /// produced, which is worse than not compiling it at all. Two forms used to
    /// do exactly that — a top-level `"::placeholder"` key was read as a
    /// property whose conditions were its declarations, and `null` was skipped
    /// where it should remove.
    /// Whether a style value names a binding declared inside a function.
    ///
    /// Only the shapes a value is written in are followed: a nested condition
    /// object, a member read, a template and a `firstThatWorks` list.
    fn holds_local(&self, value: &Expression<'_>) -> bool {
        match without_type_wrappers(value) {
            Expression::ObjectExpression(object) => object.properties.iter().any(|property| {
                matches!(property, ObjectPropertyKind::ObjectProperty(property)
                    if self.holds_local(&property.value))
            }),
            Expression::Identifier(_) => crate::analysis::symbol_of(self.scoping, value)
                .is_some_and(|symbol| {
                    self.scoping.symbol_scope_id(symbol) != self.scoping.root_scope_id()
                }),
            Expression::StaticMemberExpression(member) => self.holds_local(&member.object),
            Expression::ComputedMemberExpression(member) => self.holds_local(&member.object),
            Expression::TemplateLiteral(template) => {
                template.expressions.iter().any(|expression| self.holds_local(expression))
            }
            Expression::CallExpression(call)
                if self.tag_of(&call.callee) == Some(Tag::FirstThatWorks) =>
            {
                call.arguments
                    .iter()
                    .filter_map(|argument| argument.as_expression())
                    .any(|expression| self.holds_local(expression))
            }
            _ => false,
        }
    }

    fn declarations(&self, object: &Expression<'_>) -> Option<Vec<Declaration>> {
        let Expression::ObjectExpression(object) = crate::analysis::without_type_wrappers(object)
        else {
            return None;
        };
        let mut out = Vec::new();
        self.walk(object, "default", &mut out)?;
        Some(out)
    }

    fn walk(
        &self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        condition: &str,
        out: &mut Vec<Declaration>,
    ) -> Option<()> {
        // In the order JavaScript enumerates the object, which is the order the
        // runtime merges in, and a key written twice is the one value the
        // runtime ever sees.
        for (name, value) in self.ordered_properties(object)? {
            // A top-level condition key holds a whole style object.
            if is_condition(&name) {
                let Expression::ObjectExpression(nested) = value else { return None };
                self.walk(nested, &join(condition, &name), out)?;
                continue;
            }

            let property_name = barq_css::atoms::kebab(&name);
            let Expression::ObjectExpression(conditions) = value else {
                out.extend(self.declaration(&property_name, condition, value)?);
                continue;
            };
            for (inner, value) in self.ordered_properties(conditions)? {
                let where_ = if inner == "default" {
                    condition.to_string()
                } else {
                    join(condition, &inner)
                };
                if let Expression::ObjectExpression(deeper) = value {
                    // A condition inside a condition, which is the shape a media
                    // query with a pseudo-class inside it takes.
                    let mut wrapper = Vec::new();
                    self.conditions(deeper, &property_name, &where_, &mut wrapper)?;
                    out.extend(wrapper);
                    continue;
                }
                // `null` under a NON-default condition has no meaning, so it is
                // skipped rather than removing what a sibling key just set.
                if inner != "default" && matches!(value, Expression::NullLiteral(_)) {
                    continue;
                }
                out.extend(self.declaration(&property_name, &where_, value)?);
            }
        }
        Some(())
    }

    /// One property's nested conditions, one level deeper.
    fn conditions(
        &self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        property: &str,
        condition: &str,
        out: &mut Vec<Declaration>,
    ) -> Option<()> {
        for (inner, value) in self.ordered_properties(object)? {
            let where_ =
                if inner == "default" { condition.to_string() } else { join(condition, &inner) };
            match value {
                Expression::ObjectExpression(deeper) => {
                    self.conditions(deeper, property, &where_, out)?;
                }
                // As one level up: `null` removes only under `default`.
                Expression::NullLiteral(_) if inner != "default" => {}
                _ => out.extend(self.declaration(property, &where_, value)?),
            }
        }
        Some(())
    }

    /// `None` for a value this compiler cannot know, which sends the whole call
    /// to the runtime; an empty list for one that contributes nothing.
    fn declaration(
        &self,
        property: &str,
        condition: &str,
        value: &Expression<'_>,
    ) -> Option<Vec<Declaration>> {
        match value {
            // REMOVE, not skip.
            Expression::NullLiteral(_) => {
                Some(vec![(property.to_string(), condition.to_string(), None)])
            }
            Expression::BooleanLiteral(literal) if !literal.value => Some(Vec::new()),
            Expression::Identifier(identifier) if identifier.name == "undefined" => {
                Some(Vec::new())
            }
            // By VALUE: `.5`, `1e3` and `0x10` are `0.5`, `1000` and `16` to the
            // runtime, which never sees how the source spelled them.
            other if number_of(other).is_some() => {
                Some(self.number_declaration(property, condition, number_of(other)?))
            }
            // `firstThatWorks(…)`: the declaration repeated, best last.
            Expression::CallExpression(call)
                if self.tag_of(&call.callee) == Some(Tag::FirstThatWorks) =>
            {
                let mut values = Vec::new();
                for argument in &call.arguments {
                    let expression = argument.as_expression()?;
                    let expression = crate::analysis::without_type_wrappers(expression);
                    let text = self.text_of(expression)?;
                    // Each value is written as its own declaration would be,
                    // so a number takes the unit the property gives one.
                    values.push(
                        if number_of(expression).is_some() || self.is_numeric(expression) {
                            barq_css::atoms::number_value(property, &text)
                        } else {
                            text
                        },
                    );
                }
                Some(vec![(
                    property.to_string(),
                    condition.to_string(),
                    Some(barq_css::atoms::fallback(property, &values)),
                )])
            }
            other => {
                let text = self.text_of(other)?;
                // `{ padding: GAP }` where `GAP` is `8` is `8px`, exactly as
                // `{ padding: 8 }` is: `cssValue` asks the value's TYPE, not
                // its spelling.
                if self.is_numeric(other) {
                    return Some(self.number_declaration(property, condition, text.parse().ok()?));
                }
                Some(vec![(property.to_string(), condition.to_string(), Some(text))])
            }
        }
    }

    /// A number as the one declaration it is, or none when it is not finite.
    fn number_declaration(&self, property: &str, condition: &str, value: f64) -> Vec<Declaration> {
        barq_css::atoms::number_declaration(property, value)
            .map(|text| (property.to_string(), condition.to_string(), Some(text)))
            .into_iter()
            .collect()
    }

    fn tag_of(&self, tag: &Expression<'_>) -> Option<Tag> {
        let Expression::Identifier(identifier) = without_type_wrappers(tag) else { return None };
        let symbol = self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
        self.tags.get(&symbol).copied()
    }

    /// `ui.create` and friends: the layer the binding carries, and which helper
    /// on it is being called.
    fn bound_layer(&self, callee: &Expression<'_>) -> Option<(String, String)> {
        let Expression::StaticMemberExpression(member) = without_type_wrappers(callee) else {
            return None;
        };
        let symbol = crate::analysis::symbol_of(self.scoping, &member.object)?;
        let layer = match self.layers.get(&symbol) {
            Some(layer) => layer.clone(),
            None => return self.miss(symbol).map(|_| (String::new(), String::new())),
        };
        Some((layer, member.property.name.to_string()))
    }

    /// Whether the callee is `ui` or `ui.member` for a `layer` binding this
    /// pass could not read the name of.
    fn through_unread_layer(&self, callee: &Expression<'_>) -> bool {
        let object = match without_type_wrappers(callee) {
            Expression::StaticMemberExpression(member) => &member.object,
            other => other,
        };
        crate::analysis::symbol_of(self.scoping, object)
            .is_some_and(|symbol| self.unread_layers.contains(&symbol))
    }

    /// The layer a binding `layer` produced carries, if the callee is one.
    fn layer_of(&self, callee: &Expression<'_>) -> Option<String> {
        let Expression::Identifier(identifier) = without_type_wrappers(callee) else { return None };
        let symbol = self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
        match self.layers.get(&symbol) {
            Some(layer) => Some(layer.clone()),
            None => self.miss(symbol),
        }
    }

    /// One argument as text, which is what a layer name has to be.
    ///
    /// Read through the same table an interpolation is, so
    /// `const LAYER = "barq.ui"` beside the call works and only an IMPORTED
    /// name does not. It used to demand a string literal at the call site,
    /// which made naming the layer once a module — the thing `layer()` exists
    /// for — impossible to do with a constant.
    fn text_argument(
        &self,
        call: &oxc::ast::ast::CallExpression<'_>,
        index: usize,
    ) -> Option<String> {
        self.text_of(call.arguments.get(index)?.as_expression()?)
    }

    /// `None` leaves the call where it is, for the runtime to evaluate.
    fn compile(&mut self, tag: Tag, quasi: &TemplateLiteral<'_>, span: Span) -> Option<String> {
        let source = self.interpolate(quasi, span)?;
        let options = barq_css::Options {
            debug_name: if self.debug { self.name.as_deref() } else { None },
            ..barq_css::Options::default()
        };
        match barq_css::compile(&source, tag.kind(), &options) {
            Ok(compiled) => {
                if compiled.name.is_empty() || self.emitted.insert(compiled.name.clone()) {
                    self.css.push_str(&compiled.css);
                }
                Some(compiled.name)
            }
            Err(error) => {
                // The block's span, not the module's: the CSS was assembled from
                // several quasis and the offsets inside it do not address the
                // source the author is looking at.
                self.reports.push(Report {
                    code: Code::Barq014,
                    message: format!("This CSS could not be compiled. {}", error.message),
                    span,
                });
                None
            }
        }
    }

    /// The template as one CSS string, or `None` when an interpolation names
    /// something whose text this compiler cannot know.
    fn interpolate(&mut self, quasi: &TemplateLiteral<'_>, span: Span) -> Option<String> {
        let mut source = String::new();
        for (index, element) in quasi.quasis.iter().enumerate() {
            let Some(text) = quasi_text(element) else {
                self.reports.push(Report {
                    code: Code::Barq014,
                    message: "This CSS could not be compiled. It holds an unpaired UTF-16 \
                              surrogate, which CSS text cannot carry."
                        .to_string(),
                    span,
                });
                return None;
            };
            source.push_str(text);
            let Some(expression) = quasi.expressions.get(index) else { continue };
            match self.text_of(expression) {
                Some(folded) => source.push_str(&folded),
                None => {
                    self.reports.push(Report {
                        code: Code::Barq015,
                        message: "This block interpolates a value that is only known when the \
                                  program runs, so it cannot be compiled and `@barqjs/css` builds \
                                  its CSS in the browser instead. To compile it, write \
                                  `var(--name)` in the block and set the value on the element: \
                                  `style={{ \"--name\": value }}`."
                            .to_string(),
                        span,
                    });
                    return None;
                }
            }
        }
        Some(source)
    }

    /// A property's key as text, computed or not.
    ///
    /// `[MIX]: { … }` is how a condition written once is used twice, and a
    /// repeated `@supports (color: color-mix(…))` is long enough that spelling
    /// it out is what people stop doing. The key resolves through the same
    /// table an interpolation does, so it folds under the same rule: a
    /// module-level `const`, declared above the use.
    fn key_text(&self, property: &ObjectProperty<'_>) -> Option<String> {
        if property.computed {
            return property.key.as_expression().and_then(|key| self.text_of(key));
        }
        key_name(&property.key)
    }

    /// A dynamic group's values as `(property, condition)`, in the order the
    /// runtime walks them: a condition key holds a style, and a property holds
    /// a value or a value per condition. `None` when one will not read.
    fn dynamic_leaves(
        &self,
        object: &oxc::ast::ast::ObjectExpression<'_>,
        condition: &str,
        out: &mut Vec<(String, String)>,
    ) -> Option<()> {
        let mut seen = FxHashSet::default();
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let name = self.key_text(property)?;
            // A key written twice is one value to the runtime and two here, and
            // the values are moved out by position.
            if !seen.insert(name.clone()) {
                return None;
            }
            if is_condition(&name) {
                let Expression::ObjectExpression(inner) = &property.value else { return None };
                self.dynamic_leaves(inner, &join(condition, &name), out)?;
                continue;
            }
            self.dynamic_values(&barq_css::atoms::kebab(&name), &property.value, condition, out)?;
        }
        Some(())
    }

    fn dynamic_values(
        &self,
        property: &str,
        value: &Expression<'_>,
        condition: &str,
        out: &mut Vec<(String, String)>,
    ) -> Option<()> {
        if let Expression::ObjectExpression(conditions) = value {
            let mut seen = FxHashSet::default();
            for inner in &conditions.properties {
                let ObjectPropertyKind::ObjectProperty(inner) = inner else { return None };
                let key = self.key_text(inner)?;
                if !seen.insert(key.clone()) {
                    return None;
                }
                let at =
                    if key == "default" { condition.to_string() } else { join(condition, &key) };
                self.dynamic_values(property, &inner.value, &at, out)?;
            }
            return Some(());
        }
        if !self.holds_one_value(value) {
            return None;
        }
        out.push((property.to_string(), condition.to_string()));
        Some(())
    }

    /// A `props` call that is left only merging class strings and compiled
    /// dynamic groups, pointed at `mergeStyles`.
    ///
    /// `props` takes style objects too, so calling it ships the walk that turns
    /// one into atoms and the registry it writes to, about 6 KB gzipped. Every
    /// object here is already folded, and an argument this pass cannot vouch
    /// for keeps `props`.
    fn merge_styles(&mut self, call: &mut oxc::ast::ast::CallExpression<'a>, span: Span) -> bool {
        let ready = call.arguments.iter().all(|argument| {
            argument.as_expression().is_some_and(|expression| self.merges_as_is(expression))
        });
        if ready {
            call.callee = Expression::new_identifier(span, MERGE_STYLES, &self.ast);
            self.merges = true;
        }
        ready
    }

    /// A class string, nothing, or a call to a dynamic group this pass compiled.
    fn merges_as_is(&self, expression: &Expression<'_>) -> bool {
        match without_type_wrappers(expression) {
            Expression::StringLiteral(_) | Expression::NullLiteral(_) => true,
            Expression::BooleanLiteral(literal) => !literal.value,
            Expression::Identifier(identifier) => identifier.name == "undefined",
            Expression::ConditionalExpression(choice) => {
                self.merges_as_is(&choice.consequent) && self.merges_as_is(&choice.alternate)
            }
            Expression::LogicalExpression(logical) if logical.operator == LogicalOperator::And => {
                self.merges_as_is(&logical.right)
            }
            Expression::CallExpression(call) => {
                let Expression::Identifier(identifier) = without_type_wrappers(&call.callee) else {
                    return false;
                };
                identifier
                    .reference_id
                    .get()
                    .and_then(|reference| self.scoping.get_reference(reference).symbol_id())
                    .is_some_and(|symbol| self.dynamics.contains(&symbol))
            }
            _ => false,
        }
    }

    /// `dynamic`, or `dynamic` through a binding `layer` made.
    fn is_dynamic_callee(&self, callee: &Expression<'_>) -> bool {
        if self.tag_of(callee) == Some(Tag::Dynamic) {
            return true;
        }
        let Expression::StaticMemberExpression(member) = without_type_wrappers(callee) else {
            return false;
        };
        member.property.name == "dynamic"
            && crate::analysis::symbol_of(self.scoping, &member.object)
                .is_some_and(|symbol| self.layers.contains_key(&symbol))
    }

    /// Whether a dynamic declaration's value can be one custom property.
    ///
    /// A value per condition and a `firstThatWorks` list are several
    /// declarations, which one variable cannot carry.
    fn holds_one_value(&self, value: &Expression<'_>) -> bool {
        match without_type_wrappers(value) {
            Expression::ObjectExpression(_) | Expression::ArrayExpression(_) => false,
            Expression::CallExpression(call) => {
                self.tag_of(&call.callee) != Some(Tag::FirstThatWorks)
            }
            _ => true,
        }
    }

    /// Whether a foldable expression's value is a NUMBER rather than its text.
    fn is_numeric(&self, expression: &Expression<'_>) -> bool {
        match without_type_wrappers(expression) {
            Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) => self
                .member_path(expression)
                .is_some_and(|(symbol, path)| self.numeric_members.contains(&(symbol, path))),
            _ => crate::analysis::symbol_of(self.scoping, expression)
                .is_some_and(|symbol| self.numeric.contains(&symbol)),
        }
    }

    /// A lookup that missed on an IMPORTED binding, remembered by name.
    ///
    /// `None` either way — the pass declines exactly as it did — but the module
    /// now says what it would have needed, which is what lets an integration
    /// hand it over and the fold happen on a second pass.
    fn miss(&self, symbol: SymbolId) -> Option<String> {
        if let Some(entry) = self.imports.get(&symbol) {
            let mut wanted = self.wanted.borrow_mut();
            if !wanted.contains(entry) {
                wanted.push(entry.clone());
            }
        }
        None
    }

    fn text_of(&self, expression: &Expression<'_>) -> Option<String> {
        match without_type_wrappers(expression) {
            Expression::StringLiteral(literal) => literal.value.as_str().map(str::to_string),
            other if number_of(other).is_some() => {
                number_of(other).map(barq_css::atoms::number_text)
            }
            Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
                template.quasis.first().and_then(quasi_text).map(str::to_string)
            }
            Expression::Identifier(identifier) => {
                let symbol =
                    self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
                match self.folded.get(&symbol) {
                    Some(text) => Some(text.clone()),
                    None => self.miss(symbol),
                }
            }
            // `theme.brand` — a token set or a `create` group this module
            // produced, whose values are strings by the time the walk gets
            // here. Without it a block interpolating a token stayed on the
            // runtime, which is the one thing tokens exist to avoid.
            Expression::StaticMemberExpression(member) => {
                self.member_text(&member.object, member.property.name.as_str())
            }
            // `when["2xl"]`: a member whose name is not an identifier, which
            // is what a breakpoint is usually called.
            Expression::ComputedMemberExpression(member) => {
                self.member_text(&member.object, &member_name(&member.expression)?)
            }
            _ => None,
        }
    }

    fn member_text(&self, object: &Expression<'_>, name: &str) -> Option<String> {
        let (symbol, prefix) = self.member_path(object)?;
        match self.groups.get(&symbol) {
            Some(group) => group.get(&member_join(&prefix, name)).cloned(),
            None => self.miss(symbol),
        }
    }

    /// The binding a member chain starts from, and the path down it:
    /// `theme.color` is `theme` and `color`, so `theme.color.brand` reads the
    /// token a nested group declared.
    fn member_path(&self, expression: &Expression<'_>) -> Option<(SymbolId, String)> {
        match without_type_wrappers(expression) {
            Expression::StaticMemberExpression(member) => {
                let (symbol, prefix) = self.member_path(&member.object)?;
                Some((symbol, member_join(&prefix, member.property.name.as_str())))
            }
            Expression::ComputedMemberExpression(member) => {
                let name = member_name(&member.expression)?;
                let (symbol, prefix) = self.member_path(&member.object)?;
                Some((symbol, member_join(&prefix, &name)))
            }
            other => Some((crate::analysis::symbol_of(self.scoping, other)?, String::new())),
        }
    }
}

/// The local name a module imports `mergeStyles` under.
const MERGE_STYLES: &str = "_$mergeStyles";

/// `mergeStyles` beside the names the module already imports from the package.
fn import_merge_styles<'a>(allocator: &'a Allocator, program: &mut Program<'a>, css_source: &str) {
    let ast = AstBuilder::new(allocator);
    let imports_package = program.body.iter().any(|statement| {
        matches!(statement, Statement::ImportDeclaration(declaration)
            if declaration.source.value.as_str() == Some(css_source)
                && declaration.import_kind == oxc::ast::ast::ImportOrExportKind::Value)
    });
    if !imports_package {
        // A module whose only tie to the package is a layer binding it
        // imports from another module.
        let specifier = ImportDeclarationSpecifier::new_import_specifier(
            Span::default(),
            ModuleExportName::IdentifierName(oxc::ast::ast::IdentifierName::new(
                Span::default(),
                "mergeStyles",
                &ast,
            )),
            oxc::ast::ast::BindingIdentifier::new(Span::default(), MERGE_STYLES, &ast),
            oxc::ast::ast::ImportOrExportKind::Value,
            &ast,
        );
        let source = oxc::ast::ast::StringLiteral::new(
            Span::default(),
            allocator.alloc_str(css_source),
            None,
            &ast,
        );
        let declaration = oxc::ast::ast::ImportDeclaration::boxed(
            Span::default(),
            Some(ArenaVec::from_iter_in([specifier], &allocator)),
            source,
            None,
            None,
            oxc::ast::ast::ImportOrExportKind::Value,
            &ast,
        );
        program.body.insert(0, Statement::ImportDeclaration(declaration));
        return;
    }
    for statement in program.body.iter_mut() {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != Some(css_source)
            || declaration.import_kind != oxc::ast::ast::ImportOrExportKind::Value
        {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_mut() else { continue };
        if specifiers.iter().any(|specifier| {
            matches!(specifier, ImportDeclarationSpecifier::ImportNamespaceSpecifier(_))
        }) {
            continue;
        }
        specifiers.push(ImportDeclarationSpecifier::new_import_specifier(
            Span::default(),
            ModuleExportName::IdentifierName(oxc::ast::ast::IdentifierName::new(
                Span::default(),
                "mergeStyles",
                &ast,
            )),
            oxc::ast::ast::BindingIdentifier::new(Span::default(), MERGE_STYLES, &ast),
            oxc::ast::ast::ImportOrExportKind::Value,
            &ast,
        ));
        return;
    }
}

/// A dynamic group's values, moved out in the order [`Css::dynamic_leaves`]
/// found them, each leaving `null` where it stood.
fn take_leaves<'a>(
    ast: &AstBuilder<'a>,
    object: &mut oxc::ast::ast::ObjectExpression<'a>,
    out: &mut Vec<Expression<'a>>,
) {
    for property in object.properties.iter_mut() {
        let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
        if let Expression::ObjectExpression(inner) = &mut property.value {
            take_leaves(ast, inner, out);
            continue;
        }
        let placeholder = Expression::new_null_literal(property.value.span(), ast);
        out.push(std::mem::replace(&mut property.value, placeholder));
    }
}

/// Whether a key can be written unquoted in an object literal.
fn is_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_' || first == '$')
        && characters.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

fn is_condition(key: &str) -> bool {
    key.starts_with(':')
        || key.starts_with('@')
        || key.starts_with('&')
        || key.starts_with('[')
        // `a&:hover` — an anchor that is also this element. The `&` is
        // substituted wherever it appears, so a selector is not obliged to lead
        // with it, and a property name never contains one. `atoms.ts` reads a
        // key the same way.
        || key.contains('&')
}

fn join(outer: &str, inner: &str) -> String {
    let inner = barq_css::atoms::canonical_condition(inner);
    if outer == "default" { inner } else { format!("{outer}{}{inner}", barq_css::atoms::NEST) }
}

/// A condition as an author would recognise it: the rule's selector with its
/// own class as `&`, under whatever at-rules wrap it.
fn shown(condition: &str) -> String {
    condition.replace('{', " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A rule's selector, with its layer and every other at-rule prelude off.
fn subject(rule: &str) -> &str {
    let mut at = 0;
    while rule[at..].starts_with('@') {
        let Some(brace) = rule[at..].find('{') else { return "" };
        at += brace + 1;
    }
    rule[at..].split('{').next().unwrap_or("").trim()
}

/// The pseudo-element a selector's subject is, if any.
fn pseudo_element(selector: &str) -> Option<&str> {
    let at = selector.rfind("::")?;
    let end = selector[at + 2..]
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .map_or(selector.len(), |end| at + 2 + end);
    Some(&selector[at..end])
}

/// A selector list's specificity, the most specific branch's: ids, then
/// classes, attributes and pseudo-classes, then types and pseudo-elements.
/// `:where()` counts nothing, and `:is()`, `:not()` and `:has()` count their
/// most specific argument.
fn specificity(selector: &str) -> (u32, u32, u32) {
    split_top(selector, ',').into_iter().map(compound_weight).max().unwrap_or((0, 0, 0))
}

fn split_top(text: &str, separator: char) -> Vec<&str> {
    let (mut depth, mut start, mut out) = (0i32, 0usize, Vec::new());
    for (index, c) in text.char_indices() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            _ if c == separator && depth == 0 => {
                out.push(&text[start..index]);
                start = index + c.len_utf8();
            }
            _ => {}
        }
    }
    out.push(&text[start..]);
    out
}

fn compound_weight(selector: &str) -> (u32, u32, u32) {
    let chars: Vec<char> = selector.chars().collect();
    let (mut a, mut b, mut c) = (0u32, 0u32, 0u32);
    let mut at = 0;
    let ident = |from: usize| {
        let mut end = from;
        while end < chars.len()
            && (chars[end].is_alphanumeric() || matches!(chars[end], '-' | '_' | '\\'))
        {
            end += if chars[end] == '\\' { 2 } else { 1 };
        }
        end.min(chars.len())
    };
    while at < chars.len() {
        match chars[at] {
            '#' => {
                a += 1;
                at = ident(at + 1);
            }
            '.' => {
                b += 1;
                at = ident(at + 1);
            }
            '[' => {
                b += 1;
                while at < chars.len() && chars[at] != ']' {
                    at += 1;
                }
                at += 1;
            }
            ':' if chars.get(at + 1) == Some(&':') => {
                c += 1;
                at = ident(at + 2);
            }
            ':' => {
                let end = ident(at + 1);
                let name: String =
                    chars[at + 1..end].iter().collect::<String>().to_ascii_lowercase();
                at = end;
                if chars.get(at) == Some(&'(') {
                    let mut depth = 0;
                    let start = at + 1;
                    while at < chars.len() {
                        match chars[at] {
                            '(' => depth += 1,
                            ')' => {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                            }
                            _ => {}
                        }
                        at += 1;
                    }
                    let inner: String = chars[start..at.min(chars.len())].iter().collect();
                    at += 1;
                    match name.as_str() {
                        "where" => {}
                        "is" | "not" | "has" | "matches" => {
                            let (x, y, z) = specificity(&inner);
                            a += x;
                            b += y;
                            c += z;
                        }
                        _ => b += 1,
                    }
                } else {
                    b += 1;
                }
            }
            ch if ch.is_alphabetic() => {
                c += 1;
                at = ident(at);
            }
            _ => at += 1,
        }
    }
    (a, b, c)
}

/// Whether `both` is `first` and `second` at once on one subject: the same
/// at-rules around it, every ancestor either names, and everything either adds
/// to the subject itself.
fn conjunction(both: &str, first: &str, second: &str) -> bool {
    let parts = |condition: &str| -> Option<(String, String, String)> {
        let (prelude, selector) = condition.rsplit_once('{').unwrap_or(("", condition));
        let (before, after) = selector.split_once('&')?;
        Some((
            prelude.to_string(),
            before.trim_end_matches('.').trim().to_string(),
            after.trim().to_string(),
        ))
    };
    let (Some(all), Some(one), Some(two)) = (parts(both), parts(first), parts(second)) else {
        return false;
    };
    all.0 == one.0
        && all.0 == two.0
        && (all.1 != one.1 || all.2 != one.2)
        && (all.1 != two.1 || all.2 != two.2)
        && all.1.contains(one.1.as_str())
        && all.1.contains(two.1.as_str())
        && all.2.contains(one.2.as_str())
        && all.2.contains(two.2.as_str())
}

/// One feature's bounds in pixels: `(feature, low, low included, high, high
/// included)`.
type Range = (String, f64, bool, f64, bool);

/// A media query's bounds on each feature it bounds. `None` for a query this
/// cannot read as ranges joined by `and`, which is then taken as able to match
/// anywhere.
fn media_ranges(condition: &str) -> Option<Vec<Range>> {
    let prelude = condition.split('{').find(|part| part.trim_start().starts_with("@media"))?;
    let query = prelude.trim_start().strip_prefix("@media")?.trim().to_ascii_lowercase();
    if query.contains(',') || query.contains(" or ") || query.starts_with("not ") {
        return None;
    }
    let mut out = Vec::new();
    for part in query.split(" and ") {
        let inner = part.trim().strip_prefix('(')?.strip_suffix(')')?.trim();
        if let Some((name, value)) = inner.split_once(':') {
            let value = pixels(value.trim())?;
            let name = name.trim();
            if let Some(feature) = name.strip_prefix("min-") {
                out.push((feature.to_string(), value, true, f64::INFINITY, false));
            } else {
                let feature = name.strip_prefix("max-")?;
                out.push((feature.to_string(), f64::NEG_INFINITY, false, value, true));
            }
            continue;
        }
        // `width >= 600px`, `600px <= width`, `400px < width <= 800px`.
        let tokens: Vec<&str> =
            inner.split(|c: char| c.is_whitespace()).filter(|token| !token.is_empty()).collect();
        let feature_at = tokens
            .iter()
            .position(|token| token.chars().next().is_some_and(|c| c.is_ascii_alphabetic()))?;
        let feature = tokens[feature_at].to_string();
        let mut range = (feature, f64::NEG_INFINITY, false, f64::INFINITY, false);
        let mut bound = |operator: &str, value: &str, feature_first: bool| -> Option<()> {
            let value = pixels(value)?;
            let closed = operator.ends_with('=');
            let above = match (operator.trim_end_matches('='), feature_first) {
                (">", true) | ("<", false) => true,
                ("<", true) | (">", false) => false,
                _ => return None,
            };
            if above {
                range.1 = value;
                range.2 = closed;
            } else {
                range.3 = value;
                range.4 = closed;
            }
            Some(())
        };
        match (feature_at, tokens.len()) {
            (0, 3) => bound(tokens[1], tokens[2], true)?,
            (2, 3) => bound(tokens[1], tokens[0], false)?,
            (2, 5) => {
                bound(tokens[1], tokens[0], false)?;
                bound(tokens[3], tokens[4], true)?;
            }
            _ => return None,
        }
        out.push(range);
    }
    Some(out)
}

/// A length as pixels, at the 16px an `em` is in a media query.
fn pixels(text: &str) -> Option<f64> {
    let end = text.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(text.len());
    let value: f64 = text[..end].parse().ok()?;
    match &text[end..] {
        "px" => Some(value),
        "em" | "rem" => Some(value * 16.0),
        _ => None,
    }
}

/// Whether two media queries bound one feature to ranges with no width in
/// common, so no viewport matches both.
fn media_apart(first: &str, second: &str) -> bool {
    let (Some(one), Some(two)) = (media_ranges(first), media_ranges(second)) else {
        return false;
    };
    let narrowed = |ranges: &[Range], feature: &str| {
        ranges.iter().filter(|range| range.0 == feature).fold(
            (f64::NEG_INFINITY, false, f64::INFINITY, false),
            |(low, low_in, high, high_in), range| {
                let (low, low_in) = if range.1 > low || (range.1 == low && !range.2) {
                    (range.1, range.2)
                } else {
                    (low, low_in)
                };
                let (high, high_in) = if range.3 < high || (range.3 == high && !range.4) {
                    (range.3, range.4)
                } else {
                    (high, high_in)
                };
                (low, low_in, high, high_in)
            },
        )
    };
    one.iter().any(|(feature, ..)| {
        if !two.iter().any(|range| &range.0 == feature) {
            return false;
        }
        let (a_low, a_low_in, a_high, a_high_in) = narrowed(&one, feature);
        let (b_low, b_low_in, b_high, b_high_in) = narrowed(&two, feature);
        a_high < b_low
            || b_high < a_low
            || (a_high == b_low && !(a_high_in && b_low_in))
            || (b_high == a_low && !(b_high_in && a_low_in))
    })
}

/// Whether two conditions rule each other out by how they are written: one
/// attribute equal to two different values or starting with two that do not
/// start each other, two different child positions, a selector and its
/// `:not()`, or two media queries over ranges that do not meet.
fn exclusive(first: &str, second: &str) -> bool {
    if media_apart(first, second) {
        return true;
    }
    let values = |condition: &str| -> Vec<(String, bool, String)> {
        let mut out = Vec::new();
        let mut rest = condition;
        while let Some(open) = rest.find('[') {
            let Some(close) = rest[open..].find(']') else { break };
            let inner = &rest[open + 1..open + close];
            if let Some((name, value)) = inner.split_once('=') {
                let prefix = name.ends_with('^');
                if prefix || !name.ends_with(['~', '|', '$', '*']) {
                    out.push((
                        name.trim_end_matches('^').trim().to_string(),
                        prefix,
                        value.trim().trim_matches(['"', '\'']).to_string(),
                    ));
                }
            }
            rest = &rest[open + close + 1..];
        }
        out
    };
    let apart = |(name, prefix, value): &(String, bool, String),
                 (other, held_prefix, held): &(String, bool, String)| {
        name == other
            && match (prefix, held_prefix) {
                (false, false) => value != held,
                (true, false) => !held.starts_with(value.as_str()),
                (false, true) => !value.starts_with(held.as_str()),
                (true, true) => {
                    !value.starts_with(held.as_str()) && !held.starts_with(value.as_str())
                }
            }
    };
    let (one, two) = (values(first), values(second));
    if one.iter().any(|a| two.iter().any(|b| apart(a, b))) {
        return true;
    }
    let position = |condition: &str| -> Option<(bool, String)> {
        if condition.contains(":first-child") {
            return Some((false, "1".to_string()));
        }
        if condition.contains(":last-child") {
            return Some((true, "1".to_string()));
        }
        for (marker, last) in [(":nth-child(", false), (":nth-last-child(", true)] {
            if let Some(at) = condition.find(marker) {
                let rest = &condition[at + marker.len()..];
                let argument = rest.split(')').next().unwrap_or("").trim();
                if argument.bytes().all(|b| b.is_ascii_digit()) && !argument.is_empty() {
                    return Some((last, argument.to_string()));
                }
            }
        }
        None
    };
    if let (Some((a_last, a)), Some((b_last, b))) = (position(first), position(second))
        && a_last == b_last
        && a != b
    {
        return true;
    }
    let negated = |a: &str, b: &str| {
        let mut rest = a;
        while let Some(at) = rest.find(":not(") {
            let inner_start = at + ":not(".len();
            let Some(close) = rest[inner_start..].find(')') else { break };
            let inner = &rest[inner_start..inner_start + close];
            if !inner.is_empty() && b.contains(inner) && !b.contains(&format!(":not({inner})")) {
                return true;
            }
            // `:not(S *)`, outside S, against `S &`, inside it.
            if let Some(ancestor) = inner.strip_suffix(" *")
                && b.contains(&format!("{ancestor} "))
            {
                return true;
            }
            rest = &rest[inner_start + close..];
        }
        false
    };
    negated(first, second) || negated(second, first)
}

/// The array an expression is, through whatever type wrappers it wears.
fn array_of<'a, 'b>(
    expression: &'b mut Expression<'a>,
) -> Option<&'b mut oxc::ast::ast::ArrayExpression<'a>> {
    let mut at = expression;
    loop {
        at = match at {
            Expression::TSAsExpression(cast) => &mut cast.expression,
            Expression::TSSatisfiesExpression(cast) => &mut cast.expression,
            Expression::TSNonNullExpression(cast) => &mut cast.expression,
            Expression::ParenthesizedExpression(inner) => &mut inner.expression,
            Expression::ArrayExpression(array) => return Some(array),
            _ => return None,
        };
    }
}

/// A value that is text without anything having to be emitted for it.
///
/// Deliberately narrow. `text_of` also resolves a binding and a token
/// reference, which is right where the table is already built and wrong while
/// it is being built.
fn literal_text(expression: &Expression<'_>) -> Option<(String, bool)> {
    match without_type_wrappers(expression) {
        Expression::StringLiteral(literal) => Some((literal.value.as_str()?.to_string(), false)),
        other if number_of(other).is_some() => {
            number_of(other).map(|value| (barq_css::atoms::number_text(value), true))
        }
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
            template.quasis.first().and_then(quasi_text).map(|text| (text.to_string(), false))
        }
        _ => None,
    }
}

/// A numeric literal's VALUE, through any sign in front of it.
///
/// The value and not the source text, because the runtime is handed a number
/// and prints it: `1.50` and `0x10` are `1.5` and `16` there. `-4` is a unary
/// expression over a literal rather than a literal, and it is the commonest
/// number a margin takes.
/// A template element's text: the cooked value, or the raw text where an
/// escape left nothing to cook. `None` for an unpaired surrogate, which a Rust
/// `str` cannot hold.
fn quasi_text<'a>(quasi: &TemplateElement<'a>) -> Option<&'a str> {
    match quasi.value.cooked {
        Some(cooked) => cooked.as_str(),
        None => Some(quasi.value.raw.as_str()),
    }
}

fn number_of(expression: &Expression<'_>) -> Option<f64> {
    match without_type_wrappers(expression) {
        Expression::NumericLiteral(literal) => Some(literal.value),
        Expression::UnaryExpression(unary) => match unary.operator {
            UnaryOperator::UnaryNegation => number_of(&unary.argument).map(|value| -value),
            UnaryOperator::UnaryPlus => number_of(&unary.argument),
            _ => None,
        },
        _ => None,
    }
}

fn key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.to_string()),
        PropertyKey::StringLiteral(literal) => literal.value.as_str().map(str::to_string),
        // `{ 50: "#f8fafc" }`, which is how a colour scale is written. The key
        // is the number's text, as `String(50)` is.
        PropertyKey::NumericLiteral(literal) => Some(barq_css::atoms::number_text(literal.value)),
        _ => None,
    }
}

/// The name an export specifier spells, whichever way it is written.
fn export_name(name: &ModuleExportName<'_>) -> Option<String> {
    match name {
        ModuleExportName::IdentifierName(name) => Some(name.name.to_string()),
        ModuleExportName::IdentifierReference(reference) => Some(reference.name.to_string()),
        ModuleExportName::StringLiteral(literal) => literal.value.as_str().map(str::to_string),
    }
}

/// The name a computed member reads: `scale["2xl"]` or `scale[50]`.
fn member_name(expression: &Expression<'_>) -> Option<String> {
    match without_type_wrappers(expression) {
        Expression::StringLiteral(name) => name.value.as_str().map(str::to_string),
        Expression::NumericLiteral(number) => Some(barq_css::atoms::number_text(number.value)),
        _ => None,
    }
}

/// Where a group member sits under a nested group. Not a character a token
/// name is written with, so `theme["a.b"]` and `theme.a.b` stay apart.
const MEMBER_PATH: char = '\u{0}';

fn member_join(prefix: &str, name: &str) -> String {
    if prefix.is_empty() { name.to_string() } else { format!("{prefix}{MEMBER_PATH}{name}") }
}

enum TokenEntry {
    Reference(String),
    Group(Vec<(String, TokenEntry)>),
}

/// Every token as its declaration and its reference. A group's tokens are
/// named by their path, so `{ color: { brand } }` is `--color-brand`.
fn declare_tokens(
    tokens: &[(String, barq_css::atoms::TokenValue)],
    prefix: &str,
    group: &str,
    global: bool,
    declarations: &mut String,
) -> Vec<(String, TokenEntry)> {
    let mut entries = Vec::with_capacity(tokens.len());
    for (token, value) in tokens {
        let path = if prefix.is_empty() { token.clone() } else { format!("{prefix}-{token}") };
        let text = match value {
            barq_css::atoms::TokenValue::Group(inner) => {
                let inner = declare_tokens(inner, &path, group, global, declarations);
                entries.push((token.clone(), TokenEntry::Group(inner)));
                continue;
            }
            barq_css::atoms::TokenValue::Text(text) => text.clone(),
            barq_css::atoms::TokenValue::Number(number) => barq_css::atoms::number_text(*number),
        };
        let property = if global {
            barq_css::atoms::global_property(&path)
        } else {
            barq_css::atoms::token_property(group, &path)
        };
        if !declarations.is_empty() {
            declarations.push(';');
        }
        declarations.push_str(&format!("{property}:{text}"));
        entries.push((token.clone(), TokenEntry::Reference(format!("var({property})"))));
    }
    entries
}

/// The path of every token, which is what `globalVars` keys its rule on.
fn token_paths(
    tokens: &[(String, barq_css::atoms::TokenValue)],
    prefix: &str,
    out: &mut Vec<String>,
) {
    for (token, value) in tokens {
        let path = if prefix.is_empty() { token.clone() } else { format!("{prefix}-{token}") };
        match value {
            barq_css::atoms::TokenValue::Group(inner) => token_paths(inner, &path, out),
            _ => out.push(path),
        }
    }
}

/// A token set's references by member path, which is how a group is read.
fn flatten_tokens(
    entries: Vec<(String, TokenEntry)>,
    prefix: &str,
    out: &mut FxHashMap<String, String>,
) {
    for (token, entry) in entries {
        let path = member_join(prefix, &token);
        match entry {
            TokenEntry::Reference(reference) => {
                out.insert(path, reference);
            }
            TokenEntry::Group(inner) => flatten_tokens(inner, &path, out),
        }
    }
}

/// Neighbouring rules in one cascade layer, as one block.
///
/// A layered atom carries its own `@layer barq.ui{…}`, and a package with a
/// thousand of them writes the wrapper a thousand times: 16 KB of the 110 KB
/// `@barqjs/ui`'s sheet weighed. Concatenating a layer's contents is what the
/// cascade does anyway, and the layer's ORDER is decided by where it is first
/// named, which does not move. `@barqjs/css`'s `collectCss` does the same to
/// what the runtime registers.
fn gather_layers(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let mut open: Option<&str> = None;
    let mut at = 0;

    while at < css.len() {
        let rest = &css[at..];
        let Some(layer) = rest.strip_prefix("@layer ").and_then(|after| {
            after.find('{').and_then(|brace| {
                let name = &after[..brace];
                name.chars()
                    .all(|character| {
                        character.is_alphanumeric() || character == '.' || character == '-'
                    })
                    .then_some(name)
            })
        }) else {
            if open.take().is_some() {
                out.push('}');
            }
            // Past this `@layer`, not back to it: `@layer a, b, c;` is a
            // DECLARATION rather than a block, and looking for the next one
            // from where this one starts finds itself and never moves.
            let from = at + if rest.starts_with("@layer ") { "@layer ".len() } else { 0 };
            let end = css[from..].find("@layer ").map_or(css.len(), |index| from + index);
            out.push_str(&css[at..end]);
            at = end;
            continue;
        };

        let body = at + "@layer ".len() + layer.len() + 1;
        let Some(close) = barq_css::order::matching_brace(css, body) else {
            out.push_str(rest);
            break;
        };

        if open != Some(layer) {
            if open.take().is_some() {
                out.push('}');
            }
            out.push_str("@layer ");
            out.push_str(layer);
            out.push('{');
            open = Some(layer);
        }
        out.push_str(&css[body..close]);
        at = close + 1;
    }

    if open.is_some() {
        out.push('}');
    }
    out
}

/// A declaration as the atoms it is: `barq_css::atoms::resolve`, which is where
/// the runtime's own rules for a shorthand and for a value live.
fn expand_atoms(
    layer: &str,
    property: &str,
    condition: &str,
    value: &str,
) -> Vec<barq_css::atoms::Atom> {
    barq_css::atoms::resolve(layer, property, condition, value)
}

/// What every OTHER import binding names: `symbol -> (specifier, exported name)`.
///
/// Everything except `@barqjs/css` itself, whose names are the tags. A default
/// import is `default` and a namespace import is `*`, spelled the way an
/// integration would have to ask for them.
fn imported_bindings(
    program: &Program<'_>,
    css_source: &str,
) -> FxHashMap<SymbolId, (String, String)> {
    let mut out = FxHashMap::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        let Some(specifier) = declaration.source.value.as_str() else { continue };
        if specifier == css_source {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
        for entry in specifiers {
            let (name, local) = match entry {
                ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                    let name = match &imported.imported {
                        ModuleExportName::IdentifierName(name) => name.name.to_string(),
                        ModuleExportName::StringLiteral(literal) => {
                            let Some(name) = literal.value.as_str() else { continue };
                            name.to_string()
                        }
                        ModuleExportName::IdentifierReference(reference) => {
                            reference.name.to_string()
                        }
                    };
                    (name, &imported.local)
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(imported) => {
                    ("default".to_string(), &imported.local)
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(imported) => {
                    ("*".to_string(), &imported.local)
                }
            };
            if let Some(symbol) = local.symbol_id.get() {
                out.insert(symbol, (specifier.to_string(), name));
            }
        }
    }
    out
}

/// Every binding whose object this module writes into: an assignment or an
/// update through a member of it, a `delete`, or `Object.assign` and its
/// relatives. StyleX's evaluator refuses the same set, for the same reason: the
/// literal is not what a read after the write sees.
fn written_objects(program: &Program<'_>, scoping: &Scoping) -> FxHashSet<SymbolId> {
    use oxc::ast::ast::{MemberExpression, SimpleAssignmentTarget, UnaryExpression};
    use oxc::ast_visit::Visit;

    struct Writes<'s> {
        scoping: &'s Scoping,
        out: FxHashSet<SymbolId>,
    }

    impl Writes<'_> {
        fn root(&mut self, expression: &Expression<'_>) {
            let mut current = without_type_wrappers(expression);
            while let Some(member) = current.as_member_expression() {
                current = without_type_wrappers(member.object());
            }
            if let Some(symbol) = crate::analysis::symbol_of(self.scoping, current) {
                self.out.insert(symbol);
            }
        }

        fn member(&mut self, member: &MemberExpression<'_>) {
            self.root(member.object());
        }
    }

    impl<'a> Visit<'a> for Writes<'_> {
        fn visit_simple_assignment_target(&mut self, target: &SimpleAssignmentTarget<'a>) {
            if let Some(member) = target.as_member_expression() {
                self.member(member);
            }
            oxc::ast_visit::walk::walk_simple_assignment_target(self, target);
        }

        fn visit_unary_expression(&mut self, unary: &UnaryExpression<'a>) {
            if unary.operator == UnaryOperator::Delete
                && let Some(member) = without_type_wrappers(&unary.argument).as_member_expression()
            {
                self.member(member);
            }
            oxc::ast_visit::walk::walk_unary_expression(self, unary);
        }

        fn visit_call_expression(&mut self, call: &oxc::ast::ast::CallExpression<'a>) {
            if let Expression::StaticMemberExpression(callee) = without_type_wrappers(&call.callee)
                && matches!(&callee.object, Expression::Identifier(object) if object.name == "Object")
                && matches!(
                    callee.property.name.as_str(),
                    "assign" | "defineProperty" | "defineProperties" | "setPrototypeOf"
                )
                && let Some(target) = call.arguments.first().and_then(|a| a.as_expression())
            {
                self.root(target);
            }
            oxc::ast_visit::walk::walk_call_expression(self, call);
        }
    }

    let mut writes = Writes { scoping, out: FxHashSet::default() };
    writes.visit_program(program);
    writes.out
}

/// The local symbols `css` / `keyframes` / `globalCss` were imported as.
/// Whether the module calls a binding it imports from somewhere other than
/// the package the way a `layer` binding is called: `ui({ … })`,
/// `ui.create({ … })`, `ui.props(…)` or `ui.dynamic(…)` with a style object in
/// it. Such a module never names the package, and the binding may be one
/// another module made with `layer`, which only the integration can say.
/// Read off the syntax, before the symbol table that would cost.
pub fn calls_through_import(program: &Program<'_>, css_source: &str) -> bool {
    use oxc::ast_visit::Visit;

    struct Calls<'n> {
        imported: FxHashSet<&'n str>,
        found: bool,
    }
    impl<'a> Visit<'a> for Calls<'_> {
        fn visit_call_expression(&mut self, call: &oxc::ast::ast::CallExpression<'a>) {
            if self.found {
                return;
            }
            let (name, member) = match without_type_wrappers(&call.callee) {
                Expression::Identifier(identifier) => (identifier.name.as_str(), None),
                Expression::StaticMemberExpression(member) => match &member.object {
                    Expression::Identifier(identifier) => {
                        (identifier.name.as_str(), Some(member.property.name.as_str()))
                    }
                    _ => ("", None),
                },
                _ => ("", None),
            };
            if self.imported.contains(name) {
                self.found = match member {
                    None | Some("props") | Some("create") => {
                        call.arguments.iter().any(|argument| {
                            argument.as_expression().is_some_and(|expression| {
                                match without_type_wrappers(expression) {
                                    Expression::ObjectExpression(_) => true,
                                    Expression::LogicalExpression(logical) => matches!(
                                        without_type_wrappers(&logical.right),
                                        Expression::ObjectExpression(_)
                                    ),
                                    _ => false,
                                }
                            })
                        })
                    }
                    Some("dynamic") => true,
                    Some(_) => false,
                };
            }
            if !self.found {
                oxc::ast_visit::walk::walk_call_expression(self, call);
            }
        }
    }

    let mut imported = FxHashSet::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() == Some(css_source)
            || declaration.import_kind == oxc::ast::ast::ImportOrExportKind::Type
        {
            continue;
        }
        for specifier in declaration.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(imported_one) = specifier {
                imported.insert(imported_one.local.name.as_str());
            }
        }
    }
    if imported.is_empty() {
        return false;
    }
    let mut calls = Calls { imported, found: false };
    calls.visit_program(program);
    calls.found
}

fn imported_tags(program: &Program<'_>, css_source: &str) -> FxHashMap<SymbolId, Tag> {
    let mut out = FxHashMap::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != Some(css_source) {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(imported) = specifier else { continue };
            let ModuleExportName::IdentifierName(name) = &imported.imported else { continue };
            let (Some(tag), Some(symbol)) =
                (Tag::of(name.name.as_str()), imported.local.symbol_id.get())
            else {
                continue;
            };
            out.insert(symbol, tag);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    const IMPORT: &str = "import { css, keyframes, globalCss } from \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
    }

    fn css_of(body: &str) -> String {
        run(body).css.unwrap_or_default()
    }

    /// The class in the emitted stylesheet, so a test never has to hard-code a
    /// hash that a change to the block would legitimately move.
    fn class(output: &str) -> &str {
        output.split(['.', '{']).nth(1).expect("a class in the output")
    }

    #[test]
    fn a_block_becomes_its_class_and_the_call_is_gone() {
        let output = run("export const card = css`color: red`;");
        let css = output.css.as_deref().expect("a stylesheet");
        assert_eq!(css, format!(".{}{{color: red}}", class(css)));
        assert!(output.code.contains(&format!("\"{}\"", class(css))), "{}", output.code);
        assert!(!output.code.contains("css`"), "the template survived: {}", output.code);
    }

    /// The whole reason the pass runs before `harvest`: a literal class reaches
    /// `fold`, which bakes it into the template rather than binding it.
    #[test]
    fn a_class_on_an_intrinsic_element_is_baked_into_the_template() {
        let output = run(
            "const card = css`color: red`;\nexport function Card() { return <div class={card}>hi</div>; }",
        );
        let class = class(output.css.as_deref().expect("a stylesheet"));
        assert!(
            output.code.contains(&format!("<div class=\"{class}\">hi</div>")),
            "{}",
            output.code
        );
        assert!(!output.code.contains("setClass"), "a class channel survived: {}", output.code);
        assert!(!output.code.contains("bindProp"), "a binding survived: {}", output.code);
    }

    #[test]
    fn nesting_is_flattened_against_the_generated_class() {
        let css = css_of(
            "export const card = css`color: red; &:hover { color: blue } span { color: green }`;",
        );
        let class = class(&css);
        assert_eq!(
            css,
            format!(
                ".{class}{{color: red}}.{class}:hover{{color: blue}}.{class} span{{color: green}}"
            )
        );
    }

    #[test]
    fn a_global_block_leaves_no_statement_behind() {
        let output = run("globalCss`body { margin: 0 }`;\nexport const x = 1;");
        assert_eq!(output.css.as_deref(), Some("body{margin: 0}"));
        // The import specifier stays; the CALL does not. An unused named import
        // is the bundler's to drop, and removing one here would be this pass
        // reasoning about side effects it cannot see.
        assert!(!output.code.contains("globalCss`"), "the call survived: {}", output.code);
        assert!(output.code.contains("export const x = 1"), "{}", output.code);
    }

    #[test]
    fn keyframes_takes_a_generated_name() {
        let output =
            run("export const spin = keyframes`from { rotate: 0deg } to { rotate: 360deg }`;");
        let css = output.css.as_deref().expect("a stylesheet");
        let name = css
            .strip_prefix("@keyframes ")
            .and_then(|rest| rest.split('{').next())
            .expect("a name");
        assert_eq!(css, format!("@keyframes {name}{{from{{rotate: 0deg}}to{{rotate: 360deg}}}}"));
        assert!(output.code.contains(&format!("\"{name}\"")), "{}", output.code);
    }

    /// Resolution is by `SymbolId`, so the check is not "is it spelled `css`".
    #[test]
    fn a_css_that_came_from_somewhere_else_is_not_this_css() {
        let output = compile(
            "const css = (s) => s.raw[0];\nexport const card = css`color: red`;",
            &ResolvedOptions::with_filename("s.tsx"),
        )
        .expect("compiles");
        assert_eq!(output.css, None);
        assert!(output.code.contains("css`color: red`"), "{}", output.code);
    }

    #[test]
    fn and_a_renamed_import_still_is() {
        let output = compile(
            "import { css as style } from \"@barqjs/css\";\nexport const card = style`color: red`;",
            &ResolvedOptions::with_filename("s.tsx"),
        )
        .expect("compiles");
        assert!(output.css.is_some());
        assert!(!output.code.contains("style`"), "{}", output.code);
    }

    #[test]
    fn a_literal_interpolation_folds() {
        let css =
            css_of("const GAP = \"8px\";\nexport const card = css`gap: ${GAP}; padding: ${8}px`;");
        assert_eq!(css, format!(".{}{{gap: 8px;padding: 8px}}", class(&css)));
    }

    /// What makes composition work: the pass records each class as it generates
    /// it, so a later block can name an earlier one.
    #[test]
    fn one_block_can_name_another_by_its_binding() {
        let css = css_of(
            "const button = css`color: red`;\nexport const panel = css`.${button} & { color: blue }`;",
        );
        let first = class(&css);
        assert!(css.starts_with(&format!(".{first}{{color: red}}")), "{css}");
        assert!(
            css.contains(&format!(".{first} .")),
            "the second block did not name the first: {css}"
        );
    }

    #[test]
    fn the_same_block_written_twice_is_emitted_once() {
        let css = css_of("export const a = css`color: red`;\nexport const b = css`color: red`;");
        let class = class(&css);
        assert_eq!(css, format!(".{class}{{color: red}}"));
    }

    #[test]
    fn an_unfoldable_interpolation_leaves_the_call_to_the_runtime() {
        let output = run("export const card = (bg) => css`background: ${bg}`;");
        assert_eq!(output.css, None);
        assert!(output.code.contains("css`background: ${bg}`"), "{}", output.code);
        let report = output.warnings.iter().find(|w| w.code == Some(crate::diag::Code::Barq015));
        assert!(report.is_some(), "{:?}", output.warnings);
    }

    #[test]
    fn css_that_cannot_compile_is_an_error_and_the_call_stays() {
        let output = run("export const card = css`$brand: red; color: $brand`;");
        assert_eq!(output.css, None);
        let report = output
            .warnings
            .iter()
            .find(|warning| warning.code == Some(crate::diag::Code::Barq014))
            .expect("BARQ014");
        assert!(report.message.contains("Sass variable"), "{}", report.message);
    }

    #[test]
    fn a_brace_that_closes_nothing_is_reported_and_no_rule_is_lost() {
        let output = run("export const card = css`color: red } span { color: blue }`;");
        assert_eq!(output.css, None);
        assert!(
            output.warnings.iter().any(|warning| warning.code == Some(crate::diag::Code::Barq014)),
            "{:?}",
            output.warnings
        );
    }

    /// A stylesheet lives in a `.ts` module with no JSX in it, which is outside
    /// the gate every other analysis in this compiler runs behind.
    #[test]
    fn a_module_with_no_jsx_is_compiled_too() {
        let output = compile(
            &format!("{IMPORT}export const card = css`color: red`;"),
            &ResolvedOptions::with_filename("styles.ts"),
        )
        .expect("compiles");
        assert!(output.css.is_some(), "a .ts stylesheet was skipped");
    }

    #[test]
    fn dev_names_the_class_after_its_binding() {
        let output = compile(
            &format!("{IMPORT}export const cardStyle = css`color: red`;"),
            &ResolvedOptions { dev: true, ..ResolvedOptions::with_filename("s.tsx") },
        )
        .expect("compiles");
        let css = output.css.as_deref().expect("a stylesheet");
        assert!(css.starts_with(".cardStyle_"), "{css}");
    }

    #[test]
    fn and_production_does_not() {
        let css = css_of("export const cardStyle = css`color: red`;");
        assert!(!css.contains("cardStyle"), "{css}");
    }

    #[test]
    fn a_module_that_never_imports_the_package_is_untouched() {
        let output =
            compile("export const card = \"plain\";", &ResolvedOptions::with_filename("s.tsx"))
                .expect("compiles");
        assert_eq!(output.css, None);
    }
}

#[cfg(test)]
mod atom_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    const IMPORT: &str = "import { atoms, create, globalCss, layer } from \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
    }

    /// A selector with `&` in the middle is a condition, not a property.
    /// `@barqjs/ui`'s badge lights up on hover only when it is an anchor, and
    /// reading `a&:hover` as a property put the whole block on the floor.
    #[test]
    fn a_selector_with_an_ampersand_in_the_middle_is_a_condition() {
        let out = run("export const a = atoms({ backgroundColor: { \"a&:hover\": \"red\" } });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains(":hover{background-color:red}"), "{css}");
        assert!(css.starts_with("a."), "{css}");
    }

    /// `@layer a, b, c;` is a declaration, not a block. Gathering used to look
    /// for the next `@layer` from where this one STARTS, find itself, and never
    /// move — the build hung rather than failing.
    #[test]
    fn a_layer_declaration_is_passed_through_rather_than_gathered() {
        let out = run(
            "globalCss`@layer barq.reset, barq.ui;`;\n             const ui = layer(\"barq.ui\");\n             export const a = ui({ color: \"red\" });",
        );
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("@layer barq.reset, barq.ui;"), "{css}");
        assert!(css.contains("@layer barq.ui{"), "{css}");
    }

    /// A tier is NOT a cascade layer and must not become one. It is a
    /// tie-breaker on top of specificity, and a layer overrides specificity
    /// outright: measured in a browser, one sub-layer per tier moved 289
    /// computed values on `@barqjs/ui`'s gallery, because a parent's
    /// `[data-variant="destructive"] &` at 0-2-0 stopped beating the child's
    /// own 0-1-0. Tier order is carried by the ORDER of the rules, and
    /// `barq_css::order` makes that order global over the bundle.
    #[test]
    fn a_tier_is_an_order_and_never_a_sub_layer() {
        let out = run("const ui = layer(\"barq.ui\");\n\
             export const a = ui({ color: { default: \"red\", \":hover\": \"blue\", \
             \"@media print\": \"green\" }, \"& > *\": { color: \"grey\" } });");
        let css = out.css.as_deref().unwrap_or_default();
        assert_eq!(css.matches("@layer ").count(), 1, "{css}");
        for tier in ["descendant", "base", "select", "element", "media"] {
            assert!(!css.contains(&format!("barq.ui.{tier}")), "{tier}: {css}");
        }
        // And within the call, the tier still decides the order.
        let media = css.find("color:green").expect("the media rule");
        assert!(css.find("color:grey").expect("the descendant rule") < media, "{css}");
        assert!(css.find("color:red").expect("the base rule") < media, "{css}");
    }

    /// An UNLAYERED atom keeps no layer at all. A layered rule loses to an
    /// unlayered one whatever its specificity, so wrapping these would put an
    /// application's own `* { margin: 0 }` above every margin on the page —
    /// measured in a browser, and it is why `atoms` is unlayered.
    #[test]
    fn an_unlayered_atom_is_not_given_a_layer() {
        let out =
            run("export const a = atoms({ color: \"red\", \"@media print\": { color: \"b\" } });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(!css.contains("@layer"), "{css}");
    }

    /// A call through `const ui = layer("barq.ui")` folds like `atoms`, and its
    /// rules land in the layer the binding names. Without this the whole of
    /// `@barqjs/ui` stayed on the runtime and its CSS travelled inside the JS
    /// bundle instead of in a stylesheet.
    #[test]
    fn a_call_through_a_layer_binding_folds_into_that_layer() {
        let out = run(
            "const ui = layer(\"barq.ui\");\n             export const a = ui({ color: \"red\", paddingTop: 8 });",
        );
        assert!(!out.code.contains("ui({"), "the call survived: {}", out.code);
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.starts_with("@layer barq.ui{"), "{css}");
        assert!(css.contains("color:red"), "{css}");
        assert!(css.contains("padding-top:8px"), "{css}");
        // One block, not one per atom.
        assert_eq!(css.matches("@layer barq.ui{").count(), 1, "{css}");
        // The binding stays: a sibling call this pass declines still makes it.
        assert!(out.code.contains("layer(\"barq.ui\")"), "{}", out.code);
    }

    /// A binding assigned again holds whichever layer was written last when a
    /// call runs, so nothing is folded through it.
    #[test]
    fn a_layer_binding_assigned_again_is_not_one() {
        let out = run(
            "let ui = layer(\"x\");\nui = layer(\"y\");\nexport const a = ui({ color: \"red\" });",
        );
        assert!(out.code.contains("ui({"), "{}", out.code);
        assert_eq!(out.css, None);
    }

    /// The layer has to be a literal in THIS module, which is what keeps the
    /// pass per-file. A binding built from anything else is not one.
    #[test]
    fn a_layer_binding_the_compiler_cannot_read_is_not_one() {
        let out = run(
            "declare const name: string;\n             const ui = layer(name);\n             export const a = ui({ color: \"red\" });",
        );
        assert!(out.code.contains("ui({"), "{}", out.code);
        assert_eq!(out.css, None);
    }

    /// `ui.create` is `create` in a layer, so a treatment shared across a
    /// package is written once and its rules land where the package's do.
    #[test]
    fn a_layer_create_puts_its_groups_in_the_layer() {
        let out = run("const ui = layer(\"barq.ui\");\n\
             export const shared = ui.create({ ring: { outlineWidth: \"3px\" } });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.starts_with("@layer barq.ui{"), "{css}");
        assert!(css.contains("outline-width:3px"), "{css}");
        assert!(out.code.contains("ring:"), "{}", out.code);
        assert!(!out.code.contains("ui.create("), "the call survived: {}", out.code);
        // And the classes differ from the unlayered ones, because the layer is
        // part of an atom's identity.
        let plain = run("export const shared = create({ ring: { outlineWidth: \"3px\" } });");
        assert_ne!(out.code, plain.code);
    }

    /// A declined call keeps the conditionals it was declined for.
    ///
    /// The test of a `cond && { … }` was moved out of the AST while the
    /// arguments were being read, before the pass knew whether it would fold.
    /// BARQ016 declines two conditionals BY DESIGN, so every such call was left
    /// with `null && { … }` twice: two conditionals switched permanently off,
    /// and the runtime had no way to know.
    #[test]
    fn two_conditionals_keep_the_tests_they_are_declined_with() {
        let out = run(
            "declare const a: boolean;\n             declare const b: boolean;\n             export const cls = atoms({ color: \"red\" }, a && { color: \"blue\" }, b && { color: \"green\" });",
        );
        assert!(out.code.contains("a && {"), "{}", out.code);
        assert!(out.code.contains("b && {"), "{}", out.code);
        assert!(!out.code.contains("null &&"), "{}", out.code);
    }

    /// An argument this pass cannot read no longer takes its neighbours with it.
    ///
    /// It used to: one imported group in the call and the whole thing stayed on
    /// the runtime, which registers its rules from the JS bundle at import
    /// time. That is the module's entire stylesheet travelling as JavaScript,
    /// and it is what a group shared across a package would have cost.
    #[test]
    fn an_opaque_argument_still_lets_its_neighbours_fold() {
        let out = run(
            "import { shared } from \"./shared.ts\";\n             export const cls = atoms(shared.ring, { color: \"red\", display: \"flex\" });",
        );
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("color:red"), "{css}");
        assert!(css.contains("display:flex"), "{css}");
        // The opaque argument is still first, so the literal still wins.
        assert!(out.code.contains("atoms(shared.ring, \"a-color"), "{}", out.code);
    }

    /// And the conditional in such a call is still a ternary over two strings.
    #[test]
    fn an_opaque_argument_leaves_a_conditional_as_a_ternary() {
        let out = run(
            "import { shared } from \"./shared.ts\";\n             declare const a: boolean;\n             export const cls = atoms(shared.ring, { color: \"red\" }, a && { color: \"blue\" });",
        );
        assert!(out.code.contains("atoms(shared.ring, a ? \""), "{}", out.code);
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("color:red"), "{css}");
        assert!(css.contains("color:blue"), "{css}");
    }

    /// `null` REMOVES what an earlier argument applied, and what an opaque one
    /// applied is not knowable here. Folding it alone would drop the removal in
    /// silence, so the call stays whole.
    #[test]
    fn a_removal_after_an_opaque_argument_leaves_the_call_whole() {
        let out = run(
            "import { shared } from \"./shared.ts\";\n             export const cls = atoms(shared.ring, { color: null });",
        );
        assert!(out.code.contains("{ color: null }"), "{}", out.code);
        assert_eq!(out.css, None);
    }

    /// A `const` holding a class string is one of ours: every folded call above
    /// it became exactly that.
    #[test]
    fn a_const_holding_a_class_string_folds_like_the_call_that_made_it() {
        let out = run(
            "declare const a: boolean;\n             const base = atoms({ color: \"red\" });\n             const loud = atoms({ color: \"blue\" });\n             export const cls = atoms(base, a && loud);",
        );
        assert!(out.code.contains("a ? \"a-color_10cd4ul\" : \"a-color_i0tgik\""), "{}", out.code);
    }

    /// A class that is not an atom is carried through, not dropped.
    ///
    /// `known` keyed every class on the slice before its last `_` and threw
    /// away anything with no `_` in it — so `atoms("my-button", { … })`
    /// compiled to the atoms alone while the runtime kept both, and a component
    /// handed a caller's class lost it on the way through the build.
    #[test]
    fn a_class_that_is_not_an_atom_survives_the_merge() {
        let out = run("export const a = atoms(\"my-button\", { color: \"red\" });");
        assert!(out.code.contains("\"my-button a-color_i0tgik\""), "{}", out.code);
    }

    /// The class the runtime produces for the same declaration, pinned in
    /// `barq_css::atoms`'s own parity test from the other side.
    #[test]
    fn a_static_call_becomes_the_class_string_it_produces() {
        let out = run("export const a = atoms({ color: \"red\", paddingTop: 8 });");
        assert!(
            out.code.contains("export const a = \"a-color_i0tgik a-padding-top_1dzhg7\""),
            "{}",
            out.code
        );
        assert_eq!(
            out.css.as_deref(),
            Some(".a-color_i0tgik{color:red}.a-padding-top_1dzhg7{padding-top:8px}")
        );
        assert!(!out.code.contains("atoms({"), "the call survived: {}", out.code);
    }

    /// The whole point of atoms: the LAST argument wins per property, and the
    /// rule the first one would have written is not in the sheet at all.
    #[test]
    fn a_later_argument_replaces_an_earlier_one_and_leaves_no_dead_rule() {
        let out = run("export const b = atoms({ margin: 0 }, { marginTop: 4 });");
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains("margin-top:4px"), "{css}");
        assert!(!css.contains("margin-top:0"), "the replaced rule survived: {css}");
        assert!(css.contains("margin-right:0"), "the other sides were dropped: {css}");
    }

    #[test]
    fn one_conditional_argument_becomes_a_ternary_of_two_literals() {
        let out =
            run("export const c = (on) => atoms({ color: \"red\" }, on && { color: \"blue\" });");
        assert!(out.code.contains("on ? \"a-color_10cd4ul\" : \"a-color_i0tgik\""), "{}", out.code);
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains("color:red") && css.contains("color:blue"), "{css}");
    }

    fn whole_shorthand(out: &crate::compile::CompileOutput) -> Vec<&str> {
        out.warnings
            .iter()
            .filter(|w| w.code == Some(crate::diag::Code::Barq032))
            .map(|w| w.message.as_str())
            .collect()
    }

    #[test]
    fn a_shorthand_kept_whole_beside_its_longhand_is_reported_either_way_round() {
        for source in [
            "export const c = atoms({ border: \"1px solid red\" }, { borderColor: \"blue\" });",
            "export const c = atoms({ borderColor: \"blue\", border: \"1px solid red\" });",
            "export const c = (on) => atoms({ transition: \"all 1s\" }, on && { transitionDuration: \"2s\" });",
        ] {
            let out = run(source);
            let found = whole_shorthand(&out);
            assert_eq!(found.len(), 1, "{source}: {:?}", out.warnings);
        }
        let out = run("export const c = atoms({ border: \"0\" }, { borderColor: \"blue\" });");
        assert!(
            whole_shorthand(&out)[0].starts_with("`border` and `border-top-color` are merged here"),
            "{:?}",
            out.warnings
        );
    }

    #[test]
    fn a_shorthand_that_expands_and_one_under_another_condition_are_not() {
        for source in [
            // `margin` is split by counting, so the longhand replaces a side.
            "export const c = atoms({ margin: 4 }, { marginTop: 8 });",
            // Hover has its own key and its own specificity.
            "export const c = atoms({ border: \"0\", borderColor: { default: null, \":hover\": \"blue\" } });",
            "export const c = atoms({ border: \"0\", color: \"blue\" });",
            "export const c = atoms({ borderColor: \"blue\", borderWidth: 1 });",
            // Named alike, and no part of the shorthand.
            "export const c = atoms({ flex: 1, flexDirection: \"column\" });",
            "export const c = atoms({ outline: \"1px solid red\", outlineOffset: 2 });",
            "export const c = atoms({ border: \"0\", borderRadius: 4 });",
        ] {
            let out = run(source);
            assert!(whole_shorthand(&out).is_empty(), "{source}: {:?}", out.warnings);
        }
    }

    fn condition_order(out: &crate::compile::CompileOutput) -> Vec<&str> {
        out.warnings
            .iter()
            .filter(|w| w.code == Some(crate::diag::Code::Barq033))
            .map(|w| w.message.as_str())
            .collect()
    }

    #[test]
    fn two_conditions_written_against_the_fixed_order_are_reported() {
        for source in [
            "export const c = atoms({ color: { \":active\": \"red\", \":hover\": \"blue\" } });",
            "export const c = atoms({ color: { \":disabled\": \"grey\", \"[data-active]\": \"red\" } });",
            "export const c = atoms({ color: { \":hover\": \"blue\", \"[data-active]\": \"red\" } });",
        ] {
            let out = run(source);
            assert_eq!(condition_order(&out).len(), 1, "{source}: {:?}", out.warnings);
        }
    }

    /// A third condition that is both at once, and weighs more, decides the
    /// overlap whatever order the two are in.
    #[test]
    fn a_pair_the_call_settles_with_their_conjunction_is_not_reported() {
        let settled = run(
            "export const c = atoms({ color: { \":is(.dark *)\": \"gray\", \"[data-selected]\": \"black\", \":is(.dark *)[data-selected]\": \"black\" } });",
        );
        assert!(condition_order(&settled).is_empty(), "{:?}", settled.warnings);
        let open = run(
            "export const c = atoms({ color: { \":is(.dark *)\": \"gray\", \"[data-selected]\": \"black\" } });",
        );
        assert_eq!(condition_order(&open).len(), 1, "{:?}", open.warnings);
    }

    /// And the same where one of the two is an ancestor's condition.
    #[test]
    fn a_pair_settled_across_an_ancestor_is_not_reported() {
        let source = "export const c = atoms({ backgroundColor: { \":is(.dark *)[data-selected]\": \"gray\", \"[data-a][data-b] &\": \"none\", \"[data-a][data-b] &:is(.dark *)[data-selected]\": \"none\" } });";
        let settled = run(source);
        assert!(condition_order(&settled).is_empty(), "{:?}", settled.warnings);
        let open =
            run(&source
                .replace(", \"[data-a][data-b] &:is(.dark *)[data-selected]\": \"none\"", ""));
        assert_eq!(condition_order(&open).len(), 1, "{:?}", open.warnings);
    }

    /// Every pair, so fixing the first does not uncover the next.
    #[test]
    fn every_reversed_pair_in_one_object_is_reported() {
        let out = run(
            "export const c = atoms({ color: { \":hover\": \"blue\", \"[data-active]\": \"red\" }, backgroundColor: { \":active\": \"red\", \":hover\": \"blue\" } });",
        );
        assert_eq!(condition_order(&out).len(), 2, "{:?}", out.warnings);
    }

    /// Two ranges of one feature that do not meet never both match, in either
    /// spelling and across units that convert; a pair this cannot read is
    /// still reported.
    #[test]
    fn complementary_media_ranges_are_exclusive() {
        for source in [
            "export const c = atoms({ width: { \"@media (width < 600px)\": 2, \"@media (width >= 600px)\": 1 } });",
            "export const c = atoms({ width: { \"@media (max-width: 599px)\": 2, \"@media (min-width: 600px)\": 1 } });",
            "export const c = atoms({ width: { \"@media (width < 40rem)\": 2, \"@media (width >= 640px)\": 1 } });",
        ] {
            let out = run(source);
            assert!(condition_order(&out).is_empty(), "{source}: {:?}", out.warnings);
        }
        for source in [
            // They meet at 600px.
            "export const c = atoms({ width: { \"@media (width <= 600px)\": 2, \"@media (width >= 600px)\": 1 } });",
            // A unit with no fixed size in pixels.
            "export const c = atoms({ width: { \"@media (width < 40ch)\": 2, \"@media (width >= 640px)\": 1 } });",
        ] {
            let out = run(source);
            assert_eq!(condition_order(&out).len(), 1, "{source}: {:?}", out.warnings);
        }
    }

    #[test]
    fn two_conditions_that_cannot_reverse_are_not() {
        for source in [
            // In the fixed order already.
            "export const c = atoms({ color: { \":hover\": \"blue\", \":active\": \"red\" } });",
            // Ruled out by how they are written.
            "export const c = atoms({ color: { \"[data-state='open']\": \"a\", \"[data-state=closed]\": \"b\" } });",
            "export const c = atoms({ color: { \"[data-motion^='to-']\": \"a\", \"[data-motion^='from-']\": \"b\" } });",
            "export const c = atoms({ color: { \":nth-child(2)\": \"a\", \":first-child\": \"b\" } });",
            "export const c = atoms({ color: { \"[data-x]\": \"a\", \":not([data-x])\": \"b\" } });",
            // Specificity decides, not order.
            "export const c = atoms({ color: { \"[data-a][data-b]\": \"a\", \"[data-c]\": \"b\" } });",
            // One value, so nothing changes whichever wins.
            "export const c = atoms({ color: { \":hover\": \"red\", \"[data-active]\": \"red\" } });",
            // Two pseudo-elements are two subjects.
            "export const c = atoms({ \"::before\": { color: \"red\" }, \"::after\": { color: \"blue\" } });",
        ] {
            let out = run(source);
            assert!(condition_order(&out).is_empty(), "{source}: {:?}", out.warnings);
        }
    }

    /// Two is four outcomes and three is eight; a nested ternary over eight
    /// class strings is larger than the runtime it replaces.
    #[test]
    fn a_second_conditional_argument_stays_on_the_runtime_and_says_so() {
        let out = run(
            "export const d = (x, y) => atoms({ color: \"red\" }, x && { color: \"blue\" }, y && { color: \"green\" });",
        );
        assert_eq!(out.css, None);
        assert!(out.code.contains("atoms("), "{}", out.code);
        assert!(
            out.warnings.iter().any(|w| w.code == Some(crate::diag::Code::Barq016)),
            "{:?}",
            out.warnings
        );
    }

    #[test]
    fn a_condition_gets_its_own_key_so_it_replaces_nothing() {
        let out =
            run("export const e = atoms({ color: { default: \"red\", \":hover\": \"blue\" } });");
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains(".a-color-doumed_10cd4ul:hover{color:blue}"), "{css}");
        assert!(!css.contains("@layer"), "atoms must not be layered: {css}");
        assert_eq!(out.code.matches("a-color").count(), 2, "{}", out.code);
    }

    /// StyleX's shape, which is the same merge over names instead of objects.
    #[test]
    fn create_becomes_an_object_of_class_strings_and_its_groups_compose() {
        let out = run(
            "const s = create({ root: { width: \"100%\" }, child: { marginBlock: \"1rem\" } });\n\
             export const f = atoms(s.root, s.child);",
        );
        assert!(out.code.contains("root: \"a-width_d7e8u3\""), "{}", out.code);
        assert!(
            out.code.contains("export const f = \"a-width_d7e8u3 a-margin-block-start_"),
            "{}",
            out.code
        );
        assert!(!out.code.contains("create("), "the call survived: {}", out.code);
        // A logical shorthand expands like a physical one.
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains("margin-block-start:1rem") && css.contains("margin-block-end:1rem"));
    }

    #[test]
    fn a_group_can_be_the_conditional_argument() {
        let out = run(
            "const c = create({ red: { backgroundColor: \"red\" }, green: { backgroundColor: \"lightgreen\" } });\n\
             export const g = (on) => atoms(c.red, on && c.green);",
        );
        assert!(out.code.contains(" ? \"a-background-color_"), "{}", out.code);
        // One class either way: both groups set the same property.
        assert_eq!(out.code.matches("a-background-color_").count(), 4, "{}", out.code);
    }

    #[test]
    fn a_value_the_compiler_cannot_know_leaves_the_call_alone() {
        let out = run("export const h = (c) => atoms({ color: c });");
        assert_eq!(out.css, None);
        assert!(out.code.contains("atoms({ color: c })"), "{}", out.code);
    }

    #[test]
    fn an_atoms_that_came_from_somewhere_else_is_not_this_one() {
        let out = compile(
            "const atoms = (x) => x;\nexport const i = atoms({ color: \"red\" });",
            &ResolvedOptions::with_filename("s.tsx"),
        )
        .expect("compiles");
        assert_eq!(out.css, None);
    }
}

#[cfg(test)]
mod decline_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::diag::{Code, Level};
    use crate::options::{ResolvedOptions, TransformOptions};

    const IMPORT: &str = "import { atoms, create, createTheme, defineVars, dynamic, \
                          firstThatWorks, globalCss, layer, props } from \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
    }

    /// A `props` call left merging only what this pass folded calls
    /// `mergeStyles`, so the module does not reach `props`' object walk.
    #[test]
    fn a_props_call_left_merging_imports_merge_styles() {
        let out = run("const t = dynamic((c) => ({ color: c }));\n\
             export const a = (c, on) => props({ padding: 1 }, on && { margin: 2 }, t(c));");
        assert!(out.code.contains("_$mergeStyles(on ? \"a-padding"), "{}", out.code);
        assert!(
            out.code.contains("mergeStyles as _$mergeStyles } from \"@barqjs/css\""),
            "{}",
            out.code
        );
        for body in [
            "const t = dynamic((c) => ({ color: c }));\nexport const a = (c, x) => props(x, t(c));",
            "let t = dynamic((c) => ({ color: c }));\nexport const a = (c) => props(t(c));",
            "const t = dynamic((c) => ({ color: c, ...c }));\nexport const a = (c) => props(t(c));",
        ] {
            let kept = run(body);
            assert!(!kept.code.contains("mergeStyles"), "{}", kept.code);
        }
    }

    /// The binding is left standing for a call through it this pass declines,
    /// and a bundler can drop it, and the runtime behind it, once none is left.
    #[test]
    fn a_layer_binding_is_pure() {
        let out = run("const ui = layer(\"ui\");\nexport const a = ui({ color: \"red\" });");
        assert!(out.code.contains("/* @__PURE__ */ layer("), "{}", out.code);
    }

    /// A body this declines is the runtime's to evaluate, so it has to reach
    /// the runtime as it was written. Its values used to be moved out one
    /// property at a time, so a condition key after a plain one left
    /// `color: null` behind and the runtime styled nothing.
    #[test]
    fn a_dynamic_body_it_declines_reaches_the_runtime_as_written() {
        for body in [
            "export const a = dynamic((c, h) => ({ color: c, \":hover\": h }));",
            "export const a = dynamic((c) => ({ color: c, ...rest }));",
            "export const a = dynamic((c) => ({ color: c, backgroundColor: { default: c, \":hover\": [c] } }));",
            "export const a = dynamic((c) => ({ color: c, width: firstThatWorks(c, \"1px\") }));",
            "const ui = layer(\"ui\");\nexport const a = ui.dynamic((c, h) => ({ color: c, [h]: c }));",
            "const ui = layer(\"ui\");\nexport const a = ui.dynamic((c) => ({ color: c, \":hover\": { ...c } }));",
        ] {
            let out = run(body);
            assert!(codes(&out).contains(&"BARQ017"), "{body}\n{}", out.code);
            assert!(out.code.contains("color: c,"), "{}", out.code);
            assert!(!out.code.contains("null"), "{}", out.code);
            assert_eq!(out.css, None, "{body}");
        }
    }

    /// The rules a module emitted, as a set: two orderings of the same source
    /// emit the same rules where the walk reaches each call.
    fn rules(out: &CompileOutput) -> Vec<String> {
        let mut all: Vec<String> = out
            .css
            .as_deref()
            .unwrap_or_default()
            .split_inclusive('}')
            .map(str::to_string)
            .collect();
        all.sort_unstable();
        all
    }

    fn codes(out: &CompileOutput) -> Vec<&'static str> {
        out.warnings.iter().filter_map(|warning| warning.code).map(Code::as_str).collect()
    }

    /// Seven ways to decline and two of them reported, which is why a build had
    /// no way to know whether it was paying for `@barqjs/css`'s object walk.
    /// Every one of these leaves a style OBJECT for the runtime.
    #[test]
    fn every_way_a_style_object_reaches_the_runtime_says_so() {
        let cases = [
            ("an unreadable value", "export const a = atoms({ color: theme.brand });"),
            (
                "a layer that is not a literal",
                "const ui = layer(LAYER);\nexport const a = ui({ color: \"red\" });",
            ),
            (
                "a layer group whose layer is not a literal",
                "const ui = layer(LAYER);\nexport const a = ui.create({ x: { color: \"red\" } });",
            ),
            (
                "a dynamic group whose layer is not a literal",
                "const ui = layer(LAYER);\nexport const a = ui.dynamic((c) => ({ color: c }));",
            ),
            (
                "a layer binding assigned again",
                "let ui = layer(\"x\");\nui = layer(\"y\");\nexport const a = ui({ color: \"red\" });",
            ),
            (
                "a layer group that will not read",
                "const ui = layer(\"ui\");\nexport const a = ui.create({ x: { color: theme.brand } });",
            ),
            ("a spread", "export const a = atoms(...rest);"),
            (
                "a group that will not read",
                "export const a = create({ x: { color: theme.brand } });",
            ),
            ("a token that will not read", "export const a = defineVars({ brand: pick() });"),
            ("a dynamic body that is not a literal", "export const a = dynamic((c) => build(c));"),
            (
                "createTheme over an imported token set",
                "import { theme } from \"./t.ts\";\nexport const a = createTheme(theme, { brand: \"#fff\" });",
            ),
            (
                "a removal after an opaque argument",
                "export const a = atoms(other, { color: null });",
            ),
        ];
        for (what, body) in cases {
            assert!(codes(&run(body)).contains(&"BARQ017"), "{what}: {body}");
        }
    }

    /// A module-level `const` is a fact about the MODULE, not about the line it
    /// is on. The fold table used to be filled by the same walk that reads it,
    /// so this compiled to nothing and the same two lines the other way round
    /// compiled away.
    #[test]
    fn a_module_constant_folds_wherever_in_the_file_it_is_written() {
        let below =
            run("export function Card() { return <div class={atoms({ color: BRAND })} />; }\n\
             const BRAND = \"#3b82f6\";");
        let above = run("const BRAND = \"#3b82f6\";\n\
             export function Card() { return <div class={atoms({ color: BRAND })} />; }");
        assert_eq!(below.css, above.css, "{}", below.code);
        assert!(below.css.as_deref().unwrap_or_default().contains("color:#3b82f6"));
        assert!(codes(&below).is_empty(), "{:?}", codes(&below));
    }

    /// A chain, and a number. `shared-box.ts` spells a five-`var()` box-shadow
    /// out in three files because naming it looked like it would take the file
    /// to the runtime.
    #[test]
    fn a_constant_naming_another_constant_folds_and_so_does_a_number() {
        let out = run("const SHADOW = \"var(--a), var(--b)\";\n\
             const SAME = SHADOW;\n\
             const GAP = 8;\n\
             export const a = atoms({ boxShadow: SAME, padding: GAP });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("box-shadow:var(--a), var(--b)"), "{css}");
        assert!(css.contains("padding-top:8px"), "{css}");
        assert!(codes(&out).is_empty(), "{:?}", codes(&out));
    }

    /// A group and a token set are values too, so a component written above the
    /// `const` that declares one reads it as legitimately as one written below.
    /// Named in the seed and emitted where the walk reaches them: seeding by
    /// EMITTING would put a group's rules ahead of rules from calls written
    /// above it, and order is what decides between two atoms of one tier.
    #[test]
    fn a_group_and_a_token_set_are_known_before_the_walk_reaches_them() {
        let below = run(
            "export function Card() { return <div class={atoms(g.r, { color: t.brand })} />; }\n\
             const g = create({ r: { padding: 8 } });\n\
             const t = defineVars({ brand: \"#3b82f6\" });",
        );
        let above = run("const g = create({ r: { padding: 8 } });\n\
             const t = defineVars({ brand: \"#3b82f6\" });\n\
             export function Card() { return <div class={atoms(g.r, { color: t.brand })} />; }");
        assert!(!below.code.contains("atoms("), "the call survived: {}", below.code);
        assert!(
            below.css.as_deref().unwrap_or_default().contains("color:var(--brand-"),
            "{:?}",
            below.css
        );
        assert!(codes(&below).is_empty(), "{:?}", codes(&below));
        // The same rules either way. Only the ORDER differs, because each is
        // emitted where the walk reaches its call — which is the point of
        // naming in the seed and emitting in the walk.
        assert_eq!(rules(&below), rules(&above));
    }

    /// And a group written through a layer binding, both declared below the
    /// call that reads the group.
    #[test]
    fn a_layer_group_is_known_before_the_walk_reaches_it() {
        let below =
            run("export function Card() { return <div class={ui(g.r, { color: \"red\" })} />; }\n\
             const ui = layer(\"ui\");\n\
             const g = ui.create({ r: { padding: 8 } });");
        assert!(!below.code.contains("ui(g.r"), "the call survived: {}", below.code);
        assert!(codes(&below).is_empty(), "{:?}", codes(&below));
        assert!(
            below.css.as_deref().unwrap_or_default().starts_with("@layer ui{"),
            "{:?}",
            below.css
        );
    }

    /// And a theme over a token set declared below it.
    #[test]
    fn a_theme_reads_a_token_set_written_after_it() {
        let below = run("export const dark = createTheme(t, { brand: \"#60a5fa\" });\n\
             const t = defineVars({ brand: \"#3b82f6\" });");
        let above = run("const t = defineVars({ brand: \"#3b82f6\" });\n\
             export const dark = createTheme(t, { brand: \"#60a5fa\" });");
        assert!(!below.code.contains("createTheme("), "{}", below.code);
        assert!(codes(&below).is_empty(), "{:?}", codes(&below));
        assert!(below.code.contains("\"r"), "the theme did not become a class: {}", below.code);
        // The rules are the same set; only the order they were emitted in can
        // differ, because the walk emits where it reaches them.
        assert_eq!(rules(&below), rules(&above));
    }

    /// The layer resolves through the same table an interpolation does, so only
    /// an IMPORTED name is one this pass cannot read. It used to demand a
    /// string literal at the call site.
    #[test]
    fn a_layer_named_by_a_module_constant_folds() {
        let named = run("const LAYER = \"barq.ui\";\n\
             const ui = layer(LAYER);\n\
             export const a = ui({ color: \"red\" });\n\
             export const b = ui({ padding: 8 });");
        let literal = run("const ui = layer(\"barq.ui\");\n\
             export const a = ui({ color: \"red\" });\n\
             export const b = ui({ padding: 8 });");
        assert_eq!(named.css, literal.css);
        assert!(codes(&named).is_empty(), "{:?}", codes(&named));
    }

    /// `build` does `styles.flat(4)`, so an array argument has always MEANT the
    /// arguments it holds — the README writes `atoms([base, active() && loud])`
    /// and there was no arm for it, so the whole call and every object in it
    /// went to the runtime.
    #[test]
    fn an_array_argument_is_the_arguments_it_holds() {
        let nested =
            run("export const a = atoms([{ color: \"red\" }, [{ padding: 8 }]], { gap: 4 });");
        let flat = run("export const a = atoms({ color: \"red\" }, { padding: 8 }, { gap: 4 });");
        assert_eq!(nested.css, flat.css);
        assert_eq!(nested.code, flat.code);
        assert!(codes(&nested).is_empty(), "{:?}", codes(&nested));
    }

    /// And a conditional inside one is still the one ternary it would be
    /// outside it, which is what makes a list of treatments composable.
    #[test]
    fn a_conditional_inside_an_array_is_still_a_ternary() {
        let out = run("export const a = atoms([{ color: \"red\" }, on() && { color: \"blue\" }]);");
        assert!(out.code.contains(" ? \""), "{}", out.code);
        assert!(!out.code.contains("atoms("), "the call survived: {}", out.code);
    }

    /// A spread of an array literal is the same list by another spelling.
    #[test]
    fn a_spread_of_a_literal_list_folds_and_one_of_something_else_does_not() {
        let out = run("export const a = atoms(...[{ color: \"red\" }, { padding: 8 }]);");
        assert!(!out.code.contains("atoms("), "the call survived: {}", out.code);
        assert!(codes(&out).is_empty(), "{:?}", codes(&out));
        // A spread of anything else is not an argument list this pass can
        // count through, and it says so.
        assert!(codes(&run("export const a = atoms(...rest);")).contains(&"BARQ017"));
    }

    /// A value that arrives when the code runs is what `dynamic` is for, so the
    /// note says so rather than calling it an import or a function call.
    #[test]
    fn a_value_from_inside_a_function_points_at_dynamic() {
        let message = |body: &str| -> String {
            let out = run(body);
            let notes: Vec<&str> = out
                .warnings
                .iter()
                .filter(|w| w.code.map(Code::as_str) == Some("BARQ017"))
                .map(|w| w.message.as_str())
                .collect();
            assert_eq!(notes.len(), 1, "{body}: {notes:?}");
            notes[0].to_string()
        };
        for body in [
            "export const a = (c) => atoms({ color: c });",
            "export const a = (p) => atoms({ padding: 4, \":hover\": { color: p.tint } });",
            "export const a = (on, w) => atoms(on && { width: `${w}px` });",
            "export function A() {\n  let c = pick();\n  return atoms({ color: c });\n}",
        ] {
            let text = message(body);
            assert!(text.contains("`dynamic`"), "{body}: {text}");
            assert!(!text.contains("imported value"), "{body}: {text}");
        }
        for body in [
            "import { theme } from \"./t.ts\";\nexport const a = atoms({ color: theme.brand });",
            "export const a = atoms({ color: pick() });",
        ] {
            let text = message(body);
            assert!(text.contains("imported value"), "{body}: {text}");
            assert!(!text.contains("`dynamic`"), "{body}: {text}");
        }
        let fixed = run(
            "const tint = dynamic((color) => ({ color }));\nexport const a = (c) => props(tint(c));",
        );
        assert!(codes(&fixed).is_empty(), "{:?}", codes(&fixed));
    }

    /// The line is at the OBJECT, not at the call. An argument this pass cannot
    /// read that is a class string folds its neighbours, puts their rules in
    /// the stylesheet and leaves a merge over strings — which reaches none of
    /// the machinery BARQ017 is about. Reporting it would fire 127 times in
    /// `@barqjs/ui` on the documented idiom.
    #[test]
    fn an_opaque_class_string_is_a_merge_and_reports_nothing() {
        let out = run(
            "import { shared } from \"./s.ts\";\nconst ui = layer(\"barq.ui\");\nexport const a = ui(shared.ring, { color: \"red\" });",
        );
        assert!(out.code.contains("a-color_"), "the literal did not fold: {}", out.code);
        assert!(codes(&out).is_empty(), "{:?}", codes(&out));
    }

    #[test]
    fn a_call_that_folds_whole_reports_nothing() {
        let out = run(
            "const ui = layer(\"barq.ui\");\nexport const a = ui({ color: \"red\", padding: 8 });",
        );
        assert!(codes(&out).is_empty(), "{:?}", codes(&out));
    }

    fn strict(body: &str) -> CompileOutput {
        let options = TransformOptions {
            filename: Some("s.tsx".to_string()),
            strict_css: Some(true),
            ..TransformOptions::default()
        };
        compile(&format!("{IMPORT}{body}"), &options.resolve()).expect("compiles")
    }

    /// The flag names a SET of codes, so a CSS code added later is covered
    /// without the flag being edited.
    #[test]
    fn strict_css_makes_every_css_code_an_error() {
        for body in [
            "export const a = atoms({ color: theme.brand });",
            "export const a = atoms({ color: \"red\" }, x() && { color: \"b\" }, y() && { padding: 8 });",
        ] {
            let out = strict(body);
            assert!(
                out.warnings.iter().any(|warning| warning.severity == Level::Error),
                "{body}: {:?}",
                codes(&out)
            );
        }
    }

    /// `checks` is per code and `strictCss` is per set, so the narrower one
    /// wins. Without that, a project could turn the flag on and have no way
    /// back for the one call it accepts.
    #[test]
    fn an_explicit_check_still_beats_strict_css() {
        let options = TransformOptions {
            filename: Some("s.tsx".to_string()),
            strict_css: Some(true),
            checks: Some(vec![vec!["BARQ017".to_string(), "note".to_string()]]),
            ..TransformOptions::default()
        };
        let out = compile(
            &format!("{IMPORT}export const a = atoms({{ color: theme.brand }});"),
            &options.resolve(),
        )
        .expect("compiles");
        assert!(out.warnings.iter().all(|warning| warning.severity == Level::Note), "{out:?}");
    }

    /// A folded call is what `strictCss` is FOR: `@barqjs/ui` sets it at zero
    /// cost today, and this is the shape that says so.
    #[test]
    fn strict_css_costs_a_module_that_folds_nothing() {
        let out = strict(
            "const ui = layer(\"barq.ui\");\nexport const a = ui({ color: \"red\" });\nexport const g = ui.create({ r: { padding: 8 } });",
        );
        assert!(out.warnings.iter().all(|warning| warning.code.is_none()), "{:?}", codes(&out));
    }
}

#[cfg(test)]
mod surface_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    const IMPORT: &str =
        "import { dynamic, defineVars, globalVars, layer, props } from \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
    }

    /// `layer()` binds the layer for every helper that writes a rule, so the
    /// name is written once a module rather than at every call. Each folds,
    /// and every rule it writes is in the layer.
    #[test]
    fn a_bound_layer_folds_every_helper_it_carries() {
        let bound = run("const ui = layer(\"barq.ui\");\n\
             export const g = ui.create({ ring: { outlineWidth: \"3px\" } });\n\
             export const p = ui.props({ padding: 8 });\n\
             export const d = ui.dynamic((c) => ({ backgroundColor: c }));");
        assert_eq!(
            bound.css.as_deref(),
            Some(
                "@layer barq.ui{.a-outline-width_vwnyyq{outline-width:3px}\
                 .a-padding-top_173k9nj{padding-top:8px}.a-padding-right_173k9nj{padding-right:8px}\
                 .a-padding-bottom_173k9nj{padding-bottom:8px}\
                 .a-padding-left_173k9nj{padding-left:8px}\
                 .a-background-color_117kgsa{background-color:var(--background-color-1j1m7tz)}}\
                 @property --background-color-1j1m7tz{syntax:\"*\";inherits:false}"
            )
        );
        assert!(!bound.code.contains("ui.create("), "{}", bound.code);
        assert!(!bound.code.contains("ui.props("), "{}", bound.code);
        assert!(!bound.code.contains("ui.dynamic("), "{}", bound.code);
    }

    /// `props` and `dynamic` were the two helpers with no layered form, so a
    /// design system could not use a dynamic style at all.
    #[test]
    fn the_layered_forms_put_their_rules_in_the_layer() {
        for body in [
            "const ui = layer(\"barq.ui\");\nexport const p = ui.props({ padding: 8 });",
            "const ui = layer(\"barq.ui\");\nexport const d = ui.dynamic((c) => ({ color: c }));",
        ] {
            let css = run(body).css.unwrap_or_default();
            assert!(css.starts_with("@layer barq.ui{"), "{body}: {css}");
        }
        // And the unlayered forms still are not layered, which is why they
        // beat an application's reset.
        for body in [
            "export const p = props({ padding: 8 });",
            "export const d = dynamic((c) => ({ color: c }));",
        ] {
            let css = run(body).css.unwrap_or_default();
            assert!(!css.contains("@layer"), "{body}: {css}");
        }
    }

    /// `globalVars` names the property what the author called it, so an
    /// application's own `:root { --primary: … }` is heard. `defineVars`
    /// suffixes the whole set, so two files cannot collide.
    #[test]
    fn global_vars_are_the_names_you_wrote_and_define_vars_are_hashed() {
        let global = run("export const t = globalVars({ primary: \"#3b82f6\", radius: \"8px\" });");
        assert_eq!(global.css.as_deref(), Some(":root{--primary:#3b82f6;--radius:8px}"));
        assert!(global.code.contains("primary: \"var(--primary)\""), "{}", global.code);

        let scoped = run("export const t = defineVars({ primary: \"#3b82f6\" });");
        let css = scoped.css.unwrap_or_default();
        assert!(css.starts_with(":root{--primary-"), "{css}");
        assert_ne!(css, ":root{--primary:#3b82f6}");
    }

    /// A layer this pass cannot read takes the whole call, and says so.
    #[test]
    fn a_layered_form_with_an_unreadable_layer_declines_and_reports() {
        let out = run("import { LAYER } from \"./l.ts\";\n\
             const ui = layer(LAYER);\n\
             export const p = ui.props({ padding: 8 });");
        assert!(out.code.contains("ui.props("), "{}", out.code);
        assert!(
            out.warnings.iter().filter_map(|w| w.code).any(|c| c.as_str() == "BARQ017"),
            "{:?}",
            out.warnings
        );
    }
}

#[cfg(test)]
mod cross_file_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::css::Resolved;
    use crate::options::{ResolvedOptions, TransformOptions};

    fn run(body: &str, imports: Vec<Vec<String>>, exports: bool) -> CompileOutput {
        let options = TransformOptions {
            filename: Some("card.tsx".to_string()),
            css_imports: Some(imports),
            css_exports: Some(exports),
            ..TransformOptions::default()
        };
        compile(body, &options.resolve()).expect("compiles")
    }

    fn plain(body: &str) -> CompileOutput {
        compile(body, &ResolvedOptions::with_filename("m.ts")).expect("compiles")
    }

    fn rows(out: &CompileOutput, specifier: &str) -> Vec<Vec<String>> {
        let mut rows = Vec::new();
        for (name, value) in &out.css_exports {
            match value {
                Resolved::Text(text) => rows.push(vec![
                    specifier.to_string(),
                    name.clone(),
                    "text".to_string(),
                    String::new(),
                    text.clone(),
                ]),
                Resolved::Number(text) => rows.push(vec![
                    specifier.to_string(),
                    name.clone(),
                    "number".to_string(),
                    String::new(),
                    text.clone(),
                ]),
                Resolved::Layer(layer) => rows.push(vec![
                    specifier.to_string(),
                    name.clone(),
                    "layer".to_string(),
                    String::new(),
                    layer.clone(),
                ]),
                Resolved::Group(members) => {
                    for (member, class, numeric) in members {
                        rows.push(vec![
                            specifier.to_string(),
                            name.clone(),
                            if *numeric { "group-number" } else { "group" }.to_string(),
                            member.clone(),
                            class.clone(),
                        ]);
                    }
                }
            }
        }
        rows
    }

    const CARD: &str = "import { layer } from \"@barqjs/css\";\n\
                        import { theme } from \"./theme.ts\";\n\
                        import { BRAND } from \"./tokens.ts\";\n\
                        import { shared, ui } from \"./shared.ts\";\n\
                        const app = layer(\"app\");\n\
                        export const a = app({ color: theme.brand, borderColor: BRAND });\n\
                        export const b = app(shared.ring);\n\
                        export const c = ui({ padding: 4 });";

    /// The pass reads no file. It says which one it would have to, and folds
    /// what it is handed — which is what keeps it a pure function of its inputs
    /// and a name resolving to the same value in dev and in a build.
    #[test]
    fn a_module_says_which_imports_a_fold_would_have_needed() {
        let out = run(CARD, Vec::new(), false);
        assert!(out.css_wanted.contains(&("./theme.ts".to_string(), "theme".to_string())));
        assert!(out.css_wanted.contains(&("./shared.ts".to_string(), "shared".to_string())));
        assert!(out.css_wanted.contains(&("./shared.ts".to_string(), "ui".to_string())));
        assert!(out.code.contains("app({"), "it folded without an answer: {}", out.code);
    }

    /// A module that folds on its own asks for nothing, so an integration pays
    /// for resolution only where it buys a fold.
    #[test]
    fn a_module_that_folds_asks_for_nothing() {
        let out = run(
            "import { layer } from \"@barqjs/css\";\nconst app = layer(\"app\");\nexport const a = app({ color: \"red\" });",
            Vec::new(),
            false,
        );
        assert!(out.css_wanted.is_empty(), "{:?}", out.css_wanted);
    }

    /// A number keeps its kind across the boundary: a length written as a
    /// number takes a unit in the importing module exactly as it does where it
    /// is declared, and the same digits exported as a string do not.
    #[test]
    fn an_imported_number_is_still_a_number() {
        let mut imports = rows(
            &run("export const GAP = 8;\nexport const RATIO = \"8\";", Vec::new(), true),
            "./tokens.ts",
        );
        assert!(imports.iter().any(|row| row[1] == "GAP" && row[2] == "number"), "{imports:?}");
        assert!(imports.iter().any(|row| row[1] == "RATIO" && row[2] == "text"), "{imports:?}");
        imports.retain(|row| row[1] == "GAP" || row[1] == "RATIO");

        let out = run(
            "import { atoms } from \"@barqjs/css\";\n\
             import { GAP, RATIO } from \"./tokens.ts\";\n\
             export const box = atoms({ padding: GAP, flexGrow: RATIO });",
            imports,
            false,
        );
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("padding-top:8px"), "{css}");
        assert!(css.contains("flex-grow:8"), "{css}");
        assert!(!css.contains("flex-grow:8px"), "{css}");
    }

    /// A token set grouped by name, which is how a palette is written, crosses
    /// the boundary by member path. It was declined outright, so the tokens
    /// and every call reading one went to the runtime.
    #[test]
    fn a_nested_token_set_folds_in_the_module_that_imports_it() {
        let declared = run(
            "import { defineVars } from \"@barqjs/css\";\n\
             export const theme = defineVars({ color: { brand: \"red\", gray: { 900: \"#111\", 50: \"#fafafa\" } } });",
            Vec::new(),
            true,
        );
        assert!(declared.warnings.is_empty(), "{:?}", declared.warnings);
        let css = declared.css.as_deref().unwrap_or_default();
        let at = |needle: &str| css.find(needle).unwrap_or_else(|| panic!("{needle} in {css}"));
        assert!(at("--color-gray-50-") < at("--color-gray-900-"), "{css}");
        assert!(declared.code.contains("gray: {"), "{}", declared.code);

        let out = run(
            "import { atoms } from \"@barqjs/css\";\n\
             import { theme } from \"./theme.ts\";\n\
             export const a = atoms({ color: theme.color.gray[900], borderColor: theme.color.brand });",
            rows(&declared, "./theme.ts"),
            false,
        );
        assert!(!out.code.contains("atoms("), "{}", out.code);
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("{color:var(--color-gray-900-"), "{css}");
        assert!(css.contains("{border-top-color:var(--color-brand-"), "{css}");
    }

    /// A token set, a plain constant, a group and a layer binding: the four
    /// shapes a file exports that another can fold against.
    #[test]
    fn every_shape_crosses_the_boundary_and_folds() {
        let mut imports = Vec::new();
        imports.extend(rows(
            &plain(
                "import { defineVars } from \"@barqjs/css\";\n\
                 export const theme = defineVars({ brand: \"#3b82f6\" });",
            ),
            "./theme.ts",
        ));
        imports.extend(rows(
            &run("export const BRAND = \"var(--brand)\";", Vec::new(), true),
            "./tokens.ts",
        ));
        imports.extend(rows(
            &plain(
                "import { layer } from \"@barqjs/css\";\n\
                 export const ui = layer(\"app\");\n\
                 export const shared = ui.create({ ring: { outlineWidth: \"3px\" } });",
            ),
            "./shared.ts",
        ));

        let out = run(CARD, imports, false);
        assert!(!out.code.contains("app("), "a call survived: {}", out.code);
        assert!(!out.code.contains("ui({"), "the layer binding survived: {}", out.code);
        assert!(out.css_wanted.is_empty(), "{:?}", out.css_wanted);
        let css = out.css.as_deref().unwrap_or_default();
        // The token's `var()` is the one the OTHER module named.
        assert!(css.contains("color:var(--brand-"), "{css}");
        assert!(css.contains("border-top-color:var(--brand)"), "{css}");
        // A group's rules stay where they were declared; only its names cross.
        assert!(!css.contains("outline-width"), "the group was re-emitted: {css}");
        assert!(out.code.contains("a-outline-width_"), "{}", out.code);
        // And the layer binding put this module's own atoms in the layer.
        assert!(css.contains("@layer app{"), "{css}");
    }

    /// A file that writes no CSS still exports the constant another folds
    /// against, and `tokens.ts` holding a `var()` string is exactly that file.
    #[test]
    fn a_file_with_no_css_of_its_own_still_reports_its_constants() {
        let out = run(
            "export const BRAND = \"var(--brand)\";\nconst PRIVATE = \"var(--x)\";",
            Vec::new(),
            true,
        );
        assert_eq!(out.css_exports.len(), 1, "{:?}", out.css_exports);
        assert_eq!(out.css_exports[0].0, "BRAND");
        // A module's private constants are nobody else's business.
        assert!(!out.css_exports.iter().any(|(name, _)| name == "PRIVATE"));
        // And without the flag it is not compiled at all.
        assert!(
            run("export const BRAND = \"var(--brand)\";", Vec::new(), false).css_exports.is_empty()
        );
    }

    /// A row this build does not understand is dropped rather than guessed at,
    /// so the fold declines exactly as it would have. Folding a value the other
    /// side did not mean would name a class no rule was emitted for.
    #[test]
    fn a_row_of_an_unknown_kind_is_ignored() {
        let out = run(
            "import { layer } from \"@barqjs/css\";\n\
             import { BRAND } from \"./tokens.ts\";\n\
             const app = layer(\"app\");\n\
             export const a = app({ color: BRAND });",
            vec![vec![
                "./tokens.ts".to_string(),
                "BRAND".to_string(),
                "whatever".to_string(),
                String::new(),
                "var(--brand)".to_string(),
            ]],
            false,
        );
        assert!(out.code.contains("app({"), "{}", out.code);
    }

    /// A module whose only tie to the package is a layer binding it imports
    /// never names the package, and still asks for the binding and folds
    /// through it once it is handed over.
    #[test]
    fn a_module_that_only_imports_a_layer_binding_folds_through_it() {
        let shared = rows(
            &plain(
                "import { layer } from \"@barqjs/css\";\n\
                 export const ui = layer(\"app\");",
            ),
            "./shared.ts",
        );
        let card = "import { ui } from \"./shared.ts\";\n\
                    export const a = ui({ color: \"red\" });\n\
                    const tint = ui.dynamic((c: string) => ({ color: c }));\n\
                    export const p = (c: string) => ui.props({ padding: 1 }, tint(c));\n";
        let asked = run(card, Vec::new(), false);
        assert!(
            asked.css_wanted.contains(&("./shared.ts".to_string(), "ui".to_string())),
            "{:?}",
            asked.css_wanted
        );
        assert!(asked.code.contains("ui({"), "{}", asked.code);

        let out = run(card, shared, false);
        assert!(!out.code.contains("ui({"), "{}", out.code);
        assert!(out.css.as_deref().unwrap_or_default().starts_with("@layer app{"), "{:?}", out.css);
        // The merge the folded `props` call leaves needs the package, which
        // the module did not import.
        assert!(
            out.code.contains("import { mergeStyles as _$mergeStyles } from \"@barqjs/css\""),
            "{}",
            out.code
        );
        // And a module calling an imported function some other way is not
        // compiled for it at all.
        let other = run("import { log } from \"./log.ts\";\nlog(1);\n", Vec::new(), false);
        assert!(other.css_wanted.is_empty(), "{:?}", other.css_wanted);
    }

    /// `export { x as y }` is the other spelling, and an importer asks for `y`.
    #[test]
    fn a_renamed_export_crosses_under_the_name_it_is_exported_as() {
        let out =
            run("const inner = \"var(--brand)\";\nexport { inner as BRAND };", Vec::new(), true);
        assert_eq!(out.css_exports.len(), 1, "{:?}", out.css_exports);
        assert_eq!(out.css_exports[0].0, "BRAND");
    }

    const SHARED: &str = "import { layer } from \"@barqjs/css\";\n\
                          export const ui = layer(\"app\");\n\
                          export const shared = ui.create({ ring: { outlineWidth: \"3px\" } });\n\
                          export const GAP = 8;";

    fn exported<'o>(out: &'o CompileOutput, name: &str) -> Option<&'o Resolved> {
        out.css_exports.iter().find(|(exported, _)| exported == name).map(|(_, value)| value)
    }

    /// A barrel binds nothing, so nothing in it ever misses. Asked for its
    /// exports, it asks for what it re-exports, and once handed that it
    /// answers with it, saying which module the value is from.
    #[test]
    fn a_named_re_export_asks_for_its_value_and_hands_it_on() {
        let barrel = "export { shared, shared as ring } from \"./shared.ts\";\n\
                      export type { Thing } from \"./shared.ts\";";
        let asked = run(barrel, Vec::new(), true);
        assert_eq!(asked.css_wanted, vec![("./shared.ts".to_string(), "shared".to_string())]);
        assert!(asked.css_exports.is_empty(), "{:?}", asked.css_exports);

        let out = run(barrel, rows(&plain(SHARED), "./shared.ts"), true);
        assert!(out.css_wanted.is_empty(), "{:?}", out.css_wanted);
        let Some(Resolved::Group(members)) = exported(&out, "ring") else {
            panic!("{:?}", out.css_exports)
        };
        assert_eq!(members[0].0, "ring");
        assert!(members[0].1.starts_with("a-outline-width_"), "{members:?}");
        assert!(exported(&out, "shared").is_some());
        assert!(out.css_origins.contains(&(
            "ring".to_string(),
            "./shared.ts".to_string(),
            "shared".to_string()
        )));
    }

    /// `export *` names nothing, so it asks for the whole module, and passes on
    /// every name but `default`, a name this module exports itself, and a name
    /// two of its `export *` lines both bring.
    #[test]
    fn an_export_star_hands_on_every_name_the_other_module_resolved() {
        let barrel = "export * from \"./shared.ts\";\n\
                      export * from \"./other.ts\";\n\
                      export const GAP = 4;";
        let asked = run(barrel, Vec::new(), true);
        assert!(asked.css_wanted.contains(&("./shared.ts".to_string(), "*".to_string())));
        assert!(asked.css_wanted.contains(&("./other.ts".to_string(), "*".to_string())));

        let mut imports = rows(&plain(SHARED), "./shared.ts");
        imports.extend(rows(
            &run(
                "export const ui = \"x\";\nexport const BRAND = \"var(--brand)\";\nexport default \"d\";",
                Vec::new(),
                true,
            ),
            "./other.ts",
        ));
        imports.push(vec![
            "./other.ts".to_string(),
            "default".to_string(),
            "text".to_string(),
            String::new(),
            "d".to_string(),
        ]);
        let out = run(barrel, imports, true);
        let names: Vec<&str> = out.css_exports.iter().map(|(name, _)| name.as_str()).collect();
        assert_eq!(names, vec!["BRAND", "GAP", "shared"], "{:?}", out.css_exports);
        assert!(matches!(exported(&out, "GAP"), Some(Resolved::Number(text)) if text == "4"));
        assert!(out.css_origins.contains(&(
            "shared".to_string(),
            "./shared.ts".to_string(),
            "shared".to_string()
        )));
    }

    /// A module importing through the barrel folds exactly as it would against
    /// the module that declares the group.
    #[test]
    fn a_module_importing_through_a_barrel_folds() {
        let barrel =
            run("export * from \"./shared.ts\";", rows(&plain(SHARED), "./shared.ts"), true);
        let card = "import { atoms } from \"@barqjs/css\";\n\
                    import { shared, GAP } from \"./style.ts\";\n\
                    export const a = atoms(shared.ring, { padding: GAP });";
        let out = run(card, rows(&barrel, "./style.ts"), false);
        assert!(!out.code.contains("atoms("), "{}", out.code);
        assert!(out.code.contains("a-outline-width_"), "{}", out.code);
        assert!(
            out.css.as_deref().unwrap_or_default().contains("padding-top:8px"),
            "{:?}",
            out.css
        );
    }

    /// `export const alias = group`, of a group declared here and of one
    /// imported, and `export { imported }`.
    #[test]
    fn an_alias_of_a_group_is_the_group() {
        let module = "import { layer } from \"@barqjs/css\";\n\
                      import { shared } from \"./shared.ts\";\n\
                      const ui = layer(\"app\");\n\
                      const local = ui.create({ row: { display: \"flex\" } });\n\
                      export const flow = local;\n\
                      export const ring = shared;\n\
                      export const app = ui;\n\
                      export { shared };";
        let asked = run(module, Vec::new(), true);
        assert!(asked.css_wanted.contains(&("./shared.ts".to_string(), "shared".to_string())));
        let Some(Resolved::Group(flow)) = exported(&asked, "flow") else {
            panic!("{:?}", asked.css_exports)
        };
        assert!(flow[0].1.starts_with("a-display_"), "{flow:?}");
        assert!(matches!(exported(&asked, "app"), Some(Resolved::Layer(layer)) if layer == "app"));

        let out = run(module, rows(&plain(SHARED), "./shared.ts"), true);
        assert!(
            matches!(exported(&out, "ring"), Some(Resolved::Group(_))),
            "{:?}",
            out.css_exports
        );
        assert!(matches!(exported(&out, "shared"), Some(Resolved::Group(_))));
        assert!(out.css_origins.contains(&(
            "ring".to_string(),
            "./shared.ts".to_string(),
            "shared".to_string()
        )));
        assert!(!out.css_origins.iter().any(|(name, ..)| name == "flow"));
    }

    const TOKENS: &str = "export const tokens = {\n\
                          \x20 brand: \"var(--brand)\",\n\
                          \x20 space: { md: 8, \"2xl\": `calc(var(--spacing) * 16)` },\n\
                          \x20 50: \"#fafafa\",\n\
                          } as const;\n\
                          export const plain: { gap: string } = { gap: \"var(--gap)\" };";

    /// A token object, `as const` or not, in a module that never names
    /// `@barqjs/css`: its members cross by path, and a number stays one.
    #[test]
    fn a_token_object_folds_where_it_is_read() {
        let declared = run(TOKENS, Vec::new(), true);
        let Some(Resolved::Group(members)) = exported(&declared, "tokens") else {
            panic!("{:?}", declared.css_exports)
        };
        assert_eq!(members.len(), 4, "{members:?}");
        assert!(
            members
                .iter()
                .any(|(path, value, numeric)| path.ends_with("md") && value == "8" && *numeric)
        );
        assert!(matches!(exported(&declared, "plain"), Some(Resolved::Group(_))));

        let out = run(
            "import { layer } from \"@barqjs/css\";\n\
             import { tokens, plain } from \"./tokens.ts\";\n\
             const app = layer(\"app\");\n\
             export const a = app({ color: tokens.brand, padding: tokens.space.md, \
             margin: tokens.space[\"2xl\"], backgroundColor: tokens[50], gap: plain.gap });",
            rows(&declared, "./tokens.ts"),
            false,
        );
        assert!(!out.code.contains("app({"), "{}", out.code);
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("color:var(--brand)"), "{css}");
        assert!(css.contains("padding-top:8px"), "{css}");
        assert!(css.contains("margin-top:calc(var(--spacing) * 16)"), "{css}");
        assert!(css.contains("background-color:#fafafa"), "{css}");
        assert!(css.contains("row-gap:var(--gap)"), "{css}");
        assert!(out.warnings.is_empty(), "{:?}", out.warnings);
    }

    /// A group keyed by a breakpoint, which is not an identifier, compiles to
    /// an object a JavaScript parser accepts.
    #[test]
    fn a_group_key_that_is_not_an_identifier_is_quoted() {
        let out = run(
            "import { create } from \"@barqjs/css\";\n\
             export const at = create({ \"2xl\": { padding: 1 }, md: { padding: 2 }, 0.5: { margin: 1 } });",
            Vec::new(),
            true,
        );
        assert!(out.code.contains("\"2xl\": \"a-padding-top_"), "{}", out.code);
        assert!(out.code.contains("md: \"a-padding-top_"), "{}", out.code);
        let allocator = oxc::allocator::Allocator::default();
        let parsed = oxc::parser::Parser::new(&allocator, &out.code, oxc::span::SourceType::mjs())
            .parse()
            .diagnostics;
        assert!(parsed.is_empty(), "{parsed:?}\n{}", out.code);
    }

    /// The same object read in the module that declares it.
    #[test]
    fn a_token_object_folds_in_its_own_module() {
        let out = run(
            &format!(
                "import {{ atoms }} from \"@barqjs/css\";\n{TOKENS}\n\
                 export const a = atoms({{ padding: tokens.space.md, color: tokens.brand }});"
            ),
            Vec::new(),
            false,
        );
        assert!(!out.code.contains("atoms("), "{}", out.code);
        assert!(
            out.css.as_deref().unwrap_or_default().contains("padding-top:8px"),
            "{:?}",
            out.css
        );
    }

    /// A member that is not a static literal is not exported, so a read of it
    /// declines with the diagnostic every unreadable value gets rather than
    /// folding to something, or falling back without a word.
    #[test]
    fn a_member_that_is_not_static_still_gives_the_diagnostic() {
        let declared = run(
            "import { pick } from \"./pick.ts\";\n\
             export const tokens = { brand: \"var(--brand)\", accent: pick(\"accent\") } as const;\n\
             export const written = { gap: \"var(--gap)\" };\n\
             written.gap = \"1px\";\n\
             export const spread = { ...tokens, gap: \"var(--gap)\" };",
            Vec::new(),
            true,
        );
        let Some(Resolved::Group(members)) = exported(&declared, "tokens") else {
            panic!("{:?}", declared.css_exports)
        };
        assert_eq!(members.len(), 1, "{members:?}");
        assert!(exported(&declared, "written").is_none(), "{:?}", declared.css_exports);
        assert!(exported(&declared, "spread").is_none(), "{:?}", declared.css_exports);

        let options = TransformOptions {
            filename: Some("card.tsx".to_string()),
            css_imports: Some(rows(&declared, "./tokens.ts")),
            strict_css: Some(true),
            ..TransformOptions::default()
        }
        .resolve();
        for read in ["tokens.accent", "written.gap", "spread.gap"] {
            let source = format!(
                "import {{ layer }} from \"@barqjs/css\";\n\
                 import {{ tokens, written, spread }} from \"./tokens.ts\";\n\
                 const app = layer(\"app\");\n\
                 export const a = app.create({{ x: {{ color: {read} }} }});"
            );
            let out = compile(&source, &options).expect("compiles");
            assert!(out.code.contains("app.create("), "{read}: {}", out.code);
            assert!(
                out.warnings.iter().filter_map(|w| w.code).any(|c| c.as_str() == "BARQ017"),
                "{read}: {:?}",
                out.warnings
            );
        }
    }

    /// `import * as style` reads every export of the module by path.
    #[test]
    fn a_namespace_import_folds_by_path() {
        let card = "import { atoms } from \"@barqjs/css\";\n\
                    import * as style from \"./shared.ts\";\n\
                    export const a = atoms(style.shared.ring, { padding: style.GAP });";
        let asked = run(card, Vec::new(), false);
        assert!(asked.css_wanted.contains(&("./shared.ts".to_string(), "*".to_string())));
        let out = run(card, rows(&plain(SHARED), "./shared.ts"), false);
        assert!(!out.code.contains("atoms("), "{}", out.code);
        assert!(
            out.css.as_deref().unwrap_or_default().contains("padding-top:8px"),
            "{:?}",
            out.css
        );
    }
}

#[cfg(test)]
mod theme_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    fn run(body: &str) -> CompileOutput {
        compile(
            &format!("import {{ createTheme, defineVars }} from \"@barqjs/css\";\n{body}"),
            &ResolvedOptions::with_filename("s.tsx"),
        )
        .expect("compiles")
    }

    /// The class `@barqjs/css`'s own `createTheme` produces for the same
    /// tokens, pinned. They MUST agree: a theme this compiles and a theme the
    /// runtime builds for an imported token set are one rule under one class
    /// or they are two copies of it.
    #[test]
    fn a_theme_over_a_local_token_set_is_the_class_the_runtime_names() {
        let out = run(
            "export const tokens = defineVars({ brand: \"rgb(59, 130, 246)\", pad: \"12px\" });\n\
             export const brighter = createTheme(tokens, { brand: \"rgb(96, 165, 250)\" });",
        );
        assert!(out.code.contains("export const brighter = \"r162tj84\""), "{}", out.code);
        assert!(!out.code.contains("createTheme("), "the call survived: {}", out.code);
        assert_eq!(
            out.css.as_deref(),
            Some(
                ":root{--brand-1xxjjr0:rgb(59, 130, 246);--pad-1xxjjr0:12px}\
                 .r162tj84{--brand-1xxjjr0:rgb(96, 165, 250)}"
            )
        );
    }

    /// `String(8.0)` is `8` whatever the source wrote, and the two sides hash
    /// the declaration TEXT.
    #[test]
    fn a_number_takes_the_text_the_runtime_would_print() {
        let out = run("export const t = defineVars({ gap: \"0px\" });\n\
             export const a = createTheme(t, { gap: 8.0 });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains(":8}"), "{css}");
    }

    /// The runtime skips a token the set does not carry, because the property
    /// name lives in the reference and there is none to read.
    #[test]
    fn a_token_the_set_does_not_carry_is_skipped_like_the_runtime_skips_it() {
        let out = run("export const t = defineVars({ brand: \"#000\" });\n\
             export const a = createTheme(t, { brand: \"#fff\", nothing: \"#f00\" });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(!css.contains("#f00"), "{css}");
    }
}

#[cfg(test)]
mod parity_tests {
    use crate::compile::compile;
    use crate::options::ResolvedOptions;

    /// The exact classes `@barqjs/css`'s runtime produces for StyleX's own
    /// documented forms.
    ///
    /// Compiled and runtime output MUST be identical: a form the compiler read
    /// differently would produce a class the runtime never registers a rule
    /// for. Two of these used to do exactly that — a top-level `"::placeholder"`
    /// key was read as a property whose conditions were its declarations, and
    /// `null` was skipped where it has to REMOVE.
    fn classes(body: &str) -> String {
        let source = format!(
            "import {{ atoms, firstThatWorks }} from \"@barqjs/css\";\nexport const x = {body};\n"
        );
        let out = compile(&source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles");
        let code = out.code.clone();
        let start = code.find("export const x = \"").map(|at| at + 18);
        match start {
            Some(start) => code[start..].split('"').next().unwrap_or_default().to_string(),
            None => panic!("did not compile: {code}"),
        }
    }

    fn sheet(body: &str) -> String {
        let source = format!(
            "import {{ atoms, firstThatWorks }} from \"@barqjs/css\";\nexport const x = {body};\n"
        );
        compile(&source, &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
            .css
            .unwrap_or_default()
    }

    #[test]
    fn a_pseudo_element_is_a_top_level_key_holding_a_style_object() {
        assert_eq!(
            classes(r##"atoms({ "::placeholder": { color: "#999" } })"##),
            "a-color-1t2wucq_1f65243"
        );
        assert!(
            sheet(r##"atoms({ "::placeholder": { color: "#999" } })"##)
                .contains(".a-color-1t2wucq_1f65243::placeholder{color:#999}"),
            "{}",
            sheet(r##"atoms({ "::placeholder": { color: "#999" } })"##)
        );
    }

    #[test]
    fn conditions_combine_and_the_at_rule_wraps_the_selector() {
        let body = r#"atoms({ color: { default: "black", "@media (min-width: 800px)": { default: "navy", ":hover": "blue" } } })"#;
        assert_eq!(classes(body), "a-color_o0md2c a-color-12j0t8v_18o6jtd a-color-n29619_10cd4ul");
        assert!(
            sheet(body)
                .contains("@media (min-width: 800px){.a-color-n29619_10cd4ul:hover{color:blue}}"),
            "{}",
            sheet(body)
        );
    }

    #[test]
    fn first_that_works_repeats_the_declaration_best_last() {
        let body = r#"atoms({ position: firstThatWorks("sticky", "-webkit-sticky", "fixed") })"#;
        assert_eq!(classes(body), "a-position_a7lem1");
        assert!(
            sheet(body).contains("position:fixed;position:-webkit-sticky;position:sticky"),
            "{}",
            sheet(body)
        );
    }

    #[test]
    fn null_removes_what_an_earlier_argument_applied() {
        let body = r#"atoms({ color: "red", padding: 4 }, { color: null })"#;
        assert_eq!(
            classes(body),
            "a-padding-top_1ql4awz a-padding-right_1ql4awz a-padding-bottom_1ql4awz \
             a-padding-left_1ql4awz"
        );
        // And no rule for the class it removed, nor a stand-in for the removal.
        let css = sheet(body);
        assert!(!css.contains("color:red"), "{css}");
        assert!(!css.contains("color:0"), "{css}");
    }

    #[test]
    fn null_removes_every_longhand_a_shorthand_set() {
        assert_eq!(classes(r#"atoms({ margin: 4 }, { margin: null })"#), "");
    }

    #[test]
    fn false_and_undefined_decline_to_add_rather_than_remove() {
        let base = classes(r#"atoms({ color: "red" })"#);
        assert_eq!(classes(r#"atoms({ color: "red" }, { color: false })"#), base);
        assert_eq!(classes(r#"atoms({ color: "red" }, { color: undefined })"#), base);
    }
}

#[cfg(test)]
mod vars_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    fn run(body: &str) -> CompileOutput {
        let source =
            format!("import {{ create, defineVars, props }} from \"@barqjs/css\";\n{body}\n");
        compile(&source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles")
    }

    /// The names `@barqjs/css` produces for the same tokens, pinned. The group
    /// suffix is a hash of `JSON.stringify(tokens)`, so anything that formatted
    /// one byte differently would name the same tokens two things.
    #[test]
    fn define_vars_becomes_the_references_it_names() {
        let out = run("export const theme = defineVars({ brand: \"#3b82f6\", gap: 8 });");
        assert!(out.code.contains("brand: \"var(--brand-bbt2i)\""), "{}", out.code);
        assert!(out.code.contains("gap: \"var(--gap-bbt2i)\""), "{}", out.code);
        assert!(!out.code.contains("defineVars("), "the call survived: {}", out.code);
        assert_eq!(out.css.as_deref(), Some(":root{--brand-bbt2i:#3b82f6;--gap-bbt2i:8}"));
    }

    /// A number is printed as `String(value)` does, with no `px`: a token is a
    /// value, not a length, and `defineVars` never guesses a unit.
    #[test]
    fn a_token_number_keeps_its_own_text() {
        let out = run("export const t = defineVars({ gap: 8, ratio: 1.5 });");
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains(":8;"), "{css}");
        assert!(css.contains(":1.5}"), "{css}");
    }

    #[test]
    fn the_same_tokens_anywhere_are_the_same_properties() {
        let one = run("export const a = defineVars({ brand: \"#3b82f6\", gap: 8 });");
        let two = run("export const b = defineVars({ brand: \"#3b82f6\", gap: 8 });");
        assert_eq!(one.css, two.css);
        let different = run("export const c = defineVars({ brand: \"#ef4444\", gap: 8 });");
        assert_ne!(one.css, different.css);
    }

    #[test]
    fn a_token_the_compiler_cannot_know_leaves_the_call_alone() {
        let out = run("export const t = (x) => defineVars({ brand: x });");
        assert_eq!(out.css, None);
        assert!(out.code.contains("defineVars({"), "{}", out.code);
    }

    #[test]
    fn props_becomes_the_attribute_an_element_takes() {
        let out =
            run("const s = create({ root: { padding: 8 } });\nexport const p = props(s.root);");
        assert!(
            out.code.contains(
                "class: \"a-padding-top_1dzhg7 a-padding-right_1dzhg7 \
                 a-padding-bottom_1dzhg7 a-padding-left_1dzhg7\""
            ),
            "{}",
            out.code
        );
        assert!(!out.code.contains("props("), "the call survived: {}", out.code);
    }

    #[test]
    fn props_merges_like_atoms_and_a_conditional_is_still_a_ternary() {
        let out =
            run("export const p = (on) => props({ color: \"red\" }, on && { color: \"blue\" });");
        assert!(
            out.code.contains("class: on ? \"a-color_10cd4ul\" : \"a-color_i0tgik\""),
            "{}",
            out.code
        );
    }
}

#[cfg(test)]
mod dynamic_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::options::ResolvedOptions;

    fn run(body: &str) -> CompileOutput {
        let source = format!("import {{ dynamic, props }} from \"@barqjs/css\";\n{body}\n");
        compile(&source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles")
    }

    /// The class is fixed and reads a custom property; only the value is left
    /// for run time. Which is the whole shape of a dynamic style: a colour that
    /// changes every frame writes one property and produces no CSS.
    #[test]
    fn the_class_compiles_and_only_the_value_stays() {
        let out = run("export const bg = dynamic((color) => ({ backgroundColor: color }));");
        assert!(!out.code.contains("dynamic("), "the call survived: {}", out.code);
        assert!(out.code.contains("$class: \"a-background-color_"), "{}", out.code);
        assert!(
            out.code.contains("\"--background-color-1j1m7tz\": color"),
            "the parameter did not reach the variable: {}",
            out.code
        );
        let css = out.css.as_deref().expect("a stylesheet");
        assert!(css.contains("background-color:var(--background-color-1j1m7tz)"), "{css}");
    }

    #[test]
    fn a_braced_body_with_a_return_compiles_too() {
        let out = run(
            "export const bg = dynamic((color) => {\n  return { backgroundColor: color };\n});",
        );
        assert!(!out.code.contains("dynamic("), "{}", out.code);
        assert!(out.code.contains("$vars:"), "{}", out.code);
    }

    #[test]
    fn several_parameters_and_declarations_each_get_their_own_variable() {
        let out = run("export const box = dynamic((w, h) => ({ width: w, height: h }));");
        assert!(out.code.contains("\"--width-"), "{}", out.code);
        assert!(out.code.contains("\"--height-"), "{}", out.code);
        assert_eq!(out.code.matches("a-width_").count(), 1, "{}", out.code);
    }

    /// A body that is not an object literal cannot be read, which is the same
    /// rule StyleX states.
    #[test]
    fn a_body_that_computes_leaves_the_call_alone() {
        let out = run("export const bg = dynamic((c) => build(c));");
        assert_eq!(out.css, None);
        assert!(out.code.contains("dynamic("), "{}", out.code);
    }
}

/// What `@barqjs/css`'s runtime does with a value, done here to a literal.
/// `test/css-parity.test.ts` runs the same sources through both; these pin the
/// folds that file cannot reach, a diagnostic and a module boundary.
#[cfg(test)]
mod runtime_mirror_tests {
    use crate::compile::{CompileOutput, compile};
    use crate::css::Resolved;
    use crate::options::{ResolvedOptions, TransformOptions};

    const IMPORT: &str = "import { atoms, css, defineConditions, firstThatWorks } from \
                          \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("m.ts"))
            .expect("compiles")
    }

    fn css_of(body: &str) -> String {
        let out = run(body);
        assert!(!out.code.contains("atoms("), "a call survived: {}", out.code);
        out.css.unwrap_or_default()
    }

    #[test]
    fn a_numeric_literal_folds_by_value() {
        let css = css_of(
            "export const a = atoms({ opacity: .5, width: 1e3, height: 1.50, top: 0x10, \
             left: 1_000, bottom: 0.0 });",
        );
        for rule in
            ["{opacity:0.5}", "{width:1000px}", "{height:1.5px}", "{top:16px}", "{left:1000px}"]
        {
            assert!(css.contains(rule), "{rule}: {css}");
        }
        assert!(css.contains("{bottom:0}"), "{css}");
    }

    #[test]
    fn a_sign_in_front_of_a_literal_folds_too() {
        let css = css_of(
            "const GAP = -4;\nexport const a = atoms({ margin: GAP, zIndex: -1, top: +8, left: -0 });",
        );
        for rule in ["{margin-top:-4px}", "{z-index:-1}", "{top:8px}", "{left:0}"] {
            assert!(css.contains(rule), "{rule}: {css}");
        }
    }

    #[test]
    fn an_interpolated_number_is_printed_as_javascript_prints_it() {
        let css = run("export const a = css`opacity: ${.5}; width: ${0x10}px; top: ${-1e3}px`;")
            .css
            .unwrap_or_default();
        assert!(css.contains("opacity: 0.5;width: 16px;top: -1000px"), "{css}");
    }

    #[test]
    fn a_fallback_list_writes_each_number_as_its_own_declaration_would() {
        let css = css_of("export const a = atoms({ width: firstThatWorks(1.50, \"3em\") });");
        assert!(css.contains("{width:3em;width:1.5px}"), "{css}");
    }

    #[test]
    fn a_value_the_runtime_refuses_declares_nothing_here_either() {
        let css = css_of(
            "export const a = atoms({ color: \"red;} body{display:none\", width: 1e999, \
             height: 2 });",
        );
        assert!(!css.contains("display"), "{css}");
        assert!(!css.contains("Infinity"), "{css}");
        assert!(css.ends_with("{height:2px}"), "{css}");
    }

    #[test]
    fn the_later_of_a_logical_and_a_physical_key_is_the_one_in_the_class_string() {
        let out = run("export const a = atoms({ padding: 4 }, { paddingInline: 8 });\n\
             export const b = atoms(a, { paddingLeft: 0 });");
        let css = out.css.as_deref().unwrap_or_default();
        // Displaced before it was emitted, so it left no rule behind.
        assert!(!css.contains("padding-right:4px"), "{css}");
        assert!(out.code.contains("a-padding-inline-start_"), "{}", out.code);
        let second = out.code.split("const b = ").nth(1).unwrap_or_default();
        assert!(!second.contains("inline"), "{second}");
        assert!(second.contains("a-padding-left_"), "{second}");
    }

    #[test]
    fn a_calls_media_rules_are_written_mobile_first() {
        let css = css_of(
            "export const a = atoms({ color: { \"@media (min-width: 900px)\": \"red\", \
             \"@media print\": \"teal\", \"@media (min-width: 300px)\": \"blue\", \
             default: \"black\" } });",
        );
        let at = |needle: &str| css.find(needle).unwrap_or_else(|| panic!("{needle}: {css}"));
        assert!(at("{color:black}") < at("300px"));
        assert!(at("300px") < at("900px"));
        assert!(at("900px") < at("print"));
    }

    /// FNV-1a over 32 bits gives `40189px` and `797186px` one suffix.
    #[test]
    fn two_declarations_that_hash_to_one_class_are_an_error_naming_both() {
        let out = run("export const a = atoms({ width: 40189 });\n\
             export const b = atoms({ width: 797186 });");
        let collision = out
            .warnings
            .iter()
            .find(|warning| warning.code == Some(crate::diag::Code::Barq014))
            .unwrap_or_else(|| panic!("no collision reported: {:?}", out.warnings));
        assert!(collision.message.contains("width:40189px"), "{}", collision.message);
        assert!(collision.message.contains("width:797186px"), "{}", collision.message);
        assert_eq!(collision.severity, crate::diag::Level::Error);
        // The same declaration twice is one rule and no collision.
        let twice = run("export const a = atoms({ width: 40189 });\n\
             export const b = atoms({ width: 40189 });");
        assert!(twice.warnings.is_empty(), "{:?}", twice.warnings);
    }

    const WHEN: &str = "const when = defineConditions({ md: \"@media (min-width: 768px)\", \
                        dark: \"[data-theme=dark] &\", \"2xl\": \"@media (min-width: 1536px)\" });\n";

    #[test]
    fn a_named_condition_is_the_condition_written_out() {
        let named = css_of(&format!(
            "{WHEN}export const a = atoms({{ color: {{ default: \"red\", [when.md]: \"blue\" }}, \
             [when.dark]: {{ color: \"white\" }}, [when[\"2xl\"]]: {{ gap: 4 }} }});"
        ));
        let written = css_of(
            "export const a = atoms({ color: { default: \"red\", \
             \"@media (min-width: 768px)\": \"blue\" }, \"[data-theme=dark] &\": { color: \
             \"white\" }, \"@media (min-width: 1536px)\": { gap: 4 } });",
        );
        assert_eq!(named, written);
    }

    #[test]
    fn the_definition_is_read_wherever_in_the_file_it_stands_and_leaves_no_call() {
        let out = run(&format!(
            "export const card = () => atoms({{ [when.md]: {{ gap: 4 }} }});\n{WHEN}"
        ));
        assert!(!out.code.contains("atoms("), "{}", out.code);
        assert!(!out.code.contains("defineConditions("), "{}", out.code);
        assert!(out.code.contains("md: \"@media (min-width: 768px)\""), "{}", out.code);
    }

    #[test]
    fn a_value_that_is_not_a_condition_is_left_for_the_runtime_to_refuse() {
        let out = run("const when = defineConditions({ md: \"min-width: 768px\" });\n\
             export const a = atoms({ [when.md]: { gap: 4 } });");
        assert!(out.code.contains("defineConditions("), "{}", out.code);
        assert!(out.code.contains("atoms("), "{}", out.code);
    }

    #[test]
    fn a_named_condition_crosses_a_module_boundary_as_a_group() {
        let declared = compile(
            "import { defineConditions } from \"@barqjs/css\";\n\
             export const when = defineConditions({ md: \"@media (min-width: 768px)\" });",
            &ResolvedOptions::with_filename("when.ts"),
        )
        .expect("compiles");
        let mut imports = Vec::new();
        for (name, value) in &declared.css_exports {
            let Resolved::Group(members) = value else { panic!("{name} is not a group") };
            for (member, condition, _) in members {
                imports.push(vec![
                    "./when.ts".to_string(),
                    name.clone(),
                    "group".to_string(),
                    member.clone(),
                    condition.clone(),
                ]);
            }
        }
        assert_eq!(imports.len(), 1, "{:?}", declared.css_exports);

        let options = TransformOptions {
            filename: Some("card.ts".to_string()),
            css_imports: Some(imports),
            ..TransformOptions::default()
        };
        let source = "import { atoms } from \"@barqjs/css\";\nimport { when } from \"./when.ts\";\n\
                      export const a = atoms({ [when.md]: { gap: 4 } });";
        let out = compile(source, &options.resolve()).expect("compiles");
        assert!(!out.code.contains("atoms("), "{}", out.code);
        assert!(
            out.css.as_deref().unwrap_or_default().starts_with("@media (min-width: 768px){"),
            "{:?}",
            out.css
        );
        // And unresolved, the module says which import the fold needed.
        let alone = compile(source, &ResolvedOptions::with_filename("card.ts")).expect("compiles");
        assert_eq!(alone.css_wanted, vec![("./when.ts".to_string(), "when".to_string())]);
    }
}
