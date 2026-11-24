---
"@barqjs/arc": minor
"@barqjs/ui": patch
---

arc's chat and rich text entries close the gaps their first release left.

- arc `EmojiButton`, from `@barqjs/arc/chat`: the button that opens the `EmojiPicker`, which a message's add-reaction button and `ChatComposer`'s emoji button now share; `ChatComposer` takes `emojiSource`, and `IconButton` takes `slot`.
- arc `ConversationList` stands alone in a page, a sheet or on a phone as well as in a sidebar, each row a finger's height under a coarse pointer; ui's `SidebarMenuButton` no longer needs a `SidebarProvider`.
