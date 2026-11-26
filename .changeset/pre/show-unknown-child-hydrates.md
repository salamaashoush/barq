---
"@barqjs/compiler": patch
"@barqjs/core": patch
---

A `<Show>` or `<Match>` whose only child is a value the compiler cannot see the kind of, such as `{item.label}` inside a render callback, is compiled to a region like any other and hydrates the server's markup. It was left to the component, which carries no hydration flags, so the browser reported it `not-hydratable` and built it again. The arm still decides the child by Solid 2.0's rule, through `callSlot`, now exported from `@barqjs/core`.
