/**
 * The match-reading hooks: `from`, `select`, `strict` and `shouldThrow`, the
 * match lists, `getRouteApi`, and `useRouterState`.
 *
 * The property worth a test beyond "it returns the value" is that `select` is
 * FINE-GRAINED: a hole reading a selected value re-runs when that value changed
 * and at no other time. Each of those tests counts the hole's runs across a
 * navigation that moves something else.
 */

import { type Cell, flush } from "@barqjs/core";
import { insert, render } from "@barqjs/web";
import { afterEach, describe, expect, test } from "bun:test";

import { RouterProvider } from "./components.ts";
import { createFileRoute } from "./file-route.ts";
import { memoryHistory } from "./history.ts";
import {
  useCanGoBack,
  useChildMatches,
  useLoaderData,
  useLoaderDeps,
  useLocation,
  useMatch,
  useMatches,
  useNavigate,
  useParams,
  useParentMatches,
  useRouteContext,
  useRouterState,
  useSearch,
} from "./hooks.ts";
import { getRouteApi, useAwaited } from "./match.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouteMatch, type RouterState, createRouter } from "./router.ts";

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  document.body.innerHTML = "";
});

function mountState(state: RouterState): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    (() =>
      (RouterProvider as never as (p: unknown) => unknown)({
        state: () => state,
      })) as never,
    host,
  );
  flush();
  return { host, dispose };
}

/** A layout that places its child, and runs `body` under its own match first. */
const layout =
  (body: () => void = () => {}) =>
  (props: RouteProps): Node => {
    body();
    const node = document.createElement("div");
    insert(node, () => props.children);
    return node;
  };

/** A leaf whose only content is one hole, counted. */
function probe<T>(read: () => Cell<T>): {
  component: (props: RouteProps) => Node;
  runs: () => number;
  value: () => T;
} {
  let runs = 0;
  let cell: Cell<T> | undefined;
  return {
    component: () => {
      cell = read();
      const node = document.createElement("p");
      insert(node, () => {
        runs++;
        return JSON.stringify((cell as Cell<T>)());
      });
      return node;
    },
    runs: () => runs,
    value: () => (cell as Cell<T>)(),
  };
}

const routes = (leaf: (props: RouteProps) => Node, body?: () => void): AnyRouteDefinition[] =>
  [
    {
      id: "__root__",
      path: "/",
      component: layout(),
      children: [
        { id: "/", path: "", component: () => document.createTextNode("home") },
        {
          id: "/posts",
          path: "posts",
          component: layout(body),
          context: () => ({ section: "posts" }),
          staticData: { crumb: "Posts" },
          children: [
            {
              id: "/posts/$id",
              path: "$id",
              component: leaf,
              validateSearch: (input: Record<string, unknown>) => ({
                tab: String(input.tab ?? "info"),
                page: Number(input.page ?? 1),
              }),
              loaderDeps: ({ search }: { search: URLSearchParams }) => ({
                page: Number(search.get("page") ?? 1),
              }),
              loader: ({ params, deps }: { params: { id: string }; deps: { page: number } }) => ({
                title: `post ${params.id}`,
                page: deps.page,
              }),
              beforeLoad: () => ({ canEdit: true }),
            },
          ],
        },
      ],
    },
  ] as never;

async function at(
  initial: string,
  leaf: (props: RouteProps) => Node,
  body?: () => void,
): Promise<{ state: RouterState; host: HTMLElement; dispose: () => void }> {
  const state = createRouter({
    routeTree: routes(leaf, body),
    history: memoryHistory({ initial: [initial] }),
    context: { user: "salama" },
  });
  await state.load();
  const mounted = mountState(state);
  await tick(5);
  flush();
  return { state, ...mounted };
}

const go = async (state: RouterState, to: string): Promise<void> => {
  await state.navigate(to);
  await state.load();
  flush();
  await tick(5);
  flush();
};

