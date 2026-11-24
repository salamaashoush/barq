---
"@barqjs/arc": minor
"@barqjs/ui": patch
"@barqjs/lexical": minor
---

arc's chat and rich text entries close the gaps their first release left.

- arc `EmojiButton`, from `@barqjs/arc/chat`: the button that opens the `EmojiPicker`, which a message's add-reaction button and `ChatComposer`'s emoji button now share; `ChatComposer` takes `emojiSource`, and `IconButton` takes `slot`.
- arc `ConversationList` stands alone in a page, a sheet or on a phone as well as in a sidebar, each row a finger's height under a coarse pointer; ui's `SidebarMenuButton` no longer needs a `SidebarProvider`.
- arc `MessageList` renders on the server: the newest rows (`serverRows`) at the foot of the estimated space, opened at the bottom with no script, measured in place and handed to the virtualizer once hydrated.
- lexical `ContentEditable` takes `serverContent`, the document a server writes in the root and a hydrating page keeps until the editor takes it over, and writes Lexical's root white space from the start.
- arc `RichTextEditor`, and `ChatComposer` editing a message, write their opening document on the server inside the editable box, drawn as the editor draws it, for Lexical to take over once hydrated; lexical commits a function's initial document as the editor is built, so no placeholder shows over it.
- arc `MessageList`'s `scrollToMessage` centres the message and marks it for a moment through the colour motion; `editingId` and `renderEditor` edit a message in place, and `MessageEditor` in `@barqjs/arc/editor` is `ChatComposer`'s edit mode opened on a message.
- arc `useMessageHistory`, from `@barqjs/arc/chat`: paged message history over a `@barqjs/db` live infinite query, with optimistic sends kept with Retry and Discard when refused, and `receive` for what a websocket pushes. `@barqjs/db` is an optional peer that arc's main entry never reaches.
