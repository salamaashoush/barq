/**
 * Navigation blocking, at every door out of a page: `navigate`, the back and
 * forward buttons, and the tab itself.
 *
 * The back button is the one a `navigate`-only blocker misses, and the one a
 * user reaches for first. It is tested twice: against the memory history, which
 * pops synchronously, and against the browser history with a simulated
 * `popstate`, which is what a real back button is.
 */

import { type Cell, flush } from "@barqjs/core";
import { insert, render } from "@barqjs/web";
import { afterEach, describe, expect, test } from "bun:test";

import { type BlockerResolver, type ShouldBlockArgs, Block } from "./blocker.ts";
import { RouterProvider } from "./components.ts";
import { browserHistory, memoryHistory } from "./history.ts";
import { useBlocker } from "./hooks.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";

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

const page =
  (label: string, body: () => unknown = () => null) =>
  (_props: RouteProps): Node => {
    const node = document.createElement("section");
    node.append(label);
    const extra = body();
    if (extra !== null && extra !== undefined) insert(node, extra);
    return node;
  };

const table = (form: (props: RouteProps) => Node = page("form")): AnyRouteDefinition[] =>
  [
    { path: "/", component: page("home") },
    { path: "/form/$id", component: form },
    { path: "/done", component: page("done") },
  ] as never;

