use std::fmt;
use std::path::PathBuf;

use oxc::allocator::Allocator;
use oxc::codegen::{Codegen, CodegenOptions, CodegenReturn, CommentOptions, IndentChar};
use oxc::diagnostics::{OxcDiagnostic, Severity as OxcSeverity};
use oxc::parser::{ParseOptions, Parser, ParserReturn};
use oxc::span::SourceType;

use crate::ir::Module;
use crate::options::ResolvedOptions;
use crate::{analysis, codegen, harvest, lower, passes};

pub const DEFAULT_FILENAME: &str = "input.tsx";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub severity: Severity,
    pub message: String,
    pub filename: String,
    pub line: u32,
    pub column: u32,
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}:{}: {}", self.filename, self.line, self.column, self.message)
    }
}

#[derive(Debug, Clone)]
pub struct CompileOutput {
    pub code: String,
    pub map: Option<String>,
    pub warnings: Vec<Diagnostic>,
}

pub fn source_type_for(filename: Option<&str>) -> SourceType {
    let Some(filename) = filename else {
        return SourceType::tsx();
    };
    let extension = filename.rsplit('.').next().unwrap_or_default();
    match extension {
        "ts" => SourceType::ts(),
        "mts" => SourceType::ts().with_module(true),
        "cts" => SourceType::ts().with_commonjs(true),
        "jsx" => SourceType::jsx(),
        "js" | "mjs" => SourceType::mjs().with_jsx(true),
        "cjs" => SourceType::cjs().with_jsx(true),
        _ => SourceType::tsx(),
    }
}

// Measured on this crate's oxc version by bisecting the thread stack a single
// nesting shape survives, at depth 2000, debug profile. The figure is the sum
// over every recursive phase, and the staged pipeline runs four of them where
// M2 ran two — oxc_semantic and the harvest walk are the new ones:
//
//   shape                      M2 debug   staged debug
//   (((1)))  /  z(((...)))     2833 B     2816 B    <- worst, and always bracketed
//   `${ `${ 1 }` }`            2637 B     2620 B
//   [[[1]]]                    2506 B     2489 B
//   <b><b>x</b></b>            1129 B     1080 B
//   !!!z  /  z=z=1  /  z?1:0    933 B     1179 B    <- no bracket, >=1 byte/level
//
// Every shape that costs more than ~1 KiB per level opens a bracket, so a byte
// scan for bracket depth bounds it. The bracket-free shapes are cheap and spend
// at least one source byte per level, so source length bounds those instead.
//
// The bracketed budget is unchanged. The per-source-byte budget was 1024, which
// only ever cleared the old 933 by 10%; the two extra walks pushed that shape to
// 1179 and `!`×120 000 aborted. 2048 restores a real margin, and the guard
// ceiling moves with it so a 1 MiB source can still be granted the full budget.
const STACK_BYTES_PER_LEVEL: usize = 4096;
const STACK_BYTES_PER_SOURCE_BYTE: usize = 2048;
/// Skips the scan entirely: at the worst measured cost this cannot exceed 1.5 MiB.
const SCAN_FREE_LIMIT: usize = 512;
const INLINE_DEPTH_LIMIT: usize = 512;
const INLINE_SOURCE_LIMIT: usize = 8 * 1024;
const MIN_GUARD_STACK: usize = 32 * 1024 * 1024;
const MAX_GUARD_STACK: usize = 2 * 1024 * 1024 * 1024;
const MAX_NESTING_DEPTH: usize = MAX_GUARD_STACK / STACK_BYTES_PER_LEVEL;

const SCAN_CHUNK: usize = 1024;

/// Upper bound on AST depth: bracket nesting, plus prefix unary operator runs —
/// the one bracket-free shape that nests once per source byte.
///
/// Counted per chunk rather than tracked byte by byte. Within a chunk the number
/// of openers bounds how much deeper the nesting can get, where an exact running
/// maximum is a serial dependency chain over every byte. The result is an
/// over-estimate by roughly the number of brackets in one chunk, which only ever
/// costs a compile the guard thread it did not strictly need.
///
/// The three counts ride in one u64 through [`NESTING_WEIGHT`], so the byte loop
/// is a load and an add rather than nine comparisons: 0.60 µs over a 3.3 KB file
/// against 1.04 for the comparisons, measured.
fn nesting_estimate(source: &[u8]) -> usize {
    let mut depth = 0i64;
    let mut bound = 0i64;
    let mut carried_unary = 0i64;

    for chunk in source.chunks(SCAN_CHUNK) {
        let packed: u64 = chunk.iter().map(|&byte| NESTING_WEIGHT[byte as usize]).sum();
        let opens = (packed & 0xffff) as i64;
        let closes = (packed >> 16 & 0xffff) as i64;
        let unary = (packed >> 32 & 0xffff) as i64;
        // carried_unary covers an operator run straddling the chunk boundary.
        bound = bound.max(depth + opens + unary + carried_unary);
        depth = (depth + opens - closes).max(0);
        carried_unary = unary;
    }

    bound as usize
}

/// One byte's contribution to a chunk's three counts: openers in bits 0..16,
/// closers in 16..32, prefix unary operators in 32..48.
const NESTING_WEIGHT: [u64; 256] = {
    let mut table = [0u64; 256];
    table[b'(' as usize] = 1;
    table[b'[' as usize] = 1;
    table[b'{' as usize] = 1;
    table[b')' as usize] = 1 << 16;
    table[b']' as usize] = 1 << 16;
    table[b'}' as usize] = 1 << 16;
    table[b'!' as usize] = 1 << 32;
    table[b'~' as usize] = 1 << 32;
    table[b'+' as usize] = 1 << 32;
    table[b'-' as usize] = 1 << 32;
    table
};

/// A count would carry out of its field and corrupt the next one if a chunk
/// could hold more bytes than a field can count.
const _: () = assert!(SCAN_CHUNK <= u16::MAX as usize);

fn guard_stack_size(source_len: usize, depth: usize) -> usize {
    depth
        .saturating_mul(STACK_BYTES_PER_LEVEL)
        .max(source_len.saturating_mul(STACK_BYTES_PER_SOURCE_BYTE))
        .clamp(MIN_GUARD_STACK, MAX_GUARD_STACK)
}

fn internal(filename: &str, message: String) -> Vec<Diagnostic> {
    vec![Diagnostic {
        severity: Severity::Error,
        message,
        filename: filename.to_string(),
        line: 1,
        column: 1,
    }]
}

fn panic_message(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(text) = payload.downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = payload.downcast_ref::<String>() {
        text.clone()
    } else {
        "unknown panic".to_string()
    }
}

/// oxc's parser and codegen recurse without a depth limit, so a deeply nested
/// source overflows the host's stack and takes the whole process down with a
/// signal no JS `catch` can see. Anything that could reach that depth is parsed
/// on a thread whose stack is sized for it; ordinary files run inline.
pub fn compile(source: &str, options: &ResolvedOptions) -> Result<CompileOutput, Vec<Diagnostic>> {
    if source.len() < SCAN_FREE_LIMIT {
        return compile_on_this_stack(source, options);
    }

    let depth = nesting_estimate(source.as_bytes());
    if depth <= INLINE_DEPTH_LIMIT && source.len() < INLINE_SOURCE_LIMIT {
        return compile_on_this_stack(source, options);
    }

    let filename = options.filename.as_deref().unwrap_or(DEFAULT_FILENAME);
    if depth > MAX_NESTING_DEPTH {
        return Err(internal(
            filename,
            format!("source nests {depth} levels deep; the compiler stops at {MAX_NESTING_DEPTH}"),
        ));
    }

    std::thread::scope(|scope| {
        let handle = std::thread::Builder::new()
            .name("barq-compile".to_string())
            .stack_size(guard_stack_size(source.len(), depth))
            .spawn_scoped(scope, || compile_on_this_stack(source, options))
            .map_err(|error| {
                internal(filename, format!("could not spawn the compile thread: {error}"))
            })?;
        handle.join().unwrap_or_else(|payload| {
            Err(internal(filename, format!("the compiler panicked: {}", panic_message(&payload))))
        })
    })
}

fn compile_on_this_stack(
    source: &str,
    options: &ResolvedOptions,
) -> Result<CompileOutput, Vec<Diagnostic>> {
    let filename = options.filename.as_deref().unwrap_or(DEFAULT_FILENAME);
    let source_type = source_type_for(options.filename.as_deref());

    let allocator = Allocator::new();
    let ParserReturn { mut program, diagnostics, panicked, .. } =
        Parser::new(&allocator, source, source_type)
            // Kept so an expression printed back as a source slice keeps the
            // author's grouping. Classification must see through the node:
            // `(count)()` is a call, not an opaque parenthesized expression.
            .with_options(ParseOptions { preserve_parens: true, ..ParseOptions::default() })
            .parse();

    let (errors, warnings) = split_diagnostics(&diagnostics, source, filename);
    if panicked || !errors.is_empty() {
        return Err(if errors.is_empty() {
            vec![Diagnostic {
                severity: Severity::Error,
                message: "the parser could not recover from a syntax error".to_string(),
                filename: filename.to_string(),
                line: 1,
                column: 1,
            }]
        } else {
            errors
        });
    }

    // The pipeline. Each stage hands the next one a finished artefact:
    //   semantic  reads the parsed program and produces an AST-free symbol table
    //   harvest   moves every JSX root out, leaving one placeholder identifier
    //   lower     turns those roots into IR — no Program, no output AST
    //   passes    run over the whole module, with every unit already in place
    //   codegen   prints the IR back into the program
    let source_text = program.source_text;
    let mut module = Module::for_source(&allocator, source_text);
    // A dialect that cannot express JSX compiles to no units at all, so there is
    // nothing for P0 to classify and the symbol table is pure cost.
    if source_type.is_jsx() {
        analysis::bind(&program, &mut module, &options.module_source);
    }
    harvest::run(&allocator, &mut program, &mut module);
    lower::lower(&allocator, source_text, options, &mut module);

    let mut warnings = warnings;
    // Decided before the pass stage, because the string backend skips three of
    // its passes outright — and the flag alone does not decide it: a module
    // using one of the eight non-inlinable flow components falls back.
    let target = match (options.ssr, uninlinable_flow(&module)) {
        (false, _) => codegen::Target::Dom,
        (true, None) => codegen::Target::Ssr,
        (true, Some(name)) => {
            warnings.push(fallback_diagnostic(name, filename));
            codegen::Target::Dom
        }
    };

    passes::run(&allocator, &mut module, options, target);
    warnings.extend(analysis_diagnostics(&module, source_text, filename));
    codegen::emit(&allocator, &mut program, &mut module, options, target);

    let CodegenReturn { code, map, .. } = Codegen::new()
        .with_options(CodegenOptions {
            single_quote: false,
            minify: false,
            comments: CommentOptions::default(),
            source_map_path: options.sourcemap.then(|| PathBuf::from(filename)),
            indent_char: IndentChar::Space,
            indent_width: 2,
            initial_indent: 0,
        })
        .build(&program);

    let map = map.map(|map| {
        codegen::mappings::collect(&mut module, &code);
        debug_assert!(module.maps.validate().is_ok(), "{:?}", module.maps.validate());
        let mut map = merge_mappings(map, &module.maps, source_text, &code);
        map.set_file(filename);
        map.to_json_string()
    });

    Ok(CompileOutput { code, map, warnings })
}

