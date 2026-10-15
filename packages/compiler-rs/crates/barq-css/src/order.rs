//! A stylesheet's atoms, ordered by tier within each cascade layer.
//!
//! An atom's tier settles the one pair specificity cannot: a base rule against
//! the same property under an at-rule, since `@media` adds none. `atoms` emits
//! a call's atoms in tier order, so it holds inside one call — and nowhere
//! else. The compiler emits one stylesheet per module and a bundler
//! concatenates them in import order, so a `@media` rule from one module can
//! land before a base rule from another and lose a pair it should win.
//!
//! `collectCss` in `@barqjs/css` already sorts globally, so DEV has always been
//! right and only the production bundle was not. This is the same sort, over
//! the concatenated asset, so the two agree.
//!
//! A tier is not, and must not become, a cascade layer. It is a tie-breaker on
//! top of specificity, and a layer overrides specificity outright. Measured in
//! a browser: emitting each tier into `@layer barq.ui.<tier>` moved 289
//! computed values on `@barqjs/ui`'s gallery, because a parent's
//! `[data-variant="destructive"] &` at 0-2-0 stopped beating the child's own
//! 0-1-0 as soon as the two sat in different sub-layers. Reordering moves 8,
//! and every one is a rule under an at-rule that a later base rule was beating.

use std::cmp::Ordering;

use crate::atoms::{Atom, Tier};

/// Every atom in `css`, ordered by tier within the layer it sits in.
///
/// A stable sort, so two atoms of one tier keep the order they were written in
/// — which is what decides between them, and what
/// `sorting rules within a tier` was measured and rejected for changing.
///
/// Rules that are not atoms do not move. A hand-written `@layer barq.ui { … }`
/// block carries an author's own selector and an author's own intent about
/// where it sits, and `@barqjs/ui`'s `srOnly` is exactly that. They keep their
/// index and the atoms are ordered into the indices that are left.
pub fn order_atoms(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    for statement in statements(css) {
        match layer_body(statement) {
            Some((head, body)) => {
                out.push_str(head);
                out.push_str(&order_rules(body));
                out.push('}');
            }
            None => out.push_str(statement),
        }
    }
    // And the top level, where an UNLAYERED atom sits. `atoms` is unlayered on
    // purpose and has the same problem: two modules, a base rule and the same
    // property under an at-rule, and the concatenation decides.
    order_rules(&out)
}

/// Every cascade layer an ORDER STATEMENT in `css` names, in the order it names
/// them. A `@layer NAME{ … }` block is not one: a block declares a position
/// only by being first, which is the whole problem this reads towards.
pub fn declared_layers(css: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = css.as_bytes();
    let mut depth = 0i32;
    let mut at = 0usize;
    while at < bytes.len() {
        match bytes[at] {
            b'{' => {
                depth += 1;
                at += 1;
            }
            b'}' => {
                depth -= 1;
                at += 1;
            }
            b'@' if depth == 0 && css[at..].starts_with("@layer ") => {
                let after = at + "@layer ".len();
                let Some(end) = css[after..].find(['{', ';']) else { break };
                match bytes[after + end] {
                    b';' => out.extend(
                        css[after..after + end]
                            .split(',')
                            .map(str::trim)
                            .filter(|name| !name.is_empty())
                            .map(str::to_string),
                    ),
                    // The brace this skipped over is the layer's own, and its
                    // depth is what keeps a nested order statement out.
                    _ => depth += 1,
                }
                at = after + end + 1;
            }
            _ => at += 1,
        }
    }
    out
}

/// `names` folded into `order`, keeping every relative position both agree on.
///
/// One package declares `barq.reset, barq.ui` and another
/// `barq.reset, barq.base, barq.ui`; the answer has to hold both, and neither
/// list on its own is it. A name already held moves the insertion point to just
/// after it, so a name new to `order` lands where the incoming list puts it.
pub fn merge_layer_order(order: &mut Vec<String>, names: &[String]) {
    let mut at = 0usize;
    for name in names {
        match order.iter().position(|held| held == name) {
            Some(found) => at = found + 1,
            None => {
                order.insert(at, name.clone());
                at += 1;
            }
        }
    }
}

