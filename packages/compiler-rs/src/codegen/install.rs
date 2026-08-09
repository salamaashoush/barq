use oxc::allocator::Vec as ArenaVec;
use oxc::ast::ast::{
    Argument, BindingIdentifier, BindingPattern, Expression, IdentifierName,
    ImportDeclarationSpecifier, ImportOrExportKind, ModuleExportName, Program, Statement,
    StringLiteral, TemplateElement, TemplateElementValue, TemplateLiteral, VariableDeclarationKind,
    VariableDeclarator,
};
use oxc::span::{SPAN, Span};

use super::{Emit, HELPER_COUNT, Helper, IMPORTED};
use crate::ir::{Hoisted, TemplateId};
use oxc::allocator::CloneIn;

/// The module preamble: the helper import, then one hoisted
/// `const _tmpl$N = /*#__PURE__*/ template("…")` per template row.
pub fn run<'a>(emit: &mut Emit<'a, '_>, program: &mut Program<'a>) {
    if emit.module.templates.is_empty() && !emit.used.iter().any(|used| *used) {
        return;
    }

    let claimant = super::mappings::claimants(emit.module);
    let mut templates = Vec::with_capacity(emit.module.templates.len());
    for id in 0..emit.module.templates.len() as TemplateId {
        let origin = super::mappings::template_span(emit.module, &claimant, id);
        templates.push(template_declaration(emit, id, origin));
    }
    // Target #7: capture-free handlers become module-scope constants, so a
    // thousand rows allocate zero closures. Then ONE delegateEvents call
    // replaces the N private `ensureDelegatedListener` calls applyProp makes —
    // module evaluation order guarantees the document listeners are installed
    // before any event can fire.
    //
    // Both are DOM concepts. P8b drops every event patch, so the wire carries no
    // `$$click`, the document listener has nothing to serve, and a hoisted
    // handler would be a module-scope binding with no reader.
    if emit.target == super::Target::Dom {
        for index in 0..emit.module.hoisted.len() {
            templates.push(hoisted_declaration(emit, index));
        }
        templates.extend(super::dom::delegate_call(emit));
    }

    // Two groups, two sources: the DOM helpers come from the module source and
    // P8b's from `<module_source>/server`, which the client bundle must never
    // pull in.
    let groups = [
        (emit.module_source, helper_specifiers(emit, 0..super::FIRST_SERVER_HELPER)),
        (emit.server_source, helper_specifiers(emit, super::FIRST_SERVER_HELPER..HELPER_COUNT)),
    ];
    let allocator = emit.allocator;
    let mut body = std::mem::replace(&mut program.body, ArenaVec::new_in(&allocator));
    drop_rewritten_flow_imports(emit, &mut body);

    let mut pending: Vec<(&'a str, Vec<(&'a str, &'a str)>)> = Vec::new();
    for (source, specifiers) in groups {
        if specifiers.is_empty() {
            continue;
        }
        if !attach(emit, &mut body, source, &specifiers) {
            pending.push((source, specifiers));
        }
    }

    let mut out = ArenaVec::with_capacity_in(body.len() + templates.len() + 2, &allocator);
    for (source, specifiers) in &pending {
        out.push(helper_import(emit, source, specifiers));
    }
    // After the LEADING run of imports, never after the last one: `import` is
    // legal anywhere at the top level, and a module whose import sits BELOW
    // JSX-bearing code would otherwise get `_tmpl$1()` before
    // `const _tmpl$1 = …` and die in the temporal dead zone. Every emitted
    // binding — templates, hoisted handlers, the `delegateEvents` call — rides
    // this splice, so the rule has to hold for the first statement that could
    // read any of them, which is the first statement that is not an import.
    let split = body
        .iter()
        .position(|statement| !matches!(statement, Statement::ImportDeclaration(_)))
        .unwrap_or(body.len());
    let mut templates = templates.into_iter();
    for (index, statement) in body.into_iter().enumerate() {
        if index == split {
            out.extend(&mut templates);
        }
        out.push(statement);
    }
    out.extend(templates);
    program.body = out;
}

/// P8b rewrites `<For>` to `ssrFor`. When it rewrote EVERY reference a binding
/// had, the import specifier is a reader-free name — and it names a component
/// that drags `@barqjs/core`'s whole DOM runtime into a server bundle. The
/// counting is what makes this safe: a binding with one reference left keeps
/// its specifier, and only the identifier form is ever counted, so the
/// namespace spelling (`core.For`, which the whole namespace object serves)
/// never loses an import.
fn drop_rewritten_flow_imports<'a>(emit: &Emit<'a, '_>, body: &mut ArenaVec<'a, Statement<'a>>) {
    if emit.module.flow_rewrites.is_empty() {
        return;
    }
    let mut emptied = Vec::new();
    for (index, statement) in body.iter_mut().enumerate() {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        let Some(specifiers) = declaration.specifiers.as_mut() else { continue };
        let before = specifiers.len();
        specifiers.retain(|specifier| {
            let ImportDeclarationSpecifier::ImportSpecifier(imported) = specifier else {
                return true;
            };
            let Some(symbol) = imported.local.symbol_id.get() else { return true };
            let rewritten = emit.module.flow_rewrites.iter().filter(|it| **it == symbol).count();
            // A JSX element pair resolves TWO references to the same binding —
            // oxc counts the closing tag — and the rewrite replaced both with
            // one call, so the closings come off before the comparison.
            let closings = emit.module.env.jsx_closings.iter().filter(|it| **it == symbol).count();
            let references =
                emit.module.scoping.get_resolved_reference_ids(symbol).len() - closings;
            rewritten == 0 || rewritten < references
        });
        // An import that was ALREADY bare stays: `import "x"` is a side effect
        // the author asked for, and this pass is not the one to drop it.
        if specifiers.is_empty() && before > 0 {
            emptied.push(index);
        }
    }
    if !emptied.is_empty() {
        let mut index = 0;
        body.retain(|_| {
            let keep = !emptied.contains(&index);
            index += 1;
            keep
        });
    }
}

