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

`clock` is how the reader reads times: their own `zone` or `"utc"` (or an
IANA name), a 12- or 24-hour clock (`hours`) and the first day of a week
(`weekStart`). It is written into the locale's Unicode extension
(`en-US-u-fw-mon-hc-h23`), so every date, time and calendar below follows
it, and `FormattedDate` and `RelativeTime` write in its zone. `localZone` is
the reader's zone as the server knows it, from a cookie, so the first paint
is already in it. `provideReaderClock` does the same for a subtree,
`useReaderClock` reads it, and `serializeReaderClock`/`parseReaderClock`
keep it in one cookie-safe string.

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
  `caption`, `stat`, `numeric`, `mono`, `sans`, `written` (text as it was
  typed, its line breaks kept), and the sizes and weights on their own. They start from ui's `text.sm`, `text.medium` and
  `text.heading`, so a label is one class in ui and in arc.
- Colour by role: `fg` (`default`, `muted`, `faint`, `link`, `danger`,
  `tone`, ...), `bg` (`page`, `card`, `popover`, `sunken`, `muted`, `tone`,
  ...), and `tone.success` to `tone.neutral`, which set the three custom
  properties `fg.tone`, `fg.toneBase` and `bg.tone` read below them.
- Surfaces: `surface.card`, `sunken`, `bordered`, `elevated`, `overlay`
  and `onMedia` (a dark scrim with white text over a picture or video),
  built from `edge` (`all`, `frame`, `input`, `top`, `bottom`, `start`),
  `rounded` (`xs` to `xl`, `full`) and `elevation.raised`.
- State: `focus.visible` and `focus.slot` are ui's rings, `focus.inset` the
  same ring inside a cell, `focus.within` for a box made of parts, and
  `focus.outline` for a scrolling region; `interaction` covers hover, focus
  within, selected, invalid, a pressable cursor, a part a finger drags
  and a column edge dragged to resize (`interaction.resize`).
