# @barqjs/aria

## 0.2.0-next.4

### Minor Changes

- 47fd28a: arc gains the code display and code entry pieces product pages kept building by hand.

  - arc `CodeBlock`, `Highlight` and `CodeEditor` take `marks`; `CodeBlock` and `Highlight` take `range` (`rangeAround`), `highlighter="light"` and `renderLines`; `CodeBlock` takes `copyValue`. `CodeEditor` takes `folding`.
  - arc bundles `shell` and `toml`; `highlightLines`, `lineMarks`, `languageForContentType` and `prettyJson` join the code entry.
  - arc `TerminalBlock`: commands with a prompt a copy leaves out, continued lines, and transcripts with output.
  - arc `CodeTabs` and `shellQuote`: setup snippets a tab each, with a shared, remembered choice.
  - arc `tokenCompletions`, `codeIntelligence` and `workerIntelligence`, and `@barqjs/arc/code/worker` with `serveIntelligence` and `typescriptIntelligence`.
  - arc `ConsoleLogView`, `JsonSchemaFields` with `jsonSchemaExample`, `TemplateTokenField` and `SnippetValuesProvider` with `SnippetValue`.
  - aria `triggerTypeahead`: suggestions a text field offers after a trigger it types.

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

- c001c9a: arc gains the type, navigation, data display, formatting, media and chart components it lacked, and ui and aria the parts they needed.

  - arc type: `Heading` (level apart from size), `Text`, `Code`, `Prose` (long-form markup styled logically), `Link` (an external link says so), `Truncate` (Show more once measured as cut) and `Shortcut` (`Mod+K` as the reader's keyboard writes it).
  - arc navigation: `ResponsiveTabs` (folding into More or scrolling), `BottomNavigation`, `Stepper`, `SideNav`, `Pager` (with `pageWindow`) and `TableOfContents` with scroll-spy. `DataTable` pages with `Pager`.
  - arc data display: `TreeView` (lazy children, load more, drag), tree rows in `DataTable` through `getSubRows`, `DescriptionList`, `Timeline`, `AvatarStack`, `Indicator`, `Tile`, `List` and `ListItem` (virtual, load more) and `StatGroup`.
  - arc formatting: `RelativeTime`, `FormattedDate`, `FormattedNumber`, `Currency`, `Bytes` and `Duration`, each agreeing between the server and the hydrating page. The number fields' shared props are now `FormattedFieldProps`.
  - arc media: `Image`, `Gallery` and `Lightbox`.
  - arc charts: `DonutChart`, `ComboChart`, `ScatterChart`, `FunnelChart`, `Gauge`, `Heatmap`, `Sparkline` and `ChartDataTable`, each with a table of its numbers; `StatCard` draws its trend with `Sparkline`.
  - ui: `CarouselDots`, and the carousel's selected snap and snap count; `useChart` and the chart scope exported for a plot of an app's own.
  - aria: `relativeTimeFormatter` and `relativeUnit`; `overflowItems` and `overflowingKeys`, the overflow measurement `ActionGroup` used, with an item that never folds; a tooltip trigger no longer stops the keys it does not use, so Escape reaches the dialog around it.

- e0d4f09: arc gains the form fields product forms kept building by hand.

  - arc `IdentifierField`, `SlugField` (with `slugify` and `freeSlug`), `SuggestionField`, and `TagInput` `line`: names typed to a convention, slugs followed from a name past taken ones with an availability check, free text over suggestions, and a list typed as one line.
  - arc `TextField` and `TextareaField` take the direction of what is typed; `textDirection` is exported.
  - arc `InlineEdit` and `InlineSelect`: values edited where they are read, pending and refused states included.
  - arc `SelectField` options take a `hint`, a `group`, a `noneLabel` option and keep a saved value no longer listed.
  - arc `CheckboxGroupField`, `RadioGroupField`, `ChecklistField` and `ThemePicker`; `RadioCards` and `CheckboxCards` take `media`.
  - arc `OptionalLimitField`, `PairedNumberField`, and `contrastWith` on `ColorField` and `ColorPicker` with `contrastRatio`.
  - arc `OptionGroup`, `fieldRules` with `FieldRule`, `RepeaterField`, `CollectionField`, `AddressFields` and `FileField`.
  - arc's style gains `control.quiet`, `layout.scrollBlock` and `bg.primary`.
  - aria's parts `ComboboxRoot` takes `allowsCustomValue`, keeping typed text through a close, a blur and Escape.
  - ui's `SelectItem` takes `detail`, a faint line the trigger leaves out; `RadioGroup` puts its `class` on the grid of items only.

- 9b4fbea: arc gains the standard inputs, pickers, actions and overlays it lacked, and ui and aria the parts they needed.

  - arc inputs: `Chip`, `TagGroup`, `TagInput`, `TimeField`, `TimePicker`, `DateRangeField`, `ColorPicker`, `ColorField`, `ColorSwatches`, `ColorEditor`, `ColorArea`, `ColorSlider`, `CurrencyField`, `PercentField`, `UnitField`, `PhoneField`, `Rating`, `RangeSlider`, `RadioCards` and `CheckboxCards`. Each is a field in `form.AppField` and stands alone with `value` or `defaultValue`.
  - arc files: `FileDropZone`, `useUploadQueue`, `UploadQueue` and `FileUpload`.
  - arc actions: `IconButton`, `SplitButton`, `ActionBar` (collapsing into More by priority) and `Toolbar`.
  - arc overlays: `Tearsheet`, `ResponsiveOverlay`, `Tour`, `Coachmark`, `Spotlight`, `useTourProgress`, `InlineAlert` and `Banner`.
  - ui: `DateRangePicker` takes presets and a field's label; `Slider` names each thumb and takes track and thumb classes; `inputVariants` and `dropdownMenuVariants` export those looks; an overlay's trigger now controls an element that exists.
  - aria: classes, slots and icons for the parts of `Tag`, `NumberField`, the colour thumbs and a collapsed `ActionGroup`; `ActionGroup` collapses by `getPriority` and names its More button by `moreLabel`; slider thumbs keep their own labels; a number field is described by its description; `ColorSwatch` forwards its attributes.

- 0a30c0b: arc gains the table and list views every product's list pages need.

  - arc `useSearchParam` and `oneOf`: any control's value in a search parameter, the default left out, a refused value falling back, typing debounced and replaced by a change from elsewhere.
  - arc `SegmentedControl`, `MultiSegmentedControl`, `SegmentedField` and `MultiSegmentedField`: counts, tone dots, a default segment, at least one held, the address or a form.
  - arc `TimeRangePicker`, `resolveTimeRange` and `commonTimeRangePresets`: preset windows, a custom range of two instants, and Live.
  - arc `DataToolbar` filters: option icons, groups and a field for long lists, a toggle, a date range, removable `key: value` chips, a `period` slot, and a Filters sheet below `md`; the search waits for typing to pause before the address takes it.
  - arc `SavedViews`: named views, own or shared, edited marks, Update, a default view, a link and delete.
  - arc `DataTable`: a failed-load state with Try again, a `footer` with `DataTableNote` and `DataTableCount`, an `aria-current` active row, per-table density, phone cards, totals and row actions (`RowActions`); selected rows that leave the screen leave the selection.
  - arc `SelectionBar`: actions that apply to the rows they fit, and per-row runs that keep refused rows selected with the reason and Retry failed.
  - arc `CellWithNote`, `OverflowList`, `InheritedScopeList`, and `List` sections with `useDateSections` and a Show more button.
  - aria's table `Row` takes `aria-current`.

- 19c99d0: `@barqjs/aria` closes every gap its README listed against React Aria.

  - New: `landmark` with F6 navigation, `ActionGroup`, `StepList` and `SearchAutocomplete`.
  - `GridList`, `Tree`, `Table` and `TagGroup` announce selection changes, and a table announces its sort order.
  - `ListBox`, `GridList` and `Table` load more as they scroll (`ListBoxLoadMoreItem`, `GridListLoadMoreItem`, `TableLoadMoreItem`, `loadMoreSentinel` from `@barqjs/aria/load-more`).
  - Table columns resize inside a `ResizableTableContainer`, through a `ColumnResizer`.
  - `CalendarMonthPicker` and `CalendarYearPicker`; ui's calendar builds its caption dropdowns on them.
  - `@barqjs/aria/date` is now `@internationalized/date`: every calendar system, `ZonedDateTime`, era and time-zone segments in the date fields, and a date picker that holds its day until the time is set. `getDayOfWeek`, `startOfWeek`, `endOfWeek` and `getWeeksInMonth` take a locale, `today` and `isToday` take a time zone, and `firstDayOfWeek` is a day name.
  - Colours in OKLCH, OKLab, Lab, LCH and HWB, with CSS Color 4 gamut mapping. `ColorField` edits one channel when given `channel`, and the area, sliders and wheel draw their own backgrounds.

  `@barqjs/testing`'s ARIA checker follows ARIA 1.2 and no longer requires `aria-selected` on an option.

### Patch Changes

- c67406a: `@barqjs/arc/chat` is the communication suite: `MessageList`, a virtualized conversation that keeps its place as older pages load and rows resize; `MessageItem` with attachments, reactions, threads and its actions; `ThreadPanel`; `EmojiPicker` over emojibase's data, loaded on first open; `TypingIndicator`; `ConversationList` for `AppShell`'s new `sidebar` slot; `CallStage`, `ParticipantTile`, `CallControls`, `IncomingCall` and `CallBanner`; and `AIChatPanel`. The main entry adds `PresenceDot`, `PresenceStatus`, a presence store with `PresenceProvider`, and `ReactionBar`, which `CommentThread` now draws. `Presence`'s `"busy"` is now `"dnd"`, read as "Do not disturb".

  `@barqjs/aria`'s virtualizer lays a list out again when a row's measured height corrects its estimate, which it used to apply only on the next collection change or resize, and `measureRow` takes any `measure` and `shouldMeasure` pair.

- 6d04722: arc gains the keys, secrets and connections product settings kept building by hand.

  - arc `SecretField`, `StoredSecretField`, `SecretReferenceField`, `FileOrPasteField` and `CopyableField`: secrets typed, kept, referenced and pasted from a file, and values to copy.
  - arc `MaskedValue`, `OneTimeSecret`, `RedactedSecret` and `RedactedText`: secrets shown on request, shown once, and taken out of text.
  - arc `PermissionScopePicker` and `scopeSummary`, and `CredentialBindingList`: scopes to grant, and where each secret comes from.
  - arc `ApiKeyManager`, `ActiveSessionsList`, `ConnectedAppsList` and `ConnectionTestDialog`.
  - arc `ResponsiveOverlay` keeps a tall dialog inside the screen, its body scrolling, and a table row's inline action no longer also shows in its menu.
  - aria `Button` names itself with its progress bar only while one is inside it.

- c906e09: arc gains what a browser playground for a language needs around its editor: a REPL, editor tabs and a file explorer.

  - arc `Repl`: streamed output by kind with ANSI colours, multi-line input while `isComplete` (default `bracketsBalanced`) says it is not whole, a history walked with Up and Down and kept under `storageKey`, Stop and Ctrl+C through an `AbortSignal`, and an `input` slot for an editor.
  - arc `ResponsiveTabs` closes, reorders and pins tabs (`onClose`, `onReorder`, `onPinnedChange`, `dirty`, `pinned`, `title`), with a tab menu; `EditorTabs` in `@barqjs/arc/code` is it set up for open documents.
  - arc `TreeView` renames a row in place (`onRename`, `renamingKey`, `validateLabel`) and takes an `end` per node.
  - arc `FileExplorer` over `virtualFs()`, a reactive in-memory store that serialises to a plain object.
  - arc `AnsiText` and `ansiColours`, out of `ConsoleLogView`.
  - aria forwards `draggable` as a global attribute, and a splitter built outside the document no longer measures fonts it cannot read.

- d2f0fad: Fixes found building arc's DataTable and form fields.

  - A sortable `Table` column sorts once per Enter or Space press, not on key-down and again on key-up.
  - `DateField` and `TimeField` take `aria-describedby`, and their first segment (every segment while invalid) is described by the field's description and error, as in React Aria.
  - `mergeProps` lists each `aria-describedby` id once, so a `Select` trigger no longer repeats its caller's description.
  - A pending `Button` withdraws its live announcement when it is disposed. `announce` returns a function that takes an announcement back.
  - A virtualised `Table` measures a focused cell by its row: Page Down moves a viewport, and the focused row stays rendered when scrolled away.
  - ui's one-component `Combobox` forwards `id`, `aria-labelledby` and `aria-describedby` to its trigger and labels its search the same way.
  - `@barqjs/testing`'s `ariaViolations` keeps the offending element behind a getter, so a failed assertion prints the violation instead of the whole document.
  - arc's date fields are named and described through aria's `DateField` rather than the surrounding `Field`.

- 0968d16: Date segments carry their field's name and description, and a spread on a `<select>` selects its option on the first render.

  - Each date segment is named by its part and then by its field's label, as in React Aria: "day, Departure". A field's `aria-label` and `aria-labelledby` reach every segment.
  - `DatePicker` and `DateRangePicker` pass their label, description and error to the segments of the fields inside them, through the new `PickerFieldContext`, without naming or describing the inner field's group. `DatePicker` takes `aria-describedby`.
  - A `value` or `selectedIndex` that reaches a `<select>` through a spread is written after its options, so `select.value` is right as soon as it renders. Everything else in the spread, `multiple` included, is still written before the options. The same holds for a `<select>` built by `element()`.

- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- 657a57b: An open modal (a dialog, alert dialog, sheet or drawer) makes the page outside it `inert` rather than only `aria-hidden`, as React Aria's `useModalOverlay` does, so a control behind it is out of the Tab order as well as hidden from a screen reader. A tooltip on a control inside a modal stays hoverable.
- 64ef645: A popover, menu, select or tooltip no longer slides in from the page's top-left corner when it opens. Before its first measurement the overlay was given `top: 0; left: 0`, and a stylesheet with a transition on it (every shadcn style's `duration-100` is `transition: all 100ms`) animated from there to the real position; a reopened one slid from where the last one stood. An overlay now has no coordinates until that element has been measured, and `auto` to a length does not transition.
- Updated dependencies [4d59c06]
- Updated dependencies [59a9e79]
- Updated dependencies [fe3ed7f]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [e82bd6c]
  - @barqjs/primitives@0.2.0-next.4
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3
  - @barqjs/primitives@0.2.0-next.3
  - @barqjs/server@0.2.0-next.3
  - @barqjs/web@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2
  - @barqjs/primitives@0.2.0-next.2
  - @barqjs/server@0.2.0-next.2
  - @barqjs/web@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1
  - @barqjs/primitives@0.2.0-next.1
  - @barqjs/server@0.2.0-next.1
  - @barqjs/web@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
  - @barqjs/primitives@0.2.0-next.0
  - @barqjs/server@0.2.0-next.0
  - @barqjs/web@0.2.0-next.0
