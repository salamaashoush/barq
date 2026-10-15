use barq_css::{Kind, Options, compile};

fn scoped(source: &str) -> String {
    compile(source, Kind::Scoped, &Options::default()).expect("compiles").css
}

fn global(source: &str) -> String {
    compile(source, Kind::Global, &Options::default()).expect("compiles").css
}

fn class(source: &str) -> String {
    compile(source, Kind::Scoped, &Options::default()).expect("compiles").name
}

#[test]
fn a_flat_block_becomes_one_rule() {
    assert_eq!(
        scoped("color: red; padding: 8px"),
        format!(".{}{{color: red;padding: 8px}}", class("color: red; padding: 8px"))
    );
}

#[test]
fn a_trailing_semicolon_does_not_produce_an_empty_declaration() {
    let name = class("color: red;");
    assert_eq!(scoped("color: red;"), format!(".{name}{{color: red}}"));
}

#[test]
fn ampersand_takes_the_parent() {
    let name = class("&:hover { color: red }");
    assert_eq!(scoped("&:hover { color: red }"), format!(".{name}:hover{{color: red}}"));
}

#[test]
fn a_bare_nested_selector_is_a_descendant() {
    let name = class("span { color: red }");
    assert_eq!(scoped("span { color: red }"), format!(".{name} span{{color: red}}"));
}

#[test]
fn a_combinator_first_selector_keeps_its_combinator() {
    let name = class("> li { color: red }");
    assert_eq!(scoped("> li { color: red }"), format!(".{name} > li{{color: red}}"));
}

#[test]
fn a_comma_list_crosses_against_the_parent() {
    let name = class("a, b { color: red }");
    assert_eq!(scoped("a, b { color: red }"), format!(".{name} a,.{name} b{{color: red}}"));
}

#[test]
fn ampersand_can_appear_twice_and_in_the_middle() {
    let name = class("& + & { color: red }");
    assert_eq!(scoped("& + & { color: red }"), format!(".{name} + .{name}{{color: red}}"));
    let outer = class(".dark & { color: red }");
    assert_eq!(scoped(".dark & { color: red }"), format!(".dark .{outer}{{color: red}}"));
}

#[test]
fn a_glued_suffix_survives_the_substitution() {
    let name = class("&__label { color: red }");
    assert_eq!(scoped("&__label { color: red }"), format!(".{name}__label{{color: red}}"));
}

#[test]
fn ampersand_inside_a_functional_pseudo_class_is_substituted_too() {
    let name = class(":is(&, .plain) { color: red }");
    assert_eq!(
        scoped(":is(&, .plain) { color: red }"),
        format!(":is(.{name}, .plain){{color: red}}")
    );
    let has = class(":has(& > img) { color: red }");
    assert_eq!(scoped(":has(& > img) { color: red }"), format!(":has(.{has} > img){{color: red}}"));
}

#[test]
fn declarations_keep_their_order_around_a_nested_rule() {
    let source = "color: red; span { color: blue } background: white";
    let name = class(source);
    assert_eq!(
        scoped(source),
        format!(".{name}{{color: red}}.{name} span{{color: blue}}.{name}{{background: white}}")
    );
}

#[test]
fn a_nested_at_rule_is_hoisted_and_keeps_the_scope() {
    let source = "color: red; @media (min-width: 600px) { color: blue }";
    let name = class(source);
    assert_eq!(
        scoped(source),
        format!(".{name}{{color: red}}@media (min-width: 600px){{.{name}{{color: blue}}}}")
    );
}

#[test]
fn two_nested_at_rules_wrap_in_order() {
    let source = "@media (min-width: 600px) { @supports (display: grid) { color: red } }";
    let name = class(source);
    assert_eq!(
        scoped(source),
        format!("@media (min-width: 600px){{@supports (display: grid){{.{name}{{color: red}}}}}}")
    );
}

#[test]
fn the_modern_conditional_group_rules_all_propagate_the_scope() {
    for (prelude, expected) in [
        ("@container (min-width: 400px)", "@container (min-width: 400px)"),
        ("@layer components", "@layer components"),
        ("@scope (.card) to (.inner)", "@scope (.card) to (.inner)"),
        ("@starting-style", "@starting-style"),
    ] {
        let source = format!("{prelude} {{ color: red }}");
        let name = class(&source);
        assert_eq!(
            scoped(&source),
            format!("{expected}{{.{name}{{color: red}}}}"),
            "{prelude} did not propagate the scope"
        );
    }
}

#[test]
fn a_rule_that_owns_its_contents_is_emitted_as_written() {
    let source = "@keyframes spin { from { rotate: 0deg } to { rotate: 360deg } }";
    let name = class(source);
    assert_eq!(
        scoped(source),
        "@keyframes spin{from{rotate: 0deg}to{rotate: 360deg}}",
        "the class {name} must not be crossed into keyframe selectors"
    );
    assert_eq!(
        scoped("@font-face { font-family: X; src: url(a.woff2) }"),
        "@font-face{font-family: X;src: url(a.woff2)}"
    );
    assert_eq!(
        scoped("@property --x { syntax: '<color>'; inherits: false }"),
        "@property --x{syntax: '<color>';inherits: false}"
    );
}

