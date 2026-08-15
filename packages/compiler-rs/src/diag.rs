use oxc::ast::Comment;
use oxc::span::Span;

/// A diagnostic's severity. Three levels, carried end to end: `compile.rs` used
/// to map both `Note` and `Warning` onto one `Warning` and keep the level as a
/// `"note: "` prefix inside the message string, which made the documented escape
/// hatch — "a rule that cannot be made precise ships as a note" — inexpressible.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Level {
    Note,
    Warning,
    Error,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Note => "note",
            Level::Warning => "warning",
            Level::Error => "error",
        }
    }
}

/// What a project-level severity map may say about a code.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Category {
    Suppress,
    Note,
    Warning,
    Error,
}

impl Category {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text {
            "suppress" | "off" => Category::Suppress,
            "note" | "info" => Category::Note,
            "warning" | "warn" => Category::Warning,
            "error" => Category::Error,
            _ => return None,
        })
    }

    fn level(self) -> Option<Level> {
        match self {
            Category::Suppress => None,
            Category::Note => Some(Level::Note),
            Category::Warning => Some(Level::Warning),
            Category::Error => Some(Level::Error),
        }
    }
}

macro_rules! codes {
    ($($variant:ident = $text:literal, $level:ident, $summary:literal;)*) => {
        /// A stable diagnostic code. **Never renamed and never reused**: an
        /// ignore comment in user code is a public API, and Svelte 5 renaming
        /// every code from dashes to underscores silently invalidated every
        /// `svelte-ignore` in every codebase (sveltejs/svelte#11414).
        #[derive(Clone, Copy, PartialEq, Eq, Debug)]
        pub enum Code {
            $($variant,)*
        }

        impl Code {
            pub const ALL: &'static [Code] = &[$(Code::$variant,)*];

            pub fn as_str(self) -> &'static str {
                match self { $(Code::$variant => $text,)* }
            }

            pub fn parse(text: &str) -> Option<Self> {
                match text { $($text => Some(Code::$variant),)* _ => None }
            }

            /// The level the code ships at when no severity map says otherwise.
            pub fn default_level(self) -> Level {
                match self { $(Code::$variant => Level::$level,)* }
            }

            /// One line, for a listing. The full text is the docs page.
            pub fn summary(self) -> &'static str {
                match self { $(Code::$variant => $summary,)* }
            }
        }
    };
}

codes! {
    Barq001 = "BARQ001", Warning, "an accessor binding is coerced to a value instead of being called";
    Barq002 = "BARQ002", Warning, "an accessor binding is used as a condition, where a function is always truthy";
    Barq003 = "BARQ003", Warning, "a property is read off an accessor binding instead of off its value";
    Barq004 = "BARQ004", Note, "`For`: the origin of `each` cannot be proved to be values `mapArray` recreates";
    Barq005 = "BARQ005", Warning, "props are destructured in the parameter list, which flattens every getter";
    Barq008 = "BARQ008", Warning, "a `barq-ignore-next-line` matched no diagnostic";
    Barq009 = "BARQ009", Warning, "a `barq-ignore-next-line` could not be parsed";
    Barq010 = "BARQ010", Warning, "a Block is forwarded into a slot the callee reads as a Cell, where it throws";
}

/// Where the pages live. A consumer gets this string verbatim — the Vite panel
/// prints it, a terminal reporter appends it — so it has to resolve from
/// somewhere other than a source checkout of this package. The pages also ship
/// inside the package (`package.json` `files`), at the same trailing path.
const DOCS_BASE: &str = "https://github.com/salamaashoush/barq/blob/main/packages/compiler-rs/docs";

impl Code {
    /// The docs page for this code.
    pub fn docs(self) -> String {
        format!("{DOCS_BASE}/{}.md", self.as_str())
    }

    /// The same page as a path inside the installed package, which is what a
    /// test asserting the page exists has to look at.
    pub fn docs_path(self) -> String {
        format!("docs/{}.md", self.as_str())
    }

    /// Escalation is a project decision, except here. `@ts-expect-error` turning
    /// unused halts the whole pipeline, which pushes teams onto the unsafe
    /// `@ts-ignore` that then swallows new errors (microsoft/TypeScript#62579),
    /// so the two engine codes can be silenced or demoted but never promoted.
    fn escalates(self) -> bool {
        !matches!(self, Code::Barq008 | Code::Barq009)
    }
}

