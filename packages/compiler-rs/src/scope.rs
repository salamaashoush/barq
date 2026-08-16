use oxc::allocator::{Allocator, Vec as ArenaVec};
use oxc::ast::ast::{
    ArrowFunctionExpression, BindingPattern, Expression, FormalParameter, FormalParameters,
    Function, JSXAttributeItem, JSXAttributeValue, JSXChild, JSXElementName, JSXExpression,
    Program,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{
    walk_arrow_function_expression, walk_expression, walk_function, walk_jsx_element,
    walk_jsx_fragment,
};
use oxc::span::Span;
use rustc_hash::FxHashSet;

use crate::ir::Module;

/// P-new `scope`, the AST half — `CODESIGN.md` §3.2 C1 and §5.2.
///
/// A function that is CALLED with a scope gains the scope as its FIRST
/// parameter. Mistiming is then a missing argument rather than a runtime
/// surprise, which is the whole reason the redesign chose ownership-passing
/// over an ambient current owner.
///
/// Two positions, and only two, are called that way, because C2 says a
/// component is DECLARED and never inferred:
///
///   1. a declaration `analysis::bind` proved is a component — it returns JSX
///      AND this module either writes it as a tag or lets it out — which is the
///      set every `Comp(_s$, props)` call site is generated from;
///   2. a function literal written directly in a JSX slot of a COMPONENT tag,
///      which P4 `shape` forwards by identity into a Block position;
///   3. a function literal in the first argument of the framework's
///      `render`/`hydrate` — O5's root Block, and the only route by which the
///      root scope a mount opens reaches the application it mounts.
///
/// Containing JSX is not evidence and never was. `rows.map((row) => <li/>)`
/// hands its callback to `Array.prototype.map`, which owns the argument list
/// and calls it `(element, index)`; prepending a parameter there is a silent
/// miscompilation of ordinary JavaScript, and it is what this pass used to do.
/// Such a body still needs a scope VALUE for the components it constructs, and
/// it reads the innermost enclosing one by name — or, if no enclosing function
/// declares it, the module-level binding `Module::detached_roots` asks for.
///
/// The parameter's name is one identifier for every position, so lexical
/// shadowing does the threading: a Block emitted by P4 `shape` declares the same
/// name, an inner Block shadows an outer one, and a component call anywhere
/// reaches the innermost enclosing scope by writing that name. Nothing has to
/// carry a scope expression down the tree.
///
/// It runs before `harvest`, because that is the last moment the JSX and the
/// function that encloses it are in the same tree.
pub fn run<'a>(allocator: &'a Allocator, program: &mut Program<'a>, module: &mut Module<'a>) {
    let name = module.uids.scope();
    let declared = module.env.components.iter().map(|(span, _)| *span).collect();
    // O5's third position: the Block `render`/`hydrate` supplies the ROOT to.
    let slots: FxHashSet<Span> = module.env.root_blocks.iter().copied().collect();
    let mut pass = Scope {
        allocator,
        ast: AstBuilder::new(allocator),
        name,
        declared,
        slots,
        jsx: 0,
        unbound: false,
    };
    pass.visit_program(program);
    module.detached_roots = pass.jsx > 0 || pass.unbound;
}

struct Scope<'a> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    name: &'a str,
    /// The spans `analysis::bind` proved are component declarations (C2).
    declared: FxHashSet<Span>,
    /// The spans of function literals written directly in a COMPONENT tag's
    /// slot. A slot alone is not evidence of a Block — `when={() => on()}` is a
    /// Cell in one — so a literal here takes a scope only if it also builds JSX.
    slots: FxHashSet<Span>,
    /// JSX roots seen since the innermost function was entered.
    jsx: u32,
    /// JSX below here needs a scope binding that no function between it and the
    /// current position declares. It reaches module scope unless a scope-taking
    /// declaration intercepts it; see `Module::detached_roots`.
    unbound: bool,
}

