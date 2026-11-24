# @barqjs/arc

barq's design system: a theme with the tokens products add to shadcn's, and the
patterns every product rebuilds, on [`@barqjs/ui`](../ui#readme)'s accessible
components. An app imports it; a fix to a base component lands in `@barqjs/ui`
once and reaches arc and every copy `barq-ui` makes.

## Install

```bash
bun add @barqjs/arc @barqjs/ui @barqjs/aria @barqjs/core @barqjs/css @barqjs/web @barqjs/router
```

Like every barq component package it ships source, and the app's build compiles
it: `@barqjs/vite` finds it through the `barq` export condition.

## The theme

```ts
import { installArcTheme } from "@barqjs/arc/theme";

installArcTheme({
  base: "neutral",
  accent: "blue",
  tokens: {
    light: { brand: "oklch(0.55 0.15 40)", "brand-ink": "white" },
    dark: { brand: "oklch(0.75 0.12 40)" },
  },
});
```

Everything `@barqjs/ui`'s themes declare, plus what products keep adding on
top:

- five tones, `success`, `warning`, `danger`, `info` and `neutral`, each as the
  tone, a `-foreground` for text and a `-subtle` fill;
- `sunken`, `link`, `faint-foreground`, `border-strong`, `selection`,
  `overlay` and two shadow colours;
- code colours (`code-keyword`, `code-string`, ...);
- motion (`duration-fast`, `duration-base`, `duration-slow`, `ease-standard`)
  and stacking (`z-sticky`, `z-header`, `z-popover`, `z-overlay`, `z-toast`).

`tokens` overrides any of them, light and dark, and adds a brand under names of
its own. The rules sit in `@layer barq.theme`, and arc's components in
`barq.arc`, after `@barqjs/ui`'s, so an app's own unlayered CSS beats both.

The motion tokens carry two curves: `ease-standard` for something that moves
within the page, and `ease-emphasized`, which decelerates into place, for
something that arrives.

### Density

```ts
installArcTheme({ base: "neutral", density: "compact" });
```

```html
<section data-density="compact">…</section>
```

A density is `compact`, `comfortable` (the default) or `spacious`, and it is
one token: `--spacing`. Every control height, padding and gap in ui and arc is
a multiple of it (a button is `9` steps tall, a cell is padded `3`), so all of
them tighten together and no component branches on the density in JavaScript.
`density` sets the scope's own; `data-density` on any element sets a region's,
so one table can be compact on a comfortable page. A touch target is the
exception by design: it stays 44px under a coarse pointer at every density.

### High contrast

`contrast: "high"` swaps in a token set that pulls every edge and every quiet
text colour toward the foreground, light and dark; `contrast: "system"` does
it only while the reader's system asks for more contrast. Under a
forced-colours mode ui's controls draw their focus, edges, chosen and disabled
states in the system's colours whatever the theme, through `@barqjs/ui`'s
`contrast` group.

## The provider

```tsx
import { ArcProvider } from "@barqjs/arc";

<ArcProvider theme={{ base: "neutral", accent: "blue" }} locale="ar">
  <App />
</ArcProvider>;
```

It installs the theme, sets up `colorScheme` (light, dark and system, right on
the first paint), provides the locale the components lay out by, and renders
the toast stack and the host `confirm()` draws in. Every base component of
`@barqjs/ui` is exported from here too, so an app imports from one place.

`density` and `contrast` go into the theme it installs (density alone is
installed even with no `theme`), and `confirm` takes the `classes` of the
dialog `confirm()` draws.

### arc's words

```tsx
<ArcProvider locale="de" messages={{ copy: "Kopieren", copied: "Kopiert" }}>
```

Every word an arc component prints when the caller gave it none (a copy
button's "Copied", a trail's "Show the full path", a table's "Page 2 of 5")
comes from one dictionary, `ArcMessages`. `ENGLISH` is the default, and
`messages` lays an app's translation over it for everything below the
provider, read again when it changes. A component's own prop, such as
`<CopyButton copiedLabel>`, still wins for that one instance.

## Composing a look: `@barqjs/arc/style`

```tsx
import { bg, edge, gap, layout, rounded, space, surface, type } from "@barqjs/arc/style";
import { on } from "@barqjs/ui/conditions";
import { layer } from "@barqjs/css";

const app = layer("app");

const banner = app(layout.row, layout.wrap, gap[3], surface.card, {
  padding: { default: space.x3, [on.md]: space.x6 },
});
```

The treatments every arc component is built from, and what an app builds a
one-off pattern from, so the pattern a single product needs still looks like
arc. Each is a class string the compiler folds, through the import, at build
time: composing one costs what writing its declarations would, and the
declaration lands on the class arc's own components already use.

- `layout`: `row`, `inlineRow`, `column`, `centre`, `between`, `end`, `wrap`,
  `grow`, `growAuto`, `noShrink`, `pushEnd`, `minZero`, `minZeroBlock`,
  `fill`, `clip`, `nowrap`, `clamp2`, `clamp3`, `flush` (no margin),
  `container` (a query container), `relative`, `sticky`, `centred`; and
  `truncate`, one line with an ellipsis.
- `gap[0]` to `gap[12]`, and `space.x0` to `space.x16` for any other length
  on the same scale.
- `type`: `title`, `heading`, `subheading`, `body`, `label`, `meta`,
  `caption`, `stat`, `numeric`, `mono`, `sans`, and the sizes and weights on
  their own. They start from ui's `text.sm`, `text.medium` and
  `text.heading`, so a label is one class in ui and in arc.
- Colour by role: `fg` (`default`, `muted`, `faint`, `link`, `danger`,
  `tone`, ...), `bg` (`page`, `card`, `popover`, `sunken`, `muted`, `tone`,
  ...), and `tone.success` to `tone.neutral`, which set the three custom
  properties `fg.tone`, `fg.toneBase` and `bg.tone` read below them.
- Surfaces: `surface.card`, `sunken`, `bordered`, `elevated` and `overlay`,
  built from `edge` (`all`, `frame`, `input`, `top`, `bottom`, `start`),
  `rounded` (`xs` to `xl`, `full`) and `elevation.raised`.
- State: `focus.visible` and `focus.slot` are ui's rings, `focus.inset` the
  same ring inside a cell, `focus.within` for a box made of parts, and
  `focus.outline` for a scrolling region; `interaction` covers hover, focus
  within, selected, invalid and a pressable cursor.
- `motion.colours`, `motion.transform` and `motion.enter`, whose duration goes
  to nothing under reduced motion so a state still lands.
- `target.size`: 24px under a fine pointer and 44px under a coarse one, for a
  part that is not one of ui's controls (those grow by themselves).
- Tokens: `space`, `radius`, `motionTokens` and `zIndex`, as values.

It is one module on purpose. The compiler folds a group through an import by
reading the module that declares it, and a re-export is not a declaration, so
`@barqjs/arc/style` re-exports nothing: ui's groups (`text`, `box`, `ring`,
`ringSlot`, `icon`, `when`, `touch`, `contrast`) and the conditions are
imported from ui's own modules, `@barqjs/ui/shared-text` and the rest.

### One set of conditions

Every breakpoint and container step in ui and arc is a key of `on`, from
`@barqjs/ui/conditions`: `on.sm` to `on["2xl"]` from a width up, `on.cqSm` to
`on.cqXl` for the nearest query container, ranges such as `on.mdOnly` for a
value per step, and `coarse`, `fine`, `hover`, `reducedMotion`,
`moreContrast`, `forcedColors`, `print`, `dark` and `rtl`. The widths are the
`breakpoints` and `containers` tokens, and `breakpointQuery("md")` is the same
width as a media query for `mediaQuery` in JavaScript, which is what
`DataTable`'s `hideBelow` and ui's `useIsMobile` read.

## Layout

```tsx
import { Container, Grid, Inline, Stack } from "@barqjs/arc";

<Container size="lg">
  <Stack gap={{ base: 4, md: 6 }}>
    <PageHeader heading="Invoices" />
    <Inline justify="between" stackBelow="md">
      <DataToolbar … />
    </Inline>
    <Grid columns={{ base: 1, cqMd: 2, cqLg: 4 }}>{stats}</Grid>
  </Stack>
</Container>;
```

Five components built from those treatments alone, so a page is laid out
once rather than in each app's own flex rules.

- `Stack`: children one under the other, `gap` apart, with `align` and
  `justify`.
- `Inline`: children side by side, wrapping; `stackBelow` stacks them under a
  step.
- `Grid`: equal `columns` per step, or as many as fit with `minItemWidth`.
- `Container`: the page's column, no wider than a viewport step's width, with
  room at its sides, and a query container for what is inside.
- `Center`: centred both ways.

A responsive prop is a value or a value per step, mobile first:
`{ base: 2, md: 4 }` from the viewport, or `{ base: 1, cqMd: 3 }` from the
nearest query container, one scale per prop. It is written as ranges that
never overlap, through a dynamic group, so the stylesheet is the same whatever
the values and two steps never tie on the cascade's hash order. `render` puts
another element in the component's place: `render={(part, children) => <ul
{...part.props} ref={part.ref}>{children}</ul>}`.

## Customising a component

Every arc component takes the same five things.

- `class` (and `className`) on its root, merged after the component's own
  classes, so an atom of the caller's replaces arc's for that property.
- `classes`, a class per part, typed by the component's slots:
  `<PageHeader classes={{ title: atoms({ fontSize: "var(--text-xl)" }) }} />`.
- A `data-slot` on every part (`page-header-title`, `data-table-row`), which
  is what a stylesheet of the app's own selects.
- The styles, exported as a `variants({ slots })` function
  (`pageHeaderStyles`, `dataTableStyles`, `statusVariants`, ...), for an app
  that draws the look itself: `const { root, dot } = statusVariants({ tone:
  "danger" })`.
- `renders`, where a part is an element arc draws around content the caller
  gave it: `<PageHeader renders={{ title: (part, heading) => <h2
  {...part.props}>{heading}</h2> }} />` for a page inside a page.

## Nothing written twice

`src/duplication.test.ts` fails the suite when a declaration group is written
in two places. It compiles every arc module as a build does, takes out what
each call composed from a treatment, and fails on two places that write two
or more of the same declarations, on a place that writes out a ui group or an
arc treatment it could compose, and on a colour, spacing step or radius
spelled out twice outside the treatment and token modules. The message names
both places and what to compose instead. An allow-list takes a repetition
that truly belongs to one component, with the reason.

## Components

```tsx
import { AppShell, PageHeader, Status, confirm } from "@barqjs/arc";

