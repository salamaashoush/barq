//! L2b's expected value: the static ownership tree.
//!
//! `CODESIGN.md` §5.2 (P-new `scope`) and §6 L2b. The tree is derived from the
//! source, never from a second execution, so it is the one oracle channel that
//! needs no reference implementation. `SEMANTICS.md` O1 fixes which constructs
//! own — `render`, a `branch` instance, an `each` row, `provide`, `boundary`,
//! `portal`, and a component call owns NOTHING — and O2 fixes what a Block runs
//! under. This module answers, per compiled position, which of those constructs
//! must be its ancestors.
//!
//! It reads the program before `harvest` moves the JSX out, and it writes
//! nothing: no `Module` field it produces reaches lowering, the passes or
//! codegen. The emitted bytes cannot move.

use std::fmt::Write as _;

use oxc::ast::ast::{
    ArrowFunctionExpression, BindingPattern, Declaration, ExportDefaultDeclarationKind, Expression,
    Function, IdentifierReference, JSXAttributeItem, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName, JSXExpression, JSXMemberExpressionObject, Program, Statement,
    StaticMemberExpression,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::{Scoping, SymbolId};
use oxc::span::Span;
use rustc_hash::FxHashMap;

use crate::ir::{Flow, Module, NONE};

/// What a node in the tree is. Only [`OwnKind::scopes`] members own; the rest
/// are structure the trace has to be able to name.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OwnKind {
    /// the render root — `render`'s scope (O5)
    Root,
    /// a user component call. Owns nothing (O1).
    Component,
    /// `<Ctx.Provider>` — `provide` (X1)
    Provide,
    /// `Show` / `Switch` / `Match` / `Dynamic` and the boundaries — `branch`
    Branch,
    /// `For` / `Index` / `Repeat` — an `each` row
    Each,
    /// `Portal`
    Portal,
}

impl OwnKind {
    /// O1: the scope creation set is closed. A component call is not in it.
    #[inline]
    pub fn scopes(self) -> bool {
        !matches!(self, OwnKind::Component)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            OwnKind::Root => "root",
            OwnKind::Component => "component",
            OwnKind::Provide => "provide",
            OwnKind::Branch => "branch",
            OwnKind::Each => "each",
            OwnKind::Portal => "portal",
        }
    }

    fn of_flow(flow: Flow) -> Self {
        match flow {
            Flow::For | Flow::Index | Flow::Repeat => OwnKind::Each,
            Flow::Portal => OwnKind::Portal,
            // X1: `Reveal` installs a coordinator and owns no range, so what it
            // creates is a PROVIDE scope. Calling it a branch was the reading
            // that fell out of "everything else is a branch", and it made the
            // one construct in the set whose whole job is a context binding
            // indistinguishable from a conditional.
            Flow::Reveal => OwnKind::Provide,
            _ => OwnKind::Branch,
        }
    }
}

#[derive(Clone, Debug)]
pub struct OwnNode {
    pub id: u32,
    /// [`NONE`] on the root
    pub parent: u32,
    pub kind: OwnKind,
    /// Whether this node's construct creates a scope at run time. It starts as
    /// [`OwnKind::scopes`] and is CLEARED by [`attach`] for a region the flow
    /// pass proved `NO_SCOPE` on — the runtime then activates without entering
    /// one, and a tree that still claimed it would put a step in the path the
    /// trace can never produce.
    pub scopes: bool,
    /// `span.start` of the JSX element, which is what joins a node to the
    /// region the compiler built from it. Not serialised.
    pub span: u32,
    /// the construct as written: `Theme.Provider`, `Show`, `Badge`
    pub label: String,
    pub line: u32,
    pub column: u32,
}

/// A compiled unit, attributed to the node that owns the position it occupies.
/// One unit reached through two call sites of one component is two positions.
#[derive(Clone, Debug)]
pub struct OwnPosition {
    pub node: u32,
    /// the emitted binding: `_tmpl$1`
    pub template: String,
    /// the template's bytes, which is what the runtime trace can name
    pub html: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug, Default)]
pub struct OwnershipTree {
    pub nodes: Vec<OwnNode>,
    pub positions: Vec<OwnPosition>,
    /// One entry per component the module could be rendered *from*, in source
    /// order: `(name, root node)`. A forest rather than a tree, because the
    /// harness renders whichever component a fixture drives and the L1
    /// fixtures under `fixtures/semantics/` export claims rather than a
    /// component — their subject is a module-local `Direct`, and a tree rooted
    /// only at the default export would be empty exactly where the M0 gate is.
    pub roots: Vec<(String, u32)>,
    /// A component the walk could not follow (imported, or reached through an
    /// expression). Its subtree is absent, so the harness knows the tree is
    /// partial rather than treating silence as proof.
    pub opaque: Vec<String>,
    /// `span.start` of every JSX element → the nodes it was reached under.
    /// Not serialised; `attach` consumes it.
    spans: FxHashMap<u32, Vec<u32>>,
}

