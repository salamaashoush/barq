---
"@barqjs/arc": minor
---

arc's code editor talks to any language server, and a new language needs no grammar.

- arc `languageClient`, on `@codemirror/lsp-client`: a Language Server Protocol client for a project over any `Transport` (`portTransport` for a worker or a port). Editors get completion with snippets and resolved docs, hover in arc's markdown, signature help, diagnostics with related places and quick fixes, semantic tokens in the theme's colours, inlay hints, code lenses, code actions, folding, formatting, definition across files (`onNavigate`), references and rename across files. `diagnostics()`, `symbols(uri)` (`symbolNodes` for `OutlineView`), `progress()` and `status()` are reactive.
- `@barqjs/arc/code/worker` now has `serveLanguageServer` and `typescriptServer`, which speak LSP. `codeIntelligence`, `workerIntelligence`, `serveIntelligence`, `typescriptIntelligence` and the `CodeIntelligence` types are removed.
- arc `defineLanguage`: an editor language from keywords, operators, strings, comments and brackets, with indentation, auto-close and folds.
- `ArcMessages.codePhrases` translates CodeMirror's words in a code editor.