<AppShell
  header={<WorkspaceSwitcher />}
  footer={<AccountMenu />}
  actions={<ThemeToggle />}
  navigation={[
    { items: [{ label: "Overview", to: "/", exact: true, icon: House }] },
    { label: "Projects", items: [{ label: "All projects", to: "/projects", icon: Folder }] },
  ]}
>
  <Outlet />
</AppShell>;

<PageHeader
  heading="Checks"
  description="Everything this project watches."
  actions={<Button onPress={create}>New check</Button>}
/>;

<Status tone="success">Operational</Status>;

if (await confirm({ title: "Delete the check?", tone: "danger", confirmLabel: "Delete" })) {
  await remove(id);
}
```

- `AppShell`: the sidebar and the page beside it, with a top bar holding the
  trigger, the trail and the actions. The navigation is data, each item a
  router link marked current while the location is under it. The sidebar
  collapses to its icons, opens as it was left (the server reads the same
  cookie), and is a sheet on a narrow screen.
- `ThemeToggle`: light, dark or system from a menu on one button, on the
  provider's `colorScheme`. Its icon shows the choice, which the server knows
  from the cookie, so the page hydrates without a flicker.
- `CopyButton`: puts a value on the clipboard, turns to a check for a moment
  and tells a screen reader through a live region.
- `DetailSheet`: a record's detail in a sheet from the reading direction's
  end, in four widths. Its open state is the caller's, its own, or a search
  parameter's, so the detail has a link and closing takes the parameter out.
- `EmptyState`: a list with nothing in it yet, as an icon, a heading, a line
  and the actions that fill it, on `@barqjs/ui`'s `Empty`.
- `PageHeader`: the page's `<h1>`, a line about it, what sits above it and the
  actions beside it.
- `StatCard`: one number, what it counts, how it moved in a tone, and an
  optional sparkline drawn as inline SVG, with its numbers in words for a
  screen reader.
- `Status`: a state in a word and a tone, as a dot, a tinted pill or a filled
  one, with an optional pulse that stops under reduced motion.
- `confirm()`: a promise for the reader's answer, drawn by one `<ConfirmHost />`
  on the page.
- `DataTable`: records as a grid, from TanStack column definitions through
  `@barqjs/table`, read by `@barqjs/aria`'s table. The arrows move a cell at a
  time and a header sorts when pressed. Sorting, selection, column visibility
  and the page are each the caller's when given and the table's own when not.
  It selects one row or many, with a checkbox per row and one for all, and a
  `SelectionBar` of `selectionActions` while any are selected. Columns resize
  through aria's handles, leave the grid below their `hideBelow` breakpoint,
  and align numbers at the end. `rowHref` makes the whole row a link the
  router follows, while a button in a cell stays a button. It draws skeleton
  rows while loading, an `EmptyState` when empty, pages or loads more as the
  end comes into view, keeps its header stuck, and renders only the rows on
  screen with `virtualRowHeight`.

  ```tsx
  <DataTable
    label="Invoices"
    data={invoices()}
    getRowId={(invoice) => invoice.id}
    columns={[
      { accessorKey: "number", header: "Number" },
      { accessorKey: "customer", header: "Customer", hideBelow: "md" },
      { accessorKey: "total", header: "Total", align: "end" },
    ]}
    selectionMode="multiple"
    selectionActions={[{ label: "Archive", tone: "danger", onAction: archive }]}
    rowHref={(invoice) => `/invoices/${invoice.id}`}
  />
  ```

- `DataToolbar`: the row above a list, a search landmark holding the search
  field, a chip per filter, a Clear once any is set, the view options that
  show and hide columns, and the caller's actions. The search and each filter
  are the caller's, the toolbar's own, or a search parameter's, so a filtered
  list has a link. While rows are selected their count and actions take the
  filters' place.

  ```tsx
  <DataToolbar
    search={{ label: "Search invoices", param: "q" }}
    filters={[{ id: "status", label: "Status", param: "status", options: STATUSES }]}
    columns={[{ id: "customer", label: "Customer" }]}
    columnVisibility={visibility()}
    onColumnVisibilityChange={setVisibility}
  />
  ```

- `SelectionBar`: how many rows are selected, in a live region, the actions
  for them, and a button that lets go. An action may ask through `confirm()`
  first, and holds the bar pending while it runs.
- Forms, on `@barqjs/form`: `useArcForm` is `createFormHook` bound to arc's
  fields, and `createArcForm` adds an app's own beside them. Each field is
  `ui`'s `Field` with its label naming the control, its description and its
  error wired by `aria-describedby`, and the error shown once the field is
  touched. `TextField`, `PasswordField` with a button that shows what was
  typed, `NumberField` held as a number, `TextareaField`, `SwitchField`,
  `CheckboxField`, `SelectField`, `ComboboxField`, `DateField` and
  `DateTimeField` (aria's segments, a date and time held as a
  `ZonedDateTime` and shown in `timeZone`), and `TimeZoneField`, found by
  typing a city. `form.SubmitButton` is pending while the form submits and
  disabled while it holds an error, and `form.FormError` shows what is wrong
  with the whole form. `setServerErrors` puts a failed submission's errors on
  the fields they name and the rest on the form; editing a field retires its
  error.

  ```tsx
  const form = useArcForm(() => ({
    defaultValues: { email: "", zone: "UTC" },
    onSubmit: async ({ value, formApi }) => {
      const result = await save(value);
      if (!result.ok) setServerErrors(formApi, { fields: result.errors });
    },
  }));

  <form.AppForm>
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.FormError />
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" type="email" />}
      </form.AppField>
      <form.AppField name="zone">
        {(field) => <field.TimeZoneField label="Time zone" />}
      </form.AppField>
      <form.SubmitButton>Save</form.SubmitButton>
    </form>
  </form.AppForm>;
  ```

- `FormSheet`: an arc form in a `DetailSheet`, its fields in the body and
  Cancel and Save at the foot. Closing it with unsaved changes, by Cancel,
  Escape or its close button, asks first, and so does leaving the page while
  it is open. It stays open while it submits and closes once a submission
  succeeds.
- `UnsavedChangesGuard`: asks through `confirm()` before a page with unsaved
  changes is left by a link or the back button, and has the browser ask
  before the tab closes. It guards while `when` is true and stops when it
  unmounts.
- `CommandMenu`: the palette `Mod+K` opens, of places to go and things to do.
  A page adds its own actions with `useCommands` for as long as it is open,
  and `registerCommands` adds them from outside any component.
- `Breadcrumbs`: where the page sits, read from the matched routes'
  `staticData.crumb` or given as items. A narrow trail folds its middle steps
  behind a button that shows them.

## Inputs and pickers

```tsx
import { Chip } from "@barqjs/arc";