/// Blow-up guards. A component that calls itself is stopped by the stack check;
/// these stop the mutual and the merely wide cases.
const MAX_NODES: usize = 4096;
const MAX_DEPTH: usize = 64;

/// Build the ownership forest for `program`: one tree per top-level component,
/// in source order, with the module's default export named `default` as well.
///
/// Runs after `analysis::bind` (it needs `Scoping` and the flow classification)
/// and before `harvest` (it needs the JSX still in the program).
pub fn build<'a>(program: &Program<'a>, module: &Module<'a>) -> OwnershipTree {
    let mut components: FxHashMap<SymbolId, Def<'a, '_>> = FxHashMap::default();
    // Source order, so the artefact is stable across runs — a `FxHashMap`
    // iteration order is not, and the harness diffs this text.
    let mut declared: Vec<(SymbolId, &str)> = Vec::new();

    // Two passes: a module may `export default App` above `App`'s declaration.
    for statement in &program.body {
        match statement {
            Statement::FunctionDeclaration(function) => {
                collect_function(&mut components, &mut declared, function);
            }
            Statement::VariableDeclaration(declaration) => {
                for declarator in &declaration.declarations {
                    collect_declarator(&mut components, &mut declared, declarator);
                }
            }
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::FunctionDeclaration(function) => {
                    collect_function(&mut components, &mut declared, function);
                }
                Declaration::VariableDeclaration(declaration) => {
                    for declarator in &declaration.declarations {
                        collect_declarator(&mut components, &mut declared, declarator);
                    }
                }
                _ => {}
            },
            Statement::ExportDefaultDeclaration(export) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(function) =
                    &export.declaration
                {
                    collect_function(&mut components, &mut declared, function.as_ref());
                }
            }
            _ => {}
        }
    }

    let mut entry: Option<Def<'a, '_>> = None;
    let mut entry_symbol: Option<SymbolId> = None;
    let mut entry_name = "default";
    for statement in &program.body {
        let Statement::ExportDefaultDeclaration(export) = statement else { continue };
        match &export.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                if let Some(id) = function.id.as_ref() {
                    entry_name = id.name.as_str();
                    entry_symbol = id.symbol_id.get();
                }
                entry = Some(Def::Fn(function.as_ref()));
            }
            ExportDefaultDeclarationKind::ArrowFunctionExpression(arrow) => {
                entry = Some(Def::Arrow(arrow.as_ref()));
            }
            ExportDefaultDeclarationKind::Identifier(identifier) => {
                if let Some(symbol) = identifier
                    .reference_id
                    .get()
                    .and_then(|id| module.scoping.get_reference(id).symbol_id())
                {
                    entry_name = module.scoping.symbol_name(symbol);
                    entry_symbol = Some(symbol);
                    entry = components.get(&symbol).copied();
                }
            }
            _ => {}
        }
    }

    let mut tree = OwnershipTree::default();
    let mut plan: Vec<(Vec<String>, Def<'a, '_>)> = Vec::new();
    if let Some(entry) = entry {
        // Both names address one node. A second tree for the same function
        // would duplicate every subtree under it and say nothing new.
        let mut names = vec!["default".to_string()];
        if entry_name != "default" {
            names.push(entry_name.to_string());
        }
        plan.push((names, entry));
    }
    for (symbol, name) in &declared {
        if entry_symbol == Some(*symbol) {
            continue;
        }
        let Some(def) = components.get(symbol).copied() else { continue };
        // A helper that builds no JSX is not a component, and rooting a tree at
        // it would claim a render nobody can perform.
        if !holds_jsx(def) {
            continue;
        }
        plan.push((vec![(*name).to_string()], def));
    }

    for (names, def) in plan {
        if tree.nodes.len() >= MAX_NODES {
            break;
        }
        let label = names.last().cloned().unwrap_or_else(|| "default".to_string());
        let root = tree.push(NONE, OwnKind::Root, label, Span::default(), module);
        for name in names {
            tree.roots.push((name, root));
        }
        let mut builder = Builder {
            tree: &mut tree,
            module,
            scoping: &module.scoping,
            components: &components,
            stack: Vec::new(),
            slots: Vec::new(),
        };
        let _ = builder.component_body(def, root);
    }
    tree
}

