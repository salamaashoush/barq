# BARQ024: An attribute uses a Solid 1.x namespace such as `on:` or `attr:`

**Level:** error · [all codes](README.md)

## Message

> `on:` is not a namespace, so `on:input` would be written as an attribute of that name.
> Bind the event with `onInput={handler}`. For an event name that is not one word, or for
> listener options, add the listener in a ref:
> `ref={(el) => el.addEventListener("input", handler)}`.

The second half names the replacement for the prefix that was written.

## Failing example

```tsx
export const Field = (props) => <input on:input={props.onInput} />;
```

## Fixed example

```tsx
export const Field = (props) => <input onInput={props.onInput} />;
```

Every prefix the check reports, and what to write instead:

- `on:x`: `onX={handler}`, or `addEventListener` in a ref for a hyphenated name or options.
- `capture:x`, `oncapture:x`: `onXCapture={handler}`, or `addEventListener` with `{ capture: true }` in a ref.
- `attr:x`: `x={…}`.
- `bool:x`: `x={on()}`, where `true` adds the attribute and `false` removes it.
- `style:x`: a key of the `style` object.
- `class:x`: a key of the `class` map.
- `use:x`: `ref={x(…)}`, and `ref={[x(…), y]}` for several.

## Why this rule exists

Solid 2.0 removed these namespaces: an attribute is written by its own name, events are
camelCase `on` props, a directive is a ref, and a class or style toggle is a key of the
`class` or `style` value. A name that still carries one of these prefixes is an ordinary
attribute whose name contains a colon, so `on:click={handler}` writes the handler's source
text into an `on:click` attribute and never binds a listener.

The check reports these prefixes on an intrinsic element or a custom element. `prop:`,
which writes a property on a custom element, and `bind:` keep their meaning, and any other
prefix, such as `xlink:href`, is part of the attribute's name and is not reported.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ024 (the widget reads an attribute literally named on:ready)
export const Widget = () => <legacy-widget on:ready="init" />;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ024 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
