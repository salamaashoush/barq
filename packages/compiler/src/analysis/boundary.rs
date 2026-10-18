//! Renderer boundaries: a component whose children build through another
//! renderer than the JSX around it.
//!
//! The tag resolves by `SymbolId` to an import the `boundaries` option names,
//! so a local of the same name, or a binding that shadows the import, is an
//! ordinary component. What the scan records is the source the children
//! occupy, as an offset range per boundary; every later stage asks which
//! renderer a node builds through by asking which range holds its span.

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName, JSXElement, JSXElementName,
    JSXMemberExpressionObject, Program, Statement,
};
use oxc::ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc::semantic::{Scoping, SymbolId};

use crate::codegen::Target;
use crate::ir::{Module, Renderer};
use crate::options::{Boundary, RenderTarget, ResolvedOptions};

/// Which imports in this module are boundaries.
struct Resolver<'o> {
    named: Vec<(SymbolId, &'o Boundary)>,
    /// A namespace import of a module some boundary comes from.
    namespaces: Vec<(SymbolId, &'o str)>,
    boundaries: &'o [Boundary],
}

impl<'o> Resolver<'o> {
    fn new(program: &Program<'_>, boundaries: &'o [Boundary]) -> Self {
        let mut named = Vec::new();
        let mut namespaces = Vec::new();
        for statement in &program.body {
            let Statement::ImportDeclaration(declaration) = statement else { continue };
            if declaration.import_kind.is_type() {
                continue;
            }
            let source = declaration.source.value.as_str();
            let Some(from) = boundaries.iter().find(|it| it.source == source) else { continue };
            for specifier in declaration.specifiers.iter().flatten() {
                match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                        if imported.import_kind.is_type() {
                            continue;
                        }
                        let name = imported.imported.name();
                        let entry = boundaries
                            .iter()
                            .find(|it| it.source == source && it.name == name.as_str());
                        if let (Some(entry), Some(symbol)) = (entry, imported.local.symbol_id.get())
                        {
                            named.push((symbol, entry));
                        }
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => {
                        let entry = boundaries
                            .iter()
                            .find(|it| it.source == source && it.name == "default");
                        if let (Some(entry), Some(symbol)) = (entry, default.local.symbol_id.get())
                        {
                            named.push((symbol, entry));
                        }
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => {
                        if let Some(symbol) = namespace.local.symbol_id.get() {
                            namespaces.push((symbol, from.source.as_str()));
                        }
                    }
                }
            }
        }
        Self { named, namespaces, boundaries }
    }

    fn is_empty(&self) -> bool {
        self.named.is_empty() && self.namespaces.is_empty()
    }

    fn entry(&self, scoping: &Scoping, name: &JSXElementName<'_>) -> Option<&'o Boundary> {
        let symbol_of = |reference: Option<oxc::semantic::ReferenceId>| {
            reference.and_then(|id| scoping.get_reference(id).symbol_id())
        };
        match name {
            JSXElementName::IdentifierReference(identifier) => {
                let symbol = symbol_of(identifier.reference_id.get())?;
                self.named.iter().find(|(it, _)| *it == symbol).map(|(_, entry)| *entry)
            }
            JSXElementName::MemberExpression(member) => {
                let JSXMemberExpressionObject::IdentifierReference(object) = &member.object else {
                    return None;
                };
                let symbol = symbol_of(object.reference_id.get())?;
                let (_, source) = self.namespaces.iter().find(|(it, _)| *it == symbol)?;
                let name = member.property.name.as_str();
                self.boundaries.iter().find(|it| it.source == *source && it.name == name)
            }
            _ => None,
        }
    }
}

/// Records every boundary's children on the module, as the renderer they build
/// through, and returns the source that builds through a custom renderer: no
/// HTML parser ever reads that markup, so nothing it says about the document
/// applies there.
///
/// A module compiled for the server enters no renderer. A document boundary's
/// children are rendered to the string like any other, and a custom renderer's
/// never run there.
pub(super) fn scan<'a>(
    allocator: &'a Allocator,
    program: &Program<'a>,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
) -> Vec<(u32, u32)> {
    if options.boundaries.is_empty() {
        return Vec::new();
    }
    let resolver = Resolver::new(program, &options.boundaries);
    if resolver.is_empty() {
        return Vec::new();
    }
    let mut scan = Scan { allocator, module, options, resolver, custom: Vec::new() };
    scan.visit_program(program);
    scan.custom
}

/// A server build drops a custom renderer's children from the boundary that
/// holds them: they never run on the server, and the string backend has no
/// lowering for a host it does not have. The boundary itself renders.
pub fn drop_server_children<'a>(
    program: &mut Program<'a>,
    scoping: &Scoping,
    options: &ResolvedOptions,
) {
    if options.boundaries.iter().all(|it| it.target != RenderTarget::Universal) {
        return;
    }
    let resolver = Resolver::new(program, &options.boundaries);
    if resolver.is_empty() {
        return;
    }
    ServerChildren { resolver, scoping }.visit_program(program);
}

