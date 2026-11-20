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

/// Every atom in `css`, ordered by tier within the layer it sits in, after
/// every rule of that layer that is not an atom.
///
/// A stable sort, so two atoms of one tier keep the order they were written in
/// — which is what decides between them, and what
/// `sorting rules within a tier` was measured and rejected for changing.
///
/// Rules that are not atoms keep their order among themselves. A hand-written
/// `@layer barq.ui { … }` block carries an author's own selector and an
/// author's own intent about where it sits against its neighbours, and
/// `@barqjs/ui`'s `srOnly` is exactly that; what it does not get is a place
/// after an atom, which would let it beat one at the same specificity.
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
///
/// Last, in every tier, the hash of the condition the atom was declared under,
/// which its class carries. Two atoms of one tier with different conditions
/// that both match one element are two rules of one specificity, and there is
/// no passing order between two calls. Left to arrival, the pair went to
/// whichever chunk or module came first, which a split build and an unsplit one
/// decide differently: `@barqjs/ui`'s button icons were 12px in one and 16px in
/// the other. The hash is the condition as written, so a minifier cannot change
/// it, and dev and every build shape read the same one.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rank<'a> {
    tier: Tier,
    group: u8,
    first: f64,
    second: f64,
    prelude: &'a str,
    condition: &'a str,
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
            .then_with(|| self.condition.cmp(other.condition))
    }
}

/// The [`Rank`] of a rule already known to sit in `tier`.
pub fn rank(tier: Tier, rule: &str) -> Rank<'_> {
    let condition = atom_named(rule).map_or("", |named| named.condition);
    let plain = Rank { tier, group: 0, first: 0.0, second: 0.0, prelude: "", condition };
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

/// Every atom of a build in ONE stylesheet, and each sheet with its atoms taken
/// out.
///
/// A code-split build is several stylesheets, and an atom two chunks use is
/// written in both. That is bytes, and it is also a wrong answer: the tier
/// order holds inside one sheet, so a chunk loaded later, carrying a base rule
/// the page already had, puts that rule after the first chunk's `@media` rule
/// for the same property and wins a pair it should lose. One sheet has one
/// order, which is what the runtime's registry has always had in development.
///
/// An atom is filed under the layer it was written in and printed once. Rules
/// that are not atoms stay where they were: a `css` block belongs to its
/// module's chunk. A minifier merges neighbouring rules under one at-rule, and
/// rules with one body under one selector list, and it does so across a block
/// and an atom as readily as across two atoms; every statement is taken apart
/// into [`units`] first, so an atom leaves and the block's rule stays where it
/// was, under its own copy of the at-rule.
pub fn gather_atoms(sheets: &[&str]) -> (String, Vec<String>) {
    let mut layers: Vec<(String, Vec<String>)> = Vec::new();
    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    let mut file = |layer: &str, unit: String| {
        if !seen.insert((layer.to_string(), unit.clone())) {
            return;
        }
        match layers.iter_mut().find(|(name, _)| name == layer) {
            Some((_, rules)) => rules.push(unit),
            None => layers.push((layer.to_string(), vec![unit])),
        }
    };
    // What is left of one statement once its atoms are filed.
    let mut sort = |layer: &str, statement: &str| -> String {
        if is_declaration(statement) {
            return statement.to_string();
        }
        let (lead, rule) = leading_comments(statement);
        let mut kept = String::new();
        for (unit, atom) in units(rule) {
            if atom {
                file(layer, unit);
            } else {
                kept.push_str(&unit);
            }
        }
        format!("{lead}{}", regrouped(&kept))
    };

    let mut rest: Vec<String> = Vec::with_capacity(sheets.len());
    for sheet in sheets {
        let mut kept = String::with_capacity(sheet.len());
        for statement in statements(sheet) {
            if let Some((head, body)) = layer_body(statement) {
                let name = layer_name(head);
                let inner: String =
                    statements(body).into_iter().map(|rule| sort(name, rule)).collect();
                if !inner.trim().is_empty() {
                    kept.push_str(head);
                    kept.push_str(&inner);
                    kept.push('}');
                }
            } else {
                kept.push_str(&sort("", statement));
            }
        }
        rest.push(kept);
    }

    let mut atoms = String::new();
    for (name, rules) in &layers {
        let ordered = regrouped(&order_rules(&rules.concat()));
        if name.is_empty() {
            atoms.push_str(&ordered);
        } else {
            atoms.push_str("@layer ");
            atoms.push_str(name);
            atoms.push('{');
            atoms.push_str(&ordered);
            atoms.push('}');
        }
    }
    (atoms, rest)
}

