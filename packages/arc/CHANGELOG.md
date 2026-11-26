# @barqjs/arc

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

- c67406a: `@barqjs/arc/chat` is the communication suite: `MessageList`, a virtualized conversation that keeps its place as older pages load and rows resize; `MessageItem` with attachments, reactions, threads and its actions; `ThreadPanel`; `EmojiPicker` over emojibase's data, loaded on first open; `TypingIndicator`; `ConversationList` for `AppShell`'s new `sidebar` slot; `CallStage`, `ParticipantTile`, `CallControls`, `IncomingCall` and `CallBanner`; and `AIChatPanel`. The main entry adds `PresenceDot`, `PresenceStatus`, a presence store with `PresenceProvider`, and `ReactionBar`, which `CommentThread` now draws. `Presence`'s `"busy"` is now `"dnd"`, read as "Do not disturb".

  `@barqjs/aria`'s virtualizer lays a list out again when a row's measured height corrects its estimate, which it used to apply only on the next collection change or resize, and `measureRow` takes any `measure` and `shouldMeasure` pair.

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

- 989b03f: arc gains a composition layer, and nothing in it is written twice.

  - `@barqjs/arc/style`: arc's treatments as foldable groups (layout, a gap scale, text roles, colour roles and tones, surfaces, focus and interaction states, motion that stops under reduced motion, touch targets) and the `space`, `radius`, `motionTokens` and `zIndex` tokens. They compose ui's groups rather than restating them.
  - `Stack`, `Inline`, `Grid`, `Container` and `Center`, with responsive props on viewport or container steps.
  - One customisation contract on every component: `class` on the root, typed `classes` per part, a `data-slot` on every part, styles exported as `variants({ slots })`, and `renders` where a part holds the caller's content.
  - `ArcProvider` takes `density` (compact, comfortable, spacious, or `data-density` on any region), `contrast` (a high-contrast token set, always or by system preference) and `messages`, a dictionary for every word arc prints. The theme gains an emphasized easing curve.
  - A duplication guard in arc's suite fails when a declaration group, or a colour, spacing or radius value, is written in two places.
  - ui: `@barqjs/ui/conditions` names every breakpoint and container step once, backed by width tokens, and `useIsMobile` and arc's `DataTable` read it. Controls reach 44px under a coarse pointer (`touch`), redraw focus, edges, chosen and disabled states in system colours under forced colours (`contrast`), and pointing icons mirror under rtl through `icon.directional`.