/// `css` with `order` declared in front of it, when `css` names a layer at all.
///
/// A layer's position is fixed by its FIRST appearance across every stylesheet
/// the document loads, and a code-split build is several stylesheets whose link
/// order the bundler decides. One chunk carrying `@layer barq.ui{ … }` linked
/// ahead of the chunk holding the order statement therefore put the components
/// in front of the reset, and Tailwind's preflight — a later layer — beat every
/// one of them: buttons lost their padding and their background.
///
/// Declaring the order in EVERY chunk that names a layer settles it whichever
/// one the browser reads first. Repeating an order statement is idempotent by
/// specification, so the second and later copies cost nothing but their bytes.
///
/// A minifier is why this cannot be left to the source. Lightning CSS rewrites
/// an order statement to name only the layers with no block in the same file,
/// on the reasoning that a block declares its own position — sound within one
/// sheet, and wrong across several. Beside `@barqjs/ui`'s theme the five-layer
/// statement came out as `@layer barq.reset,barq.base;`.
pub fn with_layer_order(css: &str, order: &[String]) -> String {
    if order.is_empty() || !css.contains("@layer") {
        return css.to_string();
    }
    let statement = format!("@layer {};", order.join(", "));
    match css.starts_with(&statement) {
        true => css.to_string(),
        false => format!("{statement}{css}"),
    }
}

/// Where a rule sorts against another: its tier, and inside the media tier
/// the query it is under.
///
/// Two queries that both match are two rules of one specificity, so the later
/// one wins, and without this "later" is whichever query a page happened to
/// use first. Mobile-first is the order in which the more specific query is
/// always the later one:
///
/// 1. `min-width` queries, narrowest floor first; from one floor, the widest
///    ceiling first and no ceiling before any.
/// 2. `max-width` queries with no floor, widest ceiling first.
/// 3. Everything else: `print`, `prefers-*`, `@supports`, `@container`, a width
///    in a unit that is not `px`, `em` or `rem`.
///
/// Ties, and the whole of the third group, go by the at-rule text itself, which
/// is arbitrary and the same on every page. `sheet.ts` in `@barqjs/css` sorts
/// what the runtime registers by this rule, read off the same text.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rank<'a> {
    tier: Tier,
    group: u8,
    first: f64,
    second: f64,
    prelude: &'a str,
}

impl Eq for Rank<'_> {}

impl PartialOrd for Rank<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Rank<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.tier
            .cmp(&other.tier)
            .then(self.group.cmp(&other.group))
            .then(self.first.total_cmp(&other.first))
            .then(self.second.total_cmp(&other.second))
            // By UTF-16 code unit, which is how the runtime's `<` compares.
            .then_with(|| self.prelude.encode_utf16().cmp(other.prelude.encode_utf16()))
    }
}

/// The [`Rank`] of a rule already known to sit in `tier`.
pub fn rank(tier: Tier, rule: &str) -> Rank<'_> {
    let plain = Rank { tier, group: 0, first: 0.0, second: 0.0, prelude: "" };
    if tier != Tier::Media {
        return plain;
    }
    let rule = without_layer(rule).trim_start();
    let mut at = 0;
    while rule[at..].starts_with('@') {
        let Some(brace) = rule[at..].find('{') else { break };
        at += brace + 1;
    }
    let prelude = &rule[..at];
    let floor = bound(prelude, "min-width", b'>');
    let ceiling = bound(prelude, "max-width", b'<');
    match (floor, ceiling) {
        (Some(floor), ceiling) => Rank {
            group: 0,
            first: floor,
            second: ceiling.map_or(f64::NEG_INFINITY, |ceiling| -ceiling),
            prelude,
            ..plain
        },
        (None, Some(ceiling)) => Rank { group: 1, first: -ceiling, prelude, ..plain },
        (None, None) => Rank { group: 2, prelude, ..plain },
    }
}

/// The first width a prelude bounds from one side, in pixels: `min-width: 40em`
/// or its range spelling `width >= 40em`.
fn bound(prelude: &str, feature: &str, operator: u8) -> Option<f64> {
    let bytes = prelude.as_bytes();
    for (at, _) in prelude.match_indices(feature) {
        let colon = past_space(bytes, at + feature.len());
        if bytes.get(colon) != Some(&b':') {
            continue;
        }
        if let Some(found) = pixels(prelude, past_space(bytes, colon + 1)) {
            return Some(found);
        }
    }
    for (at, _) in prelude.match_indices("width") {
        let before = at.checked_sub(1).map(|index| bytes[index]);
        if !before.is_some_and(|byte| byte == b'(' || is_space(byte)) {
            continue;
        }
        let mut next = past_space(bytes, at + "width".len());
        if bytes.get(next) != Some(&operator) {
            continue;
        }
        next += if bytes.get(next + 1) == Some(&b'=') { 2 } else { 1 };
        if let Some(found) = pixels(prelude, past_space(bytes, next)) {
            return Some(found);
        }
    }
    None
}

