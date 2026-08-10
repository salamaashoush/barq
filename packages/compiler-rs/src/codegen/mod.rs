pub mod backend;
pub mod dom;
mod fallback;
mod install;
pub mod interp;
pub mod mappings;
mod prune;
pub mod ssr;

pub use backend::{At, Backend};

use oxc::allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, Expression, IdentifierName, Program,
    Statement,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_arrow_function_expression, walk_expression, walk_statements};
use oxc::span::{GetSpan, Span};

use crate::ir::{Module, NONE, Ns, Root, Site, TemplateId, Unit, UnitId};
use crate::options::{Opt, ResolvedOptions};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Target {
    #[default]
    Dom,
    Ssr,
    /// `CODESIGN.md` §6 L2. Serialises the analysed IR beside the module and
    /// lets `@barqjs/core/interp` walk it, instead of printing the walk and the
    /// patch program as JavaScript. It runs the DOM backend's passes and reads
    /// the DOM backend's artefacts — the anchors, the template bytes, the ref
    /// plan — because "the compiler knows more than the reference" has to be
    /// structurally impossible, not merely unintended.
    Interp,
}

impl Target {
    pub fn of(options: &ResolvedOptions) -> Self {
        match (options.interp, options.ssr) {
            (true, _) => Self::Interp,
            (false, true) => Self::Ssr,
            (false, false) => Self::Dom,
        }
    }

    /// Whether this target consumes the three passes DESIGN §5 calls DOM
    /// concepts: a `<!---->` is an insert anchor, a `template()` is a parse, and
    /// an address is a sibling walk.
    #[inline]
    pub fn walks_the_dom(self) -> bool {
        matches!(self, Self::Dom | Self::Interp)
    }
}

pub const HELPER_COUNT: usize = 27;

/// The first helper that lives in `<module_source>/server` rather than in the
/// module source itself. The string backend calls into `ssr.ts`, which the DOM
/// bundle must never pull in.
pub const FIRST_SERVER_HELPER: usize = 10;

/// The first helper that lives in `<module_source>/interp`. The reference
/// backend is DEV and test only, so its entry point is a third source and never
/// reaches a production bundle through the other two.
pub const FIRST_INTERP_HELPER: usize = 26;

/// Runtime entry points the two backends are allowed to call. Every one is read
/// off `packages/core/src/dom.ts` or `packages/core/src/ssr.ts`; nothing else is
/// emitted.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Helper {
    Template = 0,
    Insert = 1,
    SetProp = 2,
    CreateElement = 3,
    Fragment = 4,
    RenderEffect = 5,
    DelegateEvents = 6,
    /// `_$props([…])` — C9's ordered source list. Returns its single argument
    /// unchanged when the list is one plain record, which is the overwhelming
    /// case and pays nothing.
    Props = 7,
    /// `_$cell(v)` — a Cell carrying a value evaluated exactly once. The form a
    /// FUNCTION-valued prop takes, so `props.onClick()` returns the same object
    /// every time and C5's identity claim survives a handler.
    Cell = 8,
    /// `_$b(fn)` — §3.0 rule 3's brand. Marks a Block that USES the scope it is
    /// handed, once per definition site, so kind travels with the VALUE and a
    /// consumer never has to guess it from arity. It is what makes a Block
    /// landing in a Cell slot throw instead of being invoked with `undefined`
    /// and silently stringified.
    Block = 9,
    // ── `<module_source>/server` ──────────────────────────────────────────
    Esc = 10,
    EscAttr = 11,
    Attr = 12,
    Cls = 13,
    Content = 14,
    Html = 15,
    RawText = 16,
    SpreadAttrs = 17,
    SsrFor = 18,
    SsrIndex = 19,
    SsrRepeat = 20,
    SsrShow = 21,
    SsrSwitch = 22,
    SsrMatch = 23,
    ClsList = 24,
    AttrLit = 25,
    // ── `<module_source>/interp` ──────────────────────────────────────────
    Interp = 26,
}