/// Does this function build JSX anywhere in its body? The forest's roots are
/// components, and `bind` already knows what a component is at the level of a
/// call site — this is the definition-site half of the same question.
fn holds_jsx(def: Def<'_, '_>) -> bool {
    struct Seek(bool);
    impl<'a> Visit<'a> for Seek {
        fn visit_jsx_element(&mut self, _: &JSXElement<'a>) {
            self.0 = true;
        }
        fn visit_jsx_fragment(&mut self, _: &oxc::ast::ast::JSXFragment<'a>) {
            self.0 = true;
        }
    }
    let mut seek = Seek(false);
    match def {
        Def::Fn(function) => {
            if let Some(body) = function.body.as_ref() {
                seek.visit_function_body(body);
            }
        }
        Def::Arrow(arrow) => seek.visit_arrow_function_body(&arrow.body),
    }
    seek.0
}

/// Attach every compiled unit to the node that owns its position, once the
/// passes have assigned template ids. Read-only over the module.
pub fn attach(tree: &mut OwnershipTree, module: &Module<'_>) {
    // The flow pass proved `NO_SCOPE` for some regions, and a proof is a fact
    // about the RUNTIME: no `Scope` is entered for that activation. The tree is
    // built before the pass runs and cannot compute it a second time without
    // becoming a second predicate that could disagree, so the one decision is
    // carried here, joined by the JSX span both sides hold.
    for region in crate::passes::regions_of(module) {
        if region.emitted_flags() & crate::ir::NO_SCOPE == 0 {
            continue;
        }
        for node in tree.nodes.iter_mut() {
            if node.span == region.span.start
                && matches!(node.kind, OwnKind::Branch | OwnKind::Portal)
            {
                node.scopes = false;
            }
        }
    }
    for unit in &module.units {
        if unit.template == NONE {
            continue;
        }
        let root = unit.skeleton.roots.0 as usize;
        let Some(span) = unit.spans.get(root).copied() else { continue };
        let Some(nodes) = tree.spans.get(&span.start) else { continue };
        let template = format!("{}{}", module.uids.template_prefix(), unit.template + 1);
        let html = module.template_html(unit.template).to_string();
        let (line, column) = locate(module.source, span.start);
        for node in nodes.clone() {
            tree.positions.push(OwnPosition {
                node,
                template: template.clone(),
                html: html.clone(),
                line,
                column,
            });
        }
    }
}

impl OwnershipTree {
    fn push(
        &mut self,
        parent: u32,
        kind: OwnKind,
        label: String,
        span: Span,
        module: &Module<'_>,
    ) -> u32 {
        let id = self.nodes.len() as u32;
        let (line, column) = locate(module.source, span.start);
        self.nodes.push(OwnNode {
            id,
            parent,
            kind,
            scopes: kind.scopes(),
            span: span.start,
            label,
            line,
            column,
        });
        id
    }

    /// The scope-creating ancestors of `node`, outermost first, as O1 kinds.
    /// This is the sequence the runtime trace has to contain.
    pub fn scope_path(&self, node: u32) -> Vec<&'static str> {
        let mut path = Vec::new();
        let mut at = node;
        while at != NONE {
            let entry = &self.nodes[at as usize];
            if entry.scopes {
                path.push(entry.kind.as_str());
            }
            at = entry.parent;
        }
        path.reverse();
        path
    }

    /// The root of `node`'s tree — which component a harness must render for
    /// this position to be reachable at all. Returned as the node id, because
    /// the LABEL is ambiguous: the default export carries its own name and is
    /// also addressable as `default`, and only the id joins the two.
    fn root_of(&self, node: u32) -> u32 {
        let mut at = node;
        loop {
            let entry = &self.nodes[at as usize];
            if entry.parent == NONE {
                return at;
            }
            at = entry.parent;
        }
    }

    /// The artefact, as JSON. Deliberately hand-written: this crate has no
    /// serialiser, and the shape is eight fields.
    pub fn to_json(&self) -> String {
        let mut out = String::with_capacity(256 + self.nodes.len() * 96);
        out.push_str("{\"version\":2,\"roots\":[");
        for (index, (name, node)) in self.roots.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            out.push_str("{\"name\":");
            quote(&mut out, name);
            let _ = write!(out, ",\"node\":{node}}}");
        }
        out.push_str("],\"nodes\":[");
        for (index, node) in self.nodes.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            let _ = write!(
                out,
                "{{\"id\":{},\"parent\":{},\"kind\":\"{}\",\"scope\":{},\"label\":",
                node.id,
                if node.parent == NONE { -1 } else { node.parent as i64 },
                node.kind.as_str(),
                node.scopes,
            );
            quote(&mut out, &node.label);
            let _ = write!(out, ",\"line\":{},\"column\":{}}}", node.line, node.column);
        }
        out.push_str("],\"positions\":[");
        for (index, position) in self.positions.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            let _ = write!(out, "{{\"node\":{},\"template\":", position.node);
            quote(&mut out, &position.template);
            out.push_str(",\"html\":");
            quote(&mut out, &position.html);
            let root = self.root_of(position.node);
            let _ = write!(out, ",\"rootNode\":{root},\"root\":");
            quote(&mut out, &self.nodes[root as usize].label);
            out.push_str(",\"path\":[");
            for (step, kind) in self.scope_path(position.node).iter().enumerate() {
                if step > 0 {
                    out.push(',');
                }
                let _ = write!(out, "\"{kind}\"");
            }
            let _ = write!(out, "],\"line\":{},\"column\":{}}}", position.line, position.column);
        }
        out.push_str("],\"opaque\":[");
        for (index, name) in self.opaque.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            quote(&mut out, name);
        }
        out.push_str("]}");
        out
    }
}

