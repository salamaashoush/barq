//! Which JSX shapes the HTML tree-construction algorithm reproduces exactly as
//! `createElement` + `appendChild` would.
//!
//! Every refusal here is a browser parse fact, and every one of them is a
//! correctness gate rather than an optimisation: `template()` returns
//! `content.firstChild`, so an element the parser foster-parents, drops or
//! auto-closes does not merely render differently — it can take the whole unit
//! root with it. The differential harness runs against happy-dom, whose tree
//! construction is a subset, so it cannot falsify these; the table below is
//! held honest by the tests at the bottom of this file instead.

/// Ancestors the parser has open above the element under consideration.
///
/// Every flag is STICKY. Real scope rules clear some of these at a boundary
/// (`<td>` blocks button scope, and is a marker in the list of active
/// formatting elements), and modelling that would make the predicate more
/// permissive. Over-refusal only costs the `createElement` fallback.
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Open {
    p: bool,
    a: bool,
    nobr: bool,
    button: bool,
    form: bool,
    li: bool,
    dl_item: bool,
    ruby_item: bool,
}

impl Open {
    fn after(self, tag: &str) -> Self {
        match tag {
            "p" => Self { p: true, ..self },
            "a" => Self { a: true, ..self },
            "nobr" => Self { nobr: true, ..self },
            "button" => Self { button: true, ..self },
            "form" => Self { form: true, ..self },
            "li" => Self { li: true, ..self },
            "dd" | "dt" => Self { dl_item: true, ..self },
            "rt" | "rp" => Self { ruby_item: true, ..self },
            _ => self,
        }
    }
}

#[derive(Clone, Copy, Default)]
pub struct Context<'a> {
    pub parent: Option<&'a str>,
    pub open: Open,
    pub in_svg: bool,
}

impl<'a> Context<'a> {
    pub fn inside(self, tag: &'a str, is_svg: bool) -> Self {
        Self { parent: Some(tag), open: self.open.after(tag), in_svg: self.in_svg || is_svg }
    }
}

/// Start tags that close an open `<p>`: HTML "in body", "if the stack of open
/// elements has a p element in button scope, close a p element".
const CLOSES_P: [&str; 40] = [
    "address",
    "article",
    "aside",
    "blockquote",
    "center",
    "dd",
    "details",
    "dialog",
    "dir",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "listing",
    "main",
    "menu",
    "nav",
    "ol",
    "p",
    "plaintext",
    "pre",
    "search",
    "section",
    "summary",
    "table",
    "ul",
];

/// Never inserted where `createElement` would put it: the document structure
/// tags (their attributes are merged into an existing element and the token is
/// dropped), the namespace switch, `<template>`'s content fragment, and the two
/// obsolete tags the parser rewrites into something else entirely.
const NEVER: [&str; 9] =
    ["body", "frame", "frameset", "head", "html", "isindex", "math", "plaintext", "template"];

/// True when the browser would build a different tree than `createElement` +
/// `appendChild` for `tag` at this position.
pub fn reshapes(tag: &str, at: Context<'_>) -> bool {
    if at.in_svg {
        // Foreign content inserts elements verbatim: no implied end tags, no
        // foster parenting, no active formatting elements.
        return false;
    }
    if NEVER.binary_search(&tag).is_ok() {
        return true;
    }
    // A template ROOT is not parsed in "in body". `template()` assigns
    // `innerHTML` on a `<template>`, which parses in "in template" insertion
    // mode, and that mode pushes "in table" / "in table body" / "in row" / "in
    // column group" for exactly these start tags — so a table-scoped element
    // with no ancestor above it is inserted verbatim. `Context::inside` always
    // sets a parent, so `None` is the template root and nothing else.
    let root = at.parent.is_none();
    let legal_parent = match tag {
        "caption" | "colgroup" | "tbody" | "tfoot" | "thead" => root || at.parent == Some("table"),
        "tr" => root || matches!(at.parent, Some("tbody" | "tfoot" | "thead")),
        "td" | "th" => root || at.parent == Some("tr"),
        "col" => root || at.parent == Some("colgroup"),
        _ => true,
    };
    if !legal_parent {
        return true;
    }
    let legal_child = match at.parent {
        Some("table") => matches!(tag, "caption" | "colgroup" | "tbody" | "tfoot" | "thead"),
        Some("tbody" | "tfoot" | "thead") => tag == "tr",
        Some("tr") => matches!(tag, "td" | "th"),
        Some("colgroup") => tag == "col",
        Some("select") => matches!(tag, "hr" | "optgroup" | "option"),
        Some("optgroup") => tag == "option",
        Some("option") => false,
        _ => true,
    };
    if !legal_child {
        return true;
    }
    if at.open.p && CLOSES_P.binary_search(&tag).is_ok() {
        return true;
    }
    matches!(
        (tag, at.open),
        ("a", Open { a: true, .. })
            | ("nobr", Open { nobr: true, .. })
            | ("button", Open { button: true, .. })
            | ("form", Open { form: true, .. })
            | ("li", Open { li: true, .. })
            | ("dd" | "dt", Open { dl_item: true, .. })
            | ("rt" | "rp", Open { ruby_item: true, .. })
    )
}

