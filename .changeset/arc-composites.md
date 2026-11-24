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
- arc `DockedPanels` and `DockedPanelToggle`: one non-modal panel docked beside the page at a time, resizable, collapsible, its width remembered, a sheet on a phone.
- arc `Wizard`: steps over one form on `Stepper`, each checked before it is left, a summary step, the step in the URL and resumable drafts.
- arc `KanbanBoard` and `applyKanbanMove`: columns of cards moved by pointer, touch or keyboard on aria's drag and drop, with WIP limits, folding, add card and virtual columns. `IconButton` takes `aria-expanded` and `aria-controls`.
- arc `DataGrid`: typed editable cells, spreadsheet keys, range selection, copy and paste, grouped headers, grouped rows with totals, frozen columns, add row and virtual rows, on `@barqjs/table`'s cell selection.
- arc `ImageField` and `ImageCropper`: an avatar or image chosen, cropped with pan, zoom and aspect presets, and uploaded through the upload queue with its progress.
- arc `MemberInvite`, `PendingInvites` and `InviteLinks`: invitations by email chips and role, pending ones to resend or revoke, and links to copy, create and deactivate.
- aria's `filter()` gains `matches`, where a substring matches in the locale's own way, and a slider takes `getValueLabel` for a value a number format cannot say, such as a playback position.
- primitives' `websocket` gains `onMessage`, every message in order, where `message` holds only the latest as of a flush.
- aria's `GridList` with drag and drop hydrates the server's rows instead of rebuilding them.
