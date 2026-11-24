---
"@barqjs/arc": minor
"@barqjs/aria": minor
---

arc gains the composites several products each built by hand, and aria the parts they needed.

- arc `CommandMenu` takes `sources`: searched as the reader types, debounced and aborted, each a group of its own with marked matches, snippets, paging, its own loading, empty and error rows, and `recent` results offered before typing. `HighlightMatches` marks what a search matched.
- arc `CommentThreadList`, `CommentThread` and `CommentComposer`: threads with replies, `@` mentions, edit, delete, resolve and reopen, reactions, anchors that can be detached, unread markers, and every change shown at once and pending until it settles. `PersonAvatar` is one person's avatar, which `AvatarStack` now draws.
- arc `MediaPlayer`: audio and video on the native element with an accessible seek bar, volume, speed, captions, chapters, a transcript that follows the media, picture in picture, full screen, keyboard shortcuts and double-tap seeking, its controls left to right on a right-to-left page. `durationText` writes a duration as `Duration` does.
- aria's `filter()` gains `matches`, where a substring matches in the locale's own way, and a slider takes `getValueLabel` for a value a number format cannot say, such as a playback position.
