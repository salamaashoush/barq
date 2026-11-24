---
"@barqjs/arc": minor
"@barqjs/aria": patch
---

`@barqjs/arc/chat` is the communication suite: `MessageList`, a virtualized conversation that keeps its place as older pages load and rows resize; `MessageItem` with attachments, reactions, threads and its actions; `ThreadPanel`; `EmojiPicker` over emojibase's data, loaded on first open; `TypingIndicator`; `ConversationList` for `AppShell`'s new `sidebar` slot; `CallStage`, `ParticipantTile`, `CallControls`, `IncomingCall` and `CallBanner`; and `AIChatPanel`. The main entry adds `PresenceDot`, `PresenceStatus`, a presence store with `PresenceProvider`, and `ReactionBar`, which `CommentThread` now draws. `Presence`'s `"busy"` is now `"dnd"`, read as "Do not disturb".

`@barqjs/aria`'s virtualizer lays a list out again when a row's measured height corrects its estimate, which it used to apply only on the next collection change or resize, and `measureRow` takes any `measure` and `shouldMeasure` pair.
