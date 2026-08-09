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
    for index in 0..emit.module.hoisted.len() {
        templates.push(hoisted_declaration(emit, index));
    }
    templates.extend(super::dom::delegate_call(emit));

    let specifiers = helper_specifiers(emit);
    let allocator = emit.allocator;
    let mut body = std::mem::replace(&mut program.body, ArenaVec::new_in(&allocator));

    let mut attached = false;
    for statement in body.iter_mut() {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != emit.module_source
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
        attached = true;
        break;
    }

    let mut out = ArenaVec::with_capacity_in(body.len() + templates.len() + 1, &allocator);
    if !attached {
        out.push(helper_import(emit, &specifiers));
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

fn helper_specifiers<'a>(emit: &Emit<'a, '_>) -> Vec<(&'a str, &'a str)> {
    (0..HELPER_COUNT)
        .filter(|index| emit.used[*index])
        .map(|index| (emit.allocator.alloc_str(IMPORTED[index]) as &'a str, emit.local[index]))
        .collect()
}

fn helper_import<'a>(emit: &Emit<'a, '_>, specifiers: &[(&'a str, &'a str)]) -> Statement<'a> {
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
        StringLiteral::new(SPAN, emit.module_source, None, &emit.ast),
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
    let quasi = TemplateElement::new_escape_raw(
        span,
        TemplateElementValue { raw: html.into(), cooked: Some(html.into()) },
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
