---
"@barqjs/arc": minor
"@barqjs/aria": patch
---

arc gains what a browser playground for a language needs around its editor: a REPL, editor tabs and a file explorer.

- arc `Repl`: streamed output by kind with ANSI colours, multi-line input while `isComplete` (default `bracketsBalanced`) says it is not whole, a history walked with Up and Down and kept under `storageKey`, Stop and Ctrl+C through an `AbortSignal`, and an `input` slot for an editor.
- arc `ResponsiveTabs` closes, reorders and pins tabs (`onClose`, `onReorder`, `onPinnedChange`, `dirty`, `pinned`, `title`), with a tab menu; `EditorTabs` in `@barqjs/arc/code` is it set up for open documents.
- arc `TreeView` renames a row in place (`onRename`, `renamingKey`, `validateLabel`) and takes an `end` per node.
- arc `FileExplorer` over `virtualFs()`, a reactive in-memory store that serialises to a plain object.
- arc `AnsiText` and `ansiColours`, out of `ConsoleLogView`.
- aria forwards `draggable` as a global attribute, and a splitter built outside the document no longer measures fonts it cannot read.
