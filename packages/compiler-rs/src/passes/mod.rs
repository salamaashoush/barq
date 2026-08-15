mod address;
mod anchor;
mod classify;
pub(crate) mod flow;
mod fold;
mod group;
mod serialize;
mod shape;

use oxc::allocator::Allocator;

use crate::codegen::Target;
use crate::ir::{Module, Op, Region, RegionId};
use crate::options::ResolvedOptions;

/// Stage 4. Every unit of the module already exists, so a pass sees the whole
/// module and may rewrite anything it owns — which is the precondition for P3
/// Fold and P7's dedup half. Nothing here builds output AST.
///
/// `anchor` is the last pass that may change the skeleton's SHAPE, so it runs
/// before the bytes are serialised and before anything is addressed against
/// them.
///
/// `options.opt` decides which optimisations run. Two of the six are skipped
/// outright and four are told to make the pessimal choice, because they also
/// compute something the ABI needs: `anchor` materialises the node an `insert`
/// is given, `serialize` writes the template bytes, `address` names the nodes a
/// patch reads. Off means "choose the form that assumes nothing", never "do not
/// run".
pub fn run<'a>(
    allocator: &'a Allocator,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
    target: Target,
) {
    let opt = options.opt;
    classify::run(allocator, module);
    if opt.fold {
        fold::run(allocator, module);
    }
    // After P3, because target #8 asks whether a unit still has a patch — which
    // is also `NO_SCOPE`'s proof — and before P5, because nothing it builds
    // reaches the skeleton.
    //
    // Ungated on the target since M6. The gate was there because P8b owned a
    // hand-written string implementation of every construct, so a construct that
    // had already become a primitive had nothing left for it to rewrite; the
    // string backend now implements the four primitives itself, and the SAME
    // lowered IR serves both.
    shape::run(allocator, module, options, opt.flow);
    // A `<!---->` is an insert anchor for a sibling walk, and the string backend
    // has no walk. It is also the reason a `NodeId` may never reach a
    // compile-time address: this pass makes the two targets' skeletons differ.
    //
    // Under `hydratable` it runs for the string backend TOO, and then the two
    // skeletons agree again. That is not a convenience: the client's logical
    // walk indexes the server's child list, a marker is a node in it, and a
    // marker the wire omitted would shift every index after it by one. The
    // string backend still has no walk — it serialises the comment and nothing
    // reads it there. `SEMANTICS.md` H3.
    if target.walks_the_dom() || options.hydratable {
        anchor::run(allocator, module, opt.anchor);
    }
    // Skipped whole: a `SetLive` with no group header is the one-effect-per-prop
    // form, which codegen emits directly.
    if opt.fuse {
        group::run(allocator, module);
    }
    // After P5, so the anchor a region receives is the one the anchor pass
    // chose for its slot, and before P6, so the parent and the anchor are both
    // addressed. This is the whole point of the opcode: the pair comes from the
    // template walk, and the runtime stops re-deriving it.
    //
    // Ungated: the claim moves a staged region into the unit whose patch stands
    // on it, which is a fact about the IR rather than about a backend. The
    // string backend reaches the same `Op::Region` from the same slot and hands
    // the primitive `(null, null)` — it has no nodes to name, and the range it
    // owns is the markup it returns.
    claim_regions(module);
    // §3.11's compile-time addresses, for EVERY target and after the claim, so
    // an `Op::Region` and the `Op::Insert` it replaced address the same JSX
    // position. Nothing downstream reads the table, which is what makes the
    // corpus-wide both-ways diff evidence about the IR rather than about a
    // side effect of building it.
    address::locate(module);
    // The two guarded passes are artefacts of the DOM backend and nothing else
    // reads them: a `template()` is a parse and an address is a sibling walk.
    // P8b concatenates bytes and has neither (DESIGN §5). The DOM order is left
    // exactly as it was.
    if target.walks_the_dom() {
        serialize::run(module, opt.dedup);
        address::run(allocator, module, opt.walk);
    }
}

/// Move every staged region a patch stands on into the unit that owns the
/// patch, and turn the `insert` into a `Region`.
///
/// A region the shape pass staged but no patch claims is a construct standing
/// free of any template — a whole root, a prop value, or a hole expression that
/// is more than the construct itself. Those stay on the module and codegen
/// expands them with `(parent, anchor) = (null, null)`, which is `flow.ts`'s own
/// "the caller inserts the anchor I return" path.
fn claim_regions(module: &mut Module<'_>) {
    if module.regions.is_empty() {
        return;
    }
    let Module { units, regions, uids, .. } = module;
    for unit in units.iter_mut() {
        for index in 0..unit.patch.len() {
            let Op::Insert { slot, anchor, value, .. } = unit.patch[index].op else { continue };
            let Some(staged) = staged_region(&unit.exprs, uids, value) else { continue };
            let Some(region) = regions[staged as usize].take() else {
                unreachable!("a placeholder is written once and claimed once")
            };
            let id = unit.regions.len() as RegionId;
            unit.regions.push(region);
            unit.patch[index].op = Op::Region { slot, anchor, region: id };
            // The placeholder has no reader left; the entry survives as
            // `Folded`, so every `ExprId` after it stays valid.
            let _: Option<oxc::ast::ast::Expression<'_>> = unit.exprs.entry_mut(value).src.take();
        }
    }
}

