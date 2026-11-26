# @barqjs/testing

## 0.2.0-next.4

### Patch Changes

- eb64d85: arc gains the lists, records and activity views apps kept drawing for themselves.

  - arc `Timeline` takes `kinds` (each kind's label, icon, tone and verb), `groupByDay`, a kind filter, key-event stars through `onKeyChange`, comment cards, an `action` per event and Show more.
  - arc `ChangeLog` and `FieldChanges`: who changed what and when, old values struck through to new in `<bdi>`, with Who and When filters; `matchesChangeLogFilter`.
  - arc `List` reorders with `onReorder`, a drag handle per row, `moveButtons` and `keyboardNavigationBehavior`; `reorderItems` applies the event.
  - arc `PropertyList`, `ChecklistEditor`, `OrderedMemberList`, `StepSequenceEditor`, `SearchResults` and `OutlineView`.
  - arc `layout.fromCqSm` and `interaction.dropLine` treatments.
  - testing `renderRoute` serves its page from `http://localhost/`, so a link's click reaches the router as in a browser, and `ariaViolations` no longer counts focusables under `hidden` as reachable.

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

- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [1fbb6e4]
- Updated dependencies [e82bd6c]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
  - @barqjs/router@0.2.0-next.4
  - @barqjs/start@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3
  - @barqjs/router@0.2.0-next.3
  - @barqjs/server@0.2.0-next.3
  - @barqjs/start@0.2.0-next.3
  - @barqjs/web@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2
  - @barqjs/router@0.2.0-next.2
  - @barqjs/server@0.2.0-next.2
  - @barqjs/start@0.2.0-next.2
  - @barqjs/web@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1
  - @barqjs/router@0.2.0-next.1
  - @barqjs/server@0.2.0-next.1
  - @barqjs/start@0.2.0-next.1
  - @barqjs/web@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
  - @barqjs/router@0.2.0-next.0
  - @barqjs/server@0.2.0-next.0
  - @barqjs/start@0.2.0-next.0
  - @barqjs/web@0.2.0-next.0
