---
"@barqjs/aria": minor
"@barqjs/ui": patch
"@barqjs/testing": patch
---

`@barqjs/aria` closes every gap its README listed against React Aria.

- New: `landmark` with F6 navigation, `ActionGroup`, `StepList` and `SearchAutocomplete`.
- `GridList`, `Tree`, `Table` and `TagGroup` announce selection changes, and a table announces its sort order.
- `ListBox`, `GridList` and `Table` load more as they scroll (`ListBoxLoadMoreItem`, `GridListLoadMoreItem`, `TableLoadMoreItem`, `loadMoreSentinel` from `@barqjs/aria/load-more`).
- Table columns resize inside a `ResizableTableContainer`, through a `ColumnResizer`.
- `CalendarMonthPicker` and `CalendarYearPicker`; ui's calendar builds its caption dropdowns on them.
- `@barqjs/aria/date` is now `@internationalized/date`: every calendar system, `ZonedDateTime`, era and time-zone segments in the date fields, and a date picker that holds its day until the time is set. `getDayOfWeek`, `startOfWeek`, `endOfWeek` and `getWeeksInMonth` take a locale, `today` and `isToday` take a time zone, and `firstDayOfWeek` is a day name.
- Colours in OKLCH, OKLab, Lab, LCH and HWB, with CSS Color 4 gamut mapping. `ColorField` edits one channel when given `channel`, and the area, sliders and wheel draw their own backgrounds.

`@barqjs/testing`'s ARIA checker follows ARIA 1.2 and no longer requires `aria-selected` on an option.