fn helper_specifiers<'a>(
    emit: &Emit<'a, '_>,
    range: std::ops::Range<usize>,
) -> Vec<(&'a str, &'a str)> {
    range
        .filter(|index| emit.used[*index])
        .map(|index| (IMPORTED[index], emit.local[index]))
        .collect()
}

/// An import of the same source the module already writes takes the new
/// specifiers rather than growing a second declaration.
fn attach<'a>(
    emit: &Emit<'a, '_>,
    body: &mut ArenaVec<'a, Statement<'a>>,
    source: &str,
    specifiers: &[(&'a str, &'a str)],
) -> bool {
    for statement in body.iter_mut() {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != source
            || declaration.import_kind != ImportOrExportKind::Value
        {
            continue;
        }
        let Some(existing) = declaration.specifiers.as_mut() else { continue };
        if existing.iter().any(|specifier| {
            matches!(specifier, ImportDeclarationSpecifier::ImportNamespaceSpecifier(_))
        }) {
            continue;
        }
        existing.extend(specifiers.iter().copied().map(|(imported, local)| {
            ImportDeclarationSpecifier::new_import_specifier(
                SPAN,
                ModuleExportName::IdentifierName(IdentifierName::new(SPAN, imported, &emit.ast)),
                BindingIdentifier::new(SPAN, local, &emit.ast),
                ImportOrExportKind::Value,
                &emit.ast,
            )
        }));
        return true;
    }
    false
}

fn helper_import<'a>(
    emit: &Emit<'a, '_>,
    source: &'a str,
    specifiers: &[(&'a str, &'a str)],
) -> Statement<'a> {
    let specifiers = ArenaVec::from_iter_in(
        specifiers.iter().map(|(imported, local)| {
            ImportDeclarationSpecifier::new_import_specifier(
                SPAN,
                ModuleExportName::IdentifierName(IdentifierName::new(SPAN, *imported, &emit.ast)),
                BindingIdentifier::new(SPAN, *local, &emit.ast),
                ImportOrExportKind::Value,
                &emit.ast,
            )
        }),
        &emit.allocator,
    );
    Statement::new_import_declaration(
        SPAN,
        Some(specifiers),
        StringLiteral::new(SPAN, source, None, &emit.ast),
        None,
        None,
        ImportOrExportKind::Value,
        &emit.ast,
    )
}

fn hoisted_declaration<'a>(emit: &mut Emit<'a, '_>, index: usize) -> Statement<'a> {
    let (id, expr, span) = match &emit.module.hoisted[index] {
        Hoisted::Handler { id, expr, span } | Hoisted::Frozen { id, expr, span } => {
            (*id, *expr, *span)
        }
    };
    let name = emit.module.uids.handler(id, emit.allocator);
    let init = expr.clone_in(emit.allocator);
    let declarator = VariableDeclarator::new(
        span,
        VariableDeclarationKind::Const,
        BindingPattern::new_binding_identifier(span, name, &emit.ast),
        None,
        Some(init),
        false,
        &emit.ast,
    );
    Statement::new_variable_declaration(
        span,
        VariableDeclarationKind::Const,
        [declarator],
        false,
        &emit.ast,
    )
}

fn template_declaration<'a>(
    emit: &mut Emit<'a, '_>,
    id: TemplateId,
    origin: Option<Span>,
) -> Statement<'a> {
    let range = emit.module.templates[id as usize].range;
    let html =
        emit.allocator.alloc_str(&emit.module.html[range.0 as usize..range.1 as usize]) as &'a str;
    let meta = &emit.module.template_meta[id as usize];
    let (span, wrapped) = (origin.unwrap_or(meta.span), meta.wrapped);

    let callee = emit.helper(Helper::Template, span);
    let raw = super::mappings::template_raw(html, emit.allocator);
    let quasi = TemplateElement::new(
        span,
        TemplateElementValue { raw: raw.into(), cooked: Some(html.into()) },
        true,
        &emit.ast,
    );
    let literal = Expression::TemplateLiteral(TemplateLiteral::boxed(
        span,
        [quasi],
        ArenaVec::new_in(&emit.allocator),
        &emit.ast,
    ));
    let mut arguments = vec![Argument::from(literal)];
    if wrapped {
        arguments.push(Argument::from(Expression::new_boolean_literal(span, true, &emit.ast)));
    }
    let arguments = ArenaVec::from_iter_in(arguments, &emit.allocator);
    let init = Expression::new_call_expression_with_pure(
        span, callee, None, arguments, false, true, &emit.ast,
    );

    let name = emit.template_name(id);
    let declarator = VariableDeclarator::new(
        span,
        VariableDeclarationKind::Const,
        BindingPattern::new_binding_identifier(span, name, &emit.ast),
        None,
        Some(init),
        false,
        &emit.ast,
    );
    Statement::new_variable_declaration(
        span,
        VariableDeclarationKind::Const,
        [declarator],
        false,
        &emit.ast,
    )
}