const IMPORTED: [&str; HELPER_COUNT] = [
    "template",
    "insert",
    "setProp",
    "createElement",
    "Fragment",
    "renderEffect",
    "delegateEvents",
    "props",
    "cell",
    "block",
    "esc",
    "escAttr",
    "attr",
    "cls",
    "content",
    "html",
    "rawText",
    "spreadAttrs",
    "ssrFor",
    "ssrIndex",
    "ssrRepeat",
    "ssrShow",
    "ssrSwitch",
    "ssrMatch",
    "clsList",
    "attrLit",
    "interp",
];

const SERVER: &str = "/server";
const INTERP: &str = "/interp";

/// A prefix no `<prefix><helper>` in the source collides with.
///
/// One scan, not one per helper: a collision has to begin with the sigil, so
/// the sigil's own occurrences are the only positions worth testing, and there
/// are almost never any. Twenty-two `contains` calls over the whole source cost
/// 2.1 µs of a 27 µs compile once the string backend's helpers joined the list.
pub(crate) fn free_sigil(source: &str) -> String {
    let mut sigil = String::from("_$");
    while source.match_indices(sigil.as_str()).any(|(at, _)| {
        let rest = &source[at + sigil.len()..];
        IMPORTED.iter().any(|suffix| rest.starts_with(suffix))
    }) {
        sigil.push('$');
    }
    sigil
}

/// Every helper's local name, packed end to end into one arena string and
/// handed out as slices of it.
pub(crate) fn helper_names<'a>(sigil: &str, allocator: &'a Allocator) -> [&'a str; HELPER_COUNT] {
    let width: usize = IMPORTED.iter().map(|suffix| sigil.len() + suffix.len()).sum();
    let mut packed = String::with_capacity(width);
    for suffix in IMPORTED {
        packed.push_str(sigil);
        packed.push_str(suffix);
    }
    let packed = allocator.alloc_str(&packed) as &'a str;

    let mut local = [""; HELPER_COUNT];
    let mut at = 0;
    for (index, suffix) in IMPORTED.iter().enumerate() {
        let end = at + sigil.len() + suffix.len();
        local[index] = &packed[at..end];
        at = end;
    }
    local
}

/// Stage 5 (P8a) plus the module preamble. The IR is final — every unit already
/// carries its `TemplateId`, its `RefPlan` and its patch program — so this stage
/// only prints. It is also the only stage that writes to the program, which it
/// can do freely because no part of the IR borrows the AST.
pub fn emit<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
    target: Target,
) {
    let mut emit = Emit::new(allocator, program.source_text, module, options, target);
    emit.visit_program(program);
    prune::run(&mut emit, program);
    install::run(&mut emit, program);
}

pub struct Emit<'a, 'm> {
    pub allocator: &'a Allocator,
    pub ast: AstBuilder<'a>,
    pub module: &'m mut Module<'a>,
    pub source: &'a str,
    pub module_source: &'a str,
    /// `<module_source>/server` — where P8b's helpers come from.
    pub server_source: &'a str,
    /// `<module_source>/interp` — the reference backend's only entry point.
    pub interp_source: &'a str,
    pub target: Target,
    /// One `const _ir$N = […]` per unit the reference backend serialised, in
    /// unit order. Built while the roots are visited and spliced by `install`,
    /// which is the only stage that may add module-scope statements.
    pub interp_units: Vec<Statement<'a>>,
    /// The three optimisations codegen owns: η-reduction, module-scope hoisting
    /// of a capture-free handler, and statement splicing.
    pub opt: Opt,
    pub used: [bool; HELPER_COUNT],
    pub local: [&'a str; HELPER_COUNT],
}

impl<'a, 'm> Emit<'a, 'm> {
    fn new(
        allocator: &'a Allocator,
        source: &'a str,
        module: &'m mut Module<'a>,
        options: &ResolvedOptions,
        target: Target,
    ) -> Self {
        let local = module.helpers;
        let used = module.used_helpers;
        let mut server_source = String::with_capacity(options.module_source.len() + SERVER.len());
        server_source.push_str(&options.module_source);
        server_source.push_str(SERVER);
        let mut interp_source = String::with_capacity(options.module_source.len() + INTERP.len());
        interp_source.push_str(&options.module_source);
        interp_source.push_str(INTERP);
        Self {
            allocator,
            ast: AstBuilder::new(allocator),
            module,
            source,
            module_source: allocator.alloc_str(&options.module_source),
            server_source: allocator.alloc_str(&server_source),
            interp_source: allocator.alloc_str(&interp_source),
            target,
            interp_units: Vec::new(),
            opt: options.opt,
            used,
            local,
        }
    }

