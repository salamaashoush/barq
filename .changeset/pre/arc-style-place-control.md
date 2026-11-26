---
"@barqjs/arc": patch
---

`@barqjs/arc/style` gains the treatments that sat in arc's own `lib`: a `place` family (`cover`, `middle`, `fill`, `block`, `screen`, `unpadded`, `afterLayer`), a `control` family (`bare`, a button that is only its content, and the boxed field parts `segmented`, `bareInput`, `boxedButton` and `boxedTrigger`), and `type.navLink`. Every component composes them from there.
