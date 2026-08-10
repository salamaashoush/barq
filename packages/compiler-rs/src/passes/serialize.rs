use std::collections::hash_map::Entry;
use std::hash::{Hash, Hasher};

use oxc::span::Span;
use rustc_hash::FxHasher;

use crate::ir::{
    Interner, Module, Ns, SkelAttrValue, SkelNode, Skeleton, TagFlags, TemplateId, TemplateMeta,
    TemplateRow,
};

/// P7 Intern — target #6. One pass over the module's units: serialise each
/// skeleton into the single html buffer, hash the contiguous range it just
/// wrote, and hand the unit a `TemplateId`.
///
/// A hit rewinds the buffer to where the duplicate started, so a shared template
/// leaves no residue. Dedup is module-wide and cross-component by construction:
/// `SlotId` is skeleton-LOCAL and every expression lives in layer 2, so
/// `<div class="row">{a()}</div>` and `<div class="row">{b()}</div>` serialise
/// to the same bytes. `Skeleton::origin` is not part of the identity, so
/// sourcemap data can never defeat a share.
///
/// The id is assigned HERE and nowhere else — codegen turns it into `_tmpl$N`
/// only when it prints — so collapsing two units onto one id moves no emitted
/// identifier.
///
/// `share` is the optimisation, and it is the only half that is one: the bytes
/// still have to be written and the id still has to be assigned, so with it off
/// every unit simply takes a row of its own.
pub fn run(module: &mut Module<'_>, share: bool) {
    let Module { units, interner, html, templates, template_meta, dedup, dedup_overflow, .. } =
        module;
    let mut origin: Vec<(u32, Span)> = Vec::new();

    for unit in units.iter_mut() {
        origin.clear();
        let start = html.len() as u32;
        {
            let mut writer =
                Writer { interner, spans: &unit.spans, start, html, origin: &mut origin };
            let (lo, hi) = unit.skeleton.roots;
            for node in lo..hi {
                writer.node(&unit.skeleton, node);
            }
        }
        let end = html.len() as u32;
        let ns = unit.skeleton.ns;
        // `template(html, isSVG)` returns a DIFFERENT node for the same bytes,
        // so the wrapper flag is part of the template's identity, not metadata.
        let wrapped = needs_svg_wrapper(&unit.skeleton, interner);
        let hash = identity(&html[start as usize..end as usize], ns, wrapped);

        // The hash is a probe, not the answer: two templates merged by a
        // collision would be a silent wrong-DOM bug, so the bytes are compared.
        let same = |id: &TemplateId| {
            let row = &templates[*id as usize];
            row.ns == ns
                && template_meta[*id as usize].wrapped == wrapped
                && html[row.range.0 as usize..row.range.1 as usize]
                    == html[start as usize..end as usize]
        };
        let hit = share.then(|| {
            dedup
                .get(&hash)
                .copied()
                .filter(same)
                // Empty unless a 64-bit collision really happened, so this costs
                // one branch on the miss path and nothing else.
                .or_else(|| dedup_overflow.iter().copied().find(same))
        });
        let id = match hit.flatten() {
            Some(id) => {
                html.truncate(start as usize);
                id
            }
            None => {
                let id = templates.len() as TemplateId;
                templates.push(TemplateRow { range: (start, end), ns, hash });
                template_meta.push(TemplateMeta { wrapped, span: unit.site.span() });
                // A collision degrades to a duplicate ROW, never to a silent
                // merge — and the loser is still registered, so a third template
                // identical to it shares with it instead of adding a third row.
                if share {
                    match dedup.entry(hash) {
                        Entry::Vacant(slot) => {
                            slot.insert(id);
                        }
                        // The first bytes to claim the slot keep it, so the
                        // common path stays one probe.
                        Entry::Occupied(_) => dedup_overflow.push(id),
                    }
                }
                id
            }
        };

        unit.skeleton.origin.reserve(origin.len());
        unit.skeleton.origin.extend(origin.iter().copied());
        unit.template = id;
    }
}

/// Everything that changes what `template()` returns, and nothing that does not.
fn identity(html: &str, ns: Ns, wrapped: bool) -> u64 {
    let mut hasher = FxHasher::default();
    html.hash(&mut hasher);
    ns.hash(&mut hasher);
    wrapped.hash(&mut hasher);
    hasher.finish()
}

struct Writer<'w, 'a> {
    interner: &'w Interner<'a>,
    spans: &'w [Span],
    start: u32,
    html: &'w mut String,
    origin: &'w mut Vec<(u32, Span)>,
}

