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
- arc calls: a menu on each `ParticipantTile` (pin, mute for me, full screen; a long press under a finger), `CallStage`'s `pinnedId` and `audioOutput`, `useMediaDevices` for devices, choices and permissions, and `CallWindow`, a draggable, keyboard-movable picture-in-picture window kept inside the viewport. arc's style barrel gains `place.endCorner`, `place.floating` and `surface.onMedia`.
- arc `arabicEmoji`: Arabic emoji names and keywords from CLDR's annotations over emojibase's list, loaded on demand, with a search that folds Arabic spelling variants.
- arc rich text: `TableSizePicker` sizes a table on insert (the Insert menu and `/table`, through `OPEN_TABLE_DIALOG_COMMAND`), columns resize from their edge by pointer or keyboard with the widths kept and rendered, an image's alt text and caption are edited in a popover, and `BlockEditor` marks empty blocks with `blockPlaceholders`. arc's style barrel gains `interaction.resize`.
- lexical `ContentEditable` binds the editor once its element is in the page (in a browser it never bound, being cloned into a windowless template document), and collaborators' carets are placed from a zero-size origin so they sit on their text whatever the container's margins or scroll; arc's `EditorCollaboration` mounts once the editor has its root.
- arc `MessageList` keeps its height to scroll in a browser (its rows overflowed upwards, out of reach) and lays out the conversation's start as a row, so the newest message sits exactly at the bottom.
