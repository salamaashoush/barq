use oxc::allocator::Allocator;

pub use crate::tables::{is_dom_prop, is_svg_tag};

/// `setElementAttr`'s first two lines (`dom.ts:474`).
pub fn normalize(name: &str) -> &str {
    match name {
        "className" => "class",
        "htmlFor" => "for",
        other => other,
    }
}

/// `toKebabCase` (`dom.ts:216`): `/([a-z])([A-Z])/g -> $1-$2`, then lowercase.
pub fn to_kebab<'a>(name: &str, allocator: &'a Allocator) -> &'a str {
    let bytes = name.as_bytes();
    let mut out = String::with_capacity(name.len() + 4);
    for (index, &byte) in bytes.iter().enumerate() {
        if byte.is_ascii_uppercase()
            && index > 0
            && bytes[index - 1].is_ascii_lowercase()
            && !out.is_empty()
        {
            out.push('-');
        }
        out.push(byte.to_ascii_lowercase() as char);
    }
    allocator.alloc_str(&out)
}

/// `setElementAttr` kebab-cases every SVG attribute except `class` and
/// `viewBox` (`dom.ts:481`).
pub fn attr_name<'a>(name: &'a str, is_svg: bool, allocator: &'a Allocator) -> &'a str {
    let name = normalize(name);
    if is_svg && reaches_set_element_attr(name) && name.bytes().any(|b| b.is_ascii_uppercase()) {
        return to_kebab(name, allocator);
    }
    name
}

/// `applyProp` and `applyResolvedProp` intercept these before `setElementAttr`
/// ever sees them, so kebab-casing one produces a name the runtime no longer
/// recognises — `on-click` is not an event, and the emitted name is what
/// `setProp` is handed. Both name sets are derived from `dom.ts` by `build.rs`,
/// so neither can drift the way a transcribed copy could.
fn reaches_set_element_attr(name: &str) -> bool {
    !(name.starts_with("on")
        || crate::tables::is_intercepted(name)
        || crate::tables::is_svg_kebab_exempt(name))
}

/// Whether the runtime writes this name with `setAttribute` on an element in
/// this namespace — the ONE question P1 and P3 Fold both have to answer, and
/// the one two separate copies disagreed about: `channel()` ignored the
/// namespace, so a literal on an SVG element missed a fold P1 permits.
pub fn attribute_channel(name: &str, is_svg: bool) -> bool {
    // `applyProp`'s test is `key[0] === "o" && key[1] === "n"`, so `once` binds
    // a `ce` listener and a baked `once=""` would never reach the DOM.
    if name.starts_with("on") || name == "children" {
        return false;
    }
    // `DOM_PROPS` are written as PROPERTIES — baking `value="x"` sets only the
    // default attribute and diverges on a dirty form field. The runtime takes
    // that branch only under `!isSvg` (`dom.ts:581`).
    !(!is_svg && is_dom_prop(name))
}

/// Names whose write REPLACES everything under the element. `createElement`
/// applies its props before it appends the children (`dom.ts:328`), so the
/// children win; a template bakes the children in first and the patch that
/// follows the clone deletes them.
pub fn replaces_children(name: &str) -> bool {
    matches!(normalize(name), "dangerouslySetInnerHTML" | "innerHTML" | "innerText" | "textContent")
}

/// Whether a SOURCE-literal attribute value may be written into the template
/// HTML. `class` is the one intercepted name P1 bakes: `classToString` returns
/// a string unchanged, so the parsed attribute and `element.className = …`
/// produce the same bytes. The rest reach the DOM through `setProp`, which is
/// the un-compiled path byte for byte — and for `style` P3 folds it anyway,
/// once the analysis has proved the value really is a string.
pub fn bakeable(name: &str, is_svg: bool) -> bool {
    if !attribute_channel(name, is_svg) {
        return false;
    }
    !crate::tables::is_intercepted(name) || matches!(name, "class" | "className")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn svg_and_dom_prop_membership_matches_dom_ts() {
        assert!(is_svg_tag("svg") && is_svg_tag("feTurbulence") && is_svg_tag("path"));
        assert!(!is_svg_tag("div") && !is_svg_tag("math"));
        assert!(is_dom_prop("value") && is_dom_prop("readOnly") && is_dom_prop("innerHTML"));
        assert!(!is_dom_prop("class") && !is_dom_prop("href"));
    }

    #[test]
    fn kebab_matches_the_runtime_regex() {
        let allocator = Allocator::new();
        assert_eq!(to_kebab("strokeWidth", &allocator), "stroke-width");
        assert_eq!(to_kebab("stroke-width", &allocator), "stroke-width");
        assert_eq!(to_kebab("viewBox", &allocator), "view-box");
        assert_eq!(to_kebab("cx", &allocator), "cx");
        assert_eq!(to_kebab("ABC", &allocator), "abc");
    }

    #[test]
    fn svg_attribute_names_keep_the_two_documented_exemptions() {
        let allocator = Allocator::new();
        assert_eq!(attr_name("viewBox", true, &allocator), "viewBox");
        assert_eq!(attr_name("class", true, &allocator), "class");
        assert_eq!(attr_name("strokeWidth", true, &allocator), "stroke-width");
        assert_eq!(attr_name("strokeWidth", false, &allocator), "strokeWidth");
        assert_eq!(attr_name("className", false, &allocator), "class");
        assert_eq!(attr_name("htmlFor", false, &allocator), "for");
    }

    #[test]
    fn a_name_the_runtime_intercepts_is_never_kebab_cased_on_svg() {
        // `setProp(el, "on-click", h)` binds an event called "-click".
        let allocator = Allocator::new();
        assert_eq!(attr_name("onClick", true, &allocator), "onClick");
        assert_eq!(attr_name("classList", true, &allocator), "classList");
        assert_eq!(
            attr_name("dangerouslySetInnerHTML", true, &allocator),
            "dangerouslySetInnerHTML"
        );
        assert_eq!(attr_name("className", true, &allocator), "class");
        assert_eq!(attr_name("strokeWidth", true, &allocator), "stroke-width");
    }

    #[test]
    fn a_property_channel_name_never_reaches_the_template() {
        assert!(!bakeable("value", false));
        assert!(!bakeable("disabled", false));
        // On an SVG element the runtime skips the DOM_PROPS branch entirely.
        assert!(bakeable("value", true));
        assert!(!bakeable("style", false));
        assert!(!bakeable("onClick", false));
        assert!(!bakeable("ref", false));
        assert!(!bakeable("classList", false));
        assert!(!bakeable("classList", true));
        assert!(!bakeable("dangerouslySetInnerHTML", true));
        assert!(bakeable("class", false));
        assert!(bakeable("class", true));
        assert!(bakeable("viewBox", true));
        assert!(bakeable("data-kind", false));
    }
}
