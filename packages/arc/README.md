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
- `EmptyState`: a list with nothing in it yet, as an icon, a heading, a line
  and the actions that fill it, on `@barqjs/ui`'s `Empty`.
- `PageHeader`: the page's `<h1>`, a line about it, what sits above it and the
  actions beside it.
- `Status`: a state in a word and a tone, as a dot, a tinted pill or a filled
  one, with an optional pulse that stops under reduced motion.
- `confirm()`: a promise for the reader's answer, drawn by one `<ConfirmHost />`
  on the page.
- `CommandMenu`: the palette `Mod+K` opens, of places to go and things to do.
  A page adds its own actions with `useCommands` for as long as it is open,
  and `registerCommands` adds them from outside any component.
- `Breadcrumbs`: where the page sits, read from the matched routes'
  `staticData.crumb` or given as items. A narrow trail folds its middle steps
  behind a button that shows them.
