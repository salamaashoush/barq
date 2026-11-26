---
"@barqjs/arc": minor
"@barqjs/lexical": minor
---

arc gains a rich text suite on `@barqjs/lexical`, in entries of its own so an app that never edits rich text loads none of it.

- arc `@barqjs/arc/editor`: `RichTextEditor` with a toolbar that follows the selection and folds into a More menu, a floating format bar, a link popover, markdown shortcuts with import and export, code blocks highlighted by arc's lezer setup, tables with row and column controls, images uploaded through the upload queue or pasted, embeds, a character counter, autosave, read-only and RTL text.
- arc `MentionTypeahead`, `SlashCommandMenu` and `EmojiShortcuts`: mentions from a list or a debounced search with avatars and a mention node, grouped and ranked commands, and emoji by name.
- arc `RichTextRenderer`: stored documents and markdown drawn without an editor through Lexical's headless editor, written whole by a server.
- arc `BlockEditor` and `defineBlock`: block handles that drag by pointer or touch, keyboard moves, a searchable insert picker, a block menu, and blocks of an app's own.
- arc `ChatComposer`: Enter to send, an attachment tray on the upload queue, an emoji button, an edit mode and schedule-send actions; `RichCommentComposer` plugs it into comment threads through their new `composer` prop.
- arc `@barqjs/arc/editor/collaboration`: `EditorCollaboration`, a shared Yjs document with remote cursors in arc's tones.
- arc's style barrel gains `place.passive`, `place.padded`, `place.paddedStrip` and `interaction.draggable`, and `useUploadQueue`'s `add` answers with the items it queued.
- lexical's typeahead and node menus take `menuLabel`, which names their listbox.