/// A statement with no block of its own: `@charset`, `@import`, `@namespace`
/// and a `@layer a, b;` order statement. Each has to stay in front of every rule
/// it was in front of, or a browser ignores it or the layer order changes, so
/// none of them is ever moved.
fn is_declaration(statement: &str) -> bool {
    let rule = leading_comments(statement).1.trim();
    rule.starts_with('@') && rule.ends_with(';')
}

/// The comments and white space in front of a statement, and the statement.
fn leading_comments(statement: &str) -> (&str, &str) {
    let mut at = 0;
    loop {
        let rest = &statement[at..];
        let trimmed = rest.trim_start();
        at += rest.len() - trimmed.len();
        match trimmed.strip_prefix("/*") {
            Some(comment) => {
                at += comment.find("*/").map_or(rest.len(), |end| 2 + end + 2);
                if at >= statement.len() {
                    return (statement, "");
                }
            }
            None => return statement.split_at(at),
        }
    }
}

/// The name in the `@layer NAME{` a [`layer_body`] head ends with.
fn layer_name(head: &str) -> &str {
    let opening = head.rfind("@layer ").map_or(0, |at| at + "@layer ".len());
    head[opening..].trim_end_matches('{').trim()
}

/// A statement as the rules it is made of, each paired with whether it is an
/// atom's, in order.
///
/// `@media x{a b}` is `@media x{a}` and `@media x{b}`, to any depth, and a rule
/// whose selector list names several atoms, or atoms and something else, is
/// one rule per atom and one for the rest. A rule is then an atom's by itself
/// alone, never by a neighbour a minifier put it with: read whole,
/// `@media (width>=48rem){.b1{padding:0}.a-padding-top-x_1{…}}` was a media
/// atom, and the block's rule moved behind every other block with it.
fn units(statement: &str) -> Vec<(String, bool)> {
    let trimmed = statement.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let conditional =
        ["@media", "@supports", "@container"].iter().any(|at| trimmed.starts_with(at));
    let open = trimmed.find('{');
    match open {
        Some(open)
            if conditional && matching_brace(trimmed, open + 1) == Some(trimmed.len() - 1) =>
        {
            let prelude = &trimmed[..open];
            statements(&trimmed[open + 1..trimmed.len() - 1])
                .into_iter()
                .flat_map(|inner| {
                    let (lead, rule) = leading_comments(inner);
                    let mut found = units(rule);
                    if let Some(first) = found.first_mut() {
                        first.0.insert_str(0, lead);
                    }
                    found
                })
                .map(|(inner, atom)| (format!("{prelude}{{{inner}}}"), atom))
                .collect()
        }
        _ => by_atom(trimmed),
    }
}

/// A rule as one rule per atom its selector list names and one for every other
/// branch, each with the rule's body.
///
/// A minifier joins rules that hold the same declarations, so two atoms that
/// set `display:none` under different conditions come back as
/// `[data-open] .a-display-x_1,.a-display_1{display:none}`, and a block that
/// happens to say what an atom says comes back joined to it. Branches are
/// grouped by the class they name, since one atom's own condition can be a list
/// too.
fn by_atom(rule: &str) -> Vec<(String, bool)> {
    let whole = |atom: bool| vec![(rule.to_string(), atom)];
    if rule.starts_with('@') || !rule.ends_with('}') {
        return whole(false);
    }
    let Some(open) = rule.find('{') else { return whole(false) };
    let (selector, body) = (&rule[..open], &rule[open..]);
    let declarations = declared(&body[1..body.len() - 1]);
    let mut groups: Vec<(Option<&str>, Vec<&str>)> = Vec::new();
    for branch in branches(selector) {
        let class = class_in(branch, &declarations).map(|named| named.class);
        match groups.iter_mut().find(|(name, _)| *name == class) {
            Some((_, list)) => list.push(branch.trim()),
            None => groups.push((class, vec![branch.trim()])),
        }
    }
    if groups.len() < 2 {
        return whole(groups.first().is_some_and(|(class, _)| class.is_some()));
    }
    groups
        .into_iter()
        .map(|(class, list)| (format!("{}{body}", list.join(",")), class.is_some()))
        .collect()
}

