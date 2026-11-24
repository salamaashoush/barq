---
"@barqjs/aria": patch
"@barqjs/ui": patch
---

An open modal (a dialog, alert dialog, sheet or drawer) makes the page outside it `inert` rather than only `aria-hidden`, as React Aria's `useModalOverlay` does, so a control behind it is out of the Tab order as well as hidden from a screen reader. A tooltip on a control inside a modal stays hoverable.