<Chip selected={remote()} onSelectedChange={setRemote}>Remote</Chip>;
<Chip onRemove={() => drop("design")}>Design</Chip>;
```

- `Chip`: a compact label that is plain, an action (`onPress`), held on or
  off as a filter (`selected`), or removable (`onRemove`). A filter chip is a
  toggle button that draws a check as well as its fill, so its state never
  rests on colour; the remove button is its own stop, named "Remove" and the
  chip's words. `tone`, `variant` (`outline` or `subtle`) and `size`
  (`sm` or `md`), and `chipVariants` is the shape every tag in arc wears.
- `TagGroup`: tags in a row that wraps, on `@barqjs/aria`'s tag group: one
  Tab stop, the arrows moving in the reading direction, Delete removing the
  focused or selected tags, and focus kept on the group when the last one
  goes. `onRemove` gives each tag a remove button, `selectionMode` makes them
  selectable, `maxVisible` shows a few with a button for the rest,
  `onClearAll` adds Clear all, and `label`, `description` and
  `errorMessage` frame it as a field.
- `TagInput`: tags typed one at a time, each ended by Enter or a comma, and
  a pasted list split into a tag per entry. A repeat, a tag past `maxTags` or
  one `validate` refuses stays in the input with the reason under it, so
  nothing typed is lost. Backspace in the empty input moves to the last tag,
  where a second removes it. It is `field.TagInput` in a form, holds its own
  value with `defaultValue`, and with `name` submits a hidden input per tag.
- `TimeField`: a time of day typed segment by segment in the locale's order
  and digits, held as a `Time`. `TimePicker` adds a button that lists a time
  every `step` minutes between `minValue` and `maxValue` (or the `times`
  given), written in the locale's own clock, so a phone picks one with a tap.
  Both are `field.TimeField` and `field.TimePicker` in a form, and stand
  alone with `value` or `defaultValue`. Segments grow to a finger's height
  under a coarse pointer, `DateField`'s as well.
- `DateRangeField`: a start and an end day from two months of calendar, on
  `@barqjs/ui`'s `DateRangePicker`, with `presets` above it, or `"common"`
  for today and the last 7, 30 and 90 days in arc's words. Its trigger is
  named by the label and then the range it shows, and with `name` a plain
  form posts an ISO interval, `2026-03-01/2026-03-07`.
- Colour, on `@barqjs/aria`'s colour behaviours, held as a hex string
  (`#7f00ff`, or `#7f00ff80` with alpha):
  - `ColorPicker`: a button showing the colour, named by the label and the
    colour, opening a `ColorEditor`;
  - `ColorField`: hex typed, committed on Enter or blur and stepped by the
    arrows, with the colour drawn at its start;
  - `ColorSwatches`: a set of swatches as a listbox, each named by its colour
    in the locale's words unless given a label, the chosen one ringed;
  - `ColorEditor`: an area, a hue slider, an alpha slider with `alpha`, a hex
    field, the browser's eye dropper where there is one, and `swatches`, all
    one colour;
  - `ColorArea` and `ColorSlider` on their own, their thumbs a finger's size
    under a coarse pointer.

  The three fields are `field.ColorPicker`, `field.ColorField` and
  `field.ColorSwatches` in a form.

