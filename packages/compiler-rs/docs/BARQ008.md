# BARQ008 — this `barq-ignore-next-line` matched no diagnostic

**Level:** warning, always · [all codes](README.md)

## What fires

A well-formed suppression comment whose codes were not raised on the line it covers.

```jsx
{/* barq-ignore-next-line BARQ001 (fixed this last week) */}   {/* ← BARQ008 */}
<p>{count()}</p>
```

Two shapes produce this without the directive being stale, and both are worth checking
before deleting it:

- **A `//` line in JSX child position is text, not a comment.** It silences nothing, and it
  is baked into the template and rendered onto the page. Use `{/* … */}`.
- **The directive covers one line, not one statement.** A diagnostic on the third line of a
  multi-line statement is not covered by a directive above the first, so you get BARQ008 and
  the original both. Move the directive directly above the reported line.

## The fix

Delete the directive.

## Why it can never be an error

This code is clamped to warning level. `checks: { BARQ008: "error" }` and
`defaultCategory: "error"` both leave it at warning, and a test pins that.

`@ts-expect-error` becoming unused "halts the entire build/CI pipeline when the suppression
becomes unused" ([microsoft/TypeScript#62579][ts62579]), and the documented consequence is
that teams switch to `@ts-ignore`, which then silently swallows *new* errors. A stale
suppression is a tidiness problem; a suppression people are afraid to use is a correctness
problem.

[ts62579]: https://github.com/microsoft/TypeScript/issues/62579