describe("useMatches", () => {
  test("answers with MATCHES, outermost first, each carrying what its route resolved", async () => {
    const seen = probe(() => useMatches());
    const { state, dispose } = await at("/posts/7?tab=a&page=2", seen.component);
    const matches = seen.value();
    expect(matches.map((match) => match.routeId)).toEqual(["__root__", "/posts", "/posts/$id"]);
    expect(matches.map((match) => match.pathname)).toEqual(["/", "/posts", "/posts/7"]);
    const leaf = matches[2];
    expect(leaf.params).toEqual({ id: "7" });
    expect(leaf.search).toEqual({ tab: "a", page: 2 });
    expect(leaf.loaderData).toEqual({ title: "post 7", page: 2 });
    expect(leaf.loaderDeps).toEqual({ page: 2 });
    expect(leaf.context).toEqual({ user: "salama", section: "posts", canEdit: true });
    expect(leaf.status).toBe("success");
    expect(matches[1]?.staticData).toEqual({ crumb: "Posts" });
    expect(matches[1]?.context).toEqual({ user: "salama", section: "posts" });
    // One id per match, and the route's own id beside it.
    expect(new Set(matches.map((match) => match.id)).size).toBe(3);
    await go(state, "/posts/8?tab=a&page=2");
    expect(seen.value()[2]?.id).not.toBe(leaf.id);
    dispose();
  });

  test("`select` is memoized: a navigation that does not change the selection does not re-run its reader", async () => {
    const seen = probe(() =>
      useMatches({ select: (matches) => matches.map((match) => match.routeId) }),
    );
    const { state, dispose } = await at("/posts/7", seen.component);
    expect(seen.value()).toEqual(["__root__", "/posts", "/posts/$id"]);
    const before = seen.runs();
    await go(state, "/posts/8?tab=b");
    // Every match changed and the list of route ids did not.
    expect(seen.runs()).toBe(before);
    dispose();
  });

  test("useChildMatches and useParentMatches are relative to the route rendering the caller", async () => {
    let children: Cell<readonly string[]> | undefined;
    let parents: Cell<readonly string[]> | undefined;
    const ids = (matches: readonly RouteMatch[]): readonly string[] =>
      matches.map((match) => match.routeId);
    const { dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        children = useChildMatches({ select: ids });
        parents = useParentMatches({ select: ids });
      },
    );
    expect(children?.()).toEqual(["/posts/$id"]);
    expect(parents?.()).toEqual(["__root__"]);
    dispose();
  });
});

describe("useMatch", () => {
  test("by id it is that route's match or null, and with no id it is the leaf", async () => {
    let byId: Cell<RouteMatch | null> | undefined;
    let leaf: Cell<RouteMatch | null> | undefined;
    let absent: Cell<RouteMatch | null> | undefined;
    const { state, dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        byId = useMatch("/posts");
        leaf = useMatch();
        absent = useMatch("/nowhere");
      },
    );
    expect(byId?.()?.routeId).toBe("/posts");
    // A match can be read wherever a route was: the pattern and the definition ride along.
    expect(byId?.()?.fullPath).toBe("/posts");
    expect(byId?.()?.definition.staticData).toEqual({ crumb: "Posts" });
    expect(leaf?.()?.routeId).toBe("/posts/$id");
    expect(absent?.()).toBeNull();
    state.dispose();
    dispose();
  });

  test("with options it is the NEAREST match, or the one `from` names", async () => {
    let nearest: Cell<string> | undefined;
    let named: Cell<Record<string, string>> | undefined;
    const { dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        nearest = useMatch({ select: (match) => match.routeId });
        named = useMatch({ from: "/posts/$id", select: (match) => match.params });
      },
    );
    expect(nearest?.()).toBe("/posts");
    expect(named?.()).toEqual({ id: "7" });
    dispose();
  });

  test("a `from` that is not matched throws at the call, unless `shouldThrow` is false", async () => {
    let thrown: unknown;
    let loose: Cell<RouteMatch | undefined> | undefined;
    const { dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        try {
          useMatch({ from: "/settings" });
        } catch (error) {
          thrown = error;
        }
        loose = useMatch({ from: "/settings", shouldThrow: false });
      },
    );
    expect((thrown as Error).message).toContain('useMatch({ from: "/settings" })');
    expect(loose?.()).toBeUndefined();
    dispose();
  });
});

