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
    ObjectPropertyKind, Program, PropertyKey, PropertyKind, Statement, TemplateLiteral,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_expression, walk_statements, walk_variable_declarator};
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::{GetSpan, Span};
use rustc_hash::{FxHashMap, FxHashSet};

use crate::analysis::without_type_wrappers;
use crate::diag::Code;
use crate::options::ResolvedOptions;

/// What one of the three tags compiles to.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Tag {
    Css,
    Keyframes,
    Global,
    Atoms,
    AtomsIn,
    Layer,
    Create,
    CreateIn,
    FirstThatWorks,
    Props,
    DefineVars,
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
            "atomsIn" => Tag::AtomsIn,
            "layer" => Tag::Layer,
            "create" => Tag::Create,
            "createIn" => Tag::CreateIn,
            "firstThatWorks" => Tag::FirstThatWorks,
            "props" => Tag::Props,
            "defineVars" => Tag::DefineVars,
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
    if tags.is_empty() {
        return Extracted { css: String::new(), reports: Vec::new() };
    }

    let mut pass = Css {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping: &scoping,
        tags,
        folded: FxHashMap::default(),
        numeric: FxHashSet::default(),
        groups: FxHashMap::default(),
        layers: FxHashMap::default(),
        debug: options.dev,
        css: String::new(),
        sub_layers: Vec::new(),
        emitted: FxHashSet::default(),
        reports: Vec::new(),
        name: None,
    };
    pass.seed_module_constants(program);
    pass.visit_program(program);
    // Prepended, not interleaved: a layer's ORDER is decided by where its name
    // is first seen, and a module whose first atom is a media atom would
    // otherwise declare `barq.ui.media` before `barq.ui.base`. Repeating the
    // statement across modules is a no-op in CSS, which is what lets a per-file
    // pass write it at all.
    let mut css = String::new();
    for layer in &pass.sub_layers {
        css.push_str(&barq_css::atoms::sub_layer_order(layer));
    }
    css.push_str(&pass.css);
    Extracted { css: gather_layers(&css), reports: pass.reports }
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
    debug: bool,
    css: String,
    /// Layers this module emitted an atom into, in first-use order, so the
    /// statement that fixes their tier order can be written once at the top of
    /// the stylesheet rather than wherever the first atom happened to land.
    sub_layers: Vec<String>,
    /// One rule per class, however many times the module writes the block.
    emitted: FxHashSet<String>,
    reports: Vec<Report>,
    /// The binding the template is being assigned to, for a readable dev class.
    name: Option<String>,
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
        walk_variable_declarator(self, declarator);
        self.name = outer;

        // Recorded after the walk, so what lands in the table is the class the
        // rewrite produced rather than the call that produced it.
        let Some(symbol) = declarator.id.get_binding_identifier().and_then(|id| id.symbol_id.get())
        else {
            return;
        };
        match declarator.init.as_ref() {
            Some(Expression::StringLiteral(literal)) => {
                self.folded.insert(symbol, literal.value.to_string());
            }
            // `` const W = `2px` ``. `text_of` already reads such a template
            // where it stands, and a `const` holding one is the same value by
            // another spelling — a formatter is what turns one into the other.
            Some(Expression::TemplateLiteral(template)) if template.expressions.is_empty() => {
                if let Some(quasi) = template.quasis.first() {
                    let text = quasi
                        .value
                        .cooked
                        .as_ref()
                        .map_or_else(|| quasi.value.raw.to_string(), |cooked| cooked.to_string());
                    self.folded.insert(symbol, text);
                }
            }
            Some(Expression::ObjectExpression(object)) => {
                let mut group = FxHashMap::default();
                for property in &object.properties {
                    let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
                    let (PropertyKey::StaticIdentifier(name), Expression::StringLiteral(value)) =
                        (&property.key, &property.value)
                    else {
                        continue;
                    };
                    group.insert(name.name.to_string(), value.value.to_string());
                }
                if !group.is_empty() {
                    self.groups.insert(symbol, group);
                }
            }
            // `const ui = layer("barq.ui")`. The call is left standing: a
            // sibling call this pass declines still has to reach the runtime,
            // and an unused binding is what a bundler drops.
            Some(Expression::CallExpression(call))
                if self.tag_of(&call.callee) == Some(Tag::Layer) =>
            {
                if let Some(name) = self.text_argument(call, 0) {
                    self.layers.insert(symbol, name);
                }
            }
            _ => {}
        }
    }

    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        walk_expression(self, expression);

        if let Expression::CallExpression(call) = expression {
            let span = call.span;
            match self.tag_of(&call.callee) {
                Some(Tag::Atoms) => {
                    if let Some(replacement) = self.compile_atoms(call, span, "") {
                        *expression = replacement;
                    }
                    return;
                }
                // `atomsIn("barq.ui", …)`: the layer is the first argument and
                // has to be a literal, because it becomes part of every name.
                Some(Tag::AtomsIn) => {
                    if self.text_argument(call, 0).is_none() {
                        // The layer joins every class name, so it cannot be
                        // resolved later. `layer()` binds one per module for
                        // exactly this reason.
                        self.declined_layer(call, span);
                        return;
                    }
                    if let Some(layer) = self.text_argument(call, 0) {
                        call.arguments.remove(0);
                        if let Some(replacement) = self.compile_atoms(call, span, &layer) {
                            *expression = replacement;
                            return;
                        }
                        // Put it back: the runtime is going to make this call.
                        let text = self.allocator.alloc_str(&layer);
                        let literal = Expression::new_string_literal(span, text, None, &self.ast);
                        call.arguments.insert(0, oxc::ast::ast::Argument::from(literal));
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
                Some(Tag::CreateIn) => {
                    if self.text_argument(call, 0).is_none() {
                        self.declined_layer(call, span);
                        return;
                    }
                    if let Some(layer) = self.text_argument(call, 0) {
                        call.arguments.remove(0);
                        if let Some(replacement) = self.compile_create(call, span, &layer) {
                            *expression = replacement;
                            return;
                        }
                        self.decline(span, GROUP_UNREADABLE);
                        let text = self.allocator.alloc_str(&layer);
                        let literal = Expression::new_string_literal(span, text, None, &self.ast);
                        call.arguments.insert(0, oxc::ast::ast::Argument::from(literal));
                    }
                    return;
                }
                Some(Tag::Props) => {
                    if let Some(classes) = self.compile_atoms(call, span, "") {
                        // `{ class: … }`. The `style` half only exists when a
                        // dynamic group is in the call, and a dynamic group is
                        // not something this arm can see yet.
                        *expression = self.object(span, vec![("class", classes)]);
                    }
                    return;
                }
                Some(Tag::CreateTheme) => {
                    match self.compile_create_theme(call, span) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            "a theme reads the token set it overrides, and this one was not \
                             declared in this module",
                        ),
                    }
                    return;
                }
                Some(Tag::DefineVars) => {
                    match self.compile_define_vars(call, span, true) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            "a token's value is not a literal this compiler can read",
                        ),
                    }
                    return;
                }
                Some(Tag::Dynamic) => {
                    match self.compile_dynamic(call, span) {
                        Some(replacement) => *expression = replacement,
                        None => self.decline(
                            span,
                            "a dynamic group's body must be an object literal of unconditional \
                             declarations",
                        ),
                    }
                    return;
                }
                _ => {}
            }

            // A call through a binding `layer` produced, which folds exactly as
            // the `atomsIn` it stands for: the layer was read as a literal in
            // this module, so it is still one here.
            if let Some(layer) = self.layer_of(&call.callee) {
                if let Some(replacement) = self.compile_atoms(call, span, &layer) {
                    *expression = replacement;
                }
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
                "a `globalCss` outside statement position has no value to be rewritten to",
            );
            return;
        }
        let Some(name) = self.compile(tag, &tagged.quasi, span) else { return };
        let name = self.allocator.alloc_str(&name);
        *expression = Expression::new_string_literal(span, name, None, &self.ast);
    }
}