/// A selector list's branches, split at the commas outside brackets, parentheses
/// and strings.
fn branches(selector: &str) -> Vec<&str> {
    let bytes = selector.as_bytes();
    let mut out = Vec::new();
    let (mut depth, mut start, mut at) = (0i32, 0usize, 0usize);
    while at < bytes.len() {
        match bytes[at] {
            b'"' | b'\'' => at = string_end(bytes, at),
            b'\\' => at += 1,
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b',' if depth == 0 => {
                out.push(&selector[start..at]);
                start = at + 1;
            }
            _ => {}
        }
        at += 1;
    }
    out.push(&selector[start..]);
    out
}

/// The properties a rule body declares, lower-cased.
fn declared(body: &str) -> Vec<String> {
    let bytes = body.as_bytes();
    let mut out = Vec::new();
    let (mut depth, mut start, mut at) = (0i32, 0usize, 0usize);
    let mut take = |from: usize, to: usize| {
        if let Some(colon) = body[from..to].find(':') {
            out.push(body[from..from + colon].trim().to_ascii_lowercase());
        }
    };
    while at < bytes.len() {
        match bytes[at] {
            b'"' | b'\'' => at = string_end(bytes, at),
            b'\\' => at += 1,
            b'(' => depth += 1,
            b')' => depth -= 1,
            b';' if depth == 0 => {
                take(start, at);
                start = at + 1;
            }
            _ => {}
        }
        at += 1;
    }
    take(start, bytes.len().max(start));
    out
}

/// What an atom's class says about it.
#[derive(Debug, Clone, Copy)]
struct Named<'a> {
    class: &'a str,
    /// The hash of the condition it was declared under, empty for the default.
    condition: &'a str,
}

/// The atom a rule is, read off the rule itself: a class in the SELECTOR of the
/// exact shape `atom_in` names one, whose property the body declares.
///
/// `a-<property>[-<condition hash>]_<value hash>`, each hash one to seven
/// characters of base 36, and `var-<name>` for a custom property. Anything
/// looser took `.a-button__icon{…}`, somebody's BEM, and
/// `background:url(./x.a-b_c.png)`, a declaration, for atoms, and moved them
/// past every block. `atomClass` in `@barqjs/css` reads the same shape.
fn atom_named(rule: &str) -> Option<Named<'_>> {
    let rule = without_layer(rule);
    let (_, rule) = leading_comments(rule);
    let mut at = 0;
    while rule[at..].starts_with('@') {
        let brace = rule[at..].find('{')?;
        at += brace + 1;
        at += rule[at..].len() - rule[at..].trim_start().len();
    }
    let open = at + rule[at..].find('{')?;
    let close = matching_brace(rule, open + 1)?;
    let declarations = declared(&rule[open + 1..close]);
    let mut found: Option<Named<'_>> = None;
    for branch in branches(&rule[at..open]) {
        let named = class_in(branch, &declarations)?;
        if found.is_some_and(|held| held.class != named.class) {
            return None;
        }
        found = Some(named);
    }
    found
}

/// The first class in one selector branch that is an atom declaring one of
/// `declarations`.
fn class_in<'a>(branch: &'a str, declarations: &[String]) -> Option<Named<'a>> {
    let mut from = 0;
    while let Some(found) = branch[from..].find(".a-") {
        let start = from + found + 1;
        let end = branch[start..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
            .map_or(branch.len(), |end| start + end);
        if let Some(condition) = atom_condition(&branch[start..end], declarations) {
            return Some(Named { class: &branch[start..end], condition });
        }
        from = end;
    }
    None
}

/// The condition hash of `class`, when it is an atom's name for a property one
/// of `declarations` sets.
fn atom_condition<'a>(class: &'a str, declarations: &[String]) -> Option<&'a str> {
    let rest = class.strip_prefix("a-")?;
    let underscore = rest.rfind('_')?;
    let (key, value) = (&rest[..underscore], &rest[underscore + 1..]);
    if !is_hash(value) {
        return None;
    }
    let sets = |name: &str| {
        let property = match name.strip_prefix("var-") {
            Some(custom) => format!("--{custom}"),
            None => name.to_string(),
        };
        !name.is_empty()
            && declarations.iter().any(|held| unprefixed(held) == unprefixed(&property))
    };
    if !key.contains('_') && sets(key) {
        return Some("");
    }
    let dash = key.rfind('-')?;
    let (name, condition) = (&key[..dash], &key[dash + 1..]);
    (is_hash(condition) && !name.contains('_') && sets(name)).then_some(condition)
}

