use oxc::allocator::{TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrowFunctionExpression, AssignmentOperator, AssignmentTarget, Declaration,
    ExportDefaultDeclaration, ExportDefaultDeclarationKind, Expression, Function, FunctionType,
    IdentifierReference, Program, Statement,
};
use oxc::ast_visit::walk_mut::{walk_export_default_declaration, walk_expression, walk_statements};
use oxc::ast_visit::{Visit, VisitMut};
use oxc::semantic::ScopeFlags;
use oxc::span::Span;
use rustc_hash::FxHashSet;

use super::{Emit, Helper};

/// §3.0 rule 3 at the DEFINITION site of every emitted component, not only of
/// the arrows the compiler synthesises itself.
///
/// `shape::block` brands what P4 builds — a JSX child, a row callback, a slot
/// literal — and nothing branded a component DECLARATION, so `isBlock(Wrap)`
/// was false for the entire author-written surface. Two consequences, both
/// measured before this pass existed:
///
///   1. `Wrap()` with no scope resolved `useContext` against `CURRENT` and
///      registered its `onCleanup` on the ambient scope. C3.8's throw arrived
///      only if the body happened to reach a `requireScope` call site, and
///      never at all when it reached none;
///   2. a component REFERENCE crossing a Cell slot — `<Sink thing={Leaf} />`,
///      emitted as `thing: () => Leaf` — walked past `readSlot`'s brand probe
///      and its own source text was stringified into a DOM attribute, which is
///      the outcome BARQ010's message says cannot happen.
///
/// C3.8's own text names this as the alternative it was weighing: branding
/// every emitted Block at its definition site buys C7 full coverage, for one
/// wrapper per definition site and none per activation.
///
/// The set it applies to is the one §3.0 rule 3 names, and no wider: "the
/// compiler brands the Blocks that USE their scope … a Block that ignores its
/// scope — an arity-0 `template()`, C6 — is simultaneously a legal Cell and
/// needs no brand". `block`'s entry guard throws on `scope === undefined`, so
/// branding a component whose emitted body never reads `_s$` would retire
/// exactly the dual Block/Cell use rule 3 grants it, and neither motivation
/// above can bite in a body that never touches the scope. The test is the
/// EMITTED body, asked once the module is final, so a component whose scope use
/// was folded away by an optimisation is judged on what actually ships.
///
/// **"Uses its scope" is not the same as "names `_s$`", and the difference was
/// a hole.** A body can create reactive work through a helper that takes no
/// scope, and then it needs the brand for both motivations above while
/// mentioning `_s$` nowhere. Two of those existed. The element-binding channel
/// emitted a bare `renderEffect(compute, apply)`, which is why 40 of the
/// corpus's component declarations went unbranded while every one of them
/// carried a live binding — closed at the source, by giving `bindEffect` the
/// scope. `createElement` is the other and cannot be closed that way: it is the
/// un-compiled walk §4.1 retires at M9, it opens its own bindings, and it takes
/// no scope at all. A body that reaches it is therefore treated as using its
/// scope, so `block` establishes `CURRENT` for it and its bindings are owned by
/// the argument rather than by the call site.
///
/// It runs after the roots are spliced and before `prune`, which is the last
/// point at which the program is still the emitted module and `Helper::Block`
/// can still be marked used.
pub fn run<'a>(emit: &mut Emit<'a, '_>, program: &mut Program<'a>) {
    let spans: FxHashSet<Span> = emit.module.env.components.iter().map(|(span, _)| *span).collect();
    if spans.is_empty() {
        return;
    }
    let scope = emit.module.uids.scope();
    let mut pass = Brand { emit, spans, scope };
    pass.visit_program(program);
}

struct Brand<'a, 'm, 'e> {
    emit: &'e mut Emit<'a, 'm>,
    spans: FxHashSet<Span>,
    /// The one identifier every component takes its scope as and every Block
    /// declares. A nested Block shadows it, so a hit inside one is attributed
    /// to the enclosing component as well — the conservative direction: an
    /// extra brand costs bytes, a missing one costs the throw.
    scope: &'a str,
}

