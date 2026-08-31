//! One class per declaration, and the merge key that makes passing order win.
//!
//! The same semantics as `@barqjs/css`'s runtime, and deliberately the same
//! NAMES: a class is `a-<property>[-<conditionHash>]_<valueHash>`, so a block
//! this compiles and a block the runtime built for a value only known at run
//! time dedupe against each other instead of emitting the rule twice.
//!
//! That parity is why the hash here is FNV-1a over 32 bits with no padding,
//! rather than the 64-bit one a scoped block's class uses: it is
//! `Math.imul`-shaped so a four-line JavaScript function can produce the same
//! answer, and it is iterated over UTF-16 code units because `charCodeAt` is.

/// Shorthands whose expansion is positional and total: every longhand is set,
/// and which one a value goes to is decided by COUNTING values.
///
/// `border`, `background`, `font`, `flex`, `transition` and the rest are none
/// of those — `border: 1px solid red` puts three values in three sub-properties
/// by TYPE — so they are refused by [`unexpandable`] rather than half-expanded.
const SHORTHANDS: &[(&str, &[&str])] = &[
    ("margin", &["margin-top", "margin-right", "margin-bottom", "margin-left"]),
    ("padding", &["padding-top", "padding-right", "padding-bottom", "padding-left"]),
    ("inset", &["top", "right", "bottom", "left"]),
    (
        "border-width",
        &["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"],
    ),
    (
        "border-style",
        &["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"],
    ),
    (
        "border-color",
        &["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    ),
    (
        "border-radius",
        &[
            "border-top-left-radius",
            "border-top-right-radius",
            "border-bottom-right-radius",
            "border-bottom-left-radius",
        ],
    ),
    ("gap", &["row-gap", "column-gap"]),
    ("overflow", &["overflow-x", "overflow-y"]),
    ("overscroll-behavior", &["overscroll-behavior-x", "overscroll-behavior-y"]),
    ("place-items", &["align-items", "justify-items"]),
    ("place-content", &["align-content", "justify-content"]),
    ("place-self", &["align-self", "justify-self"]),
    ("inset-block", &["inset-block-start", "inset-block-end"]),
    ("inset-inline", &["inset-inline-start", "inset-inline-end"]),
    ("margin-block", &["margin-block-start", "margin-block-end"]),
    ("margin-inline", &["margin-inline-start", "margin-inline-end"]),
    ("padding-block", &["padding-block-start", "padding-block-end"]),
    ("padding-inline", &["padding-inline-start", "padding-inline-end"]),
];

const UNEXPANDABLE: &[&str] = &[
    "animation",
    "background",
    "border",
    "border-block",
    "border-bottom",
    "border-image",
    "border-inline",
    "border-left",
    "border-right",
    "border-top",
    "flex",
    "flex-flow",
    "font",
    "grid",
    "grid-area",
    "grid-column",
    "grid-row",
    "grid-template",
    "list-style",
    "mask",
    "offset",
    "outline",
    "text-decoration",
    "transition",
];

/// Properties whose bare number is a count, not a length.
const UNITLESS: &[&str] = &[
    "animation-iteration-count",
    "aspect-ratio",
    "border-image-outset",
    "border-image-slice",
    "border-image-width",
    "column-count",
    "columns",
    "flex",
    "flex-grow",
    "flex-shrink",
    "font-weight",
    "grid-area",
    "grid-column",
    "grid-column-end",
    "grid-column-start",
    "grid-row",
    "grid-row-end",
    "grid-row-start",
    "line-clamp",
    "line-height",
    "opacity",
    "order",
    "orphans",
    "scale",
    "tab-size",
    "widows",
    "z-index",
    "zoom",
];

pub fn unexpandable(property: &str) -> bool {
    UNEXPANDABLE.contains(&property)
}

pub fn is_unitless(property: &str) -> bool {
    UNITLESS.contains(&property)
}

pub fn kebab(property: &str) -> String {
    if property.starts_with("--") {
        return property.to_string();
    }
    let mut out = String::with_capacity(property.len() + 4);
    let mut previous: Option<char> = None;
    for character in property.chars() {
        if character.is_ascii_uppercase()
            && previous.is_some_and(|last| last.is_ascii_lowercase() || last.is_ascii_digit())
        {
            out.push('-');
        }
        out.extend(character.to_lowercase());
        previous = Some(character);
    }
    out
}

/// A bare number is `px` unless the property counts. `0` is unitless in every
/// property, which is what CSS itself says.
pub fn number_value(property: &str, raw: &str) -> String {
    if raw == "0" || is_unitless(property) { raw.to_string() } else { format!("{raw}px") }
}

/// FNV-1a over 32 bits, base 36, matching `@barqjs/css`'s `hash` minus its
/// leading marker. Iterated over UTF-16 code units because `charCodeAt` is.
pub fn hash32(text: &str) -> String {
    let mut value: u32 = 0x811c_9dc5;
    for unit in text.encode_utf16() {
        value ^= u32::from(unit);
        value = value.wrapping_mul(0x0100_0193);
    }
    base36(value)
}

fn base36(mut value: u32) -> String {
    const ALPHABET: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut digits = Vec::new();
    while value > 0 {
        digits.push(ALPHABET[(value % 36) as usize]);
        value /= 36;
    }
    digits.reverse();
    String::from_utf8(digits).expect("base36 alphabet is ASCII")
}

/// `JSON.stringify` over a flat object of strings and numbers.
///
/// Spelled out because the token group's name is a hash of it and
/// `@barqjs/css` computes that hash from `JSON.stringify(tokens)`. Anything
/// that formatted one byte differently would name the same tokens two things.
pub fn json_object(entries: &[(String, TokenValue)]) -> String {
    let mut out = String::from("{");
    for (index, (key, value)) in entries.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        json_string(key, &mut out);
        out.push(':');
        match value {
            TokenValue::Text(text) => json_string(text, &mut out),
            TokenValue::Number(number) => out.push_str(&number_text(*number)),
        }
    }
    out.push('}');
    out
}

/// What `String(value)` and `JSON.stringify(value)` both print for a number.
pub fn number_text(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e21 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenValue {
    Text(String),
    Number(f64),
}

fn json_string(text: &str, out: &mut String) {
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            control if control < ' ' => out.push_str(&format!("\\u{:04x}", control as u32)),
            other => out.push(other),
        }
    }
    out.push('"');
}

