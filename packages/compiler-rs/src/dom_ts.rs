//! Shared by `build.rs` (via `#[path]`) and by the drift test, so the generator
//! and the check can never disagree about what the runtime says.

/// Which runtime file a table is read out of.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum From {
    /// `packages/core/src/dom.ts` — the client half.
    Dom,
    /// `packages/core/src/ssr.ts` — the string backend's half.
    Ssr,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    /// `const NAME: Record<string, 1> = { key: 1, "kebab-key": 1 };`
    Record,
    /// `const NAME = new Set(["a", "b"]);`
    Set,
    /// Not a table at all: the string literals a named function BRANCHES on.
    /// `channelOf` decides by `key === "…"` which names resolve to a channel of
    /// their own rather than to the plain attribute/property pair, and that
    /// decision is as much a runtime fact as `DELEGATED_EVENTS` is.
    Branches { functions: &'static [&'static str], needle: &'static str },
}

pub const INTERCEPTED: Shape = Shape::Branches { functions: &["channelOf"], needle: "key === \"" };

pub const KEBAB_EXEMPT: Shape =
    Shape::Branches { functions: &["attrNameOf"], needle: "propKey !== \"" };

pub const TABLES: [(&str, &str, Shape, From); 9] = [
    ("SVG_TAGS", "SVG_TAGS", Shape::Record, From::Dom),
    ("DOM_PROPS", "DOM_PROPS", Shape::Record, From::Dom),
    ("USER_MUTABLE_PROPS", "USER_MUTABLE_PROPS", Shape::Record, From::Dom),
    ("CSS_NUMBER_PROPS", "CSS_NUMBER_PROPS", Shape::Record, From::Dom),
    ("DELEGATED_EVENTS", "DELEGATED_EVENTS", Shape::Set, From::Dom),
    ("NON_BUBBLING_EVENTS", "NON_BUBBLING_EVENTS", Shape::Set, From::Dom),
    ("channelOf key branches", "INTERCEPTED_NAMES", INTERCEPTED, From::Dom),
    ("attrNameOf propKey exemptions", "SVG_KEBAB_EXEMPT_NAMES", KEBAB_EXEMPT, From::Dom),
    ("ATTR_INTERCEPTED", "ATTR_INTERCEPTED_NAMES", Shape::Record, From::Ssr),
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
    let at = source.find(&header).ok_or_else(|| {
        format!("the runtime no longer declares `{header}`; the generator is stale")
    })?;
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
            // A QUOTED key runs to its closing quote, which is the only way a
            // key may contain the separator: `USER_MUTABLE_PROPS` is keyed
            // `"tag:property"`, and splitting on the first colon read every one
            // of its rows as the tag alone.
            Shape::Record if entry.starts_with('"') || entry.starts_with('\'') => {
                let quote = entry.as_bytes()[0] as char;
                let rest = &entry[1..];
                match rest.find(quote) {
                    Some(close) => rest[..close].to_string(),
                    None => return Err(format!("`{name}` in dom.ts has an unterminated key")),
                }
            }
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

/// The runtime sources a table can be read out of, with the absolute path each
/// was loaded from so the drift test can re-derive them.
pub struct Sources<'a> {
    pub dom: &'a str,
    pub dom_path: &'a str,
    pub ssr: &'a str,
    pub ssr_path: &'a str,
}

impl<'a> Sources<'a> {
    fn text(&self, from: From) -> &'a str {
        match from {
            From::Dom => self.dom,
            From::Ssr => self.ssr,
        }
    }
}

/// The generated module, as text. `build.rs` writes it into `OUT_DIR`, so the
/// tables cannot drift: they are re-derived from the runtime sources on every
/// build that `cargo:rerun-if-changed` triggers.
pub fn render(sources: &Sources<'_>) -> Result<String, String> {
    let Sources { dom_path, ssr_path, .. } = *sources;
    let mut out = String::from(
        "// @generated by build.rs from packages/core/src/{dom,ssr}.ts — do not edit.\n\n",
    );
    out.push_str(&format!(
        "/// Absolute paths the tables below were generated from, so the drift test\n\
         /// can re-derive them without knowing the workspace layout.\n\
         pub const DOM_TS_PATH: &str = {dom_path:?};\n\
         pub const SSR_TS_PATH: &str = {ssr_path:?};\n\n"
    ));
    for (js_name, rust_name, shape, from) in TABLES {
        let file = if from == From::Dom { "dom.ts" } else { "ssr.ts" };
        let entries = extract(sources.text(from), js_name, shape)?;
        out.push_str(&format!(
            "/// `{file}` `{js_name}`, sorted for binary search.\npub const {rust_name}: [&str; {}] = [\n",
            entries.len()
        ));
        for entry in &entries {
            out.push_str(&format!("    {entry:?},\n"));
        }
        out.push_str("];\n\n");
    }
    Ok(out)
}
