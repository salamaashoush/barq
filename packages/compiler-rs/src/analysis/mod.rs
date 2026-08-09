mod bind;

use oxc::ast::ast::{Expression, Program};
use oxc::semantic::{ScopeId, Scoping, SemanticBuilder, SemanticBuilderReturn, SymbolId};

use crate::ir::Module;

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
pub fn bind<'a>(program: &Program<'a>, module: &mut Module<'a>, module_source: &str) {
    let SemanticBuilderReturn { semantic, .. } = SemanticBuilder::new().build(program);
    let scoping = semantic.into_scoping();
    scope_ranges(&scoping, module);
    module.scoping = scoping;
    bind::classify(program, module, module_source);
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
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;
    use oxc::semantic::SymbolId;

    fn root_binding(scoping: &Scoping, name: &str) -> Option<SymbolId> {
        scoping.get_binding(scoping.root_scope_id(), name.into())
    }

    fn module_of<'a>(allocator: &'a Allocator, source: &'a str) -> Module<'a> {
        let program =
            Parser::new(allocator, source, source_type_for(Some("a.tsx"))).parse().program;
        let mut module = Module::for_source(allocator, source);
        bind(&program, &mut module, "@barqjs/core");
        module
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
