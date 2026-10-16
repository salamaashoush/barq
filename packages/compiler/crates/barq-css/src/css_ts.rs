//! Shared by `build.rs` (via `#[path]`) and by the drift test, so the generator
//! and the check can never disagree about what the runtime says.
//!
//! `@barqjs/css` decides what a shorthand expands to, which properties count,
//! and which longhands land on one side of the box. A declaration this crate
//! folded and one the runtime evaluated have to be the same class and the same
//! rule, so those tables are read out of the runtime's source rather than
//! written a second time here.

/// A literal as the runtime wrote it: a string, a list or a record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Literal {
    Text(String),
    List(Vec<Literal>),
    Record(Vec<(String, Literal)>),
}

/// The value `const NAME` is initialised to, through a `new Set(…)` around it.
///
/// `Err` rather than an empty table: a rename in the runtime must break the
/// build, not produce a compiler that expands nothing.
pub fn constant(source: &str, name: &str) -> Result<Literal, String> {
    let header = format!("const {name}");
    let at = source
        .match_indices(&header)
        .map(|(index, _)| index + header.len())
        .find(|end| source[*end..].starts_with([':', ' ', '=']))
        .ok_or_else(|| {
            format!("the runtime does not declare `{header}`; the generator is stale")
        })?;
    let equals = source[at..]
        .find(" = ")
        .ok_or_else(|| format!("`{name}` is declared without an initialiser"))?;
    let mut reader = Reader { text: &source[at + equals + " = ".len()..], at: 0 };
    reader.skip();
    let wrapped = reader.take("new Set(") || reader.take("new Map(");
    let value = reader.value().map_err(|error| format!("`{name}`: {error}"))?;
    if wrapped {
        reader.skip();
        if !reader.take(")") {
            return Err(format!("`{name}`: its constructor call is not closed"));
        }
    }
    Ok(value)
}

struct Reader<'a> {
    text: &'a str,
    at: usize,
}

impl<'a> Reader<'a> {
    fn rest(&self) -> &'a str {
        &self.text[self.at..]
    }

    /// Past whitespace and `//` and `/* */` comments.
    fn skip(&mut self) {
        loop {
            let rest = self.rest();
            let trimmed = rest.trim_start();
            self.at += rest.len() - trimmed.len();
            if let Some(comment) = trimmed.strip_prefix("//") {
                self.at += 2 + comment.find('\n').unwrap_or(comment.len());
            } else if let Some(comment) = trimmed.strip_prefix("/*") {
                self.at += 2 + comment.find("*/").map_or(comment.len(), |end| end + 2);
            } else {
                return;
            }
        }
    }

    fn take(&mut self, token: &str) -> bool {
        let found = self.rest().starts_with(token);
        if found {
            self.at += token.len();
        }
        found
    }

    fn value(&mut self) -> Result<Literal, String> {
        self.skip();
        match self.rest().chars().next() {
            Some('"' | '\'') => self.string().map(Literal::Text),
            Some('[') => {
                self.at += 1;
                let mut items = Vec::new();
                loop {
                    self.skip();
                    if self.take("]") {
                        return Ok(Literal::List(items));
                    }
                    items.push(self.value()?);
                    self.skip();
                    if !self.take(",") && !self.rest().starts_with(']') {
                        return Err("a list entry is followed by neither `,` nor `]`".to_string());
                    }
                }
            }
            Some('{') => {
                self.at += 1;
                let mut entries = Vec::new();
                loop {
                    self.skip();
                    if self.take("}") {
                        return Ok(Literal::Record(entries));
                    }
                    let key = match self.rest().chars().next() {
                        Some('"' | '\'') => self.string()?,
                        _ => self.identifier()?,
                    };
                    self.skip();
                    if !self.take(":") {
                        return Err(format!("the key `{key}` has no value"));
                    }
                    let value = self.value()?;
                    self.skip();
                    if !self.take(",") && !self.rest().starts_with('}') {
                        return Err(format!("`{key}` is followed by neither `,` nor `}}`"));
                    }
                    entries.push((key, value));
                }
            }
            other => Err(format!("expected a string, a list or a record, found {other:?}")),
        }
    }

    fn string(&mut self) -> Result<String, String> {
        let rest = self.rest();
        let quote = rest.chars().next().unwrap_or('"');
        let close =
            rest[1..].find(quote).ok_or_else(|| "a string is not terminated".to_string())?;
        let text = &rest[1..=close];
        if text.contains('\\') {
            return Err(format!("the string `{text}` carries an escape this reader does not"));
        }
        self.at += close + 2;
        Ok(text.to_string())
    }

    fn identifier(&mut self) -> Result<String, String> {
        let rest = self.rest();
        let end = rest
            .find(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
            .unwrap_or(rest.len());
        if end == 0 {
            return Err("expected a key".to_string());
        }
        self.at += end;
        Ok(rest[..end].to_string())
    }
}