#[test]
fn a_custom_property_is_a_declaration_like_any_other() {
    let name = class("--gap: 8px; gap: var(--gap)");
    assert_eq!(
        scoped("--gap: 8px; gap: var(--gap)"),
        format!(".{name}{{--gap: 8px;gap: var(--gap)}}")
    );
}

#[test]
fn a_keyframes_block_takes_the_generated_name() {
    let compiled =
        compile("from { opacity: 0 } to { opacity: 1 }", Kind::Keyframes, &Options::default())
            .expect("compiles");
    assert_eq!(
        compiled.css,
        format!("@keyframes {}{{from{{opacity: 0}}to{{opacity: 1}}}}", compiled.name)
    );
}

#[test]
fn a_global_block_keeps_its_own_selectors() {
    assert_eq!(global("body { margin: 0 }"), "body{margin: 0}");
    assert_eq!(global("body, html { margin: 0 }"), "body,html{margin: 0}");
}

#[test]
fn an_import_leads_the_global_stylesheet() {
    assert_eq!(
        global("body { margin: 0 } @import url(reset.css);"),
        "@import url(reset.css);body{margin: 0}"
    );
}

#[test]
fn a_hole_becomes_the_text_the_caller_folded_it_to() {
    let options = Options { holes: &["var(--bg)"], ..Options::default() };
    let compiled = compile("background: `BARQ-0`", Kind::Scoped, &options).expect("compiles");
    assert_eq!(compiled.css, format!(".{}{{background: var(--bg)}}", compiled.name));
}

#[test]
fn the_same_block_is_the_same_class_however_it_is_spelled() {
    assert_eq!(class("color: red"), class("  color:   red  "));
    assert_eq!(class("color: red"), class("color: red /* a note */"));
    assert_ne!(class("color: red"), class("color: blue"));
}

#[test]
fn a_debug_name_is_visible_and_does_not_change_the_block() {
    let plain = compile("color: red", Kind::Scoped, &Options::default()).expect("compiles");
    let named = compile(
        "color: red",
        Kind::Scoped,
        &Options { debug_name: Some("cardStyle"), ..Options::default() },
    )
    .expect("compiles");
    assert!(named.name.starts_with("cardStyle_"), "{}", named.name);
    assert_eq!(named.css, plain.css.replace(&plain.name, &named.name));
}

