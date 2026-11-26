---
"@barqjs/arc": minor
"@barqjs/primitives": minor
---

arc gains the panels a browser playground puts around its editor, and primitives keeps state in a link.

- arc `Workbench`: a one-screen app frame, a header bar, a fill region whose panels scroll inside themselves, and a status footer, at the viewport's height or its parent's.
- arc `ProblemsPanel`: problems grouped by document, counted and filtered by severity and text, with related places; `problemCounts`.
- arc `TestResults`: suites and tests with status and time, a failure's expected and actual values in `CodeDiff` (loaded on first need), run one, run all, rerun failed and stop.
- arc `CheckResults`: proved, falsified with a counterexample, unknown, error and timeout, extensible with the checker's own verdicts.
- arc `StatusBar` and `StatusBarItem`: problem counts, background tasks, cursor and language, compact on a narrow bar.
- arc `ShareDialog`: the state compressed into the link's hash, its size shown, copied in one press.
- arc `SourceLocation`, the place in a document every panel reports, independent of any language client.
- arc `CommandMenu` takes `bindKeys`, so an action's `keys` run it from anywhere; keys are shown as the reader's keyboard writes them.
- arc `control.filter`, a panel toolbar's search box, shared with `ConsoleLogView`.
- arc `ConsoleLogView`'s `height` is the whole log's, so `100%` fills a resizable panel, and a plain `EmptyState` draws no edge.
- primitives `url-state`: `encodeUrlState`, `decodeUrlState`, `readUrlState`, `writeUrlState` and `urlStateLink` (`deflate-raw`, base64url, in the hash).
- primitives `shortcut` binds sequences such as `"g p"`, with `sequenceTimeout`.
