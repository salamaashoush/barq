include!(concat!(env!("OUT_DIR"), "/dom_tables.rs"));

#[inline]
pub fn is_svg_tag(tag: &str) -> bool {
    SVG_TAGS.binary_search(&tag).is_ok()
}

/// Written as a PROPERTY by `setElementAttr`, so a literal value may never be
/// folded into the template HTML: that would set only the default attribute and
/// diverge on a dirty form field.
#[inline]
pub fn is_dom_prop(name: &str) -> bool {
    DOM_PROPS.binary_search(&name).is_ok()
}

#[inline]
pub fn is_delegated_event(event: &str) -> bool {
    DELEGATED_EVENTS.binary_search(&event).is_ok()
}

/// A document listener for one of these can never fire from a descendant, so
/// emitting an expando for it produces a silently dead handler.
#[inline]
pub fn is_non_bubbling_event(event: &str) -> bool {
    NON_BUBBLING_EVENTS.binary_search(&event).is_ok()
}

/// Intercepted by `applyProp` / `applyResolvedProp` before `setElementAttr`
/// ever sees it. The runtime threads the value it last applied through its OWN
/// effect and removes what vanished, so a compiled effect calling `setProp`
/// afresh each run could only ever add — these never join an effect and never
/// fold, `class` and `className` included.
#[inline]
pub fn is_intercepted(name: &str) -> bool {
    INTERCEPTED_NAMES.binary_search(&name).is_ok()
}

/// `setElementAttr` kebab-cases every SVG attribute except these.
#[inline]
pub fn is_svg_kebab_exempt(name: &str) -> bool {
    SVG_KEBAB_EXEMPT_NAMES.binary_search(&name).is_ok()
}

#[inline]
pub fn css_number_prop(css_name: &str) -> bool {
    CSS_NUMBER_PROPS.binary_search(&css_name).is_ok()
}

/// `ssr.ts::attr` answers about this name itself rather than writing
/// `name="value"` — an alias, an object-valued attribute, the one whose answer
/// depends on the element, one that reflects under another name, or one that
/// writes nothing. Every other name is decided entirely by the literal the
/// compiler wrote, which is what `attrLit` exists for.
///
/// The `on…` prefix is a rule rather than a name and is applied by the caller.
#[inline]
pub fn attr_intercepts(name: &str) -> bool {
    ATTR_INTERCEPTED_NAMES.binary_search(&name).is_ok()
}

