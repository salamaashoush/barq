---
"@barqjs/aria": patch
"@barqjs/compiler": patch
"@barqjs/web": patch
---

Date segments carry their field's name and description, and a spread on a `<select>` selects its option on the first render.

- Each date segment is named by its part and then by its field's label, as in React Aria: "day, Departure". A field's `aria-label` and `aria-labelledby` reach every segment.
- `DatePicker` and `DateRangePicker` pass their label, description and error to the segments of the fields inside them, through the new `PickerFieldContext`, without naming or describing the inner field's group. `DatePicker` takes `aria-describedby`.
- A `value` or `selectedIndex` that reaches a `<select>` through a spread is written after its options, so `select.value` is right as soon as it renders. Everything else in the spread, `multiple` included, is still written before the options. The same holds for a `<select>` built by `element()`.
