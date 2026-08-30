use oxc_css_parser::ast::{
    AtRule, ComplexSelector, ComplexSelectorChild, CompoundSelector, PseudoClassSelectorArgKind,
    PseudoElementSelectorArgKind, SelectorList, SimpleSelector, Statement,
};
use oxc_css_parser::pos::Span;

use crate::text::{canonical, canonical_into};
use crate::{Error, Kind};

/// At-rules whose block holds rules and declarations, and through which the
/// enclosing selector still applies. Everything else with a block — `@keyframes`,
/// `@font-face`, `@property`, `@page`, `@counter-style`, and whatever the
/// working groups add next — is emitted as the author wrote it, because its
/// contents are not selectors and scoping them would be wrong.
fn is_conditional_group(name: &str) -> bool {
    const GROUPS: [&str; 7] =
        ["media", "supports", "container", "layer", "scope", "starting-style", "document"];
    GROUPS.iter().any(|group| name.eq_ignore_ascii_case(group))
}

/// At-rules that must lead a stylesheet, so they cannot be nested under a class
/// and cannot be emitted where they were written.
fn is_prologue(name: &str) -> bool {
    ["import", "charset", "namespace"].iter().any(|rule| name.eq_ignore_ascii_case(rule))
}

pub(crate) struct Sheet<'a> {
    source: &'a str,
    holes: &'a [&'a str],
    kind: Kind,
    offset: usize,
    head: String,
    out: String,
    /// Open at-rule preludes, outermost first. A declaration reached through
    /// two of them is emitted inside both.
    conditions: Vec<String>,
    /// Declarations seen at the current scope since the last flush. Flushed
    /// before every nested rule rather than accumulated, so `color` written
    /// before a nested block and `background` written after it keep their order
    /// in the cascade.
    pending: String,
}

impl<'a> Sheet<'a> {
    pub(crate) fn new(source: &'a str, holes: &'a [&'a str], kind: Kind, offset: usize) -> Self {
        Sheet {
            source,
            holes,
            kind,
            offset,
            head: String::new(),
            out: String::new(),
            conditions: Vec::new(),
            pending: String::new(),
        }
    }

    pub(crate) fn finish(mut self) -> String {
        self.head.push_str(&self.out);
        self.head
    }

    fn error(&self, message: impl Into<String>, span: Span) -> Error {
        Error {
            message: message.into(),
            start: span.start.saturating_sub(self.offset),
            end: span.end.saturating_sub(self.offset),
        }
    }

    fn slice(&self, span: Span) -> &'a str {
        &self.source[span.start.min(self.source.len())..span.end.min(self.source.len())]
    }

