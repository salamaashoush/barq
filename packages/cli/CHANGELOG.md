# @barqjs/cli

## 0.2.0-next.4

### Patch Changes

- a29585c: Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

  - compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
  - vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
  - ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
  - arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
  - arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.

- Updated dependencies [048ed75]
- Updated dependencies [bb3630d]
- Updated dependencies [a29585c]
- Updated dependencies [0968d16]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [644ccc8]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
  - @barqjs/compiler@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- @barqjs/compiler@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- @barqjs/compiler@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- @barqjs/compiler@0.2.0-next.1
