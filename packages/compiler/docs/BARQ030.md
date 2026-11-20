# BARQ030: A prop is assigned, and props are read-only

**Level:** error · [all codes](README.md)

## Message

> A prop is assigned here, and props are read-only: the component that passed it owns the
> value. Call a function prop to ask for the change, or keep a signal of your own and write
> to that.

## Failing example

```tsx
export function Counter(props: { count: number }) {
  return (
    <button
      type="button"
      onClick={() => {
        props.count = props.count + 1;
      }}
    >
      {props.count}
    </button>
  );
}
```

## Fixed example

```tsx
export function Counter(props: { count: number; onChange: (next: number) => void }) {
  return (
    <button type="button" onClick={() => props.onChange(props.count + 1)}>
      {props.count}
    </button>
  );
}
```

## Why this rule exists

A component reads its props as values, and each read asks the component that passed the
prop for the current one. Nothing stands behind a prop for an assignment to change: the
write would land on the component's own record, the parent would never hear of it, and
the next read would answer with what was written instead of what the parent passes.

The rule reports an assignment, `+=` and its relatives, and `++` and `--`, on `props.name`,
on a name bound by destructuring the props, and on a member of what `omit(props, …)`
answers with. Writing into the VALUE a prop holds, `props.user.name = "salama"`, is not
reported: that object belongs to whoever made it.

## Silencing one line

```tsx
export function Counter(props: { count: number }) {
  // barq-ignore-next-line BARQ030 (the record is this component's own in this test)
  props.count = 0;
  return <output>{props.count}</output>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ030 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