fn quote(out: &mut String, value: &str) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

fn locate(source: &str, offset: u32) -> (u32, u32) {
    let offset = (offset as usize).min(source.len());
    let head = &source[..offset];
    let line = head.bytes().filter(|byte| *byte == b'\n').count() as u32 + 1;
    let column = head.rfind('\n').map_or(offset, |at| offset - at - 1) as u32 + 1;
    (line, column)
}

#[derive(Clone, Copy)]
enum Def<'a, 'p> {
    Fn(&'p Function<'a>),
    Arrow(&'p ArrowFunctionExpression<'a>),
}

fn collect_function<'a, 'p>(
    into: &mut FxHashMap<SymbolId, Def<'a, 'p>>,
    declared: &mut Vec<(SymbolId, &'a str)>,
    function: &'p Function<'a>,
) {
    if let Some(id) = function.id.as_ref()
        && let Some(symbol) = id.symbol_id.get()
        && into.insert(symbol, Def::Fn(function)).is_none()
    {
        declared.push((symbol, id.name.as_str()));
    }
}

fn collect_declarator<'a, 'p>(
    into: &mut FxHashMap<SymbolId, Def<'a, 'p>>,
    declared: &mut Vec<(SymbolId, &'a str)>,
    declarator: &'p oxc::ast::ast::VariableDeclarator<'a>,
) {
    let BindingPattern::BindingIdentifier(identifier) = &declarator.id else { return };
    let Some(symbol) = identifier.symbol_id.get() else { return };
    let def = match declarator.init.as_ref() {
        Some(Expression::ArrowFunctionExpression(arrow)) => Def::Arrow(arrow),
        Some(Expression::FunctionExpression(function)) => Def::Fn(function),
        _ => return,
    };
    if into.insert(symbol, def).is_none() {
        declared.push((symbol, identifier.name.as_str()));
    }
}

struct Builder<'a, 'p, 'm> {
    tree: &'m mut OwnershipTree,
    module: &'m Module<'a>,
    scoping: &'m Scoping,
    components: &'m FxHashMap<SymbolId, Def<'a, 'p>>,
    /// components currently being expanded, so recursion terminates
    stack: Vec<SymbolId>,
    /// one frame per component body currently being expanded
    slots: Vec<SlotFrame>,
}

/// Where a component body renders the children it was handed.
///
/// Without this the tree encodes the EMITTER's belief — that a call site's
/// children belong to the call site — and a user-written provider wrapper
/// (`<ThemeProvider><Label/></ThemeProvider>` over
/// `<Theme.Provider …>{props.children}</Theme.Provider>`) has its defect
/// attributed to exactly the place the runtime wrongly puts it, so the two
/// agree and the channel reports nothing. That is the same-belief failure this
/// channel exists to escape, and the shape every `AuthProvider` in the world
/// has.
struct SlotFrame {
    /// the first parameter, when it is a plain binding: `props.children`
    props: Option<SymbolId>,
    /// a destructured `{ children }` binding, referenced bare
    children: Option<SymbolId>,
    /// the node the children slot was rendered under, once one is seen
    found: Option<u32>,
}

impl<'a, 'p> Builder<'a, 'p, '_> {
    /// Walk a component's body for JSX, attributing everything it builds to
    /// `owner`. A component call creates no scope (O1), so `owner` is unchanged
    /// by the descent itself.
    ///
    /// Returns the node the body renders its `children` slot under, when the
    /// walk can see one. That is where the CALL SITE's children belong: a
    /// component owns nothing, but the construct it forwards them into does.
    fn component_body(&mut self, def: Def<'a, 'p>, owner: u32) -> Option<u32> {
        self.slots.push(slot_frame(def));
        {
            let mut collect = Collect { builder: self, owner };
            match def {
                Def::Fn(function) => {
                    if let Some(body) = function.body.as_ref() {
                        collect.visit_function_body(body);
                    }
                }
                Def::Arrow(arrow) => collect.visit_arrow_function_body(&arrow.body),
            }
        }
        self.slots.pop().and_then(|frame| frame.found)
    }

    /// A bare identifier that is the destructured `children` binding.
    fn note_children_identifier(&mut self, symbol: Option<SymbolId>, owner: u32) {
        let Some(frame) = self.slots.last_mut() else { return };
        if frame.found.is_some() || symbol.is_none() {
            return;
        }
        if symbol == frame.children {
            frame.found = Some(owner);
        }
    }

    /// `<props>.children`, where `<props>` is the body's first parameter.
    fn note_children_member(&mut self, symbol: Option<SymbolId>, property: &str, owner: u32) {
        let Some(frame) = self.slots.last_mut() else { return };
        if frame.found.is_some() || symbol.is_none() || property != "children" {
            return;
        }
        if symbol == frame.props {
            frame.found = Some(owner);
        }
    }

    fn element(&mut self, element: &JSXElement<'a>, owner: u32) {
        if self.tree.nodes.len() >= MAX_NODES || self.stack.len() >= MAX_DEPTH {
            return;
        }
        self.tree.spans.entry(element.span.start).or_default().push(owner);

        let name = &element.opening_element.name;
        // Where the element's own children go. It differs from `inner` for
        // exactly one shape: a component whose body forwards `props.children`
        // into a construct that DOES own — the provider wrapper.
        let mut children_owner = None;
        let inner = match self.classify(name) {
            Tag::Intrinsic => owner,
            // C8-adjacent: `Match` builds nothing and owns nothing. It carries a
            // `when` and a body for the `Switch` above it to read, and §3.4
            // collapses the pair into ONE `branch` with one instance scope per
            // activation. A node here made the static tree claim a scope the
            // runtime has never had and never will.
            Tag::Flow(Flow::Match, _) => owner,
            Tag::Flow(flow, label) => {
                self.tree.push(owner, OwnKind::of_flow(flow), label, element.span, self.module)
            }
            Tag::Provide(label) => {
                self.tree.push(owner, OwnKind::Provide, label, element.span, self.module)
            }
            Tag::Component(label, symbol) => {
                let node =
                    self.tree.push(owner, OwnKind::Component, label, element.span, self.module);
                match symbol.and_then(|symbol| {
                    self.components.get(&symbol).copied().map(|def| (symbol, def))
                }) {
                    Some((symbol, def)) if !self.stack.contains(&symbol) => {
                        self.stack.push(symbol);
                        let slot = self.component_body(def, node);
                        self.stack.pop();
                        match slot {
                            Some(at) => children_owner = Some(at),
                            // The walk followed the body and never found the
                            // children slot in it. Silence must not read as
                            // `determined`: the tree is partial exactly here.
                            None if has_content(element) => self.mark_opaque(node),
                            None => {}
                        }
                    }
                    Some(_) => {}
                    None => self.mark_opaque(node),
                }
                node
            }
        };

        // Attribute values are slots (C6): a JSX-valued prop is a Block the
        // construct invokes under its own scope, so it belongs to `inner`.
        for item in &element.opening_element.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else { continue };
            match attribute.value.as_ref() {
                Some(JSXAttributeValue::ExpressionContainer(container)) => {
                    if let JSXExpression::EmptyExpression(_) = &container.expression {
                        continue;
                    }
                    if let Some(expression) = container.expression.as_expression() {
                        self.expression(expression, inner);
                    }
                }
                Some(JSXAttributeValue::Element(child)) => self.element(child, inner),
                Some(JSXAttributeValue::Fragment(fragment)) => {
                    for child in &fragment.children {
                        self.child(child, inner);
                    }
                }
                _ => {}
            }
        }

        let below = children_owner.unwrap_or(inner);
        for child in &element.children {
            self.child(child, below);
        }
    }

    fn mark_opaque(&mut self, node: u32) {
        let label = self.tree.nodes[node as usize].label.clone();
        if !self.tree.opaque.contains(&label) {
            self.tree.opaque.push(label);
        }
    }

    fn child(&mut self, child: &JSXChild<'a>, owner: u32) {
        match child {
            JSXChild::Element(element) => self.element(element, owner),
            JSXChild::Fragment(fragment) => {
                for child in &fragment.children {
                    self.child(child, owner);
                }
            }
            JSXChild::ExpressionContainer(container) => {
                if let Some(expression) = container.expression.as_expression() {
                    self.expression(expression, owner);
                }
            }
            _ => {}
        }
    }

    fn expression(&mut self, expression: &Expression<'a>, owner: u32) {
        let mut collect = Collect { builder: self, owner };
        collect.visit_expression(expression);
    }

    fn symbol_of(&self, identifier: &IdentifierReference<'a>) -> Option<SymbolId> {
        identifier.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
    }

    fn classify(&self, name: &JSXElementName<'a>) -> Tag {
        match name {
            // oxc gives a lowercase tag `Identifier` and a capitalised one
            // `IdentifierReference`, so the split is the parser's.
            JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_) => Tag::Intrinsic,
            JSXElementName::IdentifierReference(identifier) => {
                let symbol = identifier
                    .reference_id
                    .get()
                    .and_then(|id| self.scoping.get_reference(id).symbol_id());
                let label = identifier.name.to_string();
                match symbol
                    .map(|symbol| self.module.env.kind_of(symbol))
                    .and_then(|kind| kind.flow())
                {
                    Some(flow) => Tag::Flow(flow, label),
                    None => Tag::Component(label, symbol),
                }
            }
            JSXElementName::MemberExpression(member) => {
                let property = member.property.name.as_str();
                let JSXMemberExpressionObject::IdentifierReference(object) = &member.object else {
                    return Tag::Component(
                        member.span.source_text(self.module.source).to_string(),
                        None,
                    );
                };
                let label = format!("{}.{}", object.name, property);
                let symbol = object
                    .reference_id
                    .get()
                    .and_then(|id| self.scoping.get_reference(id).symbol_id());
                if let Some(symbol) = symbol
                    && let Some(flow) = self.module.env.namespace_flow(symbol, property)
                {
                    return Tag::Flow(flow, label);
                }
                if property == "Provider" {
                    return Tag::Provide(label);
                }
                Tag::Component(label, None)
            }
            JSXElementName::ThisExpression(_) => Tag::Component("this".to_string(), None),
        }
    }
}

