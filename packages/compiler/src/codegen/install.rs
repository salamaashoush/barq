use oxc::allocator::Vec as ArenaVec;
use oxc::ast::ast::{
    Argument, BindingIdentifier, Expression, IdentifierName, ImportDeclarationSpecifier,
    ImportOrExportKind, ModuleExportName, Program, Statement, StringLiteral, TemplateElement,
    TemplateElementValue, TemplateLiteral,
};
use oxc::span::{SPAN, Span};
use oxc::syntax::number::NumberBase;

use super::{Emit, Helper, Home, IMPORTED, home};
use crate::ir::{Hoisted, Ns, TemplateId};
use oxc::allocator::CloneIn;

/// The module preamble: the helper import, then one hoisted
/// `const _tmpl$N = /*#__PURE__*/ template("…")` per template row.
pub fn run<'a>(emit: &mut Emit<'a, '_>, program: &mut Program<'a>) {
    // A module with no template and no helper can still owe two declarations: a
    // hoisted constant Cell, and the scope binding a detached root reads. Both
    // are readers of nothing but themselves, so neither is caught by the two
    // conditions that used to stand here alone.
    let cells = emit.module.hoisted.iter().any(|it| matches!(it, Hoisted::Cell { .. }));
    if emit.module.templates.is_empty()
        && !emit.used.iter().any(|used| *used)
        && !cells
        && !emit.module.detached_roots
    {
        if calls_a_component(emit, &program.body) {
            program.body.insert(0, host_import(emit));
        }
        return;
    }
    let interp_units = std::mem::take(&mut emit.interp_units);

    let claimant = super::mappings::claimants(emit.module);
    let mut templates = Vec::with_capacity(emit.module.templates.len());
    for id in 0..emit.module.templates.len() as TemplateId {
        let origin = super::mappings::template_span(emit.module, &claimant, id);
        templates.push(template_declaration(emit, id, origin));
    }
    // Target #7: capture-free handlers become module-scope constants, so a
    // thousand rows allocate zero closures. Then ONE delegateEvents call
    // declares the module's delegated types, and every render root listens for
    // a declared type from then on, so module evaluation order guarantees the
    // listeners are installed before any event can fire.
    //
    // Both are DOM concepts. P8b drops every event patch, so the wire carries no
    // `__bq_click`, a root's listener has nothing to serve, and a hoisted
    // handler would be a module-scope binding with no reader.
    // A constant prop Cell is an ABI fact, not a DOM one: both backends call the
    // same component with the same props object, so `_k$N` is declared for every
    // target. The shape pass only ever mints one when hoisting is on, so there
    // is no reader-free binding to guard against here.
    for index in 0..emit.module.hoisted.len() {
        if matches!(emit.module.hoisted[index], Hoisted::Cell { .. }) {
            templates.push(hoisted_declaration(emit, index));
        }
    }
    // A custom renderer reads a hoisted handler as well, through `setProp`.
    if emit.target.walks_the_dom() || emit.target == super::Target::Universal {
        // With hoisting off `handler_expression` rebuilds each one at its use
        // site, so a declaration here would be a module-scope binding with no
        // reader.
        for index in 0..emit.module.hoisted.len() {
            if !emit.opt.hoist {
                break;
            }
            if matches!(emit.module.hoisted[index], Hoisted::Cell { .. }) {
                continue;
            }
            templates.push(hoisted_declaration(emit, index));
        }
        if emit.target.walks_the_dom() {
            templates.extend(super::dom::delegate_call(emit));
        }
    }
    // Last, because a serialised unit names the `_tmpl$N` it clones and the
    // `_h$N` it installs, and a `const` cannot be read before its initialiser
    // has run.
    templates.extend(interp_units);

    // One import per source, and `home` decides each helper's: the shared ABI
    // from core, the renderer's from the module source, the string backend's
    // from `<server_source>`, which the client bundle must never pull in, and
    // the reference backend's single entry point from `<module_source>/interp`,
    // which no production bundle pulls in at all.
    let groups = [
        (emit.core_source, Home::Core),
        (emit.module_source, Home::Renderer),
        (emit.server_source, Home::Server),
        (emit.interp_source, Home::Interp),
    ]
    .map(|(source, wanted)| {
        let target = emit.target;
        (source, helper_specifiers(emit, |helper| home(helper, target) == wanted))
    });
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

    let mut out = ArenaVec::with_capacity_in(body.len() + templates.len() + 3, &allocator);
    // A helper import from the renderer's own module already loads it, and with
    // it the host it registers.
    let loads_the_renderer = emit.target == super::Target::Universal
        && pending.iter().any(|(source, _)| *source == emit.module_source);
    if !loads_the_renderer && calls_a_component(emit, &body) {
        out.push(host_import(emit));
    }
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

/// The components that render through a host they look up, because they are
/// called rather than lowered onto a renderer's `branch` and `each`.
const HOST_COMPONENTS: [&str; 8] =
    ["Show", "For", "Repeat", "Switch", "Loading", "Reveal", "Errored", "NoHydration"];

/// Whether a module compiled for the document still CALLS one of core's
/// components, which is what a spread or a component passed as a value
/// compiles to. Such a call finds its host at run time, so the module imports
/// the renderer's registration of it. Asked after the lowered names lost their
/// imports, so a module whose every `<Show>` became a `branch` pays nothing.
///
/// A namespace import of core counts whatever it is used for: `core.Show` is
/// one property read away, and nothing here follows it.
///
/// A custom renderer registers its host from its own module, as a default no
/// other renderer has taken, so the import is of that module.
fn calls_a_component<'a>(emit: &Emit<'a, '_>, body: &[Statement<'a>]) -> bool {
    if emit.target == super::Target::Ssr {
        return false;
    }
    let mut calls = false;
    for statement in body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.import_kind != ImportOrExportKind::Value {
            continue;
        }
        let source = declaration.source.value.as_str();
        if source == host_source(emit).as_str() {
            return false;
        }
        if source != emit.core_source {
            continue;
        }
        for specifier in declaration.specifiers.iter().flatten() {
            calls |= match specifier {
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => true,
                ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                    imported.import_kind == ImportOrExportKind::Value
                        && HOST_COMPONENTS.contains(&imported.imported.name().as_str())
                        && imported.local.symbol_id.get().is_none_or(|symbol| {
                            let references =
                                emit.module.scoping.get_resolved_reference_ids(symbol).len();
                            let closings = emit
                                .module
                                .env
                                .jsx_closings
                                .iter()
                                .filter(|it| **it == symbol)
                                .count();
                            let rewritten = emit
                                .module
                                .flow_rewrites
                                .iter()
                                .filter(|it| **it == symbol)
                                .count();
                            references > closings + rewritten
                        })
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => false,
            };
        }
    }
    calls
}

