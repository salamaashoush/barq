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
    ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName, JSXChild, JSXElement,
    JSXElementName, JSXMemberExpressionObject, Program, Statement,
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

/// Records on the module which renderer each part of the source builds
/// through, and returns the source that builds through a custom renderer: no
/// HTML parser ever reads that markup, so nothing it says about the document
/// applies there.
///
/// Two things give source a renderer, outermost first. A boundary gives its
/// children the boundary's. Outside every boundary, a tree of intrinsic
/// elements takes the renderer its tags pick (`intrinsic_owner`), and
/// everything written inside it follows that tree. A component outside both
/// whose JSX descendants all went to one renderer goes with them, which is
/// what makes a `<Show>` around a claimed tree that renderer's `branch`.
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
    let resolver = Resolver::new(program, &options.boundaries);
    if resolver.is_empty() && options.intrinsics.is_empty() {
        return Vec::new();
    }
    let mut scan = Scan {
        allocator,
        module,
        options,
        resolver,
        claimants: vec![None; options.intrinsics.len()],
        custom: Vec::new(),
        assigned: None,
        collected: Vec::new(),
    };
    scan.visit_program(program);
    scan.custom
}

/// Who an intrinsic tree's tags give it to.
enum Owner {
    Document,
    Claimant(usize),
    /// Two entries claim it, and neither wins.
    Contested(usize, usize),
}

/// The renderer a tree of intrinsic elements outside every boundary builds
/// through, from its root tag and, when the document has that name too, the
/// tags under it. `tags` is the tree's every tag, the root first.
fn intrinsic_owner(intrinsics: &[crate::options::Intrinsic], tags: &[&str]) -> Owner {
    let Some(root) = tags.first() else { return Owner::Document };
    let claimants = |tag: &str| -> Vec<usize> {
        intrinsics
            .iter()
            .enumerate()
            .filter(|(_, entry)| entry.tags.iter().any(|it| it == tag))
            .map(|(index, _)| index)
            .collect()
    };
    let decide = |found: &[usize]| match found {
        [] => Owner::Document,
        [one] => Owner::Claimant(*one),
        [first, second, ..] => Owner::Contested(*first, *second),
    };
    // A custom element is the document's whatever any renderer says.
    if root.contains('-') {
        return Owner::Document;
    }
    let document = crate::tables::is_document_tag(root);
    let claimed = claimants(root);
    if !document {
        if !claimed.is_empty() {
            return decide(&claimed);
        }
        let unknown: Vec<usize> = intrinsics
            .iter()
            .enumerate()
            .filter(|(_, entry)| entry.claim_unknown)
            .map(|(index, _)| index)
            .collect();
        return decide(&unknown);
    }
    // A name both have stays the document's unless the tree also holds a tag
    // that only this renderer has: `<line>` alone is SVG, `<line>` around a
    // `<bufferGeometry>` is a scene object. Anything inside an `<svg>` is SVG.
    let [claimant] = claimed[..] else { return decide(&claimed) };
    if tags.contains(&"svg") {
        return Owner::Document;
    }
    let only_here = tags[1..]
        .iter()
        .any(|tag| !crate::tables::is_document_tag(tag) && claimants(tag) == [claimant]);
    if only_here { Owner::Claimant(claimant) } else { Owner::Document }
}

/// Every tag of the tree of intrinsic elements rooted at `element`, the root
/// first: its intrinsic children, and theirs, through fragments but not
/// through an expression, which is a position of its own.
fn tree_tags<'e>(element: &'e JSXElement<'_>, into: &mut Vec<&'e str>) {
    let JSXElementName::Identifier(name) = &element.opening_element.name else { return };
    into.push(name.name.as_str());
    fn children<'e>(list: &'e [JSXChild<'_>], into: &mut Vec<&'e str>) {
        for child in list {
            match child {
                JSXChild::Element(element) => tree_tags(element, into),
                JSXChild::Fragment(fragment) => children(&fragment.children, into),
                _ => {}
            }
        }
    }
    children(&element.children, into);
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
    /// Per `intrinsics` entry, its renderer once one of its trees was met.
    claimants: Vec<Option<Option<u8>>>,
    custom: Vec<(u32, u32)>,
    /// The renderer the source being walked builds through, once a boundary
    /// or an intrinsic tree gave it one. `None` is the module's top level.
    assigned: Option<u8>,
    /// Per component open at the top level, the renderers its intrinsic
    /// trees went to.
    collected: Vec<Vec<u8>>,
}