enum Tag {
    Intrinsic,
    Flow(Flow, String),
    Provide(String),
    Component(String, Option<SymbolId>),
}

/// A generic walk that hands every JSX element it meets to the builder and does
/// not descend into it — the builder's own walk owns that, because only it
/// knows which construct the children belong to.
struct Collect<'a, 'p, 'm, 'b> {
    builder: &'b mut Builder<'a, 'p, 'm>,
    owner: u32,
}

impl<'a> Visit<'a> for Collect<'a, '_, '_, '_> {
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        self.builder.element(it, self.owner);
    }

    fn visit_jsx_fragment(&mut self, it: &oxc::ast::ast::JSXFragment<'a>) {
        walk::walk_jsx_fragment(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let symbol = self.builder.symbol_of(it);
        self.builder.note_children_identifier(symbol, self.owner);
    }

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(object) = &it.object {
            let symbol = self.builder.symbol_of(object);
            self.builder.note_children_member(symbol, it.property.name.as_str(), self.owner);
        }
        walk::walk_static_member_expression(self, it);
    }
}

/// The `children` slot of a component definition, as two symbols: the whole
/// props binding (`props.children`) and a destructured one (`{ children }`).
fn slot_frame(def: Def<'_, '_>) -> SlotFrame {
    let pattern = match def {
        Def::Fn(function) => function.params.items.first().map(|item| &item.pattern),
        Def::Arrow(arrow) => arrow.params.items.first().map(|item| &item.pattern),
    };
    let mut frame = SlotFrame { props: None, children: None, found: None };
    match pattern {
        Some(BindingPattern::BindingIdentifier(identifier)) => {
            frame.props = identifier.symbol_id.get();
        }
        Some(BindingPattern::ObjectPattern(object)) => {
            for property in &object.properties {
                if property.key.static_name().as_deref() != Some("children") {
                    continue;
                }
                if let BindingPattern::BindingIdentifier(identifier) = &property.value {
                    frame.children = identifier.symbol_id.get();
                }
            }
        }
        _ => {}
    }
    frame
}