/// The staged region a hole's expression IS — not one it merely contains. A
/// `cond ? <Show/> : null` keeps its `insert`, because the hole's value is the
/// conditional and only the construct inside it is a region.
fn staged_region(
    exprs: &crate::ir::ExprTable<'_>,
    uids: &crate::ir::Uids<'_>,
    value: crate::ir::ExprId,
) -> Option<RegionId> {
    let oxc::ast::ast::Expression::Identifier(identifier) = exprs.entry(value).src.expression()?
    else {
        return None;
    };
    uids.region_index(identifier.name.as_str())
}

/// §3.11's address table as JSON, for a caller across the napi boundary.
pub fn address_json(module: &Module<'_>, path: &str) -> String {
    address::to_json(module, path)
}

/// Every region the module still owns, for a consumer that has to see all of
/// them at once — `ownership::attach` is the only one.
pub fn regions_of<'a, 'm>(module: &'m Module<'a>) -> impl Iterator<Item = &'m Region<'a>> {
    module
        .units
        .iter()
        .flat_map(|unit| unit.regions.iter())
        .chain(module.regions.iter().filter_map(Option::as_ref))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::source_type_for;
    use crate::ir::{NONE, Root};
    use crate::options::ResolvedOptions;
    use crate::{analysis, harvest, lower};
    use oxc::codegen::Codegen;
    use oxc::parser::Parser;

    const SOURCE: &str = "const A = () => <ul class=\"a\"><li>{x}</li></ul>;\n\
                          const B = () => <ul class=\"a\"><li>{y}</li></ul>;\n\
                          const C = () => <Widget><p>{z}</p></Widget>;\n";

    /// Everything up to the pass stage, so a test can look at the module
    /// between P1 and P7 — the window that did not exist while emission was
    /// inline in the lowering traversal.
    fn lowered<'a>(
        allocator: &'a oxc::allocator::Allocator,
        source: &'a str,
    ) -> (oxc::ast::ast::Program<'a>, Module<'a>) {
        let mut program =
            Parser::new(allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(allocator, source);
        analysis::bind(allocator, &program, &mut module, &ResolvedOptions::default());
        harvest::run(allocator, &mut program, &mut module);
        lower::lower(allocator, source, &ResolvedOptions::default(), &mut module);
        (program, module)
    }

    #[test]
    fn p1_produces_ir_and_no_output_ast() {
        let allocator = oxc::allocator::Allocator::new();
        let (program, module) = lowered(&allocator, SOURCE);
        let printed = Codegen::new().build(&program).code;

        // The program still holds one placeholder per root and nothing the
        // compiler built: no clone, no walk, no `insert`.
        assert!(printed.contains("_jsx$0"), "{printed}");
        assert!(!printed.contains("_$template"), "{printed}");
        assert!(!printed.contains("_$insert"), "{printed}");
        assert!(!printed.contains("_$createElement"), "{printed}");
        assert!(!printed.contains('<'), "{printed}");
        assert!(!module.units.is_empty());
    }

    /// P3 rewrites the skeleton after P1 has already validated it, so the
    /// structural invariants P6 addressing and P7 hashing assume have to be
    /// re-checked on the far side of the pass stage — for every fixture, not
    /// just a hand-written case.
    #[test]
    fn the_pass_stage_leaves_every_fixture_skeleton_structurally_valid() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let mut checked = 0;
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            let allocator = oxc::allocator::Allocator::new();
            let (_program, mut module) = lowered(&allocator, &source);
            run(&allocator, &mut module, &ResolvedOptions::default(), Target::Dom);
            for (index, unit) in module.units.iter().enumerate() {
                unit.skeleton
                    .validate()
                    .unwrap_or_else(|error| panic!("{}: unit {index}: {error}", path.display()));
                assert_eq!(unit.spans.len(), unit.skeleton.len());
            }
            checked += 1;
        }
        assert!(checked >= 25, "only {checked} fixtures found");
    }

    /// Target #2, stated as the type-level fact DESIGN §1 claims it is: the
    /// attributes fold into the skeleton, the patch program empties, and
    /// `is_pure_static()` becomes true without anything asking whether the
    /// subtree was "static".
    #[test]
    fn folding_the_last_patch_makes_a_unit_pure_static() {
        let allocator = oxc::allocator::Allocator::new();
        let source = "const SIZE = 2;\nconst A = () => <b class={\"n\" + SIZE}>x</b>;\n\
                      const B = () => <b class={live()}>x</b>;\n";
        let (_program, mut module) = lowered(&allocator, source);
        assert!(module.units.iter().all(|unit| !unit.is_pure_static()));

        run(&allocator, &mut module, &ResolvedOptions::default(), Target::Dom);
        assert!(module.units[0].is_pure_static(), "the folded unit lost its last patch");
        assert!(!module.units[1].is_pure_static(), "an unresolvable value keeps its patch");
        assert_eq!(module.template_html(0), "<b class=\"n2\">x</b>");
        // A pure-static unit is never addressed, so it costs no `_el$` either.
        assert!(module.units[0].refs.is_empty());
    }

    #[test]
    fn every_unit_of_the_module_coexists_before_a_pass_runs() {
        let allocator = oxc::allocator::Allocator::new();
        let (_program, mut module) = lowered(&allocator, SOURCE);

        // Two intrinsic roots, plus the `<p>` inside the component's children.
        assert_eq!(module.units.len(), 3);
        assert!(matches!(module.roots[2], Root::Verbatim(_)), "the component is refused");
        // P1 assigns no template id, so nothing an emitted identifier depends on
        // is frozen before P7 could remap it.
        assert!(module.units.iter().all(|unit| unit.template == NONE));
        assert!(module.templates.is_empty());
        assert!(module.html.is_empty());

        run(&allocator, &mut module, &ResolvedOptions::default(), Target::Dom);

        // Target #6: A and B differ only in which expression fills the hole, and
        // `SlotId` is skeleton-local, so they serialise identically and share
        // ONE template. The `<p>` inside the component gets the second.
        assert_eq!(module.templates.len(), 2);
        assert_eq!(module.units[0].template, module.units[1].template);
        assert_ne!(module.units[2].template, module.units[0].template);
        for (index, unit) in module.units.iter().enumerate() {
            assert!(!unit.refs.is_empty(), "unit {index} addresses its hole");
        }
        // The duplicate left no residue in the html buffer.
        assert_eq!(
            module.html.len(),
            module.template_html(0).len() + module.template_html(1).len()
        );
    }

    /// P3's child half. DESIGN's M4 amendment left this open because folding a
    /// constant child has to merge adjacent text runs and then re-answer the
    /// anchor and addressing questions; in the pass order as built, P3 runs
    /// before both, so the only new work is the merge — and the merge has to
    /// leave the node count alone, because `NodeId` is what everything addresses.
    #[test]
    fn a_constant_child_migrates_into_the_template_and_takes_its_patch_with_it() {
        let allocator = oxc::allocator::Allocator::new();
        let source = "const A = () => <p>Total: {5} clicks</p>;\n\
                      const B = () => <p>a{null}b</p>;\n\
                      const C = () => <p>{\"x\"}{y}{\"z\"}</p>;\n\
                      const D = () => <p>{1.5}</p>;\n";
        let (_program, mut module) = lowered(&allocator, source);
        run(&allocator, &mut module, &ResolvedOptions::default(), Target::Dom);

        // One clone, no hole, no marker: targets #2, #3 and #9 at once, on the
        // shape the amendment named.
        assert_eq!(module.template_html(module.units[0].template), "<p>Total: 5 clicks</p>");
        assert!(module.units[0].is_pure_static());
        // `null` renders nothing, and the runs either side fuse into one node.
        assert_eq!(module.template_html(module.units[1].template), "<p>ab</p>");
        assert!(module.units[1].is_pure_static());
        // A live hole between two folded runs still needs its marker: the parser
        // fuses literal text across a hole that materialises nothing.
        assert_eq!(module.template_html(module.units[2].template), "<p>x<!---->z</p>");
        assert_eq!(module.units[2].patch.len(), 1);
        // Refused rather than reimplementing JS number formatting.
        assert_eq!(module.template_html(module.units[3].template), "<p></p>");
        assert_eq!(module.units[3].patch.len(), 1);

        for (index, unit) in module.units.iter().enumerate() {
            unit.skeleton.validate().unwrap_or_else(|error| panic!("unit {index}: {error}"));
        }
    }

    /// A collision would merge two templates that are not identical, which is a
    /// silent wrong-DOM bug rather than a missed optimisation — so the probe is
    /// followed by a byte comparison, and these two must stay apart.
    #[test]
    fn dedup_never_merges_two_templates_that_differ() {
        let allocator = oxc::allocator::Allocator::new();
        let source = "const A = () => <b class=\"x\">{p}</b>;\n\
                      const B = () => <b class=\"y\">{q}</b>;\n\
                      const C = () => <b class=\"x\">{r}</b>;\n";
        let (_program, mut module) = lowered(&allocator, source);
        run(&allocator, &mut module, &ResolvedOptions::default(), Target::Dom);
        assert_eq!(module.templates.len(), 2);
        assert_eq!(module.units[0].template, module.units[2].template);
        assert_ne!(module.units[0].template, module.units[1].template);
        assert_eq!(module.template_html(module.units[1].template), "<b class=\"y\"></b>");
    }
}
