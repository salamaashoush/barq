---
"@barqjs/arc": minor
"@barqjs/testing": patch
---

arc gains the lists, records and activity views apps kept drawing for themselves.

- arc `Timeline` takes `kinds` (each kind's label, icon, tone and verb), `groupByDay`, a kind filter, key-event stars through `onKeyChange`, comment cards, an `action` per event and Show more.
- arc `ChangeLog` and `FieldChanges`: who changed what and when, old values struck through to new in `<bdi>`, with Who and When filters; `matchesChangeLogFilter`.
- arc `List` reorders with `onReorder`, a drag handle per row, `moveButtons` and `keyboardNavigationBehavior`; `reorderItems` applies the event.
- arc `PropertyList`, `ChecklistEditor`, `OrderedMemberList`, `StepSequenceEditor`, `SearchResults` and `OutlineView`.
- arc `layout.fromCqSm` and `interaction.dropLine` treatments.
- testing `renderRoute` serves its page from `http://localhost/`, so a link's click reaches the router as in a browser, and `ariaViolations` no longer counts focusables under `hidden` as reachable.
