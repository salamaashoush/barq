# @barqjs/router — API sketch (what D1/D2 look like in a file)

## A route, code-based, hand-written (no build step)

```ts
// app/routes/users.data.ts   — server functions ONLY. BARQ012 enforces that.
import { createServerFn } from "@barqjs/start";
import { requireUser } from "../auth.ts";
import { db } from "../db.ts";
import * as v from "valibot";

export const listUsers = createServerFn()
  .middleware([...requireUser])                 // .middleware REPLACES, so one call carries both
  .validator(v.object({ search: v.object({ page: v.number() }) }))
  .handler(({ search }) => db.users.page(search.page));

export const getUser = createServerFn()
  .middleware([...requireUser])
  .validator(v.object({ params: v.object({ id: v.string() }) }))
  .handler(({ params }) => db.users.get(params.id));
```

```tsx
// app/routes/users.tsx   — the component. No server function in this module.
import { listUsers } from "./users.data.ts";   // client: resolves to clientRpc(id)

export const loader = listUsers;               // NOT a server fn declaration; a reference
export default function Users(props: RouteProps<"/users">) {
  return <ul><For each={() => props.data().items}>{(u) => <li>{u().name}</li>}</For></ul>;
}
```

Note the shape: `export const loader = listUsers` re-exports a *reference*. `server_fn.rs`
records `export { x }` as "other" and does not resolve it, so this module is NOT mixed — it
exports a component and a plain binding. VERIFY THIS. If `export const loader = listUsers`
counts as a server-fn export, the whole shape collapses and the route must name the loader
in its route definition instead:

```ts
route({ path: "/users", component: () => import("./users.tsx"), loader: listUsers })
```

which is the fallback shape and needs no re-export at all.

## The route table

```ts
import { createRouter, route } from "@barqjs/router";
import { getUser, listUsers } from "./routes/users.data.ts";

export const routes = [
  route({
    path: "/users",
    component: lazy(() => import("./routes/users.tsx")),
    loader: listUsers,
    children: [
      route({ path: "/:id", component: lazy(() => import("./routes/user.tsx")), loader: getUser }),
    ],
  }),
];
```

## Generated (file-based)

`virtual:barq-routes` emits exactly the above from a directory scan, plus:
- the compiled matcher (`match(pathname) -> {routeId, params} | null`)
- `virtual:barq-routes.d.ts`: `interface RouteMap { "/users/:id": { params: {id: string};
  search: Out<typeof getUser.schema>; data: Awaited<ReturnType<typeof getUser>> } }`

`RouteMap` is what `<Link to>` types against and what D6's compiler check reads.

## The server entry

```ts
import { serveBarq } from "@barqjs/start/serve";
import { createPageHandler } from "@barqjs/router/server";
import { routes, reachable } from "virtual:barq-routes";
import "virtual:barq-server-fns";

serveBarq({ fetch: createPageHandler({ routes }), reachable });
```

`reachable` is D8's runtime half: `(id) => boolean` from the build-time manifest.

## Open ergonomic questions
- Does `loader` on a route definition take the server function VALUE, or its id? Value — the
  id is not stable until `mount()` stamps it (`server.ts:47`), and on the client `clientRpc`
  sets `meta.id` at construction (`index.ts:226`). So the value works on both sides; taking
  the id would work on the client and be empty on the server until mount ordering is right.
- Does a route get ONE loader or many? One, and a route that needs two values composes them
  inside the handler. Many would mean many endpoints per route and many chains to verify.
