# @barqjs/ui-cli

Copy [`@barqjs/ui`](../ui#readme) components into your project, and keep them in
sync with the registry they came from.

```bash
bunx @barqjs/ui-cli init
bunx @barqjs/ui-cli add button card dialog
```

A component you add is your code: it lands in your repository, it goes through
your review, and you edit it. That is shadcn/ui's idea and this is the same one.
What is different is that this CLI knows which files you have edited, so
`sync` can take an upstream change without taking your changes back.

## Commands

```
barq-ui init                 set up components.json, the theme and the base styles
barq-ui add <name...>        add components, with whatever they need
barq-ui diff [name...]       what the registry has that your copy does not
barq-ui sync [name...]       take the registry's version, keeping your edits
barq-ui list                 what the registry offers
barq-ui theme <name>         change the colour theme
barq-ui build <dir>          turn a directory of components into a registry
```

`--cwd <dir>` runs against another directory, `--yes` takes every default,
`--overwrite` replaces a file you have edited. Piped into a script there is
nowhere to prompt, so every question takes its default and `--yes` is
unnecessary in CI.

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
    "theme": "src/components/theme"
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

**`paths`** is where files go. A component's own imports are RELATIVE and are
recomputed against where the files actually land, so any layout works and none
of it depends on a `tsconfig` alias.

**`theme`** is a base colour theme, optionally an accent over it, and the
radius. `init` asks for all three from a list, and writes them into a `theme.ts`
the barq compiler folds into a stylesheet, so an application that picks its
theme once pays nothing at run time.

Each of the three has a flag, so `init` is scriptable: `--theme`, `--accent`,
`--radius`, and `--dark <selector>` for the class dark mode is asked for by, or
`--dark media` to follow the operating system. A name none of the themes has
stops `init` before it writes anything, and says which names exist.

## A registry of your own

`build` reads a directory of components and writes the JSON a registry serves:

```bash
barq-ui build ./src/components
```

The rules are the ones `@barqjs/ui` builds its own with. A file's bare imports
are its npm dependencies; its relative imports are the items it needs. Serve the
result and point a `components.json` at it:

```json
{ "registry": "https://acme.example.com/r/{name}.json" }
```

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
