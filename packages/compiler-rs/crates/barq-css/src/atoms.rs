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
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    Base,
    Select,
    Element,
    Media,
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
    let parts = || condition.split(NEST);
    if parts().any(|part| part.starts_with('@')) {
        Tier::Media
    } else if parts().any(|part| part.contains("::")) {
        Tier::Element
    } else {
        Tier::Select
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
    let class = format!("{key}_{}", hash32(&format!("{property}|{condition}|{value}")));
    let declaration = format!("{property}:{value}");
    // At-rules wrap from the outside in; the selector parts all apply to the
    // one class, so they concatenate.
    let parts: Vec<&str> =
        if condition == "default" { Vec::new() } else { condition.split(NEST).collect() };
    let mut inner = format!(".{class}");
    for part in parts.iter().filter(|part| !part.starts_with('@')) {
        inner = if part.contains('&') {
            part.replace('&', &inner)
        } else if part.starts_with(':') || part.starts_with('[') {
            format!("{inner}{part}")
        } else {
            format!("{inner} {part}")
        };
    }
    inner = format!("{inner}{{{declaration}}}");
    for part in parts.iter().filter(|part| part.starts_with('@')).rev() {
        inner = format!("{part}{{{inner}}}");
    }
    Atom { class, key, rule: inner, tier: tier_of(condition) }
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

    #[test]
    fn the_names_match_the_runtime_exactly() {
        let cases = [
            (("color", "default", "red"), "a-color_1sew0by"),
            (("margin-top", "default", "8px"), "a-margin-top_zpmxs0"),
            (("line-height", "default", "2"), "a-line-height_5xmq2e"),
            (("--brand", "default", "#3b82f6"), "a-var-brand_hdvzb3"),
            (("color", ":hover", "blue"), "a-color-doumed_63189g"),
            (("color", "@media (min-width: 600px)", "green"), "a-color-1dkfo85_131k155"),
        ];
        for ((property, condition, value), expected) in cases {
            assert_eq!(atom(property, condition, value).class, expected, "{property} {condition}");
        }
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
