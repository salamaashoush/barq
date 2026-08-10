# BARQ009 — this `barq-ignore-next-line` could not be parsed

**Level:** warning, always · [all codes](README.md)

## What fires

A comment that begins `barq-ignore-next-line` and then does not satisfy the grammar. The
message says which of these it was:

| problem | example |
| --- | --- |
| no code | `// barq-ignore-next-line (it is fine)` |
| unknown code | `// barq-ignore-next-line BARQ999 (a reason of substance)` |
| no reason | `// barq-ignore-next-line BARQ001` |
| reason under 10 characters | `// barq-ignore-next-line BARQ001 (fine)` |
| unclosed reason | `// barq-ignore-next-line BARQ001 (fine and good` |

**A malformed directive silences nothing.** The diagnostic it was aimed at is still
reported, next to this one.

## The grammar

```
// barq-ignore-next-line CODE[, CODE …] (reason of at least 10 characters)
```

Inside JSX, the same directive has to be written as a JSX comment —
`{/* barq-ignore-next-line CODE (reason) */}`. A `//` line between JSX children is text:
it does not reach the comment table at all, so it produces no BARQ009 either, and it is
baked into the emitted template.

The code is mandatory because a codeless form silences whatever happens to land on that
line, including a diagnostic added after the comment was written; TypeScript shipped the
codeless form and has been unable to undo it since 2020
([microsoft/TypeScript#38288][ts38288]).

The reason is mandatory because it "forces developers to articulate why" — the wording is
typescript-eslint's, from `ban-ts-comment`'s `minimumDescriptionLength`, which is 10 in its
strict config.

## Why it can never be an error

Clamped to warning, for the same reason as [BARQ008](BARQ008.md). A build must not fail on
a comment.

[ts38288]: https://github.com/microsoft/TypeScript/issues/38288
