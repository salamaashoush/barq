---
"@barqjs/compiler": minor
"@barqjs/vite": patch
"@barqjs/cli": patch
"@barqjs/ui": minor
"@barqjs/arc": minor
---

Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

- compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
- vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
- ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
- arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
- arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.