#[test]
fn a_string_carrying_css_punctuation_does_not_end_the_declaration() {
    let source = r#"content: "};{"; color: red"#;
    let name = class(source);
    assert_eq!(scoped(source), format!(r#".{name}{{content: "}};{{";color: red}}"#));
}

#[test]
fn a_data_uri_survives_its_own_semicolons() {
    let source = "background: url(data:image/svg+xml;base64,AA); color: red";
    let name = class(source);
    assert_eq!(
        scoped(source),
        format!(".{name}{{background: url(data:image/svg+xml;base64,AA);color: red}}")
    );
}

#[test]
fn an_import_cannot_be_scoped_to_a_class() {
    let error = compile("@import url(x.css);", Kind::Scoped, &Options::default()).unwrap_err();
    assert!(error.message.contains("globalCss"), "{}", error.message);
}

/// The parser refuses this one before the walk reaches it, which is the better
/// place for it: the message names the position rather than the consequence.
#[test]
fn a_bare_declaration_has_nothing_to_apply_to_in_a_global_block() {
    let error = compile("color: red", Kind::Global, &Options::default()).unwrap_err();
    assert!(error.message.contains("declaration at top level"), "{}", error.message);
}

/// Inside an at-rule the parser cannot tell, because `@media { color: red }` is
/// exactly what a scoped block legitimately contains. This is the walk's own
/// check, and the only path that reaches it.
#[test]
fn a_declaration_under_a_global_at_rule_has_nothing_to_apply_to_either() {
    let error =
        compile("@media (min-width: 600px) { color: red }", Kind::Global, &Options::default())
            .unwrap_err();
    assert!(error.message.contains("no element to apply to"), "{}", error.message);
}

#[test]
fn ampersand_has_no_parent_in_a_global_block() {
    let error = compile("& { color: red }", Kind::Global, &Options::default()).unwrap_err();
    assert!(error.message.contains("no parent selector"), "{}", error.message);
}

/// The parser runs in SCSS mode because that is the only dialect its template
/// placeholders are allowed in. Everything the widening lets through has to be
/// refused, or a `$var` would compile to a rule no browser applies.
#[test]
fn scss_that_is_not_css_is_refused_by_name() {
    let error =
        compile("$brand: red; color: $brand", Kind::Scoped, &Options::default()).unwrap_err();
    assert!(error.message.contains("Sass variable"), "{}", error.message);
}

#[test]
fn an_error_span_points_into_the_source_the_caller_passed() {
    let error =
        compile("color: red; @import url(x.css);", Kind::Scoped, &Options::default()).unwrap_err();
    assert_eq!(&"color: red; @import url(x.css);"[error.start..error.end], "@import url(x.css)");
}

#[test]
fn an_unclosed_block_is_an_error_rather_than_a_guess() {
    assert!(compile("span { color: red", Kind::Scoped, &Options::default()).is_err());
}

fn refused(source: &str, kind: Kind) -> (String, String) {
    let holes = ["var(--b0)", "var(--b1)"];
    let error = compile(source, kind, &Options { holes: &holes, ..Options::default() })
        .expect_err("refused");
    (error.message, source[error.start..error.end].to_string())
}

/// A `css` block is parsed as a block's contents, so a `}` that closes nothing
/// is the parser's error. Inside a wrapper it closed the wrapper, and the rule
/// after it was parsed as a sibling and never emitted.
#[test]
fn a_brace_that_closes_nothing_is_an_error_rather_than_a_lost_rule() {
    let (message, at) = refused("color: red } span { color: blue }", Kind::Scoped);
    assert!(message.contains("The CSS parser reports"), "{message}");
    assert_eq!(at, "}");
}

#[test]
fn a_keyframes_block_takes_percentage_steps() {
    let compiled =
        compile("0% { opacity: 0 } 50% { opacity: 0.5 }", Kind::Keyframes, &Options::default())
            .expect("compiles");
    assert_eq!(
        compiled.css,
        format!("@keyframes {}{{0%{{opacity: 0}}50%{{opacity: 0.5}}}}", compiled.name)
    );
}

#[test]
fn an_error_offset_counts_bytes_past_a_multibyte_character() {
    let source = "content: \"日本\"; } span { color: blue }";
    let error = compile(source, Kind::Scoped, &Options::default()).unwrap_err();
    assert_eq!(&source[error.start..error.end], "}");

    let source = "from { content: \"é\" } } to { opacity: 1 }";
    let error = compile(source, Kind::Keyframes, &Options::default()).unwrap_err();
    assert_eq!(&source[..error.start], "from { content: \"é\" } ");
    assert_eq!(&source[error.start..error.end], "}");

    let (_, at) = refused("content: \"日本\"; .a-`BARQ-0` { color: red }", Kind::Scoped);
    assert_eq!(at, "`BARQ-0`");
}

/// A placeholder becomes `var(--…)`, which CSS reads only in a value. Each of
/// these used to compile to CSS the browser drops.
#[test]
fn a_placeholder_outside_a_value_is_refused_where_it_stands() {
    for (source, kind, says) in [
        ("margin-`BARQ-0`: 0", Kind::Scoped, "part of a property name"),
        ("`BARQ-0`: red", Kind::Scoped, "part of a property name"),
        ("color: red; .a-`BARQ-0` { color: blue }", Kind::Scoped, "part of a selector"),
        ("&:hover `BARQ-0` { color: blue }", Kind::Scoped, "part of a selector"),
        ("@media (min-width: `BARQ-0`) { color: red }", Kind::Scoped, "the `@media` prelude"),
        ("@supports (display: `BARQ-0`) { color: red }", Kind::Scoped, "the `@supports` prelude"),
        ("span { @media (width > `BARQ-0`) { color: red } }", Kind::Scoped, "`@media` prelude"),
        ("font-family: brand-`BARQ-0`", Kind::Scoped, "joined to the text before it"),
        ("body { margin-`BARQ-0`: 0 }", Kind::Global, "part of a property name"),
        ("from { opacity: 0 } `BARQ-0` { opacity: 1 }", Kind::Keyframes, "keyframe selector"),
        ("from { margin-`BARQ-0`: 0 }", Kind::Keyframes, "part of a property name"),
        ("@keyframes spin { `BARQ-0` { opacity: 0 } }", Kind::Scoped, "keyframe selector"),
    ] {
        let (message, at) = refused(source, kind);
        assert!(message.contains(says), "{source}: {message}");
        assert_eq!(at, "`BARQ-0`", "{source}");
    }
}

#[test]
fn a_placeholder_in_a_value_still_compiles() {
    let holes = ["var(--b0)", "var(--b1)", "var(--b2)"];
    let options = Options { holes: &holes, ..Options::default() };
    for (source, kind, emitted) in [
        (
            "width: calc(`BARQ-0` + 1px); color: `BARQ-1`",
            Kind::Scoped,
            "width: calc(var(--b0) + 1px);color: var(--b1)",
        ),
        (
            "--gap: `BARQ-0`; margin: 0 `BARQ-1``BARQ-2`",
            Kind::Scoped,
            "--gap: var(--b0);margin: 0 var(--b1)var(--b2)",
        ),
        (
            "a[title=\"`BARQ-0`\"] { color: `BARQ-0` }",
            Kind::Scoped,
            "[title=\"`BARQ-0`\"]{color: var(--b0)}",
        ),
        ("from { opacity: `BARQ-0` }", Kind::Keyframes, "{from{opacity: var(--b0)}}"),
    ] {
        let compiled = compile(source, kind, &options).expect(source);
        assert!(compiled.css.contains(emitted), "{source}: {}", compiled.css);
    }
}
