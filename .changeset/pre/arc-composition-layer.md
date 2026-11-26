---
"@barqjs/arc": minor
"@barqjs/ui": minor
---

arc gains a composition layer, and nothing in it is written twice.

- `@barqjs/arc/style`: arc's treatments as foldable groups (layout, a gap scale, text roles, colour roles and tones, surfaces, focus and interaction states, motion that stops under reduced motion, touch targets) and the `space`, `radius`, `motionTokens` and `zIndex` tokens. They compose ui's groups rather than restating them.
- `Stack`, `Inline`, `Grid`, `Container` and `Center`, with responsive props on viewport or container steps.
- One customisation contract on every component: `class` on the root, typed `classes` per part, a `data-slot` on every part, styles exported as `variants({ slots })`, and `renders` where a part holds the caller's content.
- `ArcProvider` takes `density` (compact, comfortable, spacious, or `data-density` on any region), `contrast` (a high-contrast token set, always or by system preference) and `messages`, a dictionary for every word arc prints. The theme gains an emphasized easing curve.
- A duplication guard in arc's suite fails when a declaration group, or a colour, spacing or radius value, is written in two places.
- ui: `@barqjs/ui/conditions` names every breakpoint and container step once, backed by width tokens, and `useIsMobile` and arc's `DataTable` read it. Controls reach 44px under a coarse pointer (`touch`), redraw focus, edges, chosen and disabled states in system colours under forced colours (`contrast`), and pointing icons mirror under rtl through `icon.directional`.
