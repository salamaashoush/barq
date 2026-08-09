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
    let dom_ts = manifest.join("../core/src/dom.ts").canonicalize().unwrap_or_else(|error| {
        panic!("packages/core/src/dom.ts is the source of the runtime tables: {error}")
    });
    println!("cargo:rerun-if-changed={}", dom_ts.display());
    println!("cargo:rerun-if-changed=src/dom_ts.rs");

    let source = std::fs::read_to_string(&dom_ts).expect("read dom.ts");
    let generated = dom_ts::render(&source, &dom_ts.to_string_lossy())
        .unwrap_or_else(|error| panic!("could not derive the runtime tables from dom.ts: {error}"));

    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("dom_tables.rs");
    std::fs::write(&out, generated).expect("write dom_tables.rs");
}
