use oxc::allocator::{Allocator, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, ArrowFunctionExpression, Expression,
    FormalParameterKind, FormalParameters, Program, ReturnStatement, VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{
    walk_arrow_function_expression, walk_expression, walk_return_statement,
    walk_variable_declarator,
};
use oxc::span::GetSpan;

use crate::codegen::Helper;
use crate::ir::{Module, Root, Site};

/// The single point where the AST and the IR touch, and the only stage before
/// codegen that writes to the program.
///
/// Every outermost JSX expression is MOVED out and replaced by a placeholder
/// identifier. Moving is not a convenience: `TakeIn` is the only way oxc 0.143
/// yields an `Expression<'a>` whose lifetime is the arena's rather than the
/// borrow's, and an IR holding `&'p Expression` would keep the program borrowed
/// for as long as the IR lives — which is exactly as long as codegen needs
/// `&mut Program`. So P1 is handed ownership instead, and never sees a
/// `Program` at all.
pub fn run<'a>(allocator: &'a Allocator, program: &mut Program<'a>, module: &mut Module<'a>) {
    Harvest { allocator, ast: AstBuilder::new(allocator), module }.visit_program(program);
}

struct Harvest<'a, 'm> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    module: &'m mut Module<'a>,
}

impl<'a> Harvest<'a, '_> {
    /// `preserve_parens` keeps `return (<div/>)` as a parenthesized node, and
    /// wrapping a JSX root in parentheses is how the shape is almost always
    /// written. The grouping carries no meaning once the root is replaced by an
    /// identifier, so it is seen through here and dropped by `take`.
    fn is_jsx(expression: &Expression<'a>) -> bool {
        match expression {
            Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
            Expression::ParenthesizedExpression(inner) => Self::is_jsx(&inner.expression),
            _ => false,
        }
    }

    /// Moves the root out and leaves the placeholder identifier behind.
    fn take(&mut self, it: &mut Expression<'a>, site: Site) {
        let span = it.span();
        let mut taken = it.take_in(&self.allocator);
        while let Expression::ParenthesizedExpression(inner) = taken {
            taken = inner.unbox().expression;
        }
        let index = self.module.push_root(Root::Pending(taken, site));
        let name = self.module.uids.root(index, self.allocator);
        // Nested JSX travels inside the taken root, so the walk stops here.
        *it = Expression::new_identifier(span, name, &self.ast);
    }

    /// JSX the program stores as a value (`ReactiveEnv::stored_jsx`) becomes
    /// `_$block(() => root)`, built where it is inserted. Its spans are taken
    /// off the list here, so the shape pass does not wrap the root again.
    fn take_stored(&mut self, it: &mut Expression<'a>) -> bool {
        let span = it.span();
        let env = &mut self.module.env;
        if !env.stored_jsx.remove(&span) {
            return false;
        }
        let mut inner = &*it;
        while let Expression::ParenthesizedExpression(parens) = inner {
            env.stored_jsx.remove(&parens.expression.span());
            inner = &parens.expression;
        }
        let boxed = env.boxed_jsx.contains(&span);
        self.take(it, Site::ArrowBody(span));
        let root = it.take_in(&self.allocator);
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::new_in(&self.allocator),
            None,
            &self.ast,
        );
        let body = ArrowFunctionBody::from(root);
        let arrow = Expression::new_arrow_function_expression(
            span, false, None, params, None, body, &self.ast,
        );
        self.module.used_helpers[Helper::Block as usize] = true;
        let callee = Expression::new_identifier(
            span,
            self.module.helpers[Helper::Block as usize],
            &self.ast,
        );
        let arguments = ArenaVec::from_iter_in([Argument::from(arrow)], &self.allocator);
        let deferred =
            Expression::new_call_expression(span, callee, None, arguments, false, &self.ast);
        *it = if boxed {
            let members =
                ArenaVec::from_iter_in([ArrayExpressionElement::from(deferred)], &self.allocator);
            Expression::new_array_expression(span, members, &self.ast)
        } else {
            deferred
        };
        true
    }
}

/// The three positions a JSX root can occupy where its compiled statements
/// splice into an existing statement list. Anything else is `Site::Nested` and
/// pays for one IIFE. The test is on the DIRECT child — `return f(<div/>)` is
/// nested, and only the shapes matched here are ever spliced.
impl<'a> VisitMut<'a> for Harvest<'a, '_> {
    fn visit_return_statement(&mut self, it: &mut ReturnStatement<'a>) {
        if let Some(argument) = &mut it.argument
            && Self::is_jsx(argument)
        {
            self.take(argument, Site::Return(it.span));
            return;
        }
        walk_return_statement(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &mut VariableDeclarator<'a>) {
        if let Some(init) = &mut it.init
            && Self::is_jsx(init)
        {
            self.take(init, Site::Init(it.span));
            return;
        }
        walk_variable_declarator(self, it);
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        if let Some(body) = it.body.as_expression_mut()
            && Self::is_jsx(body)
        {
            let span = body.span();
            self.take(body, Site::ArrowBody(span));
        }
        walk_arrow_function_expression(self, it);
    }

    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if Self::is_jsx(it) {
            if self.take_stored(it) {
                return;
            }
            let span = it.span();
            self.take(it, Site::Nested(span));
            return;
        }
        walk_expression(self, it);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::source_type_for;
    use oxc::codegen::Codegen;
    use oxc::parser::Parser;

    #[test]
    fn only_the_outermost_jsx_leaves_the_program() {
        let allocator = Allocator::new();
        let source = "const v = <div>{cond ? <b>x</b> : null}</div>;\nconst w = <p />;\n";
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        run(&allocator, &mut program, &mut module);

        // The nested `<b>` travels inside root 0, so it is not a root of its own
        // until P1 finds it.
        assert_eq!(module.roots.len(), 2);
        assert!(module.roots.iter().all(|root| matches!(root, Root::Pending(..))));

        let printed = Codegen::new().build(&program).code;
        assert!(printed.contains("const v = _jsx$0;"), "{printed}");
        assert!(printed.contains("const w = _jsx$1;"), "{printed}");
        assert!(!printed.contains('<'), "{printed}");
    }

    #[test]
    fn a_source_without_jsx_is_left_exactly_as_it_was() {
        let allocator = Allocator::new();
        let source = "const v = 1 + 2;\n";
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        run(&allocator, &mut program, &mut module);
        assert!(module.roots.is_empty());
        assert_eq!(Codegen::new().build(&program).code, "const v = 1 + 2;\n");
    }
}