impl<'a> Scan<'_, 'a, '_> {
    /// The renderer an entry's elements build through, or `None` for a
    /// custom renderer's elements in a server build.
    fn renderer(&mut self, target: RenderTarget, source: &str) -> Option<u8> {
        let own = self.module.target;
        let target = match (target, own) {
            (RenderTarget::Universal, Target::Ssr) => return None,
            (RenderTarget::Universal, _) => Target::Universal,
            (RenderTarget::Dom, Target::Universal) => Target::Dom,
            (RenderTarget::Dom, own) => own,
        };
        // The string backend imports nothing from a renderer, so every
        // document boundary renders through the module's own.
        if own == Target::Ssr || (target == own && source == self.options.module_source) {
            return Some(0);
        }
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

    fn boundary(&mut self, element: &JSXElement<'a>, boundary: &Boundary) {
        let custom = boundary.target == RenderTarget::Universal;
        let renderer = self.renderer(boundary.target, &boundary.module_source);
        let mut ranges = Vec::new();
        if let Some(closing) = &element.closing_element {
            let range = (element.opening_element.span.end, closing.span.start);
            if range.0 < range.1 {
                ranges.push(range);
            }
        }
        let mut given = Vec::new();
        for item in &element.opening_element.attributes {
            match item {
                JSXAttributeItem::Attribute(attribute)
                    if matches!(&attribute.name, JSXAttributeName::Identifier(name)
                        if name.name == "children") =>
                {
                    if let Some(value) = &attribute.value {
                        let span = oxc::span::GetSpan::span(value);
                        ranges.push((span.start, span.end));
                        given.push(value);
                    }
                }
                // The element's own props build through the renderer around it.
                _ => self.visit_jsx_attribute_item(item),
            }
        }
        for (start, end) in ranges {
            if let Some(renderer) = renderer {
                self.module.renderer_ranges.push((start, end, renderer));
            }
            if custom {
                self.custom.push((start, end));
            }
        }
        let Some(renderer) = renderer else { return };
        let outer = self.assigned.replace(renderer);
        let collected = std::mem::take(&mut self.collected);
        for value in given {
            self.visit_jsx_attribute_value(value);
        }
        for child in &element.children {
            self.visit_jsx_child(child);
        }
        self.collected = collected;
        self.assigned = outer;
    }

    /// Gives a tree of intrinsic elements at the top level its renderer, and
    /// returns it.
    fn tree(&mut self, element: &JSXElement<'a>) -> u8 {
        if self.options.intrinsics.is_empty() {
            return 0;
        }
        let mut tags = Vec::new();
        tree_tags(element, &mut tags);
        match intrinsic_owner(&self.options.intrinsics, &tags) {
            Owner::Document => 0,
            Owner::Claimant(index) => {
                let entry = &self.options.intrinsics[index];
                let renderer = match self.claimants[index] {
                    Some(renderer) => renderer,
                    None => {
                        let renderer = self.renderer(entry.target, &entry.module_source);
                        self.claimants[index] = Some(renderer);
                        renderer
                    }
                };
                let span = (element.span.start, element.span.end);
                if entry.target == RenderTarget::Universal {
                    self.custom.push(span);
                }
                let renderer = renderer.unwrap_or(0);
                if renderer != 0 {
                    self.module.renderer_ranges.push((span.0, span.1, renderer));
                }
                renderer
            }
            Owner::Contested(first, second) => {
                let tag = tags[0];
                let first = &self.options.intrinsics[first].module_source;
                let second = &self.options.intrinsics[second].module_source;
                let named =
                    self.options.intrinsics.iter().any(|it| it.tags.iter().any(|t| t == tag));
                let claim = if named {
                    format!("`<{tag}>` is claimed by two renderers, `{first}` and `{second}`")
                } else {
                    format!(
                        "`<{tag}>` is not an element of the document, and two renderers, \
                         `{first}` and `{second}`, claim every such tag"
                    )
                };
                let message = self.allocator.alloc_str(&format!(
                    "{claim}, so it compiles for the document. Claim it in your own \
                     `intrinsics` configuration, which wins over what a package declares."
                ));
                self.module.env.diagnostics.push(crate::ir::Diag {
                    code: crate::diag::Code::Barq029,
                    span: element.opening_element.span,
                    message,
                });
                0
            }
        }
    }
}

impl<'a> Visit<'a> for Scan<'_, 'a, '_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        let name = &element.opening_element.name;
        if let Some(boundary) = self.resolver.entry(&self.module.scoping, name) {
            self.boundary(element, boundary);
            return;
        }
        if self.assigned.is_some() {
            walk::walk_jsx_element(self, element);
            return;
        }
        if matches!(name, JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_)) {
            let renderer = self.tree(element);
            if let Some(open) = self.collected.last_mut() {
                open.push(renderer);
            }
            self.assigned = Some(renderer);
            walk::walk_jsx_element(self, element);
            self.assigned = None;
            return;
        }
        self.collected.push(Vec::new());
        walk::walk_jsx_element(self, element);
        let found = self.collected.pop().unwrap_or_default();
        if let [first, rest @ ..] = &found[..]
            && *first != 0
            && rest.iter().all(|it| it == first)
        {
            self.module.renderer_ranges.push((element.span.start, element.span.end, *first));
        }
        if let Some(open) = self.collected.last_mut() {
            open.extend(found);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::{CompileOutput, compile};
    use crate::diag::Code;
    use crate::options::{Boundary, Intrinsic, RenderTarget, ResolvedOptions};

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

    /// The scene renderer's tags, the four the document also has among them.
    fn three(claim_unknown: bool) -> Intrinsic {
        Intrinsic {
            tags: [
                "mesh",
                "group",
                "boxGeometry",
                "bufferGeometry",
                "meshStandardMaterial",
                "lineBasicMaterial",
                "ambientLight",
                "line",
                "audio",
                "path",
                "source",
                "my-mesh",
            ]
            .map(String::from)
            .to_vec(),
            claim_unknown,
            target: RenderTarget::Universal,
            module_source: RENDERER.into(),
        }
    }

    fn claiming(intrinsics: Vec<Intrinsic>) -> ResolvedOptions {
        ResolvedOptions { intrinsics, ..options() }
    }

    fn claimed(source: &str) -> String {
        compiled(source, &claiming(vec![three(true)])).code
    }

    /// Whether the tree built for `tag` is the scene renderer's or the document's.
    fn scene(code: &str, tag: &str) -> bool {
        code.contains(&format!("_$createElement$1(\"{tag}\")"))
    }

    fn document(code: &str, tag: &str) -> bool {
        code.lines().any(|line| line.contains("_$template(`") && line.contains(&format!("<{tag}")))
    }

    #[test]
    fn a_tree_rooted_at_a_claimed_tag_builds_through_its_renderer_anywhere_in_the_file() {
        let code = claimed(
            "export function Box(p) {\n\
               return <mesh position={p.at()}><boxGeometry args={[1, 1, 1]} /></mesh>;\n\
             }\n\
             export const App = (p) => <main><h1>{p.title()}</h1><Box at={p.at} /></main>;\n",
        );
        assert!(scene(&code, "mesh") && scene(&code, "boxGeometry"), "{code}");
        assert!(document(&code, "main"), "{code}");
        assert_eq!(import_of(&code, RENDERER).len(), 1, "{code}");
    }

    #[test]
    fn a_name_the_document_also_has_is_the_renderers_only_over_a_tag_of_its_own() {
        let code = claimed(
            "export const Edge = () => <line><bufferGeometry /><lineBasicMaterial /></line>;\n\
             export const Stroke = () => <line x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\" />;\n\
             export const Icon = () => <svg><line x1=\"0\" /></svg>;\n\
             export const Drawn = () => <path><svg /><boxGeometry /></path>;\n\
             export const Player = () => <audio src=\"/salama.mp3\" />;\n",
        );
        assert!(scene(&code, "line") && scene(&code, "bufferGeometry"), "{code}");
        assert!(document(&code, "line x1"), "{code}");
        assert!(document(&code, "svg><line"), "{code}");
        assert!(document(&code, "path"), "{code}");
        assert!(document(&code, "audio"), "{code}");
    }

    #[test]
    fn an_unknown_tag_goes_to_the_one_renderer_that_claims_unknown_tags() {
        let source = "export const Controls = () => <orbitControls enableDamping />;\n";
        assert!(scene(&claimed(source), "orbitControls"));
        let unclaimed = compiled(source, &claiming(vec![three(false)])).code;
        assert!(document(&unclaimed, "orbitControls"), "{unclaimed}");
    }

    #[test]
    fn a_custom_element_is_the_documents_whatever_a_renderer_claims() {
        let code = claimed("export const Card = () => <my-mesh><boxGeometry /></my-mesh>;\n");
        assert!(document(&code, "my-mesh"), "{code}");
    }

    #[test]
    fn two_renderers_claiming_one_tag_is_barq029_and_the_document_builds_it() {
        let other = |claim_unknown| Intrinsic {
            module_source: "@acme/other/renderer".into(),
            ..three(claim_unknown)
        };
        let named = compiled(
            "export const Box = () => <mesh />;\n",
            &claiming(vec![three(false), other(false)]),
        );
        assert_eq!(codes(&named), vec![Code::Barq029]);
        let message = &named.warnings[0].message;
        assert!(
            message.contains(RENDERER) && message.contains("@acme/other/renderer"),
            "{message}"
        );
        assert!(document(&named.code, "mesh"), "{}", named.code);

        let unknown = compiled(
            "export const Controls = () => <orbitControls />;\n",
            &claiming(vec![three(true), other(true)]),
        );
        assert_eq!(codes(&unknown), vec![Code::Barq029]);
        assert!(unknown.warnings[0].message.contains("not an element of the document"));
        assert!(document(&unknown.code, "orbitControls"), "{}", unknown.code);
    }

    #[test]
    fn what_is_written_inside_a_tree_or_a_boundary_follows_it() {
        let code = claimed(
            "import { Canvas } from \"@barqjs/three\";\n\
             export const A = (p) => <group>{p.on() && <div class=\"tip\" />}</group>;\n\
             export const B = (p) => <div>{p.on() && <mesh />}</div>;\n\
             export const C = () => <section><Canvas><div class=\"in\" /></Canvas></section>;\n",
        );
        assert!(scene(&code, "group") && scene(&code, "div"), "{code}");
        assert!(!scene(&code, "mesh") && document(&code, "mesh"), "{code}");
        assert!(document(&code, "section"), "{code}");
        assert_eq!(code.matches("_$createElement$1(\"div\")").count(), 2, "{code}");
    }

    #[test]
    fn control_flow_around_claimed_trees_is_the_renderers() {
        let code = claimed(
            "import { For, Show } from \"@barqjs/core\";\n\
             export const S = (p) => <Show when={p.on()}><mesh /></Show>;\n\
             export const F = (p) => <For each={p.rows()}>{(row) => <group name={row} />}</For>;\n\
             export const D = (p) => <Show when={p.on()}><div /></Show>;\n",
        );
        assert!(code.contains("_$branch$1("), "{code}");
        assert!(code.contains("_$each$1("), "{code}");
        assert!(code.contains("_$branch("), "{code}");
        assert!(scene(&code, "mesh") && scene(&code, "group"), "{code}");
        assert!(document(&code, "div"), "{code}");
    }

    #[test]
    fn each_tree_in_a_fragment_picks_its_own_renderer() {
        let code = claimed("export const Both = () => <><mesh /><div /></>;\n");
        assert!(scene(&code, "mesh"), "{code}");
        assert!(document(&code, "div"), "{code}");
    }

    #[test]
    fn a_claimed_tree_raises_no_document_diagnostic() {
        let out = compiled(
            "export const A = () => <mesh><p><div /></p></mesh>;\n",
            &claiming(vec![three(true)]),
        );
        assert_eq!(codes(&out), vec![]);
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

    /// The options change nothing for a module that writes no boundary and no
    /// tag a renderer claims.
    #[test]
    fn every_fixture_compiles_the_same_with_the_options_as_without() {
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
                let with = ResolvedOptions {
                    boundaries: boundaries(),
                    intrinsics: vec![three(true)],
                    ..plain.clone()
                };
                let (plain, with) = (compile(&source, &plain), compile(&source, &with));
                // No fixture writes a tag the scene renderer claims or one the
                // document does not have, so none of them may change.
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