    // ── AST construction ──────────────────────────────────────────────────

    pub fn ident(&self, name: &'a str, span: Span) -> Expression<'a> {
        Expression::new_identifier(span, name, &self.ast)
    }

    pub fn string(&self, value: &'a str, span: Span) -> Expression<'a> {
        Expression::new_string_literal(span, value, None, &self.ast)
    }

    pub fn member(&self, object: Expression<'a>, property: &'a str, span: Span) -> Expression<'a> {
        let property = IdentifierName::new(span, property, &self.ast);
        Expression::new_static_member_expression(span, object, property, false, &self.ast)
    }

    pub fn call(
        &self,
        callee: Expression<'a>,
        arguments: Vec<Argument<'a>>,
        span: Span,
    ) -> Expression<'a> {
        let arguments = ArenaVec::from_iter_in(arguments, &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    /// `_s$` — the scope the enclosing Block was given. CODESIGN §3.3 C6 puts
    /// it FIRST on every ABI primitive that constructs, so a Block reached with
    /// no scope throws at the primitive rather than building under whatever was
    /// ambient. One identifier at every position, so lexical shadowing does the
    /// threading and a module-level unit reaches `const _s$ = null`.
    pub fn scope(&mut self, span: Span) -> Expression<'a> {
        let name = self.module.uids.scope();
        self.ident(name, span)
    }

    pub fn helper(&mut self, helper: Helper, span: Span) -> Expression<'a> {
        let index = helper as usize;
        self.used[index] = true;
        self.ident(self.local[index], span)
    }

    pub fn template_name(&self, id: TemplateId) -> &'a str {
        self.module.uids.template(id, self.allocator)
    }

