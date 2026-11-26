# @barqjs/ui

## 0.2.0-next.4

### Minor Changes

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

- a29585c: Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

  - compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
  - vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
  - ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
  - arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
  - arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.

### Patch Changes

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

- d2f0fad: Fixes found building arc's DataTable and form fields.

  - A sortable `Table` column sorts once per Enter or Space press, not on key-down and again on key-up.
  - `DateField` and `TimeField` take `aria-describedby`, and their first segment (every segment while invalid) is described by the field's description and error, as in React Aria.
  - `mergeProps` lists each `aria-describedby` id once, so a `Select` trigger no longer repeats its caller's description.
  - A pending `Button` withdraws its live announcement when it is disposed. `announce` returns a function that takes an announcement back.
  - A virtualised `Table` measures a focused cell by its row: Page Down moves a viewport, and the focused row stays rendered when scrolled away.
  - ui's one-component `Combobox` forwards `id`, `aria-labelledby` and `aria-describedby` to its trigger and labels its search the same way.
  - `@barqjs/testing`'s `ariaViolations` keeps the offending element behind a getter, so a failed assertion prints the violation instead of the whole document.
  - arc's date fields are named and described through aria's `DateField` rather than the surrounding `Field`.

- 19c99d0: `@barqjs/aria` closes every gap its README listed against React Aria.

  - New: `landmark` with F6 navigation, `ActionGroup`, `StepList` and `SearchAutocomplete`.
  - `GridList`, `Tree`, `Table` and `TagGroup` announce selection changes, and a table announces its sort order.
  - `ListBox`, `GridList` and `Table` load more as they scroll (`ListBoxLoadMoreItem`, `GridListLoadMoreItem`, `TableLoadMoreItem`, `loadMoreSentinel` from `@barqjs/aria/load-more`).
  - Table columns resize inside a `ResizableTableContainer`, through a `ColumnResizer`.
  - `CalendarMonthPicker` and `CalendarYearPicker`; ui's calendar builds its caption dropdowns on them.
  - `@barqjs/aria/date` is now `@internationalized/date`: every calendar system, `ZonedDateTime`, era and time-zone segments in the date fields, and a date picker that holds its day until the time is set. `getDayOfWeek`, `startOfWeek`, `endOfWeek` and `getWeeksInMonth` take a locale, `today` and `isToday` take a time zone, and `firstDayOfWeek` is a day name.
  - Colours in OKLCH, OKLab, Lab, LCH and HWB, with CSS Color 4 gamut mapping. `ColorField` edits one channel when given `channel`, and the area, sliders and wheel draw their own backgrounds.

  `@barqjs/testing`'s ARIA checker follows ARIA 1.2 and no longer requires `aria-selected` on an option.

- 657a57b: An open modal (a dialog, alert dialog, sheet or drawer) makes the page outside it `inert` rather than only `aria-hidden`, as React Aria's `useModalOverlay` does, so a control behind it is out of the Tab order as well as hidden from a screen reader. A tooltip on a control inside a modal stays hoverable.
- e82bd6c: `@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

  `@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

  `@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

  `@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.

- Updated dependencies [c67406a]
- Updated dependencies [47fd28a]
- Updated dependencies [4d59c06]
- Updated dependencies [c001c9a]
- Updated dependencies [59a9e79]
- Updated dependencies [e0d4f09]
- Updated dependencies [9b4fbea]
- Updated dependencies [6d04722]
- Updated dependencies [c906e09]
- Updated dependencies [0a30c0b]
- Updated dependencies [fe3ed7f]
- Updated dependencies [d2f0fad]
- Updated dependencies [19c99d0]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [657a57b]
- Updated dependencies [64ef645]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [e82bd6c]
  - @barqjs/aria@0.2.0-next.4
  - @barqjs/primitives@0.2.0-next.4
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
  - @barqjs/lucide@0.2.0-next.4
  - @barqjs/css@0.2.0-next.4
