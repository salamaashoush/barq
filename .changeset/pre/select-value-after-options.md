---
"@barqjs/compiler": patch
"@barqjs/web": patch
"@barqjs/server": patch
---

A `<select>`'s `value` is written after its options again when another attribute on it is also bound. `selectedIndex` is now a property: written after the options, kept against the user's choice like `value`, and absent from server markup.