    /// A unit is dead once it has been printed, so it is swapped out rather
    /// than borrowed — `emit_unit` needs the whole `Emit` and the unit at once,
    /// and an empty `Unit` costs no allocation to stand in.
    fn unit(&mut self, id: UnitId, span: Span) -> Expression<'a> {
        let empty = Unit::new_in(self.allocator, Ns::Html, Site::Nested(span));
        let mut unit = std::mem::replace(&mut self.module.units[id as usize], empty);
        let expression = match self.target {
            Target::Dom => dom::emit_unit(self, &mut unit, span),
            Target::Ssr => ssr::emit_unit_root(self, &mut unit, span),
            Target::Interp => interp::emit_unit(self, &mut unit, id, span),
        };
        self.module.units[id as usize] = unit;
        expression
    }

    fn root(&mut self, index: u32, span: Span) -> Expression<'a> {
        match std::mem::replace(&mut self.module.roots[index as usize], Root::Unit(NONE)) {
            Root::Unit(id) => self.unit(id, span),
            Root::Verbatim(jsx) => self.jsx(jsx),
            Root::Pending(..) => unreachable!("P1 lowers every root it is handed"),
        }
    }

    /// The placeholder's unit, when its recorded [`Site`] says its statements
    /// may be spliced into the enclosing body instead of wrapped in an IIFE.
    fn spliceable(&self, expression: &Expression<'a>) -> Option<(u32, UnitId)> {
        // The other two backends produce one expression and no statements, so
        // there is nothing to splice and every root goes through `root`.
        if self.target != Target::Dom || !self.opt.splice {
            return None;
        }
        let Expression::Identifier(identifier) = expression else { return None };
        let index = self.module.uids.root_index(identifier.name.as_str())?;
        let Root::Unit(id) = self.module.roots[index as usize] else { return None };
        let unit = self.module.units.get(id as usize)?;
        (!unit.site.needs_iife()).then_some((index, id))
    }

    /// A statement whose whole value is one spliceable placeholder.
    fn host(&self, statement: &Statement<'a>) -> Option<(u32, UnitId)> {
        match statement {
            Statement::ReturnStatement(it) => {
                it.argument.as_ref().and_then(|value| self.spliceable(value))
            }
            Statement::VariableDeclaration(it) if it.declarations.len() == 1 => {
                it.declarations[0].init.as_ref().and_then(|value| self.spliceable(value))
            }
            _ => None,
        }
    }

    fn parts(
        &mut self,
        index: u32,
        id: UnitId,
        span: Span,
    ) -> (Vec<Statement<'a>>, Expression<'a>) {
        self.module.roots[index as usize] = Root::Unit(NONE);
        let empty = Unit::new_in(self.allocator, Ns::Html, Site::Nested(span));
        let mut unit = std::mem::replace(&mut self.module.units[id as usize], empty);
        let parts = dom::emit_unit_parts(self, &mut unit, span);
        self.module.units[id as usize] = unit;
        parts
    }

    fn jsx(&mut self, expression: Expression<'a>) -> Expression<'a> {
        if self.target == Target::Ssr {
            return ssr::emit_verbatim_root(self, expression);
        }
        self.create_element_path(expression)
    }

    /// The un-compiled path, for both backends: the string backend falls back
    /// to it for a component tag it cannot resolve.
    pub(super) fn create_element_path(&mut self, expression: Expression<'a>) -> Expression<'a> {
        match expression {
            Expression::JSXElement(element) => self.create_element(element),
            Expression::JSXFragment(fragment) => self.fragment_call(fragment),
            other => other,
        }
    }
}

/// Installs one compiled root per placeholder, and lowers whatever JSX P1
/// refused through `createElement`. Walking the replacement is what reaches the
/// units nested inside a hole expression.
///
/// Statement splicing (DESIGN §4): a unit whose root sits in a return, a
/// declarator initialiser or an arrow's expression body emits its walk and its
/// patch program as FLAT statements of the enclosing body — one fewer closure
/// allocation and one fewer stack frame per component instance, and far more
/// readable output. Every statement below is visited exactly once; visiting a
/// placeholder twice would look up a root that has already been consumed.
impl<'a> VisitMut<'a> for Emit<'a, '_> {
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        if !it.iter().any(|statement| self.host(statement).is_some()) {
            walk_statements(self, it);
            return;
        }
        let taken = std::mem::replace(it, ArenaVec::new_in(&self.allocator));
        let mut out = ArenaVec::with_capacity_in(taken.len(), &self.allocator);
        for mut statement in taken {
            let Some((index, id)) = self.host(&statement) else {
                self.visit_statement(&mut statement);
                out.push(statement);
                continue;
            };
            let (statements, root) = self.parts(index, id, statement.span());
            for mut spliced in statements {
                self.visit_statement(&mut spliced);
                out.push(spliced);
            }
            implant(&mut statement, root);
            self.visit_statement(&mut statement);
            out.push(statement);
        }
        *it = out;
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        if let Some(found) =
            it.body.as_expression().and_then(|body| self.spliceable(body).map(|f| (f, body.span())))
        {
            let ((index, id), span) = found;
            let (statements, root) = self.parts(index, id, span);
            if statements.is_empty() {
                *it.body.as_expression_mut().expect("checked above") = root;
            } else {
                let mut statements = statements;
                statements.push(Statement::new_return_statement(span, Some(root), &self.ast));
                it.body = ArrowFunctionBody::new_function_body(
                    span,
                    ArenaVec::new_in(&self.allocator),
                    ArenaVec::from_iter_in(statements, &self.allocator),
                    &self.ast,
                );
            }
        }
        walk_arrow_function_expression(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::Identifier(identifier) = it
            && let Some(index) = self.module.uids.root_index(identifier.name.as_str())
        {
            let span = identifier.span;
            *it = self.root(index, span);
        } else if matches!(it, Expression::JSXElement(_) | Expression::JSXFragment(_)) {
            let taken = it.take_in(&self.allocator);
            *it = self.jsx(taken);
        }
        walk_expression(self, it);
    }
}

/// Puts the unit's value back where its placeholder stood.
fn implant<'a>(statement: &mut Statement<'a>, root: Expression<'a>) {
    match statement {
        Statement::ReturnStatement(it) => it.argument = Some(root),
        Statement::VariableDeclaration(it) => it.declarations[0].init = Some(root),
        _ => unreachable!("only the two shapes `host` matches are ever spliced"),
    }
}