impl<'a> Scope<'a> {
    fn parameter(&self, span: Span) -> FormalParameter<'a> {
        let pattern = BindingPattern::new_binding_identifier(span, self.name, &self.ast);
        FormalParameter::new(
            span,
            ArenaVec::new_in(&self.allocator),
            pattern,
            None,
            None,
            false,
            None,
            false,
            false,
            &self.ast,
        )
    }

    /// Scope FIRST. A component's own parameters keep their order and their
    /// spellings — destructuring, defaults, a rest element — so the only
    /// difference a migration sees is the argument it now has to pass.
    fn take_scope(&mut self, params: &mut FormalParameters<'a>) {
        let span = params.span;
        let taken = std::mem::replace(&mut params.items, ArenaVec::new_in(&self.allocator));
        let mut items = ArenaVec::with_capacity_in(taken.len() + 1, &self.allocator);
        items.push(self.parameter(span));
        items.extend(taken);
        params.items = items;
    }

    /// The JSX count belongs to the INNERMOST enclosing function and is not
    /// propagated outwards as evidence: a function whose only JSX is inside a
    /// nested component is not itself a component, and giving it a scope
    /// parameter would rewrite an ordinary factory into something its callers
    /// cannot call. What DOES propagate is the demand — the JSX still has to
    /// name a scope — and it stops at the first declaration that takes one.
    fn enter(&mut self) -> (u32, bool) {
        (std::mem::replace(&mut self.jsx, 0), std::mem::take(&mut self.unbound))
    }

    /// Everything the position question needs, asked once at the closing brace:
    /// a declared component takes a scope whatever its body does, and a slot
    /// literal takes one exactly when it builds something that needs one.
    fn takes_scope(&self, span: Span) -> bool {
        self.declared.contains(&span)
            || (self.slots.contains(&span) && (self.jsx > 0 || self.unbound))
    }

    fn exit(&mut self, saved: (u32, bool), took_scope: bool) {
        let demanded = self.jsx > 0 || self.unbound;
        self.jsx = saved.0;
        self.unbound = saved.1 || (demanded && !took_scope);
    }

    /// Position 2: a function literal written DIRECTLY in a JSX slot of a
    /// component tag. Directly is the whole of it — `<Comp x={rows.map(r => …)}>`
    /// puts the arrow in `map`'s argument list, not in the slot, and the slot
    /// holds the array `map` returns.
    fn admit_slot(&mut self, expression: &JSXExpression<'a>) {
        match expression {
            JSXExpression::ArrowFunctionExpression(arrow) => {
                self.slots.insert(arrow.span);
            }
            JSXExpression::FunctionExpression(function) => {
                self.slots.insert(function.span);
            }
            _ => {}
        }
    }
}

/// A lowercase tag is an element, and its slots are element children the
/// compiler builds itself. Only a COMPONENT tag hands a slot to a callee that
/// will invoke it with a scope.
pub(crate) fn is_component_tag(name: &JSXElementName<'_>) -> bool {
    match name {
        JSXElementName::Identifier(id) => id.name.starts_with(char::is_uppercase),
        JSXElementName::IdentifierReference(id) => id.name.starts_with(char::is_uppercase),
        JSXElementName::MemberExpression(_) | JSXElementName::NamespacedName(_) => true,
        JSXElementName::ThisExpression(_) => false,
    }
}

