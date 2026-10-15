use std::path::PathBuf;

#[path = "src/css_ts.rs"]
mod css_ts;

/// The shorthand, unitless and axis tables exist in `@barqjs/css` and have to
/// exist here byte for byte: a declaration the two expand differently reaches
/// the page as two classes, with no error anywhere. So they are read out of the
/// runtime's source at build time instead of transcribed, and
/// `cargo:rerun-if-changed` re-derives them whenever either file moves.
fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let runtime = |name: &str| {
        manifest.join("../../../css/src").join(name).canonicalize().unwrap_or_else(|error| {
            panic!("packages/css/src/{name} is a source of the css tables: {error}")
        })
    };
    let atoms_ts = runtime("atoms.ts");
    let shorthands_ts = runtime("shorthands.ts");
    println!("cargo:rerun-if-changed={}", atoms_ts.display());
    println!("cargo:rerun-if-changed={}", shorthands_ts.display());
    println!("cargo:rerun-if-changed=src/css_ts.rs");

    let atoms = std::fs::read_to_string(&atoms_ts).expect("read atoms.ts");
    let shorthands = std::fs::read_to_string(&shorthands_ts).expect("read shorthands.ts");
    let generated = css_ts::render(&css_ts::Sources { atoms: &atoms, shorthands: &shorthands })
        .unwrap_or_else(|error| panic!("could not derive the css tables: {error}"));

    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("css_tables.rs");
    std::fs::write(&out, generated).expect("write css_tables.rs");
    println!(
        "cargo:rustc-env=BARQ_CSS_SOURCES={}",
        atoms_ts.parent().expect("atoms.ts has a directory").display()
    );
}