/// One resolution of "how loud is this code", shared by the compiler, the Vite
/// plugin and any CLI. Svelte's split between `onwarn` and `svelte-check` means
/// a code silenced in one channel stays loud in the other, and people file
/// issues about it (sveltejs/language-tools#650).
#[derive(Debug, Clone, Default)]
pub struct Severities {
    checks: Vec<(Code, Category)>,
    default_category: Option<Category>,
    /// Codes named in `checks` that this build does not know. Reported once.
    pub unknown: Vec<String>,
}

impl Severities {
    pub fn new(checks: &[(String, String)], default_category: Option<&str>) -> Self {
        let mut resolved = Vec::with_capacity(checks.len());
        let mut unknown = Vec::new();
        for (code, category) in checks {
            match (Code::parse(code), Category::parse(category)) {
                (Some(code), Some(category)) => resolved.push((code, category)),
                _ => unknown.push(format!("{code}: {category}")),
            }
        }
        let default_category = match default_category {
            None => None,
            Some(text) => match Category::parse(text) {
                Some(category) => Some(category),
                None => {
                    unknown.push(format!("defaultCategory: {text}"));
                    None
                }
            },
        };
        Self { checks: resolved, default_category, unknown }
    }

    /// `None` means suppressed. An explicit per-code entry wins over
    /// `defaultCategory`, which wins over the code's own level — Angular's
    /// shape (`extendedDiagnostics: { checks, defaultCategory }`).
    pub fn resolve(&self, code: Code) -> Option<Level> {
        let category = self
            .checks
            .iter()
            .rev()
            .find(|(candidate, _)| *candidate == code)
            .map(|(_, category)| *category)
            .or(self.default_category);
        let level = match category {
            Some(category) => category.level()?,
            None => code.default_level(),
        };
        Some(if code.escalates() { level } else { level.min(Level::Warning) })
    }
}

/// The reason text a directive must carry, in characters. typescript-eslint's
/// `ban-ts-comment` uses 10 in its strict config, "because it forces developers
/// to articulate why".
const MIN_REASON: usize = 10;

pub const DIRECTIVE: &str = "barq-ignore-next-line";

/// A parsed `// barq-ignore-next-line BARQ001, BARQ005 (reason text)`.
#[derive(Debug)]
pub struct Suppression {
    pub codes: Vec<Code>,
    /// The comment itself, for the unused-suppression report.
    pub span: Span,
    /// Half-open byte range of the line the directive covers.
    pub target: (u32, u32),
    pub used: bool,
}

/// A directive this scanner could not use, with the reason. Never an error:
/// a malformed suppression must not fail a build, and it must never influence
/// codegen (facebook/react#34261 is what happens when a disable comment does).
#[derive(Debug)]
pub struct MalformedSuppression {
    pub span: Span,
    pub message: String,
}

#[derive(Debug, Default)]
pub struct Suppressions {
    pub entries: Vec<Suppression>,
    pub malformed: Vec<MalformedSuppression>,
}

impl Suppressions {
    /// Scans the parser's comment table once. There is no AST walk here and no
    /// second parse: comments are trivia the parser already collected.
    pub fn scan(comments: &[Comment], source: &str) -> Self {
        let mut out = Suppressions::default();
        for comment in comments {
            let content = &source[comment.content_span().start as usize
                ..(comment.content_span().end as usize).min(source.len())];
            let text = content.trim();
            let Some(rest) = text.strip_prefix(DIRECTIVE) else { continue };
            match parse_directive(rest) {
                Ok(codes) => out.entries.push(Suppression {
                    codes,
                    span: comment.span,
                    target: target_line(source, comment.span.end),
                    used: false,
                }),
                Err(message) => {
                    out.malformed.push(MalformedSuppression { span: comment.span, message });
                }
            }
        }
        out
    }

    /// Scoped to the code AND the span. Naming the code is the whole point:
    /// a bare directive swallows an unrelated diagnostic on the same line, which
    /// TypeScript labelled a Design Limitation on `@ts-expect-error`
    /// (microsoft/TypeScript#47551) and could not fix.
    pub fn covers(&mut self, code: Code, span: Span) -> bool {
        let mut covered = false;
        for entry in &mut self.entries {
            if entry.codes.contains(&code)
                && span.start >= entry.target.0
                && span.start < entry.target.1
            {
                entry.used = true;
                covered = true;
            }
        }
        covered
    }
}

