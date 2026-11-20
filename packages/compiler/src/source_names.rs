//! Names for the reactive graph, taken from the source.
//!
//! `const [count, setCount] = createSignal(0)` becomes
//! `createSignal(0, { name: "count", loc: "src/App.tsx:3:29" })`, so a finding
//! about the signal says `count` and where it is declared instead of `signal`.
//! A memo, a projection and a store are named the same way, and an effect,
//! which no binding names, gains its position alone.
//!
//! The rules follow Solid's `sourceNames.primitives` pass, so a graph reads the
//! same under either compiler:
//!
//! - Only a call whose callee is imported from the core or from
//!   `@solidjs/signals` is named, by a named import or a namespace member.
//! - What the author wrote stays: a `name` or `loc` already in an options
//!   literal is kept, and options that are not a literal, or that hold a
//!   spread, are left alone.
//! - The name is the declared identifier: a variable, the first element of an
//!   array pattern, an object literal's key, or a class field.
//! - Inside a named function that is not a component (`createCounter`,
//!   `useTheme`, a method) the name carries that function's in front,
//!   `createCounter.count`. Inside a component the owner path already says
//!   `<Counter>`.

use oxc::allocator::{Allocator, Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrowFunctionExpression, BindingPattern, CallExpression, Expression, Function,
    IdentifierName, ImportDeclarationSpecifier, MethodDefinition, ObjectProperty,
    ObjectPropertyKind, Program, PropertyDefinition, PropertyKey, PropertyKind, Statement,
    VariableDeclarator,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::{VisitMut, walk_mut};
use oxc::semantic::{ScopeFlags, Scoping, SemanticBuilder, SemanticBuilderReturn, SymbolId};
use oxc::span::SPAN;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::ir::Locator;
use crate::options::ResolvedOptions;

const ENGINE_SOURCE: &str = "@solidjs/signals";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Primitive {
    /// `createSignal(value?, options?)`, `createMemo(compute, options?)`.
    OptionsSecond,
    /// `createProjection(fn, seed, options?)`.
    OptionsThird,
    /// `createStore(value, options?)` or `createStore(fn, seed, options?)`.
    Store,
    /// `createEffect(compute, effect, options?)`: a position and no name.
    Effect,
    /// `createTrackedEffect(fn, options?)`: a position and no name.
    TrackedEffect,
}

fn primitive(imported: &str) -> Option<Primitive> {
    Some(match imported {
        "createSignal" | "createOptimistic" | "createMemo" | "createDeferred" => {
            Primitive::OptionsSecond
        }
        "createProjection" => Primitive::OptionsThird,
        "createStore" | "createOptimisticStore" => Primitive::Store,
        "createEffect" | "createRenderEffect" => Primitive::Effect,
        "createTrackedEffect" => Primitive::TrackedEffect,
        _ => return None,
    })
}

pub fn mentions(source: &str, options: &ResolvedOptions) -> bool {
    source.contains(options.core_source.as_str()) || source.contains(ENGINE_SOURCE)
}

pub fn run<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    source: &str,
    locator: Option<&Locator>,
    options: &ResolvedOptions,
) {
    let SemanticBuilderReturn { semantic, .. } = SemanticBuilder::new().build(program);
    let scoping = semantic.into_scoping();

    let mut named = FxHashMap::default();
    let mut namespaces = FxHashSet::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        let from = declaration.source.value.as_str();
        if from != Some(options.core_source.as_str()) && from != Some(ENGINE_SOURCE) {
            continue;
        }
        for specifier in declaration.specifiers.iter().flatten() {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                    if let Some(kind) = primitive(specifier.imported.name().as_str())
                        && let Some(symbol) = specifier.local.symbol_id.get()
                    {
                        named.insert(symbol, kind);
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                    if let Some(symbol) = specifier.local.symbol_id.get() {
                        namespaces.insert(symbol);
                    }
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {}
            }
        }
    }
    if named.is_empty() && namespaces.is_empty() {
        return;
    }

    let mut namer = Namer {
        allocator,
        ast: AstBuilder::new(allocator),
        scoping: &scoping,
        named,
        namespaces,
        source,
        locator,
        functions: Vec::new(),
        pending: None,
    };
    namer.visit_program(program);
}