/// Whether the emitted body uses its scope — which since M9 is one question,
/// because every helper that creates reactive work takes one. `createElement`
/// was the exception this used to carry: it opened bindings off `getOwner()`
/// and took no scope, so a body whose only work was that call named nothing.
struct UsesScope<'s> {
    scope: &'s str,
    found: bool,
}

impl<'a> Visit<'a> for UsesScope<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.found |= it.name == self.scope;
    }
}

impl<'a> Brand<'a, '_, '_> {
    fn wrap(&mut self, value: Expression<'a>, span: Span) -> Expression<'a> {
        let callee = self.emit.helper(Helper::Block, span);
        let arguments = ArenaVec::from_iter_in([Argument::from(value)], &self.emit.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.emit.ast)
    }

    /// `Name = _$b(Name);`, for a component declared as a `function` statement.
    ///
    /// The declaration keeps its hoisting and its spelling: rewriting it as a
    /// `const` would move the binding into a temporal dead zone its own module
    /// may already read across, and `export default function D()` binds the
    /// export to `D` LIVE, so the assignment reaches an importer too.
    fn rebind(&mut self, name: &'a str, span: Span) -> Statement<'a> {
        let read = self.emit.ident(name, span);
        let branded = self.wrap(read, span);
        let target = AssignmentTarget::AssignmentTargetIdentifier(IdentifierReference::boxed(
            span,
            name,
            &self.emit.ast,
        ));
        let write = Expression::new_assignment_expression(
            span,
            AssignmentOperator::Assign,
            target,
            branded,
            &self.emit.ast,
        );
        Statement::new_expression_statement(span, write, &self.emit.ast)
    }

    /// The `function` statement a component is declared by, in the three
    /// spellings a statement list can hold one in.
    fn declared_function<'s>(&self, statement: &'s Statement<'a>) -> Option<&'s Function<'a>> {
        let function = match statement {
            Statement::FunctionDeclaration(function) => function.as_ref(),
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::FunctionDeclaration(function) => function.as_ref(),
                _ => return None,
            },
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(function) => function.as_ref(),
                _ => return None,
            },
            _ => return None,
        };
        self.brands_function(function).then_some(function)
    }

    fn scan(&self) -> UsesScope<'_> {
        UsesScope { scope: self.scope, found: false }
    }

    fn brands_function(&self, function: &Function<'a>) -> bool {
        self.spans.contains(&function.span) && {
            let mut scan = self.scan();
            scan.visit_function(function, ScopeFlags::empty());
            scan.found
        }
    }

    fn brands_arrow(&self, arrow: &ArrowFunctionExpression<'a>) -> bool {
        self.spans.contains(&arrow.span) && {
            let mut scan = self.scan();
            scan.visit_arrow_function_expression(arrow);
            scan.found
        }
    }
}