impl<'a> VisitMut<'a> for Scope<'a> {
    fn visit_function(&mut self, it: &mut Function<'a>, flags: oxc::semantic::ScopeFlags) {
        let saved = self.enter();
        walk_function(self, it, flags);
        let take = self.takes_scope(it.span);
        if take {
            self.take_scope(&mut it.params);
        }
        self.exit(saved, take);
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        let saved = self.enter();
        walk_arrow_function_expression(self, it);
        let take = self.takes_scope(it.span);
        if take {
            self.take_scope(&mut it.params);
        }
        self.exit(saved, take);
    }

    /// Hand-rolled so the slot positions are recognised BEFORE the walk reaches
    /// the literals sitting in them, and nowhere else.
    fn visit_jsx_element(&mut self, it: &mut oxc::ast::ast::JSXElement<'a>) {
        self.jsx += 1;
        if is_component_tag(&it.opening_element.name) {
            for attribute in it.opening_element.attributes.iter() {
                if let JSXAttributeItem::Attribute(attribute) = attribute
                    && let Some(JSXAttributeValue::ExpressionContainer(container)) =
                        &attribute.value
                {
                    self.admit_slot(&container.expression);
                }
            }
            for child in it.children.iter() {
                if let JSXChild::ExpressionContainer(container) = child {
                    self.admit_slot(&container.expression);
                }
            }
        }
        walk_jsx_element(self, it);
    }

    fn visit_jsx_fragment(&mut self, it: &mut oxc::ast::ast::JSXFragment<'a>) {
        self.jsx += 1;
        walk_jsx_fragment(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        walk_expression(self, it);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis;
    use crate::compile::source_type_for;
    use crate::options::ResolvedOptions;
    use oxc::codegen::Codegen;
    use oxc::parser::Parser;

    fn rewritten(source: &str) -> String {
        let allocator = Allocator::new();
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        analysis::bind(&allocator, &program, &mut module, &ResolvedOptions::default());
        run(&allocator, &mut program, &mut module);
        Codegen::new().build(&program).code
    }

    fn detached(source: &str) -> bool {
        let allocator = Allocator::new();
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        analysis::bind(&allocator, &program, &mut module, &ResolvedOptions::default());
        run(&allocator, &mut program, &mut module);
        module.detached_roots
    }

    /// C1. Scope first, on every shape a component can be DECLARED in. Exported
    /// is one of the two kinds of evidence C2 accepts, and it is the one that
    /// does not need a second declaration to write the tag.
    #[test]
    fn every_declared_component_takes_a_scope_first() {
        let code = rewritten(
            "export const A = () => <b />;\n\
             export const B = (props) => <b>{props.x}</b>;\n\
             export function C({ tone }, extra) { return <b class={tone} /> }\n\
             export default function D() { return <b /> }\n",
        );
        assert!(code.contains("const A = (_s$) =>"), "{code}");
        assert!(code.contains("const B = (_s$, props) =>"), "{code}");
        assert!(code.contains("function C(_s$, { tone }, extra)"), "{code}");
        assert!(code.contains("function D(_s$)"), "{code}");
    }

    /// The other kind of evidence: the module writes the binding as a tag. A
    /// component declared INSIDE another function is still a component when the
    /// module calls it as one, and it still cannot be exported.
    #[test]
    fn a_nested_declaration_the_module_writes_as_a_tag_is_a_component() {
        let code = rewritten(
            "export const Host = () => {\n\
               const Inner = () => <b />;\n\
               return <Inner />;\n\
             };\n",
        );
        assert!(code.contains("const Host = (_s$) =>"), "{code}");
        assert!(code.contains("const Inner = (_s$) =>"), "{code}");
    }

    /// C2's boundary, which after M3's fix is the whole rule: containing JSX is
    /// not evidence. The module writes neither `make` nor `Inner` as a tag and
    /// lets neither out, so nothing in the program calls either with a scope and
    /// re-signaturing either one would change a contract its own callers own.
    /// The `<b/>` still needs a scope VALUE, and it reads the module-level
    /// binding `detached_roots` asks for.
    #[test]
    fn a_function_whose_jsx_is_all_nested_keeps_its_signature() {
        let source = "const make = (tone) => {\n\
               const Inner = () => <b class={tone} />;\n\
               return Inner;\n\
             };\n";
        let code = rewritten(source);
        assert!(code.contains("const make = (tone) =>"), "{code}");
        assert!(code.contains("const Inner = () =>"), "{code}");
        assert!(detached(source), "the JSX has no enclosing scope binding to read");
    }

    /// The defect M3 shipped and this pass now refuses: `Array.prototype.map`
    /// owns its callback's argument list and calls it `(element, index)`, so a
    /// scope parameter prepended there swallows the row. A one-parameter
    /// JSX-returning arrow is indistinguishable from a component BY SHAPE, which
    /// is exactly why C2 asks about the declaration instead.
    #[test]
    fn a_callback_whose_caller_owns_the_argument_list_keeps_its_parameters() {
        let code = rewritten(
            "export const V = () => <ul>{() => rows().map((row) => <li>{row}</li>)}</ul>;\n",
        );
        assert!(code.contains(".map((row) =>"), "{code}");
        assert!(!code.contains("(_s$, row)"), "{code}");

        let disposer = rewritten(
            "export const V = () => {\n\
               const outer = scope((d) => { render(<b />, host); return d }, true);\n\
               return <i>{outer}</i>;\n\
             };\n",
        );
        assert!(disposer.contains("scope((d) =>"), "{disposer}");
    }

    /// A row callback IS a Block under the new convention (C6: slot parameters
    /// are extra Cell arguments), so the scope goes in front of the row exactly
    /// as it does in front of props. The position is the evidence: written
    /// directly in a COMPONENT tag's slot, which is where P4 `shape` forwards it
    /// by identity into a Block.
    #[test]
    fn a_row_callback_takes_a_scope_before_its_row() {
        let code = rewritten(
            "export const V = (props) => <For each={props.rows}>{(item) => <li>{item()}</li>}</For>;\n",
        );
        assert!(code.contains("(_s$, item) =>"), "{code}");
    }

    /// The slot is the EXPRESSION, not everything under it. An arrow handed to
    /// `map` inside a slot belongs to `map`.
    #[test]
    fn a_callback_nested_inside_a_slot_does_not_inherit_the_slot() {
        let code = rewritten(
            "export const V = (props) => <Show when={props.on}>{() => rows().map((row) => <li>{row}</li>)}</Show>;\n",
        );
        assert!(
            code.contains("{(_s$) => rows().map((row) =>")
                || code.contains("(_s$) => rows().map((row) =>"),
            "{code}"
        );
        assert!(!code.contains("(_s$, row)"), "{code}");
    }

    /// An element's slots are children the compiler builds itself; nobody calls
    /// them with a scope.
    #[test]
    fn an_element_slot_is_not_a_block_position() {
        let code =
            rewritten("export const V = () => <ul>{[1].map((row) => <li>{row}</li>)}</ul>;\n");
        assert!(code.contains(".map((row) =>"), "{code}");
    }

    #[test]
    fn a_root_outside_every_function_is_recorded() {
        let allocator = Allocator::new();
        let source = "const v = <b />;\n";
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        run(&allocator, &mut program, &mut module);
        assert!(module.detached_roots);
    }
}
