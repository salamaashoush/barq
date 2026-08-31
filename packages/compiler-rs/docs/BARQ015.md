# BARQ015 — a `css` block interpolates a value known only at run time

**Level:** note. Raise it with `checks: { BARQ015: "warning" }`.

An interpolation in a `css` block is not a literal and does not name a
module-level `const` holding one, so the block's text is not known until the
program runs. The call is left where it is and `@barqjs/css`'s runtime evaluates
it.

```tsx
import { css } from "@barqjs/css";

const panel = css`
  padding: 12px;
  background: ${theme() === "dark" ? "#1e293b" : "#f1f5f9"};   // BARQ015
`;
```

Nothing is broken: the block still applies, and the class is still the hash of
the text it produced, so a compiled block and a runtime block never disagree
about a name. What is lost is the compilation — that block's CSS is built in the
browser on every evaluation, and it is why `@barqjs/css` ships a runtime at all.

## What does fold

- **A literal.** `${8}`, `${"red"}`, and a template literal with no
  interpolations of its own.
- **A module-level `const` holding one.** `const GAP = "8px"` then `${GAP}`,
  wherever in the file the `const` is written. A number and a template with no
  substitutions of its own both count, and so does a binding naming another
  binding.
- **Another block's class.** `const button = css\`…\`` then
  `` css`.${button} & { … }` ``, because the pass records each class as it
  generates it. That one has to come first in the file: knowing a block's class
  means compiling the block, and the fold reads a table the same walk is
  filling.

## Fixing it

Move the value into a CSS custom property and set it through `style`, which is a
channel the compiler already binds per property:

```tsx
const panel = css`
  padding: 12px;
  background: var(--panel-bg);
`;

<div class={panel} style={{ "--panel-bg": theme() === "dark" ? "#1e293b" : "#f1f5f9" }} />
```

The block is then static, compiles away, and the only thing that changes at
runtime is one custom property on one element rather than a whole stylesheet.

Write the property name in kebab-case. `dom.ts` runs every style-object key
through `toKebabCase`, so `--panel-bg` arrives intact and `--panelBg` becomes
`--panel-bg` on the way.

## Selecting between two whole blocks

An interpolation that stands where a declaration would go — a ternary of two
blocks — is refused rather than left to the runtime, because a template
placeholder at statement position has no CSS grammar to sit in. Write it as two
blocks and choose the class:

```tsx
const base = css`padding: 20px;`;
const primary = css`background: #3b82f6; color: white;`;
const muted = css`background: #475569; color: #e2e8f0;`;

<div class={`${base} ${props.variant() === "primary" ? primary : muted}`} />
```