describe("a blocker and `navigate`", () => {
  test("shouldBlockFn is told where from, where to, and how", async () => {
    const asked: ShouldBlockArgs[] = [];
    const state = createRouter({
      routeTree: table(
        page("form", () => {
          useBlocker({
            shouldBlockFn: (args) => {
              asked.push(args);
              return true;
            },
            enableBeforeUnload: false,
          });
          return null;
        }),
      ),
      history: memoryHistory({ initial: ["/form/7?draft=1"] }),
    });
    const { host, dispose } = mountState(state);
    await state.navigate("/done?saved=0");
    flush();
    expect(host.textContent).toBe("form");
    expect(asked).toEqual([
      {
        action: "PUSH",
        current: {
          routeId: "/form/$id",
          fullPath: "/form/$id",
          pathname: "/form/7",
          params: { id: "7" },
          search: { draft: "1" },
        },
        next: {
          routeId: "/done",
          fullPath: "/done",
          pathname: "/done",
          params: {},
          search: { saved: "0" },
        },
      },
    ]);
    await state.navigate({ to: "/done", replace: true });
    expect(asked[1]?.action).toBe("REPLACE");
    dispose();
  });

  test("`ignoreBlocker` goes anyway, and `disabled` stops asking", async () => {
    let asked = 0;
    let disabled = false;
    const state = createRouter({
      routeTree: table(
        page("form", () => {
          useBlocker({
            shouldBlockFn: () => {
              asked++;
              return true;
            },
            disabled: () => disabled,
            enableBeforeUnload: false,
          });
          return null;
        }),
      ),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    const { host, dispose } = mountState(state);
    await state.navigate("/done");
    flush();
    expect(host.textContent).toBe("form");
    expect(asked).toBe(1);

    disabled = true;
    await state.navigate("/done");
    flush();
    expect(host.textContent).toBe("done");
    expect(asked).toBe(1);
    dispose();

    const second = createRouter({
      routeTree: table(),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    second.block(() => true);
    await second.navigate({ to: "/done", ignoreBlocker: true });
    expect(second.location().pathname).toBe("/done");
    second.dispose();
  });

  test("the blocker dies with the scope that registered it", async () => {
    const state = createRouter({
      routeTree: table(
        page("form", () => {
          useBlocker({ shouldBlockFn: () => false, enableBeforeUnload: false });
          return null;
        }),
      ),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    let asked = 0;
    const { dispose } = mountState(state);
    await state.navigate("/done");
    flush();
    // The form is gone, and so is its blocker: this one is the only one asked.
    state.block(() => {
      asked++;
      return false;
    });
    await state.navigate("/");
    expect(asked).toBe(1);
    dispose();
  });
});

describe("a blocker and the back button", () => {
  test("memory history: a refused pop is undone, and the page never moves", async () => {
    const history = memoryHistory({ initial: ["/"] });
    const state = createRouter({ routeTree: table(), history });
    const { host, dispose } = mountState(state);
    await state.navigate("/form/7");
    flush();
    expect(host.textContent).toBe("form");

    const actions: string[] = [];
    let refuse = true;
    const off = state.block(({ action, next }) => {
      actions.push(`${action} ${next.pathname}`);
      return refuse;
    });

    history.go(-1);
    await tick();
    flush();
    expect(actions).toEqual(["BACK /"]);
    expect(host.textContent).toBe("form");
    expect(state.location().pathname).toBe("/form/7");
    // The history is back where the page is, so the next Back is one step again.
    expect(history.current().pathname).toBe("/form/7");
    expect(history.depth?.()).toBe(1);

    refuse = false;
    history.go(-1);
    await tick();
    flush();
    expect(host.textContent).toBe("home");
    expect(state.location().pathname).toBe("/");

    // And forward, which is the same door from the other side.
    refuse = true;
    history.go(1);
    await tick();
    flush();
    expect(actions.at(-1)).toBe("FORWARD /form/7");
    expect(host.textContent).toBe("home");
    expect(history.current().pathname).toBe("/");

    off();
    history.go(1);
    await tick();
    flush();
    expect(host.textContent).toBe("form");
    dispose();
  });

  test("browser history: a simulated popstate is refused and the browser is sent back", async () => {
    window.history.replaceState(null, "", "/");
    const controller = new AbortController();
    const history = browserHistory({ signal: controller.signal });
    const state = createRouter({ routeTree: table(), history });
    const { host, dispose } = mountState(state);

    const home = window.history.state as unknown;
    await state.navigate("/form/7");
    flush();
    const form = window.history.state as unknown;
    expect(host.textContent).toBe("form");

    // What a browser does for Back and for `history.go`: move, then say so.
    const goes: number[] = [];
    const realGo = window.history.go;
    window.history.go = (delta: number) => {
      goes.push(delta);
    };
    const land = (entry: unknown, url: string): void => {
      window.history.replaceState(entry, "", url);
      window.dispatchEvent(new PopStateEvent("popstate", { state: entry }));
    };

    try {
      let refuse = true;
      const off = state.block(() => refuse);

      land(home, "/");
      await tick();
      flush();
      expect(host.textContent).toBe("form");
      expect(state.location().pathname).toBe("/form/7");
      // One step forward again, which is the exact undo of one step back.
      expect(goes).toEqual([1]);

      // The undo arrives as a popstate of its own, and is not a navigation.
      land(form, "/form/7");
      await tick();
      flush();
      expect(host.textContent).toBe("form");
      expect(goes).toEqual([1]);

      refuse = false;
      land(home, "/");
      await tick();
      flush();
      expect(host.textContent).toBe("home");
      expect(state.location().pathname).toBe("/");
      expect(goes).toEqual([1]);
      off();
    } finally {
      window.history.go = realGo;
      controller.abort();
      dispose();
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("a blocker and the tab", () => {
  const closing = (): boolean => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  test("`enableBeforeUnload` asks the browser to confirm, for as long as the blocker lives", () => {
    const state = createRouter({
      routeTree: table(),
      history: memoryHistory({ initial: ["/"] }),
    });
    expect(closing()).toBe(false);
    let dirty = true;
    const off = state.block(() => true, { enableBeforeUnload: () => dirty });
    expect(closing()).toBe(true);
    dirty = false;
    expect(closing()).toBe(false);
    dirty = true;
    off();
    expect(closing()).toBe(false);

    // A plain `block` does not guard the tab unless it is asked to.
    const plain = state.block(() => true);
    expect(closing()).toBe(false);
    plain();
    state.dispose();
  });

  test("useBlocker's options form guards the tab by default, and `disabled` lifts it", () => {
    let disabled = false;
    const state = createRouter({
      routeTree: table(
        page("form", () => {
          useBlocker({ shouldBlockFn: () => true, disabled: () => disabled });
          return null;
        }),
      ),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    const { dispose } = mountState(state);
    expect(closing()).toBe(true);
    disabled = true;
    expect(closing()).toBe(false);
    dispose();
    expect(closing()).toBe(false);
  });
});

describe("withResolver", () => {
  const withDialog = (): {
    state: RouterState;
    resolver: () => BlockerResolver;
  } => {
    let resolver: Cell<BlockerResolver> | undefined;
    const state = createRouter({
      routeTree: table(
        page("form", () => {
          resolver = useBlocker({
            shouldBlockFn: () => true,
            withResolver: true,
            enableBeforeUnload: false,
          });
          return null;
        }),
      ),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    return { state, resolver: () => (resolver as Cell<BlockerResolver>)() };
  };

  test("a blocked navigation waits on the resolver, and `proceed` lets it through", async () => {
    const { state, resolver } = withDialog();
    const { host, dispose } = mountState(state);
    expect(resolver().status).toBe("idle");

    const going = state.navigate("/done");
    await tick();
    flush();
    const blocked = resolver();
    expect(blocked.status).toBe("blocked");
    expect(blocked.next?.pathname).toBe("/done");
    expect(blocked.current?.pathname).toBe("/form/7");
    expect(blocked.action).toBe("PUSH");
    expect(host.textContent).toBe("form");

    blocked.proceed?.();
    await going;
    flush();
    expect(host.textContent).toBe("done");
    dispose();
  });

  test("`reset` keeps the page, and the resolver goes back to idle", async () => {
    const { state, resolver } = withDialog();
    const { host, dispose } = mountState(state);
    const going = state.navigate("/done");
    await tick();
    flush();
    resolver().reset?.();
    await going;
    flush();
    expect(host.textContent).toBe("form");
    expect(resolver().status).toBe("idle");
    dispose();
  });
});

describe("<Block>", () => {
  test("its children are handed the resolver, and render the confirmation from it", async () => {
    const state = createRouter({
      routeTree: table(
        page("form", () =>
          (Block as never as (props: unknown) => unknown)({
            shouldBlockFn: () => () => true,
            enableBeforeUnload: () => false,
            children: (resolver: Cell<BlockerResolver>) => {
              const node = document.createElement("button");
              insert(node, () => (resolver().status === "blocked" ? "leave?" : ""));
              node.addEventListener("click", () => resolver().proceed?.());
              return node;
            },
          }),
        ),
      ),
      history: memoryHistory({ initial: ["/form/7"] }),
    });
    const { host, dispose } = mountState(state);
    expect(host.textContent).toBe("form");
    const going = state.navigate("/done");
    await tick();
    flush();
    expect(host.textContent).toBe("formleave?");
    host.querySelector("button")?.dispatchEvent(new Event("click"));
    await going;
    flush();
    expect(host.textContent).toBe("done");
    dispose();
  });
});
