---
"@barqjs/compiler": patch
---

JSX stored as a value (an item's icon in an array of items, a property of an object handed to a component, a signal's value) compiles to a Block, built where it is finally inserted. It was built where it was written, outside the hydration walk of the position that inserts it, so a page such as an `ActionBar` with icons reported a `structure` mismatch and rebuilt the region.