- `place`: a layer over its parent (`cover`, `passive` for one the pointer
  passes through), `middle`, `fill`, `block`, `screen`, the insets a
  cell and a thin strip keep from their edges (`padded`, `paddedStrip`),
  `endCorner` (a step in from the bottom corner at the line's end) and
  `floating` (fixed on the overlay's layer).
- `motion.colours`, `motion.transform` and `motion.enter`, whose duration goes
  to nothing under reduced motion so a state still lands.
- `target.size`: 24px under a fine pointer and 44px under a coarse one, for a
  part that is not one of ui's controls (those grow by themselves).
- Tokens: `space`, `radius`, `motionTokens` and `zIndex`, as values. A colour
  or a corner ui already names is ui's `tokens`, from
  `@barqjs/ui/theme/tokens`, rather than a second spelling here.

Each family is a module of its own (`layout`, `gap`, `type`, `colour`,
`surface`, `focus`, `interaction`, `motion`, `target` and `tokens`, in
`src/style/`), and `@barqjs/arc/style` re-exports them. A treatment read
through it folds exactly as one read from its own module, and the stylesheet
`@barqjs/vite` carries with the fold is that family's, so an app that uses
`layout` and `gap` ships those two families and none of the rest. ui's groups
(`text`, `box`, `ring`, `ringSlot`, `icon`, `when`, `touch`, `contrast`) and
the conditions stay in ui's own modules, `@barqjs/ui/shared-text` and the
rest, and are composed here, never written again.

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
nearest query container, one scale per prop. The element carries a custom
property per step it changes at, inline (`--arc-gap-base`, `--arc-gap-md`,
`--arc-gap-cq-md`), and a fixed rule per step reads it, so the stylesheet is
the same whatever the values, a server writes everything a step needs into the
element's own markup, and a nested stack never reads its parent's steps. The
rules are ranges that never overlap, so two steps never tie on the cascade's
hash order. A value is one of the system's tokens: a step of the spacing scale,
an alignment keyword, a column count, a viewport step's width; anything else
is refused with a `TypeError` naming it. `render` puts
another element in the component's place: `render={(part, children) => <ul
{...part.props} ref={part.ref}>{children}</ul>}`.

### Page and record layouts

```tsx
import {
  Chip,
  PageHeader,
  RecordLayout,
  RecordPager,
  RecordSection,
  ResponsiveTabs,
  Status,
} from "@barqjs/arc";

<PageHeader
  heading="INV-1043"
  mark={<Status tone="danger" />}
  badges={<Chip size="sm">Overdue</Chip>}
  facts={[{ label: "Customer", value: "Umbrella Labs" }]}
  alerts={[{ label: "Overdue by 12 days", tone: "danger" }]}
  actions={<RecordPager position={4} count={32} onPrevious={back} onNext={on} />}
/>
<ResponsiveTabs aria-label="Invoice" param="tab" items={tabs}>
  {(tab) => (
    <RecordLayout rail={<RecordSection heading="Details">…</RecordSection>}>
      <RecordSection heading="Lines" onEdit={editLines}>…</RecordSection>
    </RecordLayout>
  )}
</ResponsiveTabs>;
```

- `PageHeader` is a record's header too: `media` (an avatar) at the start, a
  `mark` right before the title (a status dot, the kind's icon), `badges`
  right after it, `facts` in one wrapping row under it as a `<dl>` whose
  terms only a screen reader hears, and `alerts` as toned chips that wrap a
  long note inside their own chip. `align="start"` holds the actions beside
  the title rather than at the foot of the text.
- `PanelToolbar`: the row that opens a tab panel or a section under the
  page's header, a heading (an `<h2>`, or what `renders` draws), a line about
  what it holds and its own filters or actions at the end, wrapping under the
  text on a narrow screen.
- `RecordLayout`: the story in a main column and the record's facts in a
  named rail beside it from `lg`, under it below; `railWidth` is a fixed
  column or a third, and `stickyRail` keeps a short rail in view below
  `--arc-sticky-top`.
- `RecordSection`: one titled part of a record, a `<section>` named by its
  heading and a query container, so a `DescriptionList` inside lays out by the
  section's width. `onEdit` adds a ghost Edit named by `editLabel`; `variant`
  frames it as a card, rules it off from the one above, or draws nothing.
- `RecordPager`: the previous and next record of a list, as handlers or
  links, a side with neither disabled, and "4 of 32" as a status. With
  `shortcuts` K and J step from anywhere but a text field.
- `ListDetailLayout`: a list beside the record open from it, the edge between
  them a resizable handle remembered under `storageKey`. Below `breakpoint`
  one pane fills the space at a time, the record with a Back that returns
  focus to the list; which one shows is the stylesheet's, so the server draws
  a phone's page as the phone shows it. With `param` the open record is a
  search parameter, so it has a link and a phone's Back returns to the list.
- `MasterDetailList`: a list read beside a viewer. The arrows open each row
  they reach (`current`, `onCurrentChange`), the open row is the list's
  selected row, marked at its start edge and kept in view, and `checkboxes`
  tick rows for a bulk action without moving the open one; `isCheckable`
  disables a row's box.

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
  cookie), and is a sheet on a narrow screen. `sidebar` holds what is the
  reader's own rather than a page to go to, below the navigation: a
  `ConversationList`.
- `ThemeToggle`: light, dark or system from a menu on one button, on the
  provider's `colorScheme`. Its icon shows the choice, which the server knows
  from the cookie, so the page hydrates without a flicker.
- `CopyButton`: puts a value on the clipboard, turns to a check for a moment
  and tells a screen reader through a live region.
- `DetailSheet`: a record's detail in a sheet from the reading direction's
  end, in four widths. Its open state is the caller's, its own, or a search
  parameter's, so the detail has a link and closing takes the parameter out.
  Opened from a list, `steps` puts a `RecordPager` beside the heading, K and J
  step through the rows while it is open, and focus starts on the record.
- `EmptyState`: a list with nothing in it yet, as an icon, a heading, a line
  and the actions that fill it, on `@barqjs/ui`'s `Empty`. A `kind` says why
  in its own icon and words (see Feedback and states below), and
  `placement="section"` makes it a quiet line inside a card.
- `PageHeader`: the page's `<h1>`, a line about it, what sits above it and the
  actions beside it.
- `StatCard`: one number, what it counts, how it moved in a tone, and an
  optional `Sparkline` with its numbers in words for a screen reader. A
  `meter` draws how full the number is against its limit as a `Meter` named
  by the label; `descriptionTone` puts a dot in a tone before the line under
  it; `valueTone` tones the number only when it is wrong, and `rating` says
  how it rates in a word (a `MetricRating`) and tones it when fair or poor.
  `aside` sits beside the number from the `sm` breakpoint. With `href` or
  `onPress` the label is a link or a button stretched over the whole card,
  and `loading` puts shapes in place of the number.
- `Status`: a state in a word and a tone, as a dot, a tinted pill or a filled
  one, with an optional pulse that stops under reduced motion.
- `confirm()`: a promise for the reader's answer, drawn by one `<ConfirmHost />`
  on the page; it also asks with a field, a typed name, a check of what
  depends on the thing, and an action run inside the question (see Feedback
  and states below).
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
  screen with `virtualRowHeight`. `getSubRows` makes it a tree grid: a parent
  opens and closes on the button in its `treeColumn` cell or with the arrows
  in the reading direction, each level indented, and `expandedKeys` holds
  which are open.

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

- `DataGrid`: records to edit like a spreadsheet, on `@barqjs/table`'s cell
  selection, as a `grid`. Each column has a `type` (`text`, `number`,
  `select` with `options`, `date`, `checkbox`) that picks its editor and how
  a pasted value is read, and may `validate`, stay `frozen` at the reading
  start, sit under a group's shared header, and `total` in the footer and in
  each group's row (`groupBy`), which folds. The arrows move a cell in the reading
  direction, Shift with them or a drag grows the range, Home and End go to a
  row's ends and Mod with them to the grid's; Enter or F2 edits (a typed
  character replaces), Enter saves and goes down, Tab saves and goes on,
  Escape lets the edit go, a refused value keeps the editor open with the
  reason; Space ticks a checkbox, Delete clears the range, Mod+C copies it
  as tab-separated text and a paste fills from the focused cell. Every
  change reaches `onCellsChange` as one batch, `dirtyCells` are marked in a
  corner, `onAddRow` adds a row at the end, and `virtualRowHeight` draws
  only the rows on screen.

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

- `DataViews` and `ViewSwitcher`: the same records as a list, a board, a
  table or a calendar, as the reader chooses. The switcher is a pressed
  button per view on ui's toggle group, one Tab stop with the arrows in the
  reading direction, icons alone with `iconOnly`; `DataViews` draws it beside
  a `toolbar` and draws only the chosen view's `content`, over the data and
  filters the caller holds, so switching keeps the search and the filters.
  The view is the caller's, the switcher's own, or with `param` a search
  parameter's, so a view has a link; an unknown one falls back to the first.

  ```tsx
  <DataViews
    aria-label="Tasks"
    param="view"
    toolbar={<DataToolbar search={{ label: "Search tasks", param: "q" }} />}
    views={[
      { id: "list", label: "List", icon: List, content: () => <TaskList tasks={tasks()} /> },
      { id: "board", label: "Board", icon: Kanban, content: () => <TaskBoard tasks={tasks()} /> },
    ]}
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
  succeeds; one that fails moves focus to the first field it marked.
  `status` is a polite line in the foot about the draft ("Draft kept on
  this device", a `SaveStatus`), and `loading` and `loadError` stand in for
  the fields while the record it edits is fetched.
- `FormDialog`: the same form in a `ResponsiveOverlay`, a dialog on a wide
  screen and a sheet from the bottom on a phone, opened by its `trigger`,
  `open` or a `param`. With `result` a successful submit shows what it
  draws in place of the fields, a key shown once or a link to what was
  made, and Done closes it.
- `RecordFormPage`: a page that creates or edits one record, its fields in
  one column, a `FormActionBar` held at the bottom of the screen and a
  `danger` zone under it. A failed submit on a long form (past
  `summaryAfter` fields) opens with an `ErrorSummary` that takes focus and
  links each field; on a short one focus goes to the first field marked. A
  `secondary` submit ("Save and add another") reaches `onSubmit` as
  `meta.intent`. Leaving with unsaved changes asks, except while a save
  that navigates is under way.
- `FormActionBar`: a form's own sticky bar, reading the form around it:
  "Unsaved changes" once a field changed, Cancel (`onCancel`) or Discard,
  an optional second submit, and Save pending while it submits.
- `ErrorSummary`: what a failed submit has to fix, each problem a link that
  focuses its control with the label in view.
- `useAutosave`: saves a draft (`value`) once changes pause, one save at a
  time, a change made during a save saved after it; Mod+S saves at once;
  offline it holds the draft and saves it on reconnecting; `blockedBy`
  holds a draft that cannot be stored yet, with the reason. Leaving the
  page saves first and asks before dropping a draft whose save failed.
- `SaveStatus`: where a draft stands: Saving…, Saved, Not saved with the
  reason and a Retry, Offline, or why it is held. Given `autosave`, it reads
  the hook; `compact` keeps only the icon on a phone.
- `UnsavedChangesGuard`: asks through `confirm()` before a page with unsaved
  changes is left by a link or the back button, and has the browser ask
  before the tab closes. It guards while `when` is true and stops when it
  unmounts.
- `CommandMenu`: the palette `Mod+K` opens, of places to go and things to do.
  A page adds its own actions with `useCommands` for as long as it is open,
  and `registerCommands` adds them from outside any component. `sources`
  search as the reader types, each once the typing pauses (`debounce`) and
  past `minLength`, the search it replaced aborted through its `signal`. Each
  source's results are a group of their own below the commands, the words
  that matched marked in the label and the snippet, with its own searching,
  nothing-found and failed rows and a Show more while it returns a `next`
  cursor. `recent` keeps the results chosen and offers them before anything
  is typed, and a status line tells a screen reader how many were found.
  An action's `keys` (`"mod+s"`, or `"g p"` for G then P) are shown as the
  reader's keyboard writes them, and with `bindKeys` they run the action from
  anywhere on the page through `@barqjs/primitives`' `shortcut`, registered
  actions included, for as long as the menu is mounted.

  ```tsx
  <CommandMenu
    groups={PAGES}
    recent={{ key: "palette-recent" }}
    sources={[
      {
        id: "invoices",
        heading: "Invoices",
        search: async (query, { signal, cursor }) => {
          const page = await api.invoices.search({ query, cursor }, { signal });
          return { results: page.items.map(toResult), next: page.cursor };
        },
      },
    ]}
  />
  ```

- `HighlightMatches`: a text with what a search matched marked, each word of
  `query` matched in the locale's own way ("resume" marks "Résumé"), or the
  `ranges` a search service found.
- `Breadcrumbs`: where the page sits, read from the matched routes'
  `staticData.crumb` or given as items. A narrow trail folds its middle steps
  behind a button that shows them.

## Typography

```tsx
import { Heading, Link, Prose, Text, Truncate } from "@barqjs/arc";

<Heading level={2}>Billing</Heading>;
<Text size="xs" color="muted" numeric>
  Updated 12:04
</Text>;
<Truncate lines={3}>{comment.body}</Truncate>;
<Prose html={rendered} />;
```

- `Heading`: `level` is the element, `<h1>` to `<h6>`, and `size` (`xs` to
  `3xl`) the look, defaulting to the level's own, so the outline stays right
  whatever the design asks for. `3xl` steps down a size on a phone.
- `Text`: running text on arc's scale, a `<p>` unless `as` says otherwise, in
  a `size`, a `weight` and a `color` that is a role (`muted`, `faint`, `link`)
  or a tone's foreground. `lines` cuts it with an ellipsis, `numeric` lines up
  its figures and `mono` sets it in the code face.
- `Code`: a name, a path or a command inside a sentence. A block to read and
  copy is `CodeBlock`.
- `Prose`: long-form text styled from its own elements, as markdown or a CMS
  writes them, from children or from `html` already made safe. Its rules are
  logical, so a quote's rule and a list's indent sit at the start of the line
  either way; a code block reads left to right and a wide table scrolls in its
  own box.
- `Link`: a link in running text on `@barqjs/aria`'s link. An absolute URL
  opens a new tab with `rel="noopener noreferrer"`, draws an arrow after its
  words and tells a screen reader it opens a new tab, in arc's words.
  `color` and `underline` (`always`, `hover`, `none`) set its look.
- `Truncate`: text cut to `lines`, with Show more and Show less once it is
  measured as cut, a press rather than a hover so a touch screen reads the
  rest too. `expandable={false}` puts the whole text in the title instead.
- `Shortcut`: keys pressed together as the reader's keyboard writes them,
  each a ui `Kbd`: `Mod+K` is ⌘K on an Apple device and Ctrl+K elsewhere. The
  server writes the PC names, which an Apple device swaps after hydrating.

## Dates, times and numbers

```tsx
import { Currency, Duration, FormattedDate, RelativeTime } from "@barqjs/arc";

<RelativeTime value={comment.createdAt} />;
<FormattedDate value={invoice.dueAt} options={{ dateStyle: "long" }} />;
<Currency value={1234.5} currency="USD" />;
<Duration value={run.elapsed} />;
```

Each is written by `Intl` in the locale in scope, with its figures lined up,
and agrees between the server and the hydrating page.

- `RelativeTime`: "3 minutes ago" or "in 2 days" in a `<time>` with the ISO
  moment in `datetime` and the absolute date in its title, kept current (each
  second under a minute, less often after) until it unmounts. `now` is the
  moment both halves measure from, the request's time; without it they write
  the absolute date and the browser turns it relative after hydrating.
  `wording="always"` writes "1 day ago" for "yesterday". With `exact` it is a
  button that opens the exact moment and its time zone in a popover, which a
  keyboard and a finger reach where a title reaches neither.
- `FormattedDate`: a date, a time or both, from `options`, in `timeZone`.
  Without one, the server and the hydrating page write UTC and the reader's
  own zone follows.
- `FormattedNumber`: anything `Intl.NumberFormat` takes, a percent, a unit or
  compact notation.
- `Currency`: an amount in its `currency`, `compact`, with a `sign`, or in
  brackets with `accounting`.
- `Bytes`: `2.4 MB`, the same reading an upload list uses.
- `Duration`: milliseconds as `1 hr, 5 min` in its two largest `units`, or
  `1:05:09` with `length="digital"`, by `Intl.DurationFormat`.
- `Interval`: how often something runs, "Every 5 minutes", "Hourly",
  "Daily"; `intervalText` is the same words for an app's own text.

`FormattedDate` writes a date-only value (`"2026-11-26"`) as that calendar
day in every zone, and `FormattedNumber` with `truncate` cuts rather than
rounds, so an uptime of 99.996% never reads 100%. All of them follow the
provider's reader `clock`, and `ClockPreference` is the control that sets
it: cards for the zone, the hour cycle and the week start, each with an
example in the reader's locale.

`relativeTimeFormatter` and `relativeUnit` in `@barqjs/aria/i18n` are the same
reading for an app's own text.

## Navigation

```tsx
import { ResponsiveTabs } from "@barqjs/arc";

<ResponsiveTabs aria-label="Project" items={[{ id: "checks", label: "Checks", count: 12 }]}>
  {(tab) => <ProjectPanel id={tab.id} />}
</ResponsiveTabs>;
```

- `ResponsiveTabs`: tabs from data that stay usable as the room narrows, on
  ui's tabs and `@barqjs/aria`'s tab list. With `overflow="menu"` the tabs
  that do not fit go into a More menu, the last first, the selected one
  always kept in the row; with `"scroll"` the row scrolls under a finger with
  a button at each end while there is more that way. An item takes an `icon`,
  a `count`, `isDisabled` and an `href`, and `hidden` leaves out a tab that
  does not apply; `children` draws the selected tab's panel, and
  `keepMounted` keeps every panel's state while another shows. The server
  writes every tab; the browser folds after hydrating. `param` keeps the
  selected tab in a search parameter, the first tab leaving it out. Under a
  router, tabs with `href` are routes of their own: the one whose path the
  page is on is selected, a tab comes back with the search it was left with,
  and `shared` names the parameters every tab carries on, such as a window.
- `BottomNavigation`: a phone's tab bar of three to five destinations, a
  navigation landmark along the bottom clear of the home indicator. Each item
  is a router link (`to`, current while the location is under it), a plain
  `href`, or a button held by `selectedKey`; its `count` or `dot` is an
  `Indicator` on the icon and part of its name ("Inbox, 3 new"). It hides from
  `hideFrom` up (`md`), where `AppShell`'s sidebar takes over.
- `Stepper`: where a reader is in a task of several steps, on `@barqjs/aria`'s
  step list. Each step is a link named by its number, its state in words and
  its label, reachable once the step before it is done (`lastCompletedStep`),
  each its own Tab stop and the arrows moving between them. A done step shows
  a check; an `invalid` one an alert in the danger tone and "Has errors"; an
  `optional` one says so. Horizontal or vertical; across a narrow container
  a horizontal one keeps the markers and the current step's label.
- `Wizard`: a task in several steps over one arc form, `Stepper` above,
  the step's fields from `children(step)`, and Back, Skip for an
  `optional` step and Next below. Next checks the step's `fields` first and
  marks the step "Has errors" if they fail; the last step submits the form.
  A `summary` step lists what the steps before it hold, each with Edit. With
  `param` the step is a search parameter, so it has a link and the
  browser's Back goes back a step; with `resume` the values and the step are
  kept as the reader goes and restored on return, until the form is
  submitted; `onStepLeave` hears each step left, for a draft of the app's
  own. Moving to a step focuses its heading and announces "Step 2 of 3".
- `Pager`: the way through a list too long for one page, as a navigation
  landmark. `pages` (the default) lists the first, the last and the
  neighbours of the current page with gaps between, folding to "Page 2 of 9"
  across a narrow container; `compact` is that line between the arrows, and
  `simple` the arrows alone. `total` and `pageSize` add "21–40 of 312",
  `pageSizes` a Rows per page select, `showEdges` first and last, and
  `getHref` makes every page a link. `DataTable` pages with it.
  `pageWindow` is the list it draws.
- `TableOfContents`: the sections of a long page as `#id` links in a
  navigation landmark, nested by level, the one being read marked
  `aria-current="location"` as the page scrolls. The section that counts is
  the last whose top has passed `offset` (a sticky header's height);
  `activeId` holds the mark instead, and `sticky` keeps the list in view
  beside the content. The links are plain anchors, so the browser scrolls,
  keeps the address and moves focus itself.
- `SideNav`: a page's own navigation outside `AppShell`, a settings area's or
  a record's sections, from the same `NavGroup` data, so a section moves
  between the two unchanged. A named landmark of grouped router links, the
  current one `aria-current="page"`, a badge read as its description, one
  level of links below an item. Across a narrow container the groups run as
  one row that scrolls sideways (`collapse="never"` keeps the column).

## Settings

```tsx
import { DangerZone, SettingsLayout, SettingsSection } from "@barqjs/arc";

<SettingsLayout navigation={SECTIONS} selected={section() !== undefined} back={{ to: "/settings" }}>
  <SettingsSection heading="Profile" description="How others see you." form={form}>
    <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
  </SettingsSection>
  <DangerZone
    actions={[
      {
        id: "delete",
        title: "Delete the workspace",
        label: "Delete workspace",
        confirm: { title: "Delete the workspace?", confirmLabel: "Delete" },
        onAction: remove,
      },
    ]}
  />
</SettingsLayout>;
```

- `SettingsLayout`: a settings area's sections in a `SideNav` beside the open
  one across a wide container; across a narrow one the list of sections
  first and, once one is `selected`, that section alone with a link `back`
  to the list.
- `SettingsSection`: one block of settings with its heading, a line about it,
  its fields and a bar at its foot. Given its own `form`, Save waits for a
  change, a moment of "Saved" follows a save, and leaving with unsaved
  changes asks through `UnsavedChangesGuard`; without one, `footer` holds
  the bar's actions.
  `values` is the record as the server has it now: a form with no unsaved
  change follows it when it is fetched again. `readOnly` disables the
  fields and puts its reason in Save's place, and `list` holds rows edge to
  edge under the header. Inside a `SettingsLayout` every section reports its
  changes to the layout, which asks once before the area is left; with
  `narrow="row"` the sections run as a row above the open one on a narrow
  container.
- `DangerZone`: the actions that cannot be undone, in the danger tone, each
  with a line about it and a button that asks through `confirm()` first.
- `SettingRow`: one setting, its label and line at the start and its
  control at the end. The switch applies at once (`onCheckedChange`), held
  while the save runs and flipped back with the server's reason when it
  fails; `control` takes any other control, handed the row's label and
  description ids, with its `status`. `locked` makes it read only with a
  reason, a plan `badge` and an `action` to lift it.
- `FeatureToggles`: a workspace's features as setting rows, held as the ids
  that are on. Turning one on turns on what it `requires`, turning one off
  turns off what needs it, and a feature whose need is locked off is locked
  too. It is a field inside `form.AppField`.
- `PlanGate`: a feature's editor, or an info notice in its place saying
  which plan has it and how to get it.
- `PreferenceMatrix`: how a reader hears of each kind of notice, a table of
  kinds by channels with a checkbox per cell or a choice where a channel has
  `options`. A group's first row sets every kind in it, mixed while they
  differ; a channel that is `unavailable` says why and only turns off; a
  `locked` kind says why it is fixed. Kinds stack on a narrow container.
- `CalendarFeed`: a private calendar feed to copy and open in Google
  Calendar, Apple Calendar or Outlook, and `onReset` to make a new one,
  asking first while an old one exists. `shownOnce` names when the current
  feed was made and last read instead of its address.
- `useThemeAccountSync`: keeps the `ThemeToggle` choice on the reader's
  account too. The cookie paints the first frame, the account's choice wins
  once it loads, and a choice made here is saved to it; a failed save keeps
  the choice on this device and says so.

## Keys and secrets

```tsx
import {
  ApiKeyManager,
  OneTimeSecret,
  PermissionScopePicker,
  StoredSecretField,
} from "@barqjs/arc";

<ApiKeyManager
  keys={keys.data}
  scopeGroups={SCOPES}
  onCreate={(draft) => api.createKey(draft)}
  onRevoke={(key) => api.revokeKey(key.id)}
/>;

<form.AppField name="token">
  {(field) => (
    <field.StoredSecretField label="Token" stored={store.token} forgettable mustReenter={moved()} />
  )}
</form.AppField>;
```

The fields are `field.*` inside `form.AppField` and hold their own value
with `value`, `defaultValue` and `onChange` outside one.

- `SecretField`: a secret typed in, hidden with a button that shows it, kept
  from autofill and the spelling check. `multiline` makes it a text area drawn
  as dots for a key or a certificate; `"choose"` adds a switch for it, which a
  paste of several lines turns on.
- `StoredSecretField`: a secret the server keeps and never shows. Held as what
  to send: `""` keeps it, a string replaces it and `null` forgets it. Its
  placeholder and line say it is kept, how it ends and since when;
  `forgettable` offers Forget with Keep it to undo, and `mustReenter`, once
  where it is sent has changed, refuses a blank field with why.
- `SecretReferenceField`: a stored secret picked by name and held as a
  reference to it, `{{NAME}}` (`secretReference`, `referencedSecret`). A
  reference to a secret no longer stored stays chosen, named missing and
  invalid.
- `FileOrPasteField`: text pasted in or read from a file chosen or dropped on
  it, a certificate, JSON or a CSV, the file named beside the button; a file
  `accept` or `maxSize` refuses is not read and says why.
- `CopyableField`: a read-only value with a copy button inside its edge, an
  identifier or an address, selected whole when focused.
- `MaskedValue`: a value masked but for its end, a button that shows it (and
  `reveal` fetches it only then), a copy button once known, and `hideAfter`.
- `OneTimeSecret`: a secret shown once after it was made, its copy button,
  when it stops working, and with `onDone` a box to tick before Done. In a
  `FormDialog`'s `result` it is the key a dialog made. `handOffSecret` and
  `takeSecret` carry one to the next page in this tab's memory, never in the
  address.
- `RedactedSecret` and `RedactedText`: where a secret was taken out of text, a
  marker naming it and why, read as "Secret TOKEN"; `pattern` says what a
  redaction looks like.
- `PermissionScopePicker`: scopes to grant, grouped, a checkbox each with what
  it allows (`audience="agent"` reads an agent's words); those beyond
  `allowed` show disabled with why. `scopeSummary` says a set briefly, a scope
  another implies left unsaid.
- `CredentialBindingList`: where each secret something needs comes from, the
  captured value saved, a stored secret or a value typed, with where it is
  saved and what a row still lacks. `credentialBindings` fills in the
  defaults.
- `ApiKeyManager`: keys with what tells them apart, scopes, last use and
  expiry, an expired one marked; Create with a free name, an expiry, scopes
  and the secret shown once; Revoke asked first, with a box such as "Also
  remove the runners" from `revokeOption`.
- `ActiveSessionsList`: everywhere a person is signed in, this device marked,
  Sign out on each and Sign out everywhere else, asked first.
- `ConnectedAppsList`: applications acting for people, each one's access,
  connection, last use and Disconnect asked first, one a policy blocks marked
  with why; `policy` adds the switch that allows them and `endpoint` the
  address they connect at.
- `ConnectionTestDialog`: a dialog that tests a configured connection, with
  one thing to read as well (`probe`), and keeps the outcome in a status line
  for another try, never what it read.

## Data display

- `Indicator`: a count or a dot in a tone, on its own or pinned to the top
  corner at the reading direction's end of what it wraps. The count is in the
  locale's digits and capped at `max` (`99+`); pinned, it carries words for a
  screen reader, `label` or arc's "3 new".
- `AvatarStack`: the people on something, overlapped, on ui's avatar group:
  a photo or initials each, in a list named by the names as the locale joins
  them. A `presence` (`online`, `away`, `busy`, `offline`) is a dot in a tone
  and in words, and the people past `max` are one "+3" read as "3 more".
- `Timeline`: what happened to something, in order, as an ordered list down a
  rail: each event's `title`, `description`, `actor`, an `action` after the
  title, and a marker that is its `icon` or a dot in its `tone`. Its `time` is
  a `RelativeTime` measured from `now` (or a `FormattedDate` with
  `timeFormat="absolute"`). `kinds` describes each kind of event once (its
  label, icon, tone and `verb`, `quiet` to fold the detail into the verb,
  `comment` to draw it as a card), and an unknown kind reads as its own name.
  `groupByDay` puts the events under a heading per day in `timeZone`,
  `filterable` adds a toggle per kind present (`kindFilter` to hold it),
  `onKeyChange` gives each event a star that marks it as a key event, and
  `onLoadMore` adds Show more for a history read a page at a time.
- `ChangeLog` and `FieldChanges`: who changed what, and when. Each entry is
  its actor (a person's avatar, a robot for the system), what they did and to
  what, why, and the fields it moved, each old value struck through to its
  new one, every value a `<bdi>` so a value in another script keeps its own
  direction (`ltr` for a phone number). Entries group by day, and a
  `DataToolbar` over them filters by Who and When, here or, with
  `manualFiltering`, on the server; `params` keeps both in the address and
  `matchesChangeLogFilter` is the test it applies.
- `PropertyList`: a record's properties edited where they are read, drawn
  from a schema of fields: `text` through `InlineEdit`, `choice` through
  `InlineSelect` with each option's icon or a dot in its tone, `people`
  through `EntityPicker`, `date` on a calendar in a popover, and `value` read
  only. Each saves on its own through `onSave(id, value)`, holds while the
  save is out and says why one failed.
- `OutlineView`: a hierarchy to read rather than browse, as nested lists
  indented on the start edge: `look="pills"` draws each line as a chip,
  `guides` rules down each level, and `flow="inline"` lays a sequence in a
  row joined by an arrow that turns with the reading direction.
- `DescriptionList`: a record's facts as terms and values in a `<dl>`, each
  pair in a `<div>`, with an `action` beside a value. The term sits beside its
  value from the container's `sm` step and above it below that (`layout`
  fixes either), `columns` puts pairs side by side across a wide container,
  and `renders` gives a term or a value another element.
- `StatGroup`: `StatCard`s read together, two across a narrow container,
  three across a middling one and `columns` across a wide one, the cards of
  a short last row growing to fill it; `joined` draws them as one strip with
  a rule between each, `separate` as cards apart, and `loading` loads every
  card at once.
- `ProfileCard`: a person at a glance, a region named by them: their avatar
  with a presence dot, name, title, `PresenceStatus`, actions, contact rows,
  the time where they are (written once the page hydrates, or for `now`),
  and what they wrote about themselves; `variant="panel"` centres a larger
  avatar for a side panel, with `loading` and `missing` states.
- `LinkPreview`: what a link is before it is opened, its site, title, a line
  and a picture. The title is one link stretched over the card that says it
  opens a new tab; the picture and the site's icon are decorative, and
  `onDismiss` adds a remove button of its own. `loading` shows shapes.
- `TemplateGallery`: where something new starts. Category chips filter the
  templates, the cards are `RadioCards` (a blank start first with `blank`),
  and a pane beside them (under them in a narrow box) shows the chosen one
  large and starts from it. `SaveTemplateDialog` keeps something as a
  template, its name, a line and its category, in a `FormDialog`.
- `Tile`: a card for one thing in a collection, with an `eyebrow`, a title, a
  `description`, a `footer`, `actions` and `media` on top or at the start,
  full bleed. With `href` or `onPress` its title is the link or the button,
  stretched over the whole tile so a screen reader hears one name while the
  `actions` stay controls of their own; with `selected` a checkbox named by
  the title holds the choice and a press anywhere on the tile toggles it.
  (ui's `Card` is the plain container.)
- `List` and `ListItem`: rows of things to scan, open and select, on
  `@barqjs/aria`'s grid list: one Tab stop, the arrows between rows and into
  a row's controls, type-ahead, `selectionMode`, and Enter for `onAction`.
  A `ListItem` is ui's `Item` with `media`, a `title`, a `description`, quiet
  `meta` at the end and `actions`. `virtual` draws only the rows on screen;
  `onLoadMore` asks for more as the end comes into view, with a loading row
  while `isLoadingMore`, and `empty` is what an empty list shows.
  `selectionBehavior="replace"` makes selection follow focus, and
  `disallowEmptySelection` keeps one row chosen. With `onReorder` each row
  gets a drag handle: a pointer or a finger drags from it, the list scrolling
  near its edges, and the keyboard picks the row up with Enter on the handle;
  `moveButtons` adds buttons that move a row up and down, quiet at the ends,
  and `reorderItems` applies the event. `keyboardNavigationBehavior="tab"`
  keeps every key typed into a field in a row for that field.
- `ChecklistEditor`: a checklist edited in place, a task's subtasks: each
  line a checkbox, its text an `InlineEdit` and a remove button, a field
  under it adding a line on Enter, lines reordering by their handles, and how
  many are done in words and as a bar.
- `SearchResults`: a search across kinds, All and each kind as
  `ResponsiveTabs` with counts. All shows each kind's first few with Show all,
  a kind's tab all of it with Show more; each result links where it opens,
  the query's words marked in its title and snippet, with loading, failed,
  nothing-found and nothing-typed states.
- `TreeView`: a hierarchy to browse and choose from, on `@barqjs/aria`'s
  tree: one Tab stop, Up and Down between rows, Right to open or go in and
  Left to close or go out in the reading direction, type-ahead, and a
  checkbox per row when several can be chosen. A node with `hasChildren` and
  no `children` calls `onLoadChildren` as it opens and shows a loading line
  while its id is in `loadingKeys`; `hasMore` puts a row at the end of a
  level that asks `onLoadMore` for the rest. With `dragAndDropHooks` from
  aria's `dragAndDrop()`, rows drag to reorder or into another, by pointer,
  touch or a drag button the keyboard reaches.
- `KanbanBoard`: columns of cards that move between them, tasks by status
  or leads by stage, each column `@barqjs/aria`'s grid list with its drag
  and drop. A card drags by pointer or touch, or from its drag button by
  keyboard: Enter picks it up, Tab and the arrows choose where, in its
  column or another, and Enter drops it, announced as it goes. `onMove`
  says which cards went where and `applyKanbanMove` applies it to the
  columns. A column counts its cards against its `limit` and turns to a
  warning past it (`strictLimits` refuses a drop into a full one), folds to
  a strip, takes new cards with `onAddCard`, and with `virtual` draws only
  the cards on screen. A card is any content, a `ListItem` usually; the
  columns scroll sideways, snapping one at a time on a phone.

## Table and list views

A list page keeps its state in the address, so a filtered list has a link,
survives a reload and comes back with the back button.

```tsx
const state = useSearchParam("state", { defaultValue: "open", parse: oneOf(STATES) });

<SegmentedControl aria-label="State" param="state" items={STATE_SEGMENTS} />
<DataToolbar
  search={{ label: "Search incidents", param: "q" }}
  filters={[
    { id: "kind", label: "Kind", param: "kind", options: KINDS },
    { kind: "toggle", id: "mine", label: "Started by me", param: "mine" },
    { kind: "date-range", id: "when", label: "Date", param: "when" },
  ]}
  actions={<SavedViews param="view" views={views()} onCreate={saveView} />}
/>
<DataTable
  label="Incidents"
  columns={COLUMNS}
  data={incidents()}
  getRowId={(incident) => incident.id}
  error={failure()}
  onRetry={refetch}
  activeKey={openId()}
  card={{ title: (incident) => incident.title, status: (incident) => <Status … /> }}
  rowActions={(incident) => [{ label: "Acknowledge", inline: true, onAction: … }]}
  footer={<DataTableCount shown={incidents().length} hasMore={hasMore()} onLoadMore={more} />}
/>
```

- `useSearchParam`: any control's value in one search parameter. The default
  is left out of the address, a value `parse` refuses falls back to it,
  writes replace the history entry and keep every other parameter, and
  `debounce` shows each keystroke at once while the address waits for the
  typing to pause; a change from elsewhere (Clear, a saved view, Back)
  replaces what was being typed. `oneOf` is the `parse` for a fixed list.
- `SegmentedControl` and `MultiSegmentedControl`: one held of a few, or
  several with at least one, on ui's toggle group. A segment may carry a
  count and a tone dot, `""` is a segment of its own (a default), the value
  keeps the items' order whatever order they were pressed in, `param` keeps
  it in the address, `name` posts it, and a narrow container scrolls it
  sideways. `SegmentedField` and `MultiSegmentedField` add the label,
  description and error, standalone or as an arc form's field.
- `TimeRangePicker`: the last hour, day, week or month as segments, a
  Custom dialog (a sheet on a phone) of two date and time fields that refuse
  an end before the start, and Live while a preset is chosen.
  `resolveTimeRange` turns a range into its two instants; `param` keeps it
  as `24h` or an ISO interval.
- `DataToolbar` filters come in three kinds: a facet of options (with icons,
  counts and groups; past seven options it takes a field to type into), an
  on-or-off `toggle`, and a `date-range` of presets and two months. `chips`
  are `key: value` filters carried in from elsewhere, each removable, and
  `period` holds the dates a list covers, which Clear leaves alone. Below
  the `md` step the filters fold into one Filters button, counting the ones
  set, that opens them in a sheet.
- `SavedViews`: a list's filters, sort and columns under a name, the
  reader's own or shared, from a menu at the end of the toolbar. With
  `param` a view is the list's search parameters, a link opens it, the
  trigger says "(edited)" once the list moves away from it with Update on
  offer, the reader's default opens when the address names nothing, and
  Rename, Copy link and Delete (asked first) follow what the reader may do.
- `DataTable` states: `error` says in place of the rows that the load failed,
  with the server's words, the request id and Try again while `onRetry`
  runs; `footer` holds a `DataTableNote` or a `DataTableCount` ("Showing 25
  of 120", Load more); `activeKey` marks the row whose sheet is open
  `aria-current`; `density` is the table's own. `card` draws the rows as a
  card list below `md` (`layout="cards"` at every width), `totals` adds
  summing rows (as cards on a phone), and `rowActions` puts one action
  beside the row and the rest in a menu named after it. A selected row a
  filter or a page takes off the screen leaves the selection.
- `SelectionBar` actions: `appliesTo` acts only on the selected rows it fits,
  says how many, and is disabled for none. `onEach` runs one call per row
  (`concurrency` at once), counts them as they settle, and when some are
  refused keeps those selected with the first reason and Retry failed.
- `CellWithNote`: a cell's value with a muted note under it, cut to a line,
  whole in its title and to a screen reader. `OverflowList`: the first items
  then "+3", or the sentence "a, b, c and 2 more", the tail a button opening
  the whole list as a popover, or a sheet under a finger.
- `List` takes `section` and draws a heading over each run of rows that
  share one; the keyboard walks across sections and never stops on a
  heading. `useDateSections` groups by day ("Today", "Yesterday") or month in
  a time zone, and `loadMore="button"` asks for more with Show more rather
  than on scroll.
- `InheritedScopeList`: a scope's own items with a parent's beside them,
  read-only, each in a section named "From Acme organization" that links to
  where they are edited, "None." when empty, and a note under them all.

## Signing in

```tsx
import { AuthLayout, SignInForm } from "@barqjs/arc";

<AuthLayout brand={<Logo />} aside={<Showcase />} footer={<LegalLinks />}>
  <SignInForm
    providers={
      <Button variant="outline" onPress={github}>
        Continue with GitHub
      </Button>
    }
    forgotHref="/forgot"
    onMagicLink={(email) => api.sendLink(email)}
    onPasskey={() => webauthn.get()}
    onSubmit={(values) => api.signIn(values)}
    footer={<Link href="/sign-up">Create an account</Link>}
  />
</AuthLayout>;
```

The screens a signed-out reader meets, each composed from arc's form fields
and from slots, so a product adds its own providers, links and words rather
than forking one. A form's `onSubmit` answers with `ServerErrors`, which land
on the fields they name and above the form.

- `AuthLayout`: the brand above a column holding the form, an `aside` beside
  it on a wide screen and gone on a narrow one, and a `footer`; `wide` for a
  consent screen or a long flow.
- `SignInForm`: an email and a password, `providers` above with "or"
  between, "Remember me", a `forgotHref` link, `onMagicLink` (the password
  gives way to "Send link", then "Check your inbox") and `onPasskey`, the
  WebAuthn call left to the app.
- `SignUpForm`: a name, an email, a password held to its `rules` with a
  `PasswordStrength` under it and a confirmation, and `terms` to agree to; with
  `verifyEmail` it says where the confirmation went.
- `ForgotPasswordForm`, answered the same whether or not the account exists,
  and `ResetPasswordForm`, a new password held to the rules and confirmed,
  then a link to sign in.
- `TwoFactorForm`: a one-time code on ui's `InputOTP`, sent as soon as it is
  whole, with `autocomplete="one-time-code"`; a recovery code instead, a new
  code with `onResend`, and a passkey with `onPasskey`.
- `RecoveryCodes`: the codes left to right, copied together or downloaded as
  a file, and `onConfirm` once the reader says they are saved.
- `PasskeyPrompt`: what a passkey is, one button that runs `onAuthenticate`,
  Retry when it fails, and `onFallback` for another way.
- `PasswordStrength`, `passwordStrength` and `defaultPasswordRules` on their
  own, for a password field of an app's own.

## Collaboration

```tsx
import { CommentThreadList } from "@barqjs/arc";

<CommentThreadList
  threads={threads()}
  currentUser={me}
  mentionables={members()}
  onCreate={(draft) => api.comment(draft)}
  onReply={(thread, draft) => api.reply(thread, draft)}
  onResolve={(thread, resolved) => api.resolve(thread, resolved)}
  onAnchorPress={(thread) => scrollTo(thread.anchor)}
/>;
```

- `CommentThreadList`, `CommentThread` and `CommentComposer`: the comments on
  a document or a record. A thread is an article holding the comment that
  started it and its replies, each with the author's avatar, a `RelativeTime`,
  "(edited)", a dot while unread and its reactions as toggle chips. The quote
  it was started on sits above it as a button to `onAnchorPress`, or says the
  passage has changed once `detached`. Its author edits a comment in place
  (Mod+Enter saves, Escape cancels) and deletes it after `confirm()`; a thread
  resolves and reopens, dimmed while resolved. The list filters open, resolved
  and all with their counts, narrows to one `anchor` behind a chip that lets
  it go, and starts a thread with `onCreate`. The composer sends on Mod+Enter
  and offers `mentionables` after an `@`, chosen with the arrows and Enter,
  each drawn as a mention in the comment. Every change shows at once: a
  handler that returns a promise holds the comment pending until it settles,
  a reply that fails stays with Retry and Discard, and an edit, a delete, a
  reaction or a resolve that fails is taken back and said so. `composer`
  swaps the text box for another: `RichCommentComposer` from
  `@barqjs/arc/editor` writes comments with formatting and mention nodes,
  hands back the same draft, and keeps the editor out of a page that does
  not ask for it.
- `VersionHistory`: the saved states of something, newest first, on arc's
  `List`: each with its author's avatar, a `label` or the author's name, a
  `summary`, a `RelativeTime` and Current on the one in use. The chosen one
  is previewed with `renderPreview`, or compared against the current version
  or the one before it, two previews side by side unless `renderCompare`
  draws the compare (`CodeDiff` from `@barqjs/arc/code` for text). Restore
  asks through `confirm()`, stays pending while the caller's promise runs and
  says so if it fails. Loading rows, an empty state and `onLoadMore` come
  from the list, and the detail sits beside it across a wide container and
  under it across a narrow one.
- `PersonAvatar`: one person's photo, or their initials while it loads or when
  it fails, which `AvatarStack` and the comments draw.
- `ReactionBar`: the reactions on a comment or a message, a pressed chip per
  emoji with its count and who reacted in words, and an add button whose
  menu of `quick` emoji a `picker` replaces (the chat's `EmojiPicker`).
- `PresenceDot` and `PresenceStatus`: whether someone is online, away, not
  to be disturbed or offline, in a tone and a shape so colour is never the
  only sign, `anchored` over an avatar's corner or beside a name in words;
  the status they set, an emoji and a line, until it lapses at `expiresAt`
  by itself. `PresenceProvider` keeps everyone's presence and who is typing
  where from one socket (`websocket` in `@barqjs/primitives`), read with
  `usePresence(userId)` and `useTyping(conversationId)`; each typing report
  lapses when the next does not come, and going offline stops it.
- `MemberInvite`, `PendingInvites` and `InviteLinks`: bringing people in.
  `MemberInvite` is an arc form: addresses typed or pasted as `TagInput`
  chips, each checked as it is added (`validateEmail` adds rules of the
  app's own), a role from `roles`, and Send; the addresses the server
  refuses stay in the field with the reason and the rest are cleared.
  `PendingInvites` lists the invitations not yet accepted with their role,
  who sent them and when, an expired one said so, Resend pending while it
  runs and Revoke asked through `confirm()`. `InviteLinks` lists links to
  join by, each with a copy button, its uses and its expiry and Deactivate
  asked first; `onCreate` adds a form for a new one by role, uses and days.

## Notifications

```tsx
import { NotificationCenter, useNotifications } from "@barqjs/arc";

const feed = useNotifications({ initial: notices(), stream: { url: "/api/notifications" } });

<NotificationCenter
  items={feed.items()}
  onMarkRead={(ids, read) => feed.markRead(ids, read)}
  onMarkAllRead={feed.markAllRead}
  allHref="/notifications"
  preferencesHref="/settings/notifications"
/>;
```

- `NotificationCenter`: the bell in an app's top bar, named with its unread
  count, opening the feed in a popover beside it or a sheet from the bottom
  under a finger, with View all and the reader's settings at its foot.
- `NotificationFeed`: the notifications themselves, on a page or in the
  bell's panel. They are grouped under today, yesterday and the dates before
  (`groupBy` takes `"source"` or `"none"`, and an item's own `group` wins),
  each with its actor's avatar or a toned icon, what happened as a link,
  a line of it, where and when, and its own `actions`. An unread one is
  marked in a dot and in words, opening one marks it read, each toggles read
  and unread, Mark all as read reads them all, and All and Unread filter
  them with their counts. It draws placeholders while `isLoading`, Load more
  with `onLoadMore`, and an empty state, "You're all caught up" for unread.
  `now` and `timeZone` let a server and a hydrating page agree on the day.
- `useNotifications`: the list that new ones are added to as they arrive,
  from an event stream (`eventSource`) or a socket (`websocket`) through
  `@barqjs/primitives`, every message in order, with `markRead`,
  `markAllRead`, `remove` and `replace` for the server's own list.

## Media

- `Image`: a picture that holds its place, loads when it is near and fails
  visibly. The box takes `aspectRatio` from the start, so nothing moves when
  the image arrives; it loads lazily unless `priority`, fades in over a
  blurred `placeholder` (a tiny data URL or a colour), and if it cannot load
  shows `fallback`, an icon and "Image unavailable" in arc's words, keeping
  the image's name. One the browser already had when the page hydrated shows
  at once.
- `Gallery` and `Lightbox`: pictures in a grid as many across as fit
  (`minItemWidth`), each thumbnail a button named by its image that opens the
  lightbox at itself. The lightbox is a modal dialog over the whole screen:
  the arrows and the buttons at either side step through in the reading
  direction, Home and End go to the ends, a swipe does the same under a
  finger, `+` and `-`, the zoom buttons or a double press zoom, a zoomed
  image drags to pan, and "Image 2 of 5" is announced as it changes.

- `MediaPlayer`: audio or video on the browser's own element, with
  controls every reader can use. The seek bar is a slider said as "1 minute,
  5 seconds of 3 minutes, 20 seconds"; volume, speed, captions (each of the
  `tracks`, or off) and `chapters` are menus beside it, with the current
  chapter named, and `transcript` lines under the media follow it, the
  spoken one marked and kept in view until the reader scrolls, each a button
  that seeks to itself. Picture in picture and full screen appear where the
  browser has them. With focus inside, Space or K plays and pauses, J and L
  jump ten seconds, the arrows seek five and change the volume, M mutes, C
  turns captions on and off, F goes full screen, Home and End go to the ends
  and a digit to a tenth of the way. A tap on the picture plays or pauses and
  two on either side jump. The controls run left to right on a right-to-left
  page, as a timeline does, while their menus follow the page, and the
  volume slider gives way to the mute button under a finger.
  `durationText` is the time as `Duration` writes it, for a label of an
  app's own.

- `ClipRecorder`: an audio or video clip recorded in the page. Nothing is
  asked of the browser until the reader presses the button that turns the
  microphone or the camera on; a refusal says how to allow it and offers to
  try again, and a missing device says so. Then a device to choose, the
  camera live or a level meter, an optional `countdown`, and a timer against
  `maxDuration`, where it stops by itself. The clip plays back in a
  `MediaPlayer` with Record again and, with `onAttach`, Use, pending until
  the caller's promise settles. The tracks stop as soon as a recording ends
  and when the recorder unmounts, and a status line tells a screen reader
  when recording starts and how long the clip is.

ui's `Carousel` swipes under a finger, steps with the arrows in the reading
direction and has `CarouselPrevious` and `CarouselNext`; `CarouselDots` adds
the slide picker, a button per slide with the current one marked.

## Inputs and pickers

```tsx
import { Chip } from "@barqjs/arc";

<Chip selected={remote()} onSelectedChange={setRemote}>
  Remote
</Chip>;
<Chip onRemove={() => drop("design")}>Design</Chip>;
```

- `Chip`: a compact label that is plain, an action (`onPress`), held on or
  off as a filter (`selected`), or removable (`onRemove`). A filter chip is a
  toggle button that draws a check as well as its fill, so its state never
  rests on colour; the remove button is its own stop, named "Remove" and the
  chip's words. `tone`, `variant` (`outline` or `subtle`) and `size`
  (`sm` or `md`), and `chipVariants` is the shape every tag in arc wears.
- `EntityPicker`: one or several things a server finds as the reader types,
  people, projects, records, on ui's combobox with its list kept as the
  server answers. Each option has its avatar, a `description` and the words
  that matched marked; the chosen ones stay at the top of the list until a
  search is typed, and with `multiple` they are chips the remove button or
  Backspace takes off. The search waits for the typing to pause and aborts
  the request it replaces; a page with a `next` cursor adds Show more,
  `onCreate` adds Create "…" for text no option has, and past `max` the rest
  are held back with the reason. Searching, nothing found and a failed
  search each say so, and `name` submits the chosen ids. `remoteSearch` is
  the same debounced, aborting, paging search for a control of an app's own,
  and what `CommandMenu`'s sources run on.
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

- `CurrencyField`, `PercentField` and `UnitField`: a number written and read
  in the locale, on `@barqjs/aria`'s number field: `$1,234.50` in a
  `currency`, `25%` held as `0.25`, `12 kg` in a `unit` as
  `Intl.NumberFormat` names it. Typed with the locale's separators and
  digits, stepped by the arrows and by − and + buttons a finger can reach
  (`hideSteppers` leaves them out), and `field.CurrencyField` and the rest in
  a form.
- `PhoneField`: a region, listed by its name in the locale with its calling
  code, and the number as it is dialled there, held in E.164
  (`+201001234567`). A number typed or pasted with a `+` picks its own
  region; the input brings up the dial pad and the browser's autofill, and a
  number too short or too long to dial says so when the field is left.
  `parsePhone` and `formatPhone` are the same reading and writing on their
  own.
- `Rating`: a score in stars, as a radio group with each star named ("3
  stars"), the arrows choosing in the reading direction and the stars under
  the pointer filling as a preview; `allowClear` takes a score back.
  `isReadOnly` shows a score, a fraction included, as one image read "Rated
  3.5 out of 5".
- `RangeSlider`: a low and a high value on one track, the two thumbs named
  "Minimum" and "Maximum" before the label, the range written beside it in
  the locale with `formatOptions`, and the ends kept from crossing.
- `RadioCards` and `CheckboxCards`: a few options, each a card with a title,
  a line about it and an icon, the whole card the press target. One Tab stop
  for the radios with the arrows choosing, a checkbox per card for the
  other; the cards drop to fewer columns as the room narrows, to one on a
  phone (`minCardWidth`).
- Files:
  - `FileDropZone`: files dropped, pasted or picked, with a button that opens
    the picker, which is the way in on a touch screen. Each is held to
    `accept`, `maxSize` and `maxFiles`, and the rest are listed under the
    zone with why and announced.
  - `useUploadQueue`: files sent `concurrency` at a time through the caller's
    `upload(file, { onProgress, signal })`, cancelled (the request aborted),
    retried or removed one by one.
  - `UploadQueue`: that queue as ui attachments, a thumbnail for an image, a
    bar while it uploads, the size in the locale, and cancel, retry and
    remove named after the file.
  - `FileUpload`: the zone and the queue together.

- `ImageField`: a picture chosen, cropped and uploaded, an avatar (`shape`
  `"avatar"`, round) or a logo or cover (`"image"`). Empty, it is the
  `FileDropZone`, its button the way in on a touch screen, and the type and
  `maxSize` (5 MB) are checked before anything is sent. A picture opens in a
  crop dialog, a sheet on a phone: it is dragged, moved by the arrow keys and
  zoomed by `+`, `-`, the wheel or a slider under a frame of one of
  `aspects`, round for an avatar, and the frame stays covered. The crop goes
  through arc's upload queue to the caller's `upload`, its progress shown,
  cancelled or retried, and the URL it resolves with is the value. Once set,
  Change and Remove sit beside it, and `onChooseFromLibrary` adds a picture
  already uploaded. `crop={false}` sends the file as it is. `ImageCropper` is
  the crop on its own, and `cropArea` and `cropImage` the arithmetic and the
  canvas behind it.

## Form fields

```tsx
import { CheckboxGroupField, RepeaterField, SlugField, fieldRules } from "@barqjs/arc";

<form.AppField name="slug">
  {(field) => <field.SlugField label="Address" source={name()} prefix="acme.app/" />}
</form.AppField>;
```

Each is `field.*` inside `form.AppField` and holds its own value with
`value`, `defaultValue` and `onChange` outside one.

- `TextField` and `TextareaField` take the direction of what is typed, so
  Arabic reads right to left in an English form; an empty one keeps the
  page's. `textDirection` is the rule, the first strong letter's.
- `IdentifierField`: a name rewritten to a `convention` as it is typed
  (`upper-snake`, `snake`, `kebab`, `filename`), the caret kept and the rule
  said under it. `TagInput` takes `line` for a short list typed as one
  comma-separated line, normalised and checked when left.
- `SlugField`: follows `source` until typed over, steps past `taken`
  (`acme-2`), asks `checkAvailability` once typing pauses, shows a URL
  `prefix`, and with `collapsed` reads as "Its address is …" with Change.
  `slugify` and `freeSlug` are the rules.
- `SuggestionField`: free text with values in use offered under it; a new
  one is as good as a listed one.
- `InlineEdit` and `InlineSelect`: a value edited where it is read. Enter or
  leaving saves, Escape puts it back, a promise holds it pending and a
  rejection keeps the reason; the select keeps a value that left its
  options and offers `noneLabel`.
- `SelectField` options take a `hint` the trigger leaves out and a `group`;
  `noneLabel` adds an option holding `null`, and a saved value no longer
  listed stays one.
- `CheckboxGroupField` and `RadioGroupField`: options as rows with a line and
  a `caveat`, in a column, a wrapping row or a grid. The checkboxes hold the
  options' order, keep a held value the list lacks, take `shortcuts`, can be
  switches, and with `isRequired` ask for one once touched or submitted.
  `RadioCards` and `CheckboxCards` take a full-bleed `media` per option.
- `ChecklistField`: a bordered list of checkbox rows with what each carries
  at its end, a search past `searchable` rows that counts what it leaves, a
  free entry with `onAdd`, and a summary or a warning under it.
- `ThemePicker`: light, dark and system as cards drawing each theme small,
  or `segmented`; it sets the provider's scheme and tells `onChange`.
- `OptionalLimitField`: a limit inside a sentence, switched off to `null`
  (or blank meaning none with `mode="blank"`), its number restored when
  switched back on. `PairedNumberField`: two numbers held as one pair, `null`
  when both are empty, one error line when only one is filled.
- `ColorField` and `ColorPicker` take `contrastWith`, colours the choice
  must read against, warning with the WCAG ratio; `contrastRatio` is it.
- `OptionGroup`: options folded under a title and a summary of what they
  are set to, its fields mounted while shut, opening and saying so when one
  named in `fields` takes an error.
- `fieldRules` and `FieldRule`: fields shown, disabled with a reason or
  bounded by the others, declared once; `prune` drops what the rules hide
  before it is saved.
- `RepeaterField`: rows of the same fields on a form array, added, removed
  and moved through the array field so errors move with them, every button
  named after its row and focus following. `StepSequenceEditor`: steps in an
  order that matters as cards that fold, each header its number, `title` and
  `summary` and buttons that move, duplicate and remove it, a new step
  opening and taking focus. `OrderedMemberList`: people in an order, a
  rotation's turns, numbered, moved by buttons or a drag, removed, and added
  from a search that leaves out those already listed. `CollectionField`: a table of
  sub-records, cards on a phone, each added and edited in a sheet with a form
  of its own.
- `AddressFields`: an address laid out as its country writes it, its region
  and postal code named as there, each input with its autofill token and a
  `section` keeping two addresses apart.
- `FileField`: files sent as they are picked, held as what the server
  stored; the form cannot submit while one is on its way and says why.

## Actions

```tsx
import { ActionBar, IconButton, SplitButton, Toolbar } from "@barqjs/arc";

<IconButton label="Delete" onPress={remove}>
  <Trash2 />
</IconButton>;
<SplitButton onPress={send} actions={[{ id: "later", label: "Send later", onAction: schedule }]}>
  Send
</SplitButton>;
```

- `IconButton`: a button that is an icon, its `label` required: the label
  names it and shows as a tooltip on hover and keyboard focus, with a
  `shortcut` beside it. The tooltip only repeats the name, so a touch screen
  loses nothing.
- `SplitButton`: a default action and its alternatives in one control, two
  buttons welded by ui's `ButtonGroup`, each its own stop; the arrow opens a
  menu of `actions`, a destructive one drawn as such.
- `ActionBar`: a page's or a record's actions in a row that keeps the most
  important in view as it narrows, moving the rest into a More menu by
  `priority`, on `@barqjs/aria`'s action group: one Tab stop, the arrows in
  the reading direction, and ui's menu for what collapsed.
- `Toolbar`: controls that Tab enters once, on `@barqjs/aria`'s toolbar, the
  arrows moving between them and coming back to the last one used.
  `floating` is a pill over the content; `docked` is a bar along a pane's
  bottom that holds to the bottom of a compact screen, clear of the home
  indicator. `ToolbarSeparator` divides it.

ui's `ToggleGroup` is the toggle button group: single or multiple, on
`@barqjs/aria`'s toggle group, with the arrows in the reading direction.

## Overlays

- `Tearsheet`: a large task in a layer over the page, the whole screen on a
  phone and nearly all of it on a wide one, rising from the bottom so the
  page it came from shows above it. A heading, a body that scrolls, an
  `influencer` panel at the start for steps or filters (hidden on a compact
  window), and actions at the foot clear of the home indicator. A press
  outside does not close it unless `isDismissable`, and like `DetailSheet`
  its open state can be a search parameter's.
- `ResponsiveOverlay`: one overlay that is what the screen suits: a dialog,
  or with `desktop="popover"` a popover beside its trigger, on a wide screen
  with a mouse, and a sheet from the bottom, dragged down to close, below
  `breakpoint` or under a finger at any width. The same heading, body,
  footer and open state in each; a server and a hydrating page draw the wide
  one. `useCompactOverlay` is the same question for an app's own overlay.
- `DockedPanels` and `DockedPanelToggle`: a page with one panel docked
  beside it at a time (details, comments, an assistant), which the page
  makes room for rather than sitting under. The panel is a named landmark,
  not a dialog, so the page stays in reach; its edge is ui's resizable
  handle, which the arrows move and Enter folds, and its width is
  remembered under `storageKey`. A toggle is pressed while its panel is
  open and carries its `count`; the close button or Escape inside the panel
  closes it and gives focus back to its toggle. A panel's `footer` stays
  pinned under its content. Below `breakpoint` (`lg`) or under a finger the
  panel is a sheet over the page instead.
- `InlineAlert` and `Banner`: a message in a tone with its icon, a `title`,
  `actions` and, with `onDismiss`, a button that hides it. `InlineAlert`
  sits in the content with an edge and a corner; `Banner` runs across the
  top of a page, its actions beside the message on a wide screen and under
  it on a narrow one. A danger interrupts a screen reader and the other
  tones wait their turn, which `live` overrides. (ui's `Alert` has the
  default and destructive looks alone.)
- `Tour`, `Coachmark` and `Spotlight`: a guided sequence of notes, each
  pointing at a part of the page (`target`, a selector or a function) with
  the page dimmed around it. A coachmark is a dialog beside its target named
  by its title: focus moves in and goes back after, Next, Back and Skip are
  buttons, Escape skips the rest, and a press elsewhere does not end it. Each
  target is scrolled into view, at once under reduced motion, and a step
  whose target is not on the page is passed by. `useTourProgress(key)`
  remembers in `localStorage` whether a tour was seen and where it was left,
  so it shows once and a reload resumes it.

## Feedback and states

```tsx
import { ActionMenu, EmptyState, StatusPage, confirm, openModal, useAction } from "@barqjs/arc";

const answer = await confirm({
  title: "Delete the role?",
  tone: "danger",
  confirmLabel: "Delete role",
  field: { kind: "select", label: "Move its holders to", options: roles },
  action: (role) => api.deleteRole(id, { moveTo: role }),
});

<EmptyState kind="filtered" onClearFilters={clear} />;

export const Route = createFileRoute("/checks/$id")({
  errorComponent: (props) => <ErrorPage error={props.error} reset={props.reset} />,
  pendingComponent: () => <PageSkeleton template="record" />,
});
```

- `confirm()` with `field` resolves `{ value }` or `null`: a checkbox ("Also
  delete its runners"), a choice ("Move its holders to") or words (`kind:
  "text"`, the reason for an audited change, required unless `optional`).
  `typeToConfirm` holds the button until a name is typed, the name set apart
  in the label wherever the language puts it. `details` draws what is lost.
  `action` runs inside the dialog: the buttons pend, Escape waits, and a
  failure stays in the question as the server's words made a sentence.
  `dependents` loads what depends on the thing as the dialog opens ("Checking
  what depends on it…"); blockers refuse the action in a list of links with
  an "and N more" tail, and otherwise the affected and the `fallback` they
  read are named.
- `ActionMenu`: the `•••` menu of a row or a record, its regular actions
  first and its destructive ones after a separator, each of those confirmed
  naming what it removes and run inside the question. A regular action's
  failure is a toast; its items are 40px on a phone.
- `defineModal`, `openModal`, `preloadModal` and `ModalHost`: a modal named
  once with how its component is fetched, opened by that definition from
  anywhere, resolving with what it `resolve`s or `undefined` when dismissed.
  The component draws its own overlay from `modal.isOpen()` and
  `modal.onOpenChange`. Opening the modal on top again joins it, a slow fetch
  shows a busy dialog and a failed one a Retry, a change of path dismisses
  all but `keepOnNavigation` ones, and the host lets one go after its exit.
  `ArcProvider` renders the host.
- `ResponsiveOverlay` and `Tearsheet` take `param`, so a link to `?create`
  opens them, their trigger still opens them, and closing takes the
  parameter and `clearParams` out of the URL with a replace. `useOpenParam`
  gives any dialog the same. `Tearsheet size="full"` covers the screen for an
  editor, its `actions` in a bar across the top whose close button comes
  first, where focus starts.
- `useAction` and `ActionError`: a mutation's pending state, its success
  toast and its failure, a toast or, with `inline`, an alert where it
  happened. `serverProblem`, `serverMessage`, `serverErrors` (for
  `setServerErrors`), `serverErrorKind` and `routeError` (a 404 as the
  router's not-found) read an API's error, whatever shape it threw.
- `EmptyState` kinds: `filtered` ("No matches", with Clear filters from
  `onClearFilters`), `restricted` (naming who grants access from
  `grantedBy`, joined in the locale), `done`, and the plain `empty`.
- `SuccessState`: the end of a flow that worked, a tick in the success tone,
  numbered next steps, actions and a help line, announced politely.
- `StatusPage`, `ErrorPage` and `NotFoundPage`: a whole page for not found,
  forbidden, gone, signed out, offline, unreachable and failed, with the code,
  a first heading and the way out the kind allows: home and back, signing
  in, or Try again. `ErrorPage` reads the kind off the error a route threw,
  and keeps an unforeseen failure's code and message behind Details.
- `PageSkeleton`: a list, record, form, dashboard, settings or review page
  while it loads, a busy status named "Loading".
- `Value`: a value that may legitimately be absent, the absence in arc's
  words (`never`, `none`, `notSet`, `noLimit`, `nobody`) or the caller's
  (`absentText`), "Not recorded" otherwise, and a dash read "Not applicable".
- `Countdown`: time left to `to`, or elapsed since `from`, a `timer` that
  tones at `warnAt` and `dangerAt`, tells a screen reader how long is left
  once a minute and as each threshold passes, says time is up and calls
  `onExpire` once. `now` lets the server and the hydrating page agree.
- `SessionExpiryWarning`: within `warnWithin` of the end, a warning with the
  live countdown and Keep alive (idle) or Extend (at the limit); once ended, a
  danger alert.
- `LifecycleNotice` and `RestoreButton`: the strip on an archived or deleted
  item (who, when, when it is purged, and Restore), and a Restore button
  named for its row. Archiving and deleting ask through `confirm()`.
- `useDocumentWorkflow` and `DocumentWorkflowBar`: a document reviewed in
  stages (draft, in review, completed), Start while there is none, Publish
  held while anything is unsaved, and completed locking the editor that reads
  `locked()` until it is set back.

## Charts

```tsx
import { ComboChart, DonutChart, Gauge } from "@barqjs/arc";

<DonutChart
  label="Checks by state"
  data={[
    { key: "up", label: "Up", value: 42, tone: "success" },
    { key: "down", label: "Down", value: 3, tone: "danger" },
  ]}
  centreLabel="checks"
/>;

<ComboChart
  label="Runs and failure rate"
  data={days}
  x="day"
  bars={[{ key: "runs", label: "Runs" }]}
  lines={[{ key: "rate", label: "Failure rate", tone: "danger" }]}
  dualAxis
/>;

<Gauge label="Storage" value={72} thresholds={[{ value: 80, tone: "warning" }]} />;
```

The charts `@barqjs/ui` lacks, drawn the way its `ChartBars` and
`ChartLines` are: TanStack Charts inside ui's `ChartContainer`, so a series is
`--color-<key>` and a theme or a `tone` restyles it with no rebuild, the
server writes the drawing and the browser adopts it, and ui's `ChartTooltip`
and `ChartLegend` work beside every one. The arrow keys walk the points, and
the tooltip, a live region, reads each. Every chart's numbers are also a
table captioned with its `label`, which `table` keeps for a screen reader
(`"hidden"`, the default), puts behind a button (`"toggle"`) or shows
(`"visible"`); the numbers are written in the locale with `formatOptions`.
The drawing takes its box's width and its aspect ratio's height, or
`height`; a chart is not mirrored right to left, its table and legend are.

- `DonutChart`: part of a whole, with the total or `centreValue` in the hole
  and each slice's share in the table.
- `ComboChart`: bars, grouped or `stacked`, and lines over the same columns;
  with `dualAxis` the lines read a second scale at the end. A line may be
  `dashed` (a p95 beside its p50), dashed in the legend too. `references`
  are dashed rules to read the series against (a budget, a target) and
  `bands` faint ranges (a healthy range), each named in the legend. A line's
  `status` field names a point's status from `statuses`, a dot in its tone
  named in the legend, the tooltip and a Status column of the table.
  `annotations` are numbered on the plot, at a value or down a column, and
  listed under it. `yTicks="nice"` ticks from zero on a round step, and
  `yFormat` writes them as counts, durations or percentages in the locale.
  `legend="filter"` is a `LegendFilter`, with `hidden` the caller's.
- `ScatterChart`: two measures a point per record, coloured by a `group`
  field; with `size`, bubbles whose area follows a third.
- `FunnelChart`: stages centred on one line, narrowing toward the outcome,
  each with its value and its share of the first written at its end.
- `Heatmap`: a number over two categories as cells in `steps` shades from
  the muted fill to a tone, with a key from fewer to more.
- `Gauge`: one reading against its range, a meter on `@barqjs/aria` whose
  name, range and reading a screen reader hears, its tone changing at each of
  `thresholds`.
- `Sparkline`: a trend with no axes, as a line, an area or bars, its numbers
  in words; `domain` keeps a column of them on one scale. `StatCard` draws
  its trend with one.
- `ChartDataTable`: the table every chart draws, on its own beside one of
  ui's charts.
- `LegendFilter`: a legend that is also the filter, a toggle chip per series
  or kind, pressed while shown, with a check as well as its swatch. In a
  narrow box the chips fold into one button whose menu holds the same
  choices as checkboxes, says how many are shown and shows all again.
- `niceTicks` and `useAxisFormat`: three or four round steps from zero past
  a maximum, so every label is distinct at any scale, and the words for
  them in the locale: counts compact past ten thousand, durations in ms or
  in seconds with the decimals the step needs, percentages.

ui's `ChartBars` and `ChartLines` already have a legend and a tooltip, so arc
adds no presets over them; `ComboChart` covers stacked bars.

## Metrics and meters

```tsx
import { Meter, SegmentedBar, TallyProgress, UptimeBar, UsageList } from "@barqjs/arc";

<UsageList
  aria-label="This month"
  items={[
    { key: "minutes", label: "Browser minutes", used: 412, limit: 500 },
    { key: "checks", label: "Checks", used: 38, limit: null },
  ]}
/>;

<TallyProgress
  label="Tests finished"
  total={50}
  segments={[
    { key: "passed", label: "Passed", value: 40, tone: "success" },
    { key: "failed", label: "Failed", value: 3, tone: "danger" },
  ]}
/>;

<UptimeBar label="API" cells={days} startLabel="90 days ago" endLabel="Today" />;
```

Small readings that sit in a card, a row or a header, each said in words
so neither a bar's length nor its tone is the only way to tell it.

- `Meter`: a reading against its range as a bar, the `Gauge`'s linear
  sibling: a meter on `@barqjs/aria` named by its label, its reading written
  beside it and read as written ("412 of 500"), its tone changing at each
  of `thresholds` (`gaugeTone`).
- `UsageList`: what is used against what is allowed, a `Meter` each. An item
  turns to a warning from `warnAt` of its limit and to danger at it, and
  says so in words ("Near the limit", "Over the limit"); a `null` limit says
  "no limit" and draws no bar. `usageState` is the rule on its own.
- `SegmentedBar`: a whole split into shares in tones, a request's phases or
  storage by kind, with a legend counting each (or giving its share); a
  larger `total` leaves the rest of the track empty. Without its legend it
  is an image whose name says every share.
- `TallyProgress`: progress through a batch split by how each finished: a
  progress bar reading "43 of 50 finished" (or "All 50 finished"), filled
  by outcome over the empty track of those to come, with a count each.
- `UptimeBar`: how something held up, a cell a day or a run in a tone, with
  the share up beside its name and an optional key. The cells are one Tab
  stop: the arrows (in the reading direction), Home and End walk them, and
  the cell under the pointer, a finger or the focus shows its day, state,
  share and notes in a tip, which each cell's name also says.
  `uptimeState` and `thresholds` place a share.
- `SignalMeter`: a connection's quality as four bars, a meter reading its
  level in words ("Fair"), the level beside it with `showLabel`.
- `MetricRating`: how a measure reads, a `Status` saying "Good", "Needs
  improvement" or "Poor" in its tone; `rateMetric` places a value between
  bounds, lower or higher better as they run.
- `StagePath`: where a record stands along its stages, behind it ticked and
  said completed, its own filled and current, those ahead plain, the
  chevrons pointing the reading direction's way; an `outcome` shows where
  and how it left the path. It only reads (`Stepper` is the path a person
  walks) and scrolls sideways where the stages do not fit.
- `CountUp`: a figure that counts up as it scrolls into view. The server
  and the hydrating page write the final figure, reduced motion keeps it,
  and a screen reader reads the final figure once.

## Code

```tsx
import { CodeBlock, CodeDiff, CodeEditor, TerminalBlock } from "@barqjs/arc/code";

<CodeEditor label="Query" language="sql" value={query()} onChange={setQuery} />;

<TerminalBlock code={"bun add @barqjs/arc\nbun run dev"} />;

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
  `markdown`, `python`, `xml`, `yaml`, `sql`, `shell` and `toml`, with
  aliases such as `ts`, `yml` and `bash`. `registerLanguage` adds an app's
  own, a legacy mode included, and `language` also takes a `LanguageSupport`
  built by hand.
- Marked lines and excerpts: `marks` on `CodeBlock`, `Highlight` and
  `CodeEditor` gives lines a tone's fill, a rule and a label a screen reader
  hears; `range` (`rangeAround(code, line)` makes one) shows only those lines,
  numbered as in the file, and the copy holds what is shown. `folding` puts a
  fold gutter in `CodeEditor`, with its keys. `highlightLines` is the
  highlighting one line at a time.
- `TerminalBlock`: commands with a prompt neither a copy nor a screen reader
  picks up, continued lines set under them, and with `transcript` what the
  commands printed, faint and left out of the copy.
- `highlighter="light"` on `CodeBlock`, `Highlight` and `TerminalBlock`
  colours shell, TOML, YAML, JSON and TypeScript with patterns into the same
  token classes and loads no grammar, for a marketing page.
- `CodeTabs`: the same thing done several ways, a tab each, plain code or
  terminal commands, with a note above. `group` shares the choice between
  tab sets and remembers it. The code is the caller's, so options that
  rewrite a command are its state; `shellQuote` quotes a value that needs it.
- `languageForContentType` picks the language of a body from its type or how
  it starts, and `prettyJson` indents what parses and returns what does not.
- Completion: `tokenCompletions` offers names after a trigger (`{{`,
  `process.env.`), tagged by kind, closing what it opened. `codeIntelligence`
  takes a language service (completion with docs, hover, diagnostics with a
  gutter); `workerIntelligence` answers it from a worker started on the first
  request, and `@barqjs/arc/code/worker` has the worker's half,
  `serveIntelligence`, and `typescriptIntelligence` over a TypeScript
  environment such as `@typescript/vfs` builds. A failed answer is an empty
  one, so editing never waits on it.

From `@barqjs/arc` itself, with no CodeMirror:

- `ConsoleLogView`: levelled lines with time, level in words and source,
  filtered by level and text, following the newest line while `live`,
  colour codes drawn, a JSON line opened in place, redactions drawn as
  `RedactedText` draws them, and only the lines in view drawn in a long log.
  `height` is the whole log's, its toolbar included, and `100%` fills a
  container that has one, a resizable panel's.
- `JsonSchemaFields`: a JSON Schema's fields to read, required first, each
  with its type in words, values and default; nesting and `oneOf` variants
  open in place and a cycle ends. `jsonSchemaExample` writes a value shaped
  like it.
- `TemplateTokenField`: text that references variables and secrets as
  `{{NAME}}`, offering the names after `{{` and warning about one it does
  not know.
- `SnippetValuesProvider`: values snippets show, the server's examples first
  and the reader's own (`resolve`, `readerOrigin`) once the page is live;
  `useSnippetValues` reads them and `SnippetValue` writes one in a sentence.

The colours are the theme's `code-*` tokens and the metrics are custom
properties (`--code-font-size`, `--code-line-height`, ...), so light, dark and
an app's brand restyle a live editor with no reconfigure.

## Workbench panels

```tsx
import {
  CheckResults,
  ProblemsPanel,
  ShareDialog,
  StatusBar,
  TestResults,
  Workbench,
  problemCounts,
} from "@barqjs/arc";

<ProblemsPanel problems={problems()} onSelect={(location) => openAt(location)} />;

<TestResults
  tests={tests()}
  running={running()}
  onRun={(id) => runner.run(id)}
  onRunAll={() => runner.runAll()}
  onRerunFailed={(ids) => runner.run(...ids)}
  onSelect={(location) => openAt(location)}
/>;

<StatusBar
  problems={problemCounts(problems())}
  onProblemsClick={() => setPanel("problems")}
  tasks={[{ id: "build", label: "Building", progress: 0.4 }]}
  cursor={{ line: 12, column: 5 }}
  language="Toy"
/>;

<ShareDialog state={workspace()} trigger={<Button>Share</Button>} />;

<Workbench bar={<Toolbar>…</Toolbar>} status={<StatusBar language="Toy" />}>
  <ResizablePanelGroup orientation="vertical">…</ResizablePanelGroup>
</Workbench>;
```

What sits around an editor, none of it tied to a language or a tool. A place
in a document is a `SourceLocation`: a `uri`, and a `line` and `column`
counted from 1 as a gutter counts them (a language server's are one less),
with an optional end. Every panel answers with one, so the app decides what
going there means: switching tabs, scrolling an editor.

- `Workbench`: the frame of an app that is one screen, an editor's or a
  dashboard's: a `bar` along the top in a `<header>`, the `status` (a
  `StatusBar`) along the foot in a `<footer>`, and the rest filled by its
  children, a grid cell with no minimum size, so a `ResizablePanelGroup`
  fills it, and a `ConsoleLogView` with `height="100%"`, or a `CodeEditor`
  or a panel given `place.fill`, fills its panel and scrolls there instead of
  growing the page. `fill="viewport"` is the
  screen's height and the middle is the page's `<main>`; `fill="parent"`
  takes its container's height for a workbench inside a page, whose middle
  is then a region named by `aria-label` (`landmark` overrides either).
  `AppShell` is the frame for an app of pages beside a navigation.
- `ProblemsPanel`: `Problem`s (a severity, a message, a `source` and `code`,
  `related` places) grouped under their document, documents in `uri` order
  and each one's problems in the order they appear. Counts per severity
  filter it, and so does a search; documents fold (`collapsed`). It is
  `@barqjs/aria`'s tree, so Enter or a press on a problem, or on a related
  place, calls `onSelect`. `problemCounts` counts a list for anything else.
- `TestResults`: a tree of suites and tests (`TestNode`), each with its
  status in words and its time; a suite's status comes from its tests.
  Choosing a test shows its result beside the tree: the failure's message,
  its trace, and `expected` against `actual` in `CodeDiff`, which loads the
  first time a failure has both, so a page with no failures carries no
  CodeMirror. Each row has a run button (`onRun`), the toolbar Run all,
  Rerun failed and, while `running`, Stop; the counts filter by status.
  Enter, or Go to source, calls `onSelect` with the failure's place.
- `CheckResults`: what a prover or a property checker concluded, a check at
  a time: proved, falsified with the counterexample that breaks it (each
  value written as JSON in a `DescriptionList`), unknown, error or timeout.
  `verdicts` renames one or adds the checker's own with a tone and an icon;
  counts filter by verdict and a search by name. A name with a place is a
  button that calls `onSelect`.
- `StatusBar`: the strip along a workbench's foot. Problem counts (a button
  with `onProblemsClick`), background `tasks` with a bar or a spinner, the
  `cursor`, the `language` (a button with `onLanguageClick`), and the
  caller's own `StatusBarItem`s at `start` and `end`. On a narrow bar the
  cursor, the language and every `priority="low"` item step aside and a task
  keeps its bar without its words, by container query. It is not a live
  region, so a caret that moves on every key does not talk over the typing.
- `ShareDialog`: a link that opens what the reader has now. `state` is
  compressed into the link's hash by `@barqjs/primitives`' `urlStateLink`
  (`deflate-raw`, base64url) when it opens and, unless `updateAddress` is
  off, written into the page's own address; the page reads it back with
  `readUrlState`. The link is shown with its length and how far the state
  shrank, copied with `CopyButton`, with a warning past `maxLength`. A dialog
  on a wide screen and a sheet on a phone.

## Rich text

```tsx
import {
  BlockEditor,
  ChatComposer,
  MentionTypeahead,
  RichTextEditor,
  RichTextRenderer,
  SlashCommandMenu,
} from "@barqjs/arc/editor";

<RichTextEditor
  label="Description"
  defaultMarkdown={task.description}
  onChange={(value) => setDraft(value)}
  upload={(file, { onProgress, signal }) => api.upload(file, onProgress, signal)}
  maxLength={5000}
  autosave={{ save: (value) => api.save(task.id, value) }}
>
  <MentionTypeahead source={(query, { signal }) => api.people(query, signal)} />
  <SlashCommandMenu />
</RichTextEditor>;

<RichTextRenderer value={comment.body} size="sm" />;
```

The rich text suite is Lexical, through `@barqjs/lexical`, in an entry of its
own: an app that never edits rich text loads none of it, and a test walks
the import graph to keep it so. A document is Lexical's JSON, the same in
the editor, the renderer and on a server.

- `RichTextEditor`: a toolbar that shows what the selection already is (text
  style, the marks, a link, lists, a quote and a code block, alignment,
  indent, undo and redo, and Insert), on arc's `Toolbar`, folding whole
  groups into a More menu as it narrows, the least used first; the marks
  over selected text, below it on a touch screen where the system's menu is
  above, which Alt+F10 reaches; a link popover on Mod+K that checks the
  address; markdown typed (`# `, `- `, `**bold**`) and read and written;
  code blocks highlighted as `CodeBlock` highlights them; tables, sized on
  insert from a grid that lights up to the size (`TableSizePicker`, also
  `/table`'s), with a button at the cell's corner for rows, columns and the
  header row, and the column's edge beside the caret dragged, or moved with
  the arrow keys, to resize it, the widths kept in the document; images
  pasted, dropped or chosen through `FileDropZone`, each shown at once and
  uploaded through arc's queue with its progress, retry and remove, and
  their alt text and caption edited in a popover from a button under them; embeds
  from the sites `embeds` allows (YouTube and Vimeo by default); a counter
  against `maxLength`, said once it is past it; a placeholder; `readOnly`;
  `autosave`, which saves as typing pauses and on blur and says so; and
  `collaborative`. A server writes the opening document inside the
  editable box, drawn by the renderer as the editor draws it, and the
  editor takes the box over once the page has hydrated, so the text is
  there from the first paint and nothing moves as it turns editable.
  `ChatComposer` does the same for a message being edited. Each block takes the direction of its own text, so
  Arabic and English sit in one document each the right way round, and the
  document as a whole reads in its `language`'s direction, or its first
  letter's: a line of digits or an empty line follows it. `validate` checks
  each change (a refused one is not handed to `onChange`, and the box says
  why under it, `onValidityChange` told), `autoFocus` takes the caret,
  `historyLimit` caps undo (200 steps by default), and `replaceDocument`
  puts a whole document in as one edit, `quiet` for one the caller already
  holds. The bar over selected text starts with Turn into, stays away from
  code and from a selection still being drawn, and over a block chosen
  whole offers Duplicate and Delete, reached by Tab.
- `MentionTypeahead`, `SlashCommandMenu` and `EmojiShortcuts`: what `@`, `/`
  and `:` offer, on Lexical's typeahead with arc's menu: people from a list
  or a server's debounced search with their avatars, inserted as a mention
  node carrying the id; commands ranked as more is typed and grouped while
  nothing is (the editor's own by default, `editorCommands` to build on);
  and emoji by name from the chat entry's data.
- `RichTextRenderer`: a document drawn without an editor, for a message
  list or a comment: stored JSON or markdown, read by Lexical's headless
  editor and drawn as plain elements under `Prose`, so a server writes it
  whole and a hydrating page adopts it. `headingOffset`, `renderMention`
  and `linkHref` fit it to the page it is on.
- `BlockEditor`: a page-like document a block at a time. Beside the block
  under the pointer or the caret sit a `+` that opens a searchable, grouped
  picker and a grip that drags the block by pointer or by finger and opens
  Turn into, Duplicate, Move up, Move down and Delete; Mod+Shift with the
  arrows (or Alt+Shift with them) moves a block, each move announced, Mod+D
  duplicates it, and a right click on a block or Mod+/ opens its menu, whose
  Turn into also makes a callout or a toggle and takes one apart. The
  picker's group chips jump to a group. Typing with a block chosen whole
  starts a line after it. The gutter is at the start of
  the line, on the right in a right-to-left document. An empty block says
  what it is for, faint: the caret's empty line, and every empty heading,
  quote, list item and code block, a toggle's title and a callout of one
  line; `blockPlaceholders` changes the words or, `false`, turns them off.
- `defineBlock`: a block of an app's own, built from arc's pieces, which
  the pickers offer and the document stores as `{ type, data }`, passed in
  an editor's `extensions`; its
  component draws it in the editor and, read-only, in the renderer, and
  `toMarkdown` and `fromMarkdown` give it a line of markdown, and `fromHtml`
  and `toHtml` its HTML.
- `ChatComposer`: a compact editor that sends on Enter (Shift+Enter breaks
  the line, and Enter in a list, a quote or a code block stays there), with
  mentions, commands, emoji and an `EmojiPicker` button, attachments
  uploaded into a tray above the actions, the formatting toolbar on
  request, `mode="edit"` for a message already sent (`MessageEditor` is
  that mode opened on a `ChatMessage`, for a list's `renderEditor`: Enter
  saves, Escape cancels and focus goes back to the message), and `sendActions`
  such as Schedule send beside Send. On a phone it keeps to a third of what
  the keyboard leaves.
- `EditorCollaboration`, from `@barqjs/arc/editor/collaboration`: a
  `collaborative` editor on a shared Yjs document, the others' cursors in
  arc's tones picked from their names. Yjs loads only with it.
- `markdownToDocument`, `documentToMarkdown`, `documentToText`,
  `htmlToDocument` and `createDocumentEditor` convert and read documents with
  no screen, with mentions written `[@Name](mention:id)`.

### Blocks a document holds

The document preset, which `RichTextEditor` and `BlockEditor` open with,
holds these beside rich text, tables, dividers, images, embeds and mentions.
Each keeps the stored shape a document written elsewhere already has.

- Callouts: a box of blocks in a tone (neutral, information, success,
  warning, danger) chosen from the block menu, `role="note"`, written in
  markdown as a `> [!tone]` alert and read back. Backspace at its start
  unwraps it, and Enter on its empty last line or the arrows at its edges
  leave it.
- Columns: two to four, equal or a narrow and a wide, side by side while each
  keeps a readable width and stacked on a phone. The block menu changes the
  layout, moving a lost column's blocks into the last one kept.
- Toggles: a title that opens and closes the blocks under it, open or closed
  as saved. A press on its arrow or Mod+Enter in the title flips it, said to
  a screen reader; Enter in the title goes into its content. The renderer
  draws `<details>`, and `<details>` in HTML or markdown reads back as one.
- Panels: a set of titled parts read as tabs, numbered steps, a timeline,
  flip cards or choices between paths, at most twelve. Enter goes from a
  title to its body, from an empty last line to the next part and from an
  empty last title out of the set; the block menu shows the set another
  way, every part kept, and adds a part. The renderer draws them with ui's
  `Tabs` (the arrows follow the reading direction), arc's `Timeline` (steps
  numbered in the reader's digits), cards whose front is one button, and
  choices that show the path taken with a way back; `PanelsView` draws an
  app's own parts the same way, and `panelsExtension({ class, classes,
  renders })` restyles every set a renderer draws. Markdown and HTML keep a
  set as `<section data-panels>`.
- Shared blocks: a block kept once and shown in many documents, stored as
  `{ type: "shared", sharedId }`. `sharedBlockExtension({ source })` takes
  the app's `SharedBlockSource`: a `View` that draws one as it now is,
  `choose` for the `/shared block` command, `keep` for the block menu's
  Keep as a shared block, `edit` and `read` for the editor's Edit
  everywhere and Copy here. Without a source a document still opens and
  keeps the ones it holds.
- Formatting past the marks: superscript (Mod+.) and subscript (Mod+,),
  text colour and highlight from nine colours on arc's `ColorSwatches`,
  small, large and huge text, a yellow highlight on Mod+Shift+H, clear
  formatting on Mod+\, all over selected text and kept from pasted HTML.
- Tables worked on in place: a grip on every row and column to choose it,
  drag it or move it with Alt and the arrows; rows and columns moved,
  header row and column, cells merged, split, coloured and aligned both
  ways, striped rows, a line above or below; Tab in the last cell adds a row.
- Code blocks with their lines numbered, and, with the caret in one, its
  language from a menu and a copy button.
- The document as markdown in a dialog from the toolbar, to copy out or to
  replace the document from in one edit.
- Page breaks, where a printed copy turns the page.
- Footnotes: Mod+Alt+F, or the button over selected words, puts a number in
  the line and opens a popover to write the note. The numbers follow reading
  order, the renderer lists the notes under the document with links both
  ways in the reader's digits, and markdown writes Pandoc's `^[note]`.
- Find and replace on Mod+F or the toolbar: Arabic found with or without its
  vowel marks, case and whole words on request, the matches highlighted
  without touching the text, replace one or all; a read-only document only
  finds.
- A status bar under the document: words, reading time, an outline of its
  headings to jump to, and focus mode (Mod+Shift+\, Escape to leave).
- Paste rules: cells from a spreadsheet fill the table in hand or become one,
  an address pasted over words links them, an embeddable address on an empty
  line embeds, markdown from a chat becomes blocks, and HTML is read through
  every extension's rules. A block copied from the editor pastes whole, the
  block menu cuts, copies and pastes, and pasted styles keep only colour,
  highlight, size and font.
- Word documents read in from Insert, `/word` or a drop: headings, lists,
  tables, links, pictures through the upload queue, footnotes, and
  equations turned to LaTeX. `wordToHtml` does the same with no editor, and
  mammoth and fflate load only when a document is first read.

- Pictures at four sizes, at the start, middle or end of the line, with alt
  text or marked decorative (and a warning while neither), a caption, a
  credit linked to its licence and source, a focus point a crop keeps in
  view, and numbered labels a reader opens one at a time. Size and place
  are in the block menu; the rest in the picture's details. Word's pictures
  come in at the size they had on the page.
- Galleries of up to twenty-four pictures, read on `Gallery` and
  `Lightbox` and reordered by a drag, by Alt and an arrow or by Earlier and
  Later; and a before and after that slides between two pictures.
- Files as cards a reader opens in `FileViewer` or downloads, a PDF's pages
  shown where chosen, and a new version that keeps the first file as
  `origin`.
- Video and sound on `MediaPlayer`, their captions, audio description and
  transcript written beside them in `TextTracksEditor`, and chapters from
  moments marked where the player stands.
- Embeds from fourteen sites (`DEFAULT_EMBED_PROVIDERS`, or an app's own
  `EmbedProvider`s through `embedExtension({ providers })`). A reader's
  frame loads only once they choose it; YouTube and Vimeo chapters play
  from their moment.

Media blocks hold a file by its address (`src`) or by the id an app keeps
it under (`fileId`), whose address comes from `provideEditorMedia({ fileUrl
})` in the editor and the renderer alike. The same services carry
`uploadRefusal`, words for an app's own refusal codes (arc words
`file.too_large`, `file.infected` and the rest), and `unfinished`, uploads
a reload cut off, which the editor finishes at the document's end. Leaving
the page while a file is on its way asks first, and `fieldId` hands the
files on their way to the editor started again for the same field.
`storedFilesExtension({ scheme })` reads HTML that addresses kept files as
`<scheme><id>`. Each media extension takes `class`, `classes` and, for a
picture's caption, `renders`, in the editor and the renderer.

`TextTracksEditor` writes what goes with a recording, beside it: caption
lines timed from the player and saved as WebVTT, an audio description of
timed lines, a transcript, and drafts from an app's speech service.

### Editor extensions

```tsx
import {
  $insertBlock,
  BlockEditor,
  type Block,
  customizeExtensions,
  defineBlock,
  defineEditorExtension,
  documentPreset,
} from "@barqjs/arc/editor";
import { Status } from "@barqjs/arc";
import { Input } from "@barqjs/ui/input";

const Decision: Block<{ text: string; status: "proposed" | "accepted" }> = defineBlock({
  type: "acme-decision",
  label: "Decision",
  defaultData: () => ({ text: "", status: "proposed" }),
  component: (props) => (
    <div>
      <Status tone={props.data.status === "accepted" ? "success" : "neutral"}>
        {props.data.status}
      </Status>
      <Input
        aria-label="Decision"
        value={props.data.text}
        readOnly={!props.editable}
        onInput={(event) => props.setData({ text: event.currentTarget.value })}
      />
    </div>
  ),
  toMarkdown: (data) => `> [!decision ${data.status}] ${data.text}`,
  fromMarkdown: {
    regExp: /^> \[!decision (proposed|accepted)\] (.*)$/,
    data: (match) => ({
      status: match[1] === "accepted" ? "accepted" : "proposed",
      text: match[2] ?? "",
    }),
  },
});

const decisions = defineEditorExtension({
  name: "acme/decisions",
  dependencies: [Decision],
  keys: [{ keys: "Mod+Alt+D", run: () => void $insertBlock(Decision.$create()) }],
  blockMenu: [
    {
      id: "status",
      label: "Status",
      $read: (block) =>
        Decision.$is(block)
          ? {
              value: block.getData().status,
              options: [
                { value: "proposed", label: "Proposed" },
                { value: "accepted", label: "Accepted" },
              ],
            }
          : null,
      $choose: (block, value) => {
        if (Decision.$is(block)) {
          block.setData({
            ...block.getData(),
            status: value === "accepted" ? "accepted" : "proposed",
          });
        }
      },
    },
  ],
});

<BlockEditor label="Notes" extensions={[decisions]} />;
<BlockEditor
  label="Notes"
  preset={customizeExtensions(documentPreset, { remove: ["arc/table"] })}
/>;
```

An editor is built from editor extensions, and arc's own features are
extensions on the same API: rich text, tables, dividers, images, embeds,
mentions and every block above. `defineEditorExtension` takes, all
optional beside its `name`:

- `nodes`, `blocks` (made with `defineBlock`, which returns an extension of
  its own), `lexical` (Lexical extensions) and `register`, for transforms
  and commands that run in every editor holding it, a server's included;
- `commands`, offered in the `/` menu, the toolbar's Insert menu and the
  block picker (`places` narrows them, `available` asks the editor first);
  `toolbar` and `floating` buttons, or a `control` of its own such as a
  menu (`folded` for the More menu); `blockMenu` choices for the block a
  menu is open on and `blockActions`, what it does to that block (a part
  added, a block kept elsewhere); `turnInto`, kinds of block Turn into
  offers, taken apart again when turned into another; `placeholder`, what
  an empty block of its own says; `keys`, by key or by the key's place, so
  an Arabic keyboard reaches them;
- `paste` rules, higher `priority` first; `markdown` rules (a function is
  handed every rule, for a block that holds markdown of its own) tried by
  `markdownPriority`; `html`, which rewrites a page before it is read; and
  `docx`, which rewrites a Word document's XML or writes its equations;
- `render` (how `RichTextRenderer`, and a server under an editor, draws a
  stored node) and `renderEnd` (drawn after the document, as footnotes are);
- `theme`, `plugins` (components mounted in an editor with a screen),
  `footer`, `collaboration` (properties a shared document leaves out) and
  `load`, a heavy module that `loadExtension` loads the first time it is
  asked for, and asks again after a failure;
- `dependencies`, put in the editor before it.

Every word an extension prints is a `Label`, a string or a function of
`ArcMessages`, so `<ArcProvider messages>` translates arc's own;
`editorMessages(editor)` gives a listener with no component the reader's
words.

Presets are lists of extensions: `documentPreset` for a page,
`chatPreset` for a message (the `ChatComposer` default) and `commentPreset`
for a comment (`RichCommentComposer`'s). An editor takes `preset` and
`extensions`, added to it; an extension named as one already there takes its
place, and `customizeExtensions(preset, { remove, add })` leaves built-ins
out by name. `RichTextEditor`, `BlockEditor`, `RichTextRenderer` and the
headless converters all take the same two, so the editor, the renderer and a
server read the same documents.

## Chat

```tsx
import { ConversationList, EmojiPicker, MessageList, ThreadPanel } from "@barqjs/arc/chat";

<MessageList
  aria-label="#design"
  messages={messages()}
  unreadFrom={firstUnread()}
  hasOlder={cursor() !== null}
  isLoadingOlder={loading()}
  onLoadOlder={loadOlder}
  currentUserId={me.id}
  onReact={(message, emoji, add) => react(message.id, emoji, add)}
  onReply={(message) => openThread(message.id)}
  linkTo={(message) => `/c/design/${message.id}`}
/>;
```

The communication suite, in an entry of its own: an app that never shows a
conversation carries none of it, and its emoji data loads only when a picker
first opens. Rich message content is drawn by `RichTextRenderer` from
`@barqjs/arc/editor`, where `ChatComposer` lives.

- `MessageList`: a conversation that opens at its newest message and stays
  there while new ones arrive, and draws only the rows on screen through
  `@barqjs/aria`'s list layout and virtualizer, each measured as it renders.
  Whatever moves the layout (older pages loaded above, an image growing a
  row, the window resizing) the list keeps its place: at the newest message
  if the reader was there, otherwise with the first row on screen where it
  was. It asks for older pages as the top comes within a screen, and away
  from the end Jump to latest counts what has arrived. A server writes the
  newest rows (`serverRows`, a tall window's worth by default) at the foot
  of the estimated space above them, in a viewport laid out bottom up so the
  page opens on them before any script; once hydrated, the browser measures
  those rows where they stand and hands them to the virtualizer in place. Runs of one author
  are grouped, each day has a line and the first unread a New line, which
  the list opens at. Messages are a feed of articles, one Tab stop: the
  arrows and Page Up and Page Down move between them, Home and End go to
  the ends, Escape comes back out of a message's controls, and a new
  message from someone else is announced. `controller` hands over
  `scrollToLatest` and `scrollToMessage`, which brings a message to the
  middle, focuses it and marks it for a moment in a tint that fades through
  arc's colour motion (at once under reduced motion). `editingId` and
  `renderEditor` edit a message in place, in its body's stead.
- `MessageItem`: one message on ui's `Message`: the author, the time,
  edited and pinned; the body as text, rich `content`, or `renderBody`'s;
  pictures in a `Gallery` that opens the `Lightbox`, audio and video in
  `MediaPlayer`, other files as ui's `Attachment` cards that download; a
  `ReactionBar` with the `EmojiPicker`; and a thread's reply count, its
  people and its last reply. Its actions are a toolbar on hover or focus
  (react, reply in thread, edit, and a menu to copy the link, pin and delete
  after asking) and a sheet on a long press under a finger. A message still
  sending is dimmed and says so; one refused says why with Retry and
  Discard. `appearance="bubble"` puts the reader's own at the reading end.
- `ThreadPanel`: a message's thread, the message, its replies counted and
  listed as a `MessageList`, who is typing and a composer. In
  `DockedPanels` it docks beside the conversation and is a sheet on a
  phone.
- `ConversationLayout`: a conversation's page, its name (an `<h1>`), an
  `icon` or avatar, a `topic` cut to one line and hidden on a phone, a
  `subtitle` such as a presence line, and `actions`, over optional `tabs` and
  a `banner`, the messages filling the height between, and `typing` and the
  `composer` docked at the foot. Its `panels` are `DockedPanels` that run the
  full height beside it, and a `DockedPanelToggle` in its `actions` opens
  one.
- `EmojiPicker`: every emoji in Unicode's groups and order, searched by
  name and keyword, with the reader's recently used first, a skin tone
  chosen once and remembered, and a row of categories that jumps to each and
  marks the one in view. The search keeps focus while the arrows move
  through the grid in the reading direction and Enter chooses. Only the rows
  on screen are drawn. The data is emojibase's, which follows Unicode's
  list and CLDR's names release by release as plain JSON in two dozen
  languages; English is loaded by default, and `source` takes another
  language's file or the app's own:

  ```tsx
  import { arabicEmoji } from "@barqjs/arc/chat";

  <EmojiPicker
    source={(locale) => import(`emojibase-data/${locale}/compact.json`).then((m) => m.default)}
  />;
  <EmojiPicker source={arabicEmoji} />;
  ```

  emojibase has no Arabic file, so `arabicEmoji` names its list from
  CLDR's Arabic annotations (Unicode License v3, its notice in the file),
  loaded only when asked for; `tools/arabic-emoji.ts` writes it again for
  a new CLDR release. A search folds the spellings Arabic writers use
  interchangeably, so أهلا and اهلا find the same wave.

- `EmojiButton`: an icon button that opens the `EmojiPicker` (a popover on
  a wide screen, a sheet under a finger) and closes once one is chosen. A
  message's add-reaction button and `ChatComposer`'s emoji button are both
  this, so an app's own toolbar gets the same one.
- `TypingIndicator`: "Alex and Sam are typing", the names joined as the
  locale joins a list, in a status that stays in the page.
- `ConversationList`: channels and direct messages for `AppShell`'s
  `sidebar`, or on its own in a page, a sheet or a phone's whole screen,
  in groups whose headings fold them. A channel shows `#` or a
  lock, a direct message the person's avatar and presence; unread ones are
  bold with their count, mentions in the danger tone, muted ones quiet and
  counting only mentions, and a draft marked, each read after the name.
- Calls: `CallStage` lays everyone out in a grid that adds columns with the
  room it has, or puts whoever presents or speaks on stage over a strip of
  the rest, by its own width so a side panel or a picture-in-picture
  window (`compact`) lays out for itself. `ParticipantTile` plays the
  `MediaStream` the app hands it (WebRTC stays in the app), mirrors the
  reader's own camera, shows the avatar while the camera is off and says
  muted, presenting, speaking and a poor connection; `renders.video` draws
  the stream in an element of the app's. Each tile has a menu on hover or
  focus, and on a long press under a finger: Pin (the stage's `pinnedId`
  and `onPinnedChange`), Mute for me, which silences them here only, and
  Full screen. `CallControls` is one toolbar for
  the microphone, the camera, the screen, a devices menu and Leave.
  `useMediaDevices` lists the microphones, cameras and speakers as they
  are plugged in and out, keeps the one chosen of each (back to the
  default when it is unplugged), says whether the page may use them,
  `request`s them, which names them, and hands `getUserMedia` its
  constraints; its `devices`, `selected` and `select` are what
  `CallControls` takes, and a stage's `audioOutput` plays through the
  chosen speaker. `CallWindow` is a small window over the page for a call
  the reader has left the page of: it opens in the bottom corner at the
  end of the line, its grip drags it by pointer or finger and moves it with
  the arrow keys, and it stays inside the viewport.
  `IncomingCall` says who is calling, aloud too, with Accept and Decline,
  and `CallBanner` shows a call going on in a conversation with its time,
  its people and Join.
- `useMessageHistory`: a conversation's history over a TanStack DB
  collection, through `@barqjs/db`'s live infinite query (an optional
  peer, which only the chat entry imports): the newest page first and
  older ones as the list asks, every loaded row live. `send` inserts
  optimistically, so a message shows at once as sending and stays in place
  with its reason, Retry and Discard if the collection's `onInsert`
  refuses it; `receive` writes what a websocket pushes into the collection
  as synced data, so a send's own echo lands on its row.
- `AIChatPanel`: a conversation with an assistant: replies written out as
  markdown while they stream, the tools it calls with their state, input
  and result, a proposed change to Approve or Reject, sources, Stop,
  Regenerate, a copy of each reply and suggestions while it is empty. Its
  transcript is ui's `MessageScroller`; `composer` takes `ChatComposer` in
  place of its own.
- `QuotedMessageCard`: a message quoted out of its conversation (a pinned or
  saved one, a search result): its author and time, where it was sent as a
  link of its own, its first three lines, a note kept with it and a footer.
  With `href` or `onOpen` the whole card opens the message while the source
  and the `actions` stay controls of their own.
- `CustomStatusDialog`: where someone says what they are up to, in a
  `FormDialog`: an emoji from `EmojiButton`, a few words, when it lapses
  (`statusExpiry`), presets that fill all three in one press, and the status
  now with a button that clears it. Saving with neither emoji nor words says
  what is missing.