/// The custom property a token becomes, and the `var()` that reads it.
///
/// The group suffix is a hash of the whole token object, so two files declaring
/// the same tokens share them and two whose `brand` differs do not collide —
/// and neither has to know the file it is in.
pub fn token_property(group: &str, token: &str) -> String {
    let safe: String = token
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .collect();
    format!("--{safe}-{group}")
}

/// The custom property a dynamic declaration reads.
///
/// Derived from the property alone, so the compiler and `@barqjs/css`'s runtime
/// agree without either knowing what the other saw — the same reason an atom's
/// class name carries its own merge key.
pub fn dynamic_var(property: &str) -> String {
    format!("--{property}-{}", hash32(property))
}

/// A fallback list as the same declaration repeated, best LAST.
///
/// CSS's own mechanism: a browser keeps the last declaration it understands, so
/// preference order is the reverse of source order.
pub fn fallback(property: &str, values: &[String]) -> String {
    values.iter().rev().cloned().collect::<Vec<_>>().join(&format!(";{property}:"))
}

/// CSS's own 1/2/3/4 box rule, or 1/2 for a two-longhand shorthand.
pub fn expand(property: &str, value: &str) -> Option<Vec<(String, String)>> {
    let longhands = SHORTHANDS.iter().find(|(name, _)| *name == property).map(|(_, list)| *list)?;
    let parts = split_values(value);
    if longhands.len() == 2 {
        return match parts.len() {
            1 => {
                Some(longhands.iter().map(|name| ((*name).to_string(), parts[0].clone())).collect())
            }
            2 => Some(
                longhands
                    .iter()
                    .zip(parts.iter())
                    .map(|(name, part)| ((*name).to_string(), part.clone()))
                    .collect(),
            ),
            _ => None,
        };
    }
    let sides: [&String; 4] = match parts.len() {
        1 => [&parts[0], &parts[0], &parts[0], &parts[0]],
        2 => [&parts[0], &parts[1], &parts[0], &parts[1]],
        3 => [&parts[0], &parts[1], &parts[2], &parts[1]],
        4 => [&parts[0], &parts[1], &parts[2], &parts[3]],
        _ => return None,
    };
    Some(
        longhands
            .iter()
            .zip(sides.iter())
            .map(|(name, side)| ((*name).to_string(), (*side).clone()))
            .collect(),
    )
}