fn parse_directive(rest: &str) -> Result<Vec<Code>, String> {
    let (codes, reason) = match rest.find('(') {
        Some(open) => {
            let close = rest.rfind(')').ok_or_else(|| {
                format!("`{DIRECTIVE}` opens a reason with `(` and never closes it")
            })?;
            if close < open {
                return Err(format!("`{DIRECTIVE}`'s reason parentheses are the wrong way round"));
            }
            (&rest[..open], rest[open + 1..close].trim())
        }
        None => (rest, ""),
    };

    let mut parsed = Vec::new();
    for token in codes.split([',', ' ', '\t']).filter(|token| !token.is_empty()) {
        match Code::parse(token) {
            Some(code) => parsed.push(code),
            None => {
                return Err(format!(
                    "`{token}` is not a barq diagnostic code — write one of {}",
                    Code::ALL.iter().map(|code| code.as_str()).collect::<Vec<_>>().join(", ")
                ));
            }
        }
    }
    if parsed.is_empty() {
        return Err(format!(
            "`{DIRECTIVE}` must name the code it silences, because a codeless form silences \
             diagnostics nobody read (microsoft/TypeScript#38288)"
        ));
    }
    if reason.chars().count() < MIN_REASON {
        return Err(format!(
            "`{DIRECTIVE}` needs a reason of at least {MIN_REASON} characters in parentheses — \
             `// {DIRECTIVE} {} (why this is correct here)`",
            parsed[0].as_str()
        ));
    }
    Ok(parsed)
}

/// The line a directive covers: the next one that is neither blank nor another
/// comment, so two stacked directives both reach the statement below them. In
/// JSX the directive has to be `{/* … */}` — a `//` line between children is
/// TEXT and never reaches the comment table — so a stack of those has to be
/// skipped by the same rule.
///
/// Line granularity is deliberate and it is what Svelte and TypeScript both do.
/// Naming the code is what keeps it from swallowing an unrelated diagnostic;
/// the span half of "code AND span" is this range, not the whole statement. A
/// diagnostic on a later line of a multi-line statement is therefore NOT
/// covered, exactly as `@ts-expect-error` does not cover one.
fn target_line(source: &str, after: u32) -> (u32, u32) {
    const COMMENT_STARTS: [&str; 3] = ["//", "/*", "{/*"];
    let bytes = source.as_bytes();
    let mut start = line_end(bytes, after as usize);
    while start < bytes.len() {
        let end = line_end(bytes, start);
        let text = source[start..end].trim_start();
        if !text.is_empty() && !COMMENT_STARTS.iter().any(|open| text.starts_with(open)) {
            return (start as u32, end as u32);
        }
        if end == start {
            break;
        }
        start = end;
    }
    (start as u32, start as u32)
}

