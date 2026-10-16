# BARQ013: `<Link to>` names a path that no route matches

**Level:** warning · [all codes](README.md)

## Message

> `to="/user/7"` matches none of this project's routes, so following this link shows the
> not-found page. Correct the path, or add a route for it.

## Failing example

With the routes `/`, `/users` and `/users/$id`:

```tsx
import { Link } from "@barqjs/router";

export const Nav = () => <Link to="/user/7">Profile</Link>;
```

## Fixed example

```tsx
import { Link } from "@barqjs/router";

export const Nav = () => <Link to="/users/7">Profile</Link>;
```

The route pattern itself also matches, which is the form to use with `params`:

```tsx
import { Link } from "@barqjs/router";

export const Nav = () => (
  <Link to="/users/$id" params={{ id: "7" }}>
    Profile
  </Link>
);
```

## Why this rule exists

A mistyped path is not an error anywhere else: it type-checks, it renders, and it fails
only when someone follows the link. This check compares the path with the project's
routes at build time.

It runs when the build knows the routes (file-based routing passes them to the compiler)
and only for a literal, absolute `to` on a `Link` or `NavLink` imported from
`@barqjs/router`. A variable, a relative path, an external URL and a `#fragment` are not
checked.

## Silencing one line

```tsx
import { Link } from "@barqjs/router";

// barq-ignore-next-line BARQ013 (this path is served by another application)
export const Nav = () => <Link to="/user/7">Profile</Link>;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ013 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
