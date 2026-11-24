---
"@barqjs/aria": patch
"@barqjs/ui": patch
"@barqjs/testing": patch
"@barqjs/arc": patch
---

Fixes found building arc's DataTable and form fields.

- A sortable `Table` column sorts once per Enter or Space press, not on key-down and again on key-up.
- `DateField` and `TimeField` take `aria-describedby`, and their first segment (every segment while invalid) is described by the field's description and error, as in React Aria.
- `mergeProps` lists each `aria-describedby` id once, so a `Select` trigger no longer repeats its caller's description.
- A pending `Button` withdraws its live announcement when it is disposed. `announce` returns a function that takes an announcement back.
- A virtualised `Table` measures a focused cell by its row: Page Down moves a viewport, and the focused row stays rendered when scrolled away.
- ui's one-component `Combobox` forwards `id`, `aria-labelledby` and `aria-describedby` to its trigger and labels its search the same way.
- `@barqjs/testing`'s `ariaViolations` keeps the offending element behind a getter, so a failed assertion prints the violation instead of the whole document.
- arc's date fields are named and described through aria's `DateField` rather than the surrounding `Field`.