struct ServerChildren<'o, 's> {
    resolver: Resolver<'o>,
    scoping: &'s Scoping,
}

impl<'a> VisitMut<'a> for ServerChildren<'_, '_> {
    fn visit_jsx_element(&mut self, element: &mut JSXElement<'a>) {
        if self
            .resolver
            .entry(self.scoping, &element.opening_element.name)
            .is_some_and(|it| it.target == RenderTarget::Universal)
        {
            element.children.clear();
            element.opening_element.attributes.retain(|item| {
                !matches!(item, JSXAttributeItem::Attribute(attribute)
                    if matches!(&attribute.name, JSXAttributeName::Identifier(name)
                        if name.name == "children"))
            });
        }
        walk_mut::walk_jsx_element(self, element);
    }
}

struct Scan<'s, 'a, 'o> {
    allocator: &'a Allocator,
    module: &'s mut Module<'a>,
    options: &'o ResolvedOptions,
    resolver: Resolver<'o>,
    custom: Vec<(u32, u32)>,
}

impl<'a> Scan<'_, 'a, '_> {
    /// The renderer `boundary`'s children build through, or `None` for a
    /// custom renderer's children in a server build.
    fn renderer(&mut self, boundary: &Boundary) -> Option<u8> {
        let own = self.module.target;
        let target = match (boundary.target, own) {
            (RenderTarget::Universal, Target::Ssr) => return None,
            (RenderTarget::Universal, _) => Target::Universal,
            (RenderTarget::Dom, Target::Universal) => Target::Dom,
            (RenderTarget::Dom, own) => own,
        };
        // The string backend imports nothing from a renderer, so every
        // document boundary renders through the module's own.
        if own == Target::Ssr
            || (target == own && boundary.module_source == self.options.module_source)
        {
            return Some(0);
        }
        let source = boundary.module_source.as_str();
        if let Some(index) =
            self.module.renderers.iter().position(|it| it.target == target && it.source == source)
        {
            return Some(index as u8 + 1);
        }
        let index = self.module.renderers.len() + 1;
        let helpers = crate::codegen::renderer_helper_names(
            &self.module.helpers,
            index as u32,
            self.allocator,
        );
        let source = self.allocator.alloc_str(source);
        self.module.renderers.push(Renderer {
            target,
            source,
            helpers,
            used: [false; crate::codegen::HELPER_COUNT],
        });
        Some(index as u8)
    }
}