struct Namer<'a, 's> {
    allocator: &'a Allocator,
    ast: AstBuilder<'a>,
    scoping: &'s Scoping,
    named: FxHashMap<SymbolId, Primitive>,
    namespaces: FxHashSet<SymbolId>,
    source: &'s str,
    locator: Option<&'s Locator>,
    /// Enclosing functions, innermost last; `None` for one nothing names.
    functions: Vec<Option<String>>,
    /// The name a declaration or key gives the function that is its value,
    /// taken by the next function entered.
    pending: Option<String>,
}

fn key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
        PropertyKey::StringLiteral(literal) => literal.value.as_str().map(str::to_string),
        _ => None,
    }
}

fn declared(pattern: &BindingPattern<'_>) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
        BindingPattern::ArrayPattern(array) => match array.elements.first()? {
            Some(BindingPattern::BindingIdentifier(id)) => Some(id.name.to_string()),
            _ => None,
        },
        _ => None,
    }
}

fn unwrapped<'e, 'a>(mut expression: &'e Expression<'a>) -> &'e Expression<'a> {
    loop {
        expression = match expression {
            Expression::TSAsExpression(inner) => &inner.expression,
            Expression::TSSatisfiesExpression(inner) => &inner.expression,
            Expression::TSNonNullExpression(inner) => &inner.expression,
            Expression::TSTypeAssertion(inner) => &inner.expression,
            Expression::ParenthesizedExpression(inner) => &inner.expression,
            other => return other,
        };
    }
}

fn unwrapped_mut<'e, 'a>(expression: &'e mut Expression<'a>) -> &'e mut Expression<'a> {
    match expression {
        Expression::TSAsExpression(inner) => unwrapped_mut(&mut inner.expression),
        Expression::TSSatisfiesExpression(inner) => unwrapped_mut(&mut inner.expression),
        Expression::TSNonNullExpression(inner) => unwrapped_mut(&mut inner.expression),
        Expression::TSTypeAssertion(inner) => unwrapped_mut(&mut inner.expression),
        Expression::ParenthesizedExpression(inner) => unwrapped_mut(&mut inner.expression),
        other => other,
    }
}

fn is_function(expression: &Expression<'_>) -> bool {
    matches!(
        unwrapped(expression),
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
    )
}

/// `(has name, has loc)` of an options literal, or `None` for an argument this
/// cannot see inside: not a literal, or one holding a spread.
fn literal_keys(argument: &Argument<'_>) -> Option<(bool, bool)> {
    let Expression::ObjectExpression(object) = unwrapped(argument.as_expression()?) else {
        return None;
    };
    let mut has = (false, false);
    for property in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else { return None };
        match key_name(&property.key).as_deref() {
            Some("name") => has.0 = true,
            Some("loc") => has.1 = true,
            _ => {}
        }
    }
    Some(has)
}

/// The argument index the options belong at, or `None` when the call's shape
/// leaves it open.
fn options_index(kind: Primitive, call: &CallExpression<'_>) -> Option<usize> {
    match kind {
        Primitive::OptionsSecond | Primitive::TrackedEffect => Some(1),
        Primitive::OptionsThird => Some(2),
        // The second argument is the effect, and without it the call is not one
        // this can complete.
        Primitive::Effect => (call.arguments.len() >= 2).then_some(2),
        Primitive::Store => {
            let first = call.arguments.first()?.as_expression()?;
            if is_function(first) {
                return Some(2);
            }
            match call.arguments.len() {
                1 => Some(1),
                // An object in second place is the options only when every key
                // is an option's: anything else could be the seed of a derived
                // store whose function is passed by name.
                2 => {
                    let Expression::ObjectExpression(object) =
                        unwrapped(call.arguments[1].as_expression()?)
                    else {
                        return None;
                    };
                    (!object.properties.is_empty()
                        && object.properties.iter().all(|property| match property {
                            ObjectPropertyKind::ObjectProperty(property) => matches!(
                                key_name(&property.key).as_deref(),
                                Some("name" | "loc" | "shallow")
                            ),
                            ObjectPropertyKind::SpreadProperty(_) => false,
                        }))
                    .then_some(1)
                }
                3 => Some(2),
                _ => None,
            }
        }
    }
}

