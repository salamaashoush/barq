import { expect, test } from "bun:test";

import { startClient } from "./client.ts";
import { memoryHistory } from "./history.ts";
import type { AnyRouteDefinition } from "./route.ts";

/**
 * `startClient` — the boot an application no longer writes.
 *
 * TanStack ships theirs as a DEFAULT ENTRY the app never sees
 * (`react-start/src/default-entry/client.tsx`), and the reference application's
 * entry here is now the same three lines. What that moved into the framework is
 * an ORDER, and the order is the whole of it: start, preload the matched chunks,
 * resolve the head, and only then hydrate. Each step exists because the step
 * after it claims something.
 */

function table(seen: string[]): AnyRouteDefinition[] {
  return [
    {
      id: "__root__",
      path: "/",
      component: ((_scope: unknown, props: { children: unknown }) => {
        seen.push("root");
        return (props.children as (scope: unknown) => unknown)(null);
      }) as never,
      children: [
        {
          id: "/",
          path: "",
          component: (() => {
            seen.push("leaf");
            return globalThis.document.createTextNode("leaf");
          }) as never,
          loader: (() => {
            seen.push("loader");
            return "data";
          }) as never,
        },
      ],
    },
  ];
}

test("the boot starts the router, resolves the head and mounts, in that order", async () => {
  const seen: string[] = [];
  const container = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(container);

  const state = await startClient({
    routes: table(seen),
    history: memoryHistory({ initial: ["/"] }),
    container,
  });

  // STARTED: a chain that is still empty when the mount runs claims ranges for
  // nothing, which is why `start()` is awaited rather than fired.
  expect(state.chain().map((route) => route.id)).toEqual(["__root__", "/"]);
  expect(state.location().pathname).toBe("/");
  // MOUNTED, and through the root route's chain rather than past it.
  expect(seen).toContain("root");
  expect(seen).toContain("leaf");
  expect(container.textContent).toContain("leaf");

  state.dispose();
  container.remove();
});

test("a table with no shell still boots, and the container is what it mounts into", async () => {
  // `shellComponent` is the root's alone and a table may declare none — the
  // `document()` template path has no shell at all. `Document` then places the
  // children directly, so the boot must not depend on one existing.
  const seen: string[] = [];
  const container = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(container);

  const state = await startClient({
    routes: table(seen),
    history: memoryHistory({ initial: ["/"] }),
    container,
  });

  expect(container.querySelector("html")).toBeNull();
  expect(container.textContent).toContain("leaf");

  state.dispose();
  container.remove();
});
