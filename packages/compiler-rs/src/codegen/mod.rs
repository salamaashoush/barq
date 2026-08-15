pub mod backend;
mod brand;
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
    /// a REF PLAN is a sibling walk. §3.11's compile-time addresses are not on
    /// that list and never were — they are computed for every target, out of the
    /// patch program, which is the artefact the targets share.
    #[inline]
    pub fn walks_the_dom(self) -> bool {
        matches!(self, Self::Dom | Self::Interp)
    }
}

pub const HELPER_COUNT: usize = 55;

/// The first helper that lives in `<module_source>/server` rather than in the
/// module source itself. The string backend calls into `ssr.ts`, which the DOM
/// bundle must never pull in.
pub const FIRST_SERVER_HELPER: usize = 31;

/// The first helper that lives in `<module_source>/interp`. The reference
/// backend is DEV and test only, so its entry point is a third source and never
/// reaches a production bundle through the other two.
pub const FIRST_INTERP_HELPER: usize = 54;

/// The names that exist in BOTH runtime halves: §3.0's three ABI constructors
/// and `flow.ts`'s four primitives with `each`'s count symbol.
///
/// `CODESIGN.md` §3.11's "one ABI means no fallback cliff", applied to a runtime
/// entry point rather than to a call: one name, one argument order, two
/// implementations, and the SOURCE is what the target chooses. A module compiled
/// for the DOM imports `branch` from `@barqjs/core`; the same module compiled
/// for the server imports `branch` from `@barqjs/core/server`. Nothing between
/// the two emissions differs — not the helper, not the arity, not the order —
/// which is what makes `region_call` one function rather than two.
///
/// It is also what makes the string backend's own claim checkable: a module
/// compiled for the server imports from the server entry and from nowhere else,
/// so `@barqjs/core`'s DOM runtime cannot reach a server bundle through a helper
/// that merely happens to be DOM-free today.
pub const SHARED_ABI: std::ops::Range<usize> = (Helper::Props as usize)..(Helper::SetAttr as usize);

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
    /// `_$bindEffect($s, compute, apply)` — the element-binding effect, O4.5.
    ///
    /// Scope FIRST, like every other entry point on this surface. The bare
    /// `renderEffect(compute, apply)` this replaces took no scope at all, so the
    /// whole attribute/class/style/domprop channel was owned by whatever was
    /// ambient at the call site rather than by the scope its Block was handed —
    /// the exact defect O4.5 names, in the one channel the compiled path uses
    /// most. It is also what makes `brand`'s `ReadsScope` see these components:
    /// a body whose only reactive work is an element binding now mentions `_s$`.
    BindEffect = 5,
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
    // ── `flow.ts`'s four primitives, plus `each`'s count-mode symbol ──────
    //
    // `CODESIGN.md` §3.4. These are what the fourteen control-flow constructs
    // lower ONTO: the compiler hands each one the `(parent, anchor)` pair its
    // own template walk computed, and a flags integer carrying the properties it
    // proved.
    Branch = 10,
    Each = 11,
    Boundary = 12,
    Portal = 13,
    /// `COUNT` — `each`'s fourth mode, where `src` is a count rather than a list.
    Count = 14,
    // ── §3.5's resolved channels ──────────────────────────────────────────
    //
    // One entry point per channel, chosen at compile time. There is no
    // `setProp` on the compiled path: the name never reaches the runtime as a
    // question, only as the argument the channel already knows what to do with.
    SetAttr = 15,
    SetDomProp = 16,
    SetBool = 17,
    SetClass = 18,
    SetStyle = 19,
    SetStyleProp = 20,
    SetClassList = 21,
    SetHtml = 22,
    /// `_$bindProp($s, el, _$setAttr, "id", v)` — the ONE question §3.13 keeps
    /// at run time: whether the value that arrived is a live Cell. The channel
    /// is the compiler's and is passed in.
    BindProp = 23,
    /// `bind:` — the two-way channel, property and reporting event resolved.
    BindValue = 24,
    /// A scope-owned `ref` registration (B3, E2 #7).
    Ref = 25,
    /// A scope-owned `addEventListener` (B4, E2 #6).
    Listen = 26,
    /// The delegated/direct choice made at compile time, applied to a value the
    /// compiler could not prove is a handler.
    BindEvent = 27,
    // ── the hydration-only walk (`SEMANTICS.md` H3) ───────────────────────
    //
    // `child(n, 3)` is H3's own spelling. Under `hydratable` the template walk
    // goes through these two instead of `.firstChild`/`.nextSibling`, because
    // the server's children are the template's skeleton PLUS a `<!--[-->` …
    // `<!--]-->` range at every hole, and a native sibling step counts those.
    // A logical step does not: a whole range contributes nothing.
    //
    // They exist ONLY under `hydratable`. H3's "the index must cost nothing on
    // the client-render path" is the diff between the two emissions, and with
    // the flag off not one of these appears.
    /// `_$child(base, k)` — the k-th logical child, from the start when `k >= 0`
    /// and from the end when `k < 0` (`-1` is the last).
    Child = 28,
    /// `_$sib(base, k)` — `k` logical siblings forward, or `-k` backward.
    Sib = 29,
    /// `_$hole(parent, anchor, build)` — claim the server's range at a hole,
    /// THEN build the value that goes in it.
    ///
    /// It exists for one evaluation-order fact: `_$insert(s, el, Comp(s, {}))`
    /// evaluates `Comp` before `insert` is entered, so a component in a child
    /// position would claim from wherever the enclosing walk happened to leave
    /// the cursor rather than from its own hole. The compiler knows the position
    /// statically — that is what an address IS — so it says so, instead of the
    /// runtime guessing from the shape of the tree it is walking.
    Hole = 30,
    // ── `<module_source>/server` ──────────────────────────────────────────
    Esc = 31,
    EscAttr = 32,
    Attr = 33,
    Cls = 34,
    Content = 35,
    Html = 36,
    RawText = 37,
    SpreadAttrs = 38,
    SsrFor = 39,
    SsrIndex = 40,
    SsrRepeat = 41,
    SsrShow = 42,
    SsrSwitch = 43,
    SsrMatch = 44,
    ClsList = 45,
    AttrLit = 46,
    SsrLoading = 47,
    SsrErrored = 48,
    SsrErrorBoundary = 49,
    SsrPortal = 50,
    SsrAwait = 51,
    SsrDynamic = 52,
    SsrReveal = 53,
    // ── `<module_source>/interp` ──────────────────────────────────────────
    Interp = 54,
}