    pub(crate) fn statements(
        &mut self,
        statements: &[Statement<'_>],
        scope: &[String],
    ) -> Result<(), Error> {
        for statement in statements {
            match statement {
                Statement::Declaration(declaration) => {
                    if scope.is_empty() {
                        return Err(self.error(
                            "a declaration at the top level of `globalCss` has no element to \
                             apply to; wrap it in a selector",
                            declaration.span,
                        ));
                    }
                    if !self.pending.is_empty() {
                        self.pending.push(';');
                    }
                    canonical_into(self.slice(declaration.span), self.holes, &mut self.pending);
                }
                Statement::QualifiedRule(rule) => {
                    self.flush(scope);
                    let nested = self.cross(scope, &rule.selector)?;
                    self.statements(&rule.block.statements, &nested)?;
                }
                Statement::AtRule(at_rule) => {
                    self.flush(scope);
                    self.at_rule(at_rule, scope)?;
                }
                Statement::KeyframeBlock(keyframe) => {
                    self.flush(scope);
                    self.emit_verbatim(keyframe.span);
                }
                other => return Err(self.error(not_css(other), statement_span(other))),
            }
        }
        self.flush(scope);
        Ok(())
    }

    fn at_rule(&mut self, at_rule: &AtRule<'_>, scope: &[String]) -> Result<(), Error> {
        let name = at_rule.name.name;
        let Some(block) = at_rule.block.as_ref() else {
            if is_prologue(name) {
                if self.kind != Kind::Global {
                    return Err(self.error(
                        format!(
                            "`@{name}` has to lead the stylesheet, so it cannot be scoped to a \
                             class; move it to `globalCss`"
                        ),
                        at_rule.span,
                    ));
                }
                canonical_into(self.slice(at_rule.span), self.holes, &mut self.head);
                self.head.push(';');
                return Ok(());
            }
            self.emit_verbatim(at_rule.span);
            self.out.push(';');
            return Ok(());
        };

        if !is_conditional_group(name) {
            self.emit_verbatim(at_rule.span);
            return Ok(());
        }

        let prelude = Span { start: at_rule.span.start, end: block.span.start };
        self.conditions.push(canonical(self.slice(prelude), self.holes));
        let result = self.statements(&block.statements, scope);
        self.conditions.pop();
        result
    }

    /// A rule that carries its own contents — `@keyframes`, `@font-face`, a
    /// keyframe block — reaches the output as written, still inside whatever
    /// conditions enclose it, because `@media (print) { @page { … } }` means
    /// something and `@media (print) { .b1 { @page { … } } }` does not.
    fn emit_verbatim(&mut self, span: Span) {
        self.open_conditions();
        canonical_into(self.slice(span), self.holes, &mut self.out);
        self.close_conditions();
    }

    fn flush(&mut self, scope: &[String]) {
        if self.pending.is_empty() {
            return;
        }
        self.open_conditions();
        self.out.push_str(&scope.join(","));
        self.out.push('{');
        self.out.push_str(&self.pending);
        self.out.push('}');
        self.close_conditions();
        self.pending.clear();
    }

    fn open_conditions(&mut self) {
        for condition in &self.conditions {
            self.out.push_str(condition);
            self.out.push('{');
        }
    }

    fn close_conditions(&mut self) {
        for _ in 0..self.conditions.len() {
            self.out.push('}');
        }
    }

    /// The nesting cross product: every parent selector against every child
    /// selector, with `&` taking the parent and a child without one becoming a
    /// descendant.
    ///
    /// Deliberately NOT the `:is(…)` wrapping that native CSS nesting performs.
    /// `:is()` exists to give a nested rule one specificity regardless of which
    /// parent matched, and it changes the number the cascade compares. The
    /// parent here is a single generated class, so the cross product selects
    /// exactly the same elements at exactly the specificity the author would
    /// have written by hand.
    fn cross(&self, parents: &[String], list: &SelectorList<'_>) -> Result<Vec<String>, Error> {
        let mut out = Vec::with_capacity(parents.len().max(1) * list.selectors.len());
        for selector in &list.selectors {
            let mut ampersands = Vec::new();
            collect_nesting(selector, &mut ampersands);
            ampersands.sort_unstable();

            if parents.is_empty() {
                if let Some(&at) = ampersands.first() {
                    return Err(self.error(
                        "`&` at the top level of `globalCss` has no parent selector to stand for",
                        Span { start: at, end: at + 1 },
                    ));
                }
                out.push(canonical(self.slice(selector.span), self.holes));
                continue;
            }

            for parent in parents {
                if ampersands.is_empty() {
                    out.push(format!(
                        "{parent} {}",
                        canonical(self.slice(selector.span), self.holes)
                    ));
                    continue;
                }
                let mut spliced = String::with_capacity(selector.span.end - selector.span.start);
                let mut cursor = selector.span.start;
                for &at in &ampersands {
                    spliced.push_str(self.slice(Span { start: cursor, end: at }));
                    spliced.push_str(parent);
                    // `&` is one byte, and `NestingSelector::span` covers the
                    // glued suffix too — `&__label` has to keep its `__label`.
                    cursor = at + 1;
                }
                spliced.push_str(self.slice(Span { start: cursor, end: selector.span.end }));
                out.push(canonical(&spliced, self.holes));
            }
        }
        Ok(out)
    }
}

fn collect_nesting(selector: &ComplexSelector<'_>, out: &mut Vec<usize>) {
    for child in &selector.children {
        if let ComplexSelectorChild::CompoundSelector(compound) = child {
            collect_compound(compound, out);
        }
    }
}

fn collect_compound(compound: &CompoundSelector<'_>, out: &mut Vec<usize>) {
    for simple in &compound.children {
        match simple {
            SimpleSelector::Nesting(nesting) => out.push(nesting.span.start),
            // `:is(&, .a)`, `:not(&)`, `:has(& > .b)` — a nesting selector is
            // legal inside a functional pseudo-class and has to be substituted
            // there too.
            SimpleSelector::PseudoClass(pseudo) => match pseudo.arg.as_ref().map(|arg| &arg.kind) {
                Some(PseudoClassSelectorArgKind::SelectorList(list)) => {
                    for selector in &list.selectors {
                        collect_nesting(selector, out);
                    }
                }
                Some(PseudoClassSelectorArgKind::CompoundSelectorList(list)) => {
                    for compound in &list.selectors {
                        collect_compound(compound, out);
                    }
                }
                Some(PseudoClassSelectorArgKind::RelativeSelectorList(list)) => {
                    for relative in &list.selectors {
                        collect_nesting(&relative.complex_selector, out);
                    }
                }
                _ => {}
            },
            SimpleSelector::PseudoElement(pseudo) => {
                match pseudo.arg.as_ref().map(|arg| &arg.kind) {
                    Some(PseudoElementSelectorArgKind::CompoundSelector(compound)) => {
                        collect_compound(compound, out);
                    }
                    Some(PseudoElementSelectorArgKind::CompoundSelectorList(list)) => {
                        for compound in &list.selectors {
                            collect_compound(compound, out);
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
}

/// The parser runs in SCSS mode, because that is the only dialect its template
/// placeholders are allowed in. That widens the grammar past CSS, so every
/// construct the widening let through is named and refused rather than compiled
/// into something the browser will not run.
fn not_css(statement: &Statement<'_>) -> String {
    let construct = match statement {
        Statement::SassVariableDeclaration(_) => "a Sass variable (`$name: …`)",
        Statement::SassIfAtRule(_) => "a Sass `@if`",
        Statement::UnknownSassAtRule(_) => "a Sass at-rule",
        Statement::PostcssSimpleVarDeclaration(_) => "a postcss-simple-vars variable",
        Statement::Placeholder(_) => {
            return "an interpolation at statement position cannot be compiled: its text is not \
                    known until the program runs. Put the interpolation in a declaration value, \
                    or select between two whole blocks with a ternary."
                .to_string();
        }
        _ => "a Less construct",
    };
    format!("{construct} is not CSS, and this compiles CSS only")
}

fn statement_span(statement: &Statement<'_>) -> Span {
    match statement {
        Statement::AtRule(rule) => rule.span,
        Statement::Declaration(declaration) => declaration.span,
        Statement::KeyframeBlock(block) => block.span,
        Statement::QualifiedRule(rule) => rule.span,
        Statement::Placeholder(placeholder) => placeholder.span,
        Statement::SassVariableDeclaration(declaration) => declaration.span,
        Statement::SassIfAtRule(rule) => rule.span,
        Statement::UnknownSassAtRule(rule) => rule.span,
        Statement::PostcssSimpleVarDeclaration(declaration) => declaration.span,
        Statement::LessConditionalQualifiedRule(rule) => rule.span,
        Statement::LessExtendRule(rule) => rule.span,
        Statement::LessFunctionCall(call) => call.span,
        Statement::LessMixinCall(call) => call.span,
        Statement::LessMixinDefinition(definition) => definition.span,
        Statement::LessVariableCall(call) => call.span,
        Statement::LessVariableDeclaration(declaration) => declaration.span,
    }
}
