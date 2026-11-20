# @barqjs/cli

The `barq` command. It runs a project through the compiler's diagnostics with
no build and no dev server, prints what it finds as text or JSON, and applies
the fixes the findings carry.

```bash
npm install --save-dev @barqjs/cli
npx barq check
```

## `barq check [paths...]`

Checks every `.tsx` and `.jsx` file under the paths, and every script that
imports a `@barqjs/` package. With no path it checks the project root.
`node_modules`, `dist`, `build`, `coverage` and directories starting with a dot
are skipped.

```
src/view.tsx:7:32 warning BARQ001 `count` is an accessor, and here the function itself is used as the value. In a string it prints its own source text and in arithmetic it gives `NaN`. Call it: `count()`.
  docs: https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ001.md
  fix: `barq check --fix` repairs this

0 errors, 1 warning, 0 notes in 1 file, 1 more fixable with `--fix`
repair guide: node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md
```

Options:

- `--json`: one JSON document on stdout.
- `--fix`: apply the fixes, then report what is left.
- `--root <dir>`: the project root. Paths in the output are relative to it.
- `--routes <dir>`: the directory of file routes. Defaults to `src/routes`.
- `--level <CODE=level>`: set a code to `suppress`, `note`, `warning` or
  `error`. Repeatable.
- `--max-warnings <n>`: exit 1 when there are more warnings than `n`.

Exit status: `0` when nothing is at error level, `1` when something is or the
warnings pass `--max-warnings`, `2` for a command line it does not understand.

### File routes

When the routes directory exists, the check reads it the way the build does and
writes nothing. Every `<Link to>` is then checked against the routes it gives
(`BARQ013`), and a route file whose `createFileRoute` id disagrees with its
filename is an error, as it is in a build.

### Settings in `package.json`

```json
{
  "barq": {
    "check": {
      "paths": ["src"],
      "routes": "src/routes",
      "extraRoutes": ["/demo/dashboard", "/demo/dashboard/users/$id"],
      "levels": { "BARQ004": "error", "BARQ011": "suppress" }
    }
  }
}
```

`extraRoutes` names patterns a link may use beside the file routes, such as
those of a second router the application builds by hand. A flag on the command
line replaces the setting of the same name, and a `--level` is added after the
ones here.

### The JSON form

```json
{
  "version": 1,
  "root": "/work/app",
  "files": 12,
  "summary": { "errors": 0, "warnings": 1, "notes": 0, "fixable": 1, "fixed": 0 },
  "findings": [
    {
      "code": "BARQ001",
      "severity": "warning",
      "message": "`count` is an accessor, and here the function itself is used as the value. ...",
      "file": "src/view.tsx",
      "line": 7,
      "column": 32,
      "endLine": 7,
      "endColumn": 37,
      "docs": "https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ001.md",
      "skill": "node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md#barq001",
      "fix": [{ "pos": 221, "end": 221, "text": "()" }]
    }
  ]
}
```

`line` and `column` are 1-based. `skill` is the section of the installed repair
guide for the code. `fix` is present when the repair is one spelling: each edit
replaces the UTF-16 range `pos` to `end` of the file with `text`, and the two
are equal for an insertion.

### What `--fix` repairs

- `BARQ001`, `BARQ002`, `BARQ003`: an accessor used without being called gains
  its call.
- `BARQ022`: `<Theme.Provider>` becomes `<Theme>`, in both tags.
- `BARQ023`: `classList` becomes `class`.
- `BARQ024`: `on:click` becomes `onClick`, and `attr:title` and `bool:disabled`
  lose their prefix. An event name that is not one lowercase word, and the
  `style:`, `class:` and `use:` namespaces, have no single spelling and are
  left to you.

A fix can uncover another finding, so the file is compiled again after each
round, up to five rounds.

## `barq codes`

Lists every code the installed compiler can raise, with its default level and
one line on what it means. `--json` prints the list with each code's page and
guide section.

## From a program

```ts
import { check } from "@barqjs/cli";

const result = check({ root: process.cwd(), paths: ["src"] });
if (result.summary.errors > 0) process.exitCode = 1;
```

`check`, `codes`, `applyFixes`, `formatText` and `projectOptions` are exported, with the types of
what they take and return.
