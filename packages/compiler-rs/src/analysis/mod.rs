mod bind;

use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, Program};
use oxc::semantic::{ScopeId, Scoping, SemanticBuilder, SemanticBuilderReturn, SymbolId};

use crate::ir::Module;
use crate::options::ResolvedOptions;

/// The `SymbolId` behind an identifier reference, or `None` for an unresolved
/// global. `ReferenceId` lives in a `Cell` on the node itself, so it travels
/// with an expression P1 moves into a hole and is still readable at P2.
pub fn symbol_of(scoping: &Scoping, expression: &Expression<'_>) -> Option<SymbolId> {
    let Expression::Identifier(identifier) = expression else { return None };
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
    use crate::ir::{BIT_OVERFLOW, Const, MemberMask, Prim, SourceKind};
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

    const ACCESSOR: SourceKind = SourceKind::Accessor { nonreactive: MemberMask::EMPTY };
    const SIGNAL: SourceKind = SourceKind::Accessor { nonreactive: MemberMask::SIGNAL };

    #[test]
    fn every_binding_gets_a_symbol_id_and_the_import_resolves_by_specifier() {
        let allocator = Allocator::new();
        let source = "import { signal } from \"@barqjs/core\";\n\
                      export function Card() {\n  const count = signal(0);\n  return count;\n}\n";
        let module = module_of(&allocator, source);

        let signal = root_binding(&module.scoping, "signal").expect("the import binding");
        let card = root_binding(&module.scoping, "Card").expect("the function binding");
        assert_ne!(signal, card);
        // `count` is local to Card, so it is not a root binding — but it is a
        // symbol, which is the whole point of resolving by SymbolId.
        assert!(root_binding(&module.scoping, "count").is_none());
        assert_eq!(module.env.kind.len(), module.scoping.symbols_len());

        assert_eq!(module.env.kind_of(signal), SourceKind::Primitive(Prim::Signal));
        assert_eq!(local(&module, "count"), SIGNAL);
        assert_ne!(module.env.bit_of(root_binding(&module.scoping, "Card").unwrap()), 0);
    }

    /// The two facts a name-regex compiler cannot have: an alias classifies, and
    /// a same-named local binding does not.
    #[test]
    fn aliasing_classifies_and_a_user_binding_of_the_same_name_does_not() {
        let allocator = Allocator::new();
        let source = "import { signal as sig, computed } from \"@barqjs/core\";\n\
                      const count = sig(0);\n\
                      const alias = count;\n\
                      const snapshot = count();\n\
                      const doubled = computed(() => count() * 2);\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "count"), SIGNAL);
        assert_eq!(local(&module, "alias"), SIGNAL, "an alias IS the accessor");
        assert_eq!(local(&module, "snapshot"), SourceKind::Inert, "a call is a snapshot");
        assert_eq!(local(&module, "doubled"), ACCESSOR);

        // A user's `const signal = 1` is a number, not the primitive, so calling
        // it produces nothing reactive.
        let shadowed = module_of(
            &allocator,
            "const signal = 1;\nconst count = signal;\nconst c2 = signal(0);\n",
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
        let source = "import { signal } from \"./barrel\";\n\
                      import { signal as real } from \"@barqjs/core\";\n\
                      const fake = signal(0);\n\
                      let moving = real(0);\n\
                      moving = null;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "fake"), SourceKind::Opaque, "a barrel cannot be seen through");
        assert_eq!(local(&module, "moving"), SourceKind::Opaque, "a reassigned binding joins ⊤");
    }

    #[test]
    fn the_return_shape_table_follows_the_real_signatures() {
        let allocator = Allocator::new();
        let source = "import { useState, useStore, useResource, createProjection } from \"@barqjs/core\";\n\
                      const [value, setValue] = useState(0);\n\
                      const [store, setStore] = useStore({});\n\
                      const resource = useResource(() => 1, async () => 2);\n\
                      const projected = createProjection(() => ({}));\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "value"), ACCESSOR);
        assert_eq!(local(&module, "setValue"), SourceKind::Inert);
        assert_eq!(local(&module, "store"), SourceKind::ReactiveObject);
        assert_eq!(local(&module, "setStore"), SourceKind::Inert);
        assert_eq!(local(&module, "resource"), SourceKind::AccessorRecord);
        assert_eq!(local(&module, "projected"), SourceKind::ReactiveObject);
    }

    /// `CODESIGN.md` §3.8 collapsed the async primitives onto one `resource`.
    /// `useResource` is the hook-shaped alias for the same export, so both
    /// spellings have to reach the same row of the return-shape table — and a
    /// LOCAL binding named `resource` must still be whatever it was bound to.
    #[test]
    fn the_one_resource_classifies_under_both_of_its_spellings() {
        let allocator = Allocator::new();
        let source = "import { resource, useResource } from \"@barqjs/core\";\n\
                      const direct = resource(() => 1, async () => 2);\n\
                      const hooked = useResource(() => 1, async () => 2);\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "direct"), SourceKind::AccessorRecord);
        assert_eq!(local(&module, "hooked"), SourceKind::AccessorRecord);

        let allocator = Allocator::new();
        let shadowed = "const resource = 4;\n\
                        const shadow = resource;\n";
        let module = module_of(&allocator, shadowed);
        assert_ne!(local(&module, "shadow"), SourceKind::AccessorRecord);
    }

    #[test]
    fn a_namespace_import_resolves_and_a_literal_const_carries_its_value() {
        let allocator = Allocator::new();
        let source = "import * as core from \"@barqjs/core\";\n\
                      const count = core.signal(0);\n\
                      const SIZE = \"lg\";\n\
                      const COLUMNS = 4;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "count"), SIGNAL);

        let size = root_binding(&module.scoping, "SIZE").unwrap();
        let columns = root_binding(&module.scoping, "COLUMNS").unwrap();
        assert_eq!(module.env.kind_of(size), SourceKind::ConstLit);
        assert_eq!(module.env.konst_of(size), Some(Const::Str("lg")));
        assert_eq!(module.env.konst_of(columns), Some(Const::Num(4.0)));
        // A foldable literal is not a tracked read, so it costs no DepSet bit.
        assert_eq!(module.env.bit_of(size), BIT_OVERFLOW);
    }

    /// V8: the keyed `For` row VALUE is a plain value and its INDEX is an
    /// accessor. `Index` is the other way round. Getting this from the component
    /// identity rather than the parameter's name is the whole point.
    #[test]
    fn control_flow_row_parameters_come_from_the_resolved_component() {
        let allocator = Allocator::new();
        let source = "import { For, Index } from \"@barqjs/core\";\n\
                      const a = <For each={[]}>{(item, i) => <li>{item}</li>}</For>;\n\
                      const b = <Index each={[]}>{(cell, n) => <li>{cell}</li>}</Index>;\n\
                      const c = <For each={[]} keyed={false}>{(loose, k) => <li>{loose}</li>}</For>;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "item"), SourceKind::RowValue);
        assert_eq!(local(&module, "i"), ACCESSOR);
        assert_eq!(local(&module, "cell"), ACCESSOR);
        assert_eq!(local(&module, "n"), SourceKind::Inert);
        // `For keyed={false}` delegates to Index at runtime.
        assert_eq!(local(&module, "loose"), ACCESSOR);
        assert_eq!(local(&module, "k"), SourceKind::Inert);
    }

    /// `keyed` has THREE arms, not two. A key function boxes the row in a
    /// signal (`map.ts:57`), so both parameters are accessors — reading the
    /// predicate as "not literal false" classified the row a plain value and
    /// applied `{item().text}` once, with no effect (ERGONOMICS §4.3).
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
    /// which applies `{row().text}` once — ERGONOMICS §4.3 through another door.
    #[test]
    fn a_spread_attribute_puts_the_row_on_the_arm_that_is_safe_when_wrong() {
        let allocator = Allocator::new();
        let source = "import { For, Index } from \"@barqjs/core\";\n\
                      const opts = { keyed: (r) => r.id };\n\
                      const a = <For each={[]} {...opts}>{(sp, si) => <li>{sp}</li>}</For>;\n\
                      const b = <For each={[]} {...{ keyed: false }}>{(ob, oi) => <li>{ob}</li>}</For>;\n\
                      const c = <For each={[]} {...opts} keyed={true}>{(late, li) => <li>{late}</li>}</For>;\n\
                      const d = <For each={[]} keyed={true} {...opts}>{(over, oj) => <li>{over}</li>}</For>;\n\
                      const e = <Index each={[]} {...opts}>{(ix, ii) => <li>{ix}</li>}</Index>;\n";
        let module = module_of(&allocator, source);
        assert_eq!(local(&module, "sp"), ACCESSOR);
        assert_eq!(local(&module, "si"), ACCESSOR);
        assert_eq!(local(&module, "ob"), ACCESSOR);
        assert_eq!(local(&module, "oi"), ACCESSOR);
        // A LATER literal wins, exactly as it does at runtime.
        assert_eq!(local(&module, "late"), SourceKind::RowValue);
        assert_eq!(local(&module, "over"), ACCESSOR);
        // `Index` hard-codes `keyed: false`, so its signature does not depend on
        // an attribute list the analysis cannot read.
        assert_eq!(local(&module, "ix"), ACCESSOR);
        assert_eq!(local(&module, "ii"), SourceKind::Inert);
    }

    /// D1's POSITION ALLOWLIST, as implemented. Every arm is a slot where no
    /// correct program could put an accessor; `vue/no-ref-as-operand` is the
    /// model, and every narrowing below is a refusal to guess.
    #[test]
    fn d1_fires_only_in_the_position_allowlist() {
        let allocator = Allocator::new();
        let head = "import { signal, computed, useMemo } from \"@barqjs/core\";\n\
                    const count = signal(0);\n";
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
            // the accessor's own API, and Function.prototype's
            "count.set(1)",
            "count.peek()",
            "count.update((n) => n + 1)",
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

        // §4.2's cited false positive: `useMemo(…).peek()` is a typed public API
        // (`Computed<T>` declares `peek`), and `MemberMask` cannot be widened to
        // exempt it without turning a tracked read into `Static`. D1 carries its
        // own member list for exactly this.
        let source = "import { useMemo, computed } from \"@barqjs/core\";\n\
                      const a = useMemo(() => 1);\nconst b = computed(() => 2);\n\
                      const v = a.peek() + b.peek();\n";
        let module = module_with(&allocator, source, &diagnosing());
        assert_eq!(codes_of(&module), Vec::<&str>::new());
    }

    /// The condition arms, which take STATEMENTS and so cannot live in the
    /// expression table above. Every one of them reads its operand as a boolean
    /// and nothing else, which is the whole argument for firing there.
    #[test]
    fn d1_covers_every_always_truthy_statement_test() {
        let allocator = Allocator::new();
        let head = "import { signal } from \"@barqjs/core\";\n\
                    const count = signal(0);\nconst other = 1;\n";
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
    /// `props.count * 2` is correct code — props lower to getters.
    #[test]
    fn d1_keys_on_the_binding_and_stays_silent_where_it_cannot_see() {
        let allocator = Allocator::new();
        let cases = [
            // a props member read is ⊤-reactive and correct in every position
            "export function Card(props) { return <p>{props.total * 2}</p>; }",
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

    /// D3. Scoped to the parameter list exactly as `solid/no-destructure` is —
    /// that rule has zero false-positive issues in its tracker.
    #[test]
    fn d3_fires_on_a_destructured_parameter_list_and_only_there() {
        let allocator = Allocator::new();
        let fires = [
            "function Chip({ text }) { return <b>{text}</b>; }\nconst v = <Chip/>;\n",
            "const Chip = ({ text }) => <b>{text}</b>;\nexport { Chip };\n",
            "export default function Page({ title }) { return <h1>{title}</h1>; }\n",
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
             const v = <For each={[]}>{({ text }) => <b>{text}</b>}</For>;\n",
            // no evidence it is a component: never tagged, never exported
            "function chip({ text }) { return <b>{text}</b>; }\n",
            // arity is not one, so it is a different shape
            "function Chip({ text }, extra) { return <b>{text}</b>; }\nconst v = <Chip/>;\n",
            // returns no JSX
            "export function useThing({ text }) { return text; }\n",
        ];
        for source in silent {
            let source = allocator.alloc_str(source);
            let module = module_with(&allocator, source, &diagnosing());
            assert_eq!(codes_of(&module), Vec::<&str>::new(), "{source}");
        }
    }

    /// The rules are off unless asked for, so a production compile pays for no
    /// analysis it will not deliver.
    #[test]
    fn the_rules_do_not_run_when_diagnostics_are_off() {
        let allocator = Allocator::new();
        let source = "import { signal } from \"@barqjs/core\";\n\
                      const count = signal(0);\nconst v = `${count}`;\n";
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
        let source = "import { signal } from \"@barqjs/core\";\n\
                      const a = signal(0);\nconst b = signal(1);\nconst plain = 2;\n";
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
