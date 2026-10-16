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
    pub(crate) fn new(source: &'a str, holes: &'a [&'a str], kind: Kind) -> Self {
        Sheet {
            source,
            holes,
            kind,
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
        Error { message: message.into(), start: span.start, end: span.end }
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
                            "This declaration is at the top level of `globalCss`, where it has \
                             no element to apply to. Wrap it in a selector, such as \
                             `body { color: black }`.",
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
                            "`@{name}` must come first in a stylesheet, so it cannot go in a \
                             block that is scoped to a class. Move it to a `globalCss` block."
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
                        "`&` stands for the parent selector, and at the top level of `globalCss` \
                         there is no parent selector. Write the selector out in full.",
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

/// Refuses a placeholder anywhere but a declaration's value.
///
/// A placeholder becomes `var(--…)`, and CSS reads `var()` in a value and
/// nowhere else. The parser accepts one inside an identifier, a selector and an
/// at-rule's prelude, the way Sass accepts `#{}`, so `margin-${side}: 0` would
/// otherwise compile to `margin-var(--b0): 0`, which the browser drops without
/// a word. `offset` is the length of the wrapper `source` was parsed inside, and
/// `steps` says the statements are a `@keyframes` body, whose rule preludes are
/// keyframe selectors.
pub(crate) fn vet(
    source: &str,
    statements: &[Statement<'_>],
    offset: usize,
    steps: bool,
) -> Result<(), Error> {
    if !source.contains('`') {
        return Ok(());
    }
    let refuse = |message: String, at: Span| Error {
        message,
        start: at.start.saturating_sub(offset),
        end: at.end.saturating_sub(offset),
    };
    let step = "This interpolation is part of a keyframe selector. It becomes `var(--…)`, which \
                CSS reads only in a value, so the step would be dropped. Write the step as a \
                literal, such as `50% { opacity: 0.5 }`.";
    for statement in statements {
        match statement {
            Statement::Declaration(declaration) => {
                let name =
                    Span { start: declaration.span.start, end: declaration.colon_span.start };
                if let Some(at) = placeholders(source, name).next() {
                    return Err(refuse(
                        "This interpolation is part of a property name. It becomes `var(--…)`, \
                         which CSS reads only in a value, so the browser would drop the \
                         declaration. Write the property out in full and interpolate its value \
                         instead, such as `margin-left: ${gap}`."
                            .to_string(),
                        at,
                    ));
                }
                let value = Span { start: declaration.colon_span.end, end: declaration.span.end };
                if let Some(at) = placeholders(source, value).find(|at| glued(source, at.start)) {
                    return Err(refuse(
                        "This interpolation is joined to the text before it, so it is part of \
                         one identifier. It becomes `var(--…)`, which CSS does not read inside \
                         an identifier, so the browser would drop the declaration. Interpolate \
                         the whole value, such as `font-family: ${family}`, and build the name \
                         in JavaScript."
                            .to_string(),
                        at,
                    ));
                }
            }
            Statement::QualifiedRule(rule) => {
                let prelude = Span { start: rule.span.start, end: rule.block.span.start };
                if let Some(at) = placeholders(source, prelude).next() {
                    let message = if steps {
                        step
                    } else {
                        "This interpolation is part of a selector. It becomes `var(--…)`, which \
                         CSS reads only in a value, so the rule would never match. Write the \
                         selector out in full, or select on an attribute the element carries, \
                         such as `&[data-tone=\"warm\"]`."
                    };
                    return Err(refuse(message.to_string(), at));
                }
                vet(source, &rule.block.statements, offset, false)?;
            }
            Statement::KeyframeBlock(keyframe) => {
                let prelude = Span { start: keyframe.span.start, end: keyframe.block.span.start };
                if let Some(at) = placeholders(source, prelude).next() {
                    return Err(refuse(step.to_string(), at));
                }
                vet(source, &keyframe.block.statements, offset, false)?;
            }
            Statement::AtRule(at_rule) => {
                let name = at_rule.name.name;
                let end = at_rule.block.as_ref().map_or(at_rule.span.end, |block| block.span.start);
                let prelude = Span { start: at_rule.span.start, end };
                if let Some(at) = placeholders(source, prelude).next() {
                    return Err(refuse(
                        format!(
                            "This interpolation is part of the `@{name}` prelude. It becomes \
                             `var(--…)`, which CSS reads only in a declaration's value, so the \
                             rule would never apply. Write the prelude with literal values, \
                             such as `@media (min-width: 600px)`."
                        ),
                        at,
                    ));
                }
                if let Some(block) = &at_rule.block {
                    let steps = name.to_ascii_lowercase().ends_with("keyframes");
                    vet(source, &block.statements, offset, steps)?;
                }
            }
            Statement::Placeholder(placeholder) => {
                return Err(refuse(not_css(statement), placeholder.span));
            }
            _ => {}
        }
    }
    Ok(())
}

/// The placeholder tokens inside `span`, skipping strings and comments, where a
/// backtick is text and `canonical` copies it as written.
fn placeholders(source: &str, span: Span) -> impl Iterator<Item = Span> + '_ {
    let bytes = source.as_bytes();
    let end = span.end.min(bytes.len());
    let mut index = span.start.min(end);
    std::iter::from_fn(move || {
        while index < end {
            match bytes[index] {
                quote @ (b'"' | b'\'') => {
                    index += 1;
                    while index < end && bytes[index] != quote {
                        index += if bytes[index] == b'\\' { 2 } else { 1 };
                    }
                    index += 1;
                }
                b'/' if bytes.get(index + 1) == Some(&b'*') => {
                    index += 2;
                    while index < end
                        && !(bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/'))
                    {
                        index += 1;
                    }
                    index += 2;
                }
                b'`' => {
                    let start = index;
                    index += 1;
                    while index < end && bytes[index] != b'`' {
                        index += 1;
                    }
                    index += 1;
                    return Some(Span { start, end: index.min(end) });
                }
                _ => index += 1,
            }
        }
        None
    })
}

/// Whether the character before a placeholder continues an identifier, so the
/// two would be read as one token.
fn glued(source: &str, at: usize) -> bool {
    source[..at].chars().next_back().is_some_and(|before| {
        before.is_ascii_alphanumeric() || matches!(before, '-' | '_' | '\\') || !before.is_ascii()
    })
}

/// The parser runs in SCSS mode, because that is the only dialect its template
/// placeholders are allowed in. That widens the grammar past CSS, so every
/// construct the widening let through is named and refused rather than compiled
/// into something the browser will not run.
fn not_css(statement: &Statement<'_>) -> String {
    let construct = match statement {
        Statement::SassVariableDeclaration(_) => "A Sass variable (`$name: value`)",
        Statement::SassIfAtRule(_) => "A Sass `@if`",
        Statement::UnknownSassAtRule(_) => "A Sass at-rule",
        Statement::PostcssSimpleVarDeclaration(_) => "A postcss-simple-vars variable",
        Statement::Placeholder(_) => {
            return "This `${...}` stands where a whole declaration or rule would go, and its \
                    text is only known when the program runs, so it cannot be compiled. \
                    Interpolate inside a value, such as `color: ${color}`, or write two blocks \
                    and choose between their classes."
                .to_string();
        }
        Statement::UnknownQualifiedRule(_) => {
            return "This block's prelude is not a selector, so the browser drops the rule. A \
                    percentage such as `50% { ... }` belongs inside `@keyframes`, and a property \
                    is written as a declaration, `font-family: sans-serif`, not as a block."
                .to_string();
        }
        _ => "A Less construct",
    };
    format!(
        "{construct} is preprocessor syntax, and `@barqjs/css` compiles plain CSS only. Rewrite \
         it as CSS; for a variable, use a custom property: `--brand: red` and `var(--brand)`."
    )
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
        Statement::UnknownQualifiedRule(rule) => rule.span,
    }
}
