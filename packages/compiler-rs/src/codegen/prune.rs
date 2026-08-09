use oxc::allocator::Vec as ArenaVec;
use oxc::ast::ast::{
    BindingPattern, Expression, IdentifierName, IdentifierReference, Program, Statement,
    VariableDeclarationKind,
};
use oxc::ast_visit::walk_mut::walk_statements;
use oxc::ast_visit::{Visit, VisitMut};
use rustc_hash::FxHashSet;

use super::Emit;

/// The other half of P3 Fold. `const SIZE = "lg"` whose only reader was baked
/// into a `_tmpl$` string is a binding nothing evaluates any more, and leaving
/// it behind is what made DESIGN §7's "`SIZE` and `theme` never appear at
/// runtime" untrue of the emitted module.
///
/// Deliberately narrow, because this is the only pass that deletes user code:
///
///  - only a `const` whose declarator is a plain name (never a pattern, never
///    `let` — a `let` can be assigned, and the assignment is the read that
///    would go missing);
///  - only when P3 actually folded a read of that name away;
///  - only when the initialiser is a literal, so removing it cannot remove a
///    side effect;
///  - and only when the name occurs NOWHERE else in the finished program —
///    counted over every identifier the AST holds, references and type names
///    alike, so a shadowed inner use keeps the outer binding.
///
/// The last rule is what lets a COMPONENT-scope `const base = "btn"` go too: the
/// name is over-approximated across the whole program, so a binding that
/// survives here is one no scope can reach.
pub fn run<'a>(emit: &mut Emit<'a, '_>, program: &mut Program<'a>) {
    if emit.module.folded_reads.is_empty() {
        return;
    }
    let mut live = Live { names: FxHashSet::default() };
    live.visit_program(program);

    let folded = std::mem::take(&mut emit.module.folded_reads);
    let mut prune =
        Prune { dead: &|name: &str| folded.contains(name) && !live.names.contains(name) };
    prune.visit_program(program);
    emit.module.folded_reads = folded;
}

struct Prune<'d> {
    dead: &'d dyn Fn(&str) -> bool,
}

impl<'a> VisitMut<'a> for Prune<'_> {
    fn visit_statements(&mut self, it: &mut ArenaVec<'a, Statement<'a>>) {
        it.retain(|statement| !prunable(statement, &self.dead));
        walk_statements(self, it);
    }
}

fn prunable(statement: &Statement<'_>, dead: &impl Fn(&str) -> bool) -> bool {
    let Statement::VariableDeclaration(declaration) = statement else { return false };
    if declaration.kind != VariableDeclarationKind::Const {
        return false;
    }
    declaration.declarations.iter().all(|declarator| {
        let BindingPattern::BindingIdentifier(name) = &declarator.id else { return false };
        declarator.init.as_ref().is_some_and(Expression::is_literal) && dead(name.name.as_str())
    })
}

/// Every identifier still standing in the program — value references, member
/// names, export specifiers and TS type names alike. Over-collecting only keeps
/// a declaration alive, and this is the one pass where a false negative deletes
/// working code.
struct Live<'a> {
    names: FxHashSet<&'a str>,
}

impl<'a> Visit<'a> for Live<'a> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.names.insert(it.name.as_str());
    }

    fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
        self.names.insert(it.name.as_str());
    }
}