/// Top-level whitespace split, so `calc(1px + 2px)` and `var(--a, b)` stay whole.
fn split_values(value: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    let bytes = value.as_bytes();
    for index in 0..=bytes.len() {
        let at_end = index == bytes.len();
        let byte = if at_end { b' ' } else { bytes[index] };
        match byte {
            b'(' => depth += 1,
            b')' => depth -= 1,
            b' ' | b'\t' | b'\n' | b'\r' if depth == 0 => {
                let part = value[start..index].trim();
                if !part.is_empty() {
                    out.push(part.to_string());
                }
                start = index + 1;
            }
            _ => {}
        }
        if at_end {
            break;
        }
    }
    out
}

/// How an atom is ORDERED against another atom, and nothing more.
///
/// Not a cascade layer, and this used to be one. Layers gave ordering across
/// modules and took away the thing atoms exist for: a layered rule loses to an
/// UNLAYERED one whatever the specificity, so an application's `* { margin: 0 }`
/// beat every `margin` atom on the page — measured in a browser, every margin
/// and padding computing to `0px`. Layering the reset too would have fixed that
/// case and made any plain CSS the application writes beat every atom, which is
/// backwards.
///
/// Specificity does almost all of it on its own: `.a-color_x` is 0-1-0,
/// `.a-color-h_y:hover` is 0-2-0, `.a-content_z::before` is 0-1-1. The only
/// pair specificity cannot separate is a base against the same property under
/// an at-rule, because `@media` adds none — so a module emits its atoms in tier
/// order and that pair is decided.
///
/// Ordering ACROSS modules is not needed and never was: two atoms conflict only
/// when they are merged, merging happens in one `atoms` call, and one call is
/// in one module.
/// `Descendant` comes FIRST, and it is the one tier order decides rather than
/// specificity: a rule a parent writes about its children — `& > *`, `& svg` —
/// and a rule the child writes about itself are both one class. Measured in a
/// browser, a field saying `& > * { width: 100% }` took a label's own
/// `width: fit-content` away and stretched it across the row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    Descendant,
    Base,
    Select,
    Element,
    Media,
}

impl Tier {
    /// The tier's name, for a diagnostic and for the ordering pass's tests.
    ///
    /// A tier is NOT a cascade layer and must not become one. It is a
    /// tie-breaker on top of specificity — CSS decides by specificity first and
    /// order second — and a layer overrides specificity outright. Measured in a
    /// browser: emitting each tier into `@layer barq.ui.<tier>` moved 289
    /// computed values on the gallery, because a parent's
    /// `[data-variant="destructive"] &` at 0-2-0 stopped beating the child's own
    /// 0-1-0 the moment the two sat in different sub-layers. Ordering the rules
    /// moves 8, and every one of them is a rule under an at-rule that was
    /// losing to a base rule another module emitted after it.
    pub fn as_str(self) -> &'static str {
        match self {
            Tier::Descendant => "descendant",
            Tier::Base => "base",
            Tier::Select => "select",
            Tier::Element => "element",
            Tier::Media => "media",
        }
    }
}

/// A condition path, joined. `@media …` outside, `:hover` inside.
///
/// NUL, because it cannot appear in a selector or an at-rule prelude, and
/// because `@barqjs/css` joins with the same byte — the hash is over the joined
/// text, so the two implementations agree without either parsing the other's
/// separator.
pub const NEST: char = '\u{0}';

