# @barqjs/primitives

## 0.2.0-next.4

### Minor Changes

- 4d59c06: arc gains the composites several products each built by hand, and aria the parts they needed.

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
  - aria: a pending button's announcement no longer outlives the progress bar it names; the announcer prunes entries naming ids that are gone.

- fe3ed7f: arc gains the panels a browser playground puts around its editor, and primitives keeps state in a link.

  - arc `Workbench`: a one-screen app frame, a header bar, a fill region whose panels scroll inside themselves, and a status footer, at the viewport's height or its parent's.
  - arc `ProblemsPanel`: problems grouped by document, counted and filtered by severity and text, with related places; `problemCounts`.
  - arc `TestResults`: suites and tests with status and time, a failure's expected and actual values in `CodeDiff` (loaded on first need), run one, run all, rerun failed and stop.
  - arc `CheckResults`: proved, falsified with a counterexample, unknown, error and timeout, extensible with the checker's own verdicts.
  - arc `StatusBar` and `StatusBarItem`: problem counts, background tasks, cursor and language, compact on a narrow bar.
  - arc `ShareDialog`: the state compressed into the link's hash, its size shown, copied in one press.
  - arc `SourceLocation`, the place in a document every panel reports, independent of any language client.
  - arc `CommandMenu` takes `bindKeys`, so an action's `keys` run it from anywhere; keys are shown as the reader's keyboard writes them.
  - arc `control.filter`, a panel toolbar's search box, shared with `ConsoleLogView`.
  - arc `ConsoleLogView`'s `height` is the whole log's, so `100%` fills a resizable panel, and a plain `EmptyState` draws no edge.
  - primitives `url-state`: `encodeUrlState`, `decodeUrlState`, `readUrlState`, `writeUrlState` and `urlStateLink` (`deflate-raw`, base64url, in the hash).
  - primitives `shortcut` binds sequences such as `"g p"`, with `sequenceTimeout`.

### Patch Changes

- 0a43dbe: `@barqjs/primitives` adds `colorScheme`, `useColorScheme` and `colorSchemeScript`: a light, dark or system theme kept in a cookie and written on `<html>` before the first paint, so a server-rendered or prerendered page never flashes the wrong theme.

  The Vite plugin finds packages that publish source at any depth and through peer dependencies, resolving each from where its dependent is installed. A design system built on `@barqjs/aria` no longer leaves `@barqjs/primitives` external in the server bundle.

  Inline scripts and styles declared through `useHead` carry the render's CSP nonce, in the shell and in streamed head patches, and an `id` names a script's or style's head identity.

- e82bd6c: `@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

  `@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

  `@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

  `@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.

- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3
  - @barqjs/web@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2
  - @barqjs/web@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1
  - @barqjs/web@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
  - @barqjs/web@0.2.0-next.0