/// One to seven base-36 digits, which is what `hash32` writes.
fn is_hash(text: &str) -> bool {
    (1..=7).contains(&text.len())
        && text.bytes().all(|b| b.is_ascii_digit() || b.is_ascii_lowercase())
}

/// A property without its vendor prefix, so a prefixed copy a minifier added
/// beside the declaration still names it.
fn unprefixed(property: &str) -> &str {
    ["-webkit-", "-moz-", "-ms-", "-o-"]
        .iter()
        .find_map(|prefix| property.strip_prefix(prefix))
        .unwrap_or(property)
}

/// Where the string opening at `open` closes; an unescaped newline ends one
/// that never did, which is CSS's own recovery.
fn string_end(bytes: &[u8], open: usize) -> usize {
    let quote = bytes[open];
    let mut at = open + 1;
    while at < bytes.len() {
        match bytes[at] {
            b'\\' => at += 1,
            b'\n' => return at,
            byte if byte == quote => return at,
            _ => {}
        }
        at += 1;
    }
    bytes.len().saturating_sub(1)
}

/// Neighbouring rules under one at-rule prelude, written under it once.
fn regrouped(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let mut open: Option<&str> = None;
    for rule in statements(css) {
        let prelude = rule
            .starts_with('@')
            .then(|| rule.find('{'))
            .flatten()
            .filter(|_| rule.ends_with('}'))
            .map(|brace| (&rule[..brace], &rule[brace + 1..rule.len() - 1]));
        match (prelude, open) {
            (Some((head, body)), Some(current)) if head == current => out.push_str(body),
            (Some((head, body)), _) => {
                if open.is_some() {
                    out.push('}');
                }
                out.push_str(head);
                out.push('{');
                out.push_str(body);
                open = Some(head);
            }
            (None, _) => {
                if open.take().is_some() {
                    out.push('}');
                }
                out.push_str(rule);
            }
        }
    }
    if open.is_some() {
        out.push('}');
    }
    out
}

/// One layer's contents: every rule that is not an atom, in the order it was
/// written, and then every atom in tier order.
///
/// An atom and a `css` block class are both 0-1-0, so for one property on one
/// element order alone decides between them, and the atom is the one that is
/// meant to win: it is what a caller passes to override. Before this the pair
/// went by where each rule happened to sit, which in a build was module order
/// and in dev was registration order.
///
/// Text after the last rule, which is a bundler's comment, stays last.
fn order_rules(body: &str) -> String {
    let rules: Vec<&str> = statements(body);
    let mut pinned = String::with_capacity(body.len());
    let mut atoms: Vec<(String, Tier)> = Vec::new();
    let mut tail = "";
    for (index, statement) in rules.iter().enumerate() {
        if index + 1 == rules.len()
            && !statement.trim_end().ends_with('}')
            && !is_declaration(statement)
        {
            tail = statement;
            continue;
        }
        // A whole layer block is where its layer is first named, and that
        // position is the layer's order when nothing declares one.
        if is_declaration(statement) || layer_body(statement).is_some() {
            pinned.push_str(statement);
            continue;
        }
        let (lead, rule) = leading_comments(statement);
        let mut kept = String::new();
        for (unit, atom) in units(rule) {
            match atom.then(|| tier_of_rule(&unit)).flatten() {
                Some(tier) => atoms.push((unit, tier)),
                None => kept.push_str(&unit),
            }
        }
        pinned.push_str(lead);
        pinned.push_str(&regrouped(&kept));
    }
    if atoms.is_empty() {
        return body.to_string();
    }
    let mut ranked: Vec<(Rank<'_>, usize, &str)> = atoms
        .iter()
        .enumerate()
        .map(|(index, (unit, tier))| (rank(*tier, unit), index, unit.as_str()))
        .collect();
    ranked.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut out = pinned;
    for (.., rule) in &ranked {
        out.push_str(rule);
    }
    out.push_str(tail);
    out
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

/// Where the block opened at `from` closes.
pub fn matching_brace(text: &str, from: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 1i32;
    let mut at = from;
    while at < bytes.len() {
        match bytes[at] {
            b'/' if bytes.get(at + 1) == Some(&b'*') => {
                at = text[at + 2..].find("*/").map_or(bytes.len(), |end| at + 2 + end + 1);
            }
            b'"' | b'\'' => at = string_end(bytes, at),
            b'\\' => at += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(at);
                }
            }
            _ => {}
        }
        at += 1;
    }
    None
}

