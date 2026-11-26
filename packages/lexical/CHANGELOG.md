# @barqjs/lexical

## 0.2.0-next.4

### Minor Changes

- 6e8bbc2: arc's chat and rich text entries close the gaps their first release left.

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

- 3e86dc3: arc gains a rich text suite on `@barqjs/lexical`, in entries of its own so an app that never edits rich text loads none of it.

  - arc `@barqjs/arc/editor`: `RichTextEditor` with a toolbar that follows the selection and folds into a More menu, a floating format bar, a link popover, markdown shortcuts with import and export, code blocks highlighted by arc's lezer setup, tables with row and column controls, images uploaded through the upload queue or pasted, embeds, a character counter, autosave, read-only and RTL text.
  - arc `MentionTypeahead`, `SlashCommandMenu` and `EmojiShortcuts`: mentions from a list or a debounced search with avatars and a mention node, grouped and ranked commands, and emoji by name.
  - arc `RichTextRenderer`: stored documents and markdown drawn without an editor through Lexical's headless editor, written whole by a server.
  - arc `BlockEditor` and `defineBlock`: block handles that drag by pointer or touch, keyboard moves, a searchable insert picker, a block menu, and blocks of an app's own.
  - arc `ChatComposer`: Enter to send, an attachment tray on the upload queue, an emoji button, an edit mode and schedule-send actions; `RichCommentComposer` plugs it into comment threads through their new `composer` prop.
  - arc `@barqjs/arc/editor/collaboration`: `EditorCollaboration`, a shared Yjs document with remote cursors in arc's tones.
  - arc's style barrel gains `place.passive`, `place.padded`, `place.paddedStrip` and `interaction.draggable`, and `useUploadQueue`'s `add` answers with the items it queued.
  - lexical's typeahead and node menus take `menuLabel`, which names their listbox.

- dfe1e6f: `@barqjs/lexical` is barq's binding for Lexical 0.53, the counterpart of `@lexical/react`: `LexicalComposer` over Lexical's own extensions, `ContentEditable` with a placeholder, decorator nodes whose `decorate()` returns a barq component (`DecoratorBlockNode` included), `LexicalTypeaheadMenuPlugin` and `LexicalNodeMenuPlugin` with listbox semantics, Yjs collaboration from `@barqjs/lexical/collaboration`, and editor state as signals. On the server the editor renders an empty editable shell, which hydrates without a mismatch.

### Patch Changes

- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