describe("the value hooks take `from` and `select`", () => {
  test("useParams: a selected param re-runs its reader when it changes and not when the query does", async () => {
    const seen = probe(() => useParams({ from: "/posts/$id", select: (params) => params.id }));
    const { state, dispose } = await at("/posts/7", seen.component);
    expect(seen.value()).toBe("7");
    const before = seen.runs();
    await go(state, "/posts/7?tab=b");
    expect(seen.runs()).toBe(before);
    await go(state, "/posts/8?tab=b");
    expect(seen.value()).toBe("8");
    expect(seen.runs()).toBe(before + 1);
    dispose();
  });

  test("useSearch: one key of the validated search, typed by the validator", async () => {
    const seen = probe(() =>
      useSearch({
        from: "/posts/$id",
        select: (search: { tab: string; page: number }) => search.page,
      }),
    );
    const { state, dispose } = await at("/posts/7?page=2", seen.component);
    expect(seen.value()).toBe(2);
    const before = seen.runs();
    await go(state, "/posts/7?page=2&tab=other");
    expect(seen.runs()).toBe(before);
    await go(state, "/posts/7?page=3&tab=other");
    expect(seen.value()).toBe(3);
    dispose();
  });

  test("useLoaderData and useLoaderDeps read the named route's own", async () => {
    let data: Cell<string> | undefined;
    let deps: Cell<{ page: number }> | undefined;
    const { state, dispose } = await at("/posts/7?page=4", () => {
      data = useLoaderData({
        from: "/posts/$id",
        select: (loaded: { title: string }) => loaded.title,
      });
      deps = useLoaderDeps({ from: "/posts/$id" });
      return document.createTextNode("leaf");
    });
    expect(data?.()).toBe("post 7");
    expect(deps?.()).toEqual({ page: 4 });
    await go(state, "/posts/8?page=4");
    expect(data?.()).toBe("post 8");
    dispose();
  });

  test("useLoaderData with no `from` is the route rendering the caller", async () => {
    let data: Cell<{ title: string }> | undefined;
    const { dispose } = await at("/posts/7", () => {
      data = useLoaderData<{ title: string }>();
      return document.createTextNode("leaf");
    });
    expect(data?.().title).toBe("post 7");
    dispose();
  });

  test("useRouteContext: the whole chain's by default, one route's with `from`", async () => {
    let whole: Cell<Record<string, unknown>> | undefined;
    let layoutOnly: Cell<Record<string, unknown>> | undefined;
    let picked: Cell<unknown> | undefined;
    const { dispose } = await at("/posts/7", () => {
      whole = useRouteContext();
      layoutOnly = useRouteContext({ from: "/posts" });
      picked = useRouteContext({ select: (context) => context.user });
      return document.createTextNode("leaf");
    });
    expect(whole?.()).toEqual({ user: "salama", section: "posts", canEdit: true });
    expect(layoutOnly?.()).toEqual({ user: "salama", section: "posts" });
    expect(picked?.()).toBe("salama");
    dispose();
  });

  test("useLocation takes a select too", async () => {
    const seen = probe(() => useLocation({ select: (location) => location.pathname }));
    const { state, dispose } = await at("/posts/7", seen.component);
    const before = seen.runs();
    await go(state, "/posts/7?tab=b");
    expect(seen.runs()).toBe(before);
    expect(seen.value()).toBe("/posts/7");
    dispose();
  });
});

describe("useRouterState", () => {
  test("is the router's state as one value: TanStack's fields, and barq's two", async () => {
    const seen = probe(() => useRouterState());
    const { dispose } = await at("/posts/7?tab=a", seen.component);
    const value = seen.value();
    expect(value.status).toBe("idle");
    expect(value.isLoading).toBe(false);
    expect(value.isTransitioning).toBe(false);
    expect(value.isNavigating).toBe(false);
    expect(value.location.pathname).toBe("/posts/7");
    expect(value.resolvedLocation?.pathname).toBe("/posts/7");
    expect(value.params).toEqual({ id: "7" });
    expect(value.matches.map((match) => match.routeId)).toEqual([
      "__root__",
      "/posts",
      "/posts/$id",
    ]);
    dispose();
  });

  test("`select` narrows it, and the reader re-runs only when the selection moved", async () => {
    const seen = probe(() => useRouterState({ select: (state) => state.location.pathname }));
    const { state, dispose } = await at("/posts/7", seen.component);
    const before = seen.runs();
    await go(state, "/posts/7?tab=b#x");
    expect(seen.runs()).toBe(before);
    await go(state, "/posts/8");
    expect(seen.value()).toBe("/posts/8");
    expect(seen.runs()).toBe(before + 1);
    dispose();
  });

  test("`isLoading` follows a navigation's cold loader", async () => {
    const statuses: string[] = [];
    let loading: Cell<boolean> | undefined;
    const state = createRouter({
      routeTree: [
        {
          id: "__root__",
          path: "/",
          component: layout(() => {
            loading = useRouterState({ select: (router) => router.isLoading });
          }),
          children: [
            { id: "/", path: "", component: () => document.createTextNode("home") },
            {
              id: "/slow",
              path: "slow",
              component: (props: RouteProps) => document.createTextNode(String(props.data())),
              loader: async () => {
                await tick(20);
                return "slow";
              },
            },
          ],
        },
      ] as never,
      history: memoryHistory({ initial: ["/"] }),
    });
    await state.load();
    const { dispose } = mountState(state);
    statuses.push(String(loading?.()));
    await state.navigate("/slow");
    flush();
    statuses.push(String(loading?.()));
    await state.load();
    flush();
    statuses.push(String(loading?.()));
    expect(statuses).toEqual(["false", "true", "false"]);
    dispose();
  });
});

