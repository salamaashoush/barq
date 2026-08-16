use oxc::allocator::Allocator;

use crate::ir::Chan;

pub use crate::tables::{is_dom_prop, is_math_tag, is_svg_tag};

/// What a `namespace:name` attribute means. The prefix is the author overriding
/// a decision the compiler would otherwise take from the name (§3.12), and it is
/// the whole custom-element story: a name the compiler cannot classify has no
/// correct default, so the author gets to say.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Prefixed<'a> {
    /// no prefix, or one that names nothing this compiler knows
    Plain(&'a str),
    /// `prop:` / `attr:` / `bool:` / `style:` — a forced value channel
    Chan(&'a str, Chan),
    /// `on:` — a verbatim event name, with NO lowercasing
    Event(&'a str),
    /// `bind:x` — the two-way channel; `bind:this` is a ref
    Bind(&'a str),
    Ref,
}

/// `dom.ts::setProp`'s prefix switch, in Rust. Both paths have to accept the
/// same source or the differential against the un-compiled oracle is measuring
/// two languages.
pub fn prefixed(name: &str) -> Prefixed<'_> {
    if name == "ref" {
        return Prefixed::Ref;
    }
    let Some(colon) = name.find(':') else { return Prefixed::Plain(name) };
    if colon == 0 {
        return Prefixed::Plain(name);
    }
    let rest = &name[colon + 1..];
    match &name[..colon] {
        "prop" => Prefixed::Chan(rest, Chan::Prop),
        "attr" => Prefixed::Chan(rest, Chan::Attr),
        "bool" => Prefixed::Chan(rest, Chan::Bool),
        "style" => Prefixed::Chan(rest, Chan::StyleProp),
        "on" => Prefixed::Event(rest),
        "bind" if rest == "this" => Prefixed::Ref,
        "bind" => Prefixed::Bind(rest),
        // `xlink:href` and friends: a name with a colon the runtime writes
        // verbatim, exactly as it does today.
        _ => Prefixed::Plain(name),
    }
}

/// `dom.ts::channelOf`, in Rust. The one question the compiled path answers here
/// instead of at run time.
pub fn channel_of(name: &str, is_svg: bool, tag: &str) -> Chan {
    match name {
        "class" | "className" => Chan::Class,
        "style" => Chan::Style,
        "classList" => Chan::ClassList,
        "dangerouslySetInnerHTML" => Chan::Html,
        // §3.13 item 8's third parser fact — see `state_attribute`.
        _ if state_attribute(name, tag) => Chan::Attr,
        // §3.10.1 before the plain property channel: these are properties too,
        // and what separates them is who else writes them.
        _ if !is_svg && crate::tables::is_user_mutable(tag, name) => Chan::Live,
        _ if !is_svg && is_dom_prop(name) => Chan::Prop,
        _ => Chan::Attr,
    }
}

/// `dom.ts::bindChannelOf`. `<input type="number">` writes `valueAsNumber` and
/// reports on `input`; a checkbox writes `checked` and reports on `change`.
pub fn bind_channel<'a>(
    name: &'a str,
    tag: &str,
    input_type: Option<&str>,
    editable: bool,
) -> (&'a str, &'a str) {
    if name == "group" {
        return ("group", "change");
    }
    if name == "files" {
        return ("files", "change");
    }
    if name != "value" {
        return (name, if name == "open" { "toggle" } else { "change" });
    }
    if tag == "select" {
        return ("value", "change");
    }
    if tag != "input" && tag != "textarea" {
        // A contenteditable host has no `value`. Its TEXT is the channel, and
        // `input` is the event it reports an edit on exactly as a field does.
        return if editable { ("textContent", "input") } else { ("value", "input") };
    }
    match input_type {
        Some("checkbox") | Some("radio") => ("checked", "change"),
        Some("number") | Some("range") => ("valueAsNumber", "input"),
        Some("date") | Some("month") | Some("week") | Some("time") => ("valueAsDate", "input"),
        _ => ("value", "input"),
    }
}

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
pub fn attribute_channel(name: &str, is_svg: bool, tag: &str) -> bool {
    // `applyProp`'s test is `key[0] === "o" && key[1] === "n"`, so `once` binds
    // a `ce` listener and a baked `once=""` would never reach the DOM.
    if name.starts_with("on") || name == "children" {
        return false;
    }
    if state_attribute(name, tag) {
        return true;
    }
    // `DOM_PROPS` are written as PROPERTIES — baking `value="x"` sets only the
    // default attribute and diverges on a dirty form field.
    !(!is_svg && is_dom_prop(name))
}

/// The DOM_PROPS whose ATTRIBUTE carries the state rather than a default, so
/// baking one into the template is not the `value="x"` divergence above.
///
/// `multiple` is the whole list, and it is here because of §3.13 item 8: a
/// `<select>` runs "ask for a reset" as each `<option>` arrives, and the answer
/// depends on `multiple` being in place BEFORE they are. In the template it is;
/// as a property written after the clone it is not, and the first option comes
/// out selected.
pub fn state_attribute(name: &str, tag: &str) -> bool {
    name == "multiple" && tag == "select"
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
pub fn bakeable(name: &str, is_svg: bool, tag: &str) -> bool {
    if !attribute_channel(name, is_svg, tag) {
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

    /// §3.10's channel table, which exists TWICE — here and in
    /// `dom.ts::bindChannelOf` — because the compiled path resolves it at
    /// compile time and the un-compiled one at run time. The oracle differential
    /// compares the two on every element of `bind-family.tsx`; this pins the
    /// cases no fixture reaches.
    #[test]
    fn the_bind_channel_is_resolved_from_the_tag_the_type_and_contenteditable() {
        // The property and its reporting event, per element.
        assert_eq!(bind_channel("value", "input", None, false), ("value", "input"));
        assert_eq!(bind_channel("value", "textarea", None, false), ("value", "input"));
        assert_eq!(bind_channel("value", "select", None, false), ("value", "change"));
        assert_eq!(bind_channel("value", "input", Some("checkbox"), false), ("checked", "change"));
        assert_eq!(bind_channel("value", "input", Some("radio"), false), ("checked", "change"));
        assert_eq!(
            bind_channel("value", "input", Some("number"), false),
            ("valueAsNumber", "input")
        );
        assert_eq!(
            bind_channel("value", "input", Some("range"), false),
            ("valueAsNumber", "input")
        );
        assert_eq!(bind_channel("value", "input", Some("date"), false), ("valueAsDate", "input"));
        assert_eq!(bind_channel("value", "input", Some("week"), false), ("valueAsDate", "input"));

        // A contenteditable host has no `value`; its TEXT is the channel. The
        // `type` is irrelevant on a non-field, and a plain div is not one.
        assert_eq!(bind_channel("value", "div", None, true), ("textContent", "input"));
        assert_eq!(bind_channel("value", "div", None, false), ("value", "input"));
        // …and `contenteditable` on an INPUT does not redirect it: the attribute
        // has no effect on a replaced element and `value` is still the channel.
        assert_eq!(bind_channel("value", "input", None, true), ("value", "input"));

        // The two channels named by their own spelling rather than resolved.
        assert_eq!(bind_channel("group", "input", Some("radio"), false), ("group", "change"));
        assert_eq!(bind_channel("files", "input", Some("file"), false), ("files", "change"));
        assert_eq!(bind_channel("open", "details", None, false), ("open", "toggle"));
        assert_eq!(
            bind_channel("checked", "input", Some("checkbox"), false),
            ("checked", "change")
        );
    }

    /// §3.10.1's set is keyed by the PAIR. `<option value>` is the negative the
    /// key was widened for: an option's `value` falls back to its TEXT, so a
    /// compare against the element skips the write and the reflected attribute
    /// never appears.
    #[test]
    fn the_user_mutable_channel_needs_the_tag_as_well_as_the_name() {
        assert_eq!(channel_of("value", false, "input"), Chan::Live);
        assert_eq!(channel_of("value", false, "textarea"), Chan::Live);
        assert_eq!(channel_of("value", false, "select"), Chan::Live);
        assert_eq!(channel_of("value", false, "option"), Chan::Prop);
        assert_eq!(channel_of("checked", false, "input"), Chan::Live);
        assert_eq!(channel_of("checked", false, "li"), Chan::Prop);
        assert_eq!(channel_of("selected", false, "option"), Chan::Live);
        assert_eq!(channel_of("open", false, "details"), Chan::Live);
        assert_eq!(channel_of("open", false, "div"), Chan::Attr);
        // `*` in the table: no tag restricts these.
        assert_eq!(channel_of("scrollTop", false, "div"), Chan::Live);
        assert_eq!(channel_of("scrollLeft", false, "span"), Chan::Live);
        // And the namespace gate is ahead of all of it.
        assert_eq!(channel_of("value", true, "input"), Chan::Attr);
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
        assert!(!bakeable("value", false, "input"));
        assert!(!bakeable("disabled", false, "input"));
        // On an SVG element the runtime skips the DOM_PROPS branch entirely.
        assert!(bakeable("value", true, "path"));
        assert!(!bakeable("style", false, "div"));
        assert!(!bakeable("onClick", false, "div"));
        assert!(!bakeable("ref", false, "div"));
        assert!(!bakeable("classList", false, "div"));
        assert!(!bakeable("classList", true, "path"));
        assert!(!bakeable("dangerouslySetInnerHTML", true, "path"));
        assert!(bakeable("class", false, "div"));
        assert!(bakeable("class", true, "path"));
        assert!(bakeable("viewBox", true, "svg"));
        assert!(bakeable("data-kind", false, "div"));
    }

    /// §3.13 item 8: the attribute is the state, and it has to be in the
    /// template because the children's default selectedness depends on it.
    #[test]
    fn multiple_is_an_attribute_on_a_select_and_a_property_everywhere_else() {
        assert!(bakeable("multiple", false, "select"));
        assert_eq!(channel_of("multiple", false, "select"), Chan::Attr);
        assert!(!bakeable("multiple", false, "input"));
        assert_eq!(channel_of("multiple", false, "input"), Chan::Prop);
    }
}
