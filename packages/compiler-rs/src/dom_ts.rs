//! Shared by `build.rs` (via `#[path]`) and by the drift test, so the generator
//! and the check can never disagree about what `dom.ts` says.

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    /// `const NAME: Record<string, 1> = { key: 1, "kebab-key": 1 };`
    Record,
    /// `const NAME = new Set(["a", "b"]);`
    Set,
    /// Not a table at all: the string literals a named function BRANCHES on.
    /// `applyProp` and `applyResolvedProp` decide by `key === "…"` which props
    /// never reach `setElementAttr`, and that decision is as much a runtime
    /// fact as `DELEGATED_EVENTS` is.
    Branches { functions: &'static [&'static str], needle: &'static str },
}

pub const INTERCEPTED: Shape =
    Shape::Branches { functions: &["applyProp", "applyResolvedProp"], needle: "key === \"" };

pub const KEBAB_EXEMPT: Shape =
    Shape::Branches { functions: &["setElementAttr"], needle: "propKey !== \"" };

pub const TABLES: [(&str, &str, Shape); 7] = [
    ("SVG_TAGS", "SVG_TAGS", Shape::Record),
    ("DOM_PROPS", "DOM_PROPS", Shape::Record),
    ("CSS_NUMBER_PROPS", "CSS_NUMBER_PROPS", Shape::Record),
    ("DELEGATED_EVENTS", "DELEGATED_EVENTS", Shape::Set),
    ("NON_BUBBLING_EVENTS", "NON_BUBBLING_EVENTS", Shape::Set),
    ("applyProp/applyResolvedProp key branches", "INTERCEPTED_NAMES", INTERCEPTED),
    ("setElementAttr propKey exemptions", "SVG_KEBAB_EXEMPT_NAMES", KEBAB_EXEMPT),
];

/// The entries of one `dom.ts` table, sorted so the Rust side is a binary
/// search. Returns `Err` rather than an empty table: a rename in `dom.ts` must
/// break the build, not silently produce a compiler that delegates nothing.
pub fn extract(source: &str, name: &str, shape: Shape) -> Result<Vec<String>, String> {
    let (header, open, close) = match shape {
        Shape::Record => (format!("const {name}: Record<string, 1> = {{"), '{', '}'),
        Shape::Set => (format!("const {name} = new Set([",), '[', ']'),
        Shape::Branches { functions, needle } => return branches(source, functions, needle),
    };
    let at = source
        .find(&header)
        .ok_or_else(|| format!("dom.ts no longer declares `{header}`; the generator is stale"))?;
    let body_start = at + header.len();
    let mut depth = 1usize;
    let mut end = body_start;
    for (offset, ch) in source[body_start..].char_indices() {
        if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                end = body_start + offset;
                break;
            }
        }
    }
    if depth != 0 {
        return Err(format!("`{name}` in dom.ts is not closed"));
    }

    let mut out = Vec::new();
    for entry in split_entries(&source[body_start..end]) {
        let key = match shape {
            Shape::Record => entry.split(':').next().unwrap_or_default().trim().to_string(),
            _ => entry.trim().to_string(),
        };
        let key = key.trim_matches(['"', '\''].as_slice()).to_string();
        if key.is_empty() {
            continue;
        }
        out.push(key);
    }
    if out.is_empty() {
        return Err(format!("`{name}` in dom.ts came out empty"));
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Every string the named functions compare against. The body runs from the
/// `function NAME(` header to the first `}` in column zero, which is where
/// every top-level declaration in `dom.ts` ends.
fn branches(source: &str, functions: &[&str], needle: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for function in functions {
        let header = format!("function {function}(");
        let at = source.find(&header).ok_or_else(|| {
            format!("dom.ts no longer declares `{header}`; the generator is stale")
        })?;
        let body = &source[at..];
        let end = body.find("\n}\n").ok_or_else(|| format!("`{function}` is not closed"))?;
        let body = &body[..end];

        let mut rest = body;
        while let Some(start) = rest.find(needle) {
            rest = &rest[start + needle.len()..];
            let Some(close) = rest.find('"') else {
                return Err(format!("an unterminated `{needle}` in `{function}`"));
            };
            out.push(rest[..close].to_string());
            rest = &rest[close..];
        }
    }
    if out.is_empty() {
        return Err(format!("no `{needle}` branch left in {functions:?}; the generator is stale"));
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Comma separated, with `//` line comments stripped. Neither table nests, so a
/// depth counter would only be ceremony.
fn split_entries(body: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in body.lines() {
        let line = match line.find("//") {
            Some(at) => &line[..at],
            None => line,
        };
        for piece in line.split(',') {
            let piece = piece.trim();
            if !piece.is_empty() {
                out.push(piece.to_string());
            }
        }
    }
    out
}

/// The generated module, as text. `build.rs` writes it into `OUT_DIR`, so the
/// tables cannot drift: they are re-derived from `dom.ts` on every build that
/// `cargo:rerun-if-changed` triggers.
pub fn render(source: &str, dom_ts_path: &str) -> Result<String, String> {
    let mut out =
        String::from("// @generated by build.rs from packages/core/src/dom.ts — do not edit.\n\n");
    out.push_str(&format!(
        "/// Absolute path the tables below were generated from, so the drift test\n\
         /// can re-derive them without knowing the workspace layout.\n\
         pub const DOM_TS_PATH: &str = {dom_ts_path:?};\n\n"
    ));
    for (js_name, rust_name, shape) in TABLES {
        let entries = extract(source, js_name, shape)?;
        out.push_str(&format!(
            "/// `dom.ts` `{js_name}`, sorted for binary search.\npub const {rust_name}: [&str; {}] = [\n",
            entries.len()
        ));
        for entry in &entries {
            out.push_str(&format!("    {entry:?},\n"));
        }
        out.push_str("];\n\n");
    }
    Ok(out)
}