fn host_source(emit: &Emit<'_, '_>) -> String {
    if emit.target == super::Target::Universal {
        return emit.module_source.to_string();
    }
    format!("{}/host", emit.module_source)
}

fn host_import<'a>(emit: &Emit<'a, '_>) -> Statement<'a> {
    let source = emit.allocator.alloc_str(&host_source(emit));
    Statement::new_import_declaration(
        SPAN,
        None,
        StringLiteral::new(SPAN, source, None, &emit.ast),
        None,
        None,
        ImportOrExportKind::Value,
        &emit.ast,
    )
}

fn helper_specifiers<'a>(
    emit: &Emit<'a, '_>,
    from_here: impl Fn(Helper) -> bool,
) -> Vec<(&'a str, &'a str)> {
    IMPORTED
        .iter()
        .enumerate()
        .filter(|(index, (helper, _))| emit.used[*index] && from_here(*helper))
        .map(|(index, (_, name))| (*name, emit.local[index]))
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
    let (id, expr, span, cell) = match &emit.module.hoisted[index] {
        Hoisted::Handler { id, expr, span } | Hoisted::Frozen { id, expr, span } => {
            (*id, *expr, *span, false)
        }
        Hoisted::Cell { id, expr, span } => (*id, *expr, *span, true),
    };
    let name = if cell {
        emit.module.uids.konst(id, emit.allocator)
    } else {
        emit.module.uids.handler(id, emit.allocator)
    };
    let init = expr.clone_in(emit.allocator);
    emit.binding(name, init, span)
}

/// 1-based line and column of `offset`, the column in UTF-16 units as an
/// editor and a source map count it.
fn source_position(source: &str, offset: u32) -> (usize, usize) {
    let before = source.get(..offset as usize).unwrap_or(source);
    let start = before.rfind('\n').map_or(0, |at| at + 1);
    (before.matches('\n').count() + 1, before[start..].encode_utf16().count() + 1)
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
    let math = emit.module.templates[id as usize].ns == Ns::Math;

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
    if wrapped && math {
        arguments.push(Argument::from(Expression::new_numeric_literal(
            span,
            2.0,
            None,
            NumberBase::Decimal,
            &emit.ast,
        )));
    } else if wrapped {
        arguments.push(Argument::from(Expression::new_boolean_literal(span, true, &emit.ast)));
    }
    // The detection axis, threaded where the claim is made. `template()` is
    // the ONE place a unit root reaches the DOM, so it is the one place that
    // holds both the tree the client would have built and the tree the server
    // sent — which is what the check needs and what a per-step tag argument
    // would only approximate. A production build omits the argument and the
    // comparison is unreachable.
    if emit.detect {
        if !wrapped {
            arguments.push(Argument::from(Expression::new_boolean_literal(span, false, &emit.ast)));
        }
        // The flag is the JSX's location, which is truthy and names where a
        // mismatch found in this template was written.
        let (line, column) = source_position(emit.source, span.start);
        let at = emit.allocator.alloc_str(&format!("{}:{line}:{column}", emit.filename));
        arguments.push(Argument::from(Expression::new_string_literal(span, at, None, &emit.ast)));
    }
    let arguments = ArenaVec::from_iter_in(arguments, &emit.allocator);
    let init = Expression::new_call_expression_with_pure(
        span, callee, None, arguments, false, true, &emit.ast,
    );

    let name = emit.template_name(id);
    emit.binding(name, init, span)
}
