# BARQ031: A props pattern binds a name that cannot be kept reactive

**Level:** error · [all codes](README.md)

## Message

> This props pattern cannot be kept reactive: a computed key, a default inside a nested
> pattern, or a rest element inside one. Destructure one level, or read the prop from
> `props` where it is used.

## Failing example

```tsx
export function Card({ user: { name = "guest" } }: { user: { name?: string } }) {
  return <p>{name}</p>;
}
```

## Fixed example

```tsx
export function Card({ user }: { user: { name?: string } }) {
  return <p>{user.name ?? "guest"}</p>;
}
```

## Why this rule exists

A name bound by destructuring a component's props is not a copy. The compiler makes each
use of it the read it stands for, so `{ title }` follows the prop as `props.title` does, a
default applies whenever the prop is `undefined`, and `...rest` carries the props the
pattern did not name.

Three shapes have no read to stand for:

- A computed key, `{ [key]: value }`, names a prop only when the component runs.
- A default inside a nested pattern, `{ user: { name = "guest" } }`, would have to be made
  once per value of `user`, and the pattern has nowhere to keep it.
- A rest element inside a nested pattern, `{ user: { id, ...others } }`, copies the value's
  remaining fields, and a copy does not follow the prop.

A pattern with one of them is left as JavaScript reads it, which is a copy made once when
the component runs, of a record whose members are not the values the types describe. So
the rule is an error rather than advice.

Destructuring one level is always supported: names, renames, defaults and a rest element.
So is a nested pattern with none of the three, `{ user: { name }, items: [first] }`.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ031 (this function is called by hand with a plain object)
export function Card({ user: { name = "guest" } }: { user: { name?: string } }) {
  return <p>{name}</p>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ031 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