fn texts(literal: &Literal, name: &str) -> Result<Vec<String>, String> {
    let Literal::List(items) = literal else {
        return Err(format!("`{name}` is not a list of strings"));
    };
    items
        .iter()
        .map(|item| match item {
            Literal::Text(text) => Ok(text.clone()),
            _ => Err(format!("`{name}` holds something that is not a string")),
        })
        .collect()
}

/// A `Set` of strings, sorted so the Rust side is a binary search.
pub fn set(source: &str, name: &str) -> Result<Vec<String>, String> {
    let mut out = texts(&constant(source, name)?, name)?;
    if out.is_empty() {
        return Err(format!("`{name}` came out empty"));
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// A record of string lists, in the order the runtime wrote it.
pub fn record(source: &str, name: &str) -> Result<Vec<(String, Vec<String>)>, String> {
    let Literal::Record(entries) = constant(source, name)? else {
        return Err(format!("`{name}` is not a record"));
    };
    if entries.is_empty() {
        return Err(format!("`{name}` came out empty"));
    }
    entries.iter().map(|(key, value)| Ok((key.clone(), texts(value, key)?))).collect()
}

/// `AXES` as what each longhand displaces: the other half of its own row.
pub fn displaces(source: &str) -> Result<Vec<(String, Vec<String>)>, String> {
    let Literal::List(rows) = constant(source, "AXES")? else {
        return Err("`AXES` is not a list of rows".to_string());
    };
    let mut out = Vec::new();
    for row in &rows {
        let Literal::List(halves) = row else {
            return Err("an `AXES` row is not a pair".to_string());
        };
        let [physical, logical] = halves.as_slice() else {
            return Err("an `AXES` row is not a pair".to_string());
        };
        let (physical, logical) = (texts(physical, "AXES")?, texts(logical, "AXES")?);
        out.extend(physical.iter().map(|name| (name.clone(), logical.clone())));
        out.extend(logical.iter().map(|name| (name.clone(), physical.clone())));
    }
    if out.is_empty() {
        return Err("`AXES` came out empty".to_string());
    }
    out.sort();
    Ok(out)
}

/// The runtime sources the tables are read out of.
pub struct Sources<'a> {
    /// `packages/css/src/atoms.ts`
    pub atoms: &'a str,
    /// `packages/css/src/shorthands.ts`
    pub shorthands: &'a str,
}

/// The generated module, as text. `build.rs` writes it into `OUT_DIR`, so the
/// tables cannot drift: they are re-derived from the runtime sources on every
/// build that `cargo:rerun-if-changed` triggers.
pub fn render(sources: &Sources<'_>) -> Result<String, String> {
    let mut out = String::from(
        "// @generated by build.rs from packages/css/src/{atoms,shorthands}.ts — do not edit.\n\n",
    );
    for (file, name, entries) in [
        ("atoms.ts", "UNITLESS", set(sources.atoms, "UNITLESS")?),
        ("shorthands.ts", "UNEXPANDABLE", set(sources.shorthands, "UNEXPANDABLE")?),
    ] {
        out.push_str(&format!(
            "/// `{file}` `{name}`, sorted for binary search.\npub const {name}: [&str; {}] = [\n",
            entries.len()
        ));
        for entry in &entries {
            out.push_str(&format!("    {entry:?},\n"));
        }
        out.push_str("];\n\n");
    }
    for (comment, name, entries) in [
        (
            "`shorthands.ts` `SHORTHANDS`, in the order the runtime wrote it.",
            "SHORTHANDS",
            record(sources.shorthands, "SHORTHANDS")?,
        ),
        (
            "`shorthands.ts` `AXES` as `DISPLACES`, sorted for binary search.",
            "DISPLACES",
            displaces(sources.shorthands)?,
        ),
    ] {
        out.push_str(&format!(
            "/// {comment}\npub const {name}: [(&str, &[&str]); {}] = [\n",
            entries.len()
        ));
        for (key, values) in &entries {
            out.push_str(&format!("    ({key:?}, &{values:?}),\n"));
        }
        out.push_str("];\n\n");
    }
    Ok(out)
}
