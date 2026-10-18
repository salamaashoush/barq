# BARQ025: `<Dynamic>` is rendered, where Solid 2.0 uses the `dynamic` factory

**Level:** error · [all codes](README.md)

## Message

> `<Dynamic>` is not exported by barq: Solid 2.0 deprecates it in favour of the `dynamic`
> factory, which is all barq has. Hoist one to the component body, or to the module when the
> choice reads only module state: `const Chosen = dynamic(() => …)` with what `component`
> held, then render `<Chosen …/>` with the other props.

## Failing example

```tsx
import { Dynamic } from "@barqjs/web";
import { Editor, Viewer } from "./fields";

export const Field = (props) => (
  <Dynamic component={props.editing() ? Editor : Viewer} value={props.value()} />
);
```

## Fixed example

```tsx
import { dynamic } from "@barqjs/web";
import { Editor, Viewer } from "./fields";

export const Field = (props) => {
  const Chosen = dynamic(() => (props.editing() ? Editor : Viewer));
  return <Chosen value={props.value()} />;
};
```

A source may answer with a tag name as well as a component, or with `null`, `undefined` or
`false` to render nothing:

```tsx
import { dynamic } from "@barqjs/web";

export const Heading = (props) => {
  const Tag = dynamic(() => `h${props.level()}`);
  return <Tag class="title">{props.children}</Tag>;
};
```

## Why this rule exists

Solid 2.0 replaces `<Dynamic component={…}>` with `dynamic(source)`, a factory that returns
a component whose tag or component is whatever `source` answers, and swaps it when the
answer changes. `<Dynamic>` puts the choice in the same props as the element's own, so
every instance has to take `component` back out of them and build the factory again;
`dynamic` is built once where it is hoisted. Solid keeps `<Dynamic>` deprecated, and barq,
which follows Solid 2.0, does not export it, so the import is `undefined` and the page
throws when it renders rather than when it builds.

The check reports a `<Dynamic>` tag, or `<core.Dynamic>` on a namespace import, whose
binding is the one imported from `@barqjs/web` or `@barqjs/core`. A component of your own named `Dynamic` is
not reported.

## Silencing one line

```tsx
import { Dynamic } from "@barqjs/web";
import { Chart } from "./chart";

// barq-ignore-next-line BARQ025 (a compatibility shim provides Dynamic at startup)
export const Panel = () => <Dynamic component={Chart} />;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ025 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