/// What a group says when one of its style objects will not read.
const GROUP_UNREADABLE: &str = "a group holds a value, a key or a nesting this compiler cannot \
                                read";

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
        for (symbol, init) in bindings {
            let Expression::CallExpression(call) = without_type_wrappers(init) else { continue };
            match self.tag_of(&call.callee) {
                Some(Tag::Layer) => {
                    if let Some(name) = self.text_argument(call, 0) {
                        self.layers.insert(symbol, name);
                    }
                }
                Some(tag @ (Tag::Create | Tag::CreateIn)) => {
                    let at = usize::from(tag == Tag::CreateIn);
                    let layer = if at == 1 {
                        match self.text_argument(call, 0) {
                            Some(layer) => layer,
                            None => continue,
                        }
                    } else {
                        String::new()
                    };
                    let Some(argument) = call.arguments.get(at).and_then(|a| a.as_expression())
                    else {
                        continue;
                    };
                    let Expression::ObjectExpression(object) = without_type_wrappers(argument)
                    else {
                        continue;
                    };
                    if let Some(groups) = self.group_classes(object, &layer, false) {
                        self.groups.insert(symbol, groups.into_iter().collect());
                    }
                }
                Some(Tag::DefineVars) => {
                    let Some(tokens) = self.token_values(call) else { continue };
                    let (entries, ..) = Self::token_entries(&tokens);
                    self.groups.insert(symbol, entries.into_iter().collect());
                }
                _ => {}
            }
        }
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
    fn decline(&mut self, span: Span, reason: &str) {
        self.reports.push(Report {
            code: Code::Barq017,
            message: format!(
                "{reason}, so `@barqjs/css`'s runtime evaluates this call and its style objects \
                 are walked in the browser"
            ),
            span,
        });
    }

    /// `atomsIn` or `createIn` whose first argument is not a literal.
    ///
    /// Reported only when a style object is in the call, because a layer this
    /// pass cannot read takes the WHOLE call to the runtime — objects and all —
    /// where an opaque argument beside a literal layer takes only the merge.
    fn declined_layer(&mut self, call: &oxc::ast::ast::CallExpression<'_>, span: Span) {
        let holds_an_object = call.arguments.iter().any(|argument| {
            let Some(expression) = argument.as_expression() else { return true };
            match without_type_wrappers(expression) {
                Expression::ObjectExpression(_) => true,
                Expression::LogicalExpression(logical) => {
                    matches!(without_type_wrappers(&logical.right), Expression::ObjectExpression(_))
                }
                _ => false,
            }
        });
        if holds_an_object {
            self.decline(
                span,
                "the layer joins every class name, so it has to be a literal in the module that \
                 names it — bind it once with `layer()`",
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
                self.reports.push(Report {
                    code: Code::Barq017,
                    message: "a spread argument is not an argument list this compiler can count \
                              through, so `@barqjs/css`'s runtime evaluates this call and its \
                              style objects are walked in the browser"
                        .to_string(),
                    span,
                });
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
            let mut object_declined: Option<Span> = None;
            let read = match expression {
                Expression::ObjectExpression(_) => {
                    let read = self.declarations(expression);
                    if read.is_none() {
                        object_declined = Some(expression.span());
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
                                object_declined = Some(logical.right.span());
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
            if let Some(at) = object_declined {
                self.decline(
                    at,
                    "this style object holds a value, a key or a nesting this \
                                  compiler cannot read",
                );
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
                    "`atoms` has {conditionals} conditional arguments, so it stays on the \
                     runtime; merge them into one object, or apply the second with a separate \
                     `atoms` call"
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
                "a `null` removal has to see what came before it and an earlier argument is \
                 opaque here",
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

        let mut classes: Vec<barq_css::atoms::Atom> = Vec::new();
        let mut vars: Vec<(&'a str, Expression<'a>)> = Vec::new();
        for property in object.properties.iter_mut() {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let name = self.key_text(property)?;
            if is_condition(&name) {
                return None;
            }
            let property_name = barq_css::atoms::kebab(&name);
            let variable = barq_css::atoms::dynamic_var(&property_name);
            for atom in expand_atoms("", &property_name, "default", &format!("var({variable})")) {
                classes.push(atom);
            }
            let placeholder = Expression::new_null_literal(property.value.span(), &self.ast);
            let value = std::mem::replace(&mut property.value, placeholder);
            vars.push((self.allocator.alloc_str(&variable), value));
        }
        if classes.is_empty() {
            return None;
        }

        let class = self.emit_atoms(&classes);
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
    ) -> Option<Expression<'a>> {
        let tokens = self.token_values(call)?;
        let (entries, group, declarations) = Self::token_entries(&tokens);
        if emit && self.emitted.insert(format!("vars:{group}")) {
            self.css.push_str(&format!(":root{{{declarations}}}"));
        }

        let built: Vec<(&'a str, Expression<'a>)> = entries
            .into_iter()
            .map(|(token, reference)| {
                (
                    self.allocator.alloc_str(&token),
                    Expression::new_string_literal(
                        span,
                        self.allocator.alloc_str(&reference),
                        None,
                        &self.ast,
                    ),
                )
            })
            .collect();
        Some(self.object(span, built))
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
        let mut tokens = Vec::new();
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let name = self.key_text(property)?;
            let value = match crate::analysis::without_type_wrappers(&property.value) {
                Expression::NumericLiteral(literal) => {
                    barq_css::atoms::TokenValue::Number(literal.value)
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

    /// A token set as `(token, reference)`, its group name and its `:root`
    /// declarations. Naming only, so a token set can be known before the walk
    /// reaches it and emitted where the walk reaches it.
    fn token_entries(
        tokens: &[(String, barq_css::atoms::TokenValue)],
    ) -> (Vec<(String, String)>, String, String) {
        let group = barq_css::atoms::hash32(&barq_css::atoms::json_object(tokens));
        let mut declarations = String::new();
        let mut entries: Vec<(String, String)> = Vec::new();
        for (token, value) in tokens {
            let property = barq_css::atoms::token_property(&group, token);
            if !declarations.is_empty() {
                declarations.push(';');
            }
            let text = match value {
                barq_css::atoms::TokenValue::Text(text) => text.clone(),
                barq_css::atoms::TokenValue::Number(number) => {
                    barq_css::atoms::number_text(*number)
                }
            };
            declarations.push_str(&format!("{property}:{text}"));
            entries.push((token.clone(), format!("var({property})")));
        }
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
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let token = self.key_text(property)?;
            let value = match crate::analysis::without_type_wrappers(&property.value) {
                // What an absent optional produces, and the runtime skips it.
                Expression::Identifier(identifier) if identifier.name == "undefined" => continue,
                // `String(8.0)` is `8`, whatever the source wrote, and the two
                // sides have to hash the same text.
                Expression::NumericLiteral(literal) => barq_css::atoms::number_text(literal.value),
                other => self.text_of(other)?,
            };
            // A token the set does not carry has no property to redeclare, and
            // the runtime's regex simply fails to match it.
            let Some(property_name) = tokens
                .get(&token)
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

        let name = format!("r{}", barq_css::atoms::hash32(&declarations));
        if self.emitted.insert(name.clone()) {
            self.css.push_str(&format!(".{name}{{{declarations}}}"));
        }
        Some(Expression::new_string_literal(span, self.allocator.alloc_str(&name), None, &self.ast))
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

        let mut properties = ArenaVec::new_in(&self.allocator);
        for (name, classes) in groups {
            let key = PropertyKey::new_static_identifier(
                span,
                self.allocator.alloc_str(&name),
                &self.ast,
            );
            let value = Expression::new_string_literal(
                span,
                self.allocator.alloc_str(&classes),
                None,
                &self.ast,
            );
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
        Some(Expression::new_object_expression(span, properties, &self.ast))
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
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let name = match &property.key {
                PropertyKey::StaticIdentifier(identifier) => identifier.name.to_string(),
                PropertyKey::StringLiteral(literal) => literal.value.to_string(),
                _ => return None,
            };
            let declarations = self.declarations(&property.value)?;
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
                match applied.iter_mut().find(|slot| slot.key == atom.key) {
                    Some(slot) => *slot = atom,
                    None => applied.push(atom),
                }
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
                    match applied.iter_mut().find(|slot| slot.key == atom.key) {
                        Some(slot) => *slot = atom,
                        None => applied.push(atom),
                    }
                }
            }
        }
        applied
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
    /// tier keeps the order the author wrote it in.
    fn emit_rules(&mut self, atoms: &[barq_css::atoms::Atom]) {
        let mut sorted: Vec<&barq_css::atoms::Atom> = atoms.iter().collect();
        sorted.sort_by_key(|atom| atom.tier);
        for atom in sorted {
            if atom.rule.is_empty() || !self.emitted.insert(atom.class.clone()) {
                continue;
            }
            if let Some(layer) = layer_of_rule(&atom.rule)
                && !self.sub_layers.iter().any(|seen| seen == layer)
            {
                self.sub_layers.push(layer.to_string());
            }
            self.css.push_str(&atom.rule);
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
            Expression::StringLiteral(literal) => literal.value.to_string(),
            Expression::StaticMemberExpression(member) => {
                let symbol = crate::analysis::symbol_of(self.scoping, &member.object)?;
                self.groups.get(&symbol)?.get(member.property.name.as_str())?.clone()
            }
            // A `const` in this module holding a class string, which is what
            // every folded `atoms` call above it has become.
            Expression::Identifier(_) => {
                let symbol = crate::analysis::symbol_of(self.scoping, expression)?;
                self.folded.get(&symbol)?.clone()
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
        for property in &object.properties {
            let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
            let name = self.key_text(property)?;
            let value = crate::analysis::without_type_wrappers(&property.value);

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
            for entry in &conditions.properties {
                let ObjectPropertyKind::ObjectProperty(entry) = entry else { return None };
                let inner = self.key_text(entry)?;
                let where_ = if inner == "default" {
                    condition.to_string()
                } else {
                    join(condition, &inner)
                };
                let value = crate::analysis::without_type_wrappers(&entry.value);
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
        for entry in &object.properties {
            let ObjectPropertyKind::ObjectProperty(entry) = entry else { return None };
            let inner = self.key_text(entry)?;
            let where_ =
                if inner == "default" { condition.to_string() } else { join(condition, &inner) };
            let value = crate::analysis::without_type_wrappers(&entry.value);
            match value {
                Expression::ObjectExpression(deeper) => {
                    self.conditions(deeper, property, &where_, out)?;
                }
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
            Expression::NumericLiteral(literal) => {
                let raw =
                    literal.raw.map_or_else(|| literal.value.to_string(), |raw| raw.to_string());
                Some(vec![(
                    property.to_string(),
                    condition.to_string(),
                    Some(barq_css::atoms::number_value(property, &raw)),
                )])
            }
            // `firstThatWorks(…)`: the declaration repeated, best last.
            Expression::CallExpression(call)
                if self.tag_of(&call.callee) == Some(Tag::FirstThatWorks) =>
            {
                let mut values = Vec::new();
                for argument in &call.arguments {
                    let expression = argument.as_expression()?;
                    values.push(match crate::analysis::without_type_wrappers(expression) {
                        Expression::NumericLiteral(literal) => literal
                            .raw
                            .map_or_else(|| literal.value.to_string(), |raw| raw.to_string()),
                        other => self.text_of(other)?,
                    });
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
                let value = if self.is_numeric(other) {
                    barq_css::atoms::number_value(property, &text)
                } else {
                    text
                };
                Some(vec![(property.to_string(), condition.to_string(), Some(value))])
            }
        }
    }

    fn tag_of(&self, tag: &Expression<'_>) -> Option<Tag> {
        let Expression::Identifier(identifier) = without_type_wrappers(tag) else { return None };
        let symbol = self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
        self.tags.get(&symbol).copied()
    }

    /// The layer a binding `layer` produced carries, if the callee is one.
    fn layer_of(&self, callee: &Expression<'_>) -> Option<String> {
        let Expression::Identifier(identifier) = without_type_wrappers(callee) else { return None };
        let symbol = self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
        self.layers.get(&symbol).cloned()
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
                    message: format!("this CSS could not be compiled: {}", error.message),
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
            let text = element
                .value
                .cooked
                .as_ref()
                .map_or_else(|| element.value.raw.as_str(), |cooked| cooked.as_str());
            source.push_str(text);
            let Some(expression) = quasi.expressions.get(index) else { continue };
            match self.text_of(expression) {
                Some(folded) => source.push_str(&folded),
                None => {
                    self.reports.push(Report {
                        code: Code::Barq015,
                        message: "this interpolation is not known at compile time, so the block \
                                  stays on the runtime; move the value into a CSS custom property \
                                  and set it through `style`"
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

    /// Whether a foldable expression's value is a NUMBER rather than its text.
    fn is_numeric(&self, expression: &Expression<'_>) -> bool {
        crate::analysis::symbol_of(self.scoping, expression)
            .is_some_and(|symbol| self.numeric.contains(&symbol))
    }

    fn text_of(&self, expression: &Expression<'_>) -> Option<String> {
        match without_type_wrappers(expression) {
            Expression::StringLiteral(literal) => Some(literal.value.to_string()),
            Expression::NumericLiteral(literal) => {
                Some(literal.raw.map_or_else(|| literal.value.to_string(), |raw| raw.to_string()))
            }
            Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
                template.quasis.first().map(|quasi| {
                    quasi
                        .value
                        .cooked
                        .as_ref()
                        .map_or_else(|| quasi.value.raw.to_string(), |cooked| cooked.to_string())
                })
            }
            Expression::Identifier(identifier) => {
                let symbol =
                    self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
                self.folded.get(&symbol).cloned()
            }
            // `theme.brand` — a token set or a `create` group this module
            // produced, whose values are strings by the time the walk gets
            // here. Without it a block interpolating a token stayed on the
            // runtime, which is the one thing tokens exist to avoid.
            Expression::StaticMemberExpression(member) => {
                let symbol = crate::analysis::symbol_of(self.scoping, &member.object)?;
                self.groups.get(&symbol)?.get(member.property.name.as_str()).cloned()
            }
            _ => None,
        }
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
    if outer == "default" {
        inner.to_string()
    } else {
        format!("{outer}{}{inner}", barq_css::atoms::NEST)
    }
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
        Expression::StringLiteral(literal) => Some((literal.value.to_string(), false)),
        Expression::NumericLiteral(literal) => Some((
            literal.raw.map_or_else(|| literal.value.to_string(), |raw| raw.to_string()),
            true,
        )),
        Expression::TemplateLiteral(template) if template.expressions.is_empty() => {
            template.quasis.first().map(|quasi| {
                (
                    quasi
                        .value
                        .cooked
                        .as_ref()
                        .map_or_else(|| quasi.value.raw.to_string(), |cooked| cooked.to_string()),
                    false,
                )
            })
        }
        _ => None,
    }
}

fn key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.to_string()),
        _ => None,
    }
}

/// The layer a rule is wrapped in, without the tier `atom_in` appended.
///
/// Read back off the rule rather than threaded through, because `emit_rules`
/// is the only place that sees every rule a call produced and a `create` group
/// reaches it by a different route than an `atoms` call does.
fn layer_of_rule(rule: &str) -> Option<&str> {
    let after = rule.strip_prefix("@layer ")?;
    let name = &after[..after.find('{')?];
    Some(&name[..name.rfind('.')?])
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
        let Some(close) = matching_brace(css, body) else {
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

/// Where the block opened at `from` closes.
fn matching_brace(text: &str, from: usize) -> Option<usize> {
    let mut depth = 1i32;
    for (offset, character) in text[from..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(from + offset);
                }
            }
            _ => {}
        }
    }
    None
}

/// A declaration, expanded through any shorthand it is.
///
/// An unexpandable shorthand is left whole rather than half-expanded: its
/// values go to sub-properties by TYPE, so counting them cannot say which one
/// a value belongs to, and guessing is worse than not expanding.
fn expand_atoms(
    layer: &str,
    property: &str,
    condition: &str,
    value: &str,
) -> Vec<barq_css::atoms::Atom> {
    match barq_css::atoms::expand(property, value) {
        Some(longhands) => longhands
            .into_iter()
            .map(|(name, own)| barq_css::atoms::atom_in(layer, &name, condition, &own))
            .collect(),
        None => vec![barq_css::atoms::atom_in(layer, property, condition, value)],
    }
}

/// The local symbols `css` / `keyframes` / `globalCss` were imported as.
fn imported_tags(program: &Program<'_>, css_source: &str) -> FxHashMap<SymbolId, Tag> {
    let mut out = FxHashMap::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != css_source {
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

    const IMPORT: &str =
        "import { atoms, atomsIn, create, createIn, globalCss, layer } from \"@barqjs/css\";\n";

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
            "globalCss`@layer barq.reset, barq.ui;`;\n             export const a = atomsIn(\"barq.ui\", { color: \"red\" });",
        );
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.contains("@layer barq.reset, barq.ui;"), "{css}");
        assert!(css.contains("@layer barq.ui.base{"), "{css}");
    }

    /// `atomsIn` folds like `atoms`, and its rules land in the layer it names.
    /// Without this the whole of `@barqjs/ui` stayed on the runtime and its CSS
    /// travelled inside the JS bundle instead of in a stylesheet.
    #[test]
    fn a_layered_call_folds_and_its_rules_are_in_the_layer() {
        let out = run("export const a = atomsIn(\"barq.ui\", { color: \"red\", paddingTop: 8 });");
        assert!(!out.code.contains("atomsIn("), "the call survived: {}", out.code);
        let css = out.css.as_deref().unwrap_or_default();
        // The order statement first, then one block per tier the call used.
        assert!(css.starts_with(&barq_css::atoms::sub_layer_order("barq.ui")), "{css}");
        assert!(css.contains("@layer barq.ui.base{"), "{css}");
        assert!(css.contains("color:red"), "{css}");
        assert!(css.contains("padding-top:8px"), "{css}");
        // One block, not one per atom.
        assert_eq!(css.matches("@layer barq.ui.base{").count(), 1, "{css}");
    }

    /// Tier order is the CASCADE's now, not the order two modules happened to
    /// be emitted in. Within one call the two agree; across modules they did
    /// not, and three pairs on the gallery were decided the wrong way round.
    #[test]
    fn each_tier_is_its_own_sub_layer_and_the_order_is_declared_once() {
        let out = run(
            "export const a = atomsIn(\"barq.ui\", { color: { default: \"red\", \":hover\": \"blue\", \
             \"@media print\": \"green\" }, \"& > *\": { color: \"grey\" } });",
        );
        let css = out.css.as_deref().unwrap_or_default();
        let order = barq_css::atoms::sub_layer_order("barq.ui");
        assert_eq!(
            order,
            "@layer barq.ui.descendant, barq.ui.base, barq.ui.select, barq.ui.element, \
             barq.ui.media;"
        );
        assert!(css.starts_with(&order), "{css}");
        // Declared once however many blocks follow it.
        assert_eq!(css.matches(&order).count(), 1, "{css}");
        for tier in ["descendant", "base", "select", "media"] {
            assert!(css.contains(&format!("@layer barq.ui.{tier}{{")), "{tier}: {css}");
        }
        // And the plain layer is gone: a rule in `barq.ui` and not in one of
        // its sub-layers would beat every sub-layer, whatever its tier.
        assert!(!css.contains("@layer barq.ui{"), "{css}");
    }

    /// An UNLAYERED atom keeps no layer at all. A layered rule loses to an
    /// unlayered one whatever its specificity, so wrapping these would put an
    /// application's own `* { margin: 0 }` above every margin on the page —
    /// measured in a browser, and it is why `atoms` is unlayered.
    #[test]
    fn an_unlayered_atom_is_not_given_a_sub_layer() {
        let out =
            run("export const a = atoms({ color: \"red\", \"@media print\": { color: \"b\" } });");
        let css = out.css.as_deref().unwrap_or_default();
        assert!(!css.contains("@layer"), "{css}");
    }

    /// `const ui = layer("barq.ui")` folds exactly as the `atomsIn` it stands
    /// for. Naming the layer at all 192 call sites was the price of folding at
    /// all; naming it once a module is the same fact in the place a reader
    /// looks for it.
    #[test]
    fn a_call_through_a_layer_binding_folds_into_that_layer() {
        let out = run(
            "const ui = layer(\"barq.ui\");\n             export const a = ui({ color: \"red\", paddingTop: 8 });",
        );
        let plain =
            run("export const a = atomsIn(\"barq.ui\", { color: \"red\", paddingTop: 8 });");
        assert_eq!(out.css, plain.css);
        assert!(!out.code.contains("ui({"), "the call survived: {}", out.code);
        // The binding stays: a sibling call this pass declines still makes it.
        assert!(out.code.contains("layer(\"barq.ui\")"), "{}", out.code);
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

    /// `createIn` is `create` in a layer, so a treatment shared across a
    /// package is written once and its rules land where the package's do.
    #[test]
    fn create_in_puts_its_groups_in_the_layer() {
        let out = run(
            "export const shared = createIn(\"barq.ui\", { ring: { outlineWidth: \"3px\" } });",
        );
        let css = out.css.as_deref().unwrap_or_default();
        assert!(css.starts_with(&barq_css::atoms::sub_layer_order("barq.ui")), "{css}");
        assert!(css.contains("@layer barq.ui.base{"), "{css}");
        assert!(css.contains("outline-width:3px"), "{css}");
        assert!(out.code.contains("ring:"), "{}", out.code);
        assert!(!out.code.contains("createIn("), "the call survived: {}", out.code);
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

    /// A layer that is not a literal cannot become part of a name, so the call
    /// stays whole and the runtime computes it.
    #[test]
    fn a_layer_the_compiler_cannot_read_is_left_alone() {
        let out =
            run("declare const name: string;\nexport const a = atomsIn(name, { color: \"red\" });");
        assert!(out.code.contains("atomsIn("), "{}", out.code);
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

    const IMPORT: &str = "import { atoms, atomsIn, create, createIn, createTheme, defineVars, \
                          dynamic, globalCss, layer, props } from \"@barqjs/css\";\n";

    fn run(body: &str) -> CompileOutput {
        compile(&format!("{IMPORT}{body}"), &ResolvedOptions::with_filename("s.tsx"))
            .expect("compiles")
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
                "export const a = atomsIn(LAYER, { color: \"red\" });",
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
             export const b = atomsIn(LAYER, { padding: 8 });");
        let literal = run("export const a = atomsIn(\"barq.ui\", { color: \"red\" });\n\
             export const b = atomsIn(\"barq.ui\", { padding: 8 });");
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

    /// The line is at the OBJECT, not at the call. An argument this pass cannot
    /// read that is a class string folds its neighbours, puts their rules in
    /// the stylesheet and leaves a merge over strings — which reaches none of
    /// the machinery BARQ017 is about. Reporting it would fire 127 times in
    /// `@barqjs/ui` on the documented idiom.
    #[test]
    fn an_opaque_class_string_is_a_merge_and_reports_nothing() {
        let out = run(
            "import { shared } from \"./s.ts\";\nexport const a = atomsIn(\"barq.ui\", shared.ring, { color: \"red\" });",
        );
        assert!(out.code.contains("a-color_"), "the literal did not fold: {}", out.code);
        assert!(codes(&out).is_empty(), "{:?}", codes(&out));
    }

    #[test]
    fn a_call_that_folds_whole_reports_nothing() {
        let out = run("export const a = atomsIn(\"barq.ui\", { color: \"red\", padding: 8 });");
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
            "const ui = layer(\"barq.ui\");\nexport const a = ui({ color: \"red\" });\nexport const g = createIn(\"barq.ui\", { r: { padding: 8 } });",
        );
        assert!(out.warnings.iter().all(|warning| warning.code.is_none()), "{:?}", codes(&out));
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
