# BARQ005 — props destructured in the parameter list

**Level:** warning · **Rule family:** D3 · [all codes](README.md)

## What fires

A function the compiler proved is a component — it returns JSX, and the module either
writes it as a tag or exports it — whose single parameter is an object pattern.

```jsx
function Chip({ text, tone }) {      // BARQ005
  return <span data-tone={tone}>{text}</span>
}
```

## What it means, and what it does not

**The pattern is not wrong.** Vue and Svelte both moved props destructuring *into* the
compiler and made it work; Vue's Reactive Props Destructure compiles `const { count } =
defineProps()` to `__props.count`, justified as "Props is a component-only concept… the
boundary here is very clear. The magic never leaks into normal JS/TS code"
([vuejs/rfcs#502][rfc502]).

**barq structurally cannot follow them.** `lower::lower` is handed no `Program` — it cannot
touch the AST because it is not given one — and codegen only splices at the sites harvest
recorded. There is no stage that could rewrite a parameter pattern into member reads.

So: barq lowers reactive props to getters, a parameter pattern reads every one of them
exactly once at call time, and the names it binds are snapshots.

## The fix

Read them where they are used:

```jsx
function Chip(props) {
  return <span data-tone={props.tone}>{props.text}</span>
}
```

or take them apart with the helpers, which preserve the getters:

```jsx
function Chip(props) {
  const [own, rest] = splitProps(props, ["tone"])
  return <span data-tone={own.tone} {...rest} />
}
```

`mergeProps(defaults, props)` is the defaulting form; a destructuring default
(`{ tone = "warm" }`) has the same flattening problem as the destructuring itself.

## The accepted false positive

A prop whose **value** is an accessor stays live when destructured, because what was
flattened is a function and calling it is still a tracked read:

```jsx
function Chip({ text }: { text: () => string }) {
  return <span>{text}</span>        // still live — BARQ005 fires anyway
}
```

`fixtures/props-destructured-param.tsx` is exactly this shape and exists to pin it. The
compiler cannot tell the safe case from the unsafe one, because `oxc_semantic` carries no
types.

This is accepted rather than narrowed. [`solid/no-destructure`][nd] accepts the same class
and has **zero** false-positive issues in its tracker. The narrowing ERGONOMICS §4.6 offers
as the alternative — "a destructured binding subsequently read inside a JSX site" — does not
in fact exclude it: that fixture reads both destructured names inside JSX sites.

**The measured rate.** One of the 117 fixtures, and one of the 71 `.tsx` files in this
repo's own packages: `packages/testing/src/index.test.tsx:6`,
`function Counter({ initial = 0 })`, where `initial` seeds a `useState` exactly once and
the code is correct. That file is also where the matching false **negative** lives —
`function ThemeWrapper({ children })` on line 21 is silent, because it is only ever passed
as a value and so never produces the tag-or-export evidence.

## What does not fire

- `function Chip(props)` — the shape the compiler can keep reactive.
- `<For each={…}>{({ text }) => …}</For>` — a row callback is one destructured
  JSX-returning parameter too, and it is not a component. The tag-or-export evidence is
  what separates them.
- Arity other than one, or a rest parameter — a different shape, scoped out exactly as
  `solid/no-destructure` scopes it: "catching it in the params covers the most common cases
  with good DX."
- A function that returns no JSX.
- A component used only as a **value** — `withTheme(ThemeWrapper)`, `<Route
  component={Page}/>`. The evidence D3 needs is "written as a JSX tag, or exported", and a
  one-parameter JSX-returning arrow that never produces it is indistinguishable from a
  `<For>` row callback.

## Silencing it

```jsx
// barq-ignore-next-line BARQ005 (every prop here is an accessor by contract)
function Chip({ text }: { text: () => string }) { … }
```

[rfc502]: https://github.com/vuejs/rfcs/discussions/502
[nd]: https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-destructure.md