/// Inside these, a character token that is not whitespace is foster-parented
/// out of the element and inserted before the table.
pub fn fosters_text(tag: &str) -> bool {
    matches!(tag, "colgroup" | "table" | "tbody" | "tfoot" | "thead" | "tr")
}

/// A raw-text element runs to the first `</tag`, and nothing inside it is
/// escaped or decoded. So a `<` in the source can close it early and inject
/// live markup into the template, and an `&` can decode into one.
pub fn raw_text_hazard(text: &str) -> bool {
    text.bytes().any(|byte| byte == b'<' || byte == b'&')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(tag: &str) -> bool {
        reshapes(tag, Context::default())
    }

    fn under(chain: &[&str], tag: &str) -> bool {
        let mut at = Context::default();
        for step in chain {
            at = at.inside(step, false);
        }
        reshapes(tag, at)
    }

    #[test]
    fn the_tables_are_sorted_so_lookup_is_a_binary_search() {
        assert!(CLOSES_P.windows(2).all(|pair| pair[0] < pair[1]), "{CLOSES_P:?}");
        assert!(NEVER.windows(2).all(|pair| pair[0] < pair[1]), "{NEVER:?}");
    }

    #[test]
    fn the_document_structure_tags_are_never_inlined() {
        for tag in ["html", "head", "body", "frameset", "frame", "math", "template", "plaintext"] {
            assert!(root(tag), "{tag} at a template root");
            assert!(under(&["div"], tag), "{tag} inside a div");
        }
    }

    #[test]
    fn a_table_section_is_refused_everywhere_it_is_not_legal() {
        for tag in ["caption", "col", "colgroup", "tbody", "td", "tfoot", "th", "thead", "tr"] {
            assert!(under(&["div"], tag), "{tag} inside a div");
            assert!(under(&["span", "em"], tag), "{tag} nested in inline content");
        }
    }

    /// "in template" insertion mode pushes a table mode for each of these, so a
    /// row or a cell with nothing above it parses back as itself — which is the
    /// single commonest list shape there is, and it used to fall all the way
    /// back to `createElement`. Confirmed in real Chrome and in happy-dom by
    /// `test/browser-parse-check.ts`, which parses every emitted template.
    #[test]
    fn a_table_section_at_a_template_root_is_inlinable() {
        for tag in ["caption", "col", "colgroup", "tbody", "td", "tfoot", "th", "thead", "tr"] {
            assert!(!root(tag), "{tag} at a template root");
        }
        // and the interior of one still follows the ordinary rules
        assert!(!under(&["tr"], "td"));
        assert!(!under(&["tbody"], "tr"));
        assert!(!under(&["colgroup"], "col"));
        assert!(!under(&["tr", "td"], "div"));
        assert!(under(&["tr"], "div"));
        assert!(under(&["tbody"], "td"));
        assert!(under(&["td"], "tr"));
    }

    #[test]
    fn a_legal_table_chain_is_still_inlinable() {
        assert!(!root("table"));
        assert!(!under(&["table"], "tbody"));
        assert!(!under(&["table"], "thead"));
        assert!(!under(&["table"], "caption"));
        assert!(!under(&["table"], "colgroup"));
        assert!(!under(&["table", "colgroup"], "col"));
        assert!(!under(&["table", "tbody"], "tr"));
        assert!(!under(&["table", "tbody", "tr"], "td"));
        assert!(!under(&["table", "tbody", "tr"], "th"));
        assert!(!under(&["table", "tbody", "tr", "td"], "div"));
    }

    #[test]
    fn an_implied_tbody_or_colgroup_is_refused() {
        // `<table><tr>` makes the parser open a tbody that createElement never does.
        assert!(under(&["table"], "tr"));
        assert!(under(&["table"], "col"));
        assert!(under(&["table"], "td"));
    }

    #[test]
    fn anything_foreign_inside_a_table_is_foster_parented() {
        for tag in ["div", "img", "span", "table", "form", "p"] {
            assert!(under(&["table"], tag), "{tag} inside a table");
        }
        assert!(under(&["table", "tbody"], "td"));
        assert!(under(&["table", "tbody", "tr"], "tr"));
    }

    #[test]
    fn a_block_child_auto_closes_an_open_p() {
        assert!(under(&["p"], "div"));
        assert!(under(&["p"], "p"));
        assert!(under(&["p"], "ul"));
        assert!(under(&["p"], "hr"));
        assert!(under(&["p"], "table"));
        assert!(under(&["p"], "h1"));
        // and it does so through intervening inline content, because `span` does
        // not block button scope
        assert!(under(&["p", "span", "em"], "div"));
        // inline children are fine
        assert!(!under(&["p"], "span"));
        assert!(!under(&["p"], "em"));
        assert!(!under(&["p"], "img"));
        assert!(!under(&["p"], "button"));
    }

    #[test]
    fn the_adoption_agency_and_the_implied_end_tags_are_refused() {
        assert!(under(&["a"], "a"));
        assert!(under(&["a", "span"], "a"));
        assert!(under(&["nobr"], "nobr"));
        assert!(under(&["button"], "button"));
        assert!(under(&["button", "div"], "button"));
        assert!(under(&["form"], "form"));
        assert!(under(&["ul", "li"], "li"));
        assert!(under(&["ul", "li", "div"], "li"));
        assert!(under(&["dl", "dt"], "dd"));
        assert!(under(&["ruby", "rt"], "rp"));
        // one level is fine
        assert!(!under(&["div"], "a"));
        assert!(!under(&["a"], "span"));
        assert!(!under(&["ul"], "li"));
    }

    #[test]
    fn select_and_option_only_accept_what_the_in_select_mode_inserts() {
        assert!(!under(&["select"], "option"));
        assert!(!under(&["select"], "optgroup"));
        assert!(!under(&["select"], "hr"));
        assert!(!under(&["select", "optgroup"], "option"));
        assert!(under(&["select"], "div"));
        assert!(under(&["select"], "select"));
        assert!(under(&["select"], "span"));
        assert!(under(&["select", "option"], "b"));
        assert!(under(&["select", "optgroup"], "div"));
    }

    #[test]
    fn foreign_content_is_inserted_verbatim() {
        let svg = Context::default().inside("svg", true);
        // `<a>` and `<title>` mean something else in SVG, and none of the HTML
        // tree-construction rules run there.
        assert!(!reshapes("a", svg.inside("a", true)));
        assert!(!reshapes("tr", svg));
    }

    #[test]
    fn the_ordinary_shapes_a_template_exists_for_stay_inlinable() {
        assert!(!root("div"));
        assert!(!under(&["div"], "span"));
        assert!(!under(&["ul"], "li"));
        assert!(!under(&["div"], "p"));
        assert!(!under(&["section", "header"], "h1"));
        assert!(!under(&["div"], "input"));
        assert!(!under(&["label"], "input"));
        assert!(!under(&["div"], "button"));
    }

    #[test]
    fn raw_text_hazards_are_the_two_bytes_that_can_close_the_element() {
        assert!(raw_text_hazard("a</style><img src=x onerror=alert(1)>"));
        assert!(raw_text_hazard("a&lt;/style&gt;"));
        assert!(raw_text_hazard("if (a < b) {}"));
        assert!(!raw_text_hazard(".card { color: red }"));
        assert!(!raw_text_hazard("var a = 1;"));
    }

    #[test]
    fn text_is_foster_parented_out_of_a_table_context_only() {
        for tag in ["table", "tbody", "thead", "tfoot", "tr", "colgroup"] {
            assert!(fosters_text(tag), "{tag}");
        }
        for tag in ["td", "th", "caption", "div", "select"] {
            assert!(!fosters_text(tag), "{tag}");
        }
    }
}
