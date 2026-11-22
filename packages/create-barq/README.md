# create-barq

Create a barq project: the template, its add-ons, the install and the first
commit, in one command.

## Usage

```bash
bun create barq my-app
npm create barq@latest my-app
pnpm create barq my-app
```

It asks what it was not told: where, which template, which add-ons, whether to
install and whether to start a repository. Every question has a flag, and
`--yes` takes the defaults, so a script or a coding agent never meets a prompt:

```bash
bun create barq my-app --template spa --add-ons ui --yes
```

```
create-barq [directory] [options]

  -t, --template NAME      full-stack | spa | minimal
      --add-ons LIST       comma separated: ui
      --no-add-ons         none, without being asked
      --pm NAME            npm | pnpm | yarn | bun. Defaults to the one that ran this
      --install            install dependencies (--no-install to skip)
      --git                start a repository with one commit (--no-git to skip)
  -y, --yes                take every default without asking
      --overwrite          empty the directory first
      --ref REF            the branch, tag or commit to take templates from
      --offline            use the templates this package was published with
      --list-templates     what can be created (with --json for a tool)
      --list-add-ons       what can be added (with --json for a tool)
  -h, --help               show this
```

When it finishes the project is installed, its generated files are written and
committed, and `bun run dev` starts it.

## Where templates come from

From GitHub, at the `templates` branch of this repository, so a template that
is fixed there reaches the next project without a release of this package. The
branch is moved only to templates a published release has been checked with.

`--offline` uses the copy this package was published with, and so does a run
that cannot reach GitHub; it says so when that happens. `--ref` names another
branch, tag or commit, and `BARQ_TEMPLATES` replaces the source with a base URL
or a local directory.

## Add-ons

- `ui`: sets up [`barq-ui`](../ui-cli#readme), copies a theme and a starter set
  of components (`button`, `card`, `input`, `label`) into `src/components`,
  and imports the theme at the project's entry.

## The templates

- `full-stack`: pages rendered on the server, prerendered where a route says
  so, with file routes, an API route and a server function. Run the build with
  `bun dist/server/serve.js`.
- `spa`: pages rendered in the browser from your own `index.html`, with file
  routes and a server function. Run the build with `bun dist/server/serve.js`.
- `minimal`: one `index.html`, the compiler and signals, no router and no
  server. The build is static files for any host.

`full-stack` is the default. Each `vite.config.ts` is one call to the plugin
from `@barqjs/vite`: `barq({ ssr: true, start })`, `barq({ start: true })` and
`barq()`.

Every template is tested before it is published. `test/scaffold.test.ts`
scaffolds each into a temporary directory, runs its own `vite build`, `tsc` and
tests, starts the server it produced and fetches from it.

## What a scaffolded project does not contain

- **No server or client entry.** `src/entry-client.tsx` and
  `src/entry-server.ts` are optional overrides, and the plugin supplies the
  defaults. The `spa` template's `src/main.tsx` is the module `index.html`
  loads, not an entry the plugin looks for.
- **No `src/routeTree.gen.ts` in the template.** The Vite plugin writes it,
  and `create-barq` has it written right after the install, so it is in the
  first commit. It is an ordinary module the project imports by path, and it
  typechecks and reads like one.
- **No `src/virtual.d.ts`.** The declarations for the build's own modules ship
  inside `@barqjs/router`.

## Adding routes

A route is a file under `src/routes`. `about.tsx` is `/about`. `posts/$id.tsx`
is `/posts/:id`. `api/health.ts` is an API route, because it declares `server`
handlers instead of a component. `__root.tsx` is the layout every page renders
inside and, for a server-rendered app, the document. The
[router README](../router/README.md) has the full set of conventions.
