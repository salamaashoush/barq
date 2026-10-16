# @barqjs/lucide

Every [lucide](https://lucide.dev) icon as a barq component: 1,890 icons and
260 of the old names they were renamed from, generated from `lucide-static`
1.57.0. Each is lowered by the barq compiler, so an icon is one cloned template
rather than an `<svg>` built element by element. The props are `lucide-react`'s.

## Install

```bash
bun add @barqjs/lucide @barqjs/core @barqjs/server
bun add -d @barqjs/vite
```

The package ships its TypeScript source under the `barq` export condition.
`@barqjs/vite` resolves that condition and compiles the icons in your build,
for the DOM or the server, like your own components.

## Example

```tsx
import { ChevronDown } from "@barqjs/lucide";

<button type="button">
  Options <ChevronDown />
</button>;
```

One module per icon, so a bundler keeps the one you asked for.
`src/tree-shaking.test.ts` builds a module importing `Check` from the barrel and
fails if any other icon's path survives, or if the bundle reaches 4 kB.

For a dev server that would rather not parse a 2,000-line barrel, every icon has
a path of its own:

```tsx
import { Check } from "@barqjs/lucide/icons/check";
```

## Props

The same set as `lucide-react`:

- `size` (`string | number`): width and height. Default `24`.
- `color` (`string`): the `stroke`. Default `currentColor`.
- `strokeWidth` (`string | number`): default `2`.
- `absoluteStrokeWidth` (`boolean`): hold the stroke's thickness as the icon
  shrinks.
- `class` (`string`): barq spells it `class`; `className` is accepted too.
- `aria-label` and `aria-labelledby` (`string`): naming an icon makes it
  content rather than decoration.
- `aria-hidden`, `role`, `id` and `data-slot` are passed through.

```tsx
<Check size={16} color="var(--primary)" />
<Check size={12} absoluteStrokeWidth />        {/* still a 2px stroke at 12px */}
<Trash aria-label="Delete" />                  {/* announced */}
<Trash />                                      {/* aria-hidden, which is the default */}
```

**Every icon is `aria-hidden` until you name it.** A chevron beside "Options" is
decoration, and a screen reader reading it as well as the label is the bug that
default avoids. `aria-label` or `aria-labelledby` turns it off, and so does an
explicit `aria-hidden={false}`.

`@barqjs/lucide/icon` exports `iconProps` and `IconProps`, the props every
generated icon is built from, for an icon of your own drawn the same way.

## Regenerating

The icons are generated. `src/icons/*.tsx`, `src/index.ts` and
`src/manifest.ts` are all output: edit `tools/generate.ts`, never them.

```bash
bun add -d lucide-static@latest    # in this package
bun run generate
bun test
```

`tools/generate.ts` reads two things from `lucide-static`:

- **`icon-nodes.json`**, the canonical icons as
  `{ "check": [["path", { "d": "…" }]] }`. The same data `lucide-react` builds
  from, so the shapes are lucide's rather than a transcription of them.
- **`icons/*.svg`**, because lucide keeps one file per alias too. An alias is
  not a second icon (its file reduces to the same nodes as its target's), so
  those become re-exports and cost nothing. `MoreHorizontal` is `Ellipsis`, as
  it is in `lucide-react`.

`src/manifest.ts` carries `ICON_NAMES`, `ICON_ALIASES` and `LUCIDE_VERSION`.
It is not an entry point; the suite reads it to check the generated set.

## License

The package is MIT. The icon shapes are lucide's, which is
[ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE), and lucide is
itself a fork of Feather Icons.
