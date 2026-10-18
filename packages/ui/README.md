# @barqjs/ui

Styled, accessible components for barq, with twenty-four colour themes and
styles compiled to a stylesheet at build time. Import them from the package, or
copy their source into your project with [`barq-ui add`](../ui-cli#readme).
Behaviour comes from [`@barqjs/aria`](../aria#readme), styling from
[`@barqjs/css`](../css#readme), and icons from
[`@barqjs/lucide`](../lucide#readme). The designs and themes are shadcn/ui's,
with none of React, Radix or Tailwind underneath.

## Install

```bash
bun add @barqjs/ui @barqjs/aria @barqjs/core @barqjs/css @barqjs/lucide @barqjs/primitives @barqjs/server @barqjs/web
bun add -d @barqjs/vite
```

Like every barq component library, the package ships its TypeScript source
under the `barq` export condition, and `@barqjs/vite` compiles it in your build.

## Example

```tsx
import { Button, Card, CardContent, CardHeader, CardTitle } from "@barqjs/ui";
import { installTheme } from "@barqjs/ui/theme";

installTheme({ base: "neutral", accent: "blue" });

<Card>
  <CardHeader>
    <CardTitle>Invoices</CardTitle>
  </CardHeader>
  <CardContent>
    <Button onPress={() => send()}>Send</Button>
  </CardContent>
</Card>;
```

Importing `@barqjs/ui/theme` declares the layer order and the scale every
component reads; `installTheme` puts one colour theme on the page.

Or copy the components into your own repository, which is what shadcn is for,
with [`@barqjs/ui-cli`](../ui-cli#readme):

```bash
bunx @barqjs/ui-cli init
bunx @barqjs/ui-cli add button card
```

Both halves are the same files. `registry/button.json` holds
`src/ui/button.tsx` verbatim, so the suite that tests the library is testing
what `add` writes.

## The look is transcribed, not guessed

shadcn describes a component's appearance as a Tailwind class list, and that is
the only description upstream publishes. Rewriting one by hand is a guess per
utility, so `tools/css.ts` runs Tailwind v4 over the real class list with
shadcn's own theme and rewrites each rule it gets back with `&` where the
utility class was:

```
.hover\:bg-accent:hover { background-color: var(--accent) }
->  &:hover { background-color: var(--accent) }
```

Variants, at-rules, `:has()`, arbitrary selectors and the colour-mix fallbacks
all survive that, because none of them is in the part being replaced. What the
package ships is the result, as one class per DECLARATION:

```tsx
import { layer, variants } from "@barqjs/css";

const ui = layer("barq.ui");

export const buttonVariants = variants({
  base: ui(text.sm, text.medium, box.transition, ring.focus, {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "var(--radius)",
  }),
  // …
});
```

An atom is one declaration, so every component that draws a 2px radius shares
one class rather than writing its own: 1,948 declarations across the package
collapse to 433. The compiler folds the literal, so what ships is a class
string and a stylesheet, with nothing computed at run time.

`layer("barq.ui")` is what puts them in the layer, and the layer is what makes
them lose to you: an unlayered atom is built to WIN, which is right for an
application styling itself and wrong for a library. It is bound once a module
rather than named at every call, because the compiler reads the layer as a
literal in the module that names it.

`text.sm`, `box.shadow` and `ring.focus` are shared TREATMENTS, in
`src/lib/shared-*.ts`. The sheet deduplicated a declaration however many
components wrote it; those files stop the SOURCE repeating it, and being
separate files is what keeps a component from shipping rules it never
composed.

`tailwindcss` is a devDependency of this package for that tool and nothing else.
Nothing it produces is imported at run time, the output is committed, and it
runs again only when the look is re-synced from upstream.

## Your CSS always wins

Every rule this package writes is inside `@layer barq.ui`. Nothing an
application writes has to be, and an unlayered rule beats a layered one whatever
the specificity. So this works with no `!important` and no reasoning about
which module the bundler emitted first:

```tsx
import { atoms } from "@barqjs/css";

<Button class={atoms({ width: "100%" })}>Save</Button>;
```

The same declaration a component here already uses lands on the same class,
which is what makes an application's own components cost nothing extra.

The layers are declared once, in order:

```css
@layer barq.reset, barq.base, barq.theme, barq.ui, barq.style;
```

**The one trap.** An application whose own reset is unlayered beats these
components, because that is what an unlayered rule does. Put your reset in a
layer, or import ours (`@barqjs/ui/theme/reset`), which is Tailwind's preflight
and is what shadcn's components are written against.

## Styles

shadcn's eight (`vega`, `nova`, `maia`, `lyra`, `mira`, `luma`, `rhea`,
`sera`), and a style is a different question from a theme. A theme is
colour; a style is shape, weight and spacing, so `nova` and `lyra` are two
opinions about what a button IS.

```bash
bunx @barqjs/ui-cli init --style lyra
```

That copies ONE of them into your project, because that is what you pay for.
Each is around 240 KB of ordinary CSS, scoped by its own class:

```html
<html class="style-lyra">
```

**Your components need no change, and that is the whole trick.** Upstream writes
a style against semantic classes it puts on every element (`.cn-button`); this
package has put a `data-slot` on every element since before styles existed, and
they name the same thing. So `tools/styles.ts` rewrites `.cn-button` as
`[data-slot="button"]` and the eight stylesheets simply apply.

They land in `@layer barq.style`, which is declared after `barq.ui`, so a style
beats a component's own rules without either side counting specificity.

Every class that names an element the pinned registry renders reaches one here.
`bun run styles` prints what is left in lists rather than one number: the
classes that name a component shadcn keeps outside `registry/new-york-v4/ui`,
and the handful this package diverges from on purpose with the reason for
each.

## Themes

All twenty-four of shadcn's, as data. Seven **bases** declare the whole token
set (`neutral`, `stone`, `zinc`, `mauve`, `olive`, `mist`, `taupe`), and
seventeen **accents** layer `primary`, the chart ramp and the sidebar's accent
over one of them: `amber`, `blue`, `cyan`, `emerald`, `fuchsia`, `green`,
`indigo`, `lime`, `orange`, `pink`, `purple`, `red`, `rose`, `sky`, `teal`,
`violet`, `yellow`.

```ts
import { installTheme, THEMES } from "@barqjs/ui/theme";

installTheme({ base: "stone", accent: "emerald", radius: "0.5rem" });
installTheme({ base: "zinc", scope: ".promo" }); // a subtree, in its own theme
installTheme({ base: "neutral", dark: "media" }); // follow the operating system
```

The token names are shadcn's own (`--background`, `--primary`, `--radius`)
rather than a hashed group from `defineVars`, and that is deliberate: a theme
copied out of tweakcn, or a `:root { --primary: … }` an application already has,
lands on these components without being rewritten.

An application that picks its theme once should not carry the other
twenty-three, so `barq-ui init` writes the chosen one into a `globalCss` block
the compiler folds into a stylesheet at build time. `installTheme` is for the
application that switches theme while it is running. It also takes `chart` (a
chart ramp from another theme) and `fonts` (`sans`, `mono`, `heading`).

## What is different from shadcn

Four things, and each is a consequence of what is underneath rather than a
preference.

**A collection can be data.** `<Tabs>`, `<DropdownMenuContent>`, `<Select>`,
`<Combobox>` and `<Command>` take shadcn's written-out parts, and they also take
`items` plus a render function, which needs no first pass over the children to
discover them:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger>
    <Button variant="outline">Actions</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent items={actions} aria-label="Actions" onAction={run}>
    {(action) => <DropdownMenuItem>{action.name}</DropdownMenuItem>}
  </DropdownMenuContent>
</DropdownMenu>
```

An item with `children` is a **section**, which is the one thing to know before
nesting anything.

**`asChild` is not a general prop.** Radix clones a child element to attach its
props; barq has no element to clone at that point. `CollapsibleTrigger` is the
one part that takes it. A component that has to be another
element takes the prop that makes it one (`<Item href="/reports">` renders an
anchor), and everything else exports the classes:

```tsx
<a href="/pricing" class={buttonVariants({ variant: "outline" })}>
  Pricing
</a>
```

And where a wrapper has to reach the control inside it (a dialog's trigger, a
tooltip's), the props travel through a slot, so they land on the button rather
than on a wrapper that focus never reaches.

**A trigger renders no element.** `<DialogTrigger>` and `<PopoverTrigger>` are
not `<div>`s. They hand `aria-expanded`, `aria-haspopup` and the press handling
to whatever control is inside them. `<ContextMenuTrigger>` does render one, and
it has to: a context menu belongs to an area rather than to a control, so there
is nothing else for the pointer to land on. `<CollapsibleTrigger>` renders a
button of its own unless given `asChild`.

**An animation decides its own length.** shadcn tells Radix how long an overlay
takes to leave; here nobody is told. `presence` reads the duration back off the
element once `data-closed` is on it, so the exit lasts exactly as long as the
stylesheet says and nothing at all under `prefers-reduced-motion`. Change the
CSS and the timing follows. Both directions are shadcn's animations.

## Every component's state is an attribute

`data-selected`, `data-disabled`, `data-focus-visible`, `data-expanded`,
`data-open`, `data-placement`, `data-orientation`: written by `@barqjs/aria`
as their PRESENCE, so the selector is `[data-selected]` and never
`[data-selected="true"]`. Every element also carries a `data-slot`, which is
what a stylesheet of your own selects:

```css
[data-slot="card-title"] {
  font-family: var(--font-heading);
}
```

## What is here

- Layout: `Card`, `AspectRatio`, `Separator`, `ScrollArea`, `Table`, `Empty`,
  `Item`, `Resizable`.
- Forms: `Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `RadioGroup`,
  `Switch`, `Slider`, `Select`, `NativeSelect`, `Combobox`, `Toggle`,
  `ToggleGroup`, `Progress`, `Field`, `InputGroup`, `ButtonGroup`, `InputOTP`,
  `Questionnaire`.
- Overlays: `Dialog`, `AlertDialog`, `Sheet`, `Drawer`, `Popover`, `HoverCard`,
  `Tooltip`, `DropdownMenu`, `ContextMenu`, `Command`.
- Dates: `Calendar`, `RangeCalendar`, `DatePicker`, `DateRangePicker`.
- Disclosure: `Accordion`, `Collapsible`, `Tabs`.
- Navigation: `Breadcrumb`, `Pagination`, `Menubar`, `Sidebar`,
  `NavigationMenu`.
- Display: `Alert`, `Avatar`, `AvatarGroup`, `Badge`, `Kbd`, `Skeleton`,
  `Spinner`, `Chart`, `Carousel`.
- Feedback: `Toaster` (shadcn's Sonner) and `Toast`.
- Chat: `Message`, `Bubble`, `Marker`, `Attachment`, `MessageScroller`.
- `DirectionProvider`, for right-to-left.

Each one is also its own entry point: `@barqjs/ui/button`, `@barqjs/ui/dialog`.

`DatePicker` is a composition rather than a transcription, because upstream
ships no `date-picker.tsx`: shadcn documents a `<Popover>` around a `<Calendar>`
and that is what this is.

Two components have a dependency outside this family. `Carousel` uses
`embla-carousel`, the framework-agnostic core rather than the React wrapper
shadcn uses, and `Chart` draws with `@tanstack/charts` where shadcn uses
Recharts. `barq-ui add` names either as a package to install.

## Icons

[`@barqjs/lucide`](../lucide#readme), which is every lucide icon as a barq
component. The components here import the couple of dozen they draw with; the
rest is yours.

```tsx
import { Check, ChevronDown } from "@barqjs/lucide";
```

## The docs site

[`packages/site`](../site) is this package's documentation: a page per
component with every one of its examples, the blocks, the charts and the theme
designer. Run it with `bun run dev` in that directory. Its suite renders every
example. What it is for beyond that is the one question a headless DOM cannot
answer: whether the rules a class produced add up to shadcn's look.

## Regenerating

Everything generated comes from a pinned shadcn/ui checkout, and the website is
not the reference: it serves a newer registry whose look is in a stylesheet
rather than in class lists, which `tools/css.ts` cannot transcribe.

```bash
git clone --depth 1 https://github.com/shadcn-ui/ui ~/src/shadcn-ui

bun run tools/themes.ts ~/src/shadcn-ui   # src/theme/themes.ts
bun run tools/base.ts ~/src/shadcn-ui     # src/theme/base.ts, reset.ts
bun run styles ~/src/shadcn-ui            # styles/*.css, the eight
bun run tools/transcribe.ts --spec specs/button.json
bun run exports                                 # src/index.ts and the exports map
bun run registry                                # registry/
```

`transcribe` prints the CSS for a class list; `specs/*.json` are the class lists
copied out of shadcn's components, which is the provenance for every rule here.
Never edit a generated file: `tools/exports.ts` was stale once and rewrote
`package.json` to point at a `dist` that does not exist, and the fix is always
the generator.

**[`PORTING.md`](PORTING.md) is the procedure**: adding or updating a
component end to end, what to check at each step, and the traps that cost a
session each.

## Checking it still matches

```bash
bun run verify
```

Every class list in `specs/` is translated again and each declaration it
produces is looked for in the class the components actually ship. A rule that
was never pasted, one lost to an edit and one whose value drifted are the same
thing from outside (part of the look is missing), and no test that asserts on
the rules it knows about will say so. 4,737 declarations at the time of writing, and the divergences are a named
list in `tools/verify.ts` with the reason for each.

That checks TEXT. `tools/geometry.ts` checks what a browser computes: it puts a
probe carrying upstream's own utility classes beside each element this package
rendered and reports every property that differs. It found a rule landing on the
wrong element, which `verify` called a success.

## License

MIT. The design is [shadcn/ui](https://ui.shadcn.com)'s, which is MIT; the icon
shapes are [lucide](https://lucide.dev)'s, which is ISC.
