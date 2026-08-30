/**
 * `renderRoute`, and the boot order that is the whole reason it exists.
 *
 * TanStack's docs have every project write its own `createTestRouter`, which is
 * four lines because their provider boots internally. barq's has two awaits in
 * it, and a project that omits them gets a suite that passes while measuring a
 * fallback.
 */

import { describe, expect, test } from "bun:test";

import { type AnyRouteDefinition, Outlet } from "@barqjs/router";

import { renderRoute } from "./router.ts";

/**
 * REAL JSX, compiled by the real compiler.
 *
 * `preload.ts` hands every `.tsx` in this package to `@barqjs/compiler-rs`, so
 * these are lowered exactly as a user's routes are. Hand-written components were
 * tried and are the wrong fixture: one that builds a node imperatively and
 * returns it renders correctly the first time and does not re-key when the chain
 * changes, so `navigate` left the container empty and the failure looked like a
 * bug in `renderRoute`.
 */
function Home(): unknown {
  return <h1>home</h1>;
}

function About(): unknown {
  return <h1>about</h1>;
}

function Pending(): unknown {
  return <h1>loading</h1>;
}

/**
 * `(props)`, the AUTHORED form. The compiler threads the scope in front of it,
 * so a component written `(scope, props)` gets a THIRD parameter and `props`
 * lands where nothing recognises it — its reads stop being tracked and the
 * route sits on its pending component forever. `router.test.ts:218` writes
 * `(scope, props)` because those components are hand-built DOM that the
 * compiler never lowers; a JSX one is not the same thing.
 */
function Post(props: { data: () => { title: string } | undefined }): unknown {
  return <h1>{props.data()?.title ?? "loading"}</h1>;
}

const tree = (log?: string[]): AnyRouteDefinition[] =>
  [
    {
      path: "/",
      component: Outlet as never,
      children: [
        { path: "", component: Home as never },
        { path: "about", component: About as never },
        {
          path: "posts/$id",
          pendingComponent: Pending as never,
          loader: async ({ params }: { params: { id: string } }) => {
            log?.push(params.id);
            return { title: `post ${params.id}` };
          },
          component: Post as never,
        },
      ],
    },
  ] as never;

describe("renderRoute", () => {
  test("renders the matched route, and binds queries to its container", async () => {
    const view = await renderRoute({ routeTree: tree() });
    expect(view.getByText("home")).toBeDefined();
    expect(view.container.textContent).toBe("home");
    view.unmount();
  });

  /**
   * THE REASON THE HELPER IS ASYNC. `RouterProvider` calls `state.start()` with
   * `void` because a mount cannot await, so a test that renders and asserts
   * immediately sees the loader's pending state. Both awaits are in the helper,
   * so the first assertion after it is against a settled route.
   */
  test("a loader has already settled when it returns", async () => {
    const log: string[] = [];
    const view = await renderRoute({ routeTree: tree(log), path: "/posts/7" });
    expect(view.container.textContent).toBe("post 7");
    expect(log).toEqual(["7"]);
    view.unmount();
  });

  test("`navigate` flushes, so the next assertion sees the new page", async () => {
    const view = await renderRoute({ routeTree: tree(), path: "/" });
    expect(view.container.textContent).toBe("home");
    await view.navigate("/about");
    expect(view.container.textContent).toBe("about");
    expect(view.state.location().pathname).toBe("/about");
    view.unmount();
  });

  /**
   * `navigate` settles the incoming route, loader included.
   *
   * This assertion read `"loading"` for a while and the helper carried a
   * comment explaining why a loader could not have settled yet. Both were
   * wrong, and the cause was a COMPILER bug rather than a router one: the
   * component was written `(scope, props)`, which puts `props` at the third
   * parameter once the compiler prepends its scope, so `props.data()` was not
   * recognised as a tracked read and the page never re-rendered. Written
   * `(props)`, it settles.
   */
  test("navigating to a route with a loader settles it", async () => {
    const log: string[] = [];
    const view = await renderRoute({ routeTree: tree(log), path: "/" });
    await view.navigate("/posts/3");
    expect(view.container.textContent).toBe("post 3");
    expect(log).toEqual(["3"]);
    view.unmount();
  });

  test("`initial` seeds a whole history stack", async () => {
    const view = await renderRoute({ routeTree: tree(), initial: ["/", "/posts/1"] });
    expect(view.container.textContent).toBe("post 1");
    view.unmount();
  });
});

describe("the render registry keys by reference, not by shape", () => {
  /**
   * `mountedContainers.delete({ container, dispose })` deleted a fresh literal,
   * which a `Set` never holds — so an explicitly unmounted render stayed
   * registered and `cleanup()` disposed it a SECOND time. A router makes that
   * visible: disposing one twice is what this would catch.
   */
  test("unmounting twice disposes once", async () => {
    let disposals = 0;
    const view = await renderRoute({ routeTree: tree() });
    const realDispose = view.state.dispose.bind(view.state);
    (view.state as { dispose: () => void }).dispose = () => {
      disposals++;
      realDispose();
    };
    view.unmount();
    // What `cleanup()` does to anything still registered. If `unmount` failed to
    // remove the entry, this is the second disposal.
    const { cleanup } = await import("./pure.ts");
    cleanup();
    expect(disposals).toBe(1);
  });
});
