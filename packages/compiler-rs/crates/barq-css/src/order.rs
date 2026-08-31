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

use crate::atoms::Tier;

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

/// One layer's contents, with its atoms tier-ordered and everything else fixed.
fn order_rules(body: &str) -> String {
    let rules: Vec<&str> = statements(body);
    let mut movable: Vec<(Tier, usize, &str)> = Vec::new();
    let mut slots: Vec<usize> = Vec::new();
    for (index, rule) in rules.iter().enumerate() {
        if let Some(tier) = tier_of_rule(rule) {
            movable.push((tier, index, rule));
            slots.push(index);
        }
    }
    if movable.len() < 2 {
        return body.to_string();
    }
    movable.sort_by_key(|(tier, index, _)| (*tier, *index));

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