impl Writer<'_, '_> {
    fn node(&mut self, skeleton: &Skeleton<'_>, node: u32) {
        self.origin.push((self.html.len() as u32 - self.start, self.spans[node as usize]));
        match skeleton.node(node) {
            SkelNode::Text(text) => self.html.push_str(text),
            SkelNode::RawHtml(raw) => self.html.push_str(raw),
            SkelNode::Slot(_) | SkelNode::Empty => {}
            SkelNode::Marker(_) => self.html.push_str("<!---->"),
            SkelNode::Element(element) => {
                let tag = self.interner.tag(element.tag);
                self.html.push('<');
                self.html.push_str(tag.text);
                for attr in element.attrs {
                    self.html.push(' ');
                    self.html.push_str(self.interner.name(attr.name).text);
                    if let SkelAttrValue::Str(value) = attr.value {
                        self.html.push_str("=\"");
                        self.html.push_str(self.interner.str(value));
                        self.html.push('"');
                    }
                }
                let (lo, hi) = element.children;
                if tag.flags.contains(TagFlags::VOID) {
                    self.html.push('>');
                    return;
                }
                if lo == hi && element.ns.self_closes() {
                    self.html.push_str("/>");
                    return;
                }
                self.html.push('>');
                // O9: "in body" ignores ONE U+000A character token directly
                // after these open tags, so a leading newline needs a second
                // one or the DOM diverges from `createTextNode`.
                //
                // A character reference does NOT escape the rule — the
                // tokenizer emits the same character token for `&#10;`, and
                // real Chrome parses `<pre>&#10;a</pre>` to "a". Doubling the
                // newline is what the HTML serializer in the spec does, and it
                // is confirmed in test/browser-parse-check.ts.
                //
                // The rule is about the BYTE that follows the open tag, not
                // about the first child: a `Slot` materialises nothing, so a
                // hole in front of the text leaves the newline sitting directly
                // after `<pre>` where the parser still eats it. A `Marker`
                // writes `<!---->` and stops the rule, which is why this became
                // reachable only once P5 started eliding markers.
                if tag.flags.contains(TagFlags::PRESERVE_WS)
                    && let Some(first) = (lo..hi).find(|node| {
                        !matches!(skeleton.node(*node), SkelNode::Slot(_) | SkelNode::Empty)
                    })
                    && let SkelNode::Text(text) | SkelNode::RawHtml(text) = skeleton.node(first)
                    && text.starts_with('\n')
                {
                    self.origin
                        .push((self.html.len() as u32 - self.start, self.spans[first as usize]));
                    self.html.push('\n');
                }
                for child in lo..hi {
                    self.node(skeleton, child);
                }
                self.html.push_str("</");
                self.html.push_str(tag.text);
                self.html.push('>');
            }
        }
    }
}

/// `template(html, isSVG)` wraps the markup in `<svg xmlns>` and returns its
/// first child, so it is for a template rooted at an SVG *child*. A template
/// rooted at `<svg>` itself parses correctly as inline HTML (`dom.ts:1000`).
fn needs_svg_wrapper(skeleton: &Skeleton<'_>, interner: &Interner<'_>) -> bool {
    if skeleton.ns != Ns::Svg {
        return false;
    }
    let (lo, hi) = skeleton.roots;
    if hi - lo != 1 {
        return false;
    }
    match skeleton.node(lo) {
        SkelNode::Element(element) => interner.tag(element.tag).text != "svg",
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::source_type_for;
    use crate::options::ResolvedOptions;
    use crate::{analysis, harvest, lower};
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;

    /// A 64-bit collision does not happen for short strings, so the only way to
    /// exercise the path is to manufacture one: point the map's slot for B's
    /// hash at a row holding A's bytes. The byte comparison then rejects the
    /// probe, B has to take a row of its own — and C, which really IS B, has to
    /// find it. Before the overflow list, B went unregistered and C added a
    /// THIRD row for bytes the module already had.
    #[test]
    fn a_hash_collision_costs_one_row_and_still_lets_the_loser_be_shared() {
        let allocator = Allocator::new();
        let source = "const A = () => <b class=\"a\">{p}</b>;\n\
                      const B = () => <b class=\"b\">{q}</b>;\n\
                      const C = () => <b class=\"b\">{r}</b>;\n";
        let mut program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        analysis::bind(&allocator, &program, &mut module, &ResolvedOptions::default());
        harvest::run(&allocator, &mut program, &mut module);
        lower::lower(&allocator, source, &ResolvedOptions::default(), &mut module);

        let a = "<b class=\"a\"></b>";
        let b = "<b class=\"b\"></b>";
        module.html.push_str(a);
        module.templates.push(TemplateRow {
            range: (0, a.len() as u32),
            ns: Ns::Html,
            hash: identity(a, Ns::Html, false),
        });
        module.template_meta.push(TemplateMeta { wrapped: false, span: Span::default() });
        module.dedup.insert(identity(b, Ns::Html, false), 0);

        run(&mut module, true);

        assert_eq!(module.template_html(module.units[1].template), b);
        assert_eq!(
            module.units[1].template, module.units[2].template,
            "the collision loser has to stay shareable"
        );
        assert_eq!(module.dedup_overflow, vec![module.units[1].template]);
    }
}
