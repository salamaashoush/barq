//! Every fix a finding offers, applied and compiled again: the finding it
//! came with is gone and nothing else is reported in its place.

use crate::compile::{Diagnostic, compile};
use crate::diag::Code;
use crate::options::TransformOptions;

fn report(source: &str) -> Vec<Diagnostic> {
    let options = TransformOptions {
        filename: Some("/app/src/view.tsx".to_string()),
        dev: Some(true),
        ..TransformOptions::default()
    };
    match compile(source, &options.resolve()) {
        Ok(output) => output.warnings,
        Err(errors) => errors,
    }
}

fn fixed(source: &str, diagnostics: &[Diagnostic]) -> String {
    let mut edits: Vec<_> = diagnostics.iter().flat_map(|found| found.fix.iter()).collect();
    edits.sort_by_key(|(span, _)| std::cmp::Reverse(span.start));
    let mut text = source.to_string();
    for (span, replacement) in edits {
        text.replace_range(span.start as usize..span.end as usize, replacement);
    }
    text
}

fn codes(diagnostics: &[Diagnostic]) -> Vec<Code> {
    diagnostics.iter().filter_map(|found| found.code).collect()
}

fn repaired(source: &str, code: Code, expected: &str) {
    let found = report(source);
    assert!(codes(&found).contains(&code), "{code:?} was not reported: {found:?}");
    let after = fixed(source, &found);
    assert_eq!(after, expected);
    let left = report(&after);
    assert!(!codes(&left).contains(&code), "{code:?} survived its fix: {left:?}");
}

#[test]
fn an_accessor_used_as_a_value_is_called() {
    repaired(
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [count] = createSignal(0);\n\
           return <p>{count + 1}</p>;\n\
         }\n",
        Code::Barq001,
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [count] = createSignal(0);\n\
           return <p>{count() + 1}</p>;\n\
         }\n",
    );
}

#[test]
fn an_accessor_used_as_a_condition_is_called() {
    repaired(
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [open] = createSignal(false);\n\
           return <p>{open ? \"yes\" : \"no\"}</p>;\n\
         }\n",
        Code::Barq002,
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [open] = createSignal(false);\n\
           return <p>{open() ? \"yes\" : \"no\"}</p>;\n\
         }\n",
    );
}

#[test]
fn a_member_read_off_an_accessor_is_read_off_its_value() {
    repaired(
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [rows] = createSignal<string[]>([]);\n\
           return <p>{rows.length}</p>;\n\
         }\n",
        Code::Barq003,
        "import { createSignal } from \"@barqjs/core\";\n\
         export function V() {\n\
           const [rows] = createSignal<string[]>([]);\n\
           return <p>{rows().length}</p>;\n\
         }\n",
    );
}

#[test]
fn a_provider_member_becomes_the_context_in_both_tags() {
    repaired(
        "import { createContext } from \"@barqjs/core\";\n\
         const Theme = createContext(\"light\");\n\
         export const V = () => <Theme.Provider value=\"dark\"><p>salama</p></Theme.Provider>;\n\
         export const W = () => <Theme.Provider value=\"dark\" />;\n",
        Code::Barq022,
        "import { createContext } from \"@barqjs/core\";\n\
         const Theme = createContext(\"light\");\n\
         export const V = () => <Theme value=\"dark\"><p>salama</p></Theme>;\n\
         export const W = () => <Theme value=\"dark\" />;\n",
    );
}

#[test]
fn class_list_becomes_class() {
    repaired(
        "export const V = (props: { on: boolean }) => <p classList={{ on: props.on }} />;\n",
        Code::Barq023,
        "export const V = (props: { on: boolean }) => <p class={{ on: props.on }} />;\n",
    );
}

#[test]
fn a_namespace_that_is_a_rename_is_renamed() {
    repaired(
        "export const V = (props: { go: () => void }) => (\n\
           <button on:click={props.go} attr:title=\"go\" bool:disabled={false} />\n\
         );\n",
        Code::Barq024,
        "export const V = (props: { go: () => void }) => (\n\
           <button onClick={props.go} title=\"go\" disabled={false} />\n\
         );\n",
    );
}

#[test]
fn a_namespace_with_no_single_spelling_offers_no_fix() {
    let found = report(
        "export const V = (props: { go: () => void }) => <p on:my-event={props.go} style:color=\"red\" />;\n",
    );
    let namespaced: Vec<_> =
        found.iter().filter(|found| found.code == Some(Code::Barq024)).collect();
    assert_eq!(namespaced.len(), 2, "{found:?}");
    assert!(namespaced.iter().all(|found| found.fix.is_empty()), "{namespaced:?}");
}