describe("getRouteApi", () => {
  test("is a route's hooks with `from` already said", async () => {
    const api = getRouteApi("/posts/$id");
    let params: Cell<unknown> | undefined;
    let search: Cell<unknown> | undefined;
    let data: Cell<unknown> | undefined;
    let deps: Cell<unknown> | undefined;
    let context: Cell<unknown> | undefined;
    let match: Cell<unknown> | undefined;
    const { dispose } = await at("/posts/7?page=2", () => {
      params = api.useParams();
      search = api.useSearch({ select: (value) => value.tab });
      data = api.useLoaderData();
      deps = api.useLoaderDeps();
      context = api.useRouteContext({ select: (value) => value.canEdit });
      match = api.useMatch({ select: (value) => value.pathname });
      return document.createTextNode("leaf");
    });
    expect(api.id).toBe("/posts/$id");
    expect(params?.()).toEqual({ id: "7" });
    expect(search?.()).toBe("info");
    expect(data?.()).toEqual({ title: "post 7", page: 2 });
    expect(deps?.()).toEqual({ page: 2 });
    expect(context?.()).toBe(true);
    expect(match?.()).toBe("/posts/7");
    dispose();
  });

  test("works from a component ABOVE the route it names, once that route is matched", async () => {
    const api = getRouteApi("/posts/$id");
    let params: Cell<unknown> | undefined;
    const { dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        params = api.useParams();
      },
    );
    expect(params?.()).toEqual({ id: "7" });
    dispose();
  });

  test("its navigate resolves a relative target from the route", async () => {
    const api = getRouteApi("/posts");
    let navigate: ReturnType<typeof useNavigate> | undefined;
    const { state, dispose } = await at("/posts/7", () => {
      navigate = api.useNavigate();
      return document.createTextNode("leaf");
    });
    await navigate?.({ to: "./$id", params: { id: "9" } });
    expect(state.location().pathname).toBe("/posts/9");
    dispose();
  });
});

describe("a file route's own hooks", () => {
  test("take `select`, and carry useSearch and useLoaderDeps", async () => {
    const Route = createFileRoute("/posts/$id")({});
    let search: Cell<unknown> | undefined;
    let deps: Cell<unknown> | undefined;
    let title: Cell<unknown> | undefined;
    let match: Cell<unknown> | undefined;
    const { dispose } = await at("/posts/7?page=5", () => {
      search = Route.useSearch();
      deps = Route.useLoaderDeps();
      title = Route.useLoaderData({ select: (data) => (data as { title: string }).title });
      match = Route.useMatch({ select: (found) => found?.routeId });
      return document.createTextNode("leaf");
    });
    expect(search?.()).toEqual({ tab: "info", page: 5 });
    expect(deps?.()).toEqual({ page: 5 });
    expect(title?.()).toBe("post 7");
    expect(match?.()).toBe("/posts/$id");
    dispose();
  });
});

describe("useNavigate", () => {
  test("takes the object form, and a default `from`", async () => {
    let navigate: ReturnType<typeof useNavigate> | undefined;
    let relative: ReturnType<typeof useNavigate> | undefined;
    const { state, dispose } = await at("/posts/7", () => {
      navigate = useNavigate();
      relative = useNavigate({ from: "/posts" });
      return document.createTextNode("leaf");
    });
    await navigate?.({ to: "/posts/$id", params: { id: "8" }, search: { tab: "b" } });
    expect(state.location().pathname + state.location().search).toBe("/posts/8?tab=b");
    await relative?.({ to: "./$id", params: { id: "9" } });
    expect(state.location().pathname).toBe("/posts/9");
    await navigate?.("/");
    expect(state.location().pathname).toBe("/");
    dispose();
  });
});

describe("useCanGoBack", () => {
  test("is false on the first entry and true once there is one behind it", async () => {
    let canGoBack: Cell<boolean> | undefined;
    const { state, dispose } = await at(
      "/posts/7",
      () => document.createTextNode("leaf"),
      () => {
        canGoBack = useCanGoBack();
      },
    );
    expect(canGoBack?.()).toBe(false);
    await go(state, "/posts/8");
    expect(canGoBack?.()).toBe(true);
    dispose();
  });
});

describe("useAwaited", () => {
  test("is a promise's value as a cell, pending until it settles", async () => {
    let value: Cell<string> | undefined;
    let handed: Promise<string> | undefined;
    const { promise, resolve } = Promise.withResolvers<string>();
    const { dispose } = await at("/posts/7", () => {
      [value, handed] = useAwaited({ promise });
      return document.createTextNode("leaf");
    });
    expect(handed).toBe(promise);
    expect(() => value?.()).toThrow();
    resolve("settled");
    await promise;
    await tick(5);
    flush();
    expect(value?.()).toBe("settled");
    dispose();
  });
});
