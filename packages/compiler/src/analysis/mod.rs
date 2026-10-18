mod bind;
pub mod link;
pub mod migration;
mod nesting;
mod render;
mod rows;
pub mod server_fn;

use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, Program};
use oxc::semantic::{ScopeId, Scoping, SemanticBuilder, SemanticBuilderReturn, SymbolId};

use crate::ir::Module;
use crate::options::ResolvedOptions;

/// The expression under any number of TYPE-ONLY wrappers.
///
/// `Component as never` is the same value as `Component`, and a scan that
/// matches `Expression::Identifier` sees a `TSAsExpression` and gives up.
/// `bind.rs`'s `init_of`, `props_member` and `yields_jsx` each unwrap this
/// inline; `visit_object_expression` did not, so a route table written
/// `{ component: Home as never }` did not mark `Home` as used-as-a-value.
///
/// What that cost is worth stating, because nothing reported it: an undetected
/// component keeps its authored parameter list, its JSX lowers against a
/// module-level `const _s$ = null`, its holes are emitted EAGERLY rather than
/// as accessors, and no `block()` wraps it. The result renders once, against no
/// scope, and never updates again.
pub fn without_type_wrappers<'a, 'b>(expression: &'b Expression<'a>) -> &'b Expression<'a> {
    let mut current = expression;
    loop {
        current = match current {
            Expression::TSAsExpression(inner) => &inner.expression,
            Expression::TSSatisfiesExpression(inner) => &inner.expression,
            Expression::TSNonNullExpression(inner) => &inner.expression,
            Expression::TSInstantiationExpression(inner) => &inner.expression,
            Expression::ParenthesizedExpression(inner) => &inner.expression,
            _ => return current,
        };
    }
}

/// The `SymbolId` behind an identifier reference, or `None` for an unresolved
/// global. `ReferenceId` lives in a `Cell` on the node itself, so it travels
/// with an expression P1 moves into a hole and is still readable at P2.
pub fn symbol_of(scoping: &Scoping, expression: &Expression<'_>) -> Option<SymbolId> {
    let Expression::Identifier(identifier) = without_type_wrappers(expression) else {
        return None;
    };
    scoping.get_reference(identifier.reference_id.get()?).symbol_id()
}

/// Stage 2 of the pipeline. Runs against the program the parser produced and
/// nothing else — every later stage works from the IR, so the symbol table can
/// never be invalidated by a rewrite.
///
/// `SemanticBuilder::new()` is deliberate: `new_linter()` also builds the
/// `AstNodes` store and the control-flow graph, and `new_compiler()` turns on
/// the syntax checker, which would report errors `Parser` already recovered
/// from. Everything P0 needs is in `Scoping`, and `Scoping` carries no AST
/// lifetime — `Semantic::into_scoping` hands back an owned table, which is what
/// lets the borrow of the program end here.
pub fn bind<'a>(
    allocator: &'a Allocator,
    program: &Program<'a>,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
) {
    let SemanticBuilderReturn { semantic, .. } = SemanticBuilder::new().build(program);
    let scoping = semantic.into_scoping();
    scope_ranges(&scoping, module);
    module.scoping = scoping;
    bind::classify(allocator, program, module, options);
    // Not gated on `diagnostics`: markup the parser reshapes breaks every
    // server-rendered page that holds it, so a production build is where it
    // has to fail.
    //
    // A custom renderer's tree is built by its host, which no HTML parser
    // stands in front of.
    if options.target != crate::options::RenderTarget::Universal {
        let reshaped = nesting::check(allocator, program);
        module.env.diagnostics.extend(reshaped);
    }
    if options.diagnostics {
        render::check(
            allocator,
            program,
            &module.scoping,
            &mut module.env,
            &[&options.core_source, &options.module_source],
        );
    }
}

