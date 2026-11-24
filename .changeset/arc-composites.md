---
"@barqjs/arc": minor
"@barqjs/aria": minor
"@barqjs/ui": patch
"@barqjs/primitives": minor
---

arc gains the composites several products each built by hand, and aria the parts they needed.

- arc `CommandMenu` takes `sources`: searched as the reader types, debounced and aborted, each a group of its own with marked matches, snippets, paging, its own loading, empty and error rows, and `recent` results offered before typing. `HighlightMatches` marks what a search matched.
- arc `CommentThreadList`, `CommentThread` and `CommentComposer`: threads with replies, `@` mentions, edit, delete, resolve and reopen, reactions, anchors that can be detached, unread markers, and every change shown at once and pending until it settles. `PersonAvatar` is one person's avatar, which `AvatarStack` now draws.
- arc `MediaPlayer`: audio and video on the native element with an accessible seek bar, volume, speed, captions, chapters, a transcript that follows the media, picture in picture, full screen, keyboard shortcuts and double-tap seeking, its controls left to right on a right-to-left page. `durationText` writes a duration as `Duration` does.
- arc `ClipRecorder`: audio and video clips with the permission asked on a press, device choice, a level meter, a countdown, a timer, playback and attach.
- arc `DataViews` and `ViewSwitcher`: list, board, table and calendar views over the same data and filters, the chosen view in the URL. ui's `ToggleGroupItem` keeps a `data-slot` it is given.
- arc `VersionHistory`: versions with their authors and times, a preview, a compare against the current version or the one before, and Restore through `confirm()`.
- arc auth templates: `AuthLayout`, `SignInForm` (providers, magic link, passkey, remember me), `SignUpForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `TwoFactorForm` on ui's `InputOTP`, `RecoveryCodes`, `PasskeyPrompt` and `PasswordStrength`.
- arc `NotificationCenter`, `NotificationFeed` and `useNotifications`: a bell with the unread count, a popover or a sheet on a phone, grouped read and unread notifications with their own actions and mark all, and live appends from an event stream or a socket.
- arc `SettingsLayout` (side navigation, a list then detail on a phone), `SettingsSection` (a form per section with its save bar and leave guard) and `DangerZone`.
- arc `EntityPicker`: one or several options a server finds as the reader types, with avatars, marked matches, chips, a limit, Show more and Create. `remoteSearch` is the debounced, aborting, paging search it and `CommandMenu` share.
- aria's `filter()` gains `matches`, where a substring matches in the locale's own way, and a slider takes `getValueLabel` for a value a number format cannot say, such as a playback position.
- primitives' `websocket` gains `onMessage`, every message in order, where `message` holds only the latest as of a flush.
