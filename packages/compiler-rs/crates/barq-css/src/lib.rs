//! goober's grammar, compiled.
//!
//! Nested CSS with `&` goes in, one flat stylesheet and one content-hashed
//! class name come out, and nothing of either survives to run in the browser.
//! The grammar is `oxc-css-parser`'s, so "modern CSS" means whatever that
//! parser accepts — `@container`, `@layer`, `@scope`, `@starting-style`,
//! `@property`, functional pseudo-classes, native nesting — rather than
//! whatever a regex here remembered to allow.
//!
//! Nothing is printed from an AST. Every node carries a span, so declarations
//! and at-rule preludes reach the output as the bytes the author wrote, with
//! only whitespace collapsed and only selectors rewritten. Minification is not
//! this crate's job: Vite's `build.cssMinify` defaults to lightningcss, which
//! knows the grammar well enough to shorten values safely.

pub mod atoms;
mod hash;
mod sheet;
mod text;

/// The text a class name is the hash of. Exposed because a caller that wants to
/// know whether two blocks will share a class should ask this rather than
/// compare source, which differs by whitespace the class name does not.
pub use text::canonical;

use std::borrow::Cow;

use oxc_css_parser::ast::{Statement, Stylesheet};
use oxc_css_parser::{Allocator, ParserBuilder, ParserOptions, Syntax, TemplatePlaceholder};

/// Marks an interpolation the caller could not fold to text. The token is
/// `` `BARQ-0` ``: backtick is not valid CSS, which is why the parser can
/// tokenize it atomically, and why it insists on SCSS to do so.
pub(crate) const PLACEHOLDER_PREFIX: &str = "BARQ-";

/// The wrapper each kind is parsed inside, so the parser is in the state the
/// author's text expects: a `css` block is a declaration block, not a
/// stylesheet, and a bare `color: red` is only a statement in the first.
const SCOPED_WRAPPER: &str = "x{";
const KEYFRAMES_WRAPPER: &str = "@keyframes x{";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A `css` block: declarations and nested rules, scoped to one generated class.
    Scoped,
    /// A `keyframes` block: keyframe selectors under one generated name.
    Keyframes,
    /// A `globalCss` block: whole rules, scoped to nothing.
    Global,
}

#[derive(Debug)]
pub struct Options<'a> {
    /// Leads a generated name so it can never start with a digit.
    pub prefix: &'a str,
    /// The binding the block was assigned to, in dev. `cardStyle_1n4k2p0`
    /// reads in devtools; `b1n4k2p0` does not.
    pub debug_name: Option<&'a str>,
    /// Replacement text per interpolation the caller could not fold, indexed by
    /// the placeholder's slot. A hole that folded to a literal is substituted
    /// by the caller BEFORE this crate sees the source, so what arrives here is
    /// only what has to become a `var(--…)` reference.
    pub holes: &'a [&'a str],
}

impl Default for Options<'_> {
    fn default() -> Self {
        Options { prefix: "b", debug_name: None, holes: &[] }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Compiled {
    /// The generated class, or the `@keyframes` name. Empty under [`Kind::Global`].
    pub name: String,
    pub css: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub message: String,
    /// Byte offsets into the source the caller passed, with the wrapper this
    /// crate parsed it inside already subtracted.
    pub start: usize,
    pub end: usize,
}

pub fn compile(source: &str, kind: Kind, options: &Options<'_>) -> Result<Compiled, Error> {
    let (wrapped, offset) = match kind {
        Kind::Scoped => (Cow::Owned(format!("{SCOPED_WRAPPER}{source}}}")), SCOPED_WRAPPER.len()),
        Kind::Keyframes => {
            (Cow::Owned(format!("{KEYFRAMES_WRAPPER}{source}}}")), KEYFRAMES_WRAPPER.len())
        }
        Kind::Global => (Cow::Borrowed(source), 0),
    };

    let allocator = Allocator::default();
    let mut parser = ParserBuilder::new(&allocator, &wrapped)
        .syntax(Syntax::Scss)
        .options(ParserOptions {
            template_placeholder: Some(TemplatePlaceholder { prefix: PLACEHOLDER_PREFIX }),
            ..ParserOptions::default()
        })
        .build();

    let stylesheet =
        parser.parse::<Stylesheet>().map_err(|error| from_parser(&error, offset, source))?;
    if let Some(error) = parser.recoverable_errors().first() {
        return Err(from_parser(error, offset, source));
    }

    let name = match kind {
        Kind::Global => String::new(),
        _ => {
            hash::name(options.prefix, options.debug_name, &text::canonical(source, options.holes))
        }
    };

    let mut sheet = sheet::Sheet::new(&wrapped, options.holes, kind, offset);
    match kind {
        Kind::Global => sheet.statements(&stylesheet.statements, &[])?,
        Kind::Scoped => {
            let Some(Statement::QualifiedRule(rule)) = stylesheet.statements.first() else {
                return Err(Error {
                    message: "expected a block of declarations".to_string(),
                    start: 0,
                    end: source.len(),
                });
            };
            sheet.statements(&rule.block.statements, &[format!(".{name}")])?;
        }
        Kind::Keyframes => {
            let Some(Statement::AtRule(at_rule)) = stylesheet.statements.first() else {
                return Err(Error {
                    message: "expected keyframe selectors".to_string(),
                    start: 0,
                    end: source.len(),
                });
            };
            let Some(block) = at_rule.block.as_ref() else {
                return Err(Error {
                    message: "expected keyframe selectors".to_string(),
                    start: 0,
                    end: source.len(),
                });
            };
            // Emitted whole rather than walked: a keyframe selector is a
            // percentage, not something a parent class may be crossed into.
            let body = &wrapped[block.span.start..block.span.end];
            return Ok(Compiled {
                css: format!("@keyframes {name}{}", text::canonical(body, options.holes)),
                name,
            });
        }
    }

    Ok(Compiled { name, css: sheet.finish() })
}

fn from_parser(error: &oxc_css_parser::error::Error, offset: usize, source: &str) -> Error {
    let start = error.span.start.saturating_sub(offset).min(source.len());
    let end = error.span.end.saturating_sub(offset).min(source.len());
    Error { message: error.kind.to_string(), start, end }
}