impl<'a> Namer<'a, '_> {
    fn kind_of(&self, callee: &Expression<'a>) -> Option<Primitive> {
        match unwrapped(callee) {
            Expression::Identifier(identifier) => {
                let symbol =
                    self.scoping.get_reference(identifier.reference_id.get()?).symbol_id()?;
                self.named.get(&symbol).copied()
            }
            Expression::StaticMemberExpression(member) => {
                let Expression::Identifier(object) = unwrapped(&member.object) else { return None };
                let symbol = self.scoping.get_reference(object.reference_id.get()?).symbol_id()?;
                self.namespaces
                    .contains(&symbol)
                    .then(|| primitive(member.property.name.as_str()))?
            }
            _ => None,
        }
    }

    fn property(&self, key: &'static str, value: &str) -> ObjectPropertyKind<'a> {
        let key = PropertyKey::StaticIdentifier(ArenaBox::new_in(
            IdentifierName::new(SPAN, key, &self.ast),
            &self.allocator,
        ));
        let value =
            Expression::new_string_literal(SPAN, self.allocator.alloc_str(value), None, &self.ast);
        ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
            ObjectProperty::new(
                SPAN,
                PropertyKind::Init,
                key,
                value,
                false,
                false,
                false,
                &self.ast,
            ),
            &self.allocator,
        ))
    }

    /// Complete `call`'s options with `name`, when it has one to give, and
    /// with the call's position.
    fn complete(&self, call: &mut CallExpression<'a>, kind: Primitive, name: Option<&str>) {
        let Some(index) = options_index(kind, call) else { return };
        if call.arguments.iter().take(index).any(|argument| argument.as_expression().is_none()) {
            return;
        }
        let name = name.map(|name| match self.functions.iter().rev().flatten().next() {
            Some(function) if !function.starts_with(|c: char| c.is_ascii_uppercase()) => {
                format!("{function}.{name}")
            }
            _ => name.to_string(),
        });
        let position = self.locator.map(|locator| locator.at(self.source, call.span.start));

        if call.arguments.len() > index {
            let Some((has_name, has_loc)) = literal_keys(&call.arguments[index]) else { return };
            let Some(Expression::ObjectExpression(object)) =
                call.arguments[index].as_expression_mut().map(unwrapped_mut)
            else {
                return;
            };
            // `name` first and `loc` straight after it, wherever the author's
            // own keys stand.
            let mut at = 0;
            if let Some(name) = name.as_deref().filter(|_| !has_name) {
                object.properties.insert(0, self.property("name", name));
                at = 1;
            } else if has_name {
                at = object
                    .properties
                    .iter()
                    .position(|property| {
                        matches!(property, ObjectPropertyKind::ObjectProperty(property)
                            if key_name(&property.key).as_deref() == Some("name"))
                    })
                    .map_or(0, |found| found + 1);
            }
            if let Some(position) = position.as_deref().filter(|_| !has_loc) {
                object.properties.insert(at, self.property("loc", position));
            }
            return;
        }

        let mut properties = ArenaVec::new_in(&self.allocator);
        properties.extend(name.as_deref().map(|name| self.property("name", name)));
        properties.extend(position.as_deref().map(|position| self.property("loc", position)));
        if properties.is_empty() {
            return;
        }
        for _ in call.arguments.len()..index {
            call.arguments.push(Argument::from(Expression::new_void_0(SPAN, &self.ast)));
        }
        call.arguments
            .push(Argument::from(Expression::new_object_expression(SPAN, properties, &self.ast)));
    }

    /// `value` is what `name` is declared as: a primitive there takes the name,
    /// and a function there is entered under it.
    fn declare(&mut self, name: Option<String>, value: &mut Expression<'a>) {
        let Some(name) = name else { return };
        if is_function(value) {
            self.pending = Some(name);
            return;
        }
        if let Expression::CallExpression(call) = unwrapped_mut(value)
            && let Some(kind) = self.kind_of(&call.callee)
            && !matches!(kind, Primitive::Effect | Primitive::TrackedEffect)
        {
            self.complete(call, kind, Some(&name));
        }
    }

    fn enter(&mut self, named: Option<String>) {
        let name = named.or_else(|| self.pending.take());
        self.pending = None;
        self.functions.push(name);
    }
}

impl<'a> VisitMut<'a> for Namer<'a, '_> {
    fn visit_variable_declarator(&mut self, declarator: &mut VariableDeclarator<'a>) {
        if let Some(init) = &mut declarator.init {
            self.declare(declared(&declarator.id), init);
        }
        walk_mut::walk_variable_declarator(self, declarator);
        self.pending = None;
    }

