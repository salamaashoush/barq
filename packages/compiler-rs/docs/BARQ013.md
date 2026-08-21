# BARQ013 — `<Link to>` names a path no route matches

**Level:** warning. Raise it with `checks: { BARQ013: "error" }`.

A `<Link>` or `<NavLink>` imported from `@barqjs/router` was given a literal
`to` that matches none of the project's routes.

```tsx
import { Link } from "@barqjs/router";

// routes: "/", "/users", "/users/$id"
<Link to="/user/7">go</Link>   // BARQ013: `/user`, not `/users`
```

A dead link is invisible until someone clicks it. Every other check in this
compiler is about a shape that will misbehave at runtime; this one is about a
string that will 404, and a typo in a path is the single easiest mistake to make
and the hardest to notice.

## When it does not fire

The check is deliberately narrow, because a link check that guesses is a link
check people turn off.

- **No route table.** The compiler sees one module; the route set is a
  whole-project fact and arrives as the `routes` option. Without it the check is
  off entirely, so a project with a hand-written table and no build integration
  is never warned.
- **`to` is not a literal.** `to={path}` is a value the compiler cannot know.
- **`to` is relative.** `to="edit"` resolves against a location that only exists
  at runtime.
- **`to` leaves the application** — `https:`, `mailto:`, `tel:`, `//host`, `#frag`.
- **`Link` came from somewhere else.** Resolution is by `SymbolId` against
  `routerSource`, so your own component named `Link` is not this one — and
  `import { Link as Anchor }` still is.

## Matching

A `to` matches a route pattern segment by segment. `$name` takes exactly one
segment and a bare `$` takes the rest, which is the runtime matcher's rule minus
its ranking — ranking decides WHICH route wins, and this check only asks whether
any does.

Writing the pattern itself matches, since that is what `<Link to>` takes
alongside `params`:

```tsx
<Link to="/users/$id" params={{ id: "7" }}>go</Link>   // fine
```

## Fixing it

Correct the path, or add the route. If the path is built rather than written,
give `<Link>` a route id and `params` instead of a template string — that form
is checked and a template string cannot be.
