/**
 * `<CatchBoundary>` and `<CatchNotFound>`: an error boundary an application
 * places itself.
 *
 * What matters is what each one does NOT catch as much as what it does:
 * `<CatchNotFound>` has to let an ordinary failure through to the boundary
 * above, or a 404 fallback ends up rendering for a crash.
 */

import { createSignal, flush, markSafeError } from "@barqjs/core";
import { insert, render } from "@barqjs/web";
import { esc, html as ssrHtml } from "@barqjs/server";
import { afterEach, describe, expect, test } from "bun:test";

import { CatchBoundary, CatchNotFound } from "./catch.ts";
import { RouterProvider } from "./components.ts";
import { notFound } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import type { ErrorProps } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";
import { createPageHandler, renderRoutes } from "./server.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const call = (component: unknown, props: Record<string, unknown>): unknown =>
  (component as (given: unknown) => unknown)(props);

function mounted(home: () => unknown): {
  state: RouterState;
  host: HTMLElement;
  dispose: () => void;
} {
  const state = createRouter({
    routeTree: [
      {
        path: "/",
        component: home,
        errorComponent: (props: ErrorProps) =>
          document.createTextNode(`route caught: ${props.error().message}`),
      },
      { path: "/other", component: () => document.createTextNode("other") },
    ] as never,
    history: memoryHistory({ initial: ["/"] }),
  });
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
  return { state, host, dispose };
}

describe("<CatchBoundary>", () => {
  test("renders its errorComponent in place of children that threw, and reports once", () => {
    const caught: string[] = [];
    const { host, dispose } = mounted(() => {
      const node = document.createElement("section");
      node.append("before ");
      insert(
        node,
        () =>
          call(CatchBoundary, {
            getResetKey: () => () => "k",
            onCatch: () => (error: Error) => caught.push(error.message),
            errorComponent: () => (props: ErrorProps) =>
              document.createTextNode(`caught: ${props.error().message}`),
            children: () => {
              throw new Error("boom");
            },
          }) as never,
      );
      return node;
    });
    // The region failed and the route around it did not.
    expect(host.textContent).toBe("before caught: boom");
    expect(caught).toEqual(["boom"]);
    dispose();
  });

  test("children that do not throw render as they are", () => {
    const { host, dispose } = mounted(() =>
      call(CatchBoundary, {
        getResetKey: () => () => "k",
        children: () => document.createTextNode("fine"),
      }),
    );
    expect(host.textContent).toBe("fine");
    dispose();
  });

  test("a change in the reset key clears the error and tries the children again", async () => {
    const [key, setKey] = createSignal(0);
    let broken = true;
    const { host, dispose } = mounted(() =>
      call(CatchBoundary, {
        getResetKey: () => key,
        errorComponent: () => () => document.createTextNode("failed"),
        children: () => {
          if (broken) throw new Error("boom");
          return document.createTextNode("recovered");
        },
      }),
    );
    expect(host.textContent).toBe("failed");
    broken = false;
    setKey(1);
    flush();
    await Promise.resolve();
    flush();
    expect(host.textContent).toBe("recovered");
    dispose();
  });

  test("the errorComponent's own `reset` does the same on demand", () => {
    let broken = true;
    let reset: (() => void) | undefined;
    const { host, dispose } = mounted(() =>
      call(CatchBoundary, {
        getResetKey: () => () => "k",
        errorComponent: () => (props: ErrorProps) => {
          reset = props.reset;
          return document.createTextNode("failed");
        },
        children: () => {
          if (broken) throw new Error("boom");
          return document.createTextNode("recovered");
        },
      }),
    );
    expect(host.textContent).toBe("failed");
    broken = false;
    reset?.();
    flush();
    expect(host.textContent).toBe("recovered");
    dispose();
  });
});

describe("<CatchNotFound>", () => {
  test("catches a notFound() thrown below it, and hands the fallback the error", () => {
    const caught: unknown[] = [];
    const { host, dispose } = mounted(() =>
      call(CatchNotFound, {
        onCatch: () => (error: Error) => caught.push(error.name),
        fallback: () => (error: () => Error) =>
          document.createTextNode(`missing: ${String((error() as { data?: unknown }).data)}`),
        children: () => {
          throw notFound({ data: "row 7" });
        },
      }),
    );
    expect(host.textContent).toBe("missing: row 7");
    expect(caught).toEqual(["NotFound"]);
    dispose();
  });

  test("lets anything else through to the boundary above", () => {
    const { host, dispose } = mounted(() =>
      call(CatchNotFound, {
        fallback: () => () => document.createTextNode("missing"),
        children: () => {
          throw new Error("a real failure");
        },
      }),
    );
    expect(host.textContent).toBe("route caught: a real failure");
    dispose();
  });
});

describe("on the string backend", () => {
  const document = ({ body, seed }: { body: string; seed: string }): string =>
    `<!doctype html><html><head><title>t</title></head><body>${body}${seed}</body></html>`;

  test("the server writes the fallback for a region that threw, and the page around it", async () => {
    const handler = createPageHandler({
      routeTree: [
        {
          path: "/",
          component: () =>
            ssrHtml(
              `<main>before ${esc(
                call(CatchBoundary, {
                  getResetKey: () => () => "k",
                  errorComponent: () => (props: ErrorProps) =>
                    ssrHtml(`<p>caught: ${esc(props.error().message)}</p>`),
                  children: () => {
                    throw markSafeError(new Error("boom"));
                  },
                }),
              )} after</main>`,
            ),
        },
      ] as never,
      stream: false,
      app: (state) => renderRoutes(state),
      document,
    });
    const response = await handler(new Request("https://example.com/"));
    const markup = await response.text();
    expect(response.status).toBe(200);
    expect(markup).toContain("<p>caught: boom</p>");
    expect(markup).toContain("before ");
    expect(markup).toContain(" after</main>");
  });
});