/// Top-level statements. A block closes one at its `}`; a statement with no
/// block, `@layer a, b;` or `@import url(…);`, closes at its `;`. Comments and
/// strings are passed over, and a `;` inside parentheses ends nothing: a data
/// URL in an `@import` is full of them.
fn statements(css: &str) -> Vec<&str> {
    let bytes = css.as_bytes();
    let mut out = Vec::new();
    let (mut depth, mut parens, mut start, mut at) = (0i32, 0i32, 0usize, 0usize);
    while at < bytes.len() {
        match bytes[at] {
            b'/' if bytes.get(at + 1) == Some(&b'*') => {
                at = css[at + 2..].find("*/").map_or(bytes.len(), |end| at + 2 + end + 1);
            }
            b'"' | b'\'' => at = string_end(bytes, at),
            b'\\' => at += 1,
            b'(' => parens += 1,
            b')' => parens -= 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    out.push(&css[start..=at]);
                    start = at + 1;
                }
            }
            b';' if depth == 0 && parens <= 0 => {
                out.push(&css[start..=at]);
                start = at + 1;
            }
            _ => {}
        }
        at += 1;
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
    let class = atom_named(rule)?.class;
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
    fn atoms_are_ordered_by_tier_inside_the_layer_after_every_other_rule() {
        let media = atom_in("barq.ui", "color", "@media print", "green");
        let base = atom_in("barq.ui", "color", "default", "red");
        let hand = ".mine{color:blue}";
        let other = ".theirs{color:teal}";
        let css =
            format!("@layer barq.ui{{{}{hand}{}{other}}}", media.rule_body(), base.rule_body());
        let ordered = order_atoms(&css);
        let at = |needle: &str| ordered.find(needle).expect(needle);
        assert!(at(&base.class) < at(&media.class), "{ordered}");
        // In front of both atoms, and in the order they were written.
        assert!(at("mine") < at("theirs") && at("theirs") < at(&base.class), "{ordered}");
    }

    /// A `css` block class and an atom are both 0-1-0, so the sheet's order is
    /// all that decides between them, whichever was written first.
    #[test]
    fn a_block_goes_in_front_of_every_atom_whichever_was_written_first() {
        let atom = atom_in("", "color", "default", "red");
        let block = ".b1n4k2p0{color:blue}";
        for css in [format!("{}{block}", atom.rule), format!("{block}{}", atom.rule)] {
            let ordered = order_atoms(&css);
            assert_eq!(ordered, format!("{block}{}", atom.rule), "{css}");
        }
    }

    /// The inner rule of an atom's `@media` wrapper, which is what a minifier
    /// writes beside a neighbour under one shared query.
    fn inner(atom: &Atom) -> String {
        let open = atom.rule.find('{').expect("a block") + 1;
        atom.rule[open..atom.rule.len() - 1].to_string()
    }

    /// Three modules in this order: a block with `padding:2rem` under a query,
    /// an atom under the same query, and a block with `padding:0` under it. The
    /// minifier put the first block and the atom in one `@media` block, and
    /// read whole that block was an atom and moved behind the third module's
    /// rule, which then lost the property it wins in dev.
    #[test]
    fn a_block_sharing_an_at_rule_with_an_atom_keeps_its_place() {
        let atom = atom_in("", "padding-top", "@media (width>=48rem)", "1px");
        let merged = format!("@media (width>=48rem){{.b1{{padding:2rem}}{}}}", inner(&atom));
        let later = "@media (width>=48rem){.b2{padding:0}}";
        let css = format!("{merged}{later}");
        assert_eq!(
            order_atoms(&css),
            format!("@media (width>=48rem){{.b1{{padding:2rem}}}}{later}{}", atom.rule)
        );

        let (atoms, rest) = gather_atoms(&[&css]);
        assert_eq!(atoms, atom.rule);
        assert_eq!(rest, [format!("@media (width>=48rem){{.b1{{padding:2rem}}}}{later}")]);
    }

    /// The same, for a block a minifier joined to an atom by selector because
    /// the two say the same thing.
    #[test]
    fn a_block_sharing_a_selector_list_with_an_atom_keeps_its_place() {
        let atom = atom_in("", "color", "default", "red");
        let css = format!(".b1,.{}{{color:red}}.b2{{color:blue}}", atom.class);
        assert_eq!(order_atoms(&css), format!(".b1{{color:red}}.b2{{color:blue}}{}", atom.rule));
        let (atoms, rest) = gather_atoms(&[&css]);
        assert_eq!(atoms, atom.rule);
        assert_eq!(rest, [".b1{color:red}.b2{color:blue}"]);
    }

    /// A browser ignores an `@import` after a rule and an order statement
    /// after a layer block changes nothing, so neither is ever moved, comment
    /// in front or not.
    #[test]
    fn a_declaration_never_goes_behind_a_rule() {
        let atom = atom_in("", "color", "default", "red");
        let import = "/*! licence */@import url(a.css);";
        let css = format!("{import}{}.b{{color:blue}}", atom.rule);
        assert_eq!(order_atoms(&css), format!("{import}.b{{color:blue}}{}", atom.rule));

        let layers = "@layer reset;/*x*/@layer theme;";
        let css = format!("{layers}{}.b{{color:blue}}", atom.rule);
        assert_eq!(order_atoms(&css), format!("{layers}.b{{color:blue}}{}", atom.rule));
        let (_, rest) = gather_atoms(&[&css]);
        assert_eq!(rest, [format!("{layers}.b{{color:blue}}")]);
    }

    /// A `;` inside parentheses or a string ends no statement.
    #[test]
    fn a_data_url_import_is_one_statement() {
        let atom = atom_in("", "color", "default", "red");
        let import = "@import url(data:text/css;base64,LmF7fQ==);@import \"x;y.css\";";
        let block = ".b{content:\"};{\"}";
        let css = format!("{import}{}{block}", atom.rule);
        assert_eq!(order_atoms(&css), format!("{import}{block}{}", atom.rule));
    }

    /// Only a class of the exact shape `atom_in` writes, in a selector, for the
    /// property the rule declares.
    #[test]
    fn something_shaped_a_little_like_an_atom_is_not_one() {
        for css in [
            ".a-button__icon{color:red}.b{color:blue}",
            ".b{background:url(./x.a-b_c.png)}.c{color:blue}",
            ".a-card_title{color:red}.b{color:blue}",
            ".a-color_UPPER{color:red}.b{color:blue}",
            ".a-color_12345678{color:red}.b{color:blue}",
        ] {
            assert_eq!(order_atoms(css), css, "{css}");
        }
        let custom = atom_in("", "--brand-x", "default", "red");
        let prefixed = format!(".{}{{-webkit-user-select:none;user-select:none}}", {
            atom_in("", "user-select", "default", "none").class
        });
        for rule in [custom.rule, prefixed] {
            let css = format!("{rule}.b{{color:blue}}");
            assert_eq!(order_atoms(&css), format!(".b{{color:blue}}{rule}"), "{rule}");
        }
    }

    /// Two atoms of one tier, for one property, under conditions that both
    /// match, come out in one order whichever came first.
    #[test]
    fn two_atoms_of_one_tier_have_one_order_whatever_they_arrived_in() {
        let a = atom_in("", "width", "& svg:not([class*='size-'])", "3px");
        let b = atom_in("", "width", "& svg:not([class*=\"size-\"])", "4px");
        let one = order_atoms(&format!("{}{}", a.rule, b.rule));
        let two = order_atoms(&format!("{}{}", b.rule, a.rule));
        assert_eq!(one, two);
        let (gathered, _) = gather_atoms(&[&b.rule, &a.rule]);
        assert_eq!(gathered, one);
    }

    /// An order statement or an import arrives joined to the rule after it, and
    /// it does not travel with an atom.
    #[test]
    fn a_declaration_in_front_of_an_atom_stays_in_front() {
        let atom = atom_in("", "color", "default", "red");
        let css = format!("@layer a, b;{}.b1n4k2p0{{color:blue}}/*$vite$:1*/", atom.rule);
        let ordered = order_atoms(&css);
        assert_eq!(
            ordered,
            format!("@layer a, b;.b1n4k2p0{{color:blue}}{}/*$vite$:1*/", atom.rule)
        );
    }

    #[test]
    fn every_atom_of_a_build_is_gathered_into_one_sheet_once() {
        let base = atom_in("barq.ui", "color", "default", "red");
        let media = atom_in("barq.ui", "color", "@media print", "green");
        let plain = atom_in("", "margin-top", "default", "0");
        let first = format!(
            "@layer barq.reset, barq.ui;@layer barq.ui{{{}.mine{{color:blue}}{}}}.b1n4k2p0{{gap:1px}}{}",
            media.rule_body(),
            base.rule_body(),
            plain.rule,
        );
        // Loaded later, with the base rule the first chunk already had.
        let second = format!("@layer barq.ui{{{}}}{}", base.rule_body(), plain.rule);
        let (atoms, rest) = gather_atoms(&[&first, &second]);

        assert_eq!(atoms.matches(&base.class).count(), 1, "{atoms}");
        assert_eq!(atoms.matches(&plain.class).count(), 1, "{atoms}");
        let at = |needle: &str| atoms.find(needle).expect(needle);
        assert!(at(&base.class) < at(&media.class), "{atoms}");
        assert!(atoms.contains("@layer barq.ui{"), "{atoms}");

        assert_eq!(
            rest[0],
            "@layer barq.reset, barq.ui;@layer barq.ui{.mine{color:blue}}.b1n4k2p0{gap:1px}"
        );
        // Nothing of the second sheet was anything but atoms.
        assert_eq!(rest[1], "");
    }

    /// A minifier joins neighbours under one query, and two chunks join
    /// different neighbours, so the rule is found inside either block.
    #[test]
    fn a_block_a_minifier_merged_is_taken_apart_and_joined_again() {
        let a = atom_in("", "color", "@media print", "green");
        let b = atom_in("", "margin-top", "@media print", "0");
        let c = atom_in("", "padding-top", "@media print", "0");
        let inner = |atom: &Atom| {
            let open = atom.rule.find('{').expect("a block") + 1;
            atom.rule[open..atom.rule.len() - 1].to_string()
        };
        let first = format!("@media print{{{}{}}}", inner(&a), inner(&b));
        let second = format!("@media print{{{}{}}}", inner(&b), inner(&c));
        let (atoms, rest) = gather_atoms(&[&first, &second]);
        assert_eq!(rest, ["", ""]);
        assert_eq!(atoms.matches("@media print{").count(), 1, "{atoms}");
        for atom in [&a, &b, &c] {
            assert_eq!(atoms.matches(&atom.class).count(), 1, "{atoms}");
        }
    }

    /// What the minifier did to `@barqjs/ui`'s sidebar: the base `display:none`
    /// joined to another atom's rule in a later chunk, after the first chunk's
    /// `@media` atom, and the sidebar was hidden at every width.
    #[test]
    fn a_selector_list_a_minifier_joined_is_read_as_the_atoms_it_names() {
        let base = atom_in("", "display", "default", "none");
        let open = atom_in("", "display", "[data-expanded] &", "none");
        let wide = atom_in("", "display", "@media (min-width: 48rem)", "block");
        let selector = |atom: &Atom| atom.rule[..atom.rule.find('{').expect("a block")].to_string();
        let joined = format!("{},{}{{display:none}}", selector(&open), selector(&base));
        let first = format!("{}{}", base.rule, wide.rule);
        let (atoms, rest) = gather_atoms(&[&first, &joined]);
        assert_eq!(rest, ["", ""]);
        assert_eq!(atoms.matches(&format!(".{}{{", base.class)).count(), 1, "{atoms}");
        let at = |needle: &str| atoms.rfind(needle).expect(needle);
        assert!(at(&base.class) < at(&wide.class), "{atoms}");
    }

    #[test]
    fn one_atom_whose_own_condition_is_a_list_stays_one_rule() {
        let atom = atom_in("", "color", "[data-expanded], &[data-open]", "red");
        let (atoms, _) = gather_atoms(&[&atom.rule]);
        assert_eq!(atoms, atom.rule);
    }

    #[test]
    fn a_sheet_holding_no_atom_comes_back_as_it_was() {
        let css = "@layer a, b;@import \"x.css\";.b1n4k2p0{color:red}@media print{.card{gap:0}}@keyframes s{to{opacity:1}}";
        let (atoms, rest) = gather_atoms(&[css]);
        assert_eq!(atoms, "");
        assert_eq!(rest, [css]);
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
