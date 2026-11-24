---
"@barqjs/aria": patch
---

A popover, menu, select or tooltip no longer slides in from the page's top-left corner when it opens. Before its first measurement the overlay was given `top: 0; left: 0`, and a stylesheet with a transition on it (every shadcn style's `duration-100` is `transition: all 100ms`) animated from there to the real position; a reopened one slid from where the last one stood. An overlay now has no coordinates until that element has been measured, and `auto` to a length does not transition.