/// Does the call site pass children at all? Whitespace between tags is not a
/// slot, and treating it as one would mark most of the corpus partial.
fn has_content(element: &JSXElement<'_>) -> bool {
    element.children.iter().any(|child| match child {
        JSXChild::Text(text) => !text.value.as_str().trim().is_empty(),
        _ => true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::source_type_for;
    use crate::options::ResolvedOptions;
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;

    fn tree_of(source: &str) -> OwnershipTree {
        let allocator = Allocator::new();
        let source = allocator.alloc_str(source);
        let program =
            Parser::new(&allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(&allocator, source);
        let options = ResolvedOptions::default();
        crate::analysis::bind(&allocator, &program, &mut module, &options);
        build(&program, &module)
    }

    /// Every node of the tree rooted at `root`, in creation order. The artefact
    /// is a forest — one root per top-level component — so a test about one
    /// component's ownership has to say which one, or it is really a test about
    /// how many other components the fixture happens to declare.
    fn labels(tree: &OwnershipTree, root: &str) -> Vec<(&'static str, String)> {
        let Some((_, start)) = tree.roots.iter().find(|(name, _)| name == root) else {
            panic!("no root named {root}; roots are {:?}", tree.roots);
        };
        let mut keep = vec![*start];
        let mut out = Vec::new();
        for node in &tree.nodes {
            if node.id != *start && !keep.contains(&node.parent) {
                continue;
            }
            keep.push(node.id);
            out.push((node.kind.as_str(), node.label.clone()));
        }
        out
    }

    /// The node whose label is `label`, within the tree rooted at `root`.
    fn node_of(tree: &OwnershipTree, root: &str, label: &str) -> u32 {
        let (_, start) = tree.roots.iter().find(|(name, _)| name == root).expect("the root");
        let mut keep = vec![*start];
        for node in &tree.nodes {
            if node.id != *start && !keep.contains(&node.parent) {
                continue;
            }
            keep.push(node.id);
            if node.label == label {
                return node.id;
            }
        }
        panic!("no node labelled {label} under {root}");
    }

    /// The case the whole redesign exists for: the child of a provider is owned
    /// by the provider, and the tree says so from the SOURCE — which is why it
    /// can disagree with a runtime that gets it wrong.
    #[test]
    fn a_provider_owns_its_direct_child() {
        let tree = tree_of(
            "import { createContext } from '@barqjs/core';\n\
             const Ctx = createContext();\n\
             const Child = () => <span>x</span>;\n\
             export default function App() { return <Ctx.Provider value={1}><Child /></Ctx.Provider>; }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![
                ("root", "App".into()),
                ("provide", "Ctx.Provider".into()),
                ("component", "Child".into())
            ]
        );
        // The span's owner chain, filtered to O1's creation set.
        assert_eq!(tree.scope_path(node_of(&tree, "App", "Child")), vec!["root", "provide"]);
        // Both names reach the same node: a component is not rebuilt per alias.
        assert_eq!(tree.roots.iter().filter(|(_, node)| *node == 0).count(), 2, "{:?}", tree.roots);
    }

    /// The shape every `AuthProvider`, `QueryClientProvider` and `ThemeProvider`
    /// in the world has: a user-written wrapper around a provider. The call
    /// site's children belong to the INNER provider, not to the wrapper's call
    /// site — a component owns nothing, so forwarding cannot move ownership to
    /// it. Attributing them to the call site would encode the emitter's belief
    /// and agree with the very defect this channel exists to see.
    #[test]
    fn a_wrapper_component_forwards_its_children_into_the_construct_it_hands_them_to() {
        let tree = tree_of(
            "import { createContext } from '@barqjs/core';\n\
             const Ctx = createContext();\n\
             const Label = () => <span>x</span>;\n\
             function Shell(props) { return <Ctx.Provider value={1}>{props.children}</Ctx.Provider>; }\n\
             export default function App() { return <Shell><Label /></Shell>; }\n",
        );
        assert_eq!(tree.scope_path(node_of(&tree, "App", "Label")), vec!["root", "provide"]);
        assert!(tree.opaque.is_empty(), "{:?}", tree.opaque);
    }

    #[test]
    fn a_destructured_children_binding_forwards_the_same_way() {
        let tree = tree_of(
            "import { Show } from '@barqjs/core';\n\
             const Label = () => <span>x</span>;\n\
             function Shell({ children }) { return <Show when={1}>{children}</Show>; }\n\
             export default function App() { return <Shell><Label /></Shell>; }\n",
        );
        assert_eq!(tree.scope_path(node_of(&tree, "App", "Label")), vec!["root", "branch"]);
    }

    /// A body the walk followed and in which it never found the slot. The tree
    /// is partial exactly there, and saying nothing would let a clone the
    /// channel never checked be counted as one it did.
    #[test]
    fn a_component_that_swallows_its_children_is_recorded_as_partial() {
        let tree = tree_of(
            "const Label = () => <span>x</span>;\n\
             function Shell(props) { return <div>{props.title}</div>; }\n\
             export default function App() { return <Shell><Label /></Shell>; }\n",
        );
        assert_eq!(tree.opaque, vec!["Shell".to_string()]);
    }

    /// O1: a component call creates no scope, so it contributes no step to the
    /// path even though it is a node in the tree.
    #[test]
    fn a_component_call_adds_a_node_but_not_a_scope() {
        let tree = tree_of(
            "const Leaf = () => <i>x</i>;\n\
             const Mid = () => <div><Leaf /></div>;\n\
             export default function App() { return <Mid />; }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![("root", "App".into()), ("component", "Mid".into()), ("component", "Leaf".into())]
        );
        assert_eq!(tree.scope_path(node_of(&tree, "App", "Leaf")), vec!["root"]);
        // Every component is also a root of its own, so a harness can render
        // `Mid` directly and still have an expected value.
        assert_eq!(
            labels(&tree, "Mid"),
            vec![("root", "Mid".into()), ("component", "Leaf".into())]
        );
    }

    #[test]
    fn a_flow_component_resolves_by_symbol_and_owns_its_body() {
        let tree = tree_of(
            "import { Show, For } from '@barqjs/core';\n\
             export default function App() {\n\
               return <div><Show when={1}>{() => <p>a</p>}</Show><For each={[]}>{(r) => <li>{r}</li>}</For></div>;\n\
             }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![("root", "App".into()), ("branch", "Show".into()), ("each", "For".into())]
        );
    }

    /// Resolution is by `SymbolId`: a LOCAL `Show` is not the runtime's.
    #[test]
    fn a_shadowing_local_show_is_a_plain_component() {
        let tree = tree_of(
            "const Show = (p) => <b>{p.children}</b>;\n\
             export default function App() { return <Show><i>x</i></Show>; }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![("root", "App".into()), ("component", "Show".into())]
        );
        assert!(tree.nodes.iter().all(|node| node.kind != OwnKind::Branch));
    }

    #[test]
    fn recursion_terminates_and_is_not_silently_dropped() {
        let tree = tree_of(
            "const Node = () => <ul><Node /></ul>;\n\
             export default function App() { return <Node />; }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![
                ("root", "App".into()),
                ("component", "Node".into()),
                ("component", "Node".into())
            ]
        );
    }

    /// An imported component cannot be followed, and the tree says so rather
    /// than presenting a leaf as a complete subtree.
    #[test]
    fn an_unfollowable_component_is_recorded_as_opaque() {
        let tree = tree_of(
            "import { Thing } from './thing';\n\
             export default function App() { return <Thing />; }\n",
        );
        assert_eq!(tree.opaque, vec!["Thing".to_string()]);
    }

    #[test]
    fn a_jsx_valued_prop_is_owned_by_the_construct_that_receives_it() {
        let tree = tree_of(
            "import { Show } from '@barqjs/core';\n\
             const Fb = () => <i>no</i>;\n\
             export default function App() { return <Show when={1} fallback={<Fb />}>{() => <p>y</p>}</Show>; }\n",
        );
        assert_eq!(
            labels(&tree, "App"),
            vec![("root", "App".into()), ("branch", "Show".into()), ("component", "Fb".into())]
        );
        assert_eq!(tree.scope_path(node_of(&tree, "App", "Fb")), vec!["root", "branch"]);
    }

    #[test]
    fn a_module_with_no_default_export_produces_no_tree() {
        let tree = tree_of("export const x = 1;\n");
        assert!(tree.nodes.is_empty());
        assert!(tree.to_json().contains("\"nodes\":[]"));
    }

    /// The whole of M0's compiler-side risk, as one assertion. The artefact is
    /// a side channel: turning it on may not move one byte of the emitted
    /// program, on either backend, for any fixture. The 234 emission snapshots
    /// are the other half of this proof; this is the half that does not need a
    /// test runner to notice.
    #[test]
    fn asking_for_the_ownership_tree_does_not_change_the_emitted_program() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let mut checked = 0;
        let mut with_a_tree = 0;
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let name = path.file_name().expect("a name").to_string_lossy().to_string();
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            for ssr in [false, true] {
                for dev in [false, true] {
                    let base =
                        ResolvedOptions { ssr, dev, ..ResolvedOptions::with_filename(&name) };
                    let plain = crate::compile::compile(&source, &base)
                        .unwrap_or_else(|errors| panic!("{name}: {errors:?}"));
                    let traced = crate::compile::compile(
                        &source,
                        &ResolvedOptions { ownership: true, ..base },
                    )
                    .unwrap_or_else(|errors| panic!("{name}: {errors:?}"));
                    assert_eq!(plain.code, traced.code, "{name} (ssr={ssr}, dev={dev})");
                    assert_eq!(plain.warnings.len(), traced.warnings.len(), "{name}");
                    assert!(plain.ownership.is_none(), "{name}: unasked-for artefact");
                    let json = traced.ownership.expect("the artefact was asked for");
                    assert!(json.starts_with("{\"version\":2"), "{name}: {json}");
                    if json.contains("\"positions\":[{") {
                        with_a_tree += 1;
                    }
                    checked += 1;
                }
            }
        }
        assert!(checked >= 117 * 4, "only {checked} compiles were compared");
        // The artefact has to be non-trivial on a real share of the corpus, or
        // byte-identity is a claim about nothing.
        assert!(with_a_tree >= 100, "only {with_a_tree} compiles produced a position");
    }

    #[test]
    fn the_json_escapes_what_a_template_can_contain() {
        let mut tree = OwnershipTree::default();
        tree.nodes.push(OwnNode {
            id: 0,
            parent: NONE,
            kind: OwnKind::Root,
            scopes: true,
            span: 0,
            label: "A\"B\\C\n".to_string(),
            line: 1,
            column: 1,
        });
        let json = tree.to_json();
        assert!(json.contains(r#""label":"A\"B\\C\n""#), "{json}");
        assert!(json.contains("\"parent\":-1"), "{json}");
    }
}