impl<'a> VisitMut<'a> for Brand<'a, '_, '_> {
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        walk_statements(self, it);
        let mut rebinds: Vec<(usize, &'a str, Span)> = Vec::new();
        for (index, statement) in it.iter().enumerate() {
            let Some(function) = self.declared_function(statement) else { continue };
            let Some(id) = function.id.as_ref() else { continue };
            rebinds.push((index, id.name.as_str(), function.span));
        }
        for (offset, (index, name, span)) in rebinds.into_iter().enumerate() {
            let statement = self.rebind(name, span);
            it.insert(index + offset + 1, statement);
        }
    }

    /// The anonymous default export is the one component with no binding to
    /// assign to, so the declaration becomes the expression it already was in
    /// everything but spelling — nothing in the module can name it.
    fn visit_export_default_declaration(&mut self, it: &mut ExportDefaultDeclaration<'a>) {
        walk_export_default_declaration(self, it);
        let anonymous = match &it.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                function.id.is_none() && self.brands_function(function)
            }
            _ => false,
        };
        if !anonymous {
            return;
        }
        let ExportDefaultDeclarationKind::FunctionDeclaration(mut function) =
            it.declaration.take_in(&self.emit.allocator)
        else {
            unreachable!("checked above")
        };
        function.r#type = FunctionType::FunctionExpression;
        let span = function.span;
        let branded = self.wrap(Expression::FunctionExpression(function), span);
        it.declaration = ExportDefaultDeclarationKind::from(branded);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        walk_expression(self, it);
        let span = match it {
            Expression::ArrowFunctionExpression(arrow) => {
                if !self.brands_arrow(arrow) {
                    return;
                }
                arrow.span
            }
            Expression::FunctionExpression(function) => {
                if !self.brands_function(function) {
                    return;
                }
                function.span
            }
            _ => return,
        };
        let taken = it.take_in(&self.emit.allocator);
        *it = self.wrap(taken, span);
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::options::{Opt, ResolvedOptions};

    fn emit(source: &str) -> String {
        compile(source, &ResolvedOptions::with_filename("b.tsx")).expect("compiles").code
    }

    fn o0(source: &str) -> String {
        let options = ResolvedOptions { opt: Opt::NONE, ..ResolvedOptions::with_filename("b.tsx") };
        compile(source, &options).expect("compiles").code
    }

    /// The pass itself, at the four spellings a component declaration reaches
    /// it in. Without this nothing in the tree fails when `brand` is deleted:
    /// the runtime's own Block tests build their Blocks by hand.
    #[test]
    fn every_scope_using_component_carries_its_definition_site_brand() {
        let source = "function Leaf(_p) { return <b>{_p.n()}</b> }\n\
             export function Named(props) { return <Leaf n={props.n} /> }\n\
             export const Arrow = (props) => <Leaf n={props.n} />;\n\
             export default function (props) { return <Leaf n={props.n} /> }\n";
        for code in [emit(source), o0(source)] {
            assert!(code.contains("Named = _$block(Named);"), "{code}");
            assert!(code.contains("export const Arrow = _$block((_s$"), "{code}");
            assert!(code.contains("export default _$block(function(_s$"), "{code}");
            assert!(!code.contains("_$block(_$block("), "double-branded:\n{code}");
        }
    }

    /// §3.0 rule 3's other half, and the one M5 lost: a Block that IGNORES its
    /// scope is simultaneously a legal Cell, so branding it — `block` installs
    /// an entry guard that throws on `scope === undefined` — would retire the
    /// dual use the rule grants. `Leaf` here is one clone and nothing else.
    #[test]
    fn a_component_that_never_reads_its_scope_is_not_branded() {
        let code = emit(
            "function Leaf() { return <b>x</b> }\n\
             export function Host(props) { return <Leaf /> }\n",
        );
        assert!(!code.contains("Leaf = _$block(Leaf)"), "{code}");
        assert!(code.contains("Host = _$block(Host);"), "{code}");
        assert_eq!(code.matches("_$block(").count(), 1, "{code}");
    }

    /// The rebind is an ASSIGNMENT to the declaration's own binding, so a
    /// component declared inside another function is branded in that function's
    /// body rather than hoisted out of it, and `export default function D`
    /// keeps the live binding its importers already read.
    #[test]
    fn a_nested_declaration_is_branded_where_it_is_declared() {
        let code = emit(
            "export const Host = (props) => {\n\
               function Inner(p) { return <b>{p.n()}</b> }\n\
               return <Inner n={props.n} />;\n\
             };\n",
        );
        let inner = code.find("Inner = _$block(Inner);").expect(&code);
        let close = code.rfind('}').expect(&code);
        assert!(inner < close, "the rebind escaped the declaring function:\n{code}");
    }

    /// A module with no component declaration acquires neither the helper nor
    /// the import — the pass is not a tax on files it has nothing to say about.
    #[test]
    fn a_module_with_nothing_to_brand_imports_nothing() {
        let code = emit("export const rows = [1, 2, 3];\nconst v = <b>x</b>;\n");
        assert!(!code.contains("_$block"), "{code}");
    }
}