fn is_space(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | b'\r' | 0x0c)
}

fn past_space(bytes: &[u8], from: usize) -> usize {
    let mut at = from;
    while bytes.get(at).is_some_and(|byte| is_space(*byte)) {
        at += 1;
    }
    at
}

/// A length at `from` as pixels, at the 16px an `em` is in a media query.
fn pixels(text: &str, from: usize) -> Option<f64> {
    let bytes = text.as_bytes();
    let digit = |at: usize| bytes.get(at).is_some_and(u8::is_ascii_digit);
    let mut at = from;
    while digit(at) {
        at += 1;
    }
    if bytes.get(at) == Some(&b'.') && digit(at + 1) {
        at += 1;
        while digit(at) {
            at += 1;
        }
    }
    if at == from {
        return None;
    }
    let value: f64 = text[from..at].parse().ok()?;
    let mut end = at;
    while bytes.get(end).is_some_and(u8::is_ascii_alphabetic) {
        end += 1;
    }
    match text[at..end].to_ascii_lowercase().as_str() {
        "px" => Some(value),
        "em" | "rem" => Some(value * 16.0),
        _ => None,
    }
}

/// One call's atoms in the order their rules are written: by [`Rank`], and
/// within one rank the order the author wrote them in.
pub fn arranged(atoms: &[Atom]) -> Vec<&Atom> {
    let mut sorted: Vec<&Atom> = atoms.iter().collect();
    sorted.sort_by(|a, b| rank(a.tier, &a.rule).cmp(&rank(b.tier, &b.rule)));
    sorted
}

/// One layer's contents, with its atoms tier-ordered and everything else fixed.
fn order_rules(body: &str) -> String {
    let rules: Vec<&str> = statements(body);
    let mut movable: Vec<(Rank<'_>, usize, &str)> = Vec::new();
    let mut slots: Vec<usize> = Vec::new();
    for (index, rule) in rules.iter().enumerate() {
        if let Some(tier) = tier_of_rule(rule) {
            movable.push((rank(tier, rule), index, rule));
            slots.push(index);
        }
    }
    if movable.len() < 2 {
        return body.to_string();
    }
    movable.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    let mut placed: Vec<&str> = rules.clone();
    for (slot, (.., rule)) in slots.iter().zip(movable.iter()) {
        placed[*slot] = rule;
    }
    placed.concat()
}

/// `@layer NAME{` and what it holds, for a statement that is exactly one layer.
///
/// The head is everything up to and including the last `@layer NAME{`, because
/// a minifier writes `@layer a;@layer b{…}` as ONE top-level statement and the
/// declaration in front of it is not a block.
fn layer_body(statement: &str) -> Option<(&str, &str)> {
    if !statement.trim_end().ends_with('}') {
        return None;
    }
    let mut open: Option<usize> = None;
    let mut at = 0;
    while let Some(found) = statement[at..].find("@layer ") {
        let start = at + found;
        let after = start + "@layer ".len();
        let Some(brace) = statement[after..].find(['{', ';']) else { break };
        if statement.as_bytes()[after + brace] == b'{'
            && statement[after..after + brace]
                .chars()
                .all(|c| c.is_alphanumeric() || c == '.' || c == '-')
        {
            open = Some(after + brace + 1);
        }
        at = after + brace + 1;
    }
    let open = open?;
    // The block has to close at the very end, or this statement holds something
    // after the layer and lifting its contents would move that text too.
    let close = statement.rfind('}')?;
    (matching_brace(statement, open) == Some(close))
        .then(|| (&statement[..open], &statement[open..close]))
}

fn matching_brace(text: &str, from: usize) -> Option<usize> {
    let mut depth = 1i32;
    for (offset, character) in text[from..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(from + offset);
                }
            }
            _ => {}
        }
    }
    None
}

