/**
 * The devtools panel.
 *
 * It READS. The one property worth pinning hard is that it never writes: a
 * devtool that can change what it is observing is one whose readings cannot be
 * trusted.
 */

import { type Scope, flush, insert, render, settle } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { RouterProvider } from "./components.ts";
import { RouterDevtools } from "./devtools.ts";
import { memoryHistory } from "./history.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

const page =
  (labelText: string) =>
  (_scope: Scope | null, _props: RouteProps): Node =>
    document.createTextNode(labelText);

function mount(state: RouterState, open = true): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(
    ((scope: Scope | null) =>
      (RouterProvider as never as (s: Scope | null, p: unknown) => unknown)(scope, {
        state: () => state,
      })) as never,
    host,
  );
  const panelHost = document.createElement("div");
  document.body.append(panelHost);
  const disposePanel = render((scope: Scope | null) => {
    const node = document.createElement("div");
    insert(
      scope,
      node,
      () =>
        (RouterDevtools as never as (s: Scope | null, p: unknown) => unknown)(scope, {
          state: () => state,
          open: () => open,
        }) as never,
    );
    return node;
  }, panelHost);
  flush();
  return {
    host: panelHost,
    dispose: () => {
      disposePanel();
      dispose();
    },
  };
}

const routes: AnyRouteDefinition[] = [
  {
    id: "layout",
    path: "/app",
    context: () => ({ tenant: "acme" }),
    component: (scope: Scope | null, props: RouteProps) => {
      const node = document.createElement("div");
      insert(scope, node, () => props.children);
      return node;
    },
    children: [{ id: "leaf", path: "$id", component: page("leaf") }],
  },
] as never;

describe("RouterDevtools", () => {
  test("reports the url, the chain, the params and the context", async () => {
    const state = createRouter({
      routes,
      history: memoryHistory({ initial: ["/app/7?tab=a"] }),
    });
    const { host, dispose } = mount(state);
    await tick();
    await settle();
    flush();

    const text = host.textContent ?? "";
    expect(text).toContain("/app/7?tab=a");
    expect(text).toContain("layout › leaf");
    expect(text).toContain('"id": "7"'.replace(/\s/g, ""));
    expect(text).toContain("acme");
    dispose();
  });

  test("it never writes: the location is untouched by rendering it", async () => {
    const state = createRouter({ routes, history: memoryHistory({ initial: ["/app/7"] }) });
    const before = state.location();
    const { dispose } = mount(state);
    await tick();
    await settle();
    flush();
    expect(state.location()).toBe(before);
    expect(state.isNavigating()).toBe(false);
    dispose();
  });

  test("it follows a navigation rather than snapshotting one", async () => {
    const state = createRouter({ routes, history: memoryHistory({ initial: ["/app/7"] }) });
    const { host, dispose } = mount(state);
    flush();
    expect(host.textContent).toContain("/app/7");

    await state.navigate("/app/9");
    flush();
    expect(host.textContent).toContain("/app/9");
    dispose();
  });

  test("collapsed by default, so it is not in the way", () => {
    const state = createRouter({ routes, history: memoryHistory({ initial: ["/app/7"] }) });
    const { host, dispose } = mount(state, false);
    const panel = host.querySelector("[data-barq-devtools]") as HTMLElement;
    const body = panel.lastChild as HTMLElement;
    expect(body.style.display).toBe("none");
    dispose();
  });
});
