# BARQ010: JSX is passed to a prop the component reads as a value, which throws

**Level:** warning · [all codes](README.md)

## Message

> `heading` is JSX here, and `Card` reads `props.heading` as a value in the `title`
> attribute of an element. JSX cannot be read as a value, so `Card` throws
> `ScopeMissingError` when it reads the prop. Pass a value instead of JSX, or change
> `Card` to render the prop as a child: `{props.heading}`.

## Failing example

```tsx
function Card(props) {
  return <section title={props.heading}>{props.children}</section>;
}

export const Page = () => <Card heading={<b>Today</b>}>Hello</Card>;
```

## Fixed example

Pass a value:

```tsx
function Card(props) {
  return <section title={props.heading}>{props.children}</section>;
}

export const Page = () => <Card heading="Today">Hello</Card>;
```

Or keep the JSX and render the prop as a child:

```tsx
function Card(props) {
  return (
    <section>
      <h2>{props.heading}</h2>
      {props.children}
    </section>
  );
}

export const Page = () => <Card heading={<b>Today</b>}>Hello</Card>;
```

## Why this rule exists

A prop written as JSX is not a value. It is markup that is built at the place the
component renders it, so the only thing a component can do with it is render it as a
child. An attribute, an event handler, a `ref`, and the `each`, `when` or `mount` of a
flow component all need a value, and barq throws `ScopeMissingError` there instead of
writing something meaningless into the page.

Inside one file the compiler sees both ends, the JSX being passed and the place that
reads it, so it reports the mismatch before the page runs. It follows a prop that one
component hands to another in the same file. Across files, or through a spread, only the
run-time error reports it.

## Silencing one line

```tsx
function Card(props) {
  return <section title={props.heading}>{props.children}</section>;
}

// barq-ignore-next-line BARQ010 (this branch is replaced before it renders)
export const Page = () => <Card heading={<b>Today</b>}>Hello</Card>;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ010 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
