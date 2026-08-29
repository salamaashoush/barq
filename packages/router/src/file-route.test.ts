/**
 * `createFileRoute` / `createRootRoute` — the authoring surface, and the part of
 * it that can go wrong at RUNTIME.
 *
 * The shape itself is TanStack's and is checked by using it. What is worth a
 * test is the route-scoped hooks' `from:` guarantee: `Route.useLoaderData()`
 * copied into a sibling module reads as correct and would otherwise hand back
 * another route's data.
 */

import { describe, expect, test } from "bun:test";

import {
  ROOT_ROUTE_ID,
  createFileRoute,
  createRootRoute,
  createRootRouteWithContext,
} from "./file-route.ts";

describe("createFileRoute", () => {
  test("the argument is the route id, and the options are carried verbatim", () => {
    const loader = (): string => "x";
    const component = (): null => null;
    const Route = createFileRoute("/posts/$postId")({ loader, component });

    expect(Route.id).toBe("/posts/$postId");
    // VERBATIM, because the generated table reaches through `options` and a
    // wrapper here would mean the table and the module disagree about what the
    // route declared.
    expect(Route.options.loader).toBe(loader);
    expect(Route.options.component).toBe(component);
  });

  test("an index route's id ends in a slash, which is what keeps it off its layout", () => {
    // TanStack's convention and barq's generator agree: `/posts` is the layout
    // and `/posts/` is its index, so the two cannot collide as cache keys.
    expect(createFileRoute("/posts/")({}).id).toBe("/posts/");
    expect(createFileRoute("/posts")({}).id).toBe("/posts");
  });

  test("every route-scoped hook is present", () => {
    const Route = createFileRoute("/a")({});
    for (const hook of [
      "useLoaderData",
      "useParams",
      "useRouteContext",
      "useMatch",
      "useNavigate",
    ] as const) {
      expect(typeof Route[hook]).toBe("function");
    }
  });
});

describe("createRootRoute", () => {
  test("the root takes the reserved id, which the root INDEX cannot collide with", () => {
    expect(createRootRoute({}).id).toBe(ROOT_ROUTE_ID);
    expect(ROOT_ROUTE_ID).toBe("__root__");
    expect(createFileRoute("/")({}).id).toBe("/");
  });

  test("a shell is a root-route option, and only the root has one", () => {
    const shellComponent = (): null => null;
    expect(createRootRoute({ shellComponent }).options.shellComponent).toBe(shellComponent);
  });

  test("createRootRouteWithContext is curried and produces the same root", () => {
    // Curried for the reason theirs is: TypeScript has no partial type-argument
    // inference, so the context has to be named in a call that infers nothing else.
    const Route = createRootRouteWithContext<{ user: string }>()({
      context: () => ({ user: "ada" }),
    });
    expect(Route.id).toBe(ROOT_ROUTE_ID);
    expect(typeof Route.options.context).toBe("function");
  });
});

describe("a route-scoped hook belongs to the module that declared it", () => {
  test("called outside a route component, it says so by name", () => {
    const Route = createFileRoute("/posts/$postId")({});
    // No match is ambient here, which is exactly the "copied into a helper"
    // case. A silent `undefined` would read as "this route has no data".
    expect(() => Route.useLoaderData()).toThrow(/outside a route component/);
    expect(() => Route.useParams()).toThrow(/"\/posts\/\$postId"/);
  });
});
