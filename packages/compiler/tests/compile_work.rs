//! What a compile costs, counted rather than timed.
//!
//! The compile runs on every HMR update, so its cost is a feature, but a clock
//! read inside the suite measures the machine as much as the compiler. What a
//! clock cannot tell apart from noise, a count can: every allocation a compile
//! makes passes through the allocator below, and the same input asks for the
//! same allocations on every run, however loaded the machine. The timed budget
//! lives in `test/throughput.bench.ts`.
//!
//! The binary has no libtest harness (`harness = false`), because the counter
//! is process-wide and libtest runs tests, and its own bookkeeping, on threads
//! of its own. A compile past the inline-stack limit parses on a guard thread,
//! so a thread-local counter would miss exactly the path one of these checks
//! is about.

use std::alloc::{GlobalAlloc, Layout, System};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use barq_compiler::{ResolvedOptions, TransformOptions, compile};

struct Counting;

static CALLS: AtomicU64 = AtomicU64::new(0);
static BYTES: AtomicU64 = AtomicU64::new(0);

// SAFETY: every method forwards to `System` with the arguments it was given;
// the counters are atomics and allocate nothing.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        CALLS.fetch_add(1, Ordering::Relaxed);
        BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        // SAFETY: the caller's contract for `alloc` is `System`'s.
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        CALLS.fetch_add(1, Ordering::Relaxed);
        BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        // SAFETY: as for `alloc`.
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        CALLS.fetch_add(1, Ordering::Relaxed);
        BYTES.fetch_add(new_size.saturating_sub(layout.size()) as u64, Ordering::Relaxed);
        // SAFETY: `ptr` and `layout` came from this allocator, which is `System`'s.
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: as for `realloc`.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

/// Allocation calls and bytes asked for. Bytes is what an arena chunk shows
/// up in; calls is what a loop of small `Vec`s and `String`s shows up in.
#[derive(Clone, Copy, Debug)]
struct Work {
    calls: u64,
    bytes: u64,
}

impl Work {
    fn ratio(self, base: Work) -> (f64, f64) {
        (self.calls as f64 / base.calls as f64, self.bytes as f64 / base.bytes as f64)
    }
}

fn options(templates: bool) -> ResolvedOptions {
    TransformOptions {
        filename: Some("work.tsx".to_string()),
        templates: Some(templates),
        ..TransformOptions::default()
    }
    .resolve()
}

fn work(source: &str, options: &ResolvedOptions) -> (Work, String) {
    let calls = CALLS.load(Ordering::Relaxed);
    let bytes = BYTES.load(Ordering::Relaxed);
    let output = compile(source, options).unwrap_or_else(|diagnostics| {
        panic!(
            "the workload has to compile: {}",
            barq_compiler::compile::format_diagnostics(&diagnostics)
        )
    });
    let spent = Work {
        calls: CALLS.load(Ordering::Relaxed) - calls,
        bytes: BYTES.load(Ordering::Relaxed) - bytes,
    };
    (spent, output.code)
}

fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures").join(format!("{name}.tsx"));
    std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

/// `concatFixtures` from `test/measure.ts`: one module out of many, every
/// import after the first commented out and every top-level name suffixed with
/// its position, so no two copies declare the same binding.
fn concat(sources: &[String]) -> String {
    let mut out = String::new();
    for (index, source) in sources.iter().enumerate() {
        for line in source.lines() {
            let line = match line.strip_prefix("export default function ") {
                Some(rest) => format!("function {rest}"),
                None => line.to_string(),
            };
            let line = line
                .strip_prefix("export const ")
                .map(|rest| format!("const {rest}"))
                .or_else(|| {
                    line.strip_prefix("export function ").map(|rest| format!("function {rest}"))
                })
                .unwrap_or(line);
            if line.starts_with("import ") {
                if index > 0 {
                    out.push_str("// ");
                }
                out.push_str(&line);
            } else if let Some((keyword, rest)) =
                line.split_once(' ').filter(|(keyword, _)| matches!(*keyword, "const" | "function"))
            {
                let end = rest.find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'));
                let (name, tail) = rest.split_at(end.unwrap_or(rest.len()));
                if name.is_empty() {
                    out.push_str(&line);
                } else {
                    out.push_str(&format!("{keyword} {name}_{index}{tail}"));
                }
            } else {
                out.push_str(&line);
            }
            out.push('\n');
        }
    }
    out
}

const TYPICAL: [&str; 3] =
    ["control-flow-for", "control-flow-switch-match", "component-boundary-props"];

fn typical(copies: usize) -> String {
    let sources: Vec<String> =
        (0..copies).flat_map(|_| TYPICAL.iter().map(|name| fixture(name))).collect();
    concat(&sources)
}

fn every_fixture() -> Vec<(String, String)> {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let mut names: Vec<String> = std::fs::read_dir(&directory)
        .expect("fixtures/")
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter_map(|name| name.strip_suffix(".tsx").map(str::to_string))
        .collect();
    names.sort();
    names.into_iter().map(|name| (fixture(&name), name)).collect()
}

/// Below this a compile parses on the caller's stack, above it on a guard
/// thread; `compile.rs` names the same figure `INLINE_SOURCE_LIMIT`.
const INLINE_SOURCE_LIMIT: usize = 8 * 1024;

type Check = Result<(), String>;

