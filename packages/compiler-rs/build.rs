use std::path::PathBuf;

#[path = "src/dom_ts.rs"]
mod dom_ts;

/// DESIGN §9: `classToString`, the kebab + px rules, `CSS_NUMBER_PROPS`,
/// `DOM_PROPS`, `SVG_TAGS` and `DELEGATED_EVENTS` all have to exist byte for
/// byte in Rust, and drift produces *wrong HTML* rather than a crash. So they
/// are read out of the runtime source at build time instead of transcribed, and
/// `cargo:rerun-if-changed` re-derives them whenever `dom.ts` moves.
fn main() {
    napi_build::setup();

    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    // Two packages since the server runtime moved out of core: `dom.ts` is the
    // client's table, `ssr.ts` is the string backend's, and the compiler reads
    // both as the source of truth for its own.
    let runtime = |package: &str, name: &str| {
        manifest.join("..").join(package).join("src").join(name).canonicalize().unwrap_or_else(
            |error| {
                panic!("packages/{package}/src/{name} is a source of the runtime tables: {error}")
            },
        )
    };
    let dom_ts = runtime("core", "dom.ts");
    let ssr_ts = runtime("server", "ssr.ts");
    println!("cargo:rerun-if-changed={}", dom_ts.display());
    println!("cargo:rerun-if-changed={}", ssr_ts.display());
    println!("cargo:rerun-if-changed=src/dom_ts.rs");

    let dom = std::fs::read_to_string(&dom_ts).expect("read dom.ts");
    let ssr = std::fs::read_to_string(&ssr_ts).expect("read ssr.ts");
    let generated = dom_ts::render(&dom_ts::Sources {
        dom: &dom,
        dom_path: &dom_ts.to_string_lossy(),
        ssr: &ssr,
        ssr_path: &ssr_ts.to_string_lossy(),
    })
    .unwrap_or_else(|error| panic!("could not derive the runtime tables: {error}"));

    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("dom_tables.rs");
    std::fs::write(&out, generated).expect("write dom_tables.rs");
}