- c001c9a: arc gains the type, navigation, data display, formatting, media and chart components it lacked, and ui and aria the parts they needed.

  - arc type: `Heading` (level apart from size), `Text`, `Code`, `Prose` (long-form markup styled logically), `Link` (an external link says so), `Truncate` (Show more once measured as cut) and `Shortcut` (`Mod+K` as the reader's keyboard writes it).
  - arc navigation: `ResponsiveTabs` (folding into More or scrolling), `BottomNavigation`, `Stepper`, `SideNav`, `Pager` (with `pageWindow`) and `TableOfContents` with scroll-spy. `DataTable` pages with `Pager`.
  - arc data display: `TreeView` (lazy children, load more, drag), tree rows in `DataTable` through `getSubRows`, `DescriptionList`, `Timeline`, `AvatarStack`, `Indicator`, `Tile`, `List` and `ListItem` (virtual, load more) and `StatGroup`.
  - arc formatting: `RelativeTime`, `FormattedDate`, `FormattedNumber`, `Currency`, `Bytes` and `Duration`, each agreeing between the server and the hydrating page. The number fields' shared props are now `FormattedFieldProps`.
  - arc media: `Image`, `Gallery` and `Lightbox`.
  - arc charts: `DonutChart`, `ComboChart`, `ScatterChart`, `FunnelChart`, `Gauge`, `Heatmap`, `Sparkline` and `ChartDataTable`, each with a table of its numbers; `StatCard` draws its trend with `Sparkline`.
  - ui: `CarouselDots`, and the carousel's selected snap and snap count; `useChart` and the chart scope exported for a plot of an app's own.
  - aria: `relativeTimeFormatter` and `relativeUnit`; `overflowItems` and `overflowingKeys`, the overflow measurement `ActionGroup` used, with an item that never folds; a tooltip trigger no longer stops the keys it does not use, so Escape reaches the dialog around it.

- 41567c2: arc's editor is built from editor extensions, and gains the first generic blocks of a document.

  - arc `defineEditorExtension`: one value for a feature's nodes, blocks, commands, toolbar, floating-bar and block-menu items, keys, paste rules, markdown, HTML and Word rules, renderer output, collaboration exclusions, plugins, footer and a lazily loaded module. `defineBlock` returns one, and every built-in is one.
  - arc presets `documentPreset`, `chatPreset` and `commentPreset`; editors, the renderer and the converters take `preset` and `extensions`, and `customizeExtensions` leaves built-ins out by name. The `blocks`, `tables`, `embeds`, `nodes` and `autoLink` options are gone: pass extensions, or `embedExtension({ providers })`. `RichTextEditor`'s Lexical extensions move to `lexical`.
  - arc callouts, columns, toggles, page breaks and footnotes, keeping the stored node types and fields.
  - arc find and replace, a document status bar with an outline and focus mode, paste rules with clipboard memory and block-menu cut, copy and paste, `htmlToDocument`, Word import through `wordToHtml`, and `TextTracksEditor` for a recording's captions, audio description and transcript.

- 12d8d9e: `@barqjs/arc/editor` gains its media blocks. Pictures take four sizes, a place at the start, middle or end, alt text or a decorative mark with a warning while neither, a caption, a credit with its licence, a focus point and numbered labels; Word's pictures come in at their size on the page. Galleries of up to twenty-four pictures read on `Gallery` and `Lightbox`, a before and after slides between two, files read as cards with a viewer and a PDF's pages and keep their first version as `origin`, video and sound play on `MediaPlayer` with captions, an audio description, a transcript and chapters marked at the player's time, and embeds come from fourteen sites, a reader's frame loading only once chosen. `provideEditorMedia` lends the blocks an app's `fileUrl`, its media `library` and picture search, words for its upload refusals and uploads a reload cut off; `fieldId` hands files on their way to an editor started again, leaving mid-upload asks first, `storedFilesExtension` reads kept files addressed by a scheme, and a Commons link pastes as a credited picture.

  A block made with `defineBlock` is now stored as its data's fields beside the node's own `type`, `version` and `format`, not under `data`, and its readers and writers carry `format`. `EmbedProvider` names an `id`, `parse` and `src` in place of `match`, and an embed stores `provider` and `embedId`. `MediaPlayer` reads a `descriptions` prop or `descriptions` track aloud behind an Audio description button.

- 59a9e79: arc's editor gains the formatting and block shell of a document editor.

  - arc formatting: superscript and subscript, text colour and highlight from nine colours, small, large and huge text and clear formatting (`formattingExtension`, `TextColourMenu`, `TextSizeMenu`), each on its key, kept from pasted HTML and drawn by the renderer.
  - arc floating bar: Turn into, stays away from code and a pressed pointer, and a bar for a block chosen whole reached by Tab; a link on a caret writes its address.
  - arc block shell: the block menu on a right click and Mod+/, Mod+D, Alt+Shift with the arrows, Turn into callouts and toggles, picker group chips, placeholders in toggle titles and one-line callouts, typing after a chosen block, a divider that keeps the caret, cells that take text only. Extensions add toolbar `control`s, `turnInto` kinds and `placeholder`s.
  - arc editor shell: `validate` and `onValidityChange`, `autoFocus`, `language` and a document's own direction, `historyLimit`, and `replaceDocument`.
  - arc tables: row and column grips, moves, header column, merge and split, cell colour and alignment, striped rows, a line beside the table, and Tab in the last cell adds a row.
  - arc code blocks: a language menu, line numbers and copy; and the document as markdown in a dialog.
  - arc fix: the renderer draws pictures, and page breaks round-trip through markdown.
  - web fix: a `<pre>`'s `innerHTML` keeps the server's nodes when hydrating.

- 97a6789: arc's editor gains panels and shared blocks.

  - arc panels (`panelsExtension`): tabs, numbered steps, a timeline, flip cards and choices between paths, at most twelve parts, in the document preset. Enter walks from title to body to the next part, the block menu changes the layout keeping every part and adds one, and each title's placeholder names its layout. The renderer reads them through ui's `Tabs`, arc's `Timeline`, cards whose front is one button and choices that show the path taken; `PanelsView` draws an app's own parts. Markdown and HTML keep a set as `<section data-panels>`.
  - arc shared blocks (`sharedBlockExtension({ source })`): a block kept once and shown in many documents through the app's `SharedBlockSource`, with `/shared block`, Keep as a shared block in the block menu, Edit everywhere and Copy here.
  - arc extensions add `blockActions`, things a block's menu does to the block it is open on.
  - arc fix: `Prose` leaves lists carrying a `data-slot` to their component, so a `Timeline` or a set of cards inside a rendered document draws no bullet or indent.

- 95bbb85: arc gains the confirmations, dialogs and result states product screens kept building by hand.

  - arc `confirm()` asks with a `field` (a checkbox, a choice or required words, resolving `{ value }` or `null`), waits for `typeToConfirm`, draws `details`, runs `action` inside the question with its failure kept there, and with `dependents` checks what depends on the thing first, refusing with a list of blockers or naming the affected and their fallback.
  - arc `ActionMenu`: regular actions, then destructive ones after a separator, each confirmed naming what it removes.
  - arc `defineModal`, `openModal`, `preloadModal`, `closeModals` and `ModalHost`: modals opened by definition from anywhere, fetched on first use, resolving with a value, dismissed when the path changes. `ArcProvider` renders the host.
  - arc `ResponsiveOverlay` takes `param` and `clearParams`, as `Tearsheet` now does too, and a trigger opens either without touching the URL; `useOpenParam` gives any dialog a search parameter. `Tearsheet size="full"` with `actions` is a full-screen editor with its save in a bar across the top.
  - arc `useAction` and `ActionError` tie a mutation to its pending state, success toast and failure; `serverProblem`, `serverMessage`, `serverErrors`, `serverErrorKind` and `routeError` turn an API's error into a sentence, field errors, a kind and the router's not-found.
  - arc `EmptyState` takes `kind` (`filtered` with Clear filters, `restricted` naming who grants access, `done`), `placement="section"`, `headingLevel` and content between its words and actions.
  - arc `SuccessState`, `StatusPage`, `ErrorPage`, `NotFoundPage`, `PageSkeleton` and `Value`.
  - arc `Countdown`, `useClock` and `SessionExpiryWarning`; `RelativeTime` takes `exact`, a button that opens the exact moment and its zone.
  - arc `LifecycleNotice`, `RestoreButton`, `useDocumentWorkflow` and `DocumentWorkflowBar`.

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

- 220d907: arc gains the settings and form page pieces product settings kept building by hand.

  - arc `SettingRow`, `FeatureToggles` and `PlanGate`: settings that apply at once and roll back with the reason, features locked by plan that turn on and off with what they need, and a notice in place of a gated editor.
  - arc `PreferenceMatrix`: notification kinds by channel, with group rows, unavailable channels, locked kinds and per-cell choices.
  - arc `CalendarFeed`: a private feed to copy, open in a calendar app and replace.
  - arc `SettingsSection` takes `values`, `readOnly` and `list`; `SettingsLayout` asks once for all its sections and takes `narrow="row"`.
  - arc `FormDialog`, `RecordFormPage`, `FormActionBar` and `ErrorSummary`: a guarded modal form with loading and result states, and a record page with an error summary, a sticky bar and a second submit intent. `FormSheet` takes `status`, `loading` and `loadError`.
  - arc `useAutosave` and `SaveStatus`: drafts saved after a pause, one at a time, with Mod+S, offline and held states.
  - arc `ArcProvider` `clock`, `ClockPreference` and `provideReaderClock`: the reader's zone, hour cycle and week start reach every date, time and calendar. `FormattedDate` keeps a date-only day, `FormattedNumber` takes `truncate`, and `Interval` words a period.
  - arc `useThemeAccountSync`: the theme saved to and restored from the reader's account.

- 9b4fbea: arc gains the standard inputs, pickers, actions and overlays it lacked, and ui and aria the parts they needed.

  - arc inputs: `Chip`, `TagGroup`, `TagInput`, `TimeField`, `TimePicker`, `DateRangeField`, `ColorPicker`, `ColorField`, `ColorSwatches`, `ColorEditor`, `ColorArea`, `ColorSlider`, `CurrencyField`, `PercentField`, `UnitField`, `PhoneField`, `Rating`, `RangeSlider`, `RadioCards` and `CheckboxCards`. Each is a field in `form.AppField` and stands alone with `value` or `defaultValue`.
  - arc files: `FileDropZone`, `useUploadQueue`, `UploadQueue` and `FileUpload`.
  - arc actions: `IconButton`, `SplitButton`, `ActionBar` (collapsing into More by priority) and `Toolbar`.
  - arc overlays: `Tearsheet`, `ResponsiveOverlay`, `Tour`, `Coachmark`, `Spotlight`, `useTourProgress`, `InlineAlert` and `Banner`.
  - ui: `DateRangePicker` takes presets and a field's label; `Slider` names each thumb and takes track and thumb classes; `inputVariants` and `dropdownMenuVariants` export those looks; an overlay's trigger now controls an element that exists.
  - aria: classes, slots and icons for the parts of `Tag`, `NumberField`, the colour thumbs and a collapsed `ActionGroup`; `ActionGroup` collapses by `getPriority` and names its More button by `moreLabel`; slider thumbs keep their own labels; a number field is described by its description; `ColorSwatch` forwards its attributes.

- 6d04722: arc gains the keys, secrets and connections product settings kept building by hand.

  - arc `SecretField`, `StoredSecretField`, `SecretReferenceField`, `FileOrPasteField` and `CopyableField`: secrets typed, kept, referenced and pasted from a file, and values to copy.
  - arc `MaskedValue`, `OneTimeSecret`, `RedactedSecret` and `RedactedText`: secrets shown on request, shown once, and taken out of text.
  - arc `PermissionScopePicker` and `scopeSummary`, and `CredentialBindingList`: scopes to grant, and where each secret comes from.
  - arc `ApiKeyManager`, `ActiveSessionsList`, `ConnectedAppsList` and `ConnectionTestDialog`.
  - arc `ResponsiveOverlay` keeps a tall dialog inside the screen, its body scrolling, and a table row's inline action no longer also shows in its menu.
  - aria `Button` names itself with its progress bar only while one is inside it.

- 574d694: arc's code editor talks to any language server, and a new language needs no grammar.

  - arc `languageClient`, on `@codemirror/lsp-client`: a Language Server Protocol client for a project over any `Transport` (`portTransport` for a worker or a port). Editors get completion with snippets and resolved docs, hover in arc's markdown, signature help, diagnostics with related places and quick fixes, semantic tokens in the theme's colours, inlay hints, code lenses, code actions, folding, formatting, definition across files (`onNavigate`), references and rename across files. `diagnostics()`, `symbols(uri)` (`symbolNodes` for `OutlineView`), `progress()` and `status()` are reactive.
  - `@barqjs/arc/code/worker` now has `serveLanguageServer` and `typescriptServer`, which speak LSP. `codeIntelligence`, `workerIntelligence`, `serveIntelligence`, `typescriptIntelligence` and the `CodeIntelligence` types are removed.
  - arc `defineLanguage`: an editor language from keywords, operators, strings, comments and brackets, with indentation, auto-close and folds.
  - `ArcMessages.codePhrases` translates CodeMirror's words in a code editor.

- eb64d85: arc gains the lists, records and activity views apps kept drawing for themselves.

  - arc `Timeline` takes `kinds` (each kind's label, icon, tone and verb), `groupByDay`, a kind filter, key-event stars through `onKeyChange`, comment cards, an `action` per event and Show more.
  - arc `ChangeLog` and `FieldChanges`: who changed what and when, old values struck through to new in `<bdi>`, with Who and When filters; `matchesChangeLogFilter`.
  - arc `List` reorders with `onReorder`, a drag handle per row, `moveButtons` and `keyboardNavigationBehavior`; `reorderItems` applies the event.
  - arc `PropertyList`, `ChecklistEditor`, `OrderedMemberList`, `StepSequenceEditor`, `SearchResults` and `OutlineView`.
  - arc `layout.fromCqSm` and `interaction.dropLine` treatments.
  - testing `renderRoute` serves its page from `http://localhost/`, so a link's click reaches the router as in a browser, and `ariaViolations` no longer counts focusables under `hidden` as reachable.

- b37e244: arc gains the metrics, meters and chart marks products kept drawing by hand.

  - arc `Meter` and `UsageList`: a linear meter with thresholds, and usage against limits that says near, at or over the limit, or no limit, in words.
  - arc `SegmentedBar` and `TallyProgress`: a whole split into toned shares with a legend, and a batch's progress split by outcome.
  - arc `UptimeBar`, `SignalMeter`, `MetricRating` with `rateMetric`, `StagePath` and `CountUp`.
  - arc `StatCard` takes a limit `meter`, a toned description, `valueTone`, `rating`, an `aside`, a whole-card `href` or `onPress` and `loading`; `StatGroup` fills a short last row and loads every card at once.
  - arc `ComboChart` draws dashed lines, `references`, `bands`, point `statuses`, numbered `annotations`, round ticks (`niceTicks`, `useAxisFormat`) and a filtering legend (`LegendFilter`).
  - arc `ProfileCard`, `LinkPreview`, `TemplateGallery` and `SaveTemplateDialog`; the chat entry's `QuotedMessageCard` and `CustomStatusDialog`.
  - arc's style gains `control.stretched`, `interaction.hoverEdge`, `gap.line`, `layout.scrollInline`, `square.x2`, `place.media` and the primary colour roles, which `Tile`, `Status`, the choice cards and others now compose.
  - ui's chart legend draws a dashed series as a dashed stroke and wraps its entries.

- 4d3bed4: arc gains the page and record layouts product pages kept building by hand.

  - arc `PageHeader` takes a record's `media`, `mark`, `badges`, `facts` and `alerts`, and `align="start"`.
  - arc `PanelToolbar`: the heading, line and actions that open a tab panel or a section.
  - arc `RecordLayout` and `RecordSection`: a main column beside a rail of facts, and titled sections with Edit.
  - arc `RecordPager`: the previous and next record as handlers or links, its position, and K and J. `DetailSheet` takes `steps`.
  - arc `ResponsiveTabs` takes `param`, tabs that are routes with each tab's search kept, `shared`, `hidden` and `keepMounted`.
  - arc `ListDetailLayout`: a list beside the open record, resizable, one pane at a time on a phone with Back.
  - arc `MasterDetailList`: a list whose arrows open each row in a viewer beside it, with bulk checkboxes. `List` takes `selectionBehavior` and `disallowEmptySelection`.
  - arc `ConversationLayout`: a conversation's header, messages, docked composer and side panels.
  - ui `Checkbox` no longer shows its tick inside a selected row it is not itself ticked in.

- c906e09: arc gains what a browser playground for a language needs around its editor: a REPL, editor tabs and a file explorer.

  - arc `Repl`: streamed output by kind with ANSI colours, multi-line input while `isComplete` (default `bracketsBalanced`) says it is not whole, a history walked with Up and Down and kept under `storageKey`, Stop and Ctrl+C through an `AbortSignal`, and an `input` slot for an editor.
  - arc `ResponsiveTabs` closes, reorders and pins tabs (`onClose`, `onReorder`, `onPinnedChange`, `dirty`, `pinned`, `title`), with a tab menu; `EditorTabs` in `@barqjs/arc/code` is it set up for open documents.
  - arc `TreeView` renames a row in place (`onRename`, `renamingKey`, `validateLabel`) and takes an `end` per node.
  - arc `FileExplorer` over `virtualFs()`, a reactive in-memory store that serialises to a plain object.
  - arc `AnsiText` and `ansiColours`, out of `ConsoleLogView`.
  - aria forwards `draggable` as a global attribute, and a splitter built outside the document no longer measures fonts it cannot read.

- 3e86dc3: arc gains a rich text suite on `@barqjs/lexical`, in entries of its own so an app that never edits rich text loads none of it.

  - arc `@barqjs/arc/editor`: `RichTextEditor` with a toolbar that follows the selection and folds into a More menu, a floating format bar, a link popover, markdown shortcuts with import and export, code blocks highlighted by arc's lezer setup, tables with row and column controls, images uploaded through the upload queue or pasted, embeds, a character counter, autosave, read-only and RTL text.
  - arc `MentionTypeahead`, `SlashCommandMenu` and `EmojiShortcuts`: mentions from a list or a debounced search with avatars and a mention node, grouped and ranked commands, and emoji by name.
  - arc `RichTextRenderer`: stored documents and markdown drawn without an editor through Lexical's headless editor, written whole by a server.
  - arc `BlockEditor` and `defineBlock`: block handles that drag by pointer or touch, keyboard moves, a searchable insert picker, a block menu, and blocks of an app's own.
  - arc `ChatComposer`: Enter to send, an attachment tray on the upload queue, an emoji button, an edit mode and schedule-send actions; `RichCommentComposer` plugs it into comment threads through their new `composer` prop.
  - arc `@barqjs/arc/editor/collaboration`: `EditorCollaboration`, a shared Yjs document with remote cursors in arc's tones.
  - arc's style barrel gains `place.passive`, `place.padded`, `place.paddedStrip` and `interaction.draggable`, and `useUploadQueue`'s `add` answers with the items it queued.
  - lexical's typeahead and node menus take `menuLabel`, which names their listbox.

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

- a29585c: Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

  - compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
  - vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
  - ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
  - arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
  - arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.

### Patch Changes

- 0464d58: `@barqjs/arc/style` holds the treatments that sat in arc's own `lib`: `square` (a square on the spacing scale) and `plainList` (a list with no bullets, indent or margin) beside `layout`, `edge.tone` (an edge in the tone an ancestor chose), and a new `panel` family whose `body` and `footer` lay out a sheet's or a dialog's inside. Every component composes them from there.
- b6a5593: `@barqjs/arc/style` gains the treatments that sat in arc's own `lib`: a `place` family (`cover`, `middle`, `fill`, `block`, `screen`, `unpadded`, `afterLayer`), a `control` family (`bare`, a button that is only its content, and the boxed field parts `segmented`, `bareInput`, `boxedButton` and `boxedTrigger`), and `type.navLink`. Every component composes them from there.
- d2f0fad: Fixes found building arc's DataTable and form fields.

  - A sortable `Table` column sorts once per Enter or Space press, not on key-down and again on key-up.
  - `DateField` and `TimeField` take `aria-describedby`, and their first segment (every segment while invalid) is described by the field's description and error, as in React Aria.
  - `mergeProps` lists each `aria-describedby` id once, so a `Select` trigger no longer repeats its caller's description.
  - A pending `Button` withdraws its live announcement when it is disposed. `announce` returns a function that takes an announcement back.
  - A virtualised `Table` measures a focused cell by its row: Page Down moves a viewport, and the focused row stays rendered when scrolled away.
  - ui's one-component `Combobox` forwards `id`, `aria-labelledby` and `aria-describedby` to its trigger and labels its search the same way.
  - `@barqjs/testing`'s `ariaViolations` keeps the offending element behind a getter, so a failed assertion prints the violation instead of the whole document.
  - arc's date fields are named and described through aria's `DateField` rather than the surrounding `Field`.

- e82bd6c: `@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

  `@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

  `@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

  `@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.

- Updated dependencies [6e8bbc2]
- Updated dependencies [c67406a]
- Updated dependencies [47fd28a]
- Updated dependencies [4d59c06]
- Updated dependencies [989b03f]
- Updated dependencies [c001c9a]
- Updated dependencies [59a9e79]
- Updated dependencies [e0d4f09]
- Updated dependencies [9b4fbea]
- Updated dependencies [6d04722]
- Updated dependencies [b37e244]
- Updated dependencies [4d3bed4]
- Updated dependencies [c906e09]
- Updated dependencies [3e86dc3]
- Updated dependencies [0a30c0b]
- Updated dependencies [fe3ed7f]
- Updated dependencies [d2f0fad]
- Updated dependencies [19c99d0]
- Updated dependencies [0a43dbe]
- Updated dependencies [a29585c]
- Updated dependencies [0968d16]
- Updated dependencies [a9cfdab]
- Updated dependencies [ec06e14]
- Updated dependencies [4a427a9]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [dfe1e6f]
- Updated dependencies [657a57b]
- Updated dependencies [64ef645]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [e82bd6c]
  - @barqjs/ui@0.2.0-next.4
  - @barqjs/lexical@0.2.0-next.4
  - @barqjs/aria@0.2.0-next.4
  - @barqjs/primitives@0.2.0-next.4
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/db@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
  - @barqjs/form@0.2.0-next.4
  - @barqjs/router@0.2.0-next.4
  - @barqjs/lucide@0.2.0-next.4
  - @barqjs/table@0.2.0-next.4
  - @barqjs/css@0.2.0-next.4