## Code

```tsx
import { CodeBlock, CodeDiff, CodeEditor } from "@barqjs/arc/code";

<CodeEditor label="Query" language="sql" value={query()} onChange={setQuery} />;

<CodeDiff original={saved()} modified={draft()} language="json" layout="unified" />;

<CodeBlock filename="vite.config.ts" language="typescript" code={config} lineNumbers />;
```

The code components are CodeMirror 6, in an entry of their own so an app that
never imports them carries none of it. Each language loads on first use, so a
page pays only for the languages it shows.

- `CodeEditor`: an editor owned by the component and destroyed with it. `value`
  makes the document the caller's and `defaultValue` leaves it the editor's;
  `onChange` hears each tick's edits once, after them. `language`,
  `readOnly`, `placeholder`, `lineNumbers`, `wrap`, `tabSize`, `minHeight`,
  `maxHeight` and `extensions` (an extension, or an accessor it follows)
  reconfigure the live editor. `label`, `labelledBy`, `description` and
  `describedBy` name and describe it, `invalid` marks it, and Mod-Enter calls
  `onSubmit`. `onView` hands over the `EditorView` for anything the props do
  not reach, such as a language service in a worker. On a server, and until
  its language loads, it is the code highlighted in a `<pre>` of the editor's
  own metrics, which a hydrated page adopts and the editor then replaces
  without moving a line.
- `CodeDiff`: two texts compared with `@codemirror/merge`, side by side or
  unified, unchanged stretches folded. Editable, the modified side reports
  its changes as `CodeEditor` does.
- `CodeBlock`: code to read and copy, with its file or language above it, a
  `CopyButton`, and line numbers drawn by CSS so a copy leaves them out.
  `Highlight` is the code alone. Both highlight with lezer and no editor, so
  a server writes them highlighted and the browser adopts that markup without
  loading the language.
- Languages: `javascript`, `jsx`, `typescript`, `tsx`, `json`, `html`, `css`,
  `markdown`, `python`, `xml`, `yaml` and `sql`, with aliases such as `ts`
  and `yml`. `registerLanguage` adds an app's own, a legacy mode included, and
  `language` also takes a `LanguageSupport` built by hand.

The colours are the theme's `code-*` tokens and the metrics are custom
properties (`--code-font-size`, `--code-line-height`, ...), so light, dark and
an app's brand restyle a live editor with no reconfigure.