fn deterministic(on: &ResolvedOptions) -> Check {
    let source = typical(4);
    let (first, _) = work(&source, on);
    let (second, _) = work(&source, on);
    if first.calls != second.calls || first.bytes != second.bytes {
        return Err(format!("one input, two counts: {first:?} then {second:?}"));
    }
    Ok(())
}

/// A pass that is quadratic in the module shows up as a ratio that climbs
/// toward 4 on every doubling. Linear work stays under 2, less the fixed cost
/// of a compile, and the series crosses the inline-stack limit so the guard
/// thread is held to the same rule.
fn linear_in_the_module(on: &ResolvedOptions) -> Check {
    let series: Vec<(usize, usize, Work)> = [1, 2, 4, 8, 16]
        .into_iter()
        .map(|copies| {
            let source = typical(copies);
            (copies, source.len(), work(&source, on).0)
        })
        .collect();
    for (copies, bytes, spent) in &series {
        report(format_args!("typical component file x{copies:<2} {bytes:>6} bytes  {spent:?}"));
    }
    let (_, first_bytes, first) = series[0];
    let (_, last_bytes, last) = series[series.len() - 1];
    if !(first_bytes < INLINE_SOURCE_LIMIT && last_bytes > INLINE_SOURCE_LIMIT) {
        return Err(format!("the series has to straddle {INLINE_SOURCE_LIMIT} bytes"));
    }
    for pair in series.windows(2) {
        let (from, _, base) = pair[0];
        let (to, _, spent) = pair[1];
        let (calls, _) = spent.ratio(base);
        if calls > 2.1 {
            return Err(format!("x{from} to x{to} multiplied allocation calls by {calls:.2}"));
        }
    }
    let (calls, bytes) = last.ratio(first);
    if calls > 16.0 || bytes > 16.0 {
        return Err(format!("sixteen copies cost {calls:.2}x the calls and {bytes:.2}x the bytes"));
    }
    Ok(())
}

/// Every fixture glued into one module costs no more than compiling each on
/// its own. A cost that grows with the module rather than with what is in it
/// is the one thing that makes the glued file the expensive side.
fn no_dearer_glued_than_apart(on: &ResolvedOptions) -> Check {
    let sources: Vec<String> = every_fixture().into_iter().map(|(source, _)| source).collect();
    let mut apart = Work { calls: 0, bytes: 0 };
    let mut compiled = 0;
    for source in &sources {
        if compile(source, on).is_err() {
            continue;
        }
        let (spent, _) = work(source, on);
        apart.calls += spent.calls;
        apart.bytes += spent.bytes;
        compiled += 1;
    }
    let glued = concat(&sources);
    let (whole, code) = work(&glued, on);
    report(format_args!(
        "{compiled} fixtures apart {apart:?}, glued into {} bytes {whole:?}",
        glued.len()
    ));
    if compiled < 100 {
        return Err(format!("only {compiled} fixtures compiled on their own"));
    }
    if !code.contains("template(") {
        return Err("the glued corpus reached no template".to_string());
    }
    if whole.calls > apart.calls || whole.bytes > apart.bytes {
        return Err(format!("glued {whole:?} against {apart:?} apart"));
    }
    Ok(())
}

/// `templates: false` runs the identical pipeline with every element refused,
/// so it pays for the parse, the harvest, the semantic table and the
/// `createElement` codegen and nothing the IR touches. The ratio is the IR
/// pipeline's cost as a multiple of work that is not ours, and it is
/// scale-free. Measured at 2.17x the calls and 1.87x the bytes.
fn ir_pipeline_is_a_small_multiple_of_parsing(
    on: &ResolvedOptions,
    off: &ResolvedOptions,
) -> Check {
    let source = typical(1);
    let (compiled, code_on) = work(&source, on);
    let (parsed, code_off) = work(&source, off);
    if !code_on.contains("template(") || code_off.contains("template(") {
        return Err("the compiled half must template and the baseline must not".to_string());
    }
    let (calls, bytes) = compiled.ratio(parsed);
    report(format_args!("templates on against off: {calls:.2}x calls, {bytes:.2}x bytes"));
    if calls > 2.75 || bytes > 2.35 {
        return Err(format!(
            "the IR pipeline costs {calls:.2}x the calls and {bytes:.2}x the bytes"
        ));
    }
    Ok(())
}

/// What a check measured, for a reader. A green run prints the checks' results
/// alone; `BARQ_TEST_REPORT=1` prints the measurements beside them.
fn report(line: std::fmt::Arguments) {
    if std::env::var_os("BARQ_TEST_REPORT").is_some() {
        println!("{line}");
    }
}

fn main() {
    let on = options(true);
    let off = options(false);
    // The tables behind a `OnceLock` are built by whichever compile runs first.
    work(&typical(1), &on);
    work(&typical(1), &off);

    let checks: [(&str, Check); 4] = [
        ("one input asks for the same allocations every time", deterministic(&on)),
        (
            "work grows linearly with the module, past the inline-stack limit too",
            linear_in_the_module(&on),
        ),
        (
            "the corpus glued into one module costs no more than apart",
            no_dearer_glued_than_apart(&on),
        ),
        (
            "the IR pipeline stays a small multiple of parsing the same file",
            ir_pipeline_is_a_small_multiple_of_parsing(&on, &off),
        ),
    ];
    let mut failed = 0;
    for (name, outcome) in checks {
        match outcome {
            Ok(()) => println!("ok   {name}"),
            Err(why) => {
                failed += 1;
                println!("FAIL {name}: {why}");
            }
        }
    }
    if failed > 0 {
        std::process::exit(1);
    }
}
