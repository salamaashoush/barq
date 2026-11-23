---
"@barqjs/lexical": minor
---

`@barqjs/lexical` is barq's binding for Lexical 0.53, the counterpart of `@lexical/react`: `LexicalComposer` over Lexical's own extensions, `ContentEditable` with a placeholder, decorator nodes whose `decorate()` returns a barq component (`DecoratorBlockNode` included), `LexicalTypeaheadMenuPlugin` and `LexicalNodeMenuPlugin` with listbox semantics, Yjs collaboration from `@barqjs/lexical/collaboration`, and editor state as signals. On the server the editor renders an empty editable shell, which hydrates without a mismatch.