/// Index into [`DELEGATED_EVENTS`], which is what [`crate::ir::Module::delegated`]
/// is a bitset over.
#[inline]
pub fn delegated_index(event: &str) -> Option<u32> {
    DELEGATED_EVENTS.binary_search(&event).ok().map(|index| index as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dom_ts;
    use crate::dom_ts::INTERCEPTED;

    fn read(path: &str) -> String {
        std::fs::read_to_string(path).unwrap_or_else(|error| panic!("{path}: {error}"))
    }

    /// `include_str!` ties this file's compilation to `OUT_DIR`, and
    /// `cargo:rerun-if-changed` ties `OUT_DIR` to `dom.ts` and `ssr.ts`, so
    /// comparing the two sides can never fail — it is the build graph asserting
    /// itself. What CAN be tested is that the generator is SENSITIVE: an edit to
    /// either source moves its output. Drift is then impossible because the
    /// output is never stored.
    #[test]
    fn the_generator_notices_every_edit_to_the_runtime() {
        let dom = read(DOM_TS_PATH);
        let ssr = read(SSR_TS_PATH);
        let sources = |dom: &str, ssr: &str| {
            dom_ts::render(&dom_ts::Sources {
                dom,
                dom_path: DOM_TS_PATH,
                ssr,
                ssr_path: SSR_TS_PATH,
            })
            .unwrap()
        };
        let current = sources(&dom, &ssr);
        assert_eq!(
            current,
            include_str!(concat!(env!("OUT_DIR"), "/dom_tables.rs")),
            "the build graph is broken: OUT_DIR did not follow the runtime sources"
        );

        for (before, after) in [
            (
                "const DELEGATED_EVENTS = new Set([\n",
                "const DELEGATED_EVENTS = new Set([\n  \"zz\",\n",
            ),
            ("if (key === \"classList\")", "if (key === \"zzList\")"),
            ("propKey !== \"viewBox\"", "propKey !== \"zzBox\""),
        ] {
            assert!(dom.contains(before), "dom.ts no longer contains {before:?}");
            let moved = sources(&dom.replacen(before, after, 1), &ssr);
            assert_ne!(moved, current, "editing {before:?} in dom.ts did not move the tables");
        }

        let before = "const ATTR_INTERCEPTED: Record<string, 1> = {\n";
        assert!(ssr.contains(before), "ssr.ts no longer contains {before:?}");
        let moved = sources(&dom, &ssr.replacen(before, &format!("{before}  zz: 1,\n"), 1));
        assert_ne!(moved, current, "editing ATTR_INTERCEPTED in ssr.ts did not move the tables");
    }

    /// The two name sets that used to be transcribed into `intern.rs` by hand.
    /// They are runtime facts — which props `applyProp`/`applyResolvedProp`
    /// intercept, and which two SVG attribute names escape kebab-casing — so
    /// they come off `dom.ts` like every other table.
    #[test]
    fn the_intercepted_names_are_read_off_the_runtime_branches() {
        for name in ["class", "className", "classList", "style", "ref", "dangerouslySetInnerHTML"] {
            assert!(is_intercepted(name), "{name} is intercepted by dom.ts");
        }
        assert!(!is_intercepted("title") && !is_intercepted("id"));

        assert_eq!(SVG_KEBAB_EXEMPT_NAMES, ["class", "viewBox"]);
        assert!(is_svg_kebab_exempt("viewBox") && !is_svg_kebab_exempt("strokeWidth"));
    }

    #[test]
    fn a_renamed_function_breaks_the_build_instead_of_emptying_out() {
        let error = dom_ts::extract("function other() {\n}\n", "x", INTERCEPTED).unwrap_err();
        assert!(error.contains("no longer declares"), "{error}");

        let error = dom_ts::extract(
            "function applyProp() {\n}\nfunction applyResolvedProp() {\n}\n",
            "x",
            INTERCEPTED,
        )
        .unwrap_err();
        assert!(error.contains("the generator is stale"), "{error}");
    }

    #[test]
    fn the_tables_carry_what_the_runtime_declares() {
        // V12: 22 names, and the absentees are the ones a hand transcription
        // gets wrong.
        assert_eq!(DELEGATED_EVENTS.len(), 22);
        for event in ["click", "pointerdown", "input", "keydown", "touchstart"] {
            assert!(is_delegated_event(event), "{event}");
        }
        for event in ["change", "submit", "keypress", "focus", "blur", "mouseenter", "mouseleave"] {
            assert!(!is_delegated_event(event), "{event} is NOT delegated by this runtime");
        }

        // V11: larger than any design listed.
        assert_eq!(DOM_PROPS.len(), 12);
        assert!(is_dom_prop("value") && is_dom_prop("readOnly") && is_dom_prop("innerHTML"));
        assert!(!is_dom_prop("class") && !is_dom_prop("href"));

        assert!(is_svg_tag("svg") && is_svg_tag("feTurbulence") && is_svg_tag("foreignObject"));
        assert!(!is_svg_tag("div") && !is_svg_tag("math"));

        assert!(css_number_prop("z-index") && css_number_prop("line-height"));
        assert!(!css_number_prop("width"));

        assert!(is_non_bubbling_event("mouseenter") && is_non_bubbling_event("focus"));
        assert!(!is_non_bubbling_event("click"));

        // The names `ssr.ts::attr` answers about itself. `attrLit` is emitted
        // for everything else, so a name that belongs here and is missing is a
        // wrong attribute on the wire.
        for name in [
            "class",
            "classList",
            "style",
            "value",
            "className",
            "htmlFor",
            "defaultValue",
            "readOnly",
            "children",
            "ref",
            "checked",
            "innerHTML",
            "dangerouslySetInnerHTML",
        ] {
            assert!(attr_intercepts(name), "{name} is decided by attr itself");
        }
        assert!(!attr_intercepts("title") && !attr_intercepts("data-id") && !attr_intercepts("id"));
    }

    /// A document listener for a non-bubbling type can never fire from a
    /// descendant, so a name in both tables would make the compiler emit an
    /// expando the runtime immediately warns about and that never runs.
    #[test]
    fn nothing_is_both_delegated_and_non_bubbling() {
        let overlap: Vec<&str> =
            DELEGATED_EVENTS.iter().copied().filter(|event| is_non_bubbling_event(event)).collect();
        assert_eq!(overlap, Vec::<&str>::new());
    }

    #[test]
    fn every_table_is_sorted_so_lookup_is_a_binary_search() {
        for table in [
            &SVG_TAGS[..],
            &DOM_PROPS[..],
            &CSS_NUMBER_PROPS[..],
            &DELEGATED_EVENTS[..],
            &NON_BUBBLING_EVENTS[..],
            &ATTR_INTERCEPTED_NAMES[..],
        ] {
            assert!(table.windows(2).all(|pair| pair[0] < pair[1]), "{table:?}");
        }
        assert_eq!(delegated_index("beforeinput"), Some(0));
        assert_eq!(delegated_index("mouseenter"), None);
    }

    #[test]
    fn a_renamed_table_breaks_the_build_instead_of_emptying_out() {
        let error =
            dom_ts::extract("const OTHER = new Set([]);", "DELEGATED_EVENTS", dom_ts::Shape::Set)
                .unwrap_err();
        assert!(error.contains("no longer declares"), "{error}");

        let error = dom_ts::extract(
            "const DOM_PROPS: Record<string, 1> = {\n};\n",
            "DOM_PROPS",
            dom_ts::Shape::Record,
        )
        .unwrap_err();
        assert!(error.contains("came out empty"), "{error}");
    }
}