impl<'a> Visit<'a> for Scan<'_, 'a, '_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        let found = self.resolver.entry(&self.module.scoping, &element.opening_element.name);
        if let Some(boundary) = found {
            let custom = boundary.target == RenderTarget::Universal;
            let renderer = self.renderer(boundary);
            let mut ranges = Vec::new();
            if let Some(closing) = &element.closing_element {
                let range = (element.opening_element.span.end, closing.span.start);
                if range.0 < range.1 {
                    ranges.push(range);
                }
            }
            for item in &element.opening_element.attributes {
                let JSXAttributeItem::Attribute(attribute) = item else { continue };
                let JSXAttributeName::Identifier(name) = &attribute.name else { continue };
                if name.name == "children"
                    && let Some(value) = &attribute.value
                {
                    let span = oxc::span::GetSpan::span(value);
                    ranges.push((span.start, span.end));
                }
            }
            for (start, end) in ranges {
                if let Some(renderer) = renderer {
                    self.module.boundaries.push((start, end, renderer));
                }
                if custom {
                    self.custom.push((start, end));
                }
            }
        }
        walk::walk_jsx_element(self, element);
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::{CompileOutput, compile};
    use crate::diag::Code;
    use crate::options::{Boundary, RenderTarget, ResolvedOptions};

    const THREE: &str = "@barqjs/three";
    const RENDERER: &str = "@barqjs/three/renderer";

    fn boundaries() -> Vec<Boundary> {
        vec![
            Boundary {
                source: THREE.into(),
                name: "Canvas".into(),
                target: RenderTarget::Universal,
                module_source: RENDERER.into(),
            },
            Boundary {
                source: THREE.into(),
                name: "Html".into(),
                target: RenderTarget::Dom,
                module_source: "@barqjs/web".into(),
            },
        ]
    }

    fn options() -> ResolvedOptions {
        ResolvedOptions { boundaries: boundaries(), ..ResolvedOptions::with_filename("scene.tsx") }
    }

    fn compiled(source: &str, options: &ResolvedOptions) -> CompileOutput {
        compile(source, options).unwrap_or_else(|errors| panic!("{errors:?}"))
    }

    fn mixed(source: &str) -> String {
        compiled(source, &options()).code
    }

    /// The line importing from `source`.
    fn import_of<'c>(code: &'c str, source: &str) -> Vec<&'c str> {
        let from = format!("from \"{source}\";");
        code.lines().filter(|line| line.starts_with("import") && line.ends_with(&from)).collect()
    }

    fn codes(out: &CompileOutput) -> Vec<Code> {
        out.warnings.iter().filter_map(|warning| warning.code).collect()
    }

    const SCENE: &str = "export const App = (p) => <main><h1>{p.title()}</h1>\
         <Canvas camera={p.cam}><mesh position={p.at()}>{p.label()}</mesh>\
         <Show when={p.on()}><group /></Show></Canvas></main>;\n";

    #[test]
    fn a_named_import_is_a_boundary_and_its_children_build_through_its_renderer() {
        let code = mixed(&format!(
            "import {{ Canvas }} from \"@barqjs/three\";\n\
             import {{ Show }} from \"@barqjs/core\";\n{SCENE}"
        ));
        for expected in [
            "_$template(`<main><h1></h1></main>`)",
            "_$insert(_el$1, Canvas({",
            "camera: p.cam,",
            "_$createElement$1(\"mesh\")",
            "_$setProp$1(_el$3, \"position\", _v$, _p$);",
            "_$insert$1(_el$3, p.label);",
            "_$branch$1(null, null, () => p.on() ? 1 : 0",
            "_$createElement$1(\"group\")",
            "_$insert(_el$2, p.title);",
        ] {
            assert!(code.contains(expected), "{expected} missing from\n{code}");
        }
        assert!(!code.contains("<mesh"), "{code}");
        let renderer = import_of(&code, RENDERER);
        assert_eq!(renderer.len(), 1, "{code}");
        for helper in ["insert as _$insert$1", "setProp as _$setProp$1", "branch as _$branch$1"] {
            assert!(renderer[0].contains(helper), "{helper} missing from {}", renderer[0]);
        }
        let web = import_of(&code, "@barqjs/web");
        assert_eq!(web.len(), 1, "{code}");
        assert!(web[0].contains("insert as _$insert "), "{}", web[0]);
        assert!(!web[0].contains("branch"), "{}", web[0]);
    }

    #[test]
    fn a_renamed_import_and_a_namespace_member_are_boundaries_too() {
        let renamed = mixed(
            "import { Canvas as Scene } from \"@barqjs/three\";\n\
             export const App = () => <div><Scene><mesh /></Scene></div>;\n",
        );
        assert!(renamed.contains("_$createElement$1(\"mesh\")"), "{renamed}");
        let namespaced = mixed(
            "import * as three from \"@barqjs/three\";\n\
             export const App = () => <div><three.Canvas><mesh /></three.Canvas></div>;\n",
        );
        assert!(namespaced.contains("_$createElement$1(\"mesh\")"), "{namespaced}");
        assert!(!namespaced.contains("<mesh"), "{namespaced}");
    }

    #[test]
    fn a_binding_that_is_not_the_import_is_an_ordinary_component() {
        let document = |code: &str| {
            assert!(code.contains("_$template(`<mesh></mesh>`)"), "{code}");
            assert!(!code.contains("createElement"), "{code}");
            assert!(!code.contains(RENDERER), "{code}");
        };
        // Shadowed by a local of the same name.
        document(&mixed(
            "import { Canvas } from \"@barqjs/three\";\n\
             export { Canvas };\n\
             export const App = () => {\n\
               const Canvas = (props) => props.children;\n\
               return <div><Canvas><mesh /></Canvas></div>;\n\
             };\n",
        ));
        // The same name, declared here.
        document(&mixed(
            "const Canvas = (props) => props.children;\n\
             export const App = () => <div><Canvas><mesh /></Canvas></div>;\n",
        ));
        // The same name, imported from somewhere else.
        document(&mixed(
            "import { Canvas } from \"./canvas.tsx\";\n\
             export const App = () => <div><Canvas><mesh /></Canvas></div>;\n",
        ));
    }

    #[test]
    fn function_children_and_a_children_attribute_cross_the_boundary() {
        let code = mixed(
            "import { Canvas } from \"@barqjs/three\";\n\
             export const A = () => <div><Canvas>{(state) => <mesh name={state.id} />}</Canvas></div>;\n\
             export const B = () => <div><Canvas children={<group />} /></div>;\n\
             export const C = () => <div><Canvas><><mesh /><group /></></Canvas></div>;\n",
        );
        assert_eq!(code.matches("_$createElement$1(\"mesh\")").count(), 2, "{code}");
        assert_eq!(code.matches("_$createElement$1(\"group\")").count(), 2, "{code}");
        assert!(!code.contains("<mesh") && !code.contains("<group"), "{code}");
    }

    #[test]
    fn boundaries_nest_and_switch_back_to_the_document() {
        let code = mixed(
            "import { Canvas, Html } from \"@barqjs/three\";\n\
             export const App = (p) => <div><Canvas><group>\
             <Html><section onClick={p.go}>{p.label()}\
             <Canvas><mesh /></Canvas></section></Html></group></Canvas></div>;\n",
        );
        assert!(code.contains("_$createElement$1(\"group\")"), "{code}");
        assert!(code.contains("_$template(`<section><!----></section>`)"), "{code}");
        assert!(code.contains("_$insert(_el$"), "{code}");
        assert!(code.contains("_$createElement$1(\"mesh\")"), "{code}");
        assert!(code.contains("_$delegateEvents([\"click\"])"), "{code}");
        assert_eq!(import_of(&code, RENDERER).len(), 1, "{code}");
        assert_eq!(import_of(&code, "@barqjs/web").len(), 1, "{code}");
    }

    #[test]
    fn helpers_join_an_import_of_the_renderer_the_module_already_writes() {
        let code = mixed(
            "import { Canvas } from \"@barqjs/three\";\n\
             import { extend } from \"@barqjs/three/renderer\";\n\
             extend({});\n\
             export const App = () => <div><Canvas><mesh /></Canvas></div>;\n",
        );
        let renderer = import_of(&code, RENDERER);
        assert_eq!(renderer.len(), 1, "{code}");
        assert!(renderer[0].contains("extend,"), "{}", renderer[0]);
        assert!(renderer[0].contains("createElement as _$createElement$1"), "{}", renderer[0]);
    }

    #[test]
    fn a_universal_module_enters_the_document_at_a_dom_boundary() {
        let code = compiled(
            "import { Html } from \"@barqjs/three\";\n\
             export const Label = (p) => <group><Html><p onClick={p.go}>{p.text()}</p></Html></group>;\n",
            &ResolvedOptions {
                target: RenderTarget::Universal,
                module_source: RENDERER.into(),
                ..options()
            },
        )
        .code;
        assert!(code.contains("_$createElement(\"group\")"), "{code}");
        assert!(code.contains("_$template$1(`<p></p>`)"), "{code}");
        assert!(code.contains("_$delegateEvents$1([\"click\"])"), "{code}");
        let web = import_of(&code, "@barqjs/web");
        assert_eq!(web.len(), 1, "{code}");
        assert!(web[0].contains("template as _$template$1"), "{}", web[0]);
    }

    #[test]
    fn the_server_renders_the_boundary_and_drops_a_custom_renderers_children() {
        let source = format!(
            "import {{ Canvas }} from \"@barqjs/three\";\n\
             import {{ Show }} from \"@barqjs/core\";\n{SCENE}"
        );
        let server =
            compiled(&source, &ResolvedOptions { ssr: true, hydratable: true, ..options() }).code;
        assert!(server.contains("_$esc(Canvas({ camera: p.cam }))"), "{server}");
        for absent in ["mesh", "group", "children", "createElement", RENDERER] {
            assert!(!server.contains(absent), "{absent} in\n{server}");
        }
        let client = compiled(&source, &ResolvedOptions { hydratable: true, ..options() }).code;
        // The boundary claims its range like any other component in a hole.
        assert!(client.contains("_$hole(_el$1, null, () => Canvas({"), "{client}");
        // A custom host claims nothing, so nothing inside asks to hydrate.
        assert!(client.contains("_$insert$1(_el$3, p.label);"), "{client}");
        assert!(client.contains("[null, _$block(() => {"), "{client}");
        assert!(client.contains("})], 2)"), "{client}");
        assert!(!client.contains("_$child$1") && !client.contains("_$hole$1"), "{client}");
    }

    #[test]
    fn document_diagnostics_follow_the_renderer_that_builds_the_element() {
        let bound = compiled(
            "import { Canvas } from \"@barqjs/three\";\n\
             export const A = (p) => <div><Canvas><input bind:value={p.pair} /></Canvas></div>;\n",
            &options(),
        );
        assert_eq!(codes(&bound), vec![Code::Barq027]);
        let outside = compiled(
            "import { Canvas } from \"@barqjs/three\";\n\
             export const A = (p) => <div><input bind:value={p.pair} /><Canvas /></div>;\n",
            &options(),
        );
        assert_eq!(codes(&outside), vec![]);
        let reshaped = |source: &str| {
            codes(&compiled(source, &options()))
                .into_iter()
                .filter(|code| *code == Code::Barq026)
                .count()
        };
        assert_eq!(
            reshaped(
                "import { Canvas } from \"@barqjs/three\";\n\
                 export const A = () => <div><Canvas><p><div /></p></Canvas></div>;\n"
            ),
            0
        );
        assert_eq!(
            reshaped(
                "import { Canvas } from \"@barqjs/three\";\n\
                 export const A = () => <div><p><div /></p><Canvas /></div>;\n"
            ),
            1
        );
    }

    #[test]
    fn a_module_that_calls_a_component_loads_every_renderers_host() {
        let code = mixed(
            "import { Canvas } from \"@barqjs/three\";\n\
             import { Show } from \"@barqjs/core\";\n\
             export const pick = () => Show;\n\
             export const App = () => <div><Canvas><mesh /></Canvas></div>;\n",
        );
        assert!(code.contains("import \"@barqjs/web/host\";"), "{code}");
        // The renderer's helper import already loads it.
        assert!(!code.contains("import \"@barqjs/three/renderer\";"), "{code}");
    }

    #[test]
    fn a_mixed_module_compiles_with_a_map_in_development() {
        let source = "import { Canvas, Html } from \"@barqjs/three\";\n\
             import { Show } from \"@barqjs/core\";\n\
             export const App = (p) => <main><h1>{p.title()}</h1><Canvas>\
             <Show when={p.on()}><mesh /></Show><Html><p>{p.title()}</p></Html>\
             </Canvas></main>;\n";
        let out = compiled(
            source,
            &ResolvedOptions { sourcemap: true, dev: true, hydratable: true, ..options() },
        );
        assert!(out.map.is_some());
        assert!(out.code.contains("_$branch$1("), "{}", out.code);
        assert!(out.code.contains("_$template(`<p></p>`, false, \"scene.tsx:"), "{}", out.code);
    }

    /// The option changes nothing for a module that writes no boundary.
    #[test]
    fn every_fixture_compiles_the_same_with_the_option_as_without() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let mut compared = 0;
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let name = path.file_name().expect("a name").to_string_lossy().to_string();
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            for (ssr, hydratable) in [(false, false), (false, true), (true, true)] {
                let plain =
                    ResolvedOptions { ssr, hydratable, ..ResolvedOptions::with_filename(&name) };
                let with = ResolvedOptions { boundaries: boundaries(), ..plain.clone() };
                let (plain, with) = (compile(&source, &plain), compile(&source, &with));
                match (plain, with) {
                    (Ok(plain), Ok(with)) => assert_eq!(plain.code, with.code, "{name}"),
                    (Err(_), Err(_)) => {}
                    _ => panic!("{name}: one compile failed and the other did not"),
                }
            }
            compared += 1;
        }
        assert!(compared >= 130, "only {compared} fixtures");
    }
}
