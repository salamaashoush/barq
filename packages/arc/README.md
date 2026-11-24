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
    <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
      <form.FormError />
      <form.AppField name="email">{(field) => <field.TextField label="Email" type="email" />}</form.AppField>
      <form.AppField name="zone">{(field) => <field.TimeZoneField label="Time zone" />}</form.AppField>
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
