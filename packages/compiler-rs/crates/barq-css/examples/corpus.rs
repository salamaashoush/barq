//! Compile every `css` block in a real application and report what does not.
//!
//! Run: `cargo run -p barq_css --example corpus -- <corpus.txt>`

use barq_css::{Kind, Options, compile};

fn main() {
    let path = std::env::args().nth(1).expect("a corpus path");
    let corpus = std::fs::read_to_string(path).expect("readable corpus");

    let (mut ok, mut bytes_in, mut bytes_out) = (0usize, 0usize, 0usize);
    let mut failures = Vec::new();
    let mut names = std::collections::HashMap::new();

    for record in corpus.split('\u{0}') {
        let (header, source) = record.split_once('\n').expect("a header line");
        let fields: Vec<&str> = header.split('\t').collect();
        let (kind, file, line, holes) = (fields[0], fields[1], fields[2], fields[3]);
        let kind = match kind {
            "scoped" => Kind::Scoped,
            "keyframes" => Kind::Keyframes,
            _ => Kind::Global,
        };
        let holes: Vec<String> =
            (0..holes.parse().unwrap()).map(|slot| format!("var(--b{slot})")).collect();
        let holes: Vec<&str> = holes.iter().map(String::as_str).collect();

        match compile(source, kind, &Options { holes: &holes, ..Options::default() }) {
            Ok(compiled) => {
                ok += 1;
                bytes_in += source.len();
                bytes_out += compiled.css.len();
                if !compiled.name.is_empty() {
                    names.entry(compiled.name).or_insert_with(Vec::new).push(source.to_string());
                }
            }
            Err(error) => failures.push(format!(
                "{file}:{line}: {}\n    {}",
                error.message,
                source[error.start.min(source.len())..error.end.min(source.len())]
                    .trim()
                    .lines()
                    .next()
                    .unwrap_or("")
            )),
        }
    }

    let shared = names.values().filter(|blocks| blocks.len() > 1).count();
    let collisions = names
        .values()
        .filter(|blocks| {
            let first = barq_css::canonical(&blocks[0], &[]);
            blocks.iter().any(|block| barq_css::canonical(block, &[]) != first)
        })
        .count();

    println!("compiled {ok}, failed {}", failures.len());
    println!("css in {bytes_in} bytes, out {bytes_out} bytes");
    println!("distinct classes {}, shared by more than one block {shared}", names.len());
    println!("hash collisions between DIFFERENT blocks: {collisions}");
    for failure in &failures {
        println!("\n{failure}");
    }
}