/// Top-level statements, brace-counted.
fn statements(css: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (index, character) in css.char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    out.push(&css[start..index + 1]);
                    start = index + 1;
                }
            }
            _ => {}
        }
    }
    if start < css.len() {
        out.push(&css[start..]);
    }
    out
}

/// The tier a rule sorts in, read back off the rule.
///
/// `None` for anything that is not one of ours, which is what pins it in place.
///
/// This is the second place the tier is decided — `tier_of` decides it from the
/// CONDITION, before the rule exists — and the two agree or the ordering is
/// wrong. `the two ways of deciding a tier agree` is what says they do, over
/// every condition shape the pass can produce.
pub fn tier_of_rule(rule: &str) -> Option<Tier> {
    let class = atom_class(rule)?;
    // ONE rule, or this is a block holding several and moving it would move
    // every rule in it — a whole `@layer barq.ui{ … }` looks like an atom
    // otherwise, because the first thing inside it is one.
    if statements(without_layer(rule)).len() != 1 {
        return None;
    }
    // `@layer` is where the rule LIVES; every other at-rule is a condition on
    // it. Reading the layer wrapper as one made every layered atom a media
    // atom, which is every atom `@barqjs/ui` has.
    let rule = without_layer(rule);
    let wrapped = rule.trim_start().starts_with('@');
    let selector = selector_of(rule);
    if !about_self(selector, class) {
        return Some(Tier::Descendant);
    }
    if wrapped {
        return Some(Tier::Media);
    }
    if selector.contains("::") {
        return Some(Tier::Element);
    }
    Some(if selector.len() == class.len() + 1 { Tier::Base } else { Tier::Select })
}

/// A rule with its `@layer NAME{ … }` wrapper taken off, if it has one.
fn without_layer(rule: &str) -> &str {
    let trimmed = rule.trim_start();
    let Some(rest) = trimmed.strip_prefix("@layer ") else { return rule };
    let Some(brace) = rest.find('{') else { return rule };
    if !rest[..brace].chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-') {
        return rule;
    }
    match trimmed.strip_suffix('}') {
        Some(_) => &rest[brace + 1..rest.len() - 1],
        None => rule,
    }
}

/// The class an atom's rule names, or `None` when the rule is not an atom's.
fn atom_class(rule: &str) -> Option<&str> {
    let at = rule.find(".a-")?;
    let rest = &rule[at + 1..];
    let end = rest
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .unwrap_or(rest.len());
    let class = &rest[..end];
    // `a-<property>_<hash>`, and the property never carries an underscore.
    class.contains('_').then_some(class)
}

/// The selector, with any at-rule preludes taken off the front.
fn selector_of(rule: &str) -> &str {
    let mut at = 0;
    let bytes = rule.as_bytes();
    while at < bytes.len() && (bytes[at] as char).is_whitespace() {
        at += 1;
    }
    while rule[at..].starts_with('@') {
        let Some(brace) = rule[at..].find('{') else { return "" };
        at += brace + 1;
    }
    let Some(brace) = rule[at..].find('{') else { return "" };
    rule[at..at + brace].trim()
}