/// One past the line terminator that ends the line `at` sits on.
fn line_end(bytes: &[u8], at: usize) -> usize {
    let mut index = at;
    while index < bytes.len() {
        match bytes[index] {
            b'\n' => return index + 1,
            b'\r' => {
                return index + 1 + usize::from(bytes.get(index + 1) == Some(&b'\n'));
            }
            _ => index += 1,
        }
    }
    bytes.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn severities(checks: &[(&str, &str)], default: Option<&str>) -> Severities {
        let checks: Vec<(String, String)> =
            checks.iter().map(|(a, b)| ((*a).to_string(), (*b).to_string())).collect();
        Severities::new(&checks, default)
    }

    #[test]
    fn every_code_is_unique_and_round_trips_through_its_text() {
        let mut seen = Vec::new();
        for code in Code::ALL {
            assert!(!seen.contains(&code.as_str()), "duplicate code {}", code.as_str());
            seen.push(code.as_str());
            assert_eq!(Code::parse(code.as_str()), Some(*code));
            assert!(code.as_str().starts_with("BARQ"));
            assert_eq!(code.docs_path(), format!("docs/{}.md", code.as_str()));
            // A consumer prints this verbatim, so it has to be resolvable from
            // somewhere other than a source checkout of this package.
            assert_eq!(code.docs(), format!("{DOCS_BASE}/{}.md", code.as_str()));
            assert!(code.docs().starts_with("https://"));
        }
    }

    #[test]
    fn an_explicit_check_beats_the_default_category_which_beats_the_codes_own_level() {
        let plain = severities(&[], None);
        assert_eq!(plain.resolve(Code::Barq004), Some(Level::Note));
        assert_eq!(plain.resolve(Code::Barq001), Some(Level::Warning));

        let escalated = severities(&[], Some("error"));
        assert_eq!(escalated.resolve(Code::Barq004), Some(Level::Error));
        assert_eq!(escalated.resolve(Code::Barq001), Some(Level::Error));

        let mixed = severities(&[("BARQ001", "suppress"), ("BARQ004", "warning")], Some("error"));
        assert_eq!(mixed.resolve(Code::Barq001), None);
        assert_eq!(mixed.resolve(Code::Barq004), Some(Level::Warning));
        assert_eq!(mixed.resolve(Code::Barq005), Some(Level::Error));
    }

    /// TypeScript#62579: an unused suppression that fails the build is what
    /// pushes teams onto the form that silently swallows new errors.
    #[test]
    fn the_two_engine_codes_can_be_silenced_but_never_promoted_to_an_error() {
        let escalated = severities(&[], Some("error"));
        assert_eq!(escalated.resolve(Code::Barq008), Some(Level::Warning));
        assert_eq!(escalated.resolve(Code::Barq009), Some(Level::Warning));

        let named = severities(&[("BARQ008", "error"), ("BARQ009", "suppress")], None);
        assert_eq!(named.resolve(Code::Barq008), Some(Level::Warning));
        assert_eq!(named.resolve(Code::Barq009), None);
    }

    #[test]
    fn an_unreadable_severity_map_is_reported_rather_than_guessed() {
        let bad = severities(&[("BARQ999", "warning"), ("BARQ001", "loud")], Some("shout"));
        assert_eq!(bad.unknown.len(), 3);
        assert_eq!(bad.resolve(Code::Barq001), Some(Level::Warning));
    }

    #[test]
    fn a_directive_needs_a_known_code_and_a_reason_of_substance() {
        assert!(parse_directive(" BARQ001 (props are accessors here)").is_ok());
        assert_eq!(
            parse_directive(" BARQ001, BARQ003 (both are deliberate)").unwrap(),
            vec![Code::Barq001, Code::Barq003]
        );
        assert!(parse_directive(" (no code at all here)").unwrap_err().contains("must name"));
        assert!(parse_directive(" BARQ001").unwrap_err().contains("reason"));
        assert!(parse_directive(" BARQ001 (short)").unwrap_err().contains("reason"));
        assert!(parse_directive(" BARQ042 (a reason of substance)").unwrap_err().contains("not a"));
        assert!(parse_directive(" BARQ001 (unclosed reason").unwrap_err().contains("never closes"));
    }

    #[test]
    fn a_directive_reaches_past_blank_lines_and_stacked_directives() {
        let source = "// barq-ignore-next-line BARQ001 (first reason here)\n\
                      // barq-ignore-next-line BARQ003 (second reason here)\n\
                      \n\
                      const a = `${count}`;\n";
        let allocator = oxc::allocator::Allocator::new();
        let parsed = oxc::parser::Parser::new(
            &allocator,
            source,
            crate::compile::source_type_for(Some("a.tsx")),
        )
        .parse();
        let mut suppressions = Suppressions::scan(&parsed.program.comments, source);
        assert_eq!(suppressions.entries.len(), 2);
        let statement = source.find("const a").unwrap() as u32;
        let at = Span::new(statement, statement + 5);
        assert!(suppressions.covers(Code::Barq001, at));
        assert!(suppressions.covers(Code::Barq003, at));
        assert!(!suppressions.covers(Code::Barq002, at), "a directive silences only its own code");
        assert!(suppressions.entries.iter().all(|entry| entry.used));
    }

    /// The JSX spelling. A `//` line between JSX children is TEXT — it never
    /// reaches the comment table and it is baked into the template — so
    /// `{/* … */}` is the only form that works there, and a stack of them has to
    /// reach the element below exactly as a stack of `//` lines does.
    #[test]
    fn a_stack_of_jsx_comment_directives_reaches_the_element_below_it() {
        let source = "const v = (\n\
                      \x20 <div>\n\
                      \x20   {/* barq-ignore-next-line BARQ001 (first reason here) */}\n\
                      \x20   {/* barq-ignore-next-line BARQ003 (second reason here) */}\n\
                      \x20   <pre>{`${count}`}</pre>\n\
                      \x20 </div>\n\
                      );\n";
        let allocator = oxc::allocator::Allocator::new();
        let parsed = oxc::parser::Parser::new(
            &allocator,
            source,
            crate::compile::source_type_for(Some("a.tsx")),
        )
        .parse();
        let mut suppressions = Suppressions::scan(&parsed.program.comments, source);
        assert_eq!(suppressions.entries.len(), 2);
        let hole = source.find("${count}").unwrap() as u32;
        let at = Span::new(hole + 2, hole + 7);
        assert!(suppressions.covers(Code::Barq001, at));
        assert!(suppressions.covers(Code::Barq003, at));
        assert!(suppressions.entries.iter().all(|entry| entry.used));
    }
}