/// Folds §6.2's template-interior segments into the map oxc's codegen built for
/// the AST it printed, and closes the one gap that map has by construction.
///
/// That gap: oxc records a position per emitted node and SKIPS a node whose span
/// it just recorded. Two emitted nodes legitimately share a span — a hole's
/// anchor ref and the `insert` call that uses it are both the hole — so the
/// second one prints with no segment, and when it starts a line the whole
/// statement is unreachable from the map. So the first segment on a line is
/// extended leftwards to that line's first non-blank column. That invents no
/// source position: it only gives a segment the reach leftwards that a consumer
/// already assumes segments have rightwards.
fn merge_mappings<'a>(
    map: oxc_sourcemap::SourceMap<'a>,
    extra: &crate::ir::Mappings,
    source: &str,
    code: &str,
) -> oxc_sourcemap::SourceMap<'a> {
    use oxc_sourcemap::Token;

    let generated = crate::ir::LineIndex::new(code);
    let mut parts = map.into_parts();

    let mut ours: Vec<Token> = Vec::new();
    if !extra.is_empty() {
        let original = crate::ir::LineIndex::new(source);
        ours.reserve(extra.len());
        for index in 0..extra.len() {
            let (line, column) = generated.locate(code, extra.gen_off[index]);
            let (src_line, src_column) = original.locate(source, extra.src_off[index]);
            ours.push(Token::new(line, column, src_line, src_column, Some(0), None));
        }
        ours.sort_by_key(position);
    }

    let mut out: Vec<Token> = Vec::with_capacity(parts.tokens.len() * 5 / 4 + ours.len());
    let mut line = u32::MAX;
    let mut printed = parts.tokens.iter().copied().peekable();
    let mut mine = ours.into_iter().peekable();
    loop {
        let (next, tie) = match (printed.peek().map(position), mine.peek().map(position)) {
            (Some(theirs), Some(ours)) => (ours < theirs, ours == theirs),
            (None, Some(_)) => (true, false),
            (Some(_), None) => (false, false),
            (None, None) => break,
        };
        if tie {
            // A printed node wins an exact tie: it is a real JS token, where
            // ours addresses the inside of a string literal.
            mine.next();
        }
        let token = if next { mine.next() } else { printed.next() }.expect("peeked");
        if token.get_dst_line() != line {
            // A line that carries no token of its own inherits the one BEFORE
            // it. Those lines are the tails of a multi-line call — `}));` closing
            // an object literal, a component call and an `insert` at once — and
            // every byte on them belongs to the construct the previous token
            // opened. Without this a stack frame naming one resolves to nothing,
            // and the fill below cannot reach it: it only ever extends a segment
            // that is already on the line.
            if let Some(previous) = out.last().copied() {
                for gap in line.saturating_add(1)..token.get_dst_line() {
                    let start = generated.line_start(gap);
                    if start.is_some_and(|offset| extra.inside_a_literal(offset)) {
                        continue;
                    }
                    let Some(column) = generated.indent(code, gap) else { continue };
                    out.push(Token::new(
                        gap,
                        column,
                        previous.get_src_line(),
                        previous.get_src_col(),
                        previous.get_source_id(),
                        None,
                    ));
                }
            }
            line = token.get_dst_line();
            // …but only where the line really does start a statement. A line
            // that CONTINUES a multi-line template literal starts in the middle
            // of a token whose own segment is on the previous line, and filling
            // it would replace a correct inherited position with the position of
            // whatever comes next.
            let continues_a_literal =
                generated.line_start(line).is_some_and(|offset| extra.inside_a_literal(offset));
            if let Some(column) = generated.indent(code, line)
                && token.get_dst_col() > column
                && !continues_a_literal
            {
                out.push(Token::new(
                    line,
                    column,
                    token.get_src_line(),
                    token.get_src_col(),
                    token.get_source_id(),
                    None,
                ));
            }
        }
        out.push(token);
    }

    // The same rule past the last token: a module whose final statement closes
    // over several lines ends on bytes no segment reaches otherwise.
    if let Some(previous) = out.last().copied() {
        let mut gap = previous.get_dst_line() + 1;
        while let Some(offset) = generated.line_start(gap) {
            if !extra.inside_a_literal(offset)
                && let Some(column) = generated.indent(code, gap)
            {
                out.push(Token::new(
                    gap,
                    column,
                    previous.get_src_line(),
                    previous.get_src_col(),
                    previous.get_source_id(),
                    None,
                ));
            }
            gap += 1;
        }
    }

    parts.tokens = out.into_boxed_slice();
    oxc_sourcemap::SourceMap::from_parts(parts)
}

#[inline]
fn position(token: &oxc_sourcemap::Token) -> (u32, u32) {
    (token.get_dst_line(), token.get_dst_col())
}

pub fn format_diagnostics(diagnostics: &[Diagnostic]) -> String {
    diagnostics.iter().map(|d| d.to_string()).collect::<Vec<_>>().join("\n")
}

