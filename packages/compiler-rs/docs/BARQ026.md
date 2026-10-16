# BARQ026: Markup the browser's HTML parser builds differently from the JSX

**Level:** error · [all codes](README.md)

## Message

> `<div>` cannot be inside a `<p>`: the browser's HTML parser closes the paragraph at
> `<div>`, so the `<div>` lands after the `<p>` and the `</p>` that follows opens an empty
> one. A server-rendered page then hydrates against a tree that is not the one this JSX
> builds, which is a hydration mismatch and a full re-render in the browser. Move the `<div>`
> out of the `<p>`, or change the outer element (a `<div>` in place of a `<p>`, a `<span>` in
> place of an inner link).

The first sentence names what the parser does at that element. The other shapes it reports:

- a table part outside its parent, or anything but its parts inside a table: `<tr>`
  directly in a `<table>` (the parser adds a `<tbody>`), `<td>` in a `<div>` (the parser
  drops the tag), `<div>` in a `<tr>` (the parser moves it before the table).
- an element `<select>`, `<optgroup>` or `<option>` does not take.
- a second `<a>`, `<button>`, `<form>`, `<li>`, `<nobr>`, `<dd>` or `<dt>` inside an open one,
  which the parser closes first.
- `<html>`, `<head>`, `<body>` and the obsolete `<frame>`, `<frameset>`, `<plaintext>`, which
  are never an element of their own inside a page.

## Failing example

```tsx
export const Notice = (props) => (
  <p>
    Your order shipped.
    <div class="details">{props.tracking}</div>
  </p>
);
```

## Fixed example

```tsx
export const Notice = (props) => (
  <div>
    <p>Your order shipped.</p>
    <div class="details">{props.tracking}</div>
  </div>
);
```

## Why this rule exists

A server render writes the markup as a string, and the browser parses that string with the
HTML parser, which repairs what HTML does not allow instead of keeping it. The page the
browser builds from `<p><div>…</div></p>` is `<p></p><div>…</div><p></p>`. Hydration then
walks a tree that is not the one the component builds, reports a mismatch, throws the
server's markup away and renders the page again. A client-only render does not show it,
because it builds elements one by one and never asks the parser.

The check follows JSX within one component: an element's children, and JSX that a
conditional, a `&&` or a list callback places where it stands. A component's children start
again, because the component decides where they go.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ026 (rendered on the client only, never hydrated)
export const Legacy = () => <p><div>kept for an old stylesheet</div></p>;
```

The reason in parentheses is required and has to be at least 10 characters. To change the
level for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
