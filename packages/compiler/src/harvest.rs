use oxc::allocator::{Allocator, TakeIn};
use oxc::ast::ast::{
    ArrowFunctionExpression, Expression, Program, ReturnStatement, VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{
    walk_arrow_function_expression, walk_expression, walk_return_statement,
    walk_variable_declarator,
};
use oxc::span::GetSpan;

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