/// The tier a condition wins in, taken from its MOST specific part: a rule
/// conditioned on both a media query and a pseudo-class is a media rule.
fn tier_of(condition: &str) -> Tier {
    if condition == "default" {
        return Tier::Base;
    }
    if !about_self(condition) {
        return Tier::Descendant;
    }
    let parts = || condition.split(NEST);
    if parts().any(|part| part.starts_with('@')) {
        Tier::Media
    } else if parts().any(|part| part.contains("::")) {
        Tier::Element
    } else {
        Tier::Select
    }
}

/// A selector list, split at the commas that separate its branches.
///
/// Depth-aware, because `:is(a, b)` and `:not(a, b)` both carry a comma that
/// separates nothing.
fn branches(part: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (index, character) in part.char_indices() {
        match character {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                out.push(part[start..index].trim());
                start = index + 1;
            }
            _ => {}
        }
    }
    out.push(part[start..].trim());
    out
}

/// One branch of a condition, applied to one selector built so far.
///
/// EVERY branch of a list gets the treatment, and that is the whole reason this
/// is a function. `"[data-expanded], &[data-open]"` used to be substituted as
/// one string: the `&` in the second branch matched, so the first branch was
/// left as a bare `[data-expanded]` and the rule painted every element on the
/// page carrying that attribute. Measured in a browser on `@barqjs/ui`'s
/// menubar, where it took an accordion trigger's background. `atoms.ts` joins
/// them the same way.
fn extend(selector: &str, branch: &str) -> String {
    if branch.contains('&') {
        branch.replace('&', selector)
    } else if branch.starts_with(':') || branch.starts_with('[') {
        format!("{selector}{branch}")
    } else {
        format!("{selector} {branch}")
    }
}

/// The selectors a condition's non-at-rule parts build from `seed`.
fn selectors(condition: &str, seed: &str) -> Vec<String> {
    let mut out = vec![seed.to_string()];
    for part in condition.split(NEST).filter(|part| !part.starts_with('@')) {
        out = out
            .iter()
            .flat_map(|selector| {
                branches(part).into_iter().map(move |branch| extend(selector, branch))
            })
            .collect();
    }
    out
}

/// Whether a condition's subject is this element, or something under it.
///
/// A rule a parent writes about its children and a rule the child writes about
/// itself are both one class, so nothing separates them but which came last.
/// The child's own rule is the more specific intent, so the parent's sorts
/// first and loses the tie. `atoms.ts` decides it the same way.
///
/// A list is about a descendant when ANY of its branches is: the rule reaches
/// something under the element, whatever the rest of it does.
fn about_self(condition: &str) -> bool {
    selectors(condition, "&").iter().all(|selector| {
        let at = selector.rfind('&').map_or(0, |index| index + 1);
        let mut depth = 0i32;
        for character in selector[at..].chars() {
            match character {
                '(' | '[' => depth += 1,
                ')' | ']' => depth -= 1,
                ' ' | '>' | '+' | '~' if depth == 0 => return false,
                _ => {}
            }
        }
        true
    })
}

impl Atom {
    /// The rule without the `@layer` wrapper `atom_in` put on it, for a test
    /// assembling a layer by hand.
    #[cfg(test)]
    pub(crate) fn rule_body(&self) -> &str {
        match self.rule.strip_prefix("@layer ") {
            Some(rest) => match rest.find('{') {
                Some(brace) => &rest[brace + 1..self.rule.len() - "@layer ".len() - 1],
                None => &self.rule,
            },
            None => &self.rule,
        }
    }
}

/// One declaration, as a class, a merge key and a rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Atom {
    pub class: String,
    /// Everything a later declaration has to replace: the class up to its value.
    pub key: String,
    pub rule: String,
    /// Where this rule sorts against another atom's, within one module.
    pub tier: Tier,
}

pub fn atom(property: &str, condition: &str, value: &str) -> Atom {
    atom_in("", property, condition, value)
}

/// What a class already in a class string merges against.
///
/// An atom carries its property, so `a-color_1n4k2p0` is replaced by any later
/// `color`. A class that is NOT one of ours — an application's own, arriving
/// through a `class` prop — carries no property and has nothing to merge
/// against, so it stands for itself and survives whatever follows it.
pub fn merge_key(class: &str) -> String {
    match class.rfind('_') {
        Some(cut) if class.starts_with("a-") => class[..cut].to_string(),
        _ => class.to_string(),
    }
}

