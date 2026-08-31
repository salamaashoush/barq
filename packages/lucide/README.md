# @barqjs/lucide

Every [lucide](https://lucide.dev) icon as a barq component. 1,790 icons and
254 of the old names they were renamed from, generated from `lucide-static` and
lowered by the barq compiler, so an icon is one cloned template rather than an
`<svg>` built element by element.

```bash
bun add @barqjs/lucide
```

```tsx
import { Check, ChevronDown } from "@barqjs/lucide";

<button type="button">
  Options <ChevronDown />
</button>;
```

One module per icon, so a bundler keeps the one you asked for. Measured by
`src/tree-shaking.test.ts`, which builds a module importing `Check` from the
barrel and fails if any other icon's path survives — the bundle is under 4 kB.

For a dev server that would rather not parse a 2,000-line barrel, every icon has
a path of its own:

```tsx
import { Check } from "@barqjs/lucide/icons/check";
```

## Props

lucide-react's, so the set is one you already know.

| prop | | |
| --- | --- | --- |
| `size` | `string \| number` | width and height. Default `24` |
| `color` | `string` | `stroke`. Default `currentColor` |
| `strokeWidth` | `string \| number` | default `2` |
| `absoluteStrokeWidth` | `boolean` | hold the stroke's thickness as the icon shrinks |
| `class` | `string` | barq spells it `class`, not `className` — both are accepted |
| `aria-label` | `string` | naming an icon makes it content rather than decoration |

```tsx
<Check size={16} color="var(--primary)" />
<Check size={12} absoluteStrokeWidth />        {/* still a 2px stroke at 12px */}
<Trash2 aria-label="Delete" />                 {/* announced */}
<Trash2 />                                     {/* aria-hidden, which is the default */}
```

**Every icon is `aria-hidden` until you name it.** A chevron beside "Options" is
decoration, and a screen reader reading it as well as the label is the bug that
default avoids. `aria-label`, `aria-labelledby` or `role` all turn it off.

## Regenerating

The icons are generated. `src/icons/*.tsx`, `src/index.ts` and `src/manifest.ts`
are all output — edit `tools/generate.ts`, never them.

```bash
bun add -d lucide-static@latest    # in this package
bun run generate
bun test
bun run build
```

`tools/generate.ts` reads two things from `lucide-static`:

- **`icon-nodes.json`**, the 1,790 canonical icons as
  `{ "check": [["path", { "d": "…" }]] }`. The same data `lucide-react` builds
  from, so the shapes are lucide's rather than a transcription of them.
- **`icons/*.svg`**, 2,048 files, because lucide keeps one per alias too. An
  alias is not a second icon — its file reduces to the same nodes as its
  target's — so those become re-exports and cost nothing. `MoreHorizontal` is
  `Ellipsis`, as it is in `lucide-react`.

`src/manifest.ts` carries `ICON_NAMES`, `ICON_ALIASES` and `LUCIDE_VERSION` for
anything that has to pick an icon by name.

## License

The package is MIT. The icon shapes are lucide's, which is
[ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE), and lucide is
itself a fork of Feather Icons.
