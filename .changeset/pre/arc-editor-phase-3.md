---
"@barqjs/arc": minor
---

arc's editor gains panels and shared blocks.

- arc panels (`panelsExtension`): tabs, numbered steps, a timeline, flip cards and choices between paths, at most twelve parts, in the document preset. Enter walks from title to body to the next part, the block menu changes the layout keeping every part and adds one, and each title's placeholder names its layout. The renderer reads them through ui's `Tabs`, arc's `Timeline`, cards whose front is one button and choices that show the path taken; `PanelsView` draws an app's own parts. Markdown and HTML keep a set as `<section data-panels>`.
- arc shared blocks (`sharedBlockExtension({ source })`): a block kept once and shown in many documents through the app's `SharedBlockSource`, with `/shared block`, Keep as a shared block in the block menu, Edit everywhere and Copy here.
- arc extensions add `blockActions`, things a block's menu does to the block it is open on.
- arc fix: `Prose` leaves lists carrying a `data-slot` to their component, so a `Timeline` or a set of cards inside a rendered document draws no bullet or indent.
