---
"@barqjs/arc": minor
"@barqjs/aria": minor
---

arc gains the composites several products each built by hand, and aria the parts they needed.

- arc `CommandMenu` takes `sources`: searched as the reader types, debounced and aborted, each a group of its own with marked matches, snippets, paging, its own loading, empty and error rows, and `recent` results offered before typing. `HighlightMatches` marks what a search matched.
- aria's `filter()` gains `matches`, where a substring matches in the locale's own way.
