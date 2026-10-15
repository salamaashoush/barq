# @barqjs/ui-cli

Copy [`@barqjs/ui`](../ui#readme) components into your project, and keep them in
sync with the registry they came from.

```bash
bunx @barqjs/ui-cli init
bunx @barqjs/ui-cli add button card dialog
bunx @barqjs/ui-cli add dashboard-01
```

A component you add is your code: it lands in your repository, it goes through
your review, and you edit it. That is shadcn/ui's idea and this is the same one.
What is different is that this CLI knows which files you have edited, so
`sync` can take an upstream change without taking your changes back.

## Commands

```
barq-ui init                 set up components.json, the theme and the base styles
barq-ui add <name...>        add components and blocks, with whatever they need
barq-ui diff [name...]       what the registry has that your copy does not
barq-ui sync [name...]       take the registry's version, keeping your edits
barq-ui list                 what the registry offers
barq-ui search <query>       find items by name, description or category
barq-ui view <name...>       print items as the registry serves them
barq-ui info                 what this project is set up with
barq-ui theme <name>         change the colour theme
barq-ui style <name>         change the component style
barq-ui build <dir>          turn a directory of components into a registry
```

`--cwd <dir>` runs against another directory, `--yes` takes every default,
`--overwrite` replaces a file you have edited. Piped into a script there is
nowhere to prompt, so every question takes its default and `--yes` is
unnecessary in CI.

## `add`

`add` writes the item and everything its `registryDependencies` name, then
installs the npm packages those files import that the project does not have.
The package manager is the one whose lockfile is nearest, at or above the
project: `bun.lock`, `pnpm-lock.yaml`, `yarn.lock` or `package-lock.json`.
`--no-install` prints the command instead of running it.

```
barq-ui add --all                 every ui component the registry has
barq-ui add dialog --dry-run      what would be written, and nothing written
barq-ui add dialog --diff         what would change in the files you have
barq-ui add dialog --view         the files as they would be written
```

`--diff=<file>` and `--view=<file>` narrow either to the files whose path ends
that way.

## Blocks and charts

The registry carries the site's blocks (`dashboard-01`, `sidebar-01` to
`sidebar-16`, `login-01` to `login-05`, `signup-01` to `signup-05`) and its
charts, one item per family (`chart-area`, `chart-bar`, `chart-line`,
`chart-pie`, `chart-radar`, `chart-radial`, `chart-tooltip`). A block lands in
`blocks/` under `paths.components`, a chart family in `charts/`, and each brings
the ui components it is built from. `barq-ui search sidebar` lists what matches.

## `sync`, and why it is not `add` again

`init` and `add` record a hash per file in `components.json`. That is the whole
mechanism, and it is what lets `sync` tell three cases apart:

| your file | what happens |
| --- | --- |
| identical to the registry's | nothing, and nothing is said |
| untouched since it was added | replaced |
| edited | shown as a diff and **kept**, unless you say otherwise |

shadcn's `diff` cannot make that distinction — it has no record of what it
wrote — so it shows you the difference and leaves the applying to you. Owning
the code means your edit wins by default; taking it back silently would be the
tool taking the ownership back.

## `components.json`

```json
{
  "registry": "node_modules",
  "paths": {
    "ui": "src/components/ui",
    "lib": "src/components/lib",
    "theme": "src/components/theme",
    "components": "src/components",
    "hooks": "src/hooks"
  },
  "theme": { "base": "neutral", "accent": "blue", "radius": "0.625rem" },
  "reset": true,
  "items": {}
}
```

**`registry`** is either `"node_modules"` — the copy of `@barqjs/ui` this
project already has — or a URL with `{name}` in it. The default reads the
installed package, so a monorepo, a pinned version and a machine with no network
all work, and what `add` writes is exactly the version in your lockfile.

**`registries`** names more registries by scope, and an item from one is
addressed as `@scope/name`:

```json
{
  "registries": {
    "@acme": "https://acme.example.com/r/{name}.json",
    "@private": {
      "url": "https://registry.example.com/{name}.json",
      "headers": { "Authorization": "Bearer ${API_TOKEN}" }
    }
  }
}
```

`${NAME}` is read from the environment, so a token is never written into the
file. A pattern that is not a URL is a path from the project root, which is how
the output of `build` is used before anything serves it. A bare name in an
item's `registryDependencies` always means the project's own registry.

**`paths`** is where files go. A component's own imports are RELATIVE and are
recomputed against where the files actually land, so any layout works and none
of it depends on a `tsconfig` alias. `ui`, `lib`, `theme` and `hooks` each take
the files of their type by name. Blocks, components and examples keep the path
their registry gave them, under `components`. A `registry:page` or
`registry:file` names its own `target` from the project root, and a path that
would leave the project is refused before anything is written.

**`theme`** is a base colour theme, optionally an accent over it, and the
radius. `init` asks for all three from a list, and writes them into a `theme.ts`
the barq compiler folds into a stylesheet, so an application that picks its
theme once pays nothing at run time.

**`theme.style`** is one of shadcn's eight component styles, and it is opt-in:
with none, you get this package's own look, which is shadcn's classic registry
transcribed. Choosing one copies that stylesheet into your project, because a
style is 180 KB and you picked one.

Each of the four has a flag, so `init` is scriptable: `--style`, `--theme`, `--accent`,
`--radius`, and `--dark <selector>` for the class dark mode is asked for by, or
`--dark media` to follow the operating system. A name none of the themes has
stops `init` before it writes anything, and says which names exist.

## A registry of your own

`build` reads a directory of components and writes the JSON a registry serves:

```bash
barq-ui build ./src/components
```

The rules are the ones `@barqjs/ui` builds its own with. A file's bare imports
are its npm dependencies; its relative imports are the items it needs. The
directory a file is in is its type: `lib`, `theme`, `hooks`, `blocks`,
`components`, `examples`, and `ui` for anything else. A directory under `blocks`
is one item with every file in it. Serve the result and point a
`components.json` at it, as the registry or as one of several:

```json
{ "registry": "https://acme.example.com/r/{name}.json" }
```

An item may also carry `devDependencies`, `categories`, `meta`, and `cssVars`
and `css`. The last two are written into the project's `theme.ts`: `cssVars`
as tokens under `light`, `dark` or `theme` (the root, in either mode), `css` as
rules after them. They are recorded in `components.json` too, so `barq-ui theme`
keeps them when it rewrites the file.

## No dependencies

The argument parsing, the prompts, the diff and the schema checks are each
smaller than the library that would do them. A tool someone runs once to write
eight files should not download eight of its own first.

The diff is Myers' shortest-edit-script over lines, which is the algorithm
`git diff` uses and the right one here: two versions of a component are nearly
identical, and Myers' work is proportional to the size of the difference rather
than to the size of the files.

## License

MIT
