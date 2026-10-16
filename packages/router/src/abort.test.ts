/**
 * An abort is not a failure.
 *
 * Two parties stop a request a route is waiting on without anything having gone
 * wrong: the router, when a newer run of the same loader or the disposal of the
 * entry makes the answer moot, and the browser, which cancels a page's fetches
 * as it unloads it. Either rejection reaches the same code a real failure does,
 * and a crash reporter or a console told about it reports a failure nobody had.
 */

import { flush, render, settle } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { RouterProvider } from "./components.ts";
import { errorFallbackFor } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import type { AnyRouteDefinition, RouteProps } from "./route.ts";
import { createRouter } from "./router.ts";

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const routes = (table: unknown[]): AnyRouteDefinition[] => table as never;

afterEach(() => {
  window.dispatchEvent(new Event("pageshow"));
  document.body.innerHTML = "";
});

function capturing<T>(body: () => T): { value: T; logged: string[] } {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    return { value: body(), logged };
  } finally {
    console.error = original;
  }
}

const abortError = (): DOMException => new DOMException("The operation was aborted.", "AbortError");

describe("an AbortError the browser raises as it unloads the page", () => {
  const chainOf = (...defs: Record<string, unknown>[]) =>
    defs.map((definition, at) => ({
      id: `/r${at}`,
      fullPath: `/r${at}`,
      definition,
    })) as never as Parameters<typeof errorFallbackFor>[0];

  test("is neither logged nor reported once the page is hidden", () => {
    const caught: unknown[] = [];
    const fallback = errorFallbackFor(
      chainOf({ onCatch: (error: Error) => caught.push(error) }),
      0,
      () => ({}),
    );
    window.dispatchEvent(new Event("pagehide"));
    const { value, logged } = capturing(() => fallback(abortError, () => {}));
    expect(value).toBeNull();
    expect(logged).toEqual([]);
    expect(caught).toEqual([]);
  });

  test("a genuine error while the page unloads is still reported", () => {
    const caught: unknown[] = [];
    const fallback = errorFallbackFor(
      chainOf({ onCatch: (error: Error) => caught.push(error) }),
      0,
      () => ({}),
    );
    window.dispatchEvent(new Event("pagehide"));
    const boom = new Error("boom");
    const { logged } = capturing(() =>
      fallback(
        () => boom,
        () => {},
      ),
    );
    expect(caught).toEqual([boom]);
    expect(logged.some((line) => line.includes('The route "/r0" threw while rendering'))).toBe(
      true,
    );
  });

  test("an AbortError on a page that is not unloading is still a failure", () => {
    const caught: unknown[] = [];
    const fallback = errorFallbackFor(
      chainOf({ onCatch: (error: Error) => caught.push(error) }),
      0,
      () => ({}),
    );
    const aborted = abortError();
    const { logged } = capturing(() =>
      fallback(
        () => aborted,
        () => {},
      ),
    );
    expect(caught).toEqual([aborted]);
    expect(logged.some((line) => line.includes("threw while rendering"))).toBe(true);
  });

  /** A page restored from the back/forward cache is shown again, so what the unload stopped is asked again. */
  test("is retried when the page is shown again", () => {
    const fallback = errorFallbackFor(chainOf({}), 0, () => ({}));
    window.dispatchEvent(new Event("pagehide"));
    let retried = 0;
    fallback(abortError, () => retried++);
    expect(retried).toBe(0);
    window.dispatchEvent(new Event("pageshow"));
    expect(retried).toBe(1);
  });
});

describe("a loader run the router aborts", () => {
  test("is not told to onError or onLoaderError, logs nothing, and the newer run is shown", async () => {
    const told: unknown[] = [];
    let runs = 0;
    const answers: (() => void)[] = [];
    let started = Promise.withResolvers<void>();
    const nextRun = async (): Promise<void> => {
      await started.promise;
      started = Promise.withResolvers<void>();
    };
    const state = createRouter({
      routeTree: routes([
        {
          path: "/",
          component: (props: RouteProps) => document.createTextNode(String(props.data())),
          onError: (error: unknown) => told.push(error),
          loader: ({ signal }: { signal: AbortSignal }) => {
            const run = ++runs;
            return new Promise((resolve, reject) => {
              answers.push(() => resolve(`run ${run}`));
              signal.addEventListener("abort", () => reject(signal.reason));
              started.resolve();
            });
          },
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
      onLoaderError: (error: unknown) => told.push(error),
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      const dispose = render(
        (() =>
          (RouterProvider as never as (p: unknown) => unknown)({
            state: () => state,
          })) as never,
        host,
      );
      flush();
      await nextRun();
      void state.invalidate();
      await nextRun();
      // The aborted run answering late must not be what is shown.
      answers[1]?.();
      answers[0]?.();
      await settle();
      flush();
      expect(host.textContent).toBe("run 2");
      dispose();
    } finally {
      console.error = original;
      state.dispose();
    }
    expect(runs).toBe(2);
    expect(told).toEqual([]);
    expect(logged).toEqual([]);
  });

  test("by disposing the router is not told either", async () => {
    const told: unknown[] = [];
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const state = createRouter({
      routeTree: routes([
        {
          path: "/",
          component: () => document.createTextNode("home"),
          onError: (error: unknown) => told.push(error),
          loader: ({ signal }: { signal: AbortSignal }) =>
            new Promise((_, reject) => {
              signal.addEventListener("abort", () => {
                reject(signal.reason);
                aborted.resolve();
              });
              started.resolve();
            }),
        },
      ]),
      history: memoryHistory({ initial: ["/"] }),
      onLoaderError: (error: unknown) => told.push(error),
    });
    void state.load();
    await started.promise;
    state.dispose();
    await aborted.promise;
    await tick();
    expect(told).toEqual([]);
  });
});
