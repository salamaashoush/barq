---
"@barqjs/arc": minor
---

arc's editor is built from editor extensions, and gains the first generic blocks of a document.

- arc `defineEditorExtension`: one value for a feature's nodes, blocks, commands, toolbar, floating-bar and block-menu items, keys, paste rules, markdown, HTML and Word rules, renderer output, collaboration exclusions, plugins, footer and a lazily loaded module. `defineBlock` returns one, and every built-in is one.
- arc presets `documentPreset`, `chatPreset` and `commentPreset`; editors, the renderer and the converters take `preset` and `extensions`, and `customizeExtensions` leaves built-ins out by name. The `blocks`, `tables`, `embeds`, `nodes` and `autoLink` options are gone: pass extensions, or `embedExtension({ providers })`. `RichTextEditor`'s Lexical extensions move to `lexical`.
- arc callouts, columns, toggles, page breaks and footnotes, keeping the stored node types and fields.
- arc find and replace, a document status bar with an outline and focus mode, paste rules with clipboard memory and block-menu cut, copy and paste, `htmlToDocument`, Word import through `wordToHtml`, and `TextTracksEditor` for a recording's captions, audio description and transcript.