/// What the analysis wants the author to know: O3's note where a keyed `For`
/// cannot be traced back to its rows, O7's warning where `Dynamic` will flatten
/// the getters P4 built. Both are deliberate divergences, so neither is allowed
/// to be silent.
/// DESIGN §5's explicit fallback. `Loading`, `Errored`, `Reveal`, `Suspense`,
/// `Await`, `Portal`, `Dynamic` and `ErrorBoundary` have real async and boundary
/// semantics that no string concatenation expresses, so a module that REFERENCES
/// one of them compiles to the DOM backend instead and is rendered by
/// `renderToString`'s happy-dom path. `Flow::inlinable_on_server()` is the split,
/// resolved by `SymbolId` — a local `const Portal = …` is not the runtime's.
fn uninlinable_flow(module: &Module<'_>) -> Option<&'static str> {
    for symbol in module.scoping.symbol_ids() {
        let Some(flow) = module.env.kind_of(symbol).flow() else { continue };
        if flow.inlinable_on_server() {
            continue;
        }
        if module.scoping.get_resolved_reference_ids(symbol).is_empty() {
            continue;
        }
        return Some(flow.name());
    }
    // `import * as core` — `core.Portal` binds no symbol of its own, so the scan
    // above cannot see it. Missing it compiles the module to a string that calls
    // the real DOM component, which dies on a server with no `document`: the one
    // environment target #10 exists to serve.
    module
        .env
        .namespace_flows
        .iter()
        .find(|flow| !flow.inlinable_on_server())
        .map(|flow| flow.name())
}

fn fallback_diagnostic(name: &str, filename: &str) -> Diagnostic {
    Diagnostic {
        severity: Severity::Warning,
        message: format!(
            "note: `{name}` has no string-mode implementation, so this module compiles to the DOM \
             backend on the server and must be rendered through `renderToString` from \
             `@barqjs/core/server` with a DOM implementation registered (DESIGN §5)."
        ),
        filename: filename.to_string(),
        line: 1,
        column: 1,
    }
}

fn analysis_diagnostics(module: &Module<'_>, source: &str, filename: &str) -> Vec<Diagnostic> {
    module
        .env
        .diagnostics
        .iter()
        .map(|diag| {
            let (line, column) = line_column(source, diag.span.start);
            let level = match diag.level {
                crate::ir::DiagLevel::Note => "note",
                crate::ir::DiagLevel::Warning => "warning",
            };
            Diagnostic {
                severity: Severity::Warning,
                message: format!("{level}: {}", module.interner.str(diag.message)),
                filename: filename.to_string(),
                line,
                column,
            }
        })
        .collect()
}

fn split_diagnostics(
    diagnostics: &[OxcDiagnostic],
    source: &str,
    filename: &str,
) -> (Vec<Diagnostic>, Vec<Diagnostic>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for diagnostic in diagnostics {
        let converted = convert_diagnostic(diagnostic, source, filename);
        match converted.severity {
            Severity::Error => errors.push(converted),
            Severity::Warning => warnings.push(converted),
        }
    }
    (errors, warnings)
}

fn convert_diagnostic(diagnostic: &OxcDiagnostic, source: &str, filename: &str) -> Diagnostic {
    let label = diagnostic.labels.as_slice().first();
    let (line, column) = line_column(source, label.map_or(0, |label| label.offset()));

    let mut message = diagnostic.message.to_string();
    if let Some(text) = label.and_then(|label| label.label()) {
        message.push_str(" (");
        message.push_str(text);
        message.push(')');
    }
    if let Some(help) = &diagnostic.help {
        message.push_str("\n  help: ");
        message.push_str(help);
    }

    Diagnostic {
        severity: match diagnostic.severity {
            OxcSeverity::Error => Severity::Error,
            _ => Severity::Warning,
        },
        message,
        filename: filename.to_string(),
        line,
        column,
    }
}

fn line_column(source: &str, offset: u32) -> (u32, u32) {
    let offset = offset as usize;
    let mut line = 1u32;
    let mut column = 1u32;
    for (index, ch) in source.char_indices() {
        if index >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    (line, column)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile_ok(source: &str, filename: &str) -> CompileOutput {
        compile(source, &ResolvedOptions::with_filename(filename))
            .unwrap_or_else(|diagnostics| panic!("{}", format_diagnostics(&diagnostics)))
    }

    #[test]
    fn deeply_nested_sources_compile_instead_of_killing_the_process() {
        // Every one of these took the whole process down with SIGSEGV before the
        // guard existed; the depths are the ones that were measured to do it.
        let cases = [
            format!("const a = {}1{};\n", "(".repeat(60_000), ")".repeat(60_000)),
            format!("const a = {}1{};\n", "[".repeat(60_000), "]".repeat(60_000)),
            format!("const a = {}1{};\n", "`${".repeat(30_000), "}`".repeat(30_000)),
            format!("const a = {}0;\n", "z?1:".repeat(120_000)),
            format!("const a = {}z;\n", "!".repeat(120_000)),
            format!("const a = {}x{};\n", "<b>".repeat(60_000), "</b>".repeat(60_000)),
        ];
        for source in cases {
            let output = compile_ok(&source, "deep.tsx");
            assert!(!output.code.is_empty());
        }
    }

    #[test]
    fn nesting_past_the_hard_limit_is_a_diagnostic_not_a_crash() {
        let depth = MAX_NESTING_DEPTH + 1;
        let source = format!("const a = {}1{};\n", "(".repeat(depth), ")".repeat(depth));
        let error = compile(&source, &ResolvedOptions::with_filename("deep.tsx"))
            .expect_err("expected the depth limit to reject this");
        assert_eq!(error.len(), 1);
        assert!(error[0].message.contains("levels deep"), "{}", error[0].message);
    }

    #[test]
    fn the_nesting_estimate_bounds_real_depth() {
        assert_eq!(nesting_estimate(b"const a = 1;"), 0);
        assert!(nesting_estimate(b"f(g(h(1)))") >= 3);
        assert!(nesting_estimate(b"const a = !!!z;") >= 3);
        // A unary run inside brackets stacks on top of the bracket depth.
        assert!(nesting_estimate(b"f(!!z)") >= 3);
        // Never an under-estimate: a bracket run of n is at least n.
        let deep = format!("{}1{}", "(".repeat(3_000), ")".repeat(3_000));
        assert!(nesting_estimate(deep.as_bytes()) >= 3_000);
    }

    #[test]
    fn the_guard_stack_covers_depth_and_length_and_stays_bounded() {
        assert_eq!(guard_stack_size(0, 0), MIN_GUARD_STACK);
        assert_eq!(guard_stack_size(0, 100_000), 100_000 * STACK_BYTES_PER_LEVEL);
        assert_eq!(guard_stack_size(1 << 20, 0), (1 << 20) * STACK_BYTES_PER_SOURCE_BYTE);
        assert_eq!(guard_stack_size(usize::MAX, usize::MAX), MAX_GUARD_STACK);
    }

    #[test]
    fn a_long_but_flat_source_still_compiles() {
        let source = "const a = 1;\n".repeat(4_000);
        let output = compile_ok(&source, "flat.tsx");
        assert!(output.code.len() > INLINE_SOURCE_LIMIT, "{}", output.code.len());
    }

    /// The debug assertions in P1 check `Skeleton::validate` and
    /// `RefPlan::validate` on every unit, so running the corpus through a debug
    /// build is what proves those invariants hold on real JSX shapes rather
    /// than on hand-built fixtures.
    #[test]
    fn every_fixture_compiles_with_the_ir_invariants_intact() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let mut compiled = 0;
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            let output = compile(&source, &ResolvedOptions::with_filename(&name)).unwrap_or_else(
                |diagnostics| panic!("{name}: {}", format_diagnostics(&diagnostics)),
            );
            assert!(!output.code.is_empty(), "{name} compiled to nothing");
            // `.ts` rejects JSX syntax outright, so re-parsing the output there
            // is a total check that no element survived the lowering.
            compile(&output.code, &ResolvedOptions::with_filename("emitted.ts")).unwrap_or_else(
                |diagnostics| {
                    panic!(
                        "{name} emitted JSX: {}\n{}",
                        format_diagnostics(&diagnostics),
                        output.code
                    )
                },
            );
            compiled += 1;
        }
        assert!(compiled >= 25, "only {compiled} fixtures found");
    }

    #[test]
    fn an_intrinsic_element_becomes_a_hoisted_template_and_a_patch() {
        let source =
            "export const A = (props: { n: number }) => <div class=\"c\">{props.n}</div>;\n";
        let output = compile_ok(source, "A.tsx");
        // The static markup is one hoisted clone; the hole is the only code.
        assert!(output.code.contains("_$template(`<div class=\"c\">"), "{}", output.code);
        assert!(output.code.contains("_$insert("), "{}", output.code);
        assert!(output.code.contains("props.n"), "{}", output.code);
        assert!(!output.code.contains("<div class=\"c\">{"), "{}", output.code);
    }

    #[test]
    fn a_component_is_called_and_a_fragment_still_is_not() {
        let source = "const V = () => <><Foo.Bar {...rest} x={1} />{cond ? <A /> : null}</>;\n";
        let output = compile_ok(source, "V.tsx");
        // A fragment has no props object to build, so it stays on the runtime's
        // own path.
        assert!(output.code.contains("_$createElement(_$Fragment, null"), "{}", output.code);
        // P4 calls a component directly. It has to: `createElement` copies the
        // props object it is handed, and a copy reads every getter once.
        assert!(output.code.contains("...rest"), "{}", output.code);
        assert!(output.code.contains("x: 1"), "{}", output.code);
        assert!(output.code.contains("A({})"), "{}", output.code);
        assert!(!output.code.contains("_$createElement(A"), "{}", output.code);
        // `createElement` calls `tag(finalProps)` with no receiver, so a member
        // tag must not pick up a `this` the un-compiled path never had.
        assert!(output.code.contains("(0, Foo.Bar)({"), "{}", output.code);
        // The component identifier is the binding, not a name-matched string.
        assert!(!output.code.contains("\"Foo.Bar\""), "{}", output.code);
    }

    #[test]
    fn a_fully_static_subtree_costs_one_clone_and_nothing_else() {
        let output = compile_ok("const V = () => <p class=\"x\"><b>hi</b></p>;\n", "V.tsx");
        assert!(
            output.code.contains("_$template(`<p class=\"x\"><b>hi</b></p>`)"),
            "{}",
            output.code
        );
        assert!(!output.code.contains("_$insert"), "{}", output.code);
        assert!(!output.code.contains("_$setProp"), "{}", output.code);
        // No walk, no arrow, no statements: the clone IS the component body.
        assert!(output.code.trim_end().ends_with("const V = () => _tmpl$1();"), "{}", output.code);
    }

    #[test]
    fn helpers_extend_an_existing_import_instead_of_adding_a_second_one() {
        let source = "import { signal } from \"@barqjs/core\";\nconst V = () => <i>{signal}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert_eq!(output.code.matches("from \"@barqjs/core\"").count(), 1, "{}", output.code);
        assert!(output.code.contains("import { signal, template as _$template"), "{}", output.code);
    }

    #[test]
    fn emitted_bindings_cannot_shadow_a_users_own() {
        let source = "const _el$1 = 1;\nconst _tmpl$1 = 2;\nconst V = () => <i>{x}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_el$$"), "{}", output.code);
        assert!(output.code.contains("_tmpl$$"), "{}", output.code);
    }

    /// The other half of the same hygiene rule, on the helper prefix rather than
    /// the uid bases: a source that already spells one imported helper pushes
    /// EVERY helper's local name to the next sigil, so the import and its
    /// call sites cannot disagree.
    #[test]
    fn an_imported_helper_name_the_source_already_spells_moves_the_whole_sigil() {
        let source = "const _$template = 1;\nconst V = () => <i>{x}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("template as _$$template"), "{}", output.code);
        assert!(output.code.contains("insert as _$$insert"), "{}", output.code);
        assert!(!output.code.contains("as _$template"), "{}", output.code);

        // A helper the DOM backend never emits still counts: the sigil is one
        // name shared by both backends' helpers.
        let source = "const _$spreadAttrs = 1;\nconst V = () => <i>{x}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("template as _$$template"), "{}", output.code);

        // Substring, not whole word: `_$templates` merely CONTAINS a helper name
        // and still moves the sigil. Erring towards a rename costs one `$`;
        // erring the other way shadows a user's binding.
        let source = "const _$templates = 1;\nconst V = () => <i>{x}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("template as _$$template"), "{}", output.code);

        // And a source mentioning no helper keeps the plain sigil.
        let source = "const _$tmpl = 1;\nconst V = () => <i>{x}</i>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("template as _$template"), "{}", output.code);
    }

    #[test]
    fn a_property_channel_attribute_never_reaches_the_template_html() {
        let output = compile_ok("const V = () => <input type=\"text\" value=\"v\" />;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<input type=\"text\">`)"), "{}", output.code);
        assert!(output.code.contains("_$setProp(_el$1, \"value\", \"v\")"), "{}", output.code);
    }

    #[test]
    fn a_template_rooted_at_an_svg_child_asks_for_the_svg_wrapper() {
        let output = compile_ok("const V = () => <path d=\"M0 0\" />;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<path d=\"M0 0\"/>`, true)"), "{}", output.code);

        // `<svg>` itself parses correctly as inline HTML, so no wrapper.
        let output = compile_ok("const V = () => <svg><path d=\"M0 0\" /></svg>;\n", "V.tsx");
        assert!(output.code.contains("<path d=\"M0 0\"/></svg>`)"), "{}", output.code);
    }

    #[test]
    fn tags_the_html_parser_reshapes_stay_on_the_uncompiled_path() {
        // `<template>` children land in a DocumentFragment, `<math>` switches
        // the parser's namespace — `createElement` does neither.
        let output = compile_ok("const V = () => <template><li>a</li></template>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"template\""), "{}", output.code);

        let output = compile_ok("const V = () => <div><math><mi>x</mi></math></div>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"math\""), "{}", output.code);
    }

    #[test]
    fn jsx_text_cleaning_matches_the_uncompiled_transform() {
        let source = "const V = () => <p>\n  Total: {n}\n  <b>x</b> <i>y</i>\n</p>;\n";
        let output = compile_ok(source, "V.tsx");
        // The hole is followed by an ELEMENT, so `<b>` is its own anchor and the
        // comment node is elided (target #9).
        assert!(output.code.contains("`<p>Total: <b>x</b> <i>y</i></p>`"), "{}", output.code);
        assert!(output.code.contains("_$insert(_el$1, n, _el$2)"), "{}", output.code);
    }

    #[test]
    fn character_references_are_left_for_the_html_parser() {
        let source = "const V = () => <div title=\"a &amp; b\">x &lt; y</div>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("title=\"a &amp; b\">x &lt; y<"), "{}", output.code);
    }

    #[test]
    fn a_newline_eating_tag_keeps_its_leading_newline() {
        // O9: "in body" ignores ONE U+000A character token directly after
        // `<pre>` / `<textarea>`, so a leading newline needs a second one.
        //
        // It used to be written `&#10;`, which does NOT work: the tokenizer
        // emits the same character token for a reference, and real Chrome
        // parses `<pre>&#10;a</pre>` to "a" — the newline was silently lost in
        // every browser while happy-dom, which does not implement the rule at
        // all, kept the differential harness green. test/browser-parse-check.ts
        // now pins both halves against a real parser.
        let output = compile_ok("const V = () => <pre>&#10;a</pre>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<pre>\n\na</pre>`)"), "{}", output.code);

        let output = compile_ok("const V = () => <textarea>&#10;a</textarea>;\n", "V.tsx");
        assert!(
            output.code.contains("_$template(`<textarea>\n\na</textarea>`)"),
            "{}",
            output.code
        );

        // Only the FIRST newline is doubled, and only when there is one.
        let output = compile_ok("const V = () => <pre>a&#10;b</pre>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<pre>a\nb</pre>`)"), "{}", output.code);

        // `<pre>` is ordinary markup, so a hole inside it still templates. It is
        // the only child, so nothing follows it and `insert` takes two arguments.
        let output = compile_ok("const V = () => <pre>{a}</pre>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<pre></pre>`)"), "{}", output.code);
        assert!(output.code.contains("_$insert(_el$1, a)"), "{}", output.code);

        // `<textarea>` is RCDATA: the `<!---->` would be literal TEXT in the field.
        let output = compile_ok("const V = () => <textarea>{a}</textarea>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"textarea\""), "{}", output.code);
        assert!(!output.code.contains("<textarea>"), "{}", output.code);
    }

    #[test]
    fn a_hole_in_front_of_the_newline_does_not_hide_it_from_the_doubling() {
        // A `Slot` materialises NOTHING, so the newline still lands directly
        // after `<pre>` where the parser eats it. Before P5 elided the marker
        // the `<!---->` stopped the rule and hid this; driven in real Chrome the
        // compiled path read "Ahello" against the oracle's "A\nhello".
        let output = compile_ok("const V = () => <pre>{a}&#10;hello</pre>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<pre>\n\nhello</pre>`)"), "{}", output.code);

        // A marker DOES stop the rule — the next token is a comment, not the
        // newline — so doubling there would put a real blank line in the field.
        // Two adjacent holes always cost one, which is why this shape differs.
        let output = compile_ok("const V = () => <pre>{a}{b}&#10;hello</pre>;\n", "V.tsx");
        assert!(output.code.contains("`<pre><!---->\nhello</pre>`"), "{}", output.code);

        // The rule is about the FIRST bytes only: a newline anywhere else is
        // one the parser keeps.
        let output = compile_ok("const V = () => <pre>x{a}&#10;y</pre>;\n", "V.tsx");
        assert!(output.code.contains("`<pre>x<!---->\ny</pre>`"), "{}", output.code);
    }

    #[test]
    fn a_greater_than_in_text_is_escaped_so_both_parsers_agree() {
        // Not a tokenizer requirement: happy-dom SPLITS a text run on a bare
        // `>` where Chrome does not, so `firstChild.nextSibling` resolves to a
        // different node in the two engines and a wrong walk survives the fake
        // DOM half of the harness.
        let output = compile_ok("const V = () => <p>a &gt; b</p>;\n", "V.tsx");
        assert!(output.code.contains("`<p>a &gt; b</p>`"), "{}", output.code);

        // JSX text cannot carry a bare `>` — it is a parse error — so the only
        // way one reaches a template is through a reference the compiler
        // resolves at compile time, which is the case above.
        let refused =
            compile("const V = () => <p>a > b</p>;\n", &ResolvedOptions::with_filename("V.tsx"))
                .expect_err("a bare > is a JSX parse error");
        assert!(refused[0].message.contains("&gt;"), "{}", refused[0].message);

        // An attribute value is not text: `>` inside quotes ends nothing.
        let output = compile_ok("const V = () => <p title=\"a > b\">x</p>;\n", "V.tsx");
        assert!(output.code.contains("title=\"a > b\""), "{}", output.code);
    }

    #[test]
    fn an_import_below_the_first_jsx_does_not_strand_the_preamble() {
        // `import` is legal anywhere at the top level. Splicing after the LAST
        // one put `_tmpl$1()` above `const _tmpl$1 = …`, which is a TDZ
        // ReferenceError at module evaluation — green at compile time, dead in
        // the browser.
        let source = "export const A = <div class=\"x\">hi</div>;\n\
                      import \"./side-effect.js\";\n\
                      export const B = <span>hello</span>;\n";
        let output = compile_ok(source, "V.tsx");
        let declaration = output.code.find("const _tmpl$1 =").expect("a hoisted template");
        let first_use = output.code.find("_tmpl$1()").expect("a clone call");
        assert!(declaration < first_use, "{}", output.code);

        // The ordinary shape is untouched: the preamble still sits under the
        // import prologue rather than above it.
        let source = "import { x } from \"./x.js\";\nexport const A = <div>{x}</div>;\n";
        let output = compile_ok(source, "V.tsx");
        let import = output.code.find("from \"./x.js\"").expect("the user import");
        assert!(
            import < output.code.find("const _tmpl$1 =").expect("a template"),
            "{}",
            output.code
        );
    }

    #[test]
    fn a_component_scoped_constant_folded_into_the_template_is_pruned_too() {
        let source = "export default function V() {\n  const base = \"btn\";\n  return <button class={base}>go</button>;\n}\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("class=\"btn\""), "{}", output.code);
        assert!(!output.code.contains("const base"), "{}", output.code);

        // A reader anywhere keeps it, however the name is spelled elsewhere.
        let source = "export default function V() {\n  const base = \"btn\";\n  log(base);\n  return <button class={base}>go</button>;\n}\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("const base"), "{}", output.code);
    }

    #[test]
    fn disabling_templates_leaves_every_element_on_the_uncompiled_path() {
        let options =
            ResolvedOptions { templates: false, ..ResolvedOptions::with_filename("V.tsx") };
        let output = compile("const V = () => <div class=\"c\">x</div>;\n", &options).unwrap();
        assert!(!output.code.contains("_$template"), "{}", output.code);
        assert!(output.code.contains("_$createElement(\"div\""), "{}", output.code);
    }

    /// The flag was accepted and refused from M1 to M5, because emitting the
    /// DOM backend for it would have surfaced as a production SSR mismatch.
    /// M6 is where it decides something: one concatenation, and not one DOM
    /// call anywhere in the output.
    #[test]
    fn the_ssr_flag_selects_the_string_backend() {
        let options = ResolvedOptions { ssr: true, ..ResolvedOptions::with_filename("V.tsx") };
        let output = compile("const V = () => <div class=\"c\">{x}</div>;\n", &options).unwrap();
        assert!(
            output.code.contains("_$html(`<div class=\"c\">${_$esc(x)}</div>`)"),
            "{}",
            output.code
        );
        for dom in ["_$template", "_$insert", "_$setProp", "_$createElement", "_el$"] {
            assert!(!output.code.contains(dom), "{dom} in:\n{}", output.code);
        }
        assert!(output.code.contains("from \"@barqjs/core/server\""), "{}", output.code);
        assert!(output.warnings.is_empty(), "{:?}", output.warnings);
    }

    #[test]
    fn an_element_the_parser_reshapes_never_reaches_a_template() {
        // Each of these was verified in a real browser: the parser builds a tree
        // `createElement` never would, and three of them lose the unit root. The
        // refused element leaves the template HTML — either as a runtime
        // `insert` of its own unit, or by taking its whole parent with it.
        let cases = [
            // foster parenting: <img> is moved out of the table
            ("<table><img src=\"a\" /><tbody><tr><td>c</td></tr></tbody></table>", "<table><img"),
            // "in body" drops a table-section start tag, keeping only its text.
            // The `<tr>` leaves the `<div>`'s template; it becomes a template of
            // its OWN, because a template root parses in "in template" mode
            // where a row is legal.
            ("<div><tr><td>a</td></tr></div>", "<div><tr"),
            // the document-structure tags are merged, never inserted
            ("<div><body>b</body></div>", "<body"),
            // a block child auto-closes the <p>, and leaves a stray empty one
            ("<div><p>a<div>b</div></p></div>", "<p>a<div>"),
            // the adoption agency splits the outer <a> into two roots
            ("<a href=\"#1\"><a href=\"#2\">x</a></a>", "#1\"><a"),
            // non-whitespace text in a table context is foster-parented
            ("<table>text</table>", "<table>"),
            // "in select" ignores anything that is not an option
            ("<select><div>x</div></select>", "<select><div"),
            // <li> implies the end tag of an open <li>
            ("<ul><li>a<li>b</li></li></ul>", "<li>a<li>"),
        ];
        for (jsx, forbidden) in cases {
            let output = compile_ok(&format!("const V = () => {jsx};\n"), "V.tsx");
            for line in output.code.lines().filter(|line| line.contains("_$template(")) {
                assert!(!line.contains(forbidden), "{jsx}\n{}", output.code);
            }
        }
    }

    #[test]
    fn a_raw_text_element_never_gets_a_marker_or_an_early_closer() {
        // A `<!---->` inside <style> is text, and a decoded `</style` closes the
        // element and injects live markup into the template.
        let output = compile_ok("const V = () => <div><style>{css}</style></div>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"style\""), "{}", output.code);
        assert!(!output.code.contains("<style>"), "{}", output.code);

        let source = "const V = () => <div><style>{\"a\"}&lt;/style&gt;</style></div>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_$createElement(\"style\""), "{}", output.code);

        let output = compile_ok("const V = () => <script>{\"var a = 1;\"}</script>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"script\""), "{}", output.code);

        // literal-only, no hazard byte: still a template
        let output =
            compile_ok("const V = () => <style>{}.a &#123; color: red &#125;</style>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"style\""), "{}", output.code);
        let output = compile_ok("const V = () => <style>.a - b</style>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<style>.a - b</style>`)"), "{}", output.code);
    }

    #[test]
    fn two_attributes_that_normalise_to_one_name_resolve_the_way_the_props_object_does() {
        // `createElement` walks a props object, so the LAST write wins; the HTML
        // parser keeps the FIRST duplicate.
        let output =
            compile_ok("const V = () => <div className={x} class=\"a\">t</div>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<div class=\"a\">t</div>`)"), "{}", output.code);
        assert!(!output.code.contains("_$setProp"), "{}", output.code);

        let output =
            compile_ok("const V = () => <div className=\"a\" class=\"b\">t</div>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<div class=\"b\">t</div>`)"), "{}", output.code);

        let output =
            compile_ok("const V = () => <div class=\"a\" className={x}>t</div>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<div>t</div>`)"), "{}", output.code);
        assert!(output.code.contains("_$setProp(_el$1, \"class\", x)"), "{}", output.code);
    }

    #[test]
    fn a_name_the_runtime_intercepts_reaches_set_prop_unmangled() {
        let output =
            compile_ok("const V = () => <circle onClick={h} strokeWidth={w} />;\n", "V.tsx");
        assert!(output.code.contains("\"onClick\""), "{}", output.code);
        assert!(!output.code.contains("on-click"), "{}", output.code);
        assert!(output.code.contains("\"stroke-width\""), "{}", output.code);
    }

    #[test]
    fn ts_round_trip_preserves_type_annotations() {
        let source = "export interface P { n: number }\nexport function f<T extends P>(p: T): string { return String(p.n); }\n";
        let output = compile_ok(source, "f.ts");
        assert!(output.code.contains("interface P"), "{}", output.code);
        assert!(output.code.contains("<T extends P>"), "{}", output.code);
        assert!(output.code.contains("p: T"), "{}", output.code);
        assert!(output.code.contains("): string"), "{}", output.code);
    }

    #[test]
    fn syntax_error_returns_err_with_a_located_message() {
        let error = compile("const x: = 1;\n", &ResolvedOptions::with_filename("B.tsx"))
            .expect_err("expected a syntax error");
        assert_eq!(error.len(), 1);
        assert_eq!(error[0].severity, Severity::Error);
        assert_eq!(error[0].filename, "B.tsx");
        assert_eq!(error[0].line, 1);
        assert_eq!(error[0].column, 10);
        assert!(!error[0].message.is_empty());

        let rendered = format_diagnostics(&error);
        assert!(rendered.starts_with("B.tsx:1:10: "), "{rendered}");
    }

    #[test]
    fn syntax_error_line_and_column_track_multiline_sources() {
        let error =
            compile("const a = 1;\nconst b = ;\n", &ResolvedOptions::with_filename("C.tsx"))
                .expect_err("expected a syntax error");
        assert_eq!(error[0].line, 2);
        assert_eq!(error[0].column, 11);
    }

    #[test]
    fn sourcemap_is_none_unless_requested() {
        let output = compile_ok("const a = 1;\n", "a.tsx");
        assert!(output.map.is_none());
    }

    #[test]
    fn sourcemap_is_some_when_requested() {
        let options =
            ResolvedOptions { sourcemap: true, ..ResolvedOptions::with_filename("a.tsx") };
        let output = compile("const a = 1;\n", &options).unwrap();
        let map = output.map.expect("sourcemap requested");
        assert!(map.contains("\"version\":3"), "{map}");
        assert!(map.contains("\"file\":\"a.tsx\""), "{map}");
        assert!(map.contains("\"sources\":[\"a.tsx\"]"), "{map}");
        assert!(map.contains("\"mappings\""), "{map}");
    }

    // ── M4: DESIGN §6, the sourcemap strategy ─────────────────────────────

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct Segment {
        gen_line: u32,
        gen_col: u32,
        src_line: u32,
        src_col: u32,
    }

    struct Mapped {
        source: String,
        code: String,
        segments: Vec<Segment>,
        json: String,
    }

    impl Mapped {
        /// The generated text a segment addresses, to the end of its line.
        fn generated(&self, segment: &Segment) -> &str {
            line_slice(&self.code, segment.gen_line, segment.gen_col)
        }

        /// The original text a segment claims produced it.
        fn original(&self, segment: &Segment) -> &str {
            line_slice(&self.source, segment.src_line, segment.src_col)
        }

        /// Every segment whose generated text starts with `needle`.
        fn on_generated(&self, needle: &str) -> Vec<Segment> {
            self.segments
                .iter()
                .copied()
                .filter(|segment| self.generated(segment).starts_with(needle))
                .collect()
        }

        fn line_of(&self, needle: &str) -> u32 {
            self.code
                .lines()
                .position(|line| line.contains(needle))
                .unwrap_or_else(|| panic!("{needle} is not in the output:\n{}", self.code))
                as u32
        }
    }

    /// Columns are UTF-16 code units, which is not a byte offset the moment the
    /// line holds anything outside Latin-1. U+2028 also ends a line for the map
    /// but not for `split('\n')`, so it is split on too.
    fn line_slice(text: &str, line: u32, column: u32) -> &str {
        let line = text.split(['\n', '\u{2028}', '\u{2029}']).nth(line as usize).unwrap_or("");
        let mut units = 0u32;
        for (offset, ch) in line.char_indices() {
            if units >= column {
                return &line[offset..];
            }
            units += ch.len_utf16() as u32;
        }
        ""
    }

    fn map_of(source: &str, filename: &str) -> Mapped {
        let options =
            ResolvedOptions { sourcemap: true, ..ResolvedOptions::with_filename(filename) };
        let output = compile(source, &options)
            .unwrap_or_else(|diagnostics| panic!("{}", format_diagnostics(&diagnostics)));
        let json = output.map.expect("sourcemap requested");
        let mappings = json_string_field(&json, "mappings");
        Mapped {
            source: source.to_string(),
            code: output.code,
            segments: decode_mappings(&mappings),
            json,
        }
    }

    /// The value of a top-level string field, unescaped enough for these tests
    /// (`\"`, `\\`, `\n`, `\t` and `\u00XX` are what the encoder emits).
    fn json_string_field(json: &str, key: &str) -> String {
        let needle = format!("\"{key}\":\"");
        let start =
            json.find(&needle).unwrap_or_else(|| panic!("no {key} in {json}")) + needle.len();
        let mut out = String::new();
        let mut chars = json[start..].chars();
        while let Some(ch) = chars.next() {
            match ch {
                '"' => break,
                '\\' => match chars.next().expect("an escape body") {
                    'n' => out.push('\n'),
                    't' => out.push('\t'),
                    'r' => out.push('\r'),
                    'u' => {
                        let hex: String = (&mut chars).take(4).collect();
                        let code = u32::from_str_radix(&hex, 16).expect("a \\u escape");
                        out.push(char::from_u32(code).expect("a scalar value"));
                    }
                    other => out.push(other),
                },
                other => out.push(other),
            }
        }
        out
    }

    /// Source map v3 VLQ, absolute positions. Names are decoded but unused.
    fn decode_mappings(mappings: &str) -> Vec<Segment> {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = Vec::new();
        let (mut src_line, mut src_col) = (0i64, 0i64);
        for (gen_line, line) in mappings.split(';').enumerate() {
            let gen_line = gen_line as u32;
            let mut gen_col = 0i64;
            for field in line.split(',').filter(|field| !field.is_empty()) {
                let mut values = Vec::new();
                let (mut raw, mut shift) = (0i64, 0);
                for byte in field.bytes() {
                    let digit = ALPHABET
                        .iter()
                        .position(|it| *it == byte)
                        .unwrap_or_else(|| panic!("{} is not a base64 digit", byte as char))
                        as i64;
                    raw |= (digit & 31) << shift;
                    shift += 5;
                    if digit & 32 == 0 {
                        values.push(if raw & 1 == 1 { -(raw >> 1) } else { raw >> 1 });
                        raw = 0;
                        shift = 0;
                    }
                }
                gen_col += values[0];
                if values.len() > 1 {
                    src_line += values[2];
                    src_col += values[3];
                }
                out.push(Segment {
                    gen_line,
                    gen_col: gen_col as u32,
                    src_line: src_line as u32,
                    src_col: src_col as u32,
                });
            }
        }
        out
    }

    /// Lines the way `LineIndex` counts them, which is the model BOTH sides of
    /// the map are built against — and the language's own: U+2028 and U+2029
    /// end a line for a JS engine, so a template that bakes one really does
    /// start a new generated line. Splitting on `\n` alone disagrees with the
    /// map by one line from the first separator onwards.
    fn code_lines(text: &str) -> Vec<&str> {
        let bytes = text.as_bytes();
        let mut lines = Vec::new();
        let (mut start, mut at) = (0usize, 0usize);
        while at < bytes.len() {
            let width = match bytes[at] {
                b'\n' => 1,
                b'\r' => usize::from(bytes.get(at + 1) == Some(&b'\n')) + 1,
                0xE2 if matches!(bytes.get(at + 1..at + 3), Some([0x80, 0xA8 | 0xA9])) => 3,
                _ => {
                    at += 1;
                    continue;
                }
            };
            lines.push(&text[start..at]);
            at += width;
            start = at;
        }
        lines.push(&text[start..]);
        lines
    }

    /// Whether each generated line STARTS inside a template literal. Such a
    /// line is the continuation of one token, not the start of a statement, so
    /// §6's leftwards fill deliberately leaves it alone (the M4 amendment) and
    /// there is nothing for a stack frame to name on it. Comments and strings
    /// are tracked because the output carries backticks inside all three.
    fn inside_a_template(code: &str) -> Vec<bool> {
        #[derive(PartialEq)]
        enum At {
            Code,
            Line,
            Block,
            Single,
            Double,
            Template,
        }
        let mut at = At::Code;
        let mut out = vec![false];
        let mut chars = code.chars().peekable();
        while let Some(ch) = chars.next() {
            match at {
                At::Code => match ch {
                    '/' if chars.peek() == Some(&'/') => at = At::Line,
                    '/' if chars.peek() == Some(&'*') => at = At::Block,
                    '\'' => at = At::Single,
                    '"' => at = At::Double,
                    '`' => at = At::Template,
                    _ => {}
                },
                At::Line if ch == '\n' => at = At::Code,
                At::Block if ch == '*' && chars.peek() == Some(&'/') => {
                    chars.next();
                    at = At::Code;
                }
                At::Single | At::Double | At::Template if ch == '\\' => {
                    chars.next();
                }
                At::Single if ch == '\'' => at = At::Code,
                At::Double if ch == '"' => at = At::Code,
                At::Template if ch == '`' => at = At::Code,
                _ => {}
            }
            if matches!(ch, '\n' | '\r' | '\u{2028}' | '\u{2029}') {
                // CRLF is ONE terminator, exactly as `code_lines` counts it.
                if ch == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push(at == At::Template);
            }
        }
        out
    }

    const CARD: &str = "export function Card(props) {\n  \
                        return (\n    \
                        <div class=\"card\">\n      \
                        <h2>Title</h2>\n      \
                        <p>{props.body}</p>\n    \
                        </div>\n  );\n}\n";

    /// The map has to survive a real decoder, and every segment has to name a
    /// position that exists in both files — a map that decodes to nonsense is
    /// worse than no map, because the tooling trusts it.
    #[test]
    fn the_emitted_map_decodes_and_every_segment_addresses_both_files() {
        for name in fixture_names() {
            let source = std::fs::read_to_string(fixture_path(&name)).expect("a fixture");
            let mapped = map_of(&source, &name);
            assert!(!mapped.segments.is_empty(), "{name} produced no segments");

            let generated = code_lines(&mapped.code);
            let source_lines = code_lines(&mapped.source).len() as u32;
            let mut previous = (0u32, 0u32);
            for segment in &mapped.segments {
                assert!(segment.gen_line < generated.len() as u32, "{name}: {segment:?}");
                assert!(segment.src_line < source_lines, "{name}: {segment:?}");
                assert!(
                    segment.gen_col as usize
                        <= generated[segment.gen_line as usize].encode_utf16().count(),
                    "{name}: {segment:?} is past the end of its generated line"
                );
                let at = (segment.gen_line, segment.gen_col);
                assert!(at >= previous, "{name}: {segment:?} goes backwards from {previous:?}");
                previous = at;
            }
        }
    }

    /// §6.2. A debugger stepping into `_tmpl$1` is inside a string literal, and
    /// the segments there are the only thing that can say which markup it is.
    #[test]
    fn the_inside_of_a_hoisted_template_maps_to_the_elements_that_produced_it() {
        let mapped = map_of(CARD, "Card.tsx");
        let template = mapped.line_of("_$template(`");

        // The declaration itself lands on the root element, not on the
        // `return (` the unit happened to sit in.
        let head = mapped
            .on_generated("const _tmpl$1")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("a segment at the head of the declaration");
        assert!(mapped.original(&head).starts_with("<div class=\"card\">"), "{:?}", head);

        // …and each element INSIDE the literal lands on its own JSX element.
        for (bytes, jsx) in [
            ("<div class=\"card\"><h2>", "<div class=\"card\">"),
            ("<h2>Title</h2>", "<h2>Title</h2>"),
            ("<p></p>", "<p>{props.body}</p>"),
        ] {
            let hit = mapped
                .on_generated(bytes)
                .into_iter()
                .find(|segment| segment.gen_line == template)
                .unwrap_or_else(|| panic!("no segment on the template bytes {bytes}"));
            assert_eq!(
                mapped.original(&hit).split('\n').next().unwrap(),
                jsx,
                "{bytes} mapped to the wrong element",
            );
        }
    }

    /// Target #6 meets §6. One `template()` call now serves N source sites, and
    /// a source map is a function: the generated bytes name the site that
    /// SERIALISED them, and every other site stays reachable through the span on
    /// its own `_tmpl$N()` clone call.
    #[test]
    fn a_deduped_template_maps_to_its_claimant_and_the_other_sites_map_at_their_clone() {
        let source = "export function Left() {\n  return <b class=\"c\">x</b>;\n}\n\
                      export function Right() {\n  return <b class=\"c\">x</b>;\n}\n";
        let mapped = map_of(source, "Both.tsx");
        assert_eq!(mapped.code.matches("_$template(").count(), 1, "{}", mapped.code);

        let template = mapped.line_of("_$template(`");
        let interior = mapped
            .on_generated("<b class=\"c\">x</b>")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("a segment inside the template literal");
        // Line 1 is Left's `return`; Right's is line 4.
        assert_eq!(interior.src_line, 1, "the claimant is the site that serialised the bytes");
        assert!(mapped.original(&interior).starts_with("<b class=\"c\">"), "{interior:?}");

        let sites: Vec<u32> = mapped
            .code
            .split('\n')
            .enumerate()
            .filter(|(_, text)| text.contains("_tmpl$1()"))
            .filter_map(|(line, _)| {
                mapped.segments.iter().find(|segment| segment.gen_line == line as u32)
            })
            .map(|segment| segment.src_line)
            .collect();
        assert!(sites.contains(&1) && sites.contains(&4), "both clone sites map: {sites:?}");
    }

    /// A `Slot` materialises no bytes, so its html offset is the offset of
    /// whatever follows. Those bytes belong to the node that WROTE them — the
    /// hole is already mapped, at the `insert` call that fills it.
    #[test]
    fn a_hole_does_not_claim_the_bytes_of_the_node_it_sits_in_front_of() {
        let source = "export const V = () => (\n  <p>\n    Total: {n}\n    <b>x</b>\n  </p>\n);\n";
        let mapped = map_of(source, "V.tsx");
        let template = mapped.line_of("_$template(`");
        assert!(mapped.code.contains("`<p>Total: <b>x</b></p>`"), "{}", mapped.code);

        let hit = mapped
            .on_generated("<b>x</b>")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("a segment on the element the hole sits in front of");
        assert!(mapped.original(&hit).starts_with("<b>x</b>"), "{:?}", mapped.original(&hit));

        // …and the hole keeps its own segment, on the call that inserts it.
        let insert = mapped.line_of("_$insert(");
        let hole = mapped
            .segments
            .iter()
            .find(|segment| segment.gen_line == insert)
            .expect("a segment on the insert");
        assert!(mapped.original(hole).starts_with("n}"), "{:?}", mapped.original(hole));
    }

    /// Backticks and `${` are escaped on the way into the template literal, so a
    /// segment placed at the unescaped offset drifts by one per escape. This is
    /// the only thing in §6 that can be off by a constant and still look right.
    #[test]
    fn a_template_that_needs_escaping_still_maps_at_the_right_column() {
        let source =
            "export const V = () => (\n  <div title=\"a`b${c\">\n    <i>t</i>\n  </div>\n);\n";
        let mapped = map_of(source, "V.tsx");
        let template = mapped.line_of("_$template(`");
        assert!(mapped.code.contains("\\`b\\${c"), "{}", mapped.code);

        let hit = mapped
            .on_generated("<i>t</i>")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("a segment on the escaped template's inner element");
        assert!(mapped.original(&hit).starts_with("<i>t</i>"), "{:?}", mapped.original(&hit));
    }

    /// The three ways a byte offset stops being a column. A source that mentions
    /// the uid prefix pads it (`_tmpl$$`), so the declaration is found by the
    /// name the module actually used; non-ASCII text makes UTF-16 columns differ
    /// from byte offsets on both sides; and U+2028 is a line terminator to a JS
    /// engine, so baking one into the template really does start a new
    /// GENERATED line.
    #[test]
    fn the_interior_segments_survive_hygiene_and_non_ascii_and_a_line_separator() {
        let source = "const also = \"_tmpl$1\";\nexport const V = () => (\n  <div>\n    <i>café</i>\n  </div>\n);\n";
        let mapped = map_of(source, "V.tsx");
        assert!(mapped.code.contains("_tmpl$$1"), "{}", mapped.code);
        let template = mapped.line_of("_$template(`");
        let hit = mapped
            .on_generated("<i>café</i>")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("the padded declaration is still located");
        assert_eq!((hit.src_line, hit.src_col), (3, 4));

        // `é` is two bytes and one UTF-16 unit, so a byte-offset column would
        // land one to the right of the `<`.
        let mapped = map_of("export const V = () => <p>é<i>x</i></p>;\n", "V.tsx");
        let template = mapped.line_of("_$template(`");
        let hit = mapped
            .on_generated("<i>x</i>")
            .into_iter()
            .find(|segment| segment.gen_line == template)
            .expect("a segment past the non-ASCII text");
        assert!(mapped.original(&hit).starts_with("<i>x</i>"), "{:?}", mapped.original(&hit));

        // U+2028 inside the template literal ends the generated line.
        let source = "export const V = () => <p>a\u{2028}b<i>x</i></p>;\n";
        let mapped = map_of(source, "V.tsx");
        let template = mapped.line_of("_$template(`");
        let hit = mapped
            .on_generated("<i>x</i>")
            .into_iter()
            .find(|segment| segment.gen_line > template)
            .expect("the element after the separator is on the NEXT generated line");
        assert!(mapped.original(&hit).starts_with("<i>x</i>"), "{:?}", mapped.original(&hit));
    }

    /// §6.3 and statement splicing together: the walk and the patch program are
    /// spliced flat into the enclosing body, and each spliced statement has to
    /// land on the JSX node it was derived from — not on the site it was
    /// spliced into.
    #[test]
    fn every_spliced_statement_maps_to_the_jsx_that_produced_it() {
        let mapped = map_of(CARD, "Card.tsx");
        for (statement, jsx) in [
            ("const _el$1 = _tmpl$1();", "<div class=\"card\">"),
            ("const _el$2 = _el$1.lastChild;", "<p>{props.body}</p>"),
            ("_$insert(_el$2, () => props.body);", "props.body}</p>"),
        ] {
            let line = mapped.line_of(statement);
            let indent = mapped.code.split('\n').nth(line as usize).unwrap();
            let column = (indent.len() - indent.trim_start().len()) as u32;
            let hit = mapped
                .segments
                .iter()
                .rfind(|segment| segment.gen_line == line && segment.gen_col <= column)
                .unwrap_or_else(|| panic!("{statement} has no segment at its own first token"));
            assert!(
                mapped.original(hit).starts_with(jsx),
                "{statement} mapped to {:?}, not {jsx}",
                mapped.original(hit).split('\n').next().unwrap(),
            );
        }
    }

    /// The property §6 exists for, stated over the whole corpus: a stack frame
    /// naming any emitted statement can be resolved. The exceptions are named
    /// rather than tolerated — the helper import and `delegateEvents` are module
    /// preamble with no single JSX origin, and a comment is not executable.
    #[test]
    fn every_emitted_statement_is_reachable_from_the_map() {
        for name in fixture_names() {
            let source = std::fs::read_to_string(fixture_path(&name)).expect("a fixture");
            let mapped = map_of(&source, &name);
            let continuation = inside_a_template(&mapped.code);
            for (index, text) in code_lines(&mapped.code).into_iter().enumerate() {
                let trimmed = text.trim_start();
                if continuation.get(index).copied().unwrap_or(false)
                    || trimmed.is_empty()
                    || trimmed.starts_with("//")
                    || trimmed.starts_with('*')
                    || trimmed.starts_with("/*")
                    || trimmed.starts_with("import {")
                    || trimmed.starts_with("_$delegateEvents(")
                {
                    continue;
                }
                let column = (text.len() - trimmed.len()) as u32;
                assert!(
                    mapped.segments.iter().any(
                        |segment| segment.gen_line == index as u32 && segment.gen_col <= column
                    ),
                    "{name}:{index} has no segment at its first token: {text}"
                );
            }
        }
    }

    /// The map has to survive a consumer that is not the one that wrote it. This
    /// is the same question a debugger asks — parse the JSON, build the lookup
    /// table, resolve a generated `(line, column)` — and it answers it about a
    /// position INSIDE the hoisted template literal, which is the one §6.2 adds.
    #[test]
    fn a_real_consumer_resolves_a_position_inside_the_template_to_the_right_jsx() {
        let mapped = map_of(CARD, "Card.tsx");
        let decoded = oxc_sourcemap::SourceMap::from_json_string(&mapped.json)
            .expect("the emitted map has to parse");
        let table = decoded.generate_lookup_table();
        let (source_name, content) = decoded.get_source_and_content(0).expect("one source");
        assert_eq!(source_name, "Card.tsx");
        assert_eq!(content, CARD);

        let line = mapped.line_of("_$template(`");
        let text = mapped.code.split('\n').nth(line as usize).unwrap();
        for (bytes, jsx) in
            [("<h2>Title</h2>", "<h2>Title</h2>"), ("<p></p>", "<p>{props.body}</p>")]
        {
            let column = text.find(bytes).expect("the template bytes") as u32;
            let token = decoded
                .lookup_token(&table, line, column)
                .unwrap_or_else(|| panic!("{bytes} resolves to nothing"));
            assert_eq!(token.get_dst_col(), column, "{bytes} resolved to a neighbour");
            let at = line_slice(content, token.get_src_line(), token.get_src_col());
            assert!(at.starts_with(jsx), "{bytes} resolved to {:?}", at.split('\n').next());
        }

        // The same consumer, on the walk: `_el$2` names the element it walks to.
        let walk = mapped.line_of("_el$1.lastChild");
        let token = decoded.lookup_token(&table, walk, 2).expect("a token on the walk");
        let at = line_slice(content, token.get_src_line(), token.get_src_col());
        assert!(at.starts_with("<p>{props.body}</p>"), "{:?}", at.split('\n').next());
    }

    /// The Vite plugin asks for a map on every file it touches, so a panic here
    /// is a build that dies on an ordinary component. The byte the template
    /// search budget lands on is byte 100 of the html, and a two-byte character
    /// across it used to end the process with
    /// "byte index 128 is not a char boundary".
    #[test]
    fn a_template_with_a_multibyte_character_under_the_search_budget_still_maps() {
        for pad in 70..130 {
            let source = format!(
                "const V = () => <p class=\"lead\">{}é — naïve 日本 🎉</p>;\n",
                "a".repeat(pad)
            );
            let mapped = map_of(&source, "V.tsx");
            assert!(mapped.code.contains("naïve"), "{}", mapped.code);
            assert!(!mapped.segments.is_empty(), "pad {pad} mapped nothing");
        }
    }

    /// The line-start fill exists so an unmapped statement stays reachable. It
    /// must not fire on a line that CONTINUES a token: column 0 of the second
    /// line of a multi-line template literal belongs to the text that wrapped,
    /// and filling it there replaces an inherited-correct position with the
    /// position of whatever comes next.
    #[test]
    fn a_line_that_continues_a_template_literal_is_not_filled_from_the_right() {
        let source = "export default function P() { return (<div>a&#10;b<i>tail</i></div>) }\n";
        let mapped = map_of(source, "P.tsx");
        let line = mapped.line_of("b<i>tail</i>");
        assert!(
            !mapped.segments.iter().any(|segment| segment.gen_line == line && segment.gen_col == 0),
            "a fabricated segment at the start of a continued literal: {}",
            mapped.code
        );
        // …and the statement fill it was added for still happens.
        let mapped = map_of(CARD, "Card.tsx");
        let insert = mapped.line_of("_$insert(");
        let text = mapped.code.split('\n').nth(insert as usize).unwrap();
        let column = (text.len() - text.trim_start().len()) as u32;
        assert!(
            mapped
                .segments
                .iter()
                .any(|segment| segment.gen_line == insert && segment.gen_col <= column),
            "{}",
            mapped.code
        );
    }

    /// A map whose `sources` or `sourcesContent` is wrong resolves to the right
    /// line of the wrong file, which is the failure mode nobody notices.
    #[test]
    fn the_map_carries_the_file_it_was_built_from() {
        let mapped = map_of(CARD, "src/Card.tsx");
        assert!(mapped.json.contains("\"version\":3"), "{}", mapped.json);
        assert!(mapped.json.contains("\"file\":\"src/Card.tsx\""), "{}", mapped.json);
        assert!(mapped.json.contains("\"sources\":[\"src/Card.tsx\"]"), "{}", mapped.json);
        let contents = mapped.json.split("\"sourcesContent\":[").nth(1).expect("sourcesContent");
        assert!(contents.starts_with('"'), "{contents}");
        assert!(contents.contains("export function Card"), "{contents}");
    }

    /// Emitting the map may not change the code it maps, or the map describes a
    /// module nobody ships.
    #[test]
    fn asking_for_a_map_does_not_change_the_output() {
        for name in fixture_names() {
            let source = std::fs::read_to_string(fixture_path(&name)).expect("a fixture");
            let plain = compile(&source, &ResolvedOptions::with_filename(&name)).unwrap();
            let options =
                ResolvedOptions { sourcemap: true, ..ResolvedOptions::with_filename(&name) };
            let mapped = compile(&source, &options).unwrap();
            assert_eq!(plain.code, mapped.code, "{name}");
        }
    }

    fn fixture_path(name: &str) -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures").join(name)
    }

    fn fixture_names() -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(fixture_path(""))
            .expect("the fixture corpus")
            .filter_map(|entry| {
                let path = entry.ok()?.path();
                (path.extension()? == "tsx")
                    .then(|| path.file_name()?.to_str().map(ToOwned::to_owned))?
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn extension_selects_the_source_type() {
        let tsx = source_type_for(Some("a.tsx"));
        assert!(tsx.is_typescript() && tsx.is_jsx());

        let jsx = source_type_for(Some("a.jsx"));
        assert!(!jsx.is_typescript() && jsx.is_jsx() && jsx.is_module());

        let ts = source_type_for(Some("a.ts"));
        assert!(ts.is_typescript() && !ts.is_jsx());

        let js = source_type_for(Some("a.js"));
        assert!(!js.is_typescript() && js.is_jsx() && js.is_module());

        let mts = source_type_for(Some("a.mts"));
        assert!(mts.is_typescript() && !mts.is_jsx() && mts.is_module());

        let cts = source_type_for(Some("a.cts"));
        assert!(cts.is_typescript() && !cts.is_jsx() && cts.is_commonjs());

        let mjs = source_type_for(Some("a.mjs"));
        assert!(!mjs.is_typescript() && mjs.is_jsx() && mjs.is_module());

        let cjs = source_type_for(Some("a.cjs"));
        assert!(!cjs.is_typescript() && cjs.is_jsx() && cjs.is_commonjs());

        let fallback = source_type_for(None);
        assert!(fallback.is_typescript() && fallback.is_jsx());

        let unknown = source_type_for(Some("a.vue"));
        assert!(unknown.is_typescript() && unknown.is_jsx());
    }

    #[test]
    fn every_extension_actually_parses_its_dialect() {
        for filename in ["a.tsx", "a.jsx", "a.js", "a.mjs", "a.cjs"] {
            let output = compile_ok("const v = <div>{x}</div>;\n", filename);
            assert!(output.code.contains("<div>"), "{filename}: {}", output.code);
        }
        for filename in ["a.ts", "a.mts", "a.cts"] {
            let output = compile_ok("const v: number = 1;\n", filename);
            assert!(output.code.contains(": number"), "{filename}: {}", output.code);
        }
    }

    // ── M3: the analysis passes ───────────────────────────────────────────

    const CORE: &str = "import { signal, computed, useStore } from \"@barqjs/core\";\n";

    /// Target #1. Both bindings are `const` in the same scope and only one of
    /// them is reactive, so no name heuristic can separate them. `count.set` is
    /// a member read on an accessor whose member is non-tracking, and `count()`
    /// is the tracked read — the same identifier, two verdicts.
    #[test]
    fn a_provably_static_value_gets_no_effect_and_a_tracked_read_does() {
        let source = format!(
            "{CORE}const theme = \"dark\";\nconst count = signal(0);\n\
             const V = () => <p id={{theme}} title={{() => count()}} />;\n"
        );
        let output = compile_ok(&source, "V.tsx");
        // The static one is folded into the template; only the tracked read
        // survives as runtime work.
        assert!(output.code.contains("id=\"dark\""), "{}", output.code);
        assert!(!output.code.contains("\"id\""), "{}", output.code);
        assert!(output.code.contains("_$setProp(_el$1, \"title\""), "{}", output.code);
        assert_eq!(output.code.matches("_$setProp(").count(), 1, "{}", output.code);

        // `count.set` is masked as non-tracking, so it folds nowhere and creates
        // no effect: it goes through setProp unwrapped, exactly as the oracle does.
        let source =
            format!("{CORE}const count = signal(0);\nconst V = () => <p onx={{count.set}} />;\n");
        let output = compile_ok(&source, "V.tsx");
        assert!(!output.code.contains("_$renderEffect"), "{}", output.code);
    }

    /// Target #2, as the type-level fact `patch.is_empty()` rather than an
    /// analysis result: every attribute folded away, so the unit emits one
    /// clone and NOTHING else — no walk, no arrow, no statements.
    #[test]
    fn a_subtree_whose_last_patch_folds_away_becomes_a_bare_clone() {
        let source = "const SIZE = \"lg\";\nconst V = () => <b class={\"card--\" + SIZE} data-n={2 * 3}>x</b>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(
            output.code.contains("_$template(`<b class=\"card--lg\" data-n=\"6\">x</b>`)"),
            "{}",
            output.code
        );
        assert!(output.code.contains("const V = () => _tmpl$1();"), "{}", output.code);
        assert!(!output.code.contains("_$setProp"), "{}", output.code);
        assert!(!output.code.contains("_el$"), "{}", output.code);
    }

    /// Target #3's refusals. A `DOM_PROPS` name is written as a PROPERTY by the
    /// runtime, so baking it would set only the default attribute; `false` and
    /// `null` REMOVE an attribute, so the template carries nothing at all.
    #[test]
    fn folding_refuses_the_property_channel_and_drops_a_falsy_attribute() {
        let output = compile_ok(
            "const V = () => <input value={\"v\"} hidden={false} lang={null} />;\n",
            "V.tsx",
        );
        assert!(output.code.contains("_$template(`<input>`)"), "{}", output.code);
        assert!(output.code.contains("_$setProp(_el$1, \"value\", \"v\")"), "{}", output.code);
        assert!(!output.code.contains("hidden"), "{}", output.code);
        assert!(!output.code.contains("lang"), "{}", output.code);
    }

    /// A folded attribute goes back where the AUTHOR wrote it, not on the end:
    /// `createElement` walks the props object in source order, and the DOM
    /// reports attributes in the order they were set.
    #[test]
    fn a_folded_attribute_lands_at_its_source_position() {
        let output =
            compile_ok("const V = () => <b id={\"a\"} class=\"c\" title={\"t\"}>x</b>;\n", "V.tsx");
        assert!(
            output.code.contains("`<b id=\"a\" class=\"c\" title=\"t\">x</b>`"),
            "{}",
            output.code
        );
    }

    /// Target #4. Two tracked props on one element share ONE renderEffect with
    /// per-key `!==` guards, and the fused compute returns the accumulator —
    /// never a function, which `signals.ts` would register as a cleanup (V6).
    #[test]
    fn two_live_props_on_one_element_share_a_single_effect() {
        let source = format!(
            "{CORE}const a = signal(0);\nconst b = signal(1);\n\
             const V = () => <p title={{() => a()}} lang={{() => b()}} />;\n"
        );
        let output = compile_ok(&source, "V.tsx");
        assert_eq!(output.code.matches("_$renderEffect(").count(), 1, "{}", output.code);
        assert!(output.code.contains("(_p$ = {}) =>"), "{}", output.code);
        assert!(output.code.contains("return _p$;"), "{}", output.code);
        assert!(output.code.contains("if (_v$1 !== _p$.title)"), "{}", output.code);
        assert!(output.code.contains("if (_v$2 !== _p$.lang)"), "{}", output.code);
        // The user's per-prop closures are deleted, not called.
        assert!(!output.code.contains("(() => a())"), "{}", output.code);
        assert!(!output.code.contains("(() => b())"), "{}", output.code);
    }

    /// `style` and `classList` keep the value the runtime diffs against, so
    /// they are never folded into an effect: `applyResolvedProp` REMOVES what
    /// vanished, and a compiled effect calling setProp afresh could only add.
    #[test]
    fn a_prop_the_runtime_diffs_statefully_never_joins_an_effect() {
        let source = format!(
            "{CORE}const s = signal({{}});\n\
             const V = () => <p style={{() => s()}} classList={{() => s()}} title={{() => s()}} />;\n"
        );
        let output = compile_ok(&source, "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"style\", () => s())"), "{}", output.code);
        assert!(
            output.code.contains("_$setProp(_el$1, \"classList\", () => s())"),
            "{}",
            output.code
        );
        // Only `title` is left to coalesce, so the group collapses to the thunk
        // form rather than a renderEffect.
        assert!(!output.code.contains("_$renderEffect"), "{}", output.code);
    }

    /// Target #7. A delegated name becomes a direct expando write plus ONE
    /// module-level delegateEvents call; everything outside the generated
    /// 22-name set stays an addEventListener, because a document listener for a
    /// non-delegated type would never fire.
    #[test]
    fn a_delegated_event_is_an_expando_write_and_the_rest_are_listeners() {
        let source = "const V = () => <b onClick={() => log(1)} onChange={() => log(2)}>x</b>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_el$1.$$click = _h$1;"), "{}", output.code);
        assert!(
            output.code.contains("_el$1.addEventListener(\"change\", _h$2)"),
            "{}",
            output.code
        );
        assert_eq!(output.code.matches("_$delegateEvents(").count(), 1, "{}", output.code);
        assert!(output.code.contains("_$delegateEvents([\"click\"])"), "{}", output.code);
        assert!(!output.code.contains("$$change"), "{}", output.code);
    }

    /// Target #7's second half, and its boundary. A closure that captures only
    /// module scope is the same function on every instance and moves out; one
    /// that captures a local cannot.
    #[test]
    fn a_capture_free_handler_hoists_and_a_capturing_one_does_not() {
        let source = "const V = () => <b onClick={(e) => e.preventDefault()}>x</b>;\n";
        let output = compile_ok(source, "V.tsx");
        let handler = output.code.find("preventDefault").expect("the handler");
        let component = output.code.find("const V =").expect("the component");
        assert!(handler < component, "a capture-free handler is module scope: {}", output.code);

        let source = "const V = (n) => <b onClick={() => bump(n)}>x</b>;\n";
        let output = compile_ok(source, "V.tsx");
        let handler = output.code.find("bump(n)").expect("the handler");
        let component = output.code.find("const V =").expect("the component");
        assert!(handler > component, "a captured local pins the handler: {}", output.code);
    }

    /// The value has to be a function before the compiler may take over: the
    /// oracle's `applyProp` binds nothing unless `isEventHandlerValue` holds, so
    /// an unknown value goes through setProp and the runtime decides.
    #[test]
    fn an_event_value_the_compiler_cannot_see_stays_with_the_runtime() {
        let output = compile_ok("const V = (p) => <b onClick={p.h}>x</b>;\n", "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"onClick\", p.h)"), "{}", output.code);
        assert!(!output.code.contains("$$click"), "{}", output.code);
        assert!(!output.code.contains("_$delegateEvents"), "{}", output.code);
    }

    /// V2: the bound-handler tuple lives in `$$<type>` itself. Emitting a
    /// `$$clickData` compiles cleanly and does nothing.
    #[test]
    fn a_bound_handler_tuple_is_written_whole_into_the_expando() {
        let output =
            compile_ok("const V = (item) => <b onClick={[remove, item]}>x</b>;\n", "V.tsx");
        assert!(output.code.contains("_el$1.$$click = [remove, item]"), "{}", output.code);
        assert!(!output.code.contains("Data"), "{}", output.code);
    }

    /// O4, made visible. `<p title={count()} />` is a one-shot read under
    /// `createElement` and a LIVE binding once compiled — that is what compiling
    /// buys, and it is the one place the compiled path deliberately does more
    /// reactive work than the oracle. η-reduction emits the accessor itself, so
    /// the hole costs no closure.
    #[test]
    fn a_bare_tracked_read_in_an_attribute_becomes_a_live_binding() {
        let source =
            format!("{CORE}const count = signal(0);\nconst V = () => <p title={{count()}} />;\n");
        let output = compile_ok(&source, "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"title\", count)"), "{}", output.code);
        assert!(!output.code.contains("() => count()"), "η-reduced: {}", output.code);
    }

    /// An unresolvable origin must stay CORRECT, never optimistic: a barrel
    /// re-export is invisible, so the value goes through setProp unwrapped and
    /// the runtime makes the oracle's decision.
    #[test]
    fn an_unresolvable_origin_is_opaque_and_costs_the_runtime_nothing_extra() {
        let source = "import { signal } from \"./barrel\";\nconst c = signal(0);\n\
                      const V = () => <p title={c()} />;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"title\", c())"), "{}", output.code);
        assert!(!output.code.contains("_$renderEffect"), "{}", output.code);
    }

    /// P3 Fold may not bake a name the runtime INTERCEPTS: `applyResolvedProp`
    /// never lets `classList` or `dangerouslySetInnerHTML` reach
    /// `setElementAttr`, so the attribute the parser would build is not what the
    /// runtime writes. Nothing pinned this — deleting the refusal baked
    /// `classList="a b"` into the template HTML with both suites green.
    #[test]
    fn a_constant_the_runtime_intercepts_is_never_baked_into_the_template() {
        let source = "const CLS = \"a b\";\nconst HTML = \"<b>x</b>\";\nconst REF = \"r\";\n\
                      const V = () => <div classList={CLS} dangerouslySetInnerHTML={HTML} ref={REF} />;\n";
        let output = compile_ok(source, "V.tsx");
        for forbidden in ["classList=", "dangerouslySetInnerHTML=", "ref="] {
            for line in output.code.lines().filter(|line| line.contains("_$template(")) {
                assert!(!line.contains(forbidden), "{forbidden}\n{}", output.code);
            }
        }
        assert!(output.code.contains("_$setProp(_el$1, \"classList\", CLS)"), "{}", output.code);
        assert!(output.code.contains("\"dangerouslySetInnerHTML\", HTML"), "{}", output.code);

        // A literal STRING class or style is the documented exception: both
        // reach the DOM identically through the parser and through the runtime.
        let source = "const C = \"a b\";\nconst S = \"color: red\";\n\
                      const V = () => <div class={C} style={S} />;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(
            output.code.contains("_$template(`<div class=\"a b\" style=\"color: red\"></div>`)"),
            "{}",
            output.code
        );
        assert!(!output.code.contains("_$setProp"), "{}", output.code);
    }

    /// The HTML input-stream preprocessor rewrites CR (to LF) and U+0000 (to
    /// U+FFFD, or drops it), so neither survives a template the way
    /// `setAttribute` and `createTextNode` keep it. Reached through a fold, a
    /// source literal and a character reference alike.
    #[test]
    fn a_byte_the_tokenizer_rewrites_never_reaches_a_template() {
        for value in ["\"a\\rb\"", "\"a\\0b\""] {
            let source =
                format!("const x = {value};\nconst V = () => <div data-x={{x}}>t</div>;\n");
            let output = compile_ok(&source, "V.tsx");
            assert!(
                output.code.contains("_$setProp(_el$1, \"data-x\", x)"),
                "{value}\n{}",
                output.code
            );
            assert!(output.code.contains("_$template(`<div>t</div>`)"), "{value}\n{}", output.code);
        }

        // A character reference decodes to the same byte, so the literal
        // attribute channel has to refuse it too.
        let output = compile_ok("const V = () => <div id=\"a&#0;b\">t</div>;\n", "V.tsx");
        assert!(output.code.contains("_$setProp"), "{}", output.code);
        assert!(output.code.contains("_$template(`<div>t</div>`)"), "{}", output.code);

        // In TEXT there is no patch channel to fall back to, so the element
        // leaves the template altogether and renders through createElement.
        let output = compile_ok("const V = () => <div>x&#0;y</div>;\n", "V.tsx");
        assert!(output.code.contains("_$createElement(\"div\""), "{}", output.code);
        assert!(!output.code.contains("_$template("), "{}", output.code);
    }

    /// oxc encodes a lone surrogate as `\u{FFFD}XXXX` because a Rust `str`
    /// cannot hold one, so folding the cooked value bakes five characters where
    /// the runtime writes one.
    #[test]
    fn a_lone_surrogate_literal_is_never_folded() {
        let source = "const x = \"\\ud800\";\nconst V = () => <div id={x}>t</div>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"id\", x)"), "{}", output.code);
        assert!(output.code.contains("_$template(`<div>t</div>`)"), "{}", output.code);

        let source = "const V = () => <div id={`\\ud800`}>t</div>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_$setProp"), "{}", output.code);
    }

    /// `class` is diffed statefully by the runtime, so an effect shared with
    /// another prop would rewrite `element.className` on an unrelated change and
    /// wipe what `classList` (or a ref, or a directive) put there.
    #[test]
    fn class_never_joins_an_effect_with_another_prop() {
        let source = format!(
            "{CORE}const a = signal(\"x\");\nconst b = signal(\"y\");\n\
             const V = () => <div class={{() => a()}} title={{() => b()}} id={{() => b()}} />;\n"
        );
        let output = compile_ok(&source, "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"class\", () => a())"), "{}", output.code);
        assert!(!output.code.contains("_p$.class"), "{}", output.code);
        // The two that are NOT intercepted still merge — this is the boundary of
        // target #4, not its removal.
        assert_eq!(output.code.matches("_$renderEffect(").count(), 1, "{}", output.code);
        assert!(output.code.contains("_p$.title"), "{}", output.code);
        assert!(output.code.contains("_p$.id"), "{}", output.code);
    }

    /// `_p$.__proto__ = v` writes through `Object.prototype`'s setter instead of
    /// creating an own slot, so every OTHER guard in the group compares against
    /// a value that was never stored.
    #[test]
    fn an_accumulator_key_that_is_not_an_own_slot_never_joins_a_group() {
        let source = format!(
            "{CORE}const a = signal(\"x\");\nconst b = signal(\"y\");\n\
             const V = () => <div __proto__={{() => a()}} title={{() => b()}} />;\n"
        );
        let output = compile_ok(&source, "V.tsx");
        assert!(!output.code.contains("_p$.__proto__"), "{}", output.code);
        assert!(
            output.code.contains("_$setProp(_el$1, \"__proto__\", () => a())"),
            "{}",
            output.code
        );
    }

    /// A hoisted handler is moved to module scope, where the enclosing
    /// function's `arguments` no longer exists and `eval` can no longer reach
    /// the bindings the author expected.
    #[test]
    fn a_handler_reading_arguments_or_eval_is_never_hoisted() {
        for body in ["log(arguments.length)", "eval(\"log(1)\")", "log(this)"] {
            let source = format!(
                "function log(n) {{}}\n\
                 function V() {{ return <button onClick={{() => {body}}}>b</button>; }}\n"
            );
            let output = compile_ok(&source, "V.tsx");
            assert!(!output.code.contains("const _h$1"), "{body}\n{}", output.code);
            assert!(output.code.contains("$$click = () =>"), "{body}\n{}", output.code);
        }

        // The contrast: a handler that only reads module scope still hoists.
        let source = "function log(n) {}\n\
                      function V() { return <button onClick={() => log(1)}>b</button>; }\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("const _h$1 = () => log(1)"), "{}", output.code);
    }

    /// `setElementAttr` takes the PROPERTY branch only under `!isSvg`, so a
    /// literal on an SVG element folds where the same name on an `<input>` does
    /// not. Two `bakeable` predicates disagreed about this until they were
    /// merged into one.
    #[test]
    fn the_property_channel_is_decided_per_element_namespace() {
        let output = compile_ok("const V = () => <svg value={\"x\"} />;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<svg value=\"x\"/>`)"), "{}", output.code);
        assert!(!output.code.contains("_$setProp"), "{}", output.code);

        let output = compile_ok("const V = () => <input value={\"x\"} />;\n", "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"value\", \"x\")"), "{}", output.code);
        assert!(output.code.contains("_$template(`<input>`)"), "{}", output.code);
    }

    /// DESIGN §7 claims `SIZE` and `theme` "never appear at runtime". They did:
    /// P3 baked their bytes into the template and left the declarations behind.
    #[test]
    fn a_binding_whose_last_read_was_folded_away_does_not_reach_the_output() {
        let source = "const SIZE = \"lg\";\nconst theme = \"dark\";\n\
                      export function Card() { return <div class={\"c--\" + SIZE + \" \" + theme}>x</div>; }\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("`<div class=\"c--lg dark\">x</div>`"), "{}", output.code);
        assert!(!output.code.contains("SIZE"), "{}", output.code);
        assert!(!output.code.contains("theme"), "{}", output.code);
    }

    /// The refusals. This is the only pass that deletes user code, so each one
    /// is a case where the binding is still reachable or still does work.
    #[test]
    fn a_folded_binding_survives_wherever_deleting_it_could_change_the_program() {
        let jsx = "const V = () => <b class={SIZE}>x</b>;\n";
        for (kept, source) in [
            ("an export", format!("export const SIZE = \"lg\";\n{jsx}")),
            ("another reader", format!("const SIZE = \"lg\";\nconst also = SIZE;\n{jsx}")),
            ("a call in the initialiser", format!("const SIZE = load();\n{jsx}")),
            ("a reassignable binding", format!("let SIZE = \"lg\";\n{jsx}")),
            ("a destructured binding", format!("const {{ SIZE }} = settings;\n{jsx}")),
            (
                "a type that names it",
                format!("const SIZE = \"lg\";\ntype T = typeof SIZE;\nexport type {{ T }};\n{jsx}"),
            ),
        ] {
            let output = compile_ok(&source, "V.tsx");
            assert!(output.code.contains("SIZE"), "{kept} was deleted:\n{}", output.code);
        }
    }

    /// A JSX attribute string is not a JS string: the TRANSFORM resolves its
    /// character references. Down the template channel the HTML parser does it;
    /// down the patch channel nothing would, so P1 has to.
    #[test]
    fn a_literal_attribute_on_the_patch_channel_carries_its_decoded_value() {
        let output = compile_ok("const V = () => <input value=\"a&amp;b\" />;\n", "V.tsx");
        assert!(output.code.contains("_$setProp(_el$1, \"value\", \"a&b\")"), "{}", output.code);

        // The template channel keeps the reference, because the parser resolves
        // it to the same bytes.
        let output = compile_ok("const V = () => <div title=\"a&amp;b\" />;\n", "V.tsx");
        assert!(
            output.code.contains("_$template(`<div title=\"a&amp;b\"></div>`)"),
            "{}",
            output.code
        );
    }

    /// A bare attribute is the value `true`, and `classToString(true)` is null —
    /// so `<div class/>` REMOVES the attribute the parser would have created.
    #[test]
    fn a_bare_intercepted_attribute_is_left_to_the_runtime() {
        let output = compile_ok("const V = () => <div class title>t</div>;\n", "V.tsx");
        assert!(output.code.contains("_$template(`<div title>t</div>`)"), "{}", output.code);
        assert!(output.code.contains("_$setProp(_el$1, \"class\", true)"), "{}", output.code);
    }

    /// Target #7's commonest shape: a handler bound to a name. The binding is
    /// `const` and never reassigned, so it is known to hold the callable and the
    /// expando can be written directly. A binding that could hold anything else
    /// stays on `setProp`, where the runtime's own `isEventHandlerValue` decides.
    #[test]
    fn a_handler_bound_to_a_name_still_becomes_an_expando_write() {
        let source = "function log() {}\nconst h = () => log();\n\
                      const V = () => <button onClick={h}>b</button>;\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_el$1.$$click = h"), "{}", output.code);
        assert!(output.code.contains("_$delegateEvents([\"click\"])"), "{}", output.code);
        assert!(!output.code.contains("_$setProp"), "{}", output.code);
        // Never RE-hoisted: the reference is emitted where it stands, which is
        // what keeps a component-scope declaration working.
        assert!(!output.code.contains("const _h$1"), "{}", output.code);

        let source = "function log() {}\n\
                      function V() { const h = () => log(); return <button onClick={h}>b</button>; }\n";
        let output = compile_ok(source, "V.tsx");
        assert!(output.code.contains("_el$1.$$click = h"), "{}", output.code);
        assert!(!output.code.contains("const _h$1"), "{}", output.code);

        // A reassigned binding, and a binding holding a plain value, both stay
        // on the runtime's path.
        for source in [
            "let h = () => {};\nh = null;\nconst V = () => <button onClick={h}>b</button>;\n",
            "const h = 1;\nconst V = () => <button onClick={h}>b</button>;\n",
        ] {
            let output = compile_ok(source, "V.tsx");
            assert!(output.code.contains("_$setProp(_el$1, \"onClick\", h)"), "{}", output.code);
            assert!(!output.code.contains("$$click"), "{}", output.code);
        }
    }
}
