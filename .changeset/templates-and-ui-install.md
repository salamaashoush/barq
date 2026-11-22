---
"@barqjs/core": patch
---

`barq-ui add` installs barq packages at the CLI's own release. It used the `latest` tag, which during a prerelease is an older release than the components it copies, so a fresh project failed to typecheck.

The `create-barq` templates start with a real design, a component test (`npm test`), the diagnostics endpoint for coding agents and a `CLAUDE.md` that points at `AGENTS.md`.

`@barqjs/aria`: a popover closes when focus leaves it, drag and drop works inside a Virtualizer and speaks 34 languages, and a kit Switch marked `required` holds a native form.