/// The same, inside a cascade layer.
///
/// For a component LIBRARY, whose rules are meant to lose to an application's.
/// The layer joins the atom's identity through the suffix, because one class
/// name cannot carry a layered rule and an unlayered one.
pub fn atom_in(layer: &str, property: &str, condition: &str, value: &str) -> Atom {
    let name = if let Some(rest) = property.strip_prefix("--") {
        format!("var-{rest}")
    } else {
        property.to_string()
    };
    let key = if condition == "default" {
        format!("a-{name}")
    } else {
        format!("a-{name}-{}", hash32(condition))
    };
    // The suffix hashes the VALUE, and nothing else. The key already carries
    // the property and the condition, so the value is all that is left to tell
    // two atoms of one key apart — and hashing it alone means every atom
    // holding that value ends in the same token, which a compressor reads as a
    // back-reference rather than as noise. `atoms.ts` computes the same name;
    // a compiled call and a runtime one have to agree or one declaration
    // reaches the page as two classes.
    let class = format!(
        "{key}_{}",
        if layer.is_empty() { hash32(value) } else { hash32(&format!("{layer}|{value}")) }
    );
    let declaration = format!("{property}:{value}");
    // At-rules wrap from the outside in; the selector parts all apply to the
    // one class, so they concatenate.
    let seed = format!(".{class}");
    let mut inner =
        if condition == "default" { seed } else { selectors(condition, &seed).join(",") };
    inner = format!("{inner}{{{declaration}}}");
    if condition != "default" {
        for part in condition
            .split(NEST)
            .filter(|part| part.starts_with('@'))
            .collect::<Vec<_>>()
            .iter()
            .rev()
        {
            inner = format!("{part}{{{inner}}}");
        }
    }
    let tier = tier_of(condition);
    if !layer.is_empty() {
        inner = format!("@layer {layer}{{{inner}}}");
    }
    Atom { class, key, rule: inner, tier }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kebab_leaves_a_custom_property_alone() {
        assert_eq!(kebab("marginTop"), "margin-top");
        assert_eq!(kebab("color"), "color");
        assert_eq!(kebab("--brand"), "--brand");
        assert_eq!(kebab("gridColumn2"), "grid-column2");
    }

    #[test]
    fn a_bare_number_is_px_unless_the_property_counts() {
        assert_eq!(number_value("width", "2"), "2px");
        assert_eq!(number_value("line-height", "2"), "2");
        assert_eq!(number_value("width", "0"), "0");
    }

    #[test]
    fn a_box_shorthand_follows_the_1_2_3_4_rule() {
        let one = expand("padding", "4px").expect("expands");
        assert_eq!(one.len(), 4);
        assert!(one.iter().all(|(_, value)| value == "4px"));
        let three = expand("margin", "1px 2px 3px").expect("expands");
        assert_eq!(three[3], ("margin-left".to_string(), "2px".to_string()));
        assert_eq!(expand("gap", "1px 2px").expect("expands").len(), 2);
        assert_eq!(expand("color", "red"), None);
    }

    /// The values would otherwise be counted as three and go to three sides.
    #[test]
    fn a_function_call_in_a_value_stays_one_value() {
        let expanded = expand("margin", "calc(1px + 2px) var(--gap, 3px)").expect("expands");
        assert_eq!(expanded[0].1, "calc(1px + 2px)");
        assert_eq!(expanded[1].1, "var(--gap, 3px)");
    }

    #[test]
    fn a_shorthand_that_cannot_be_counted_is_named() {
        assert!(unexpandable("border"));
        assert!(unexpandable("background"));
        assert!(!unexpandable("margin"));
    }

    #[test]
    fn the_key_is_the_class_up_to_its_value() {
        let red = atom("color", "default", "red");
        let blue = atom("color", "default", "blue");
        assert_eq!(red.key, blue.key);
        assert_ne!(red.class, blue.class);
        assert_eq!(red.class, format!("{}_{}", red.key, red.class.rsplit('_').next().unwrap()));
    }

    /// `build` in `atoms.ts` keys a class on itself unless it is one of ours,
    /// and this has to agree: keyed on a slice, `my-button` and `my-badge`
    /// would collide the moment both reached one call, and the compiler used to
    /// drop such a class outright.
    #[test]
    fn a_class_that_is_not_an_atom_merges_against_itself() {
        assert_eq!(merge_key("a-color_i0tgik"), "a-color");
        assert_eq!(merge_key("a-color-doumed_10cd4ul"), "a-color-doumed");
        assert_eq!(merge_key("my-button"), "my-button");
        assert_eq!(merge_key("my_button"), "my_button");
        assert_eq!(merge_key("b1n4k2p0"), "b1n4k2p0");
    }

    #[test]
    fn a_condition_has_its_own_key_so_it_replaces_nothing() {
        assert_ne!(atom("color", "default", "red").key, atom("color", ":hover", "red").key);
    }

    /// The names `@barqjs/css`'s runtime produces for the same declarations,
    /// pinned here.
    ///
    /// They MUST agree: a compiled block and a block the runtime built for a
    /// value only known at run time both set the same property, and a class
    /// each would emit the same rule twice under two names. This table is what
    /// makes the two implementations one semantic rather than two that look
    /// alike; `packages/css/src/ergonomics.test.ts` pins the same values from
    /// the other side.
    #[test]
    fn json_matches_what_the_runtime_hashes() {
        let entries = vec![
            ("brand".to_string(), TokenValue::Text("#3b82f6".to_string())),
            ("gap".to_string(), TokenValue::Number(8.0)),
        ];
        assert_eq!(json_object(&entries), r##"{"brand":"#3b82f6","gap":8}"##);
        assert_eq!(number_text(8.0), "8");
        assert_eq!(number_text(8.5), "8.5");
    }

    /// Two atoms of one value share their suffix, which is what makes the
    /// stylesheet compress: a shorthand expands to four longhands over one
    /// value, and three of the four suffixes are then back-references.
    #[test]
    fn one_value_is_one_suffix() {
        let top = atom("border-top-width", "default", "3px");
        let right = atom("border-right-width", "default", "3px");
        let outline = atom("outline-width", "default", "3px");
        let suffix = |atom: &Atom| atom.class.rsplit('_').next().unwrap().to_string();
        assert_eq!(suffix(&top), suffix(&right));
        assert_eq!(suffix(&top), suffix(&outline));
        // And the key still tells them apart, so they do not merge.
        assert_ne!(top.key, right.key);
        assert_ne!(top.class, right.class);
    }

    /// A rule about a child sorts before the child's own, and loses the tie.
    #[test]
    fn a_rule_about_a_child_sorts_first() {
        assert_eq!(tier_of("& > *"), Tier::Descendant);
        assert_eq!(tier_of("& svg"), Tier::Descendant);
        assert!(Tier::Descendant < Tier::Base);
        // A condition about this element is not one, however deep the brackets.
        assert_eq!(tier_of(":has(> [data-slot=\"field\"])"), Tier::Select);
        assert_eq!(tier_of(":hover"), Tier::Select);
    }

    #[test]
    fn the_names_match_the_runtime_exactly() {
        let cases = [
            (("color", "default", "red"), "a-color_i0tgik"),
            (("margin-top", "default", "8px"), "a-margin-top_1dzhg7"),
            (("line-height", "default", "2"), "a-line-height_f9vgt1"),
            (("--brand", "default", "#3b82f6"), "a-var-brand_12y16pd"),
            (("color", ":hover", "blue"), "a-color-doumed_10cd4ul"),
            (("color", "@media (min-width: 600px)", "green"), "a-color-1dkfo85_b5mm4"),
        ];
        for ((property, condition, value), expected) in cases {
            assert_eq!(atom(property, condition, value).class, expected, "{property} {condition}");
        }
    }

    /// Every branch of a selector list gets the class, and the one that had no
    /// `&` used to lose it: `part.replace('&', …)` matched the second branch
    /// and left the first as a bare `[data-expanded]`, which is a rule about
    /// every element on the page carrying that attribute. Measured in a
    /// browser, it took an accordion trigger's background from three sections
    /// away.
    #[test]
    fn every_branch_of_a_selector_list_carries_the_class() {
        let listed = atom("background-color", "[data-expanded], &[data-open]", "red");
        assert_eq!(
            listed.rule,
            format!(
                ".{class}[data-expanded],.{class}[data-open]{{background-color:red}}",
                class = listed.class
            )
        );
        // And a branch written the explicit way is the same rule.
        let explicit = atom("background-color", "&[data-expanded], &[data-open]", "red");
        assert_eq!(
            explicit.rule.replace(&explicit.class, "X"),
            listed.rule.replace(&listed.class, "X")
        );
    }

    /// A comma inside `:is()` separates nothing.
    #[test]
    fn a_comma_inside_a_functional_pseudo_class_is_not_a_branch() {
        let atom = atom("color", ":is(.dark, .night) &", "red");
        assert_eq!(atom.rule, format!(":is(.dark, .night) .{}{{color:red}}", atom.class));
        assert_eq!(atom.tier, Tier::Select, "the subject is still this element");
    }

    /// A list whose branches are about a descendant sorts as one, so a parent's
    /// rule still loses the tie to the child's own.
    #[test]
    fn a_list_is_a_descendant_when_any_branch_is() {
        assert_eq!(atom("color", "& > *, &:hover", "red").tier, Tier::Descendant);
        assert_eq!(atom("color", "&:focus, &:hover", "red").tier, Tier::Select);
    }

    /// A later part applies to every branch the earlier one produced.
    #[test]
    fn a_nested_condition_reaches_every_branch_of_the_list() {
        let condition = format!("[data-a], &[data-b]{NEST}:hover");
        let atom = atom("color", &condition, "red");
        assert_eq!(
            atom.rule,
            format!(
                ".{class}[data-a]:hover,.{class}[data-b]:hover{{color:red}}",
                class = atom.class
            )
        );
    }

    #[test]
    fn each_condition_shape_produces_the_rule_it_should() {
        let base = atom("color", "default", "red");
        assert_eq!(base.rule, format!(".{}{{color:red}}", base.class));
        let hover = atom("color", ":hover", "blue");
        assert_eq!(hover.rule, format!(".{}:hover{{color:blue}}", hover.class));
        let wide = atom("color", "@media (min-width: 600px)", "green");
        assert_eq!(
            wide.rule,
            format!("@media (min-width: 600px){{.{}{{color:green}}}}", wide.class)
        );
        let dark = atom("color", ".dark &", "white");
        assert_eq!(dark.rule, format!(".dark .{}{{color:white}}", dark.class));
    }

    /// Specificity does almost all the ordering on its own: `:hover` is 0-2-0
    /// against the base's 0-1-0, and `::before` is 0-1-1. The tier exists for
    /// the one pair it cannot separate — a base against the same property under
    /// an at-rule, because `@media` adds no specificity.
    #[test]
    fn the_tier_orders_what_specificity_cannot() {
        assert_eq!(atom("color", "default", "a").tier, Tier::Base);
        assert_eq!(atom("color", ":hover", "a").tier, Tier::Select);
        assert_eq!(atom("color", "::before", "a").tier, Tier::Element);
        assert_eq!(atom("color", "@media print", "a").tier, Tier::Media);
        assert!(Tier::Base < Tier::Media);
        let both = format!("@media print{NEST}:hover");
        assert_eq!(atom("color", &both, "a").tier, Tier::Media);
    }

    /// No `@layer` anywhere. A layered rule loses to an UNLAYERED one whatever
    /// the specificity, which is how an application's `* { margin: 0 }` came to
    /// beat every `margin` atom on the page.
    #[test]
    fn nothing_is_wrapped_in_a_cascade_layer() {
        for condition in ["default", ":hover", "::before", "@media print"] {
            assert!(!atom("color", condition, "red").rule.contains("@layer"), "{condition}");
        }
    }
}
