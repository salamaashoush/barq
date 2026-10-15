# BARQ008: A `barq-ignore-next-line` comment silences nothing on the next line

**Level:** warning · [all codes](README.md)

## Message

> This `barq-ignore-next-line` names BARQ001, and nothing on the line below reports it,
> so the comment does nothing. Delete it, or move it to the line directly above the
> diagnostic; inside JSX, write it as `{/* barq-ignore-next-line ... */}`.

## Failing example

```tsx
// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
export const Label = () => <p>ok</p>;
```

## Fixed example

```tsx
export const Label = () => <p>ok</p>;
```

## Why this rule exists

A suppression that silences nothing is a leftover: the code it covered was fixed or moved.
Left in place, it would hide the next diagnostic with that code on that line without
anyone deciding that it should.

Two things produce this by accident. A comment covers the next line only, not the whole
statement, so it has to sit directly above the line the diagnostic points at. And between
JSX children a `//` line is text, so the comment has to be written as
`{/* barq-ignore-next-line BARQ001 (reason) */}`.

## Turning it off

This code has no per-line form, because a suppression of a suppression would need its own
check. It stays a warning even with `defaultCategory: "error"`, so a stale comment cannot
fail a build. To stop reporting it for the whole project:

```ts
barq({ compiler: { checks: { BARQ008: "suppress" } } });
```
