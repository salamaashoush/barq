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
#[cfg(test)]
mod css_ts;
mod hash;
pub mod order;
mod sheet;
mod text;

/// The text a class name is the hash of. Exposed because a caller that wants to
/// know whether two blocks will share a class should ask this rather than
/// compare source, which differs by whitespace the class name does not.
pub use text::canonical;

use oxc_css_parser::ast::{Statement, Stylesheet};
use oxc_css_parser::{Allocator, ParserBuilder, ParserOptions, Syntax, TemplatePlaceholder};

/// Marks an interpolation the caller could not fold to text. The token is
/// `` `BARQ-0` ``: backtick is not valid CSS, which is why the parser can
/// tokenize it atomically, and why it insists on SCSS to do so.
pub(crate) const PLACEHOLDER_PREFIX: &str = "BARQ-";

/// A keyframe selector such as `50%` only parses inside `@keyframes`, so a
/// `keyframes` block is parsed inside this wrapper and every span it yields is
/// shifted back by its length.
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
    if kind == Kind::Keyframes {
        return keyframes(source, options);
    }

    let allocator = Allocator::default();
    // A `css` block is a declaration block's contents and is parsed as one, so
    // a bare `color: red` is a statement and a `}` that closes nothing is an
    // error.
    let stylesheet = parse(&allocator, source, kind == Kind::Scoped, 0, source)?;
    sheet::vet(source, &stylesheet.statements, 0, false)?;

    let mut sheet = sheet::Sheet::new(source, options.holes, kind);
    match kind {
        Kind::Scoped => {
            let name = hash::name(
                options.prefix,
                options.debug_name,
                &text::canonical(source, options.holes),
            );
            sheet.statements(&stylesheet.statements, &[format!(".{name}")])?;
            Ok(Compiled { name, css: sheet.finish() })
        }
        _ => {
            sheet.statements(&stylesheet.statements, &[])?;
            Ok(Compiled { name: String::new(), css: sheet.finish() })
        }
    }
}

fn keyframes(source: &str, options: &Options<'_>) -> Result<Compiled, Error> {
    let wrapped = format!("{KEYFRAMES_WRAPPER}{source}}}");
    let offset = KEYFRAMES_WRAPPER.len();
    let allocator = Allocator::default();
    let stylesheet = parse(&allocator, &wrapped, false, offset, source).map_err(|error| {
        // A `}` that closes nothing closes the wrapper instead, and the parser
        // only notices at the wrapper's own brace, past the end of `source`.
        match unopened_brace(source) {
            Some(at) if error.start == source.len() => Error {
                message: "This `}` closes a block that was never opened.".to_string(),
                start: at,
                end: at + 1,
            },
            _ => error,
        }
    })?;
    let block = match stylesheet.statements.first() {
        Some(Statement::AtRule(at_rule)) => at_rule.block.as_ref(),
        _ => None,
    };
    let Some(block) = block else {
        return Err(Error {
            message: "This `keyframes` block has no steps. Write them as \
                      `from { opacity: 0 } to { opacity: 1 }`."
                .to_string(),
            start: 0,
            end: source.len(),
        });
    };
    sheet::vet(&wrapped, &block.statements, offset, true)?;
    let name =
        hash::name(options.prefix, options.debug_name, &text::canonical(source, options.holes));
    // Emitted whole rather than walked: a keyframe selector is a percentage, not
    // something a parent class may be crossed into.
    let body = &wrapped[block.span.start..block.span.end];
    Ok(Compiled { css: format!("@keyframes {name}{}", text::canonical(body, options.holes)), name })
}

/// `text` is what the parser reads, which is `source` itself or `source` inside
/// a wrapper `offset` bytes long.
fn parse<'a>(
    allocator: &'a Allocator,
    text: &'a str,
    block_contents: bool,
    offset: usize,
    source: &str,
) -> Result<Stylesheet<'a>, Error> {
    let mut parser = ParserBuilder::new(allocator, text)
        .syntax(Syntax::Scss)
        .options(ParserOptions {
            template_placeholder: Some(TemplatePlaceholder { prefix: PLACEHOLDER_PREFIX }),
            block_contents,
        })
        .build();
    let stylesheet =
        parser.parse::<Stylesheet>().map_err(|error| from_parser(&error, offset, source))?;
    if let Some(error) = parser.recoverable_errors().first() {
        return Err(from_parser(error, offset, source));
    }
    Ok(stylesheet)
}

/// The first `}` with no `{` before it to close, outside strings and comments.
fn unopened_brace(source: &str) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut depth = 0usize;
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            quote @ (b'"' | b'\'') => {
                index += 1;
                while index < bytes.len() && bytes[index] != quote {
                    index += if bytes[index] == b'\\' { 2 } else { 1 };
                }
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                index += 2;
                while index < bytes.len() && !bytes[index..].starts_with(b"*/") {
                    index += 1;
                }
                index += 1;
            }
            b'{' => depth += 1,
            b'}' if depth == 0 => return Some(index),
            b'}' => depth -= 1,
            _ => {}
        }
        index += 1;
    }
    None
}

fn from_parser(error: &oxc_css_parser::error::Error, offset: usize, source: &str) -> Error {
    let start = error.span.start.saturating_sub(offset).min(source.len());
    let end = error.span.end.saturating_sub(offset).min(source.len());
    Error { message: format!("The CSS parser reports: {}.", error.kind), start, end }
}
