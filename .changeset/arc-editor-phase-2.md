---
"@barqjs/arc": minor
"@barqjs/web": patch
---

arc's editor gains the formatting and block shell of a document editor.

- arc formatting: superscript and subscript, text colour and highlight from nine colours, small, large and huge text and clear formatting (`formattingExtension`, `TextColourMenu`, `TextSizeMenu`), each on its key, kept from pasted HTML and drawn by the renderer.
- arc floating bar: Turn into, stays away from code and a pressed pointer, and a bar for a block chosen whole reached by Tab; a link on a caret writes its address.
- arc block shell: the block menu on a right click and Mod+/, Mod+D, Alt+Shift with the arrows, Turn into callouts and toggles, picker group chips, placeholders in toggle titles and one-line callouts, typing after a chosen block, a divider that keeps the caret, cells that take text only. Extensions add toolbar `control`s, `turnInto` kinds and `placeholder`s.
- arc editor shell: `validate` and `onValidityChange`, `autoFocus`, `language` and a document's own direction, `historyLimit`, and `replaceDocument`.
- arc tables: row and column grips, moves, header column, merge and split, cell colour and alignment, striped rows, a line beside the table, and Tab in the last cell adds a row.
- arc code blocks: a language menu, line numbers and copy; and the document as markdown in a dialog.
- arc fix: the renderer draws pictures, and page breaks round-trip through markdown.
- web fix: a `<pre>`'s `innerHTML` keeps the server's nodes when hydrating.
