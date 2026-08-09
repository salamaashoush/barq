mod address;
mod anchor;
mod classify;
mod fold;
mod group;
mod serialize;

use oxc::allocator::Allocator;

use crate::ir::Module;

/// Stage 4. Every unit of the module already exists, so a pass sees the whole
/// module and may rewrite anything it owns — which is the precondition for P3
/// Fold and P7's dedup half. Nothing here builds output AST.
///
/// `anchor` is the last pass that may change the skeleton's SHAPE, so it runs
/// before the bytes are serialised and before anything is addressed against
/// them.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    classify::run(allocator, module);
    fold::run(allocator, module);
    anchor::run(allocator, module);
    group::run(allocator, module);
    serialize::run(module);
    address::run(allocator, module);
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
        analysis::bind(&program, &mut module, "@barqjs/core");
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
            run(&allocator, &mut module);
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

        run(&allocator, &mut module);
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

        run(&allocator, &mut module);

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
        run(&allocator, &mut module);
        assert_eq!(module.templates.len(), 2);
        assert_eq!(module.units[0].template, module.units[2].template);
        assert_ne!(module.units[0].template, module.units[1].template);
        assert_eq!(module.template_html(module.units[1].template), "<b class=\"y\"></b>");
    }
}