/// Whether a rule's subject is the element carrying the class, or something
/// under it. A combinator after the class at bracket depth zero means the
/// latter, which is `atoms.ts`'s and `atoms.rs`'s test too.
fn about_self(selector: &str, class: &str) -> bool {
    let Some(at) = selector.rfind(class) else { return true };
    let mut depth = 0i32;
    for character in selector[at + class.len()..].chars() {
        match character {
            '(' | '[' => depth += 1,
            ')' | ']' => depth -= 1,
            ' ' | '>' | '+' | '~' if depth == 0 => return false,
            _ => {}
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atoms::{NEST, atom_in};

    /// The tier read off a RULE and the tier read off the CONDITION that built
    /// it are one decision made twice, and they agree or a stylesheet is
    /// ordered by one rule and written by another.
    #[test]
    fn the_two_ways_of_deciding_a_tier_agree() {
        let conditions = [
            "default",
            ":hover",
            ":focus-visible",
            "[data-selected]",
            "[data-slot=\"x\"] &",
            ".dark &",
            ":is(.dark *)",
            ":is(.dark *)[data-invalid]",
            "::before",
            "::placeholder",
            "& > *",
            "& svg",
            "& svg:not([class*=\"size-\"])",
            "a&:hover",
            ":has(> [data-slot=\"field\"])",
            "@media print",
            "@media (min-width: 600px)",
            "@supports (color: color-mix(in lab, red, red))",
            &format!("@media (hover: hover){NEST}:hover"),
            &format!("@media print{NEST}& > *"),
        ];
        for condition in conditions {
            let atom = atom_in("barq.ui", "color", condition, "red");
            assert_eq!(tier_of_rule(&atom.rule), Some(atom.tier), "{condition}: {}", atom.rule);
            let plain = atom_in("", "color", condition, "red");
            assert_eq!(tier_of_rule(&plain.rule), Some(plain.tier), "{condition}");
        }
    }

    #[test]
    fn a_rule_that_is_not_an_atom_has_no_tier_and_does_not_move() {
        for rule in [
            ".b1n4k2p0{color:red}",
            ".b4xsjb97.b4xsjb97{position:absolute}",
            "@keyframes spin{to{transform:rotate(360deg)}}",
            ":root{--brand-x:#fff}",
        ] {
            assert_eq!(tier_of_rule(rule), None, "{rule}");
        }
    }

    #[test]
    fn atoms_are_ordered_by_tier_inside_the_layer_and_nothing_else_moves() {
        let media = atom_in("barq.ui", "color", "@media print", "green");
        let base = atom_in("barq.ui", "color", "default", "red");
        let hand = ".mine{color:blue}";
        let css = format!("@layer barq.ui{{{}{hand}{}}}", media.rule_body(), base.rule_body());
        let ordered = order_atoms(&css);
        let at = |needle: &str| ordered.find(needle).expect(needle);
        assert!(at(&base.class) < at(&media.class), "{ordered}");
        // The hand-written rule kept its index, which is between them.
        assert!(at("mine") > at(&base.class) && at("mine") < at(&media.class), "{ordered}");
    }

    /// A minifier writes `@layer a;@layer b{…}` as one top-level statement, and
    /// reading the FIRST `@layer` in it takes the declaration for the block.
    #[test]
    fn a_layer_declaration_in_front_of_a_block_is_not_the_block() {
        let base = atom_in("barq.ui", "color", "default", "red");
        let media = atom_in("barq.ui", "color", "@media print", "green");
        let css = format!(
            "@layer barq.reset, barq.ui;@layer barq.ui{{{}{}}}",
            media.rule_body(),
            base.rule_body()
        );
        let ordered = order_atoms(&css);
        assert!(ordered.starts_with("@layer barq.reset, barq.ui;@layer barq.ui{"), "{ordered}");
        assert!(ordered.find(&base.class) < ordered.find(&media.class), "{ordered}");
    }

    #[test]
    fn an_unlayered_sheet_is_ordered_too() {
        let media = atom_in("", "color", "@media print", "green");
        let base = atom_in("", "color", "default", "red");
        let css = format!("{}{}", media.rule, base.rule);
        let ordered = order_atoms(&css);
        assert!(ordered.find(&base.class) < ordered.find(&media.class), "{ordered}");
    }

    /// A minifier writes the order statement as `@layer a;@layer b{…}` and a
    /// block declares no order at all, so only the statement is read.
    #[test]
    fn only_an_order_statement_names_a_layer() {
        assert_eq!(
            declared_layers("@layer barq.reset, barq.base;@layer barq.ui{.a{color:red}}"),
            vec!["barq.reset", "barq.base"]
        );
        assert!(declared_layers("@layer barq.ui{.a{color:red}}").is_empty());
        // Nested, so it declares an order inside `barq.ui` and not the sheet's.
        assert!(declared_layers("@layer barq.ui{@layer a, b;.a{color:red}}").is_empty());
    }

    #[test]
    fn two_partial_orders_merge_into_one_that_holds_both() {
        let mut order = Vec::new();
        merge_layer_order(&mut order, &["reset".to_string(), "ui".to_string()]);
        merge_layer_order(
            &mut order,
            &["reset".to_string(), "base".to_string(), "ui".to_string(), "style".to_string()],
        );
        assert_eq!(order, vec!["reset", "base", "ui", "style"]);
    }

    #[test]
    fn a_sheet_naming_a_layer_gets_the_order_in_front_of_it_once() {
        let order = ["barq.reset".to_string(), "barq.ui".to_string()];
        let sheet = "@layer barq.ui{.a{color:red}}";
        let once = with_layer_order(sheet, &order);
        assert_eq!(once, "@layer barq.reset, barq.ui;@layer barq.ui{.a{color:red}}");
        assert_eq!(with_layer_order(&once, &order), once);
    }

    /// A stylesheet with no layer in it has no position to fix, and a font
    /// face or a third-party asset is most of what a build emits.
    #[test]
    fn a_sheet_naming_no_layer_is_left_alone() {
        let order = ["barq.reset".to_string()];
        assert_eq!(with_layer_order(".a{color:red}", &order), ".a{color:red}");
        assert_eq!(with_layer_order("@layer x{.a{color:red}}", &[]), "@layer x{.a{color:red}}");
    }

    /// The prepended statement is a declaration in front of a block, which is
    /// the shape `layer_body` has to read past to find the block.
    #[test]
    fn ordering_a_sheet_that_carries_its_layer_order_still_orders_it() {
        let base = atom_in("barq.ui", "color", "default", "red");
        let media = atom_in("barq.ui", "color", "@media print", "green");
        let sheet = format!("@layer barq.ui{{{}{}}}", media.rule_body(), base.rule_body());
        let order = ["barq.reset".to_string(), "barq.base".to_string(), "barq.ui".to_string()];
        let ordered = order_atoms(&with_layer_order(&sheet, &order));
        assert!(ordered.starts_with("@layer barq.reset, barq.base, barq.ui;@layer barq.ui{"));
        assert!(ordered.find(&base.class) < ordered.find(&media.class), "{ordered}");
    }

    /// The order `sheet.ts` documents, query by query.
    #[test]
    fn the_media_tier_is_mobile_first() {
        let preludes = [
            "@media (width >= 320px)",
            "@media (min-width: 40em)",
            "@media (min-width: 640px)",
            "@media (min-width: 640px) and (max-width: 900px)",
            "@media (min-width:1024px)",
            "@media (max-width: 800px)",
            "@media (width<500px)",
            "@container (min-width: 10cqw)",
            "@media (min-width: 0)",
            "@media print",
            "@supports (display: grid)",
        ];
        let rules: Vec<String> =
            preludes.iter().map(|prelude| atom_in("", "color", prelude, "red").rule).collect();
        for pair in rules.windows(2) {
            assert!(rank(Tier::Media, &pair[0]) < rank(Tier::Media, &pair[1]), "{pair:?}");
        }
        // Whatever order they were written in.
        let shuffled: String = rules.iter().rev().map(String::as_str).collect();
        assert_eq!(order_atoms(&shuffled), rules.concat());
        // And inside a layer, where the rule wears its wrapper.
        let layered = atom_in("barq.ui", "color", preludes[4], "red");
        let narrow = atom_in("barq.ui", "color", preludes[2], "red");
        assert!(rank(Tier::Media, &narrow.rule) < rank(Tier::Media, &layered.rule));
    }

    /// Only the media tier is ranked: a base rule's text is never read as a
    /// query, and two base rules keep the order they were written in.
    #[test]
    fn nothing_outside_the_media_tier_is_reordered() {
        let first = atom_in("", "width", "default", "2px");
        let second = atom_in("", "color", "default", "red");
        assert_eq!(rank(Tier::Base, &first.rule), rank(Tier::Base, &second.rule));
        let css = format!("{}{}", first.rule, second.rule);
        assert_eq!(order_atoms(&css), css);
    }

    #[test]
    fn a_calls_atoms_are_arranged_by_rank_and_then_as_written() {
        let atoms = [
            atom_in("", "color", "@media (min-width: 900px)", "a"),
            atom_in("", "width", "default", "1px"),
            atom_in("", "color", "@media (min-width: 300px)", "b"),
            atom_in("", "color", "default", "c"),
        ];
        let order: Vec<&str> = arranged(&atoms).iter().map(|atom| atom.rule.as_str()).collect();
        assert_eq!(order, [&atoms[1].rule, &atoms[3].rule, &atoms[2].rule, &atoms[0].rule]);
    }

    #[test]
    fn ordering_twice_is_ordering_once() {
        let css = format!(
            "@layer barq.ui{{{}{}{}}}",
            atom_in("barq.ui", "color", "@media print", "g").rule_body(),
            atom_in("barq.ui", "color", ":hover", "b").rule_body(),
            atom_in("barq.ui", "color", "default", "r").rule_body(),
        );
        let once = order_atoms(&css);
        assert_eq!(order_atoms(&once), once);
    }
}