/// `ReactiveEnv::nested` is two integer comparisons only because oxc creates
/// scopes in pre-order, which makes every scope's descendants a contiguous run
/// of ids. One stack pass turns the parent links into that run.
fn scope_ranges(scoping: &Scoping, module: &mut Module<'_>) {
    let count = scoping.scopes_len();
    let env = &mut module.env;
    env.scope_lo.reserve(count);
    env.scope_hi.reserve(count);

    let mut open: Vec<u32> = Vec::new();
    for index in 0..count {
        let parent = scoping.scope_parent_id(ScopeId::from_usize(index)).map(ScopeId::index);
        while let Some(&top) = open.last() {
            if Some(top as usize) == parent {
                break;
            }
            env.scope_hi[top as usize] = index as u32;
            open.pop();
        }
        debug_assert!(
            parent.is_none() == open.is_empty(),
            "scope {index} is not in pre-order relative to its parent"
        );
        env.scope_lo.push(index as u32);
        env.scope_hi.push(count as u32);
        open.push(index as u32);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::source_type_for;
    use crate::ir::{BIT_OVERFLOW, Const, Prim, SourceKind};
    use oxc::parser::Parser;
    use oxc::semantic::SymbolId;

    fn root_binding(scoping: &Scoping, name: &str) -> Option<SymbolId> {
        scoping.get_binding(scoping.root_scope_id(), name.into())
    }

    fn module_of<'a>(allocator: &'a Allocator, source: &'a str) -> Module<'a> {
        module_with(allocator, source, &ResolvedOptions::default())
    }

    fn module_with<'a>(
        allocator: &'a Allocator,
        source: &'a str,
        options: &ResolvedOptions,
    ) -> Module<'a> {
        let program =
            Parser::new(allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(allocator, source);
        bind(allocator, &program, &mut module, options);
        module
    }

    /// D1 and D3 are off unless asked for, so a production compile pays nothing.
    fn diagnosing() -> ResolvedOptions {
        ResolvedOptions { dev: true, diagnostics: true, ..ResolvedOptions::default() }
    }

    fn codes_of(module: &Module<'_>) -> Vec<&'static str> {
        module.env.diagnostics.iter().map(|diag| diag.code.as_str()).collect()
    }

    fn local<'a>(module: &'a Module<'a>, name: &str) -> SourceKind {
        let symbol = module
            .scoping
            .symbol_ids()
            .find(|id| module.scoping.symbol_name(*id) == name)
            .unwrap_or_else(|| panic!("no binding named {name}"));
        module.env.kind_of(symbol)
    }

    const ACCESSOR: SourceKind = SourceKind::Accessor;

    #[test]
    fn every_binding_gets_a_symbol_id_and_the_import_resolves_by_specifier() {
        let allocator = Allocator::new();
        let source = "import { createSignal } from \"@barqjs/core\";\n\
                      export function Card() {\n  const [count, setCount] = createSignal(0);\n  return [count, setCount];\n}\n";
        let module = module_of(&allocator, source);

        let signal = root_binding(&module.scoping, "createSignal").expect("the import binding");
        let card = root_binding(&module.scoping, "Card").expect("the function binding");
        assert_ne!(signal, card);
        // `count` is local to Card, so it is not a root binding — but it is a
        // symbol, which is the whole point of resolving by SymbolId.
        assert!(root_binding(&module.scoping, "count").is_none());
        assert_eq!(module.env.kind.len(), module.scoping.symbols_len());

        assert_eq!(module.env.kind_of(signal), SourceKind::Primitive(Prim::Signal));
        assert_eq!(local(&module, "count"), ACCESSOR);
        assert_eq!(
            local(&module, "setCount"),
            SourceKind::Fn { nullary: false },
            "the write half is a handler by reference, and reads nothing"
        );
        assert_ne!(module.env.bit_of(root_binding(&module.scoping, "Card").unwrap()), 0);
    }

    /// The two facts a name-regex compiler cannot have: an alias classifies, and
    /// a same-named local binding does not.
    #[test]
    fn aliasing_classifies_and_a_user_binding_of_the_same_name_does_not() {
        let allocator = Allocator::new();
        let source = "import { createSignal as sig, createMemo } from \"@barqjs/core\";\n\
                      const [count] = sig(0);\n\
                      const alias = count;\n\
                      const snapshot = count();\n\
                      const doubled = createMemo(() => count() * 2);\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "count"), ACCESSOR);
        assert_eq!(local(&module, "alias"), ACCESSOR, "an alias IS the accessor");
        assert_eq!(local(&module, "snapshot"), SourceKind::Inert, "a call is a snapshot");
        assert_eq!(local(&module, "doubled"), ACCESSOR);

        // A user's `const createSignal = 1` is a number, not the primitive, so calling
        // it produces nothing reactive.
        let shadowed = module_of(
            &allocator,
            "const createSignal = 1;\nconst count = createSignal;\nconst c2 = createSignal(0);\n",
        );
        assert_eq!(local(&shadowed, "count"), SourceKind::ConstLit);
        assert_eq!(
            shadowed.env.konst_of(root_binding(&shadowed.scoping, "count").unwrap()),
            Some(Const::Num(1.0))
        );
        assert_eq!(local(&shadowed, "c2"), SourceKind::Opaque);
    }

    #[test]
    fn a_barrel_import_and_a_reassigned_binding_stay_opaque() {
        let allocator = Allocator::new();
        let source = "import { createMemo } from \"./barrel\";\n\
                      import { createMemo as real } from \"@barqjs/core\";\n\
                      const fake = createMemo(() => 0);\n\
                      let moving = real(() => 0);\n\
                      moving = null;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "fake"), SourceKind::Opaque, "a barrel cannot be seen through");
        assert_eq!(local(&module, "moving"), SourceKind::Opaque, "a reassigned binding joins ⊤");
    }

    #[test]
    fn the_return_shape_table_follows_the_real_signatures() {
        let allocator = Allocator::new();
        let source = "import { createSignal, createMemo, createStore, createProjection } from \"@barqjs/core\";\n\
                      const [value, setValue] = createSignal(0);\n\
                      const pair = createSignal(0);\n\
                      const derived = createMemo(() => value());\n\
                      const [state, setState] = createStore({});\n\
                      const projected = createProjection(() => ({}));\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "value"), ACCESSOR);
        assert_eq!(local(&module, "setValue"), SourceKind::Fn { nullary: false });
        // The pair kept whole is a plain array: holding it reads nothing.
        assert_eq!(local(&module, "pair"), SourceKind::Inert);
        assert_eq!(local(&module, "derived"), ACCESSOR);
        assert_eq!(local(&module, "state"), SourceKind::ReactiveObject);
        assert_eq!(local(&module, "setState"), SourceKind::Inert);
        assert_eq!(local(&module, "projected"), SourceKind::ReactiveObject);
    }

    #[test]
    fn a_namespace_import_resolves_and_a_literal_const_carries_its_value() {
        let allocator = Allocator::new();
        let source = "import * as core from \"@barqjs/core\";\n\
                      const [count] = core.createSignal(0);\n\
                      const SIZE = \"lg\";\n\
                      const COLUMNS = 4;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "count"), ACCESSOR);

        let size = root_binding(&module.scoping, "SIZE").unwrap();
        let columns = root_binding(&module.scoping, "COLUMNS").unwrap();
        assert_eq!(module.env.kind_of(size), SourceKind::ConstLit);
        assert_eq!(module.env.konst_of(size), Some(Const::Str("lg")));
        assert_eq!(module.env.konst_of(columns), Some(Const::Num(4.0)));
        // A foldable literal is not a tracked read, so it costs no DepSet bit.
        assert_eq!(module.env.bit_of(size), BIT_OVERFLOW);
    }

    /// The DEFAULT `For` row VALUE is a plain value and its INDEX is an
    /// accessor (K1 — identity keying is the default). `keyed={false}` is the
    /// other way round. Getting this from the resolved `keyed` rather than from
    /// the parameter's name is the whole point.
    #[test]
    fn control_flow_row_parameters_come_from_the_resolved_component() {
        let allocator = Allocator::new();
        let source = "import { For } from \"@barqjs/core\";\n\
                      const a = <For each={[]}>{(item, i) => <li>{item}</li>}</For>;\n\
                      const c = <For each={[]} keyed={false}>{(loose, k) => <li>{loose}</li>}</For>;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "item"), SourceKind::RowValue);
        assert_eq!(local(&module, "i"), ACCESSOR);
        assert_eq!(local(&module, "loose"), ACCESSOR);
        assert_eq!(local(&module, "k"), SourceKind::Inert);
    }

    /// `keyed` has THREE arms, not two. A key function boxes the row in a
    /// signal (`map.ts:57`), so both parameters are accessors — reading the
    /// predicate as "not literal false" classified the row a plain value and
    /// applied `{item().text}` once, with no effect.
    #[test]
    fn a_key_function_makes_both_row_parameters_accessors() {
        let allocator = Allocator::new();
        let source = "import { For } from \"@barqjs/core\";\n\
                      import { keyOf } from \"./keys\";\n\
                      const a = <For each={[]} keyed={(r) => r.id}>{(fn, fi) => <li>{fn}</li>}</For>;\n\
                      const b = <For each={[]} keyed={keyOf}>{(un, ui) => <li>{un}</li>}</For>;\n\
                      const c = <For each={[]} keyed={true}>{(yes, yi) => <li>{yes}</li>}</For>;\n\
                      const d = <For each={[]} keyed>{(bare, bi) => <li>{bare}</li>}</For>;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "fn"), ACCESSOR);
        assert_eq!(local(&module, "fi"), ACCESSOR);
        // Unprovable takes the key-function arm: an accessor read that turns
        // out to be a plain value falls out `Opaque` and is emitted unwrapped,
        // where a plain value that turns out to be an accessor is applied once.
        assert_eq!(local(&module, "un"), ACCESSOR);
        assert_eq!(local(&module, "ui"), ACCESSOR);
        assert_eq!(local(&module, "yes"), SourceKind::RowValue);
        assert_eq!(local(&module, "yi"), ACCESSOR);
        assert_eq!(local(&module, "bare"), SourceKind::RowValue);
        assert_eq!(local(&module, "bi"), ACCESSOR);
    }

    /// A spread can carry `keyed` where nothing can read it, so it takes the
    /// same unprovable verdict a `keyed` behind a binding does. Reading only
    /// `JSXAttributeItem::Attribute` left `<For {...opts}>` on the by-item arm,
    /// which applies `{row().text}` once.
    #[test]
    fn a_spread_attribute_puts_the_row_on_the_arm_that_is_safe_when_wrong() {
        let allocator = Allocator::new();
        let source = "import { For } from \"@barqjs/core\";\n\
                      const opts = { keyed: (r) => r.id };\n\
                      const a = <For each={[]} {...opts}>{(sp, si) => <li>{sp}</li>}</For>;\n\
                      const b = <For each={[]} {...{ keyed: false }}>{(ob, oi) => <li>{ob}</li>}</For>;\n\
                      const c = <For each={[]} {...opts} keyed={true}>{(late, li) => <li>{late}</li>}</For>;\n\
                      const d = <For each={[]} keyed={true} {...opts}>{(over, oj) => <li>{over}</li>}</For>;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "sp"), ACCESSOR);
        assert_eq!(local(&module, "si"), ACCESSOR);
        assert_eq!(local(&module, "ob"), ACCESSOR);
        assert_eq!(local(&module, "oi"), ACCESSOR);
        // A LATER literal wins, exactly as it does at runtime.
        assert_eq!(local(&module, "late"), SourceKind::RowValue);
        assert_eq!(local(&module, "over"), ACCESSOR);
    }

    /// D1's POSITION ALLOWLIST, as implemented. Every arm is a slot where no
    /// correct program could put an accessor; `vue/no-ref-as-operand` is the
    /// The same rule one step out: a prop is a Cell, and the positions that
    /// turn an accessor into a value turn `props.x` into one too. Asking
    /// whether a prop was passed at all is not one of them.
    #[test]
    fn a_prop_used_as_a_value_without_being_called_is_reported() {
        let allocator = Allocator::new();
        let fires = [
            ("props.count + 1", "BARQ001"),
            ("`hello ${props.name}`", "BARQ001"),
            ("props.count > 3", "BARQ001"),
            ("props.user.name", "BARQ003"),
            ("props.items.length", "BARQ003"),
            ("props.items.map((item) => item)", "BARQ003"),
        ];
        for (expression, code) in fires {
            let source = allocator.alloc_str(&format!(
                "export function Card(props) {{ const v = {expression}; return <p>{{v}}</p>; }}\n"
            ));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), vec![code], "expected {code} for `{expression}`");
        }

        let silent = [
            "props.count() + 1",
            "props.user().name",
            "props.title ? 1 : 2",
            "props.title === undefined",
            "props.onPress.call(null)",
            "props.onPress?.()",
            "<p title={props.title}>{props.title}</p>",
        ];
        for expression in silent {
            let source = allocator.alloc_str(&format!(
                "export function Card(props) {{ const v = {expression}; return <p>{{v}}</p>; }}\n"
            ));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "`{expression}` is correct code");
        }

        // An object that merely happens to be called `props` is not one.
        let source = "const props = { count: 1 };\nexport const total = props.count + 1;\n";
        let module = module_with(&allocator, source, &diagnosing());
        assert_eq!(codes_of(&module), Vec::<&str>::new());
    }

    /// model, and every narrowing below is a refusal to guess.
    #[test]
    fn d1_fires_only_in_the_position_allowlist() {
        let allocator = Allocator::new();
        let head = "import { createSignal } from \"@barqjs/core\";\n\
                    const [count] = createSignal(0);\n";
        let fires = [
            ("`total: ${count}`", "BARQ001"),
            ("count + \"\"", "BARQ001"),
            ("\"x\" + count", "BARQ001"),
            ("-count", "BARQ001"),
            ("+count", "BARQ001"),
            ("~count", "BARQ001"),
            ("count < 5", "BARQ001"),
            ("count >= 5", "BARQ001"),
            ("!count", "BARQ002"),
            ("count ? 1 : 2", "BARQ002"),
            ("count || 7", "BARQ002"),
            ("count && 7", "BARQ002"),
            ("count.value", "BARQ003"),
            ("count.toFixed(2)", "BARQ003"),
            // Written for a callable signal. The write half is the second
            // element of the pair, and an accessor has no members of barq's.
            ("count.set(1)", "BARQ003"),
            ("count.peek()", "BARQ003"),
            ("count.update((n) => n + 1)", "BARQ003"),
        ];
        for (expression, code) in fires {
            let source = allocator.alloc_str(&format!("{head}const v = {expression};\n"));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), vec![code], "expected {code} for `{expression}`");
        }

        let silent = [
            // The framework's own idiom. `dom.ts:954` treats a function value as
            // reactive in BOTH children and attribute position, so a JSX arm
            // would fire on correct barq code in the first fixture anyone writes.
            "<p>{count}</p>",
            "<p id={count}>x</p>",
            "<p>{`total: ${count()}`}</p>",
            // called, so every position above is a value
            "count() + 1",
            "-count()",
            "count() ? 1 : 2",
            // an accessor is a function, and these are Function.prototype's
            "count.call(null)",
            "count.name",
            // right operand of ||: passing an accessor along is normal
            "other || count",
            // conditional CONSEQUENT, not test
            "flag ? count : other",
            // a tagged template hands the tag the raw value
            "tag`total: ${count}`",
            // computed member access: the key is not visible to the analysis
            "count[key]",
            // not an accessor at all
            "plain + 1",
            // IDENTITY, not coercion. Comparing accessors by reference is
            // correct code — `rows.filter((s) => s !== count)` — and BARQ001's
            // own text (stringification, NaN) describes neither operator.
            // `vue/no-ref-as-operand` fires here; this is a deliberate
            // narrowing, and the four equality operators are the whole of it.
            "count === other",
            "count !== other",
            "count == null",
            "other != count",
        ];
        for expression in silent {
            let source = allocator.alloc_str(&format!(
                "{head}const plain = 1;\nconst other = 2;\nconst flag = true;\n\
                 const key = \"a\";\nconst tag = (s) => s;\nconst v = {expression};\n"
            ));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "`{expression}` must be silent");
        }
    }

    /// The condition arms, which take STATEMENTS and so cannot live in the
    /// expression table above. Every one of them reads its operand as a boolean
    /// and nothing else, which is the whole argument for firing there.
    #[test]
    fn d1_covers_every_always_truthy_statement_test() {
        let allocator = Allocator::new();
        let head = "import { createSignal } from \"@barqjs/core\";\n\
                    const [count] = createSignal(0);\nconst other = 1;\n";
        let fires = [
            "if (count) { }",
            "switch (count) { }",
            "while (count) { break; }",
            "do { break; } while (count);",
            "for (; count; ) { break; }",
        ];
        for statement in fires {
            let source = allocator.alloc_str(&format!("{head}{statement}\n"));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), vec!["BARQ002"], "expected BARQ002 for `{statement}`");
        }

        let silent = [
            // called, so the test is a value
            "if (count()) { }",
            // a `case` test is an identity comparison against the discriminant,
            // which is the same refusal the equality operators get
            "switch (other) { case count: break; }",
            // not a test position at all
            "for (const x of [count]) { break; }",
            "for (const x in { count }) { break; }",
            // the loop has no test to read
            "for (;;) { break; }",
        ];
        for statement in silent {
            let source = allocator.alloc_str(&format!("{head}{statement}\n"));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "`{statement}` must be silent");
        }
    }

    /// D1 keys on evidence, and an unprovable `keyed` is not evidence. The row
    /// takes the accessor arm because that is the arm that is safe when wrong;
    /// if `KEYED` holds `true` the row is a plain object and `row()` throws, so
    /// printing "call it" there would be advice that breaks correct code.
    #[test]
    fn d1_says_nothing_about_a_row_whose_accessor_kind_is_an_assumption() {
        let allocator = Allocator::new();
        let head = "import { For } from \"@barqjs/core\";\n\
                    import { keyOf } from \"./keys\";\nconst KEYED = true;\n\
                    const opts = { keyed: keyOf };\n";
        let silent = [
            "<For each={[]} keyed={KEYED}>{(r) => <li>{r.text}</li>}</For>",
            "<For each={[]} keyed={undefined}>{(r) => <li>{r.text}</li>}</For>",
            "<For each={[]} keyed={0}>{(r) => <li>{`${r}`}</li>}</For>",
            "<For each={[]} {...opts}>{(r) => <li>{r.text}</li>}</For>",
            // a `keyed` behind a binding is the same refusal
            "<For each={[]} keyed={keyOf}>{(r) => <li>{r.text}</li>}</For>",
        ];
        for element in silent {
            let source = allocator.alloc_str(&format!("{head}const v = {element};\n"));
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "`{element}` must be silent");
        }

        // A key function written out IS proof, so the same read is reported.
        let source = allocator.alloc_str(&format!(
            "{head}const v = <For each={{[]}} keyed={{(r) => r.id}}>{{(r) => <li>{{r.text}}</li>}}</For>;\n"
        ));
        let module = module_with(&allocator, source, &diagnosing());
        assert_eq!(codes_of(&module), vec!["BARQ003"]);
    }

    /// The one thing that separates this from `solid/reactivity`: the rule is
    /// keyed on the BINDING, never on a name and never on `React::Reactive`.
    #[test]
    fn d1_keys_on_the_binding_and_stays_silent_where_it_cannot_see() {
        let allocator = Allocator::new();
        let cases = [
            // a prop that is CALLED is a value, correct in every position
            "export function Card(props) { return <p>{props.total() * 2}</p>; }",
            // cross-module: P0 Bind is module-scoped, so this is invisible. The
            // documented false negative — NOT covered by a name heuristic, which
            // is the proximate cause of eslint-plugin-solid #184/#190/#199.
            "import { count } from \"./barrel\";\nconst v = `${count}`;\n",
            // a shadowing local is a number
            "const signal = (v) => v;\nconst count = 5;\nconst v = `${count}`;\n",
            // a store proxy is not an accessor
            "import { useStore } from \"@barqjs/core\";\n\
             const [store] = useStore({ n: 1 });\nconst v = store.n + 1;\n",
        ];
        for source in cases {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "{source}");
        }
    }

    /// D3. A destructured prop is a Cell, which is correct wherever a function
    /// is, so the rule reports a misuse of one and never the pattern itself.
    #[test]
    fn d3_fires_on_a_destructured_parameter_list_and_only_there() {
        let allocator = Allocator::new();
        let fires = [
            "function Chip({ text }) { return <b>{`#${text}`}</b>; }\nconst v = <Chip/>;\n",
            "const Chip = ({ text }) => <b>{text.length}</b>;\nexport { Chip };\n",
            "export default function Page({ title }) { return <h1>{title + \"!\"}</h1>; }\n",
        ];
        for source in fires {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), vec!["BARQ005"], "{source}");
        }

        let silent = [
            // the shape the compiler CAN keep reactive
            "function Chip(props) { return <b>{props.text}</b>; }\nconst v = <Chip/>;\n",
            // a `<For>` row callback is one destructured parameter and JSX-returning
            "import { For } from \"@barqjs/core\";\n\
             const v = <For each={[]}>{({ text }) => <b>{`${text}`}</b>}</For>;\n",
            // no evidence it is a component: never tagged, never exported
            "function chip({ text }) { return <b>{`${text}`}</b>; }\n",
            // arity is not one, so it is a different shape
            "function Chip({ text }, extra) { return <b>{`${text}`}</b>; }\nconst v = <Chip/>;\n",
            // returns no JSX
            "export function useThing({ text }) { return `${text}`; }\n",
        ];
        for source in silent {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "{source}");
        }
    }

    /// Each case reports once, at the misuse, which `at` names.
    #[test]
    fn d3_reports_a_destructured_prop_where_it_is_misused() {
        let allocator = Allocator::new();
        let fires = [
            ("export function Chip({ text: label }) { return <b>{label * 2}</b>; }", "label"),
            ("export function Chip({ n }) { return <b>{-n}</b>; }", "n"),
            ("export function Chip({ items }) { return <b>{items.length}</b>; }", "items"),
            (
                "export function Chip({ tone = \"warm\" }) { return <b data-tone={tone()} />; }",
                "tone()",
            ),
            ("export function Chip({ tone = \"warm\" }) { return <b>{tone?.()}</b>; }", "tone?.()"),
            ("export function Chip({ open = false }) { return <b>{open()}</b>; }", "open()"),
            ("export function Chip({ tone = \"warm\" }) { return <b>{`t-${tone}`}</b>; }", "tone"),
            ("export function Chip({ size = 2 }) { return <b>{size.toFixed(1)}</b>; }", "size"),
            ("export function Card({ user: { name } }) { return <b>{name}</b>; }", "{ name }"),
            ("export function Card({ items: [first] }) { return <b>{first}</b>; }", "[first]"),
            ("export function Card({ user: { name } = {} }) { return <b>{name}</b>; }", "{ name }"),
        ];
        for (source, at) in fires {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), vec!["BARQ005"], "{source}");
            let span = module.env.diagnostics[0].span;
            assert_eq!(&source[span.start as usize..span.end as usize], at, "{source}");
        }

        let silent = [
            // a function is what JSX takes, in a child and in an attribute
            "export function Chip({ text }) { return <b title={text}>{text}</b>; }",
            // handed on, or called first
            "export function Chip({ text }) { return <b>{format(text)}</b>; }",
            "export function Chip({ text }) { return <b>{`${text()}`}</b>; }",
            // truthiness asks whether the prop was passed, as it does for `props.x`
            "export function Chip({ text }) { return <b>{text ? \"y\" : \"n\"}</b>; }",
            "export function Chip({ text }) { if (!text) return null; return <b>{text}</b>; }",
            // what a Cell is legitimately asked for, and identity
            "export function Chip({ text }) { return <b>{text.call(null)}</b>; }",
            "export function Chip({ a, b }) { return <b>{a === b ? 1 : 2}</b>; }",
            // a defaulted name in JSX renders correctly either way
            "export function Chip({ tone = \"warm\" }) { return <b data-tone={tone}>{tone}</b>; }",
            // a `null` default is safe to call optionally, or behind a test
            "export function Chip({ onClose = null }) { return <b onClick={() => onClose?.()} />; }",
            "export function Chip({ onClose = null }) { return <b onClick={() => onClose && onClose()} />; }",
            // code that already tells the two kinds apart
            "export function Chip({ tone = \"warm\" }) {\n\
               const t = typeof tone === \"function\" ? tone() : tone;\n\
               return <b>{`${t}`}</b>;\n}",
            // a default that is a function, or whose value is unknown
            "export function Chip({ format = (v) => v }) { return <b>{format(1)}</b>; }",
            "export function Chip({ tone = DEFAULT }) { return <b>{tone() + 1}</b>; }",
            // reassigned, or shadowed
            "export function Chip({ text }) { text = text(); return <b>{`${text}`}</b>; }",
            "export function Chip({ text }) { const f = (text) => `${text}`; return <b>{f(1)}</b>; }",
            // the rest object holds Cells and is spread whole
            "export function Chip({ text, ...rest }) { return <b {...rest}>{text}</b>; }",
        ];
        for source in silent {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "{source}");
        }
    }

    #[test]
    fn d3_words_each_misuse_for_what_goes_wrong() {
        let allocator = Allocator::new();
        let message = |source: &str| {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            module.env.diagnostics[0].message.to_string()
        };
        let value = message("export function Chip({ text }) { return <b>{`${text}`}</b>; }");
        assert!(value.contains("Call it: `text()`"), "{value}");
        let member = message("export function Chip({ text }) { return <b>{text.length}</b>; }");
        assert!(member.contains("`text().length`"), "{member}");
        let passed =
            message("export function Chip({ tone = \"warm\" }) { return <b>{`${tone}`}</b>; }");
        assert!(passed.contains("wrong whenever the prop is passed"), "{passed}");
        assert!(passed.contains("`props.tone?.() ?? \"warm\"`"), "{passed}");
        let missing =
            message("export function Chip({ tone: t = \"warm\" }) { return <b>{t()}</b>; }");
        assert!(missing.contains("when the prop is missing this call throws"), "{missing}");
        assert!(missing.contains("`props.tone?.() ?? \"warm\"`"), "{missing}");
        let object = message("export function Card({ user: { name } }) { return <b>{name}</b>; }");
        assert!(object.contains("`user` arrives as a Cell"), "{object}");
        assert!(object.contains("`user()`"), "{object}");
        let array = message("export function Card({ items: [first] }) { return <b>{first}</b>; }");
        assert!(array.contains("not iterable"), "{array}");
    }

    /// The rules are off unless asked for, so a production compile pays for no
    /// analysis it will not deliver.
    #[test]
    fn the_rules_do_not_run_when_diagnostics_are_off() {
        let allocator = Allocator::new();
        let source = "import { createSignal } from \"@barqjs/core\";\n\
                      const [count] = createSignal(0);\nconst v = `${count}`;\n";
        let off = module_with(&allocator, source, &ResolvedOptions::default());
        assert_eq!(codes_of(&off), Vec::<&str>::new());
        let on = module_with(&allocator, source, &diagnosing());
        assert_eq!(codes_of(&on), vec!["BARQ001"]);
    }

    /// The only component IDENTITY the IR carries. `Skeleton::origin` answers
    /// "which JSX produced these bytes" and cannot answer "whose JSX is it".
    #[test]
    fn dev_labels_record_the_span_and_name_of_every_component() {
        let allocator = Allocator::new();
        let source = "function Chip(props) { return <b>{props.text}</b>; }\n\
                      export default function Page() { return <div><Chip/></div>; }\n";
        let module = module_with(&allocator, source, &diagnosing());
        let names: Vec<&str> = module.env.components.iter().map(|(_, name)| *name).collect();
        assert!(names.contains(&"Chip"), "{names:?}");
        assert!(names.contains(&"Page"), "{names:?}");
        for (span, _) in &module.env.components {
            assert!(span.end > span.start);
        }
    }

    #[test]
    fn reactive_symbols_get_a_dense_bit_and_nothing_else_does() {
        let allocator = Allocator::new();
        let source = "import { createSignal } from \"@barqjs/core\";\n\
                      const [a] = createSignal(0);\nconst [b] = createSignal(1);\nconst plain = 2;\n";
        let module = module_of(&allocator, source);
        let a = root_binding(&module.scoping, "a").unwrap();
        let b = root_binding(&module.scoping, "b").unwrap();
        let plain = root_binding(&module.scoping, "plain").unwrap();
        assert_eq!(module.env.bit_of(a), 0);
        assert_eq!(module.env.bit_of(b), 1);
        assert_eq!(module.env.bit_of(plain), BIT_OVERFLOW);
    }

    #[test]
    fn shadowing_produces_two_symbols_for_one_name() {
        let allocator = Allocator::new();
        let source = "const signal = 1;\nfunction f() { const signal = 2; return signal; }\n";
        let module = module_of(&allocator, source);
        let outer = root_binding(&module.scoping, "signal").expect("the module binding");
        let inner = module
            .scoping
            .symbol_ids()
            .find(|id| module.scoping.symbol_name(*id) == "signal" && *id != outer)
            .expect("the shadowing binding");
        assert_ne!(outer, inner);
    }

    #[test]
    fn scope_ranges_answer_nesting_with_two_comparisons() {
        let allocator = Allocator::new();
        let source = "function outer() {\n  const h = () => 1;\n  return h;\n}\nfunction other() { return 2; }\n";
        let module = module_of(&allocator, source);
        let scoping = &module.scoping;

        let root = scoping.root_scope_id();
        let ids: Vec<_> = scoping.scope_descendants_from_root().collect();
        assert!(ids.len() >= 4, "{}", ids.len());
        for id in &ids {
            assert!(module.env.nested(root, *id), "every scope is inside the root");
        }

        // outer's arrow is inside outer; other's body is not.
        let outer = ids[1];
        let arrow = ids[2];
        let other = *ids.last().unwrap();
        assert!(module.env.nested(outer, arrow));
        assert!(!module.env.nested(arrow, outer));
        assert!(!module.env.nested(outer, other));
    }

    #[test]
    fn a_reference_carries_the_symbol_its_declaration_created() {
        let allocator = Allocator::new();
        let source = "const count = 1;\nconst v = count + count;\n";
        let module = module_of(&allocator, source);
        let count = root_binding(&module.scoping, "count").expect("the binding");
        assert_eq!(module.scoping.get_resolved_reference_ids(count).len(), 2);
        assert!(!module.scoping.symbol_is_mutated(count));
    }
}