    fn visit_object_property(&mut self, property: &mut ObjectProperty<'a>) {
        self.declare(key_name(&property.key), &mut property.value);
        walk_mut::walk_object_property(self, property);
        self.pending = None;
    }

    fn visit_property_definition(&mut self, definition: &mut PropertyDefinition<'a>) {
        if let Some(value) = &mut definition.value {
            self.declare(key_name(&definition.key), value);
        }
        walk_mut::walk_property_definition(self, definition);
        self.pending = None;
    }

    fn visit_method_definition(&mut self, definition: &mut MethodDefinition<'a>) {
        self.pending = key_name(&definition.key);
        walk_mut::walk_method_definition(self, definition);
        self.pending = None;
    }

    fn visit_function(&mut self, function: &mut Function<'a>, flags: ScopeFlags) {
        self.enter(function.id.as_ref().map(|id| id.name.to_string()));
        walk_mut::walk_function(self, function, flags);
        self.functions.pop();
    }

    fn visit_arrow_function_expression(&mut self, arrow: &mut ArrowFunctionExpression<'a>) {
        self.enter(None);
        walk_mut::walk_arrow_function_expression(self, arrow);
        self.functions.pop();
    }

    fn visit_call_expression(&mut self, call: &mut CallExpression<'a>) {
        // An argument is not what the enclosing declaration names.
        self.pending = None;
        if let Some(kind @ (Primitive::Effect | Primitive::TrackedEffect)) =
            self.kind_of(&call.callee)
        {
            self.complete(call, kind, None);
        }
        walk_mut::walk_call_expression(self, call);
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::options::TransformOptions;

    fn named(source: &str) -> String {
        let options = TransformOptions {
            filename: Some("/app/src/counter.tsx".to_string()),
            root: Some("/app".to_string()),
            dev: Some(true),
            ..TransformOptions::default()
        };
        compile(source, &options.resolve()).expect("compiles").code
    }

    #[test]
    fn a_signal_a_memo_and_a_store_take_the_name_they_are_declared_as() {
        let code = named(
            "import { createSignal, createMemo, createStore } from \"@barqjs/core\";\n\
             const [count, setCount] = createSignal(0);\n\
             const doubled = createMemo(() => count() * 2);\n\
             const [state] = createStore({ a: 1 });\n\
             export { setCount, doubled, state };\n",
        );
        assert!(
            code.contains(
                "createSignal(0, {\n  name: \"count\",\n  loc: \"src/counter.tsx:2:27\"\n})"
            ),
            "{code}"
        );
        assert!(code.contains("name: \"doubled\""), "{code}");
        assert!(code.contains("name: \"state\""), "{code}");
        assert!(code.contains("loc: \"src/counter.tsx:3:17\""), "{code}");
    }

    #[test]
    fn what_the_author_wrote_is_kept() {
        let code = named(
            "import { createSignal, createMemo } from \"@barqjs/core\";\n\
             const options = { name: \"mine\" };\n\
             const [a] = createSignal(0, { name: \"picked\" });\n\
             const [b] = createSignal(0, options);\n\
             const c = createMemo(() => 1, { ...options });\n\
             export { a, b, c };\n",
        );
        assert!(code.contains("name: \"picked\""), "{code}");
        assert!(!code.contains("name: \"a\""), "{code}");
        assert!(code.contains("loc: \"src/counter.tsx:3:13\""), "{code}");
        assert!(code.contains("createSignal(0, options)"), "{code}");
        assert!(!code.contains("name: \"c\""), "{code}");
    }

    #[test]
    fn a_helper_puts_its_own_name_in_front_and_a_component_does_not() {
        let code = named(
            "import { createSignal } from \"@barqjs/core\";\n\
             export function createCounter() {\n\
               const [count, setCount] = createSignal(0);\n\
               return { count, setCount };\n\
             }\n\
             export const useToggle = () => {\n\
               const [on] = createSignal(false);\n\
               return on;\n\
             };\n\
             export function Counter() {\n\
               const [value] = createSignal(0);\n\
               return <b>{value()}</b>;\n\
             }\n",
        );
        assert!(code.contains("name: \"createCounter.count\""), "{code}");
        assert!(code.contains("name: \"useToggle.on\""), "{code}");
        assert!(code.contains("name: \"value\""), "{code}");
        assert!(!code.contains("Counter.value"), "{code}");
    }

    #[test]
    fn an_effect_gains_its_position_and_no_name() {
        let code = named(
            "import { createEffect, createSignal } from \"@barqjs/core\";\n\
             const [count] = createSignal(0);\n\
             createEffect(() => count(), (value) => console.log(value));\n",
        );
        assert!(code.contains("loc: \"src/counter.tsx:3:1\""), "{code}");
        assert_eq!(code.matches("name:").count(), 1, "{code}");
    }

    #[test]
    fn a_derived_store_keeps_its_seed_where_it_is() {
        let code = named(
            "import { createStore } from \"@barqjs/core\";\n\
             const derive = (draft) => draft;\n\
             const [a] = createStore(derive, { n: 1 });\n\
             const [b] = createStore((draft) => draft, { n: 1 });\n\
             export { a, b };\n",
        );
        assert!(code.contains("createStore(derive, { n: 1 })"), "{code}");
        assert!(code.contains("name: \"b\""), "{code}");
    }

    #[test]
    fn a_namespace_member_and_an_alias_are_named_and_a_lookalike_is_not() {
        let code = named(
            "import * as barq from \"@barqjs/core\";\n\
             import { createSignal as signal } from \"@barqjs/core\";\n\
             import { createMemo } from \"./mine\";\n\
             const [a] = barq.createSignal(0);\n\
             const [b] = signal(0);\n\
             const c = createMemo(() => 1);\n\
             export { a, b, c };\n",
        );
        assert!(code.contains("name: \"a\""), "{code}");
        assert!(code.contains("name: \"b\""), "{code}");
        assert!(!code.contains("name: \"c\""), "{code}");
    }

    #[test]
    fn a_binding_runs_under_the_name_of_what_it_writes() {
        let code = named(
            "import { Show, For } from \"@barqjs/core\";\n\
             import { Row } from \"./row\";\n\
             export function List(props: { on: boolean; label: string; rows: number[] }) {\n\
               return (\n\
                 <ul class={props.on ? \"a\" : \"b\"} title={props.label.trim()}>\n\
                   {props.label.trim()}\n\
                   <Show when={props.on}><b>on</b></Show>\n\
                   <For each={props.rows}>{(row) => <li>{row()}</li>}</For>\n\
                   <Row />\n\
                 </ul>\n\
               );\n\
             }\n",
        );
        assert!(
            code.contains("_$labelled(\"ul.class, ul.title\", \"src/counter.tsx:5:11\""),
            "{code}"
        );
        assert!(code.contains("_$labelled(\"ul.children\", \"src/counter.tsx:6:2\""), "{code}");
        assert!(code.contains("_$labelled(\"<Show>\", \"src/counter.tsx:7:1\""), "{code}");
        assert!(code.contains("_$labelled(\"<For>\", \"src/counter.tsx:8:1\""), "{code}");
        assert!(code.contains("_$labelled(\"li.children\""), "{code}");
        assert!(code.contains(", _el$1);"), "{code}");
    }

    /// A component built in a hole makes its own owner first, and that owner
    /// is the component, not the hole.
    #[test]
    fn a_hole_that_builds_a_component_is_left_to_the_component() {
        let code = named(
            "import { Row } from \"./row\";\n\
             export const V = () => <ul><Row /></ul>;\n",
        );
        assert!(
            code.contains("_$createComponent(Row, {}, \"Row\", \"src/counter.tsx:2:28\")"),
            "{code}"
        );
        assert!(!code.contains("_$labelled("), "{code}");
    }

    #[test]
    fn without_a_filename_a_binding_has_a_name_and_no_position() {
        let options = TransformOptions { dev: Some(true), ..TransformOptions::default() };
        let code = compile(
            "export const V = (props: { on: boolean }) => <p class={props.on ? \"a\" : \"b\"} />;\n",
            &options.resolve(),
        )
        .expect("compiles")
        .code;
        assert!(code.contains("_$labelled(\"p.class\", void 0, () => "), "{code}");
    }

    #[test]
    fn a_production_compile_writes_none_of_it() {
        let options = TransformOptions {
            filename: Some("/app/src/counter.tsx".to_string()),
            ..TransformOptions::default()
        };
        let code = compile(
            "import { createSignal } from \"@barqjs/core\";\n\
             export const [count] = createSignal(0);\n",
            &options.resolve(),
        )
        .expect("compiles")
        .code;
        assert!(!code.contains("name:"), "{code}");
        assert!(!code.contains("loc:"), "{code}");
    }
}