const IMPORTED: [&str; HELPER_COUNT] = [
    "template",
    "insert",
    "setProp",
    "createElement",
    "Fragment",
    "bindEffect",
    "delegateEvents",
    "props",
    "cell",
    "block",
    "branch",
    "each",
    "boundary",
    "portal",
    "COUNT",
    "setAttr",
    "setDomProp",
    "setBool",
    "setClass",
    "setStyle",
    "setStyleProp",
    "setClassList",
    "setHtml",
    "bindProp",
    "bindValue",
    "ref",
    "listen",
    "bindEvent",
    "child",
    "sib",
    "hole",
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
    "ssrLoading",
    "ssrErrored",
    "ssrErrorBoundary",
    "ssrPortal",
    "ssrAwait",
    "ssrDynamic",
    "ssrReveal",
    "interp",
];

/// The name a helper is imported under, for a test that has to check the table
/// rather than trust it.
#[cfg(test)]
pub(crate) fn imported_name(helper: Helper) -> &'static str {
    IMPORTED[helper as usize]
}

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
    brand::run(&mut emit, program);
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
    /// `CODESIGN.md` §3.11. Both backends read it, and it is the only option
    /// outside `Opt` that changes the bytes: the string backend writes range
    /// boundaries and the DOM backend walks logically.
    pub hydratable: bool,
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
            hydratable: options.hydratable,
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

    /// A region no patch claimed, expanded where its placeholder stands. The
    /// primitive is handed `(null, null)` and returns the anchor it created, so
    /// whoever receives the value inserts it — `flow.ts`'s own `siteFor` path,
    /// and the one place K7's single empty text node is paid for.
    fn region(&mut self, id: crate::ir::RegionId, span: Span) -> Expression<'a> {
        let empty = dom::empty_region(self, span);
        let Some(region) = self.module.regions[id as usize].replace(empty) else {
            unreachable!("a claimed region no longer has a placeholder to expand")
        };
        dom::region_call(self, region, None, span)
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
        }
        // Sequential, not an `else`: a root the lowering REFUSED can itself be
        // one lowered construct, and `<Show>` as a whole component body is
        // exactly that shape.
        if let Expression::Identifier(identifier) = it
            && let Some(id) = self.module.uids.region_index(identifier.name.as_str())
            && self.module.regions.get(id as usize).is_some_and(Option::is_some)
        {
            let span = identifier.span;
            *it = self.region(id, span);
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
