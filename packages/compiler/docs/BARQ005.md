# BARQ005: removed

The compiler does not report this code. [All codes](README.md)

BARQ005 warned that a name destructured from a component's props was the prop's Cell, a
function, and was being used as a value. Destructuring props is supported now: the compiler
makes each use of a destructured name the read it stands for, so the name is the value its
type says it is, it follows the prop, and a default applies whenever the prop is
`undefined`. There is nothing to warn about:

```tsx
export function Chip({ text, tone = "warm" }: { text: string; tone?: string }) {
  return <span data-tone={tone}>{`#${text}`}</span>;
}
```

Two errors cover what destructuring cannot do. [BARQ030](BARQ030.md) reports an assignment
to a prop, a destructured name included. [BARQ031](BARQ031.md) reports a pattern that
cannot be kept reactive: a computed key, a default inside a nested pattern, or a rest
element inside one.

## If a comment still names it

`BARQ005` is not a code the compiler knows, so a comment that names it is reported as
[BARQ009](BARQ009.md) and silences nothing. Delete the comment.
