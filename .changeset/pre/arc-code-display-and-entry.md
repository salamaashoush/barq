---
"@barqjs/arc": minor
"@barqjs/aria": minor
---

arc gains the code display and code entry pieces product pages kept building by hand.

- arc `CodeBlock`, `Highlight` and `CodeEditor` take `marks`; `CodeBlock` and `Highlight` take `range` (`rangeAround`), `highlighter="light"` and `renderLines`; `CodeBlock` takes `copyValue`. `CodeEditor` takes `folding`.
- arc bundles `shell` and `toml`; `highlightLines`, `lineMarks`, `languageForContentType` and `prettyJson` join the code entry.
- arc `TerminalBlock`: commands with a prompt a copy leaves out, continued lines, and transcripts with output.
- arc `CodeTabs` and `shellQuote`: setup snippets a tab each, with a shared, remembered choice.
- arc `tokenCompletions`, `codeIntelligence` and `workerIntelligence`, and `@barqjs/arc/code/worker` with `serveIntelligence` and `typescriptIntelligence`.
- arc `ConsoleLogView`, `JsonSchemaFields` with `jsonSchemaExample`, `TemplateTokenField` and `SnippetValuesProvider` with `SnippetValue`.
- aria `triggerTypeahead`: suggestions a text field offers after a trigger it types.
